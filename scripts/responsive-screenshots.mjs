#!/usr/bin/env node

/* eslint-disable no-console, no-use-before-define -- CLI audit progress output. */
/* eslint-disable no-await-in-loop, no-restricted-syntax -- Sequential capture is intentional. */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const DEFAULT_BASE_URL = 'https://test--edge--creative2llc.aem.page';
const DEFAULT_SITEMAP_PATH = '/sitemap.json';
const DEFAULT_OUTPUT_ROOT = 'audits/responsive';
const DEFAULT_TIMEOUT = 45000;
const DEFAULT_WAIT_MS = 400;

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
    baseUrl: process.env.AUDIT_BASE_URL || DEFAULT_BASE_URL,
    sitemap: process.env.AUDIT_SITEMAP || '',
    urlsFile: process.env.AUDIT_URLS_FILE || '',
    outDir: process.env.AUDIT_OUT_DIR || '',
    limit: Number.parseInt(process.env.AUDIT_LIMIT || '', 10) || 0,
    timeout: Number.parseInt(process.env.AUDIT_TIMEOUT || '', 10) || DEFAULT_TIMEOUT,
    waitMs: Number.parseInt(process.env.AUDIT_WAIT_MS || '', 10) || DEFAULT_WAIT_MS,
    viewports: DEFAULT_VIEWPORTS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--base' && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === '--sitemap' && next) {
      args.sitemap = next;
      index += 1;
    } else if (arg === '--urls' && next) {
      args.urlsFile = next;
      index += 1;
    } else if (arg === '--out' && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === '--limit' && next) {
      args.limit = Number.parseInt(next, 10) || 0;
      index += 1;
    } else if (arg === '--timeout' && next) {
      args.timeout = Number.parseInt(next, 10) || DEFAULT_TIMEOUT;
      index += 1;
    } else if (arg === '--wait' && next) {
      args.waitMs = Number.parseInt(next, 10) || DEFAULT_WAIT_MS;
      index += 1;
    } else if (arg === '--viewports' && next) {
      args.viewports = parseViewportList(next);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  args.baseUrl = normalizeBaseUrl(args.baseUrl);
  args.sitemap = args.sitemap || new URL(DEFAULT_SITEMAP_PATH, args.baseUrl).toString();
  args.outDir = args.outDir || path.join(
    DEFAULT_OUTPUT_ROOT,
    new Date().toISOString().replace(/[:.]/g, '-'),
  );

  return args;
}

function printHelp() {
  console.log(`Responsive screenshot audit

Usage:
  npm run audit:responsive -- [options]

Options:
  --base <url>          Site origin. Default: ${DEFAULT_BASE_URL}
  --sitemap <url>       Sitemap JSON/XML URL. Default: <base>/sitemap.json
  --urls <file>         Newline-delimited URL/path file. Overrides sitemap.
  --out <dir>           Output directory. Default: ${DEFAULT_OUTPUT_ROOT}/<timestamp>
  --limit <number>      Capture only the first N pages.
  --timeout <ms>        Per-page timeout. Default: ${DEFAULT_TIMEOUT}
  --wait <ms>           Extra wait after page load. Default: ${DEFAULT_WAIT_MS}
  --viewports <list>    Comma list like 360x800,768x1024,1100x800.

Examples:
  npm run audit:responsive
  npm run audit:responsive -- --base https://test--edge--creative2llc.aem.live
  npm run audit:responsive -- --urls audits/page-list.txt --limit 10
`);
}

function parseViewportList(value) {
  const viewports = String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(\d+)x(\d+)$/i);
      if (!match) throw new Error(`Invalid viewport "${entry}". Use WIDTHxHEIGHT.`);
      const [, rawWidth, rawHeight] = match;
      const width = Number.parseInt(rawWidth, 10);
      const height = Number.parseInt(rawHeight, 10);
      return { name: `${width}x${height}`, width, height };
    });

  if (viewports.length === 0) throw new Error('At least one viewport is required.');
  return viewports;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

