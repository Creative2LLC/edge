/* eslint-disable no-console */
/**
 * Turns an audit run (audit-pages + audit-perf-reruns + accessibility-audit) into
 * one plain-language row per page, for the client-facing score sheet.
 *
 * Performance uses the median of the re-runs when perf-reruns.json exists (the
 * same rule audit-compare.mjs uses); the load-time figures in the notes come
 * from the first run, whose full report is the one saved.
 *
 * Usage:
 *   node scripts/audit-client-data.mjs --root audits/report-2026-10-07 > rows.json
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ROOT = arg('--root');
if (!ROOT) throw new Error('--root <report dir> is required');
const LH = path.join(ROOT, 'lighthouse');

const readJson = (file, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

// "Goal" = the value Lighthouse scores 90 for that metric. Desktop is graded on
// much tighter times than mobile, so the targets differ by form factor.
const PERF_GOALS = {
  mobile: {
    device: 'a phone', lcp: '2.5 s', fcp: '1.8 s', si: '3.4 s', tbt: '200 ms',
  },
  desktop: {
    device: 'a desktop computer', lcp: '1.2 s', fcp: '0.9 s', si: '1.3 s', tbt: '150 ms',
  },
};

// Biggest score loss first; only metrics costing at least 2 points are mentioned.
const PERF_METRICS = {
  'largest-contentful-paint': (a, g) => `The main content takes ${seconds(a.numericValue)} to appear on ${g.device} (goal: under ${g.lcp}).`,
  'cumulative-layout-shift': (a) => `Content jumps around while the page loads (shift score ${a.numericValue.toFixed(2)}; goal: under 0.1).`,
  'total-blocking-time': (a, g) => `Scripts keep ${g.device} busy for ${Math.round(a.numericValue)} ms, which delays clicks, taps and scrolling (goal: under ${g.tbt}).`,
  'first-contentful-paint': (a, g) => `The first text or image takes ${seconds(a.numericValue)} to appear (goal: under ${g.fcp}).`,
  'speed-index': (a, g) => `The page fills in slowly overall (${seconds(a.numericValue)}; goal: under ${g.si}).`,
};

const itemCount = (audit) => audit?.details?.items?.length || 0;
const countPhrase = (audit, one, many) => {
  const n = itemCount(audit);
  return n ? plural(n, one, many) : `Some ${many}`;
};

const A11Y_TEXT = {
  'color-contrast': (a) => `${countPhrase(a, 'piece of text does', 'pieces of text do')} not stand out enough from the background, so it is hard to read for people with low vision.`,
  'link-name': (a) => `${countPhrase(a, 'link has', 'links have')} no name a screen reader can announce.`,
  'button-name': (a) => `${countPhrase(a, 'button has', 'buttons have')} no name a screen reader can announce.`,
  'image-alt': (a) => `${countPhrase(a, 'image is', 'images are')} missing a text description for screen readers.`,
  'heading-order': () => 'Headings skip a level (for example H2 straight to H4), which makes the page harder to navigate with a screen reader.',
  'target-size': (a) => `${countPhrase(a, 'tap target is', 'tap targets are')} too small or too close together to tap easily.`,
  label: (a) => `${countPhrase(a, 'form field has', 'form fields have')} no label.`,
  'frame-title': () => 'An embedded frame (such as a video or map) has no title for screen readers.',
  list: () => 'A list is not built as a proper list, so screen readers do not announce it as one.',
  listitem: () => 'A list item sits outside a list, so screen readers do not announce it correctly.',
  'aria-hidden-focus': () => 'Something hidden from screen readers can still be reached with the keyboard.',
  'duplicate-id-aria': () => 'Two elements share the same ID, which can confuse screen readers.',
  'select-name': () => 'A dropdown has no label.',
  'link-in-text-block': (a) => `${countPhrase(a, 'link inside a paragraph is', 'links inside paragraphs are')} told apart from the surrounding text only by colour (no underline), which some colour-blind visitors cannot see.`,
};

const BP_TEXT = {
  'errors-in-console': (a) => `The browser logged ${countPhrase(a, 'error', 'errors')} while loading the page.`,
  'image-size-responsive': (a) => `${countPhrase(a, 'image is', 'images are')} lower resolution than the screen needs and may look blurry.`,
  'inspector-issues': () => 'Chrome flagged a technical issue on the page (for example a cookie or security setting).',
  'third-party-cookies': () => 'An embedded third-party service sets cookies.',
  deprecations: () => 'The page uses a browser feature that is being retired.',
  'image-aspect-ratio': (a) => `${countPhrase(a, 'image is', 'images are')} shown stretched or squashed.`,
  'valid-source-maps': () => 'Developer debugging files are missing for some scripts.',
};

function failing(lhr, category) {
  return lhr.categories[category].auditRefs
    .filter((ref) => ref.weight > 0)
    .map((ref) => ({ ref, audit: lhr.audits[ref.id] }))
    .filter(({ audit }) => audit && audit.score !== null && audit.score < 1)
    .sort((x, y) => y.ref.weight - x.ref.weight);
}

function describe(list, table) {
  return list.map(({ ref, audit }) => (table[ref.id] ? table[ref.id](audit) : `${audit.title}.`));
}

function perfNotes(lhr, score) {
  if (score >= 95) return 'Meets the goal.';
  const losses = lhr.categories.performance.auditRefs
    .filter((ref) => ref.weight > 0 && PERF_METRICS[ref.id])
    .map((ref) => {
      const audit = lhr.audits[ref.id];
      return { ref, audit, loss: ref.weight * (1 - (audit.score ?? 1)) };
    })
    .filter((x) => x.loss >= 2)
    .sort((x, y) => y.loss - x.loss)
    .slice(0, 2);
  if (!losses.length) return 'Slightly under the goal; no single cause stands out.';
  const goals = PERF_GOALS[lhr.configSettings?.formFactor] || PERF_GOALS.mobile;
  return losses.map(({ ref, audit }) => PERF_METRICS[ref.id](audit, goals)).join(' ');
}

function categoryNotes(lhr, category, table, score, extra = []) {
  const notes = [...describe(failing(lhr, category), table), ...extra];
  if (!notes.length) return score >= 95 ? 'No issues found.' : 'Slightly under the goal; no single cause stands out.';
  return notes.join(' ');
}

/**
 * The detailed (axe) scan can fail elements Lighthouse does not weigh. Those are
 * added to the accessibility note, so a non-zero count never sits next to
 * "No issues found". Rules Lighthouse already reported are not repeated.
 */
