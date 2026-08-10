#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue, max-len -- CLI audit. */

/**
 * Vertical-padding BUCKET audit.
 *
 * For every block, decides whether it is a "backgrounded" section (its ROOT
 * element paints a non-transparent background — a colour band whose top/bottom
 * padding is real breathing room) or a "plain" section (transparent root — its
 * vertical space is really the section-margin rhythm and the top/bottom padding
 * is often redundant).
 *
 * Then reports each block's OUTER vertical padding (top/bottom of the root /
 * wrapper / inner) at base and at its narrowest mobile media query, split into
 * the two buckets so we can pick one standard value per bucket.
 *
 * Read-only. Usage: node scripts/vpad-buckets.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const BLOCKS = 'blocks';

function cssFor(blockDir) {
  const name = path.basename(blockDir);
  const p = path.join(blockDir, `${name}.css`);
  return fs.existsSync(p) ? p : null;
}

// Vertical (top,bottom) px from a padding declaration, or nulls if not px.
function verticalTB(prop, value) {
  const p = prop.toLowerCase();
  const toks = value.match(/calc\([^)]*\)|var\([^)]*\)|[^\s]+/g) || [];
  const px = (t) => (t && /^-?[\d.]+px$/.test(t) ? parseFloat(t) : (t ? NaN : null));
  if (p === 'padding') {
    if (toks.length === 1) return [px(toks[0]), px(toks[0])];
    if (toks.length === 2) return [px(toks[0]), px(toks[0])];
    if (toks.length >= 3) return [px(toks[0]), px(toks[2])];
  } else if (p === 'padding-top' || p === 'padding-block-start') return [px(toks[0]), null];
  else if (p === 'padding-bottom' || p === 'padding-block-end') return [null, px(toks[0])];
  else if (p === 'padding-block') {
    if (toks.length === 1) return [px(toks[0]), px(toks[0])];
    return [px(toks[0]), px(toks[1])];
  }
  return null;
}

const isMobile = (cond) => /@media/.test(cond)
  && (/max-width/.test(cond) || /width\s*<=/.test(cond) || /width\s*<[^=]/.test(cond))
  && !/min-width|width\s*>=/.test(cond);

const mobileWidth = (cond) => {
  const m = cond.match(/(?:max-width\s*:\s*|width\s*<=?\s*)(\d+)px/);
  return m ? parseInt(m[1], 10) : 9999;
};

const bgIsPaint = (v) => v && !/^(?:transparent|none|inherit|initial|unset)\b/.test(v.trim());

// Parse a file into: selector -> { baseBg, basePad:[t,b], mob:{width, pad:[t,b]} }
function analyze(css) {
  const stack = [];
  let i = 0;
  let start = 0;
  const N = css.length;
  const out = new Map();
  const rec = (sel) => {
    if (!out.has(sel)) out.set(sel, { baseBg: null, basePad: [null, null], mob: null });
    return out.get(sel);
  };
  const mergePad = (dst, tb) => {
    if (tb[0] != null) dst[0] = tb[0];
    if (tb[1] != null) dst[1] = tb[1];
  };
  while (i < N) {
    if (css[i] === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? N : e + 2; start = i; continue; }
    const c = css[i];
    if (c === '{') { stack.push(css.slice(start, i).replace(/\s+/g, ' ').trim()); i += 1; start = i; continue; }
    if (c === '}') { stack.pop(); i += 1; start = i; continue; }
    if (c === ';') {
      const decl = css.slice(start, i);
      const ci = decl.indexOf(':');
      if (ci > 0) {
        const selector = stack[stack.length - 1] || '';
        const prop = decl.slice(0, ci).trim().toLowerCase();
        const val = decl.slice(ci + 1).trim();
        const media = stack.find(isMobile);
        const r = rec(selector);
        if (prop === 'background' || prop === 'background-color') {
          if (!media && bgIsPaint(val)) r.baseBg = val;
        }
        const tb = /^padding/.test(prop) ? verticalTB(prop, val) : null;
        if (tb) {
          if (media) {
            const w = mobileWidth(media);
            if (!r.mob || w <= r.mob.width) r.mob = { width: w, pad: r.mob ? [...r.mob.pad] : [null, null] };
            mergePad(r.mob.pad, tb);
          } else {
            mergePad(r.basePad, tb);
          }
        }
      }
      i += 1; start = i; continue;
    }
    i += 1;
  }
  return out;
}

const fmt = (pad) => {
  const [t, b] = pad;
  const s = (x) => (x == null ? '·' : (Number.isNaN(x) ? 'var/clamp' : `${x}`));
  if (t == null && b == null) return '—';
  return s(t) === s(b) ? s(t) : `${s(t)}/${s(b)}`;
};

const backgrounded = [];
const plain = [];

for (const e of fs.readdirSync(BLOCKS, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const name = e.name;
  const file = cssFor(path.join(BLOCKS, name));
  if (!file) continue;
  const css = fs.readFileSync(file, 'utf8');
  const map = analyze(css);

  const rootSels = [`.${name}`, `.${name}.block`];
  const padSels = [`.${name}.block`, `.${name}`, `.${name}-wrapper`, `.${name}-inner`];

  const rootBg = rootSels.map((s) => map.get(s)?.baseBg).find(Boolean) || null;

  // Pick the element that actually carries an outer vertical padding.
  let padSel = null;
  for (const s of padSels) {
    const r = map.get(s);
    if (r && (r.basePad[0] != null || r.basePad[1] != null)) { padSel = s; break; }
  }
  const r = padSel ? map.get(padSel) : null;
  const row = {
    name,
    bg: rootBg ? (rootBg.length > 22 ? `${rootBg.slice(0, 20)}…` : rootBg) : '',
    base: r ? fmt(r.basePad) : '—',
    mob: r && r.mob ? fmt(r.mob.pad) : '—',
    on: padSel ? padSel.replace(`.${name}`, '&') : '',
  };
  (rootBg ? backgrounded : plain).push(row);
}

function table(title, rows) {
  console.log(`\n${title} (${rows.length})`);
  console.log('─'.repeat(78));
  console.log(`${'block'.padEnd(30)} ${'base T/B'.padEnd(12)} ${'mobile T/B'.padEnd(12)} on`);
  console.log('─'.repeat(78));
  for (const x of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`${x.name.padEnd(30)} ${String(x.base).padEnd(12)} ${String(x.mob).padEnd(12)} ${x.on}${x.bg ? `   bg:${x.bg}` : ''}`);
  }
}

table('BACKGROUNDED — root paints a colour band (padding = real breathing room)', backgrounded);
table('PLAIN — transparent root (vertical space ≈ section-margin rhythm)', plain);
console.log(`\n${backgrounded.length} backgrounded, ${plain.length} plain. (T/B shown as top/bottom; · = unset, & = block class)\n`);
