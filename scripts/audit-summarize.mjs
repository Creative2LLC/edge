#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI report. */
/* eslint-disable no-continue -- scan control flow. */

/**
 * Aggregates a per-page audit run (audits/pages/) into a prioritized to-do list.
 *
 * EDS pages share blocks, CSS, and head.html, so Lighthouse failures cluster by
 * ROOT CAUSE, not by page. This ranks each failing audit by how many pages it
 * hits — so you fix the shared cause once and lift every page at once.
 *
 * Reads the Lighthouse JSON embedded in each saved lighthouse.html (no re-run).
 *
 * Usage:
 *   npm run audit:summarize
 *   npm run audit:summarize -- --category accessibility
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OUT_ROOT = 'audits/pages';
const CATEGORIES = ['accessibility', 'best-practices', 'performance'];
const CATEGORY_LABEL = {
  accessibility: 'A11y', 'best-practices': 'BP', performance: 'Perf',
};

function parseArgs(argv) {
  const args = { root: OUT_ROOT, onlyCategory: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1]) { args.root = argv[i + 1]; i += 1; } else if (argv[i] === '--category' && argv[i + 1]) { args.onlyCategory = argv[i + 1]; i += 1; }
  }
  return args;
}

function extractLhr(html) {
  // Lighthouse embeds the full report as `window.__LIGHTHOUSE_JSON__ = {...}`.
  const marker = html.indexOf('window.__LIGHTHOUSE_JSON__');
  if (marker === -1) return null;
  const open = html.indexOf('{', marker);
  if (open === -1) return null;

  // Brace-match, respecting string literals and escapes, to find the object end.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function failingAudits(lhr, category) {
  const ref = lhr.categories?.[category];
  if (!ref) return [];
  return ref.auditRefs
    .filter((r) => r.weight > 0)
    .map((r) => ({ ref: r, audit: lhr.audits[r.id] }))
    .filter(({ audit }) => audit && audit.score != null && audit.score < 1)
    .map(({ ref: r, audit }) => ({
      id: audit.id,
      title: audit.title,
      weight: r.weight,
      score: audit.score,
    }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await fs.readdir(args.root, { withFileTypes: true });
  const pageDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

  // audit id -> { title, category, pages:Set, weight }
  const issues = new Map();
  const overflow = [];
  let parsed = 0;

  for (const dir of pageDirs) {
    const base = path.join(args.root, dir.name);

    // Overflow (from the per-page summary.json we already wrote).
    try {
      const summary = JSON.parse(await fs.readFile(path.join(base, 'summary.json'), 'utf8'));
      if (summary.overflowPass === false) {
        const bad = (summary.overflow || [])
          .filter((o) => (o.overflowPx ?? 0) > 3)
          .map((o) => `${o.viewport}:${o.overflowPx}px`);
        overflow.push({ page: dir.name, max: summary.maxOverflowPx, viewports: bad });
      }
    } catch { /* no summary */ }

    // Lighthouse issues (from embedded JSON in lighthouse.html).
    let html;
    try {
      html = await fs.readFile(path.join(base, 'lighthouse.html'), 'utf8');
    } catch { continue; }
    const lhr = extractLhr(html);
    if (!lhr) continue;
    parsed += 1;

    for (const category of CATEGORIES) {
      if (args.onlyCategory && category !== args.onlyCategory) continue;
      for (const a of failingAudits(lhr, category)) {
        const key = `${category}::${a.id}`;
        if (!issues.has(key)) {
          issues.set(key, {
            id: a.id, title: a.title, category, weight: a.weight, pages: new Set(),
          });
        }
        issues.get(key).pages.add(dir.name);
      }
    }
  }

  const ranked = [...issues.values()]
    .map((it) => ({ ...it, count: it.pages.size }))
    .sort((a, b) => b.count - a.count || b.weight - a.weight);

  console.log(`\nParsed ${parsed} Lighthouse reports across ${pageDirs.length} pages.\n`);
  console.log('TOP LIGHTHOUSE ISSUES (ranked by pages affected — fix the shared cause once):');
  console.log('-'.repeat(78));
  console.log(`${'pages'.padStart(5)}  ${'cat'.padEnd(5)} ${'wt'.padStart(3)}  audit`);
  console.log('-'.repeat(78));
  for (const it of ranked) {
    console.log(`${String(it.count).padStart(5)}  ${CATEGORY_LABEL[it.category].padEnd(5)} ${String(it.weight).padStart(3)}  ${it.id} — ${it.title}`);
  }

  overflow.sort((a, b) => (b.max ?? 0) - (a.max ?? 0));
  console.log('\n\nHORIZONTAL OVERFLOW (styles — worst first; each is a specific block/breakpoint):');
  console.log('-'.repeat(78));
  for (const o of overflow) {
    console.log(`${String(o.max).padStart(5)}px  ${o.page}  [${o.viewports.join(', ')}]`);
  }
  console.log(`\n${overflow.length} pages overflow; ${ranked.length} distinct Lighthouse issues.`);

  // Machine-readable rollup.
  const rows = ranked.map((it) => ({
    category: it.category, audit: it.id, title: it.title, weight: it.weight, pages: it.count, examples: [...it.pages].slice(0, 5).join(' '),
  }));
  await fs.writeFile(path.join(args.root, 'issues.json'), `${JSON.stringify({ issues: rows, overflow }, null, 2)}\n`, 'utf8');
  const csv = ['category,audit,title,weight,pages,examples',
    ...rows.map((r) => `"${r.category}","${r.audit}","${r.title.replaceAll('"', '""')}",${r.weight},${r.pages},"${r.examples}"`)].join('\n');
  await fs.writeFile(path.join(args.root, 'issues.csv'), `${csv}\n`, 'utf8');
  console.log(`\nWrote ${path.join(args.root, 'issues.csv')} and issues.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
