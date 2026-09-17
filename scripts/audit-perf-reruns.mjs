#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */

/**
 * Lighthouse Performance swings several points run to run. For every page in an
 * audit:pages run whose Performance is below the goal, run Performance again
 * (sequentially - parallel runs skew CPU timing) and record all scores so
 * audit-compare.mjs can use the median.
 *
 * Writes <root>/perf-reruns.json: { "<page>": [firstRun, rerun, rerun, ...] }
 *
 * Usage:
 *   node scripts/audit-perf-reruns.mjs --root audits/report-2026-09-17/lighthouse
 *   node scripts/audit-perf-reruns.mjs --root <dir> --goal 95 --extra 2
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

function parseArgs(argv) {
  const args = { root: '', goal: 95, extra: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (argv[i] === '--root' && next) { args.root = next; i += 1; } else if (argv[i] === '--goal' && next) { args.goal = Number.parseInt(next, 10) || 95; i += 1; } else if (argv[i] === '--extra' && next) { args.extra = Number.parseInt(next, 10) || 2; i += 1; }
  }
  if (!args.root) throw new Error('--root <audit:pages output dir> is required');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await fs.readdir(args.root, { withFileTypes: true });
  const targets = [];
  for (const dir of entries.filter((e) => e.isDirectory())) {
    try {
      const summary = JSON.parse(await fs.readFile(path.join(args.root, dir.name, 'summary.json'), 'utf8'));
      const perf = summary.scores?.performance;
      if (perf != null && perf < args.goal) {
        targets.push({ page: dir.name, url: summary.url, first: perf });
      }
    } catch { /* no summary */ }
  }

  const outFile = path.join(args.root, 'perf-reruns.json');
  const results = existsSync(outFile) ? JSON.parse(await fs.readFile(outFile, 'utf8')) : {};
  console.log(`${targets.length} pages below Perf ${args.goal}; ${args.extra} extra runs each\n`);

  const chromePath = chromium.executablePath();
  const chrome = await chromeLauncher.launch({
    chromePath: existsSync(chromePath) ? chromePath : undefined,
    userDataDir: false,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    // Resumable: pages that already have every run recorded are skipped.
    const pending = targets.filter((t) => !(results[t.page]?.length >= args.extra + 1));
    for (const t of pending) {
      const runs = [t.first];
      for (let i = 0; i < args.extra; i += 1) {
        try {
          const { lhr } = await lighthouse(t.url, {
            port: chrome.port, onlyCategories: ['performance'], logLevel: 'error', maxWaitForLoad: 45000,
          });
          const score = lhr.categories.performance?.score;
          if (score != null) runs.push(Math.round(score * 100));
        } catch (error) {
          console.log(`  ${t.page} run failed: ${error instanceof Error ? error.message : error}`);
        }
      }
      results[t.page] = runs;
      console.log(`- ${t.page}: ${runs.join(' / ')}`);
      await fs.writeFile(outFile, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    }
  } finally {
    await chrome.kill();
  }
  console.log(`\nWrote ${outFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
