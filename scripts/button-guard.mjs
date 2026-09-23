#!/usr/bin/env node

/* eslint-disable no-console -- CLI guard output. */
/* eslint-disable no-restricted-syntax, no-continue, no-cond-assign -- Sequential regex
   scan over CSS rules and JS sources; for-of + continue + exec-in-while reads clearest. */

/**
 * Button & control guard.
 *
 * Invariant: styles/styles.css is the ONLY place that paints a button or a shared control.
 * A block puts `.button` + a style class on an element (scripts/button-utils.js), or a
 * shared control class (.accordion, .tab, .view-toggle, .pagination, .carousel-dots), and
 * keeps only LAYOUT for it: position, placement, margins, width, flex and grid.
 *
 * CSS — a rule in blocks/ fails when its subject is a button or a control and it declares
 * a look property (colour, background, border, radius, shadow, outline, type, padding,
 * height, filter, transition). The subject is one when it names
 *   - `.button` or a shared control class,
 *   - a class the block's JS puts on a standard button or a control, or
 *   - a bare `button` element that is not scoped away with :not(.button).
 * JS — a block may not write inline style onto an element it made a button or a control
 * (el.style.x = …, el.style.setProperty('x', …)). Custom properties are fine unless they
 * are the standard's own (--btn-*, --button-*, --control-*, --accordion-*, --tab-*).
 *
 * Exemptions — keep in sync with the BUTTONS comment in styles/styles.css:
 *   blocks/colored-button                    the author-colour override, by design
 *   .nav-tool-accent, .nav-search-trigger    header Donate Now and Search
 *   .get-help-trigger, .get-help-close       Get Help Now
 *   .image-card-btn(-primary|-secondary)     the image-card buttons
 *   .poster-results-detail-action            the poster page's action bar (CALL 911, tip, …)
 *   .cookie-consent-button                   the cookie banner (19px so it passes as large text)
 *   resource-downloads item buttons          file-type colour via --btn-* from --rd-accent (CSS
 *                                            custom properties, so nothing here has to allow it)
 *
 * Rules that predate the guard live in scripts/button-guard-baseline.json, keyed without
 * line numbers. New ones fail. After fixing one, prune the baseline:
 *   node scripts/button-guard.mjs --update-baseline
 * List every match with its reason, baselined or not:
 *   node scripts/button-guard.mjs --list
 *
 * Usage: node scripts/button-guard.mjs   (exit 1 on violation)
 */
import fs from 'fs';
import path from 'path';

const BLOCKS = 'blocks';
const BASELINE_FILE = 'scripts/button-guard-baseline.json';
const WRITE_BASELINE = process.argv.includes('--update-baseline');
const LIST = process.argv.includes('--list');

const ALLOW_BLOCKS = new Set(['colored-button']);
const EXEMPT_CLASSES = new Set([
  'nav-tool-accent',
  'nav-search-trigger',
  'get-help-trigger',
  'get-help-close',
  'image-card-btn',
  'image-card-btn-primary',
  'image-card-btn-secondary',
  'poster-results-detail-action',
  'cookie-consent-button',
]);

const SHARED_CLASSES = new Set([
  'button',
  'accordion', 'accordion-trigger', 'accordion-label', 'accordion-icon', 'accordion-panel',
  'disclosure',
  'tab-list', 'tab', 'tab-icon',
  'view-toggle', 'view-toggle-button',
  'pagination', 'pagination-pages', 'pagination-button', 'pagination-page', 'pagination-step',
  'pagination-status', 'pagination-label', 'pagination-ellipsis',
  'carousel-dots', 'carousel-dot',
]);

// Style and state words that ride along on a button; never a block's own button class.
const RIDERS = new Set(['primary', 'secondary', 'soft', 'text-link', 'amber', 'emergency', 'giving', 'emergency-outline', 'giving-outline', 'icon', 'active', 'selected']);

