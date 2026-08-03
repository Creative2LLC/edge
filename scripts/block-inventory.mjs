#!/usr/bin/env node

/* eslint-disable no-console, no-use-before-define -- CLI audit progress output. */
/* eslint-disable no-await-in-loop, no-restricted-syntax -- Sequential scan is intentional. */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const DEFAULT_BASE = 'https://test--edge--creative2llc.aem.page';
const DEFAULT_OUT_DIR = 'audits/block-inventory';
const BLOCKS_DIR = 'blocks';

const PUBLIC_EXCLUDE_EXACT = new Set(['/nav', '/footer', '/form-testing-page']);
const PUBLIC_EXCLUDE_PREFIX = [
  '/fragments/',
  '/templates/',
  '/drafts/',
  '/tools/',
  '/for-ncmec-test-pages/',
];
const SKIP_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|svg|pdf|zip|mp4|mov|css|js|ico|xml|json)$/i;

function parseArgs(argv) {
  const args = {
    base: process.env.AUDIT_BASE_URL || DEFAULT_BASE,
    urlsFile: process.env.AUDIT_URLS_FILE || '',
    outDir: process.env.AUDIT_BLOCKS_OUT || DEFAULT_OUT_DIR,
    limit: 0,
    only: '',
    timeout: 45000,
    waitMs: 600,
    publicOnly: false,
    discoverLinks: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base' && next) {
      args.base = next;
      i += 1;
    } else if (arg === '--urls' && next) {
      args.urlsFile = next;
      i += 1;
    } else if (arg === '--out' && next) {
      args.outDir = next;
      i += 1;
    } else if (arg === '--limit' && next) {
      args.limit = Number.parseInt(next, 10) || 0;
      i += 1;
    } else if (arg === '--only' && next) {
      args.only = next;
      i += 1;
    } else if (arg === '--timeout' && next) {
      args.timeout = Number.parseInt(next, 10) || 45000;
      i += 1;
    } else if (arg === '--wait' && next) {
      args.waitMs = Number.parseInt(next, 10) || 0;
      i += 1;
    } else if (arg === '--public-only') {
      args.publicOnly = true;
    } else if (arg === '--discover-links') {
      args.discoverLinks = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  const url = new URL(args.base);
  args.base = `${url.protocol}//${url.host}`;
  return args;
}

function printHelp() {
  console.log(`Block inventory audit

Usage:
  npm run audit:blocks -- [options]

Options:
  --base <url>        Site origin. Default: ${DEFAULT_BASE}
  --urls <file>       Newline-delimited URL/path file. If omitted, uses /query-index.json.
  --out <dir>         Output directory. Default: ${DEFAULT_OUT_DIR}
  --limit <number>    Scan only the first N pages. With --discover-links, caps total pages.
  --only <path>       Scan one path from the URL source.
  --timeout <ms>      Per-page timeout. Default: 45000
  --wait <ms>         Extra wait after page load. Default: 600
  --public-only       Apply public sitemap exclusions: templates, fragments, nav, footer, etc.
  --discover-links    Add same-origin links found while rendering pages.

Outputs:
  active-blocks.csv
  inactive-blocks.csv
  unknown-rendered-blocks.csv
  block-usage-by-page.csv
  scanned-pages.csv
  summary.json
`);
}

function normalizePageUrl(value, base) {
  const url = new URL(value, base);
  url.hash = '';
  if (url.origin !== base) return '';
  if (SKIP_EXTENSIONS.test(url.pathname)) return '';
  return url.toString();
}

function shouldPublicExclude(pageUrl) {
  const p = new URL(pageUrl).pathname;
  if (!p || !p.startsWith('/')) return true;
  if (PUBLIC_EXCLUDE_EXACT.has(p)) return true;
  if (PUBLIC_EXCLUDE_PREFIX.some((prefix) => p.startsWith(prefix))) return true;
  return false;
}

function filterOnly(urls, only, base) {
  const wanted = new URL(only, base).pathname.replace(/\/$/, '') || '/';
  return urls.filter((url) => {
    const pathname = new URL(url).pathname.replace(/\/$/, '') || '/';
    return pathname === wanted;
  });
}

function uniqueSorted(urls) {
  return [...new Set(urls)].sort((a, b) => a.localeCompare(b));
}

async function readLocalBlockNames() {
  const entries = await fs.readdir(BLOCKS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function readUrlsFile(args) {
  const content = await fs.readFile(args.urlsFile, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((entry) => normalizePageUrl(entry, args.base))
    .filter(Boolean);
}

async function readQueryIndex(args) {
  const indexUrl = new URL('/query-index.json?limit=5000', args.base).toString();
  console.log(`Fetching index: ${indexUrl}`);
  const response = await fetch(indexUrl);
  if (!response.ok) throw new Error(`query-index.json failed: ${response.status}`);
  const index = await response.json();
  return (index.data || [])
    .map((row) => row.path || row.url || row.loc || '')
    .map((entry) => normalizePageUrl(entry, args.base))
    .filter(Boolean);
}

async function readInitialUrls(args) {
  let urls = args.urlsFile ? await readUrlsFile(args) : await readQueryIndex(args);
  urls = args.publicOnly ? urls.filter((url) => !shouldPublicExclude(url)) : urls;
  urls = args.only ? filterOnly(urls, args.only, args.base) : urls;
  urls = uniqueSorted(urls);
  return args.limit > 0 && !args.discoverLinks ? urls.slice(0, args.limit) : urls;
}

async function launchBrowser() {
  const attempts = [
    { label: 'Playwright Chromium', options: {} },
    { label: 'installed Chrome', options: { channel: 'chrome' } },
    { label: 'installed Edge', options: { channel: 'msedge' } },
  ];
  let lastError;

  for (const attempt of attempts) {
    try {
      return await chromium.launch(attempt.options);
    } catch (error) {
      lastError = error;
      console.log(`Could not launch ${attempt.label}; trying next browser.`);
    }
  }

  throw lastError;
}

async function scanPage(browser, url, args) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(args.timeout);
  page.setDefaultNavigationTimeout(args.timeout);

  try {
    const response = await page.goto(url, {
      waitUntil: 'load',
      timeout: args.timeout,
    });
    if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);

    const details = await page.evaluate(() => {
      const names = new Set();

      document.querySelectorAll('[data-block-name]').forEach((element) => {
        const name = element.getAttribute('data-block-name');
        if (name) names.add(name.trim());
      });

      document.querySelectorAll('.block').forEach((element) => {
        const classes = [...element.classList];
        const blockIndex = classes.indexOf('block');
        if (blockIndex > 0) names.add(classes[blockIndex - 1]);
      });

      const links = [...document.querySelectorAll('a[href]')]
        .map((link) => link.href)
        .filter(Boolean);

      return {
        blocks: [...names].filter(Boolean).sort((a, b) => a.localeCompare(b)),
        links,
      };
    });

    return {
      url,
      status: response?.status() || 0,
      ok: response?.ok() ?? false,
      blocks: details.blocks,
      links: details.links,
      error: response?.ok() ? '' : `HTTP ${response?.status() || 0}`,
    };
  } finally {
    await context.close();
  }
}

function csvRow(values) {
  return values.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
}

async function writeCsv(filePath, columns, rows) {
  const body = [
    columns.join(','),
    ...rows.map((row) => csvRow(columns.map((column) => row[column]))),
    '',
  ].join('\n');
  await fs.writeFile(filePath, body, 'utf8');
}

async function writeReports(args, localBlocks, pageResults) {
  await fs.mkdir(args.outDir, { recursive: true });

  const usage = new Map();
  pageResults.forEach((page) => {
    page.blocks.forEach((block) => {
      const current = usage.get(block) || { block, count: 0, pages: [] };
      current.count += 1;
      current.pages.push(new URL(page.url).pathname);
      usage.set(block, current);
    });
  });

  const localBlockSet = new Set(localBlocks);
  const active = [...usage.values()]
    .filter((row) => localBlockSet.has(row.block))
    .sort((a, b) => a.block.localeCompare(b.block));
  const activeSet = new Set(active.map((row) => row.block));
  const inactive = localBlocks
    .filter((block) => !activeSet.has(block))
    .map((block) => ({ block }))
    .sort((a, b) => a.block.localeCompare(b.block));
  const unknown = [...usage.values()]
    .filter((row) => !localBlockSet.has(row.block))
    .sort((a, b) => a.block.localeCompare(b.block));

  const usageRows = pageResults.flatMap((page) => (
    page.blocks.map((block) => ({
      page: new URL(page.url).pathname,
      block,
      status: page.status,
    }))
  ));
  const scannedRows = pageResults.map((page) => ({
    page: new URL(page.url).pathname,
    status: page.status,
    ok: page.ok,
    blockCount: page.blocks.length,
    blocks: page.blocks.join(' | '),
    error: page.error,
  }));

  await writeCsv(
    path.join(args.outDir, 'active-blocks.csv'),
    ['block', 'count', 'pages'],
    active.map((row) => ({ ...row, pages: row.pages.join(' | ') })),
  );
  await writeCsv(path.join(args.outDir, 'inactive-blocks.csv'), ['block'], inactive);
  await writeCsv(
    path.join(args.outDir, 'unknown-rendered-blocks.csv'),
    ['block', 'count', 'pages'],
    unknown.map((row) => ({ ...row, pages: row.pages.join(' | ') })),
  );
  await writeCsv(
    path.join(args.outDir, 'block-usage-by-page.csv'),
    ['page', 'block', 'status'],
    usageRows,
  );
  await writeCsv(
    path.join(args.outDir, 'scanned-pages.csv'),
    ['page', 'status', 'ok', 'blockCount', 'blocks', 'error'],
    scannedRows,
  );

  const summary = {
    base: args.base,
    source: args.urlsFile || '/query-index.json',
    publicOnly: args.publicOnly,
    discoverLinks: args.discoverLinks,
    scannedPages: pageResults.length,
    failedPages: pageResults.filter((page) => !page.ok).length,
    localBlockCount: localBlocks.length,
    activeBlockCount: active.length,
    inactiveBlockCount: inactive.length,
    unknownRenderedBlockCount: unknown.length,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(args.outDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localBlocks = await readLocalBlockNames();
  const initialUrls = await readInitialUrls(args);

  if (initialUrls.length === 0) throw new Error('No URLs found to scan.');

  const seen = new Set();
  const queue = [...initialUrls];
  const pageResults = [];
  const browser = await launchBrowser();

  console.log(`Scanning ${queue.length} initial pages for block usage.`);

  try {
    for (let index = 0; index < queue.length; index += 1) {
      if (args.limit > 0 && pageResults.length >= args.limit) break;
      const url = queue[index];
      if (!seen.has(url)) {
        seen.add(url);

        process.stdout.write(`${url} ... `);
        try {
          const result = await scanPage(browser, url, args);
          pageResults.push(result);
          console.log(result.ok ? `${result.blocks.length} blocks` : result.error);

          if (args.discoverLinks && result.ok) {
            result.links
              .map((entry) => normalizePageUrl(entry, args.base))
              .filter(Boolean)
              .filter((entry) => !args.publicOnly || !shouldPublicExclude(entry))
              .forEach((entry) => {
                if (!seen.has(entry) && !queue.includes(entry)) queue.push(entry);
              });
          }
        } catch (error) {
          pageResults.push({
            url,
            status: 0,
            ok: false,
            blocks: [],
            links: [],
            error: error instanceof Error ? error.message : String(error),
          });
          console.log('ERROR');
        }
      }
    }
  } finally {
    await browser.close();
  }

  const summary = await writeReports(args, localBlocks, pageResults);
  console.log('');
  console.log(`Active blocks: ${summary.activeBlockCount}`);
  console.log(`Inactive blocks: ${summary.inactiveBlockCount}`);
  console.log(`Unknown rendered blocks: ${summary.unknownRenderedBlockCount}`);
  console.log(`Output: ${args.outDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
