#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI report. */
/* eslint-disable no-continue, max-len -- report assembly. */

/**
 * Compares a new audit run against a previous one and writes COMPARISON.md +
 * comparison.csv into the new run's folder.
 *
 * Reads what the audit scripts already saved (no re-run):
 *   Lighthouse: <root>/<page>/summary.json + lighthouse.html (npm run audit:pages)
 *   axe:        summary.json                                  (npm run audit:accessibility)
 *
 * Performance is the noisiest Lighthouse score, so if <new>/lighthouse/perf-reruns.json
 * exists ({ "<page>": [score, score, ...] }, first run included) the median is used.
 *
 * Usage:
 *   node scripts/audit-compare.mjs --new audits/report-2026-09-17
 *   node scripts/audit-compare.mjs --new <dir> --old-lh audits/pages \
 *     --old-axe audits/accessibility-rerun/summary.json --goal 95
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';

const GOAL_CATEGORIES = ['performance', 'accessibility', 'best-practices'];
const LABEL = {
  performance: 'Perf', accessibility: 'A11y', 'best-practices': 'BP', seo: 'SEO',
};
const METRICS = {
  lcp: 'largest-contentful-paint',
  fcp: 'first-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  si: 'speed-index',
};

function parseArgs(argv) {
  const args = {
    newDir: '', oldLh: 'audits/pages', oldAxe: 'audits/accessibility-rerun/summary.json', goal: 95,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (argv[i] === '--new' && next) { args.newDir = next; i += 1; } else if (argv[i] === '--old-lh' && next) { args.oldLh = next; i += 1; } else if (argv[i] === '--old-axe' && next) { args.oldAxe = next; i += 1; } else if (argv[i] === '--goal' && next) { args.goal = Number.parseInt(next, 10) || 95; i += 1; }
  }
  if (!args.newDir) throw new Error('--new <report dir> is required');
  return args;
}

function slugForUrl(url) {
  const clean = new URL(url).pathname
    .replace(/\/$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
    .toLowerCase();
  return clean || 'home';
}

// Same brace-matching extractor as audit-summarize.mjs.
function extractLhr(html) {
  const marker = html.indexOf('window.__LIGHTHOUSE_JSON__');
  if (marker === -1) return null;
  const open = html.indexOf('{', marker);
  if (open === -1) return null;
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
    .map((r) => lhr.audits[r.id])
    .filter((audit) => audit && audit.score != null && audit.score < 1)
    .map((audit) => ({ category, id: audit.id, title: audit.title }));
}

async function loadLighthouse(root) {
  const pages = new Map();
  if (!existsSync(root)) return pages;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const dir of entries.filter((e) => e.isDirectory())) {
    const base = path.join(root, dir.name);
    let summary;
    try {
      summary = JSON.parse(await fs.readFile(path.join(base, 'summary.json'), 'utf8'));
    } catch { continue; }
    const record = {
      page: dir.name, url: summary.url, scores: summary.scores || {}, error: summary.error || '', metrics: {}, failing: [],
    };
    try {
      const lhr = extractLhr(await fs.readFile(path.join(base, 'lighthouse.html'), 'utf8'));
      if (lhr) {
        Object.entries(METRICS).forEach(([key, id]) => { record.metrics[key] = lhr.audits[id]?.numericValue ?? null; });
        record.failing = ['accessibility', 'best-practices'].flatMap((c) => failingAudits(lhr, c));
      }
    } catch { /* no report */ }
    pages.set(dir.name, record);
  }
  return pages;
}

async function loadAxe(file) {
  const pages = new Map();
  if (!existsSync(file)) return { pages, metadata: null };
  const summary = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const page of summary.pages || []) {
    const rules = page.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
    }));
    pages.set(slugForUrl(page.url), {
      rules, nodes: rules.reduce((sum, r) => sum + r.nodes, 0), error: page.error,
    });
  }
  return { pages, metadata: summary.metadata };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const avg = (values) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null);