const LOOK = /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-(color|width|style))?|border(-(top|bottom)-(left|right))?-radius|box-shadow|outline(-(color|offset|width|style))?|font(-(size|weight|family|style))?|letter-spacing|line-height|text-decoration(-(line|color|thickness))?|text-transform|text-shadow|padding(-(top|right|bottom|left|block|inline))?|height|min-height|filter|transition|fill|stroke)$/;
// Switching motion off (reduced-motion blocks) is not a look.
const HARMLESS = (prop, value) => prop === 'transition' && value === 'none';
const OWN_PROPS = /^--(btn|button|control|accordion|tab)-/;
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

// How far around an applyButtonStyle(el) call to look for el's class and inline styles.
// Variable names repeat inside a file (`button`, `link`), so the whole file is too far.
const WINDOW_BEFORE = 1200;
const WINDOW_AFTER = 400;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Static class tokens of a string or template literal; ${…} parts are dropped. */
const literalClasses = (literal) => literal.replace(/\$\{[^}]*\}/g, ' ')
  .split(/\s+/)
  .filter((c) => KEBAB.test(c) || SHARED_CLASSES.has(c));

/* Splits on top-level separators (not the ones inside :is(), :not(), …). */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && ch === separator) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/* The compound the rule actually paints: the part after the last top-level combinator. */
function subjectOf(selector) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(ch)) start = i + 1;
  }
  return selector.slice(start).trim();
}

