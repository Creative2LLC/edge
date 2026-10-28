#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue, max-len -- CLI audit. */

/**
 * Tablet-gutter audit.
 *
 * Finds full-bleed "breakout" blocks that re-constrain their content with
 * `max-width: var(--container)` but set ZERO horizontal padding on the BASE
 * rule (adding the gutter only inside a mobile media query, if at all).
 *
 * Those blocks have a dead band: from the mobile breakpoint up to the 1420px
 * container cap the content runs edge-to-edge on tablet/small-desktop. Above
 * the cap the max-width + margin:auto hides the problem, so it only *looks*
 * broken on tablet.
 *
 * Read-only. Usage: node scripts/tablet-gutter-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

// Full-bleed breakout signatures anywhere in the file.
function isFullBleed(css) {
  return /main\s*>\s*\.section\s*>\s*\.[\w-]+-wrapper\s*\{[^}]*(padding\s*:\s*0|padding-inline\s*:\s*0|max-width\s*:\s*none)/s.test(css)
    || /width\s*:\s*100vw/.test(css)
    || /margin-inline\s*:\s*calc\(\s*50%/.test(css)
    || /transform\s*:\s*translateX\(-50%\)/.test(css);
}

// Horizontal padding from a `padding` shorthand's token list, or null if unknown.
function horizontalOf(prop, value) {
  const p = prop.toLowerCase();
  const toks = value.match(/calc\([^)]*\)|var\([^)]*\)|[^\s]+/g) || [];
  if (p === 'padding') {
    if (toks.length === 1) return toks[0];
    return toks[1]; // 2/3/4-value: second token is the horizontal (left/right)
  }
  if (p === 'padding-inline') return toks[0];
  if (p === 'padding-left' || p === 'padding-right' || p === 'padding-inline-start' || p === 'padding-inline-end') return toks[0];
  return null;
}

const isZero = (v) => v != null && /^0(px|rem|em|%)?$/.test(v);

// Walk declarations, tracking @media nesting. Return the base (non-media)
// horizontal padding for every selector that also sets max-width:var(--container).
function analyze(css) {
  const stack = [];
  let i = 0;
  let start = 0;
  const N = css.length;
  // selector -> { hasContainer, horiz (last base horizontal padding seen) }
  const sel = new Map();
  while (i < N) {
    if (css[i] === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? N : e + 2; start = i; continue; }
    const c = css[i];
    if (c === '{') { stack.push(css.slice(start, i).replace(/\s+/g, ' ').trim()); i += 1; start = i; continue; }
    if (c === '}') { stack.pop(); i += 1; start = i; continue; }
    if (c === ';') {
      const decl = css.slice(start, i);
      const ci = decl.indexOf(':');
      const inMedia = stack.some((s) => /@media/.test(s));
      if (ci > 0 && !inMedia) {
        const selector = stack[stack.length - 1] || '';
        const prop = decl.slice(0, ci).trim().toLowerCase();
        const val = decl.slice(ci + 1).trim();
        const rec = sel.get(selector) || { hasContainer: false, horiz: undefined };
        if (prop === 'max-width' && /var\(--container\)/.test(val)) rec.hasContainer = true;
        const h = horizontalOf(prop, val);
        if (h != null) rec.horiz = h;
        sel.set(selector, rec);
      }
      i += 1; start = i; continue;
    }
    i += 1;
  }
  return sel;
}

const flagged = [];
for (const file of walk('blocks')) {
  const css = fs.readFileSync(file, 'utf8');
  if (!isFullBleed(css)) continue;
  const sel = analyze(css);
  for (const [selector, rec] of sel) {
    if (!rec.hasContainer) continue;
    // Vulnerable if the constrained element has NO base horizontal padding, or it's zero.
    if (rec.horiz === undefined || isZero(rec.horiz)) {
      flagged.push({ file: path.relative('.', file), selector, horiz: rec.horiz === undefined ? '(none)' : rec.horiz });
    }
  }
}

if (flagged.length === 0) {
  console.log('\nNo tablet-gutter dead-band blocks found. All full-bleed blocks carry a base horizontal gutter.\n');
} else {
  console.log(`\n${flagged.length} constrained element(s) with NO base horizontal gutter (tablet dead-band):\n`);
  for (const f of flagged) {
    console.log(`  ${f.file}`);
    console.log(`      ${f.selector}   base horizontal padding: ${f.horiz}`);
  }
  console.log('\nFix idiom: max-width: calc(var(--container) + 2 * var(--gutter)); padding-inline: var(--gutter); box-sizing: border-box;');
  console.log('(keeps desktop content at exactly the container width, adds gutter on tablet/mobile)\n');
}
