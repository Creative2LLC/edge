#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */

/**
 * Lighthouse audit over the same page list the responsive audit uses.
 *
 * Mobile emulation (Lighthouse default: throttled Moto G Power). A page PASSES
 * only when Performance, Accessibility, Best Practices, and SEO are all >= the
 * threshold (default 90 - Google's "green" bar).
 *
 * Runs sequentially on purpose: Lighthouse measures performance, so parallel
 * runs would compete for CPU and skew the scores.
 *
 * Reuses Playwright's already-installed Chromium, so no extra browser download.
 *
 * On *.aem.page / *.aem.live hosts, SEO is auto-relaxed (threshold 0) because
 * those hosts block indexing via robots.txt, which is a preview artifact, not a
 * defect. Override any category with --min-perf/--min-a11y/--min-bp/--min-seo.
 *
 * Usage:
 *   npm run audit:lighthouse
 *   npm run audit:lighthouse -- --urls audits/page-list.txt --limit 5
 *   npm run audit:lighthouse -- --base https://test--edge--creative2llc.aem.live
 *   npm run audit:lighthouse -- --threshold 95
 *   npm run audit:lighthouse -- --min-seo 90 --min-perf 80
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const DEFAULT_BASE = 'https://test--edge--creative2llc.aem.page';
const DEFAULT_URLS_FILE = 'audits/page-list.txt';
const OUT_ROOT = 'audits/lighthouse';
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const CATEGORY_LABEL = {
  performance: 'Perf',
  accessibility: 'A11y',
  'best-practices': 'BP',
  seo: 'SEO',
};
// Per-category CLI flag -> category key.
const CATEGORY_FLAG = {
  '--min-perf': 'performance',
  '--min-a11y': 'accessibility',
  '--min-bp': 'best-practices',
  '--min-seo': 'seo',
};
// aem.page / aem.live hosts serve robots.txt "Disallow: /", which tanks the
// Lighthouse SEO score ("blocked from indexing"). That is a preview-host
// artifact, not a real defect, so don't fail SEO there unless asked to.
const PREVIEW_HOST = /\.aem\.(page|live)$/i;

function parseArgs(argv) {
  const args = {
    base: process.env.AUDIT_BASE_URL || DEFAULT_BASE,
    urlsFile: process.env.AUDIT_URLS_FILE || DEFAULT_URLS_FILE,
    limit: Number.parseInt(process.env.AUDIT_LIMIT || '', 10) || 0,
    threshold: Number.parseInt(process.env.AUDIT_THRESHOLD || '', 10) || 90,
    outDir: '',
  };
  const explicit = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base' && next) { args.base = next; i += 1; } else if (arg === '--urls' && next) { args.urlsFile = next; i += 1; } else if (arg === '--limit' && next) { args.limit = Number.parseInt(next, 10) || 0; i += 1; } else if (arg === '--threshold' && next) { args.threshold = Number.parseInt(next, 10) || 90; i += 1; } else if (arg === '--out' && next) { args.outDir = next; i += 1; } else if (CATEGORY_FLAG[arg] && next != null) { explicit[CATEGORY_FLAG[arg]] = Number.parseInt(next, 10) || 0; i += 1; }
  }
  const url = new URL(args.base);
  args.base = `${url.protocol}//${url.host}`;
  args.outDir = args.outDir
    || path.join(OUT_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));

  // Every category defaults to the global threshold; per-category flags override.
  args.thresholds = Object.fromEntries(
    CATEGORIES.map((c) => [c, explicit[c] ?? args.threshold]),
  );
  // Auto-relax SEO on preview hosts unless the user set --min-seo explicitly.
  args.seoRelaxed = false;
  if (PREVIEW_HOST.test(url.host) && explicit.seo == null) {
    args.thresholds.seo = 0;
    args.seoRelaxed = true;
  }
  return args;
}

async function readUrls(args) {
  const content = await fs.readFile(args.urlsFile, 'utf8');
  const urls = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((entry) => new URL(entry, args.base).toString());
  return [...new Set(urls)];
}

async function resolveChromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  try {
    const { chromium } = await import('@playwright/test');
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch {
    // fall through to chrome-launcher auto-detection
  }
  return undefined;
}

function slugForUrl(url) {
  const { pathname } = new URL(url);
  const clean = pathname
    .replace(/\/$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return clean || 'home';
}

function scoreFor(lhr, category) {
  const raw = lhr.categories?.[category]?.score;
  return raw == null ? null : Math.round(raw * 100);
}

async function auditUrl(url, port, thresholds) {
  const result = await lighthouse(url, {
    port,
    output: ['html', 'json'],
    onlyCategories: CATEGORIES,
    logLevel: 'error',
  });
  const { lhr } = result;
  const scores = Object.fromEntries(CATEGORIES.map((c) => [c, scoreFor(lhr, c)]));
  const pass = CATEGORIES.every((c) => (scores[c] ?? 0) >= thresholds[c]);
  return {
    url, scores, pass, htmlReport: result.report[0],
  };
}

function fmtScore(value) {
  if (value == null) return ' n/a';
  return String(value).padStart(4, ' ');
}

function printRow(label, scores, passLabel) {
  const cells = CATEGORIES.map((c) => fmtScore(scores?.[c])).join(' ');
  console.log(`${label.padEnd(44).slice(0, 44)} ${cells}   ${passLabel}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let urls = await readUrls(args);
  if (args.limit > 0) urls = urls.slice(0, args.limit);
  if (urls.length === 0) throw new Error(`No URLs found in ${args.urlsFile}`);

  const chromePath = await resolveChromePath();
  await fs.mkdir(args.outDir, { recursive: true });
  const chrome = await chromeLauncher.launch({
    chromePath,
    userDataDir: false,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const passRule = CATEGORIES
    .map((c) => `${CATEGORY_LABEL[c]}>=${args.thresholds[c]}`)
    .join(' ');
  console.log(`Lighthouse (mobile) - ${urls.length} pages`);
  console.log(`Pass rule: ${passRule}`);
  if (args.seoRelaxed) {
    console.log('  (SEO threshold set to 0: preview host blocks indexing via robots.txt - override with --min-seo 90)');
  }
  console.log(`Chrome: ${chromePath || '(auto-detected)'}  port ${chrome.port}`);
  console.log(`Output: ${args.outDir}\n`);
  const header = CATEGORIES.map((c) => CATEGORY_LABEL[c].padStart(4, ' ')).join(' ');
  console.log(`${'URL'.padEnd(44)} ${header}   Pass`);
  console.log('-'.repeat(72));

  const results = [];
  try {
    for (const url of urls) {
      try {
        const res = await auditUrl(url, chrome.port, args.thresholds);
        const slug = slugForUrl(url);
        await fs.writeFile(path.join(args.outDir, `${slug}.html`), res.htmlReport, 'utf8');
        printRow(new URL(url).pathname, res.scores, res.pass ? 'PASS' : 'FAIL');
        results.push({
          url, ...res.scores, pass: res.pass, error: '',
        });
      } catch (error) {
        printRow(new URL(url).pathname, null, 'ERROR');
        results.push({
          url,
          error: error instanceof Error ? error.message : String(error),
          pass: false,
        });
      }
    }
  } finally {
    await chrome.kill();
  }

  const columns = ['url', ...CATEGORIES, 'pass', 'error'];
  const csv = [
    columns.join(','),
    ...results.map((r) => columns
      .map((c) => `"${String(r[c] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\n');
  await fs.writeFile(path.join(args.outDir, 'summary.csv'), `${csv}\n`, 'utf8');
  await fs.writeFile(path.join(args.outDir, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');

  const failed = results.filter((r) => !r.pass);
  console.log('-'.repeat(72));
  console.log(`\nPassed: ${results.length - failed.length}/${results.length}`);
  console.log(`Summary: ${path.join(args.outDir, 'summary.csv')}`);
  console.log(`Per-page HTML reports: ${args.outDir}/<page>.html`);
  if (failed.length > 0) {
    console.log(`\nFailing pages (${failed.length}):`);
    failed.forEach((r) => {
      const detail = r.error
        ? `ERROR ${r.error}`
        : CATEGORIES.filter((c) => (r[c] ?? 0) < args.thresholds[c])
          .map((c) => `${CATEGORY_LABEL[c]} ${r[c]}`).join(', ');
      console.log(`  ${new URL(r.url).pathname} - ${detail}`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
