#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue, max-len -- CLI audit. */

/**
 * Vertical-padding audit: extracts every VERTICAL padding value (padding-top /
 * -bottom / -block, and the top/bottom positions of `padding` shorthand) across
 * block CSS, maps each to the nearest --space-* token, and flags the ones that
 * are OFF the scale (the snap candidates).
 *
 * Writes audits/vpad.csv.  Usage: node scripts/vpad-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SCALE = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128];
const TOKEN = {
  4: '--space-1', 8: '--space-2', 12: '--space-3', 16: '--space-4', 20: '--space-5', 24: '--space-6', 28: '--space-7', 32: '--space-8', 40: '--space-10', 48: '--space-12', 56: '--space-14', 64: '--space-16', 72: '--space-18', 80: '--space-20', 96: '--space-24', 112: '--space-28', 128: '--space-32',
};
const nearest = (px) => SCALE.reduce((b, s) => (Math.abs(s - px) < Math.abs(b - px) ? s : b), SCALE[0]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

// Return the vertical px values from a padding declaration.
function verticalPx(prop, value) {
  const p = prop.toLowerCase();
  const toks = (value.match(/calc\([^)]*\)|var\([^)]*\)|[^\s]+/g) || []);
  const pxOf = (t) => (t && /^-?[\d.]+px$/.test(t) ? parseFloat(t) : null);
  const out = [];
  if (['padding-top', 'padding-bottom', 'padding-block-start', 'padding-block-end'].includes(p)) out.push(pxOf(toks[0]));
  else if (p === 'padding-block') { out.push(pxOf(toks[0])); if (toks[1]) out.push(pxOf(toks[1])); } else if (p === 'padding') {
    if (toks.length === 1) out.push(pxOf(toks[0]));
    else if (toks.length === 2) out.push(pxOf(toks[0]));
    else if (toks.length === 3) { out.push(pxOf(toks[0])); out.push(pxOf(toks[2])); } else if (toks.length >= 4) { out.push(pxOf(toks[0])); out.push(pxOf(toks[2])); }
  }
  return out.filter((v) => v != null && v > 0);
}

const counts = new Map(); // px -> count
for (const file of walk('blocks')) {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/gi)) {
    for (const v of verticalPx(m[1], m[2])) counts.set(v, (counts.get(v) || 0) + 1);
  }
}

const rows = [...counts.entries()].sort((a, b) => a[0] - b[0]);
const total = rows.reduce((s, [, c]) => s + c, 0);
const offScale = rows.filter(([px]) => nearest(px) !== px);

console.log(`\n${rows.length} distinct vertical padding values, ${total} declarations.\n`);
console.log('value  count  -> nearest token           (* = off-scale, snap it)');
console.log('-'.repeat(66));
for (const [px, c] of [...rows].sort((a, b) => b[1] - a[1])) {
  const n = nearest(px);
  const off = n !== px;
  console.log(`${String(`${px}px`).padStart(6)} ${String(c).padStart(5)}  -> ${String(`${n}px`).padStart(6)} ${(TOKEN[n] || '').padEnd(12)} ${off ? `* off by ${Math.abs(n - px)}` : ''}`);
}
const offCount = offScale.reduce((s, [, c]) => s + c, 0);
console.log(`\n${offScale.length} of ${rows.length} distinct values are OFF-scale (${offCount} declarations to snap).`);
console.log('off-scale values:', offScale.map(([px]) => `${px}->${nearest(px)}`).join('  '));

fs.mkdirSync('audits', { recursive: true });
fs.writeFileSync('audits/vpad.csv', `${['value,count,nearest,token,off_scale',
  ...rows.map(([px, c]) => `${px},${c},${nearest(px)},${TOKEN[nearest(px)] || ''},${nearest(px) !== px}`)].join('\n')}\n`);
console.log('Wrote audits/vpad.csv');
