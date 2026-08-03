#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */
/* eslint-disable no-use-before-define, no-continue, max-len -- CLI control flow. */
/* eslint-disable newline-per-chained-call, object-curly-newline -- Compact audit records. */

/**
 * Per-page audit orchestrator: runs BOTH Lighthouse (mobile) and responsive
 * screenshots for each page, writing everything into a folder named after the
 * page (not a timestamp):
 *
 *   audits/pages/
 *     home/
 *       lighthouse.html          full Lighthouse report
 *       screens/<viewport>.png   one screenshot per viewport
 *       summary.json             scores + overflow for this page
 *     amber-alerts/
 *       ...
 *     index.csv / index.json     one row per page (scores + overflow + pass)
 *
 * Timeout-resistant by design:
 *   - one page at a time; a failure on one page never aborts the rest
 *   - resumable: `--skip-existing` skips pages already captured, so re-running
 *     after a crash/timeout continues where it stopped
 *   - screenshots use `load` + a settle wait instead of `networkidle` (which
 *     hangs on pages with analytics/video and causes most timeouts)
 *
 * SEO is auto-relaxed on *.aem.page / *.aem.live hosts (they block indexing via
 * robots.txt). Override per category with --min-perf/--min-a11y/--min-bp/--min-seo.
 *
 * Usage:
 *   npm run audit:pages
 *   npm run audit:pages -- --skip-existing
 *   npm run audit:pages -- --only /amber-alerts
 *   npm run audit:pages -- --limit 5 --timeout 60000
 *   npm run audit:pages -- --base https://test--edge--creative2llc.aem.live
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const DEFAULT_BASE = 'https://test--edge--creative2llc.aem.page';
const DEFAULT_URLS_FILE = 'audits/page-list.txt';
const OUT_ROOT = 'audits/pages';
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const CATEGORY_LABEL = {
  performance: 'Perf', accessibility: 'A11y', 'best-practices': 'BP', seo: 'SEO',
};
const CATEGORY_FLAG = {
  '--min-perf': 'performance',
  '--min-a11y': 'accessibility',
  '--min-bp': 'best-practices',
  '--min-seo': 'seo',
};
const PREVIEW_HOST = /\.aem\.(page|live)$/i;
const OVERFLOW_TOLERANCE_PX = 3;

const DEFAULT_VIEWPORTS = [
  { name: '320-mobile-xsmall', width: 320, height: 800 },
  { name: '360-mobile-small', width: 360, height: 800 },
  { name: '390-mobile-common', width: 390, height: 844 },
  { name: '430-mobile-large', width: 430, height: 932 },
  { name: '768-tablet-portrait', width: 768, height: 1024 },
  { name: '900-tablet-medium', width: 900, height: 1024 },
  { name: '1024-tablet-landscape', width: 1024, height: 768 },
  { name: '1100-small-desktop', width: 1100, height: 800 },
  { name: '1200-desktop-baseline', width: 1200, height: 900 },
];

function parseArgs(argv) {
  const args = {
    base: process.env.AUDIT_BASE_URL || DEFAULT_BASE,
    urlsFile: process.env.AUDIT_URLS_FILE || DEFAULT_URLS_FILE,
    outRoot: OUT_ROOT,
    limit: 0,
    threshold: 90,
    timeout: 45000,
    waitMs: 600,
    only: '',
    skipExisting: false,
    viewports: DEFAULT_VIEWPORTS,
  };
  const explicit = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base' && next) { args.base = next; i += 1; } else if (arg === '--urls' && next) { args.urlsFile = next; i += 1; } else if (arg === '--out' && next) { args.outRoot = next; i += 1; } else if (arg === '--limit' && next) { args.limit = Number.parseInt(next, 10) || 0; i += 1; } else if (arg === '--threshold' && next) { args.threshold = Number.parseInt(next, 10) || 90; i += 1; } else if (arg === '--timeout' && next) { args.timeout = Number.parseInt(next, 10) || 45000; i += 1; } else if (arg === '--wait' && next) { args.waitMs = Number.parseInt(next, 10) || 0; i += 1; } else if (arg === '--only' && next) { args.only = next; i += 1; } else if (arg === '--skip-existing') { args.skipExisting = true; } else if (arg === '--viewports' && next) { args.viewports = parseViewportList(next); i += 1; } else if (CATEGORY_FLAG[arg] && next != null) { explicit[CATEGORY_FLAG[arg]] = Number.parseInt(next, 10) || 0; i += 1; }
  }
  const url = new URL(args.base);
  args.base = `${url.protocol}//${url.host}`;
  args.thresholds = Object.fromEntries(CATEGORIES.map((c) => [c, explicit[c] ?? args.threshold]));
  args.seoRelaxed = false;
  if (PREVIEW_HOST.test(url.host) && explicit.seo == null) {
    args.thresholds.seo = 0;
    args.seoRelaxed = true;
  }
  return args;
}

function parseViewportList(value) {
  return String(value).split(',').map((e) => e.trim()).filter(Boolean).map((entry) => {
    const m = entry.match(/^(\d+)x(\d+)$/i);
    if (!m) throw new Error(`Invalid viewport "${entry}". Use WIDTHxHEIGHT.`);
    return { name: `${m[1]}x${m[2]}`, width: Number(m[1]), height: Number(m[2]) };
  });
}

async function readUrls(args) {
  const content = await fs.readFile(args.urlsFile, 'utf8');
  let urls = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((entry) => new URL(entry, args.base).toString());
  if (args.only) {
    const wanted = new URL(args.only, args.base).pathname.replace(/\/$/, '') || '/';
    urls = urls.filter((u) => (new URL(u).pathname.replace(/\/$/, '') || '/') === wanted);
  }
  urls = [...new Set(urls)];
  if (args.limit > 0) urls = urls.slice(0, args.limit);
  return urls;
}

async function resolveChromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const p = chromium.executablePath();
  return p && existsSync(p) ? p : undefined;
}

function slugForUrl(url) {
  const clean = new URL(url).pathname
    .replace(/\/$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
    .toLowerCase();
  return clean || 'home';
}

function scoreFor(lhr, category) {
  const raw = lhr.categories?.[category]?.score;
  return raw == null ? null : Math.round(raw * 100);
}

async function runLighthouse(url, port, timeout) {
  const result = await lighthouse(url, {
    port,
    output: ['html'],
    onlyCategories: CATEGORIES,
    maxWaitForLoad: Math.max(timeout, 45000),
    logLevel: 'error',
  });
  const scores = Object.fromEntries(CATEGORIES.map((c) => [c, scoreFor(result.lhr, c)]));
  return { scores, html: result.report[0] };
}

async function capture(browser, url, viewport, dir, args) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(args.timeout);
    // `load` (not `networkidle`) Ã¢â‚¬â€ networkidle hangs on analytics/video beacons.
    await page.goto(url, { waitUntil: 'load', timeout: args.timeout });
    if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);

    const overflowPx = await page.evaluate(() => {
      const doc = document.documentElement;
      const sw = Math.max(doc.scrollWidth, document.body?.scrollWidth || 0);
      return Math.max(0, sw - window.innerWidth);
    });
    await page.screenshot({
      path: path.join(dir, `${viewport.name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    return { viewport: viewport.name, overflowPx, error: '' };
  } catch (error) {
    return {
      viewport: viewport.name,
      overflowPx: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

function lhPass(scores, thresholds) {
  return CATEGORIES.every((c) => (scores?.[c] ?? 0) >= thresholds[c]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urls = await readUrls(args);
  if (urls.length === 0) throw new Error(`No URLs found (urls: ${args.urlsFile}, only: ${args.only || 'none'})`);

  const chromePath = await resolveChromePath();
  await fs.mkdir(args.outRoot, { recursive: true });
  const chromeUserDataDir = path.join(args.outRoot, '.chrome-profile');
  await fs.mkdir(chromeUserDataDir, { recursive: true });
  const chrome = await chromeLauncher.launch({
    chromePath,
    userDataDir: chromeUserDataDir,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const browser = await chromium.launch();

  console.log(`Per-page audit Ã¢â‚¬â€ ${urls.length} pages Ãƒâ€” (Lighthouse + ${args.viewports.length} viewports)`);
  console.log(`Pass rule: ${CATEGORIES.map((c) => `${CATEGORY_LABEL[c]}>=${args.thresholds[c]}`).join(' ')}`);
  if (args.seoRelaxed) console.log('  (SEO relaxed to 0 on preview host Ã¢â‚¬â€ override with --min-seo 90)');
  console.log(`Output: ${args.outRoot}/<page>/\n`);

  const index = [];
  try {
    for (const url of urls) {
      const slug = slugForUrl(url);
      const dir = path.join(args.outRoot, slug);
      const screensDir = path.join(dir, 'screens');

      if (args.skipExisting && existsSync(path.join(dir, 'summary.json'))) {
        console.log(`- ${slug} (skipped, already done)`);
        const prev = JSON.parse(await fs.readFile(path.join(dir, 'summary.json'), 'utf8'));
        index.push(prev);
        continue;
      }

      process.stdout.write(`- ${slug} ... `);
      await fs.mkdir(screensDir, { recursive: true });
      const record = { page: slug, url, scores: {}, lhPass: null, overflow: [], error: '' };

      try {
        const lh = await runLighthouse(url, chrome.port, args.timeout);
        record.scores = lh.scores;
        record.lhPass = lhPass(lh.scores, args.thresholds);
        await fs.writeFile(path.join(dir, 'lighthouse.html'), lh.html, 'utf8');
      } catch (error) {
        record.error += `lighthouse: ${error instanceof Error ? error.message : error}; `;
      }

      for (const viewport of args.viewports) {
        record.overflow.push(await capture(browser, url, viewport, screensDir, args));
      }

      const overflowValues = record.overflow.map((o) => o.overflowPx).filter((v) => v != null);
      record.maxOverflowPx = overflowValues.length ? Math.max(...overflowValues) : null;
      record.overflowPass = (record.maxOverflowPx ?? 0) <= OVERFLOW_TOLERANCE_PX;

      await fs.writeFile(path.join(dir, 'summary.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      index.push(record);

      const lhStr = CATEGORIES.map((c) => record.scores?.[c] ?? '-').join('/');
      console.log(`LH ${lhStr} ${record.lhPass ? 'PASS' : 'FAIL'} | overflow ${record.maxOverflowPx ?? '-'}px ${record.overflowPass ? 'OK' : 'BAD'}${record.error ? ` | ${record.error}` : ''}`);
    }
  } finally {
    await browser.close();
    await chrome.kill();
  }

  const columns = ['page', ...CATEGORIES, 'lhPass', 'maxOverflowPx', 'overflowPass', 'error'];
  const csv = [
    columns.join(','),
    ...index.map((r) => columns.map((c) => {
      const val = CATEGORIES.includes(c) ? r.scores?.[c] : r[c];
      return `"${String(val ?? '').replaceAll('"', '""')}"`;
    }).join(',')),
  ].join('\n');
  await fs.writeFile(path.join(args.outRoot, 'index.csv'), `${csv}\n`, 'utf8');
  await fs.writeFile(path.join(args.outRoot, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  const lhFail = index.filter((r) => r.lhPass === false).length;
  const ovFail = index.filter((r) => r.overflowPass === false).length;
  console.log(`\nDone. ${index.length} pages.`);
  console.log(`Lighthouse failing: ${lhFail} | Overflow failing: ${ovFail}`);
  console.log(`Index: ${path.join(args.outRoot, 'index.csv')}`);
  if (lhFail > 0 || ovFail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
