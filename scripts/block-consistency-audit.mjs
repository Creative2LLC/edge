#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */
/* eslint-disable no-continue, max-len, no-cond-assign -- CLI control flow; exec-in-while is the clearest scan form. */

/**
 * Two audits, one browser pass.
 *
 * A. SIDE PADDING vs THE UNIVERSAL COLUMN
 *    `main > .section > div` is max-width 1420 with `padding: 0 var(--section-pad)`,
 *    so every block's content should begin on the same 1356px column at desktop.
 *    A block that adds its own horizontal padding on top of that sits inset from
 *    everything around it; one that breaks out sits proud of it. Vertical padding
 *    is ignored on purpose — only the side alignment throws the page off balance.
 *
 *    Measured, not parsed: the walk follows the single-child wrapper chain in
 *    from .block (blocks put their padding on .block, on an -inner, or on both)
 *    and stops where content branches, so it reports the real content edge
 *    regardless of which element carries the padding.
 *
 * B. HOVER STATES OUTSIDE BUTTONS AND LINKS
 *    Static pass over blocks/<name>/<name>.css collecting every :hover rule that
 *    is NOT a button or a link, plus what each one animates and how long it
 *    takes. The point is the spread: how many different lift distances, shadows
 *    and durations are in play for what is conceptually one interaction.
 *
 *    Also lists CONTENDERS — blocks with card-shaped, repeated, clickable
 *    content and no hover treatment at all.
 *
 * Usage:
 *   node scripts/block-consistency-audit.mjs
 *   node scripts/block-consistency-audit.mjs --width 1600 --json audits/out.json
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const BASE = 'https://test--edge--creative2llc.aem.live';
const URLS_FILE = 'audits/page-list.txt';
const BLOCKS_DIR = 'blocks';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const WIDTH = Number(arg('width', 1600));
const JSON_OUT = arg('json', '');
const LIMIT = Number(arg('limit', 0));

/* ------------------------------------------------------------------ *
 * B — static hover analysis                                           *
 * ------------------------------------------------------------------ */

/** A selector that is really about a button or a link, not a card. */
function isButtonOrLinkSelector(sel) {
  // Test only the compound the :hover attaches to, so
  // `.cards-card:hover .cards-card-link` still counts as a CARD hover.
  const hoverPart = sel.split(':hover')[0];
  const last = hoverPart.split(/[\s>+~]+/).filter(Boolean).pop() || '';
  return /(^|[.\-_])(a|button|btn|link|cta)([.\-_]|$)/i.test(last)
    || /^a$/i.test(last)
    || /^button$/i.test(last)
    || last.includes('[href')
    || /(btn|button|link|-cta|cta-)/i.test(last);
}

const HOVER_PROPS = [
  'transform', 'box-shadow', 'background', 'background-color', 'border-color',
  'color', 'opacity', 'filter', 'outline', 'border', 'scale', 'translate',
];

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Very small rule splitter: good enough for these hand-written stylesheets. */
function eachRule(css, fn) {
  const clean = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    fn(selector, m[2]);
  }
}

function collectHoverRules() {
  const out = [];
  const transitions = new Map(); // selector -> transition value
  const blocks = fs.readdirSync(BLOCKS_DIR).filter((d) => fs.existsSync(path.join(BLOCKS_DIR, d, `${d}.css`)));

  for (const block of blocks) {
    const css = fs.readFileSync(path.join(BLOCKS_DIR, block, `${block}.css`), 'utf8');

    eachRule(css, (selector, body) => {
      if (/transition\s*:/.test(body)) {
        selector.split(',').map((s) => s.trim()).forEach((s) => {
          const v = (body.match(/transition\s*:\s*([^;]+)/) || [])[1];
          if (v) transitions.set(`${block}|${s}`, v.trim());
        });
      }
      if (!selector.includes(':hover')) return;

      selector.split(',').map((s) => s.trim()).filter(Boolean).forEach((sel) => {
        if (!sel.includes(':hover')) return;
        if (isButtonOrLinkSelector(sel)) return;

        const props = {};
        HOVER_PROPS.forEach((p) => {
          const re = new RegExp(`(?:^|;)\\s*${p}\\s*:\\s*([^;]+)`, 'i');
          const mm = body.match(re);
          if (mm) props[p] = mm[1].trim().replace(/\s+/g, ' ');
        });
        if (!Object.keys(props).length) return;

        out.push({ block, selector: sel, props });
      });
    });
  }
  return { hovers: out, transitions };
}

/* ------------------------------------------------------------------ *
 * A — in-page measurement                                             *
 * ------------------------------------------------------------------ */

