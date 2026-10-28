#!/usr/bin/env node

/* eslint-disable no-console -- CLI guard output. */
/* eslint-disable no-restricted-syntax -- Nested walk over models and fields. */

/**
 * Palette guard.
 *
 * Invariant: every colour a block model offers comes from scripts/color-tokens.js.
 *   - A select that offers a hex may offer only palette hexes (and '' or 'transparent').
 *     Background and card-background selects may also offer SITE_NEUTRALS, and one that
 *     offers Gray Lightest must offer the LIGHT_SURFACES. The section Background Color offers
 *     exactly SECTION_BACKGROUNDS.
 *   - Every pair of steps in a SURFACE_LADDER stays at least MIN_STEP apart (CIE76 ΔE), so a
 *     card, its section and the page can never be tuned into the same colour.
 *   - A text-colour select may offer only TEXT_COLORS, the swatches that pass WCAG AA as
 *     body text. A field counts as text when its name reads as text (text, title, heading,
 *     label, number, …) and not as a surface (background, bg, fill, surface).
 *   - A select's default value is one of its options.
 *   - styles/styles.css declares a --ncmec-* token for every swatch, with the same hex.
 *   - A hex colour in blocks/ or styles/ CSS is a palette colour (prefer var(--ncmec-*)).
 *     Off-palette colours that predate this rule live in scripts/palette-guard-baseline.json,
 *     keyed without line numbers; new ones fail. Most are hover shades, dark navies and
 *     gradient stops that need a design decision, not a mechanical swap.
 *
 * Old values on published pages are remapped at runtime (remapLegacyColors), so a model
 * never needs to keep offering a retired colour.
 *
 * Usage: node scripts/palette-guard.mjs   (exit 1 on violation)
 * After removing off-palette CSS colours, prune the baseline:
 *   node scripts/palette-guard.mjs --update-baseline
 */
import fs from 'fs';
import path from 'path';

const TOKENS_FILE = 'scripts/color-tokens.js';
const STYLES_FILE = 'styles/styles.css';
const BASELINE_FILE = 'scripts/palette-guard-baseline.json';
const WRITE_BASELINE = process.argv.includes('--update-baseline');

// Loaded as a data URL: package.json declares no module type, and importing the browser
// module by path makes Node print a reparse warning on every run.
const tokenSource = fs.readFileSync(TOKENS_FILE, 'utf8');
const {
  PALETTE, SITE_NEUTRALS, LIGHT_SURFACES, SURFACE_LADDER, TEXT_COLORS, SECTION_BACKGROUNDS,
} = await import(`data:text/javascript;base64,${Buffer.from(tokenSource).toString('base64')}`);

const HEX_RE = /^#[0-9a-f]{3,8}$/i;
// The section Background Color must offer exactly SECTION_BACKGROUNDS.
const SECTION_BACKGROUND_FIELD = 'models/_section.json › section.backgroundColor';
const PALETTE_HEXES = new Set(PALETTE.map((swatch) => swatch.hex));
const NEUTRAL_HEXES = new Set(SITE_NEUTRALS.map((swatch) => swatch.hex));
const TEXT_HEXES = new Set(TEXT_COLORS);
const GRAY_LIGHTEST = PALETTE.find((swatch) => swatch.name === 'Gray Lightest').hex;

// Neighbouring surface steps closer than this read as one colour on the page.
const MIN_STEP = 2.5;

// A background or card-background select (not a chart fill).
const isSurfaceField = (name) => /background|bg|surface/i.test(name) && !/fill/i.test(name);

function normalizeHex(value) {
  let hex = String(value).trim().toUpperCase();
  if (/^#[0-9A-F]{3,4}$/.test(hex)) hex = `#${[...hex.slice(1)].map((c) => c + c).join('')}`;
  return hex;
}

function isTextField(name) {
  if (/background|bg|fill|surface/i.test(name)) return false;
  return /text|title|heading|body|number|label|value|description|subtitle|display/i.test(name);
}

function modelFiles() {
  const files = [];
  for (const block of fs.readdirSync('blocks')) {
    const dir = path.join('blocks', block);
    if (fs.statSync(dir).isDirectory()) {
      fs.readdirSync(dir).filter((f) => /^_.*\.json$/.test(f)).forEach((f) => files.push(path.join(dir, f)));
    }
  }
  fs.readdirSync('models').filter((f) => /^_.*\.json$/.test(f)).forEach((f) => files.push(path.join('models', f)));
  return files;
}

const violations = [];
let checked = 0;

for (const file of modelFiles()) {
  const { models = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const model of models) {
    for (const field of model.fields || []) {
      const options = field.component === 'select' && Array.isArray(field.options) ? field.options : [];
      const hexes = options.map((o) => o.value).filter((v) => HEX_RE.test(String(v)));
      if (hexes.length) {
        checked += 1;
        const where = `${file.split(path.sep).join('/')} › ${model.id}.${field.name}`;
        if (where === SECTION_BACKGROUND_FIELD) {
          const want = ['', ...SECTION_BACKGROUNDS.map((swatch) => swatch.hex)].join();
          const got = options
            .map((o) => (HEX_RE.test(String(o.value)) ? normalizeHex(o.value) : o.value))
            .join();
          if (got !== want) {
            violations.push(`${where}: options must be exactly '' plus SECTION_BACKGROUNDS, in order`);
          }
        } else {
          const surface = isSurfaceField(field.name);
          const allowed = (hex) => PALETTE_HEXES.has(hex) || (surface && NEUTRAL_HEXES.has(hex));
          const offPalette = hexes.filter((v) => !allowed(normalizeHex(v)));
          if (offPalette.length) violations.push(`${where}: not in the palette: ${offPalette.join(', ')}`);
          const offered = new Set(hexes.map(normalizeHex));
          if (surface && offered.has(GRAY_LIGHTEST)) {
            const missing = LIGHT_SURFACES.filter((w) => !offered.has(w.hex)).map((w) => w.name);
            if (missing.length) violations.push(`${where}: background select is missing ${missing.join(', ')}`);
          }
        }

        if (isTextField(field.name)) {
          const unreadable = hexes
            .map(normalizeHex)
            .filter((hex) => PALETTE_HEXES.has(hex) && !TEXT_HEXES.has(hex));
          if (unreadable.length) violations.push(`${where}: text field offers a background-only colour: ${unreadable.join(', ')}`);
        }

        const extras = options.map((o) => o.value).filter((v) => v !== '' && v !== 'transparent' && !HEX_RE.test(String(v)));
        if (extras.length) violations.push(`${where}: mixes non-colour values into a colour list: ${extras.join(', ')}`);

        if (field.value !== undefined && !options.some((o) => o.value === field.value)) {
          violations.push(`${where}: default ${JSON.stringify(field.value)} is not one of its options`);
        }
      }
    }
  }
}

function cssFiles() {
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.css')) files.push(p.split(path.sep).join('/'));
  });
  walk('blocks');
  walk('styles');
  return files;
}

