#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */

/**
 * Full-bleed blocks re-establish the content column themselves. This checks
 * whether the column they rebuild is the SAME 1356px one every in-flow block
 * sits on.
 *
 * The failure it looks for is the documented one: capping at `--container` and
 * then padding by `--gutter` yields a 1420px column, 64px wider than the real
 * 1356, so a full-bleed section's copy sits proud of the section above it. Use
 * `--section-pad`, not `--gutter`.
 */
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = 'https://test--edge--creative2llc.aem.live';
const WIDTH = 1600;

const PROBE = `(() => {
  const rootCS = getComputedStyle(document.documentElement);
  const container = parseFloat(rootCS.getPropertyValue('--container')) || 1420;
  const pad = parseFloat(rootCS.getPropertyValue('--section-pad')) || 32;
  const vw = document.documentElement.clientWidth;
  const outer = Math.min(container, vw);
  const colLeft = (vw - outer) / 2 + pad;
  const colRight = colLeft + (outer - 2 * pad);
  const colWidth = colRight - colLeft;

  const out = [];
  document.querySelectorAll('main > .section > div > .block').forEach((block) => {
    const r = block.getBoundingClientRect();
    if (r.width < 50 || r.height < 10) return;
    // full-bleed only: box wider than the column
    if (r.width <= colWidth + 4) return;
    const name = block.dataset.blockName
      || [...block.classList].find((c) => c !== 'block') || 'unknown';

    // Deepest descendant that looks like the block's own content column:
    // narrower than the block, wider than half the column, and centred.
    let best = null;
    block.querySelectorAll('*').forEach((el) => {
      const er = el.getBoundingClientRect();
      if (er.width < colWidth * 0.5 || er.width > r.width - 2) return;
      const cs = getComputedStyle(el);
      const inner = {
        left: er.left + parseFloat(cs.paddingLeft || 0),
        right: er.right - parseFloat(cs.paddingRight || 0),
      };
      const w = inner.right - inner.left;
      if (w < colWidth * 0.5) return;
      const centred = Math.abs((inner.left - 0) - (vw - inner.right)) < 3;
      if (!centred) return;
      if (!best || w > best.w) best = { w, left: inner.left };
    });
    if (!best) return;
    out.push({
      name,
      colWidth: Math.round(colWidth),
      innerWidth: Math.round(best.w),
      delta: Math.round(best.w - colWidth),
    });
  });
  return out;
})()`;

const pages = fs.readFileSync('audits/page-list.txt', 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: WIDTH, height: 1000 } });
const rows = [];
for (const p of pages) {
  const pg = await ctx.newPage();
  try {
    const resp = await pg.goto(BASE + p, { waitUntil: 'load', timeout: 40000 });
    if (resp && resp.ok()) {
      await pg.waitForTimeout(800);
      (await pg.evaluate(PROBE)).forEach((r) => rows.push(r));
    }
  } catch { /* skip */ }
  await pg.close();
}
await br.close();

const byBlock = new Map();
rows.forEach((r) => {
  if (!byBlock.has(r.name)) byBlock.set(r.name, []);
  byBlock.get(r.name).push(r.delta);
});

console.log(`\nFull-bleed blocks: does their rebuilt column match the ${rows[0] ? rows[0].colWidth : 1356}px standard?\n`);
console.log('  delta   block                            (0 = matches; +64 = the --gutter idiom)');
[...byBlock.entries()]
  .map(([name, ds]) => {
    const a = [...ds].sort((x, y) => x - y);
    return { name, delta: a[Math.floor(a.length / 2)], n: ds.length };
  })
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  .forEach((r) => {
    const flag = Math.abs(r.delta) <= 2 ? 'ok ' : '*** ';
    console.log(`  ${flag}${String(r.delta > 0 ? `+${r.delta}` : r.delta).padStart(5)}px  ${r.name.padEnd(32)} n=${r.n}`);
  });