const MEASURE = `(() => {
  // The CANONICAL column, derived from the tokens rather than from whichever
  // wrapper happens to be first: a full-bleed section overrides max-width, so
  // measuring per-wrapper would compare a block against itself.
  const rootCS = getComputedStyle(document.documentElement);
  const container = parseFloat(rootCS.getPropertyValue('--container')) || 1420;
  const pad = parseFloat(rootCS.getPropertyValue('--section-pad')) || 32;
  const vw = document.documentElement.clientWidth;
  const outer = Math.min(container, vw);
  const colLeft = (vw - outer) / 2 + pad;
  const colRight = colLeft + (outer - 2 * pad);

  // A node that paints something is a VISUAL edge: a card that pads its own text
  // is doing normal card design, and only its box needs to sit on the column.
  // Without this test every padded card reads as a misalignment.
  const paints = (cs) => {
    const bg = cs.backgroundColor;
    const opaque = bg && bg !== 'transparent' && !/rgba(0,s*0,s*0,s*0)/.test(bg);
    return Boolean(opaque)
      || (cs.backgroundImage && cs.backgroundImage !== 'none')
      || (cs.boxShadow && cs.boxShadow !== 'none')
      || parseFloat(cs.borderTopWidth) > 0
      || parseFloat(cs.borderLeftWidth) > 0;
  };

  const out = [];
  document.querySelectorAll('main > .section').forEach((section) => {
    [...section.children].forEach((wrapper) => {
      if (!(wrapper instanceof HTMLElement)) return;
      const block = wrapper.querySelector(':scope > .block');
      if (!block) return;
      const name = block.dataset.blockName
        || [...block.classList].find((c) => c !== 'block') || 'unknown';

      const blockRect = block.getBoundingClientRect();
      if (blockRect.width < 50 || blockRect.height < 10) return;

      // Walk in through single-child wrappers. Stop at the first painted
      // surface (that becomes the visual edge) or where content branches.
      let node = block;
      let visual = null;
      let guard = 0;
      while (node && guard < 6) {
        const cs = getComputedStyle(node);
        if (paints(cs)) { visual = node; break; }
        if (cs.position === 'absolute' || cs.position === 'fixed') break;
        const kids = [...node.children].filter((c) => c instanceof HTMLElement
          && getComputedStyle(c).display !== 'none');
        if (kids.length !== 1) break;
        node = kids[0];
        guard += 1;
      }

      const edgeEl = visual || node;
      const edgeRect = edgeEl.getBoundingClientRect();
      const edgeCS = getComputedStyle(edgeEl);
      // For a painted surface the BOX is the edge; otherwise the content is.
      const edgeLeft = visual ? edgeRect.left : edgeRect.left + parseFloat(edgeCS.paddingLeft || 0);
      const edgeRight = visual ? edgeRect.right : edgeRect.right - parseFloat(edgeCS.paddingRight || 0);
      if (edgeRight - edgeLeft < 50) return;

      out.push({
        name,
        colWidth: Math.round(colRight - colLeft),
        surface: Boolean(visual),
        // > 0 means the block's visual edge starts INSIDE the column.
        insetLeft: Math.round(edgeLeft - colLeft),
        insetRight: Math.round(colRight - edgeRight),
        boxLeft: Math.round(blockRect.left - colLeft),
        boxRight: Math.round(colRight - blockRect.right),
      });
    });
  });
  return out;
})()`;

/* ------------------------------------------------------------------ */

const urls = fs.readFileSync(URLS_FILE, 'utf8')
  .split('\n').map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));
const pages = LIMIT ? urls.slice(0, LIMIT) : urls;

