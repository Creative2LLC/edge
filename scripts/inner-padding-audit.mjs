#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */
/* eslint-disable no-continue, max-len, object-curly-newline -- CLI control flow. */

/**
 * Inner-padding audit: at a mobile width, measures each block's CUMULATIVE
 * internal padding - how far its content is pushed in from the block's own
 * edges. It walks the single-child wrapper chain from .block inward, summing
 * padding on each level, and stops where content branches (a grid/row of cards),
 * so it captures padding whether it lives on .block or an inner shell/inner.
 *
 * Reports per block type: horizontal (L/R) and vertical (T/B) internal padding,
 * so you can compare "how much room each block gives its content" on mobile.
 *
 * Reads the DEPLOYED site. Usage:
 *   npm run inner-padding-audit
 *   npm run inner-padding-audit -- --width 768
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

const DEFAULT_BASE = 'https://test--edge--creative2llc.aem.page';
const DEFAULT_URLS_FILE = 'audits/page-list.txt';

function parseArgs(argv) {
  const args = { base: DEFAULT_BASE, urlsFile: DEFAULT_URLS_FILE, width: 390, limit: 0 };
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.urlsFile)) throw new Error(`No ${args.urlsFile} - run \`npm run build:pagelist\` first.`);
  const urls = await readUrls(args);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: args.width, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();

  const agg = new Map(); // block -> { h: Map('L/R'->count), v: Map('T/B'->count), pages:Set }
  console.log(`Inner-padding audit @ ${args.width}px\n`);

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(300);
      const blocks = await page.evaluate(() => [...document.querySelectorAll('main > .section > div > .block')].map((block) => {
        let el = block;
        let l = 0;
        let r = 0;
        let t = 0;
        let b = 0;
        let surface = false; // does a padded level have a visible surface (bg/border/shadow)?
        for (let depth = 0; el && depth < 6; depth += 1) {
          const cs = getComputedStyle(el);
          const pl = parseFloat(cs.paddingLeft) || 0;
          const pr = parseFloat(cs.paddingRight) || 0;
          l += pl;
          r += pr;
          t += parseFloat(cs.paddingTop) || 0;
          b += parseFloat(cs.paddingBottom) || 0;
          const bg = cs.backgroundColor;
          const opaqueBg = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' && !/,\s*0\)\s*$/.test(bg);
          const bgImg = cs.backgroundImage && cs.backgroundImage !== 'none';
          const border = (parseFloat(cs.borderLeftWidth) || 0) > 0 || (parseFloat(cs.borderTopWidth) || 0) > 0;
          const shadow = cs.boxShadow && cs.boxShadow !== 'none';
          if (opaqueBg || bgImg || border || shadow) surface = true;
          const kids = [...el.children].filter((k) => k.nodeType === 1);
          if (kids.length !== 1) break;
          [el] = kids;
        }
        return {
          name: block.dataset.blockName || block.className.split(/\s+/)[0],
          h: `${Math.round(l)}/${Math.round(r)}`,
          v: `${Math.round(t)}/${Math.round(b)}`,
          hMax: Math.max(Math.round(l), Math.round(r)),
          surface,
        };
      }).filter((x) => x.name && x.name !== 'block'));
      for (const bl of blocks) {
        if (!agg.has(bl.name)) agg.set(bl.name, { h: new Map(), v: new Map(), pages: new Set(), surface: 0, total: 0, hMax: 0 });
        const rec = agg.get(bl.name);
        rec.h.set(bl.h, (rec.h.get(bl.h) || 0) + 1);
        rec.v.set(bl.v, (rec.v.get(bl.v) || 0) + 1);
        rec.pages.add(new URL(url).pathname);
        rec.total += 1;
        if (bl.surface) rec.surface += 1;
        rec.hMax = Math.max(rec.hMax, bl.hMax);
      }
    } catch (e) {
      console.log(`  (skip ${new URL(url).pathname}: ${e.message.slice(0, 50)})`);
    }
  }
  await browser.close();

  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const rows = [...agg.entries()].map(([name, rec]) => {
    const h = top(rec.h);
    const v = top(rec.v);
    return {
      name,
      hMain: h[0][0],
      hAlt: h.length > 1 ? h.slice(1).map(([val, c]) => `${val}(${c})`).join(' ') : '',
      vMain: v[0][0],
      pages: rec.pages.size,
      hLeft: Number.parseInt(h[0][0], 10),
      hMax: rec.hMax,
      surface: rec.surface > 0, // padded surface seen on any instance
    };
  });
  rows.sort((a, b) => b.hLeft - a.hLeft || a.name.localeCompare(b.name));

  console.log(`${'block'.padEnd(28)} ${'H-pad'.padEnd(9)} ${'V-pad'.padEnd(9)} ${'surface?'.padEnd(9)} other H`);
  console.log('-'.repeat(92));
  for (const r of rows) {
    console.log(`${r.name.padEnd(28).slice(0, 28)} ${r.hMain.padEnd(9)} ${r.vMain.padEnd(9)} ${(r.surface ? 'SURFACE' : '-').padEnd(9)} ${r.hAlt}`);
  }

  // Group 2 = blocks that add their own horizontal padding.
  const g2 = rows.filter((r) => r.hMax > 0);
  const justified = g2.filter((r) => r.surface);
  const drift = g2.filter((r) => !r.surface);
  console.log('\n\n=== GROUP 2 SPLIT (blocks with H-padding) ===');
  console.log(`\nHAS A SURFACE - padding justified (${justified.length}):`);
  console.log(`  ${justified.map((r) => `${r.name}(${r.hMain})`).join('  ')}`);
  console.log(`\nPLAIN BLOCK - padding is drift, candidate to drop to gutter-only (${drift.length}):`);
  console.log(`  ${drift.map((r) => `${r.name}(${r.hMain})`).join('  ')}`);
  console.log(`\n${rows.length} blocks @ ${args.width}px. "SURFACE" = a padded level has a bg/border/shadow.`);

  await fs.mkdir('audits', { recursive: true });
  const csv = ['block,h_pad_lr,v_pad_tb,surface,other_h,pages',
    ...rows.map((r) => `${r.name},"${r.hMain}","${r.vMain}",${r.surface ? 'surface' : 'plain'},"${r.hAlt}",${r.pages}`)].join('\n');
  await fs.writeFile(path.join('audits', 'inner-padding.csv'), `${csv}\n`, 'utf8');
  console.log('Wrote audits/inner-padding.csv');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
