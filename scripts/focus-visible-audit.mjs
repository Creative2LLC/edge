#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */

/**
 * Does keyboard focus produce anything a person can SEE?
 *
 * WCAG 2.4.7 (Focus Visible, AA) needs a visible indicator on every keyboard-
 * focusable control. This does not read the CSS — it focuses each control for
 * real and compares the computed outline, box-shadow, border, background and
 * transform before and after, which is the only way to survive the combination
 * of a commented-out global rule, 21 blocks setting `outline: none`, and 63
 * blocks defining their own :focus-visible.
 *
 *   node scripts/focus-visible-audit.mjs
 */
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = 'https://test--edge--creative2llc.aem.live';
const LIMIT = Number(process.argv[2] || 14);

const PROBE = `(() => {
  const props = ['outlineWidth', 'outlineStyle', 'outlineColor', 'boxShadow',
    'borderColor', 'borderWidth', 'backgroundColor', 'transform', 'textDecorationLine', 'color'];
  const snap = (el) => {
    const cs = getComputedStyle(el);
    return props.map((p) => cs[p]).join('|');
  };
  const sel = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const out = [];
  const seen = new Set();
  [...document.querySelectorAll(sel)].forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;

    // Identify by the block it lives in plus its own class.
    const block = el.closest('[data-block-name]');
    const name = (block && block.dataset.blockName) || 'page';
    const cls = String(el.className || '').split(' ')[0] || el.tagName.toLowerCase();
    const key = name + '|' + cls;
    if (seen.has(key)) return;
    seen.add(key);

    const before = snap(el);
    el.focus();
    const after = snap(el);
    el.blur();
    out.push({ block: name, cls, changed: before !== after, tag: el.tagName.toLowerCase() });
  });
  return out;
})()`;

const pages = fs.readFileSync('audits/page-list.txt', 'utf8')
  .split('\n').map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .slice(0, LIMIT);

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const all = new Map();

for (const p of pages) {
  const pg = await ctx.newPage();
  try {
    const resp = await pg.goto(BASE + p, { waitUntil: 'load', timeout: 35000 });
    if (resp && resp.ok()) {
      await pg.waitForTimeout(1400);
      (await pg.evaluate(PROBE)).forEach((r) => {
        const key = `${r.block}|${r.cls}`;
        if (!all.has(key)) all.set(key, r);
      });
    }
  } catch { /* skip */ }
  await pg.close();
}
await br.close();

const rows = [...all.values()];
const invisible = rows.filter((r) => !r.changed);
const visible = rows.filter((r) => r.changed);

console.log(`\nFocused ${rows.length} distinct controls across ${pages.length} pages.\n`);
console.log(`  visible focus state   : ${visible.length}`);
console.log(`  NOTHING VISIBLE       : ${invisible.length}   <- WCAG 2.4.7 risk\n`);

const byBlock = {};
invisible.forEach((r) => { (byBlock[r.block] = byBlock[r.block] || []).push(`${r.tag}.${r.cls}`); });
console.log('Controls where focus changes nothing at all:');
Object.entries(byBlock).sort().forEach(([b, list]) => {
  console.log(`  ${b}`);
  [...new Set(list)].slice(0, 6).forEach((c) => console.log(`      ${c.slice(0, 60)}`));
});