// Innermost `selector { declarations }` blocks, the same scan button-guard uses.
const offPalette = [];
for (const file of cssFiles()) {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].replace(/\s+/g, ' ').trim();
    if (selector && !selector.startsWith('@')) {
      rule[2].split(';').forEach((declaration) => {
        const at = declaration.indexOf(':');
        if (at === -1) return;
        const prop = declaration.slice(0, at).trim();
        // The --ncmec-* definitions are checked against color-tokens.js below.
        if (prop.startsWith('--ncmec-')) return;
        const value = declaration.slice(at + 1).replace(/url\([^)]*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '');
        (value.match(/#[0-9a-f]{3,8}\b/gi) || []).forEach((raw) => {
          const hex = normalizeHex(raw);
          if (PALETTE_HEXES.has(hex.slice(0, 7))) return;
          offPalette.push({
            key: `${file}|${selector}|${prop}|${hex}`,
            file,
            index: rule.index + rule[1].length - rule[1].trimStart().length,
            css,
            text: `${selector.slice(0, 80)} { ${prop}: ${raw} }`,
          });
        });
      });
    }
  }
}

const currentKeys = [...new Set(offPalette.map((v) => v.key))].sort();
if (WRITE_BASELINE) fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(currentKeys, null, 1)}\n`);
const baseline = new Set(fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : []);
const newOffPalette = offPalette.filter((v) => !baseline.has(v.key));
newOffPalette.forEach((v) => {
  const line = v.css.slice(0, v.index).split('\n').length;
  violations.push(`${v.file}:${line}: off-palette CSS colour: ${v.text}`);
});
const present = new Set(currentKeys);
const nowFixed = [...baseline].filter((k) => !present.has(k)).length;

// CIE76 ΔE, the same measure the audits use.
const lab = (hex) => {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
Object.entries(SURFACE_LADDER).forEach(([ladder, steps]) => {
  steps.forEach((a, i) => steps.slice(i + 1).forEach((b) => {
    const d = deltaE(a.hex, b.hex);
    if (d < MIN_STEP) violations.push(`SURFACE_LADDER.${ladder}: ${a.name} and ${b.name} are only ${d.toFixed(1)} apart (minimum ${MIN_STEP})`);
  }));
});

const styles = fs.readFileSync(STYLES_FILE, 'utf8');
for (const swatch of [...PALETTE, ...SITE_NEUTRALS]) {
  const token = `--ncmec-${swatch.name.toLowerCase().replace(/\s+/g, '-')}`;
  const match = styles.match(new RegExp(`${token}:\\s*(#[0-9a-f]{3,8})\\s*;`, 'i'));
  if (!match) violations.push(`${STYLES_FILE}: missing ${token}`);
  else if (normalizeHex(match[1]) !== swatch.hex) violations.push(`${STYLES_FILE}: ${token} is ${match[1]}, palette says ${swatch.hex}`);
}

if (violations.length) {
  console.error(`\n✖ palette-guard: ${violations.length} violation(s).\n`);
  violations.forEach((v) => console.error(`  ${v}`));
  console.error('\nColours come from scripts/color-tokens.js. Offer PALETTE on surfaces, icons and');
  console.error('charts, TEXT_COLORS on text. A retired colour on a published page is remapped at');
  console.error('runtime, so there is no need to keep offering it. In CSS, use var(--ncmec-*).\n');
  process.exit(1);
}

const pruneNote = nowFixed ? `, ${nowFixed} now fixed (rerun --update-baseline to prune)` : '';
console.log(`✔ palette-guard: ${checked} colour dropdowns use the ${PALETTE.length}-swatch palette; --ncmec-* tokens match.`);
console.log(`✔ palette-guard: no new off-palette CSS colours. ${baseline.size - nowFixed} accepted exceptions${pruneNote}.`);