/* Removes :not(…) and :has(…) — they narrow the subject, they do not name it. */
function stripNegations(compound) {
  let out = '';
  let i = 0;
  while (i < compound.length) {
    const fn = /^:(not|has)\(/.exec(compound.slice(i));
    if (!fn) {
      out += compound[i];
      i += 1;
      continue;
    }
    let depth = 0;
    let j = i + fn[0].length - 1;
    for (; j < compound.length; j += 1) {
      if (compound[j] === '(') depth += 1;
      if (compound[j] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
  return out;
}

/** Why this selector's subject is a button or control, or null. */
function subjectReason(selector, ownClasses) {
  const compound = subjectOf(selector);
  const plain = stripNegations(compound);
  const classes = (plain.match(/\.[A-Za-z0-9_-]+/g) || []).map((c) => c.slice(1));
  if (classes.some((c) => EXEMPT_CLASSES.has(c))) return null;
  const shared = classes.find((c) => SHARED_CLASSES.has(c));
  if (shared) return `.${shared} is a shared button/control class`;
  const own = classes.find((c) => ownClasses.has(c));
  if (own) return `.${own} is a button or control in this block's JS`;
  const scopedAway = /:not\(\s*\.button\s*\)/.test(compound);
  if (!scopedAway && !classes.length && /(^|[(,\s])button(?![\w-])/.test(plain)) {
    return 'a bare `button` selector also paints .button elements';
  }
  return null;
}

function parseDeclarations(body) {
  const out = [];
  for (const raw of body.split(';')) {
    const at = raw.indexOf(':');
    if (at === -1) continue;
    const prop = raw.slice(0, at).trim();
    const value = raw.slice(at + 1).trim();
    if (LOOK.test(prop) && !HARMLESS(prop, value)) out.push({ prop, value });
  }
  return out;
}

/* The class assigned to `name` nearest before `index`, plus the classList.add()s around it. */
function classesNear(js, name, index) {
  const from = Math.max(0, index - WINDOW_BEFORE);
  const slice = js.slice(from, index + WINDOW_AFTER);
  const found = [];
  const re = new RegExp(`\\b${escapeRe(name)}\\.(className\\s*=\\s*|classList\\.add\\()\\s*[\`'"]([^\`'"]+)[\`'"]`, 'g');
  let m;
  let lastAssign = [];
  while ((m = re.exec(slice))) {
    const tokens = literalClasses(m[2]);
    if (m[1].startsWith('className')) {
      if (from + m.index < index) lastAssign = tokens;
    } else {
      found.push(...tokens);
    }
  }
  return [...lastAssign, ...found];
}

/**
 * What this block's JS turns into a standard button or a shared control: the block's own
 * classes on those elements, and per file the places (variable + offset) where it does so.
 */
function jsModelFor(dir, files) {
  const classes = new Set();
  const sitesByFile = new Map();
  for (const jf of files.filter((f) => f.endsWith('.js'))) {
    const js = fs.readFileSync(path.join(dir, jf), 'utf8');
    const sites = [];
    const addAll = (tokens) => tokens.forEach((c) => classes.add(c));
    let m;

    const reApply = /applyButtonStyle\(\s*([A-Za-z_$][\w$]*)/g;
    while ((m = reApply.exec(js))) {
      if (m[1] === 'this') continue;
      sites.push({ name: m[1], index: m.index });
      addAll(classesNear(js, m[1], m.index));
    }

    const reCreate = /(?:const|let|var)\s+(\w+)\s*=\s*(?:createButton|createCarouselArrow)\(/g;
    while ((m = reCreate.exec(js))) sites.push({ name: m[1], index: m.index });

    // className: '…' handed to createCarouselArrow / createButton
    const reOption = /(?:createButton|createCarouselArrow)\([^)]*?className:\s*[`'"]([^`'"]+)[`'"]/g;
    while ((m = reOption.exec(js))) addAll(literalClasses(m[1]));

    // a class string that carries a shared control class names the block's control
    const reAssign = /\b([A-Za-z_$][\w$]*)\.className\s*=\s*[`'"]([^`'"]+)[`'"]/g;
    while ((m = reAssign.exec(js))) {
      const tokens = m[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/);
      if (!tokens.some((t) => SHARED_CLASSES.has(t))) continue;
      sites.push({ name: m[1], index: m.index });
      addAll(literalClasses(m[2]));
    }

    // scripts/pagination-controls.js builds these from the name the block passes in
    const rePagination = /createPaginationControls\(\s*['"]([\w-]+)['"]/g;
    while ((m = rePagination.exec(js))) {
      const base = m[1];
      ['', '-button', '-page', '-pages', '-ellipsis', '-label']
        .forEach((suffix) => classes.add(`${base}-pagination${suffix}`));
    }

    sitesByFile.set(jf, { js, sites });
  }
  for (const c of [...classes]) {
    if (RIDERS.has(c) || SHARED_CLASSES.has(c) || /^(is|has)-/.test(c)) classes.delete(c);
  }
  return { classes, sitesByFile };
}

const cssViolations = [];
const jsViolations = [];

function scanCss(file, raw, ownClasses) {
  // blank out comments while preserving offsets so line numbers stay accurate
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selectorList = m[1].replace(/\s+/g, ' ').trim();
    if (!selectorList || selectorList.startsWith('@')) continue;
    const declarations = parseDeclarations(m[2]);
    if (!declarations.length) continue;
    const leading = m[1].length - m[1].trimStart().length;
    const line = css.slice(0, m.index + leading).split('\n').length;
    for (const selector of splitTopLevel(selectorList, ',')) {
      const why = subjectReason(selector, ownClasses);
      if (!why) continue;
      for (const { prop, value } of declarations) {
        cssViolations.push({
          file, line, selector, prop, value, why,
        });
      }
    }
  }
}

function scanJs(file, js, sites) {
  const re = /\b([A-Za-z_$][\w$]*)\.style\.(?:setProperty\(\s*[`'"]([^`'"]+)[`'"]|(cssText)\s*=|([A-Za-z]+)\s*=(?!=))/g;
  let m;
  while ((m = re.exec(js))) {
    const at = m.index;
    const name = m[1];
    const near = sites.some((s) => s.name === name && Math.abs(at - s.index) < WINDOW_BEFORE);
    if (!near) continue;
    const prop = m[2] || m[3] || m[4];
    if (prop.startsWith('--') && !OWN_PROPS.test(prop)) continue;
    jsViolations.push({
      file, line: js.slice(0, at).split('\n').length, target: name, prop,
    });
  }
}

for (const block of fs.readdirSync(BLOCKS)) {
  if (ALLOW_BLOCKS.has(block)) continue;
  const dir = path.join(BLOCKS, block);
  let files = [];
  try { files = fs.readdirSync(dir); } catch { continue; }

  const { classes, sitesByFile } = jsModelFor(dir, files);
  for (const cf of files.filter((f) => f.endsWith('.css'))) {
    scanCss(`${dir}/${cf}`.replace(/\\/g, '/'), fs.readFileSync(path.join(dir, cf), 'utf8'), classes);
  }
  for (const [jf, { js, sites }] of sitesByFile) {
    if (sites.length) scanJs(`${dir}/${jf}`.replace(/\\/g, '/'), js, sites);
  }
}

/* Baseline is keyed WITHOUT the line number, so unrelated edits above a known
   exception do not turn it into a false failure. */
const cssKey = (v) => `css|${v.file}|${v.selector}|${v.prop}|${v.value}`;
const jsKey = (v) => `js|${v.file}|${v.target}.style.${v.prop}`;
const allKeys = [...cssViolations.map(cssKey), ...jsViolations.map(jsKey)];

if (LIST) {
  cssViolations.forEach((v) => console.log(`${v.file}:${v.line}  ${v.selector}  { ${v.prop} }  — ${v.why}`));
  jsViolations.forEach((v) => console.log(`${v.file}:${v.line}  ${v.target}.style.${v.prop}`));
  console.log(`\n${cssViolations.length} css, ${jsViolations.length} js`);
  process.exit(0);
}

if (WRITE_BASELINE) {
  const baseline = [...new Set(allKeys)].sort();
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 1)}\n`);
  console.log(`✔ button-guard: baseline written — ${baseline.length} accepted exceptions.`);
  process.exit(0);
}

let baseline = new Set();
try {
  baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')));
} catch {
  console.error(`✖ button-guard: missing ${BASELINE_FILE}. Run with --update-baseline.`);
  process.exit(1);
}

const newCss = cssViolations.filter((v) => !baseline.has(cssKey(v)));
const newJs = jsViolations.filter((v) => !baseline.has(jsKey(v)));

if (newCss.length || newJs.length) {
  if (newCss.length) {
    console.error(`\n✖ button-guard: ${newCss.length} NEW block rule(s) restyle a button or control.\n`);
    for (const v of newCss) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    ${v.selector.slice(0, 88)}`);
      console.error(`      ${v.prop}: ${v.value}   (${v.why})\n`);
    }
  }
  if (newJs.length) {
    console.error(`\n✖ button-guard: ${newJs.length} NEW inline style(s) on a button or control.\n`);
    for (const v of newJs) console.error(`  ${v.file}:${v.line}  ${v.target}.style.${v.prop}`);
    console.error('');
  }
  console.error('Buttons and controls are painted once, in styles/styles.css.');
  console.error('  - a different look? pick a style: applyButtonStyle(el, "secondary" | "soft" | …)');
  console.error('  - on a dark surface? markButtonSurface(container, true), not a colour');
  console.error('  - placement only? position, margin, width, flex and grid are allowed');
  console.error('  - a deliberate exception? add it to the exemptions here and in styles.css');
  console.error('See the BUTTONS and CONTROLS comments in styles/styles.css.\n');
  process.exit(1);
}

const present = new Set(allKeys);
const stale = [...baseline].filter((k) => !present.has(k)).length;
const pruneNote = stale ? `, ${stale} now fixed (rerun --update-baseline to prune)` : '';
console.log(`✔ button-guard: no new block restyles of buttons or controls. ${baseline.size - stale} accepted exceptions${pruneNote}.`);
