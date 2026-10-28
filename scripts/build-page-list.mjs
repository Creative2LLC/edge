#!/usr/bin/env node

/* eslint-disable no-console -- CLI progress output. */

/**
 * Local sitemap / page-list generator.
 *
 * Adobe's code-sync + sitemap pipeline is jammed, so /sitemap.xml is stale and
 * /sitemap.json does not exist yet. The live query-index.json IS current, so we
 * build the page list from it directly and apply the same exclusions that the
 * `sitemap` index in helix-query.yaml will use once the pipeline recovers.
 *
 * Outputs:
 *   audits/page-list.txt  newline-delimited paths (feed to responsive audit via --urls)
 *   audits/sitemap.xml    a real sitemap.xml with the correct origin
 *
 * Usage:
 *   node scripts/build-page-list.mjs
 *   node scripts/build-page-list.mjs --base https://test--edge--creative2llc.aem.live
 *   npm run audit:responsive -- --urls audits/page-list.txt
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASE = 'https://test--edge--creative2llc.aem.page';
const OUT_DIR = 'audits';

// Mirrors the `sitemap` index exclusions in helix-query.yaml.
const EXCLUDE_EXACT = new Set(['/nav', '/footer', '/form-testing-page']);
const EXCLUDE_PREFIX = [
  '/fragments/',
  '/templates/',
  '/drafts/',
  '/tools/',
  '/for-ncmec-test-pages/',
];

function parseArgs(argv) {
  const args = { base: DEFAULT_BASE };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base' && argv[i + 1]) {
      args.base = argv[i + 1];
      i += 1;
    }
  }
  const url = new URL(args.base);
  args.base = `${url.protocol}//${url.host}`;
  return args;
}

function isExcluded(row) {
  const p = row.path;
  if (!p || !p.startsWith('/')) return true;
  if (EXCLUDE_EXACT.has(p)) return true;
  if (EXCLUDE_PREFIX.some((prefix) => p.startsWith(prefix))) return true;
  if (/\.json$/i.test(p)) return true;
  if ((row.robots || '').toLowerCase().includes('noindex')) return true;
  return false;
}

function toIsoDate(row) {
  const secs = Number(row.lastModified);
  if (!Number.isFinite(secs) || secs <= 0) return '';
  return new Date(secs * 1000).toISOString().slice(0, 10);
}

function buildSitemapXml(base, rows) {
  const urls = rows.map((row) => {
    const loc = new URL(row.path, base).toString();
    const date = toIsoDate(row);
    const lastmod = date ? `\n    <lastmod>${date}</lastmod>` : '';
    return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const indexUrl = new URL('/query-index.json?limit=1000', args.base).toString();

  console.log(`Fetching index: ${indexUrl}`);
  const response = await fetch(indexUrl);
  if (!response.ok) throw new Error(`query-index.json failed: ${response.status}`);
  const index = await response.json();

  const included = (index.data || [])
    .filter((row) => !isExcluded(row))
    .sort((a, b) => a.path.localeCompare(b.path));

  const excludedCount = (index.data || []).length - included.length;

  await fs.mkdir(OUT_DIR, { recursive: true });

  const listPath = path.join(OUT_DIR, 'page-list.txt');
  const listBody = [
    `# Generated from ${indexUrl}`,
    `# ${new Date().toISOString()} — ${included.length} pages`,
    '',
    ...included.map((row) => row.path),
    '',
  ].join('\n');
  await fs.writeFile(listPath, listBody, 'utf8');

  const xmlPath = path.join(OUT_DIR, 'sitemap.xml');
  await fs.writeFile(xmlPath, buildSitemapXml(args.base, included), 'utf8');

  console.log(`Total in index: ${(index.data || []).length}`);
  console.log(`Included:       ${included.length}`);
  console.log(`Excluded:       ${excludedCount}`);
  console.log(`Wrote ${listPath}`);
  console.log(`Wrote ${xmlPath}`);
  console.log('');
  console.log('Run the audit against the list:');
  console.log('  npm run audit:responsive -- --urls audits/page-list.txt');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
