#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue, max-len -- CLI audit. */

/**
 * Finds negative HORIZONTAL margins (the gutter "breakout" pattern) across block
 * CSS, with selector + value + media context. Ignores vertical negatives (e.g.
 * a margin-bottom: -20px) so the list is only true breakouts.
 *
 * Writes audits/breakouts.csv.  Usage: node scripts/find-breakouts.mjs
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

function tokenize(value) {
  return value.match(/calc\([^)]*\)|var\([^)]*\)|[^\s]+/g) || [];
}
const isNeg = (t) => /^-\s*[.\d]/.test(t) || /calc\(\s*-/.test(t) || /-1\s*\*/.test(t);

// Return the negative horizontal tokens for a margin declaration (or []).
function horizontalNegatives(prop, value) {
  const p = prop.toLowerCase();
  const toks = tokenize(value);
  let horiz = [];
  if (['margin-left', 'margin-right', 'margin-inline-start', 'margin-inline-end'].includes(p)) horiz = toks;
  else if (p === 'margin-inline') horiz = toks; // [start] or [start end]
  else if (p === 'margin') {
    if (toks.length === 1) horiz = toks;
    else if (toks.length === 2) horiz = [toks[1]];
    else if (toks.length === 3) horiz = [toks[1]];
    else if (toks.length >= 4) horiz = [toks[1], toks[3]];
  } else return [];
  return horiz.filter(isNeg);
}

function parseFile(file) {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const results = [];
  const stack = [];
  let buf = '';
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (c === '{') {
      const prelude = buf.trim();
      stack.push({ media: prelude.startsWith('@media'), text: prelude.replace(/\s+/g, ' ') });
      buf = '';
    } else if (c === '}') { stack.pop(); buf = ''; } else if (c === ';') {
      const ci = buf.indexOf(':');
      if (ci > 0) {
        const prop = buf.slice(0, ci).trim();
        const value = buf.slice(ci + 1).trim();
        const negs = horizontalNegatives(prop, value);
        if (negs.length) {
          const media = stack.filter((s) => s.media).map((s) => s.text.replace('@media', '').trim()).join(' & ');
          const selector = [...stack].reverse().find((s) => !s.media)?.text || '';
          results.push({
            media, selector, prop, value, negs: negs.join(','),
          });
        }
      }
      buf = '';
    } else buf += c;
  }
  return results;
}

const files = walk('blocks');
const rows = [];
for (const file of files) {
  const block = path.basename(path.dirname(file));
  for (const r of parseFile(file)) rows.push({ block, ...r });
}

// group by block
const byBlock = new Map();
for (const r of rows) {
  if (!byBlock.has(r.block)) byBlock.set(r.block, []);
  byBlock.get(r.block).push(r);
}

console.log(`\n${rows.length} horizontal breakout declarations across ${byBlock.size} blocks:\n`);
for (const [block, list] of [...byBlock.entries()].sort()) {
  console.log(`■ ${block}`);
  for (const r of list) {
    const at = r.media ? `@${r.media}` : '(all widths)';
    console.log(`    ${r.prop}: ${r.value}   ${at}\n      ${r.selector.slice(0, 96)}`);
  }
}

// value distribution
const dist = new Map();
for (const r of rows) for (const n of r.negs.split(',')) dist.set(n, (dist.get(n) || 0) + 1);
console.log('\nvalue counts:', [...dist.entries()].sort((a, b) => b[1] - a[1]).map(([v, c]) => `${v}×${c}`).join('  '));

fs.mkdirSync('audits', { recursive: true });
const csv = ['block,property,value,media,selector',
  ...rows.map((r) => `${r.block},"${r.prop}","${r.value}","${r.media}","${r.selector.replace(/"/g, "'")}"`)].join('\n');
fs.writeFileSync('audits/breakouts.csv', `${csv}\n`);
console.log('\nWrote audits/breakouts.csv');
