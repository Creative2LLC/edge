#!/usr/bin/env node

/* eslint-disable no-console -- CLI guard output. */
/* eslint-disable no-restricted-syntax, no-continue, no-cond-assign -- Sequential
   regex scan over CSS rules; for-of + continue + exec-in-while is the clearest form. */

/**
 * Typography guard.
 *
 * Invariant: the global type scale in styles/styles.css is the ONLY place that sizes
 * headings. A block may not re-declare font-size / font-weight / letter-spacing /
 * line-height on an element that is a real <h1>-<h6>.
 *
 * This is what stops the drift documented in audits/typography-audit.md from coming
 * back one block at a time. A plain stylelint rule can't express it, because the
 * offending selectors are block-scoped classes (.faq-heading), not element selectors —
 * you only know they're headings by looking at what the block's JS puts them on.
 *
 * Escape hatches, in order of preference:
 *   1. Don't. Headings inherit; that is the point.
 *   2. Need a different size? Use .u-h1-.u-h6 / .u-display-sm / .u-display-lg.
 *   3. Genuinely need a one-off? Point at a token: font-size: var(--heading-3-size).
 *   4. Author-controlled size? Only colored-* and statistics do that (see ALLOWLIST).
 *
 * Usage: node scripts/typography-guard.mjs   (exit 1 on violation)
 */
import fs from 'fs';
import path from 'path';

const BLOCKS = 'blocks';
const PROPS = ['font-size', 'font-weight', 'letter-spacing', 'line-height'];

// Blocks whose whole purpose is letting an author override type. See the audit doc.
const ALLOWLIST = new Set([
  'colored-heading',
  'colored-text',
  'colored-button',
  'colored-list',
  'colored-icon-text',
  'statistics',
]);

// A value is fine if it defers to the scale rather than restating a number.
const isDeferred = (v) => v.startsWith('var(') || v === 'inherit' || v === 'unset' || v === 'revert';

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

/**
 * Classes this block puts on a real <h1>-<h6>.
 *
 * Deliberately argument-order agnostic. Blocks build headings inconsistently —
 * `buildTextElement('h2', 'cta-card-1-title', field)` puts the tag first while
 * `buildTextElement(field, 'h2', 'text-image-heading')` puts it second. An earlier
 * version of this guard only matched tag-first and silently missed six blocks.
 * If you add a new heading-building helper, check it is caught here.
 */