console.log(`Measuring ${pages.length} pages at ${WIDTH}px against the ${BASE} build...\n`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
const samples = [];
for (const p of pages) {
  const pg = await ctx.newPage();
  try {
    const resp = await pg.goto(BASE + p, { waitUntil: 'load', timeout: 40000 });
    if (resp && resp.ok()) {
      await pg.waitForTimeout(900);
      (await pg.evaluate(MEASURE)).forEach((r) => samples.push({ page: p, ...r }));
    }
  } catch { /* skip */ }
  await pg.close();
}
await browser.close();

/* ---- A: aggregate per block ---- */
const byBlock = new Map();
for (const s of samples) {
  if (!byBlock.has(s.name)) byBlock.set(s.name, []);
  byBlock.get(s.name).push(s);
}

const TOL = 2;
const rowsA = [];
for (const [name, list] of byBlock) {
  const med = (arr) => {
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };
  const insetL = med(list.map((s) => s.insetLeft));
  const insetR = med(list.map((s) => s.insetRight));
  const boxL = med(list.map((s) => s.boxLeft));
  const boxR = med(list.map((s) => s.boxRight));
  const aligned = Math.abs(insetL) <= TOL && Math.abs(insetR) <= TOL;
  const asymmetric = Math.abs(insetL - insetR) > TOL;
  const breakout = boxL < -TOL || boxR < -TOL;
  rowsA.push({
    name, n: list.length, insetL, insetR, boxL, boxR, aligned, asymmetric, breakout,
  });
}
rowsA.sort((a, b) => Math.max(Math.abs(b.insetL), Math.abs(b.insetR)) - Math.max(Math.abs(a.insetL), Math.abs(a.insetR)));

const offenders = rowsA.filter((r) => !r.aligned && !r.breakout);
const breakouts = rowsA.filter((r) => r.breakout);
const okA = rowsA.filter((r) => r.aligned && !r.breakout);

console.log('='.repeat(78));
console.log(`AUDIT A — side padding vs the ${samples[0] ? samples[0].colWidth : 1356}px universal column (--container ${WIDTH >= 1420 ? 1420 : WIDTH} minus 2x --section-pad)`);
console.log('='.repeat(78));
console.log(`\n${offenders.length} block types sit INSET from the column (their own side padding):\n`);
console.log('  inset L   inset R   sym?   n   block');
offenders.forEach((r) => {
  console.log(`   ${String(r.insetL).padStart(5)}px   ${String(r.insetR).padStart(5)}px   ${r.asymmetric ? 'ASYM' : ' ok '}  ${String(r.n).padStart(3)}   ${r.name}`);
});
console.log(`\n${breakouts.length} block types break OUT of the column (full-bleed; usually deliberate):`);
breakouts.forEach((r) => console.log(`   box L ${String(r.boxL).padStart(5)}px  box R ${String(r.boxR).padStart(5)}px   ${r.name}`));
console.log(`\n${okA.length} block types align with the column exactly.`);

/* ---- B: hover ---- */
const { hovers, transitions } = collectHoverRules();
const byBlockHover = new Map();
hovers.forEach((h) => {
  if (!byBlockHover.has(h.block)) byBlockHover.set(h.block, []);
  byBlockHover.get(h.block).push(h);
});

console.log(`\n\n${'='.repeat(78)}`);
console.log('AUDIT B — non-button, non-link hover states');
console.log('='.repeat(78));
console.log(`\n${hovers.length} hover rules across ${byBlockHover.size} blocks.\n`);

const tally = (key) => {
  const m = new Map();
  hovers.forEach((h) => {
    const v = h.props[key];
    if (!v) return;
    m.set(v, (m.get(v) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

for (const key of ['transform', 'box-shadow', 'border-color', 'background', 'background-color', 'opacity']) {
  const t = tally(key);
  if (!t.length) continue;
  console.log(`  ${key} — ${t.length} distinct value${t.length === 1 ? '' : 's'}:`);
  t.slice(0, 12).forEach(([v, c]) => console.log(`     ${String(c).padStart(3)}x  ${v.slice(0, 78)}`));
  if (t.length > 12) console.log(`         ... and ${t.length - 12} more`);
  console.log('');
}

const durations = new Map();
[...transitions.values()].forEach((v) => {
  (v.match(/(\d*\.?\d+)m?s/g) || []).forEach((d) => durations.set(d, (durations.get(d) || 0) + 1));
});
console.log(`  transition durations in use — ${durations.size} distinct:`);
[...durations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
  .forEach(([d, c]) => console.log(`     ${String(c).padStart(3)}x  ${d}`));

console.log('\n  per-block hover inventory:');
[...byBlockHover.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([b, list]) => {
  const props = new Set();
  list.forEach((h) => Object.keys(h.props).forEach((p) => props.add(p)));
  console.log(`     ${String(list.length).padStart(2)}  ${b.padEnd(34)} ${[...props].join(', ')}`);
});

const allBlocks = fs.readdirSync(BLOCKS_DIR)
  .filter((d) => fs.existsSync(path.join(BLOCKS_DIR, d, `${d}.css`)));
const noHover = allBlocks.filter((b) => !byBlockHover.has(b));
console.log(`\n  ${noHover.length} blocks have NO non-button hover at all:`);
console.log(`     ${noHover.join(', ')}`);

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    width: WIDTH, samples, blocksA: rowsA, hovers, noHover,
  }, null, 2));
  console.log(`\nJSON written to ${JSON_OUT}`);
}
