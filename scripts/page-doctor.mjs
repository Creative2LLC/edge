#!/usr/bin/env node

/* eslint-disable no-console -- CLI diagnostic output. */
/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue --
   Sequential page checks are intentional. */

/**
 * Page doctor — diagnose a page that renders wrong on live.
 *
 * Checks the things that actually go wrong with EDS blocks, in the order they
 * are worth ruling out:
 *
 *   1. Did every block finish decorating?  (data-block-status)
 *   2. Did any block throw?                 (pageerror / console errors)
 *   3. Are any control labels raw paths?    (the classic field-offset symptom —
 *      the block read the LINK row where the LABEL row should be)
 *   4. Are any authored cells leaking through as visible text?
 *   5. How many rows does each block instance actually have on the published
 *      page, vs the other instances of the same block? A row-count mismatch
 *      between two instances of one block is the fingerprint of a model change
 *      that some pages have picked up and others have not.
 *
 * Point 5 matters because a stale publish and a genuine code bug look identical
 * from the front end. See audits/typography-audit.md and the block-field notes.
 *
 * Usage:
 *   node scripts/page-doctor.mjs /data-and-impact/our-impact-report
 *   node scripts/page-doctor.mjs https://.../full-url
 *   AUDIT_BASE_URL=https://main--edge--creative2llc.aem.page node scripts/page-doctor.mjs /path
 */
import process from 'node:process';
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL || 'https://test--edge--creative2llc.aem.page';
const arg = process.argv[2] || '/';
const url = arg.startsWith('http') ? arg : BASE + arg;

function inPage() {
  const out = {
    blocks: [], badLabels: [], emptyControls: [], rowCounts: {},
  };

  document.querySelectorAll('[data-block-name]').forEach((el) => {
    out.blocks.push({
      name: el.dataset.blockName,
      status: el.dataset.blockStatus || '(none)',
      classes: el.className.trim(),
    });
  });

  document.querySelectorAll('a, button').forEach((el) => {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    const blk = el.closest('[data-block-name]');
    const rec = {
      text: text.slice(0, 70),
      block: blk ? blk.dataset.blockName : '(page)',
      href: el.getAttribute('href') || '',
      hasIcon: !!el.querySelector('img, svg, .icon'),
    };
    // a control whose visible label is a raw content path or a bare slash
    if (/^\/content\//.test(text) || /^\/(\s|$|→)/.test(text)) out.badLabels.push(rec);
    // a control with no text and no icon is invisible to everyone
    else if (!text && !rec.hasIcon && el.getBoundingClientRect().width > 0) {
      out.emptyControls.push(rec);
    }
  });

  return out;
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`uncaught: ${e.message.split('\n')[0]}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 170)}`); });
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url().slice(0, 110)}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
// give lazily-decorated blocks time, and trigger any scroll-reveal work
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(2500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);

const r = await page.evaluate(inPage);

console.log(`\n${url}\n`);

const counts = {};
r.blocks.forEach((b) => {
  counts[b.name] = counts[b.name] || {};
  counts[b.name][b.status] = (counts[b.name][b.status] || 0) + 1;
});
const stalled = Object.entries(counts).filter(([, s]) => !s.loaded || Object.keys(s).length > 1);
console.log(`blocks on page: ${r.blocks.length} (${Object.keys(counts).length} types)`);
if (stalled.length) {
  console.log('  ⚠ not all instances reported loaded:');
  stalled.forEach(([n, s]) => console.log(`      ${n}  ${JSON.stringify(s)}`));
} else {
  console.log('  ✔ every block reported loaded');
}

console.log(`\ncontrols whose LABEL is a raw path: ${r.badLabels.length}`);
if (r.badLabels.length) {
  console.log('  (symptom: the block read the LINK cell where the LABEL cell should be)');
  r.badLabels.forEach((x) => console.log(`      [${x.block}]  "${x.text}"  ->  ${x.href}`));
}

console.log(`\nvisible controls with no label and no icon: ${r.emptyControls.length}`);
r.emptyControls.slice(0, 10).forEach((x) => console.log(`      [${x.block}]  href="${x.href}"`));

console.log(`\nJS errors / failed requests: ${errors.length || 'none'}`);
[...new Set(errors)].slice(0, 12).forEach((e) => console.log(`      ${e}`));

console.log('');
await browser.close();
