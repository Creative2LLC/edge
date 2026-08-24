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

function headingClassesFor(dir, files) {
  const classes = new Set();
  for (const jf of files.filter((f) => f.endsWith('.js'))) {
    const js = fs.readFileSync(path.join(dir, jf), 'utf8');
    // const h = document.createElement('h2'); ... h.className = 'foo'
    const reCreate = /(?:const|let|var)\s+(\w+)\s*=\s*document\.createElement\(\s*['"](h[1-6])['"]\s*\)([\s\S]{0,500}?)\1\.(?:className\s*=\s*|classList\.add\()\s*[`'"]([^`'"]+)/g;
    // buildTextElement('h2', 'foo-title', ...)
    const reBuild = /\(\s*['"](h[1-6])['"]\s*,\s*['"]([a-z0-9-]+)['"]/gi;
    let m;
    while ((m = reCreate.exec(js))) m[4].trim().split(/\s+/).forEach((c) => classes.add(c));
    while ((m = reBuild.exec(js))) classes.add(m[2]);
  }
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
  process.exit(1);
}

console.log('✔ typography-guard: no heading overrides. The scale owns h1-h6.');