function axeExtras(violations, lhr) {
  const lighthouseFailing = new Set(failing(lhr, 'accessibility').map(({ ref }) => ref.id));
  return violations
    .filter((v) => !lighthouseFailing.has(v.id))
    .map((v) => {
      const asAudit = { title: v.help, details: { items: v.nodes || [] } };
      const text = A11Y_TEXT[v.id] ? A11Y_TEXT[v.id](asAudit) : `${v.help}.`;
      return `Detailed scan: ${text}`;
    });
}

const reruns = readJson(path.join(LH, 'perf-reruns.json'), {});
const axe = readJson(path.join(ROOT, 'accessibility', 'summary.json'), { pages: [] });
const axeByPath = new Map(axe.pages.map((p) => [
  new URL(p.url).pathname.replace(/\/$/, '') || '/',
  p.violations || [],
]));

const rows = [];
fs.readdirSync(LH, { withFileTypes: true }).filter((d) => d.isDirectory()).forEach((dir) => {
  const summary = readJson(path.join(LH, dir.name, 'summary.json'));
  if (!summary?.url) return;
  const pagePath = new URL(summary.url).pathname.replace(/\/$/, '') || '/';
  if (summary.error || !summary.scores?.performance) {
    rows.push({ path: pagePath, url: summary.url, error: summary.error || 'No scores recorded' });
    return;
  }

  const html = fs.readFileSync(path.join(LH, dir.name, 'lighthouse.html'), 'utf8');
  const lhr = JSON.parse(html.match(/__LIGHTHOUSE_JSON__ = (\{[\s\S]*?\});<\/script>/)[1]);
  const runs = reruns[dir.name];
  const performance = runs?.length ? median(runs) : summary.scores.performance;
  const { accessibility, 'best-practices': bestPractices } = summary.scores;
  const violations = axeByPath.get(pagePath);

  rows.push({
    path: pagePath,
    url: summary.url,
    performance,
    performanceRuns: runs || [summary.scores.performance],
    accessibility,
    bestPractices,
    axeIssues: violations ? violations.reduce((n, v) => n + (v.nodes?.length || 0), 0) : null,
    perfNote: perfNotes(lhr, performance),
    a11yNote: categoryNotes(lhr, 'accessibility', A11Y_TEXT, accessibility, axeExtras(violations || [], lhr)),
    bpNote: categoryNotes(lhr, 'best-practices', BP_TEXT, bestPractices),
  });
});

rows.sort((a, b) => (a.performance ?? -1) - (b.performance ?? -1) || a.path.localeCompare(b.path));
console.log(JSON.stringify(rows, null, 2));
