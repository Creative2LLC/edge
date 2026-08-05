#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */
/* eslint-disable no-continue, max-len, object-curly-newline -- CLI control flow. */

/**
 * Gutter audit: at a mobile width, measures where each section-level block's box
 * sits relative to the viewport edge (left/right inset) plus the block's own
 * horizontal padding. Horizontal alignment is objective, so this turns "are the
 * gutters consistent?" into a ranked offender list per block type.
 *
 * The standard mobile gutter is 24px (main > .section > div { padding: 0 24px }).
 * Blocks are flagged as:
 *   - gutter    : left/right inset ~= 24px (aligned, good)
 *   - full-bleed: inset ~= 0 (edge to edge - usually intentional; exempt)
 *   - offender  : anything else (breakout hack, or extra/inconsistent inset)
 *
 * Reads the DEPLOYED site (horizontal padding is unaffected by the vertical-rhythm
 * work, so the deployed measurement reflects the current block CSS).
 *
 * Usage:
 *   npm run gutter-audit
 *   npm run gutter-audit -- --width 360 --base https://test--edge--creative2llc.aem.page
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const DEFAULT_BASE = 'https://test--edge--creative2llc.aem.page';
const DEFAULT_URLS_FILE = 'audits/page-list.txt';
const GUTTER = 24; // main > .section > div padding
const TOL = 2;

function parseArgs(argv) {
  const args = {
    base: DEFAULT_BASE, urlsFile: DEFAULT_URLS_FILE, width: 390, limit: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--base' && n) { args.base = n; i += 1; } else if (a === '--urls' && n) { args.urlsFile = n; i += 1; } else if (a === '--width' && n) { args.width = Number.parseInt(n, 10) || 390; i += 1; } else if (a === '--limit' && n) { args.limit = Number.parseInt(n, 10) || 0; i += 1; }
  }
  const u = new URL(args.base);
  args.base = `${u.protocol}//${u.host}`;
  return args;
}

async function readUrls(args) {
  const content = await fs.readFile(args.urlsFile, 'utf8');
  let urls = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((e) => new URL(e, args.base).toString());
  urls = [...new Set(urls)];
  if (args.limit > 0) urls = urls.slice(0, args.limit);
  return urls;
}

function classifyList(vals) {
  if (vals.every((v) => Math.abs(v - GUTTER) <= TOL)) return 'gutter'; // all content at 24
  if (vals.every((v) => Math.abs(v) <= TOL)) return 'full-bleed'; // all edge-to-edge
  return 'offender'; // mixed (24 vs 0), over-inset (padding), or odd value
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.urlsFile)) throw new Error(`No ${args.urlsFile} - run \`npm run build:pagelist\` first.`);
  const urls = await readUrls(args);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: args.width, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();

  // blockName -> { insets: Map(rounded left -> count), pads: Set, pages: Set, samples }
  const agg = new Map();
  console.log(`Gutter audit @ ${args.width}px (standard gutter = ${GUTTER}px)\n`);

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(300);
      const blocks = await page.evaluate(() => [...document.querySelectorAll('main > .section > div > .block')].map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const padL = Math.round(parseFloat(cs.paddingLeft) || 0);
        return {
          name: el.dataset.blockName || el.className.split(/\s+/)[0],
          box: Math.round(r.left), // where the block box starts (0 = full-bleed)
          content: Math.round(r.left + padL), // where content actually starts
          padL,
          padR: Math.round(parseFloat(cs.paddingRight) || 0),
        };
      }).filter((b) => b.name && b.name !== 'block'));
      for (const b of blocks) {
        if (!agg.has(b.name)) {
          agg.set(b.name, { insets: new Map(), pads: new Set(), boxes: new Set(), pages: new Set() });
        }
        const rec = agg.get(b.name);
        rec.insets.set(b.content, (rec.insets.get(b.content) || 0) + 1);
        rec.boxes.add(b.box);
        if (b.padL || b.padR) rec.pads.add(`${b.padL}/${b.padR}`);
        rec.pages.add(new URL(url).pathname);
      }
    } catch (e) {
      console.log(`  (skip ${new URL(url).pathname}: ${e.message.slice(0, 50)})`);
    }
  }
  await browser.close();

  const rows = [...agg.entries()].map(([name, rec]) => {
    const insets = [...rec.insets.entries()].sort((a, b) => b[1] - a[1]);
    return {
      name,
      status: classifyList(insets.map(([v]) => v)),
      insets: insets.map(([v, c]) => `${v}px(${c})`).join(' '),
      box: [...rec.boxes].sort((a, b) => a - b).map((v) => `${v}`).join('/'),
      pads: [...rec.pads].join(' ') || '-',
      pages: rec.pages.size,
      dominant: insets[0][0],
    };
  });

  const order = { offender: 0, 'full-bleed': 1, gutter: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status] || b.pages - a.pages);

  console.log(`${'block'.padEnd(28)} ${'status'.padEnd(10)} content-inset(pages)          box     pad L/R`);
  console.log('-'.repeat(96));
  for (const r of rows) {
    console.log(`${r.name.padEnd(28).slice(0, 28)} ${r.status.padEnd(10)} ${r.insets.padEnd(28).slice(0, 28)}  ${r.box.padEnd(6)}  ${r.pads}`);
  }
  const offenders = rows.filter((r) => r.status === 'offender');
  const bleed = rows.filter((r) => r.status === 'full-bleed');
  console.log(`\n${rows.length} block types: ${offenders.length} offenders, ${bleed.length} full-bleed, ${rows.length - offenders.length - bleed.length} on-gutter.`);
  console.log('offenders (reconcile to --gutter):', offenders.map((r) => r.name).join(', ') || 'none');
  console.log('full-bleed (likely exempt):', bleed.map((r) => r.name).join(', ') || 'none');

  await fs.mkdir('audits', { recursive: true });
  const csv = ['block,status,dominant_left,left_insets,pad_lr,pages',
    ...rows.map((r) => `${r.name},${r.status},${r.dominant},"${r.insets}","${r.pads}",${r.pages}`)].join('\n');
  await fs.writeFile(path.join('audits', 'gutter-audit.csv'), `${csv}\n`, 'utf8');
  console.log('\nWrote audits/gutter-audit.csv');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