async function readUrls(args) {
  if (args.urlsFile) {
    const content = await fs.readFile(args.urlsFile, 'utf8');
    return uniqueUrls(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((entry) => toAbsoluteUrl(entry, args.baseUrl)),
    );
  }

  const response = await fetch(args.sitemap);
  if (!response.ok) {
    throw new Error(`Could not load sitemap ${args.sitemap}: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  const urls = contentType.includes('json') || args.sitemap.endsWith('.json')
    ? extractUrlsFromJson(JSON.parse(text), args.baseUrl)
    : extractUrlsFromXml(text, args.baseUrl);

  return uniqueUrls(urls);
}

function extractUrlsFromJson(data, baseUrl) {
  const urls = [];

  function visit(value) {
    if (typeof value === 'string') {
      if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
        urls.push(toAbsoluteUrl(value, baseUrl));
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) => {
        if (
          typeof child === 'string'
          && ['url', 'loc', 'path', 'route'].includes(key.toLowerCase())
        ) {
          urls.push(toAbsoluteUrl(child, baseUrl));
          return;
        }
        visit(child);
      });
    }
  }

  visit(data);
  return urls;
}

function extractUrlsFromXml(xml, baseUrl) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => toAbsoluteUrl(match[1], baseUrl));
}

function toAbsoluteUrl(value, baseUrl) {
  const url = new URL(value, baseUrl);
  url.hash = '';
  return url.toString();
}

function uniqueUrls(urls) {
  return [...new Set(urls)]
    .filter((url) => {
      const parsed = new URL(url);
      return !/\.(?:png|jpe?g|webp|gif|svg|pdf|zip|mp4|mov|css|js)$/i.test(parsed.pathname);
    })
    .sort((a, b) => a.localeCompare(b));
}

function slugForUrl(url) {
  const parsed = new URL(url);
  const clean = parsed.pathname
    .replace(/\/$/, '')
    .replace(/\.html$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return clean || 'home';
}

async function ensureGitIgnored(rootDir) {
  await fs.mkdir(rootDir, { recursive: true });
  await fs.writeFile(
    path.join(rootDir, '.gitignore'),
    '*\n!.gitignore\n',
    'utf8',
  );
}

async function getPageMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const { body } = document;
    const overflowX = Math.max(root.scrollWidth, body?.scrollWidth || 0) - window.innerWidth;
    return {
      title: document.title,
      url: window.location.href,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: Math.max(root.scrollWidth, body?.scrollWidth || 0),
      scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight || 0),
      horizontalOverflow: overflowX > 1,
      horizontalOverflowPx: Math.max(0, overflowX),
    };
  });
}

async function capturePage(browser, url, viewport, args) {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
    deviceScaleFactor: 1,
    // Scroll-reveal blocks start at opacity:0 and only reveal when scrolled into
    // view (IntersectionObserver). In a headless full-page capture that observer
    // may not have fired, leaving blocks blank/white. The site's own reduced-motion
    // path (styles.css + aem.js) reveals every block immediately, so emulate it.
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(args.timeout);
  page.setDefaultNavigationTimeout(args.timeout);

  const viewportDir = path.join(args.outDir, viewport.name);
  await fs.mkdir(viewportDir, { recursive: true });

  const slug = slugForUrl(url);
  const screenshotPath = path.join(viewportDir, `${slug}.png`);
  const startedAt = Date.now();

  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: args.timeout,
    });
    if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);

    const metrics = await getPageMetrics(page);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      animations: 'disabled',
    });

    return {
      url,
      slug,
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      status: response?.status() || null,
      ok: response?.ok() ?? null,
      screenshot: screenshotPath,
      durationMs: Date.now() - startedAt,
      error: '',
      ...metrics,
    };
  } catch (error) {
    return {
      url,
      slug,
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      status: null,
      ok: false,
      screenshot: '',
      durationMs: Date.now() - startedAt,
      title: '',
      horizontalOverflow: false,
      horizontalOverflowPx: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

function toCsvRow(values) {
  return values
    .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
    .join(',');
}

async function writeReports(args, results) {
  const jsonPath = path.join(args.outDir, 'report.json');
  const csvPath = path.join(args.outDir, 'report.csv');
  const overflowPath = path.join(args.outDir, 'overflow.csv');

  await fs.writeFile(jsonPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

  const columns = [
    'url',
    'viewport',
    'status',
    'ok',
    'horizontalOverflow',
    'horizontalOverflowPx',
    'screenshot',
    'error',
  ];
  const csv = [
    columns.join(','),
    ...results.map((result) => toCsvRow(columns.map((column) => result[column]))),
  ].join('\n');
  await fs.writeFile(csvPath, `${csv}\n`, 'utf8');

  const overflowResults = results.filter((result) => (
    result.horizontalOverflow || result.error || result.ok === false
  ));
  const overflowCsv = [
    columns.join(','),
    ...overflowResults.map((result) => toCsvRow(columns.map((column) => result[column]))),
  ].join('\n');
  await fs.writeFile(overflowPath, `${overflowCsv}\n`, 'utf8');

  return { jsonPath, csvPath, overflowPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureGitIgnored(DEFAULT_OUTPUT_ROOT);

  let urls = await readUrls(args);
  if (args.limit > 0) urls = urls.slice(0, args.limit);
  if (urls.length === 0) throw new Error('No URLs found to audit.');

  await fs.mkdir(args.outDir, { recursive: true });
  console.log(`Capturing ${urls.length} pages across ${args.viewports.length} viewports.`);
  console.log(`Output: ${args.outDir}`);

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of args.viewports) {
      console.log(`\nViewport ${viewport.name} (${viewport.width}x${viewport.height})`);
      for (const url of urls) {
        process.stdout.write(`  ${url} ... `);
        const result = await capturePage(browser, url, viewport, args);
        results.push(result);
        console.log(result.error ? `ERROR ${result.error}` : 'ok');
      }
    }
  } finally {
    await browser.close();
  }

  const reports = await writeReports(args, results);
  const issueCount = results.filter((result) => (
    result.horizontalOverflow || result.error || result.ok === false
  )).length;

  console.log('\nDone.');
  console.log(`Report: ${reports.csvPath}`);
  console.log(`Overflow/errors: ${reports.overflowPath}`);
  console.log(`JSON: ${reports.jsonPath}`);
  console.log(`Potential issues: ${issueCount}`);

  if (issueCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
