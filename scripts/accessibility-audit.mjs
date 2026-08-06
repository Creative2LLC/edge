#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */
/* eslint-disable no-continue, max-len, object-curly-newline, prefer-template, no-multiple-empty-lines -- CLI records. */

/**
 * Local axe-core audit for WCAG 2.2 Level A + AA.
 *
 * Usage:
 *   npm run audit:accessibility
 *   npm run audit:accessibility -- --limit 5
 *   npm run audit:accessibility -- --only /contact-us
 *   npm run audit:accessibility -- --fail-on serious
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';

const require = createRequire(import.meta.url);
const DEFAULT_BASE = 'https://test--edge--creative2llc.aem.page';
const DEFAULT_URLS_FILE = 'audits/page-list.txt';
const DEFAULT_OUT_DIR = 'audits/accessibility';
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];

function parseArgs(argv) {
  const args = { base: process.env.AUDIT_BASE_URL || DEFAULT_BASE, urlsFile: process.env.AUDIT_URLS_FILE || DEFAULT_URLS_FILE, outDir: DEFAULT_OUT_DIR, limit: 0, only: '', timeout: 45000, waitMs: 600, failOn: 'none' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base' && next) { args.base = next; i += 1; } else if (arg === '--urls' && next) { args.urlsFile = next; i += 1; } else if (arg === '--out' && next) { args.outDir = next; i += 1; } else if (arg === '--limit' && next) { args.limit = Number.parseInt(next, 10) || 0; i += 1; } else if (arg === '--only' && next) { args.only = next; i += 1; } else if (arg === '--timeout' && next) { args.timeout = Number.parseInt(next, 10) || 45000; i += 1; } else if (arg === '--wait' && next) { args.waitMs = Number.parseInt(next, 10) || 0; i += 1; } else if (arg === '--fail-on' && next) { args.failOn = next.toLowerCase(); i += 1; }
  }
  if (args.failOn !== 'none' && !IMPACTS.includes(args.failOn)) throw new Error('Invalid --fail-on. Use none, ' + IMPACTS.join(', ') + '.');
  const base = new URL(args.base);
  args.base = base.protocol + '//' + base.host;
  return args;
}

async function readUrls(args) {
  const content = await fs.readFile(args.urlsFile, 'utf8');
  let urls = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((entry) => new URL(entry, args.base).toString());
  if (args.only) {
    const wanted = new URL(args.only, args.base).pathname.replace(/\/$/, '') || '/';
    urls = urls.filter((url) => (new URL(url).pathname.replace(/\/$/, '') || '/') === wanted);
  }
  urls = [...new Set(urls)];
  return args.limit > 0 ? urls.slice(0, args.limit) : urls;
}

function wcag(tags) {
  return tags.filter((tag) => /^wcag\d{3,4}$/.test(tag));
}

function simplify(item, includeImpact = true) {
  return {
    id: item.id,
    impact: includeImpact ? (item.impact || 'unknown') : 'needs-review',
    help: item.help,
    description: item.description || '',
    helpUrl: item.helpUrl,
    tags: item.tags,
    wcag: wcag(item.tags),
    nodes: item.nodes.map((node) => ({
      impact: node.impact || item.impact || 'unknown',
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary || '',
    })),
  };
}

async function auditPage(browser, url, args, axeSource) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(args.timeout);
    await page.goto(url, { waitUntil: 'load', timeout: args.timeout });
    if (args.waitMs > 0) await page.waitForTimeout(args.waitMs);
    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(async (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), WCAG_AA_TAGS);
    return { url, title: await page.title(), violations: results.violations.map((item) => simplify(item)), incomplete: results.incomplete.map((item) => simplify(item, false)), passes: results.passes.length, error: '' };
  } catch (error) {
    return { url, title: '', violations: [], incomplete: [], passes: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await context.close();
  }
}

function issuesFor(pages) {
  const map = new Map();
  pages.forEach((page) => page.violations.forEach((violation) => {
    if (!map.has(violation.id)) map.set(violation.id, { id: violation.id, impact: violation.impact, help: violation.help, description: violation.description, helpUrl: violation.helpUrl, wcag: violation.wcag, pages: new Set(), nodes: 0, examples: [] });
    const issue = map.get(violation.id);
    issue.pages.add(page.url);
    issue.nodes += violation.nodes.length;
    if (issue.examples.length < 5) violation.nodes.slice(0, 2).forEach((node) => issue.examples.push({ url: page.url, target: node.target, html: node.html }));
  }));
  return [...map.values()].map((issue) => ({ ...issue, pages: [...issue.pages], pageCount: issue.pages.size })).sort((a, b) => IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact) || b.pageCount - a.pageCount || b.nodes - a.nodes);
}

function csvCell(value) {
  return '"' + String(value ?? '').replaceAll('"', '""') + '"';
}

function csv(rows, columns) {
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function reportHtml(metadata, issues, pages) {
  const issueRows = issues.map((issue) => '<tr><td class="' + escapeHtml(issue.impact) + '">' + escapeHtml(issue.impact) + '</td><td><a href="' + escapeHtml(issue.helpUrl) + '">' + escapeHtml(issue.help) + '</a><code>' + escapeHtml(issue.id) + '</code></td><td>' + escapeHtml(issue.wcag.join(', ') || '-') + '</td><td>' + issue.pageCount + '</td><td>' + issue.nodes + '</td><td>' + issue.examples.map((example) => '<div><a href="' + escapeHtml(example.url) + '">' + escapeHtml(new URL(example.url).pathname) + '</a><code>' + escapeHtml(example.target.join(' ')) + '</code></div>').join('') + '</td></tr>').join('\n');
  const pageRows = pages.map((page) => '<tr><td><a href="' + escapeHtml(page.url) + '">' + escapeHtml(new URL(page.url).pathname) + '</a></td><td>' + page.violations.length + '</td><td>' + page.violations.reduce((sum, item) => sum + item.nodes.length, 0) + '</td><td>' + page.incomplete.length + '</td><td>' + escapeHtml(page.error || '-') + '</td></tr>').join('\n');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>WCAG 2.2 AA accessibility audit</title><style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#18212b}table{border-collapse:collapse;width:100%;margin:1rem 0 2rem}th,td{border:1px solid #cbd5df;padding:.55rem;vertical-align:top;text-align:left}th{background:#edf2f7}code{display:block;font:12px ui-monospace,monospace;overflow-wrap:anywhere}.critical{color:#9b1c1c;font-weight:bold}.serious{color:#b45309;font-weight:bold}.moderate{color:#8a5800;font-weight:bold}.minor{color:#285e61;font-weight:bold}a{color:#075985}</style></head><body><h1>WCAG 2.2 Level A + AA accessibility audit</h1><p>Scanned ' + metadata.pagesScanned + ' pages on <a href="' + escapeHtml(metadata.base) + '">' + escapeHtml(metadata.base) + '</a> at ' + escapeHtml(metadata.generatedAt) + '. This is an automated axe-core report; manual accessibility testing is still required.</p><h2>Issues grouped by root cause</h2><p>' + issues.length + ' distinct issue types; ' + metadata.totalViolations + ' issue instances.</p><table><thead><tr><th>Impact</th><th>Issue</th><th>WCAG tag</th><th>Pages</th><th>Nodes</th><th>Examples</th></tr></thead><tbody>' + (issueRows || '<tr><td colspan="6">No automated WCAG A/AA violations found.</td></tr>') + '</tbody></table><h2>Pages</h2><table><thead><tr><th>Page</th><th>Issue types</th><th>Nodes</th><th>Manual review</th><th>Error</th></tr></thead><tbody>' + pageRows + '</tbody></table></body></html>';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urls = await readUrls(args);
  if (!urls.length) throw new Error('No URLs found.');
  const axeSource = await fs.readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  await fs.mkdir(args.outDir, { recursive: true });
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + chrome.port);
  const pages = [];
  console.log('WCAG 2.2 A + AA axe audit - ' + urls.length + ' pages');
  try {
    for (const url of urls) {
      process.stdout.write('- ' + new URL(url).pathname + ' ... ');
      const page = await auditPage(browser, url, args, axeSource);
      pages.push(page);
      const nodes = page.violations.reduce((sum, item) => sum + item.nodes.length, 0);
      console.log(page.error ? 'ERROR ' + page.error : page.violations.length + ' issue types, ' + nodes + ' nodes, ' + page.incomplete.length + ' manual-review items');
    }
  } finally {
    await browser.close();
    await chrome.kill();
  }
  const issues = issuesFor(pages);
  const metadata = { generatedAt: new Date().toISOString(), base: args.base, tags: WCAG_AA_TAGS, pagesScanned: pages.length, pagesWithErrors: pages.filter((page) => page.error).length, totalViolations: pages.reduce((sum, page) => sum + page.violations.reduce((nodeSum, issue) => nodeSum + issue.nodes.length, 0), 0), totalManualReviewItems: pages.reduce((sum, page) => sum + page.incomplete.length, 0) };
  const issueRows = issues.map((issue) => ({ impact: issue.impact, id: issue.id, help: issue.help, wcag: issue.wcag.join(' '), pages: issue.pageCount, nodes: issue.nodes, examples: issue.examples.map((example) => new URL(example.url).pathname + ' :: ' + example.target.join(' ')).join(' | '), helpUrl: issue.helpUrl }));
  const pageRows = pages.map((page) => ({ url: page.url, title: page.title, issueTypes: page.violations.length, nodes: page.violations.reduce((sum, issue) => sum + issue.nodes.length, 0), manualReview: page.incomplete.length, error: page.error }));
  await Promise.all([
    fs.writeFile(path.join(args.outDir, 'summary.json'), JSON.stringify({ metadata, pages }, null, 2) + '\n', 'utf8'),
    fs.writeFile(path.join(args.outDir, 'summary.csv'), csv(pageRows, ['url', 'title', 'issueTypes', 'nodes', 'manualReview', 'error']) + '\n', 'utf8'),
    fs.writeFile(path.join(args.outDir, 'issues.json'), JSON.stringify({ metadata, issues }, null, 2) + '\n', 'utf8'),
    fs.writeFile(path.join(args.outDir, 'issues.csv'), csv(issueRows, ['impact', 'id', 'help', 'wcag', 'pages', 'nodes', 'examples', 'helpUrl']) + '\n', 'utf8'),
    fs.writeFile(path.join(args.outDir, 'report.html'), reportHtml(metadata, issues, pages), 'utf8'),
  ]);
  console.log('\n' + issues.length + ' issue types, ' + metadata.totalViolations + ' issue instances, ' + metadata.totalManualReviewItems + ' manual-review items.');
  console.log('Read the report: ' + path.join(args.outDir, 'report.html'));
  if (args.failOn !== 'none' && issues.some((issue) => IMPACTS.indexOf(issue.impact) <= IMPACTS.indexOf(args.failOn))) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

