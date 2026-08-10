#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue, max-len -- CLI codemod. */

/**
 * Standardize the OUTER top/bottom padding of content sections on MOBILE to a
 * single token value (`--section-space-y-mobile`). Base (desktop/tablet) padding
 * is left untouched.
 *
 * For each block in INCLUDE it finds the element that carries the outer vertical
 * padding (`.x.block` / `.x` / `.x-wrapper` / `.x-inner`) and, inside a mobile
 * media query, forces `padding-block: var(--section-space-y-mobile)` — modifying
 * an existing mobile rule for that element, or injecting one into the block's
 * mobile media query (or appending a `@media (width <= 768px)` if none exists).
 *
 * Horizontal padding is preserved (padding-block only touches top/bottom).
 *
 * Dry-run by default; pass --apply to write.
 *   node scripts/apply-section-vpad.mjs          (preview)
 *   node scripts/apply-section-vpad.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const TOKEN = 'var(--section-space-y-mobile)';
const NEW_BP = '@media (width <= 768px)';

// Real content sections + backgrounded colour bands. Excludes heroes, carousels,
// split-cards, nav/footer, inline utilities, and inset-card CTAs (see report).
const INCLUDE = [
  // backgrounded bands
  'amber-alerts', 'giving', 'impact-donut', 'leadership-overview', 'media-contact-cta',
  'media-reporting-info', 'need-help', 'newsletter', 'partners-showcase', 'poster-map',
  'poster-results', 'resources-browser', 'trust-badges',
  // plain content sections
  'card-row', 'card-row-compact', 'card-row-detailed', 'card-testimonies', 'connect-grid',
  'cta-card-1', 'cta-card-2', 'dual-cards', 'event-calendar', 'historical-trends',
  'icon-text', 'icon-text-row', 'image-text-card-row', 'impact-bar-chart', 'impact-chain',
  'impact-data-table', 'info-cards-grid', 'mail-address', 'news', 'product-list',
  'regional-offices', 'report-archive', 'report-breakdown', 'report-download',
  'split-card-gap', 'statistics', 'us-map',
];

const isMobile = (cond) => /@media/.test(cond)
  && (/max-width/.test(cond) || /width\s*<=/.test(cond) || /width\s*<[^=]/.test(cond))
  && !/min-width|width\s*>=/.test(cond);

const mobileWidth = (cond) => {
  const m = cond.match(/(?:max-width\s*:\s*|width\s*<=?\s*)(\d+)px/);
  return m ? parseInt(m[1], 10) : 9999;
};

// Parse into rules [{selector, media, headStart, bodyStart, bodyEnd}] and
// media blocks [{cond, bodyStart, bodyEnd}]. Positions are absolute offsets.
function parse(css) {
  const stack = [];
  const rules = [];
  const medias = [];
  let i = 0;
  let start = 0;
  const N = css.length;
  while (i < N) {
    if (css[i] === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e === -1 ? N : e + 2; start = i; continue; }
    const c = css[i];
    if (c === '{') {
      const prelude = css.slice(start, i).replace(/\s+/g, ' ').trim();
      stack.push({ prelude, headStart: start, bodyStart: i + 1 });
      i += 1; start = i; continue;
    }
    if (c === '}') {
      const top = stack.pop();
      if (top) {
        if (/^@media/.test(top.prelude)) medias.push({ cond: top.prelude, bodyStart: top.bodyStart, bodyEnd: i });
        else {
          const media = [...stack].reverse().find((s) => /^@media/.test(s.prelude));
          rules.push({ selector: top.prelude, media: media ? media.prelude : null, headStart: top.headStart, bodyStart: top.bodyStart, bodyEnd: i });
        }
      }
      i += 1; start = i; continue;
    }
    i += 1;
  }
  return { rules, medias };
}

const hasVerticalPadding = (body) => /(^|[;{]|\s)padding(-top|-bottom|-block)?\s*:/.test(body);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

const plan = [];
const missing = [];

for (const name of INCLUDE) {
  const file = path.join('blocks', name, `${name}.css`);
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  const css = fs.readFileSync(file, 'utf8');
  const { rules, medias } = parse(css);
  const candidates = [`.${name}.block`, `.${name}`, `.${name}-wrapper`, `.${name}-inner`];

  // Choose the element carrying the base outer vertical padding.
  let padSel = null;
  for (const cand of candidates) {
    const base = rules.find((r) => r.selector === cand && r.media === null && hasVerticalPadding(css.slice(r.bodyStart, r.bodyEnd)));
    if (base) { padSel = cand; break; }
  }
  if (!padSel) { missing.push(`${name} (no base vertical padding found)`); continue; }

  // Existing mobile rule for padSel?
  const mobRule = rules
    .filter((r) => r.selector === padSel && r.media && isMobile(r.media))
    .sort((a, b) => mobileWidth(a.media) - mobileWidth(b.media))[0];

  if (mobRule) {
    plan.push({ file, name, padSel, action: 'modify', at: mobRule.bodyEnd, bp: mobRule.media });
  } else {
    // Inject into a mobile media block: prefer <=768, else nearest <=900, else any mobile.
    const mob = medias.filter((m) => isMobile(m.cond)).sort((a, b) => Math.abs(mobileWidth(a.cond) - 768) - Math.abs(mobileWidth(b.cond) - 768))[0];
    if (mob) plan.push({ file, name, padSel, action: 'inject', at: mob.bodyEnd, bp: mob.cond });
    else plan.push({ file, name, padSel, action: 'append', at: css.length, bp: NEW_BP });
  }
}

// Apply edits per file (highest offset first so positions stay valid).
const byFile = new Map();
for (const e of plan) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

console.log(`\n${plan.length} block(s) to standardize to ${TOKEN} on mobile:\n`);
for (const e of plan.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${e.action.padEnd(7)} ${e.name.padEnd(24)} ${e.padSel.padEnd(22)} ${e.bp}`);
}
if (missing.length) console.log(`\nSkipped: ${missing.join(', ')}`);

if (APPLY) {
  for (const [file, edits] of byFile) {
    let css = fs.readFileSync(file, 'utf8');
    for (const e of edits.sort((a, b) => b.at - a.at)) {
      if (e.action === 'modify') {
        css = `${css.slice(0, e.at)}  padding-block: ${TOKEN};\n${css.slice(e.at)}`;
      } else if (e.action === 'inject') {
        css = `${css.slice(0, e.at)}\n  ${e.padSel} {\n    padding-block: ${TOKEN};\n  }\n${css.slice(e.at)}`;
      } else {
        css = `${css.slice(0, e.at)}\n\n${NEW_BP} {\n  ${e.padSel} {\n    padding-block: ${TOKEN};\n  }\n}\n`;
      }
    }
    fs.writeFileSync(file, css);
  }
  console.log(`\nApplied to ${byFile.size} file(s). Add --section-space-y-mobile to :root in styles/styles.css.`);
} else {
  console.log('\nDry-run. Re-run with --apply to write. (Also add --section-space-y-mobile to :root.)');
}
