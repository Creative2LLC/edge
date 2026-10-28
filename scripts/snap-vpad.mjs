#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue, max-len -- CLI tool. */

/**
 * Snaps oddball VERTICAL padding values (non-multiples of 4, >= 20px) to the
 * nearest 4px step - but ONLY inside mobile/tablet media queries (width <= N /
 * max-width). Base and desktop (min-width / width >=) rules are left untouched.
 * Horizontal values in a shorthand are preserved.
 *
 * Dry-run by default; pass --apply to write.
 *   node scripts/snap-vpad.mjs          (preview)
 *   node scripts/snap-vpad.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const snap = (px) => (px >= 20 && px % 4 !== 0 ? Math.round(px / 4) * 4 : null);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

// Return a new value string with vertical positions snapped, or null if none change.
function rewriteVertical(prop, value) {
  const p = prop.toLowerCase();
  const toks = value.match(/calc\([^)]*\)|var\([^)]*\)|[^\s]+/g) || [];
  let vIdx = [];
  if (['padding-top', 'padding-bottom', 'padding-block-start', 'padding-block-end'].includes(p)) vIdx = [0];
  else if (p === 'padding-block') vIdx = toks.length > 1 ? [0, 1] : [0];
  else if (p === 'padding') {
    if (toks.length <= 2) vIdx = [0];
    else vIdx = [0, 2];
  } else return null;
  const nt = [...toks];
  let changed = false;
  for (const i of vIdx) {
    const m = /^(-?[\d.]+)px$/.exec(toks[i] || '');
    if (!m) continue;
    const s = snap(parseFloat(m[1]));
    if (s != null) { nt[i] = `${s}px`; changed = true; }
  }
  return changed ? nt.join(' ') : null;
}

function isMobileMedia(cond) {
  return /@media/.test(cond) && (/max-width/.test(cond) || /width\s*<=/.test(cond) || /width\s*<[^=]/.test(cond)) && !/min-width|width\s*>=/.test(cond);
}

function collect(css) {
  const stack = [];
  const edits = [];
  let i = 0;
  let start = 0;
  const N = css.length;
  while (i < N) {
    if (css[i] === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? N : e + 2; start = i; continue; }
    const c = css[i];
    if (c === '{') { stack.push(css.slice(start, i).replace(/\s+/g, ' ').trim()); i += 1; start = i; continue; }
    if (c === '}') { stack.pop(); i += 1; start = i; continue; }
    if (c === ';') {
      const decl = css.slice(start, i);
      const ci = decl.indexOf(':');
      if (ci > 0 && stack.some(isMobileMedia)) {
        const prop = decl.slice(0, ci).trim();
        const raw = decl.slice(ci + 1);
        const val = raw.trim();
        const nv = rewriteVertical(prop, val);
        if (nv && nv !== val) {
          const off = raw.indexOf(val);
          edits.push({
            start: start + ci + 1 + off, end: start + ci + 1 + off + val.length, newText: nv, old: `${prop}: ${val}`, nv,
          });
        }
      }
      i += 1; start = i; continue;
    }
    i += 1;
  }
  return edits;
}

let total = 0;
for (const file of walk('blocks')) {
  const css = fs.readFileSync(file, 'utf8');
  const edits = collect(css);
  if (edits.length === 0) continue;
  total += edits.length;
  console.log(`\n${path.relative('.', file)}`);
  for (const e of edits) console.log(`    ${e.old}  ->  ${e.old.split(':')[0]}: ${e.nv}`);
  if (APPLY) {
    let out = css;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.newText + out.slice(e.end);
    fs.writeFileSync(file, out);
  }
}
console.log(`\n${total} declarations ${APPLY ? 'CHANGED' : 'would change'} (mobile/tablet only). ${APPLY ? '' : 'Run with --apply to write.'}`);