const fmtMs = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)}s`);

function delta(before, after) {
  if (after == null) return 'n/a';
  if (before == null) return String(after);
  const d = after - before;
  const sign = d > 0 ? '+' : '';
  return d === 0 ? `${before} → ${after}` : `${before} → ${after} (${sign}${d})`;
}

function pathFor(record) {
  return record?.url ? new URL(record.url).pathname : '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const newLhRoot = path.join(args.newDir, 'lighthouse');
  const [oldLh, newLh, oldAxe, newAxe] = await Promise.all([
    loadLighthouse(args.oldLh),
    loadLighthouse(newLhRoot),
    loadAxe(args.oldAxe),
    loadAxe(path.join(args.newDir, 'accessibility', 'summary.json')),
  ]);

  const rerunsFile = path.join(newLhRoot, 'perf-reruns.json');
  const reruns = existsSync(rerunsFile) ? JSON.parse(await fs.readFile(rerunsFile, 'utf8')) : {};
  for (const [page, runs] of Object.entries(reruns)) {
    const record = newLh.get(page);
    if (record && runs.length) {
      record.perfRuns = runs;
      record.scores.performanceSingle = record.scores.performance;
      record.scores.performance = median(runs);
    }
  }

  const meetsGoal = (r) => r && GOAL_CATEGORIES.every((c) => (r.scores[c] ?? 0) >= args.goal);
  const common = [...newLh.keys()].filter((p) => oldLh.has(p)).sort((a, b) => pathFor(newLh.get(a)).localeCompare(pathFor(newLh.get(b))));
  const added = [...newLh.keys()].filter((p) => !oldLh.has(p)).sort();
  const removed = [...oldLh.keys()].filter((p) => !newLh.has(p)).sort();
  const allNew = [...newLh.values()];

  const md = [];
  const firstUrl = allNew[0]?.url;
  md.push('# Site audit comparison', '');
  md.push(`**This run:** ${path.basename(args.newDir)} · ${newLh.size} pages · ${firstUrl ? new URL(firstUrl).host : ''}`);
  md.push(`**Compared with:** \`${args.oldLh}\` (Lighthouse, ${oldLh.size} pages) + \`${args.oldAxe}\` (axe${oldAxe.metadata ? `, ${oldAxe.metadata.generatedAt.slice(0, 10)}` : ''})`);
  md.push('');
  md.push(`**Goal:** Performance, Accessibility and Best Practices all ≥ ${args.goal}. SEO is listed but not part of the goal — the preview host blocks indexing (robots.txt), so it will stay low until there is a real domain.`);
  md.push('');
  md.push('Lighthouse runs in mobile mode (emulated Moto G Power, throttled network and CPU), same as the last report. Accessibility has two sources: the Lighthouse A11y score, and a full axe-core WCAG 2.2 A + AA scan.');
  if (Object.keys(reruns).length) {
    md.push('');
    md.push(`Performance scores swing a few points between runs. Every page that scored below ${args.goal} was run 3 times and the **median** is used; the individual runs are in the fix list below.`);
  }
  md.push('');

  // Headline.
  md.push('## Headline', '');
  md.push(`Averages across the **${common.length} pages in both runs** (new and removed pages are excluded so the numbers are like-for-like).`, '');
  md.push(`| Category | Before avg | After avg | Pages ≥ ${args.goal} before | Pages ≥ ${args.goal} after |`);
  md.push('|---|---|---|---|---|');
  for (const c of [...GOAL_CATEGORIES, 'seo']) {
    const before = common.map((p) => oldLh.get(p).scores[c]).filter((v) => v != null);
    const after = common.map((p) => newLh.get(p).scores[c]).filter((v) => v != null);
    const label = c === 'seo' ? 'SEO (not in goal)' : LABEL[c];
    md.push(`| ${label} | ${avg(before) ?? '-'} | ${avg(after) ?? '-'} | ${before.filter((v) => v >= args.goal).length}/${common.length} | ${after.filter((v) => v >= args.goal).length}/${common.length} |`);
  }
  md.push('');
  const goalBefore = common.filter((p) => meetsGoal(oldLh.get(p))).length;
  const goalAfter = common.filter((p) => meetsGoal(newLh.get(p))).length;
  const goalAll = allNew.filter(meetsGoal).length;
  md.push(`**Pages meeting the goal (all three ≥ ${args.goal}):** ${goalBefore}/${common.length} before → **${goalAfter}/${common.length} after**. Including new pages: **${goalAll}/${newLh.size}**.`, '');

  if (oldAxe.metadata || newAxe.metadata) {
    const axeLine = (axe) => {
      if (!axe.metadata) return 'not run';
      const types = new Set([...axe.pages.values()].flatMap((p) => p.rules.map((r) => r.id)));
      const pagesHit = [...axe.pages.values()].filter((p) => p.nodes > 0).length;
      return `${types.size} rule${types.size === 1 ? '' : 's'} failing · ${pagesHit}/${axe.pages.size} pages affected · ${axe.metadata.totalViolations} elements`;
    };
    md.push('**axe WCAG 2.2 AA violations:**', '');
    md.push(`- Before: ${axeLine(oldAxe)}`);
    md.push(`- After: ${axeLine(newAxe)}`, '');
  }

  // Fix list.
  const failing = allNew.filter((r) => !meetsGoal(r))
    .sort((a, b) => Math.min(...GOAL_CATEGORIES.map((c) => a.scores[c] ?? 0)) - Math.min(...GOAL_CATEGORIES.map((c) => b.scores[c] ?? 0)));
  md.push(`## Pages below ${args.goal} (${failing.length})`, '');
  if (!failing.length) {
    md.push('Every page meets the goal.', '');
  } else {
    md.push('Worst first. "Why" lists the failing Lighthouse accessibility/best-practice checks; for performance it shows all run scores plus the load metrics from the first run (targets for a 95+ score: LCP ≤ 2.5s, TBT ≤ 200ms, CLS ≤ 0.1).', '');
    md.push('| Page | Perf | A11y | BP | Why |');
    md.push('|---|---|---|---|---|');
    for (const r of failing) {
      const why = [];
      if ((r.scores.performance ?? 0) < args.goal) {
        // Metrics come from the saved report (first run); only the score is a median.
        why.push(`${r.perfRuns ? `runs ${r.perfRuns.join('/')} · 1st run: ` : ''}LCP ${fmtMs(r.metrics.lcp)}, TBT ${Math.round(r.metrics.tbt ?? 0)}ms, CLS ${(r.metrics.cls ?? 0).toFixed(2)}`);
      }
      r.failing.forEach((f) => why.push(`${LABEL[f.category]}: \`${f.id}\``));
      if (r.error) why.push(`error: ${r.error}`);
      md.push(`| ${pathFor(r)} | ${r.scores.performance ?? '-'} | ${r.scores.accessibility ?? '-'} | ${r.scores['best-practices'] ?? '-'} | ${why.join('<br>')} |`);
    }
    md.push('');
  }

  // Recurring Lighthouse checks.
  const countChecks = (map, pages) => {
    const counts = new Map();
    pages.forEach((p) => (map.get(p)?.failing || []).forEach((f) => {
      const key = `${f.category}::${f.id}`;
      if (!counts.has(key)) counts.set(key, { ...f, pages: 0 });
      counts.get(key).pages += 1;
    }));
    return counts;
  };
  const checksBefore = countChecks(oldLh, [...oldLh.keys()]);
  const checksAfter = countChecks(newLh, [...newLh.keys()]);
  const checkKeys = [...new Set([...checksBefore.keys(), ...checksAfter.keys()])]
    .sort((a, b) => (checksAfter.get(b)?.pages ?? 0) - (checksAfter.get(a)?.pages ?? 0) || (checksBefore.get(b)?.pages ?? 0) - (checksBefore.get(a)?.pages ?? 0));
  md.push('## Lighthouse accessibility & best-practice checks', '');
  md.push(`Pages failing each check. Before = ${oldLh.size} pages, after = ${newLh.size} pages.`, '');
  md.push('| Check | Category | Pages before | Pages after |');
  md.push('|---|---|---|---|');
  checkKeys.forEach((key) => {
    const info = checksAfter.get(key) || checksBefore.get(key);
    md.push(`| \`${info.id}\` — ${info.title.replaceAll('|', '\\|')} | ${LABEL[info.category]} | ${checksBefore.get(key)?.pages ?? 0} | ${checksAfter.get(key)?.pages ?? 0} |`);
  });
  if (!checkKeys.length) md.push('| none failing | | | |');
  md.push('');

  // Performance metrics.
  // Raw mean: avg() rounds to one decimal, which would flatten CLS (0.0-1.0) to 0.1 steps.
  const metricAvg = (map, pages, key) => {
    const values = pages.map((p) => map.get(p)?.metrics[key]).filter((v) => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  md.push('## Load metrics (averages, pages in both runs)', '');
  md.push('| Metric | Before | After | 95+ target |');
  md.push('|---|---|---|---|');
  md.push(`| Largest Contentful Paint | ${fmtMs(metricAvg(oldLh, common, 'lcp'))} | ${fmtMs(metricAvg(newLh, common, 'lcp'))} | ≤ 2.5s |`);
  md.push(`| First Contentful Paint | ${fmtMs(metricAvg(oldLh, common, 'fcp'))} | ${fmtMs(metricAvg(newLh, common, 'fcp'))} | ≤ 1.8s |`);
  md.push(`| Speed Index | ${fmtMs(metricAvg(oldLh, common, 'si'))} | ${fmtMs(metricAvg(newLh, common, 'si'))} | ≤ 3.4s |`);
  md.push(`| Total Blocking Time | ${Math.round(metricAvg(oldLh, common, 'tbt') ?? 0)}ms | ${Math.round(metricAvg(newLh, common, 'tbt') ?? 0)}ms | ≤ 200ms |`);
  md.push(`| Cumulative Layout Shift | ${(metricAvg(oldLh, common, 'cls') ?? 0).toFixed(3)} | ${(metricAvg(newLh, common, 'cls') ?? 0).toFixed(3)} | ≤ 0.1 |`);
  md.push('');

  // axe rules.
  if (oldAxe.metadata || newAxe.metadata) {
    const ruleTotals = (axe) => {
      const totals = new Map();
      axe.pages.forEach((p) => p.rules.forEach((r) => {
        if (!totals.has(r.id)) totals.set(r.id, { ...r, pages: 0, nodes: 0 });
        const t = totals.get(r.id);
        t.pages += 1;
        t.nodes += r.nodes;
      }));
      return totals;
    };
    const rb = ruleTotals(oldAxe);
    const ra = ruleTotals(newAxe);
    const ids = [...new Set([...rb.keys(), ...ra.keys()])].sort((a, b) => (ra.get(b)?.nodes ?? 0) - (ra.get(a)?.nodes ?? 0));
    md.push('## axe WCAG 2.2 AA violations', '');
    md.push('| Rule | Impact | Before (pages / elements) | After (pages / elements) |');
    md.push('|---|---|---|---|');
    ids.forEach((id) => {
      const info = ra.get(id) || rb.get(id);
      md.push(`| \`${id}\` — ${info.help} | ${info.impact} | ${rb.get(id)?.pages ?? 0} / ${rb.get(id)?.nodes ?? 0} | ${ra.get(id)?.pages ?? 0} / ${ra.get(id)?.nodes ?? 0} |`);
    });
    if (!ids.length) md.push('| none | | | |');
    md.push('', 'Element-level detail: `accessibility/report.html`; colour-contrast examples with swatches: `accessibility/contrast-examples.html`.', '');
  }

  // Every page.
  md.push(`## Every page, before → after (${common.length})`, '');
  md.push('| Page | Perf | A11y | BP | SEO | axe elements | Goal |');
  md.push('|---|---|---|---|---|---|---|');
  const csvRows = [];
  const pushRow = (page, status) => {
    const o = oldLh.get(page);
    const n = newLh.get(page);
    const oa = oldAxe.pages.get(page);
    const na = newAxe.pages.get(page);
    csvRows.push({
      page: pathFor(n || o),
      status,
      perf_before: o?.scores.performance,
      perf_after: n?.scores.performance,
      perf_runs: n?.perfRuns?.join('/') ?? '',
      a11y_before: o?.scores.accessibility,
      a11y_after: n?.scores.accessibility,
      bp_before: o?.scores['best-practices'],
      bp_after: n?.scores['best-practices'],
      seo_before: o?.scores.seo,
      seo_after: n?.scores.seo,
      axe_elements_before: oa?.nodes,
      axe_elements_after: na?.nodes,
      meets_goal_before: o ? meetsGoal(o) : '',
      meets_goal_after: n ? meetsGoal(n) : '',
    });
  };
  common.forEach((p) => {
    const o = oldLh.get(p);
    const n = newLh.get(p);
    md.push(`| ${pathFor(n)} | ${delta(o.scores.performance, n.scores.performance)} | ${delta(o.scores.accessibility, n.scores.accessibility)} | ${delta(o.scores['best-practices'], n.scores['best-practices'])} | ${n.scores.seo ?? '-'} | ${delta(oldAxe.pages.get(p)?.nodes, newAxe.pages.get(p)?.nodes)} | ${meetsGoal(n) ? '✅' : '❌'} |`);
    pushRow(p, 'both');
  });
  md.push('');

  if (added.length) {
    md.push(`## New pages since the last report (${added.length})`, '', 'No baseline to compare against.', '');
    md.push('| Page | Perf | A11y | BP | SEO | axe elements | Goal |');
    md.push('|---|---|---|---|---|---|---|');
    added.sort((a, b) => pathFor(newLh.get(a)).localeCompare(pathFor(newLh.get(b)))).forEach((p) => {
      const n = newLh.get(p);
      md.push(`| ${pathFor(n)} | ${n.scores.performance ?? '-'} | ${n.scores.accessibility ?? '-'} | ${n.scores['best-practices'] ?? '-'} | ${n.scores.seo ?? '-'} | ${newAxe.pages.get(p)?.nodes ?? '-'} | ${meetsGoal(n) ? '✅' : '❌'} |`);
      pushRow(p, 'new');
    });
    md.push('');
  }
  if (removed.length) {
    md.push(`## Pages no longer on the site (${removed.length})`, '');
    removed.forEach((p) => {
      md.push(`- ${pathFor(oldLh.get(p))}`);
      pushRow(p, 'removed');
    });
    md.push('');
  }

  const columns = Object.keys(csvRows[0] || { page: '' });
  const csv = [columns.join(','), ...csvRows.map((row) => columns.map((c) => `"${String(row[c] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n');
  await fs.writeFile(path.join(args.newDir, 'COMPARISON.md'), `${md.join('\n')}\n`, 'utf8');
  await fs.writeFile(path.join(args.newDir, 'comparison.csv'), `${csv}\n`, 'utf8');
  console.log(`Pages meeting goal: ${goalAfter}/${common.length} (common), ${goalAll}/${newLh.size} (all)`);
  console.log(`Wrote ${path.join(args.newDir, 'COMPARISON.md')} and comparison.csv`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