function headingClassesFor(dir, files) {
  const classes = new Set();
  for (const jf of files.filter((f) => f.endsWith('.js'))) {
    const js = fs.readFileSync(path.join(dir, jf), 'utf8');
    let m;

    // createElement('hN') ... el.className = 'foo' / el.classList.add('foo')
    const reCreate = /(?:const|let|var)\s+(\w+)\s*=\s*document\.createElement\(\s*['"](h[1-6])['"]\s*\)([\s\S]{0,600}?)\1\.(?:className\s*=\s*|classList\.add\()\s*[`'"]([^`'"]+)/g;
    while ((m = reCreate.exec(js))) m[4].trim().split(/\s+/).forEach((c) => classes.add(c));

    // createElement(headingLevel) — tag chosen at runtime
    const reVar = /(?:const|let|var)\s+(\w+)\s*=\s*document\.createElement\(\s*([A-Za-z_$][\w$]*)\s*\)([\s\S]{0,600}?)\1\.(?:className\s*=\s*|classList\.add\()\s*[`'"]([^`'"]+)/g;
    while ((m = reVar.exec(js))) {
      if (!/level|tag|heading/i.test(m[2])) continue;
      m[4].trim().split(/\s+/).forEach((c) => classes.add(c));
    }

    // any helper call carrying an 'hN' literal — every kebab-case literal in the
    // same call is a candidate class, whatever the parameter order
    const reCall = /\b[A-Za-z_$][\w$]*\s*\(([^()]{0,300})\)/g;
    while ((m = reCall.exec(js))) {
      if (!/['"]h[1-6]['"]/.test(m[1])) continue;
      (m[1].match(/['"]([^'"]+)['"]/g) || [])
        .map((l) => l.slice(1, -1))
        .filter((l) => KEBAB.test(l))
        .forEach((c) => classes.add(c));
    }

    // template-literal markup: <h2 class="foo">
    const reMarkup = /<h[1-6][^>]*\sclass=["']([^"']+)["']/gi;
    while ((m = reMarkup.exec(js))) m[1].split(/\s+/).forEach((c) => classes.add(c));
  }
  classes.delete('');
  return classes;
}

const violations = [];

for (const block of fs.readdirSync(BLOCKS)) {
  if (ALLOWLIST.has(block)) continue;
  const dir = path.join(BLOCKS, block);
  let files = [];
  try { files = fs.readdirSync(dir); } catch { continue; }

  const classes = headingClassesFor(dir, files);

  for (const cf of files.filter((f) => f.endsWith('.css'))) {
    const raw = fs.readFileSync(path.join(dir, cf), 'utf8');
    // blank out comments while preserving offsets so line numbers stay accurate
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const sel = m[1].replace(/\s+/g, ' ').replace(/^[^}]*}/, '').trim();
      if (!sel || sel.startsWith('@')) continue;

      const namesHeadingEl = /(^|[\s,>+~(])h[1-6](\b|[\s,>+~:.[])/.test(sel);
      const namesHeadingCls = [...classes].some((c) => sel.includes(`.${c}`));
      if (!namesHeadingEl && !namesHeadingCls) continue;

      for (const prop of PROPS) {
        const d = new RegExp(`(?:^|[;{])\\s*${prop}\\s*:\\s*([^;]+)`).exec(m[2]);
        if (!d) continue;
        const value = d[1].trim();
        if (isDeferred(value)) continue;
        const line = css.slice(0, m.index).split('\n').length;
        violations.push({
          file: `${dir}/${cf}`, line, sel, prop, value,
        });
      }
    }
  }
}

/* ==========================================================================
   BODY COPY
   Same invariant, second half of the contract: styles/styles.css is the only
   place that sizes, weights, leads or tracks a paragraph.

   Body copy differs from headings in one way that matters. A heading can just
   have its declaration deleted, because the global `h2 {}` rule then gives the
   right answer. A paragraph cannot always: `<p>` carries no information about
   whether it is prose, a deck or a caption, so a deliberate non-default step
   has to say so by pointing at a token. Both are accepted here; a hardcoded
   number is not.

   Known pre-existing exceptions live in the baseline file. They are the
   declarations the migration deliberately left for a human (off-scale sizes,
   display weights, bespoke tracking). New ones are failures.
   See audits/body-copy-audit.md.
   ========================================================================== */

const BASELINE_FILE = 'scripts/typography-guard-baseline.json';
const WRITE_BASELINE = process.argv.includes('--update-baseline');

const BODYISH = /(^|-)(body|description|desc|text|copy|content|paragraph|para|subhead|subheading|subtitle|intro|lede|lead|summary|excerpt|blurb|answer|bio|message|detail|details|info|quote|testimonial|disclaimer|caption|note|meta|byline|date|category|label|eyebrow|kicker)(-|$)/;
const HEADINGISH = /(^|-)(heading|title|headline)(-|$)/;

function isBodySelector(sel) {
  if (/(^|[\s,>+~(])(a|button|input|select|textarea)(\b|[\s,>+~:.[])/.test(sel)) return false;
  if (/(^|[\s,>+~(])h[1-6](\b|[\s,>+~:.[])/.test(sel)) return false;
  const tokens = (sel.match(/\.[a-zA-Z0-9_-]+/g) || []).map((c) => c.slice(1));
  if (tokens.some((c) => HEADINGISH.test(c))) return false;
  if (/(^|[\s,>+~(])p(\b|[\s,>+~:.[])/.test(sel)) return true;
  return tokens.some((c) => BODYISH.test(c));
}

const bodyViolations = [];

for (const block of fs.readdirSync(BLOCKS)) {
  if (ALLOWLIST.has(block) || block === 'cards') continue;
  const dir = path.join(BLOCKS, block);
  let files = [];
  try { files = fs.readdirSync(dir); } catch { continue; }

  for (const cf of files.filter((f) => f.endsWith('.css'))) {
    const raw = fs.readFileSync(path.join(dir, cf), 'utf8');
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const sel = m[1].replace(/\s+/g, ' ').replace(/^[^}]*}/, '').trim();
      if (!sel || sel.startsWith('@')) continue;
      if (!isBodySelector(sel)) continue;

      for (const prop of PROPS) {
        const d = new RegExp(`(?:^|[;{])\\s*${prop}\\s*:\\s*([^;]+)`).exec(m[2]);
        if (!d) continue;
        const value = d[1].trim();
        if (isDeferred(value)) continue;
        bodyViolations.push({
          file: `${dir}/${cf}`.replace(/\\/g, '/'),
          line: css.slice(0, m.index).split('\n').length,
          sel,
          prop,
          value,
        });
      }
    }
  }
}

/* Baseline is keyed WITHOUT the line number, so unrelated edits above a known
   exception do not turn it into a false failure. */
const keyOf = (v) => `${v.file}|${v.sel}|${v.prop}|${v.value}`;

if (WRITE_BASELINE) {
  const baseline = bodyViolations.map(keyOf).sort();
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 1)}\n`);
  console.log(`✔ typography-guard: baseline written — ${baseline.length} accepted body exceptions.`);
  process.exit(0);
}

let baseline = new Set();
try {
  baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')));
} catch {
  console.error(`✖ typography-guard: missing ${BASELINE_FILE}. Run with --update-baseline.`);
  process.exit(1);
}

const newBody = bodyViolations.filter((v) => !baseline.has(keyOf(v)));

if (violations.length || newBody.length) {
  if (violations.length) {
    console.error(`\n✖ typography-guard: ${violations.length} heading override(s) found.\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    ${v.sel.slice(0, 88)}`);
      console.error(`      ${v.prop}: ${v.value}\n`);
    }
    console.error('Headings are sized once, in styles/styles.css. Use .u-h1-.u-h6 /');
    console.error('.u-display-sm / .u-display-lg, or reference a --heading-*-size token.');
    console.error('See audits/typography-audit.md.\n');
  }
  if (newBody.length) {
    console.error(`\n✖ typography-guard: ${newBody.length} NEW body-copy override(s) found.\n`);
    for (const v of newBody) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    ${v.sel.slice(0, 88)}`);
      console.error(`      ${v.prop}: ${v.value}\n`);
    }
    console.error('Body copy is sized once, in styles/styles.css.');
    console.error('  - default step? delete the declaration and let it inherit');
    console.error('  - deliberate step? use .u-deck / .u-body-lg / .u-body / .u-body-sm /');
    console.error('    .u-caption, or reference --deck-size / --body-*-size / --caption-size');
    console.error('  - genuinely a one-off? add it deliberately:');
    console.error('      node scripts/typography-guard.mjs --update-baseline');
    console.error('See audits/body-copy-audit.md.\n');
  }
  process.exit(1);
}

const stale = [...baseline].filter((k) => !bodyViolations.some((v) => keyOf(v) === k)).length;
console.log('✔ typography-guard: no heading overrides. The scale owns h1-h6.');
console.log(`✔ typography-guard: no new body overrides. ${baseline.size - stale} accepted exceptions${stale ? `, ${stale} now fixed (rerun --update-baseline to prune)` : ''}.`);
