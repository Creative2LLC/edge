#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */

/**
 * What SHAPE is each contender's card?
 *
 * A lift-and-shadow is the right hover for an elevated light card and the wrong
 * one for a flat logo tile or a dark photo card — a shadow under a dark card is
 * invisible, and a logo tile lifting off the page looks like a bug. So the tier
 * assignment is measured rather than guessed: background luminance, whether it
 * carries an image, whether it already has a shadow, and its proportions.
 *
 *   node scripts/contender-shapes.mjs
 */
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = 'https://test--edge--creative2llc.aem.live';

const BLOCKS = [
  'cards', 'news', 'card-row', 'card-row-compact', 'card-row-detailed', 'connect-grid',
  'image-card', 'dual-cards', 'job-postings', 'regional-offices', 'leadership-team',
  'internship-program', 'picture-cards', 'dark-feature-cards', 'need-help', 'cta-card-1',
  'cta-card-2', 'cta-banner', 'support-cta', 'split-card', 'split-card-info',
  'split-card-list', 'split-card-gap', 'split-card-offices', 'image-text-card-row',
  'trust-badges', 'partners-showcase', 'logo-carousel', 'leadership-overview', 'impact-donut',
  'impact-chain', 'split-card-detail', 'product-list', 'colored-grid', 'mail-address',
];

const PROBE = (blocks) => {
  const lum = (c) => {
    const m = c.match(/[0-9.]+/g);
    if (!m || m.length < 3) return null;
    if (m.length > 3 && parseFloat(m[3]) < 0.1) return null; // transparent
    const [r, g, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };

  /** Nearest painted ancestor colour, so a transparent card still reports the
   *  surface it visually sits on — that is what decides light vs dark. */
  const surfaceLum = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const v = lum(getComputedStyle(n).backgroundColor);
      if (v !== null) return v;
      n = n.parentElement;
    }
    return 1;
  };

  const out = [];
  blocks.forEach((b) => {
    const root = document.querySelector(`.${b}`);
    if (!root) return;
    // A card is ONE OF A REPEATED SET, not a container. Matching on the class
    // substring alone also catches the plural wrapper (-cards, -items) and the
    // block root itself, which is what produced ratios like 12.6 for a whole
    // logo band. Requiring a same-class sibling picks the real card out.
    const card = [...root.querySelectorAll('[class*="-card"], [class*="-item"], [class*="-tile"], [class*="-slide"], [class*="-badge"], [class*="-logo"]')]
      .find((el) => {
        if (el === root || !el.parentElement) return false;
        if (el.getBoundingClientRect().width < 40) return false;
        const own = [...el.classList].find((c) => /-(card|item|tile|slide|badge|logo)$/.test(c));
        if (!own) return false;
        return [...el.parentElement.children].filter((s) => s.classList.contains(own)).length > 1;
      });
    if (!card) return;
    const cs = getComputedStyle(card);
    const r = card.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;
    out.push({
      block: b,
      w: Math.round(r.width),
      h: Math.round(r.height),
      ratio: Math.round((r.width / r.height) * 100) / 100,
      bgLum: lum(cs.backgroundColor),
      surfaceLum: surfaceLum(card),
      hasShadow: cs.boxShadow !== 'none',
      hasBorder: parseFloat(cs.borderTopWidth) > 0,
      hasImage: !!card.querySelector('img, picture, svg'),
      clickable: !!card.querySelector('a[href], button'),
      cls: String(card.className).split(' ')[0],
    });
  });
  return out;
};

const pages = fs.readFileSync('audits/page-list.txt', 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1440, height: 1000 } });
const found = new Map();

for (const p of pages) {
  if (found.size === BLOCKS.length) break;
  const pg = await ctx.newPage();
  try {
    const resp = await pg.goto(BASE + p, { waitUntil: 'load', timeout: 30000 });
    if (resp && resp.ok()) {
      await pg.waitForTimeout(1100);
      const missing = BLOCKS.filter((b) => !found.has(b));
      (await pg.evaluate(PROBE, missing)).forEach((r) => {
        if (!found.has(r.block)) found.set(r.block, { ...r, page: p });
      });
    }
  } catch { /* skip */ }
  await pg.close();
}
await br.close();

/** Assign a tier from the measured shape. */
function tierFor(r) {
  // Fall back to the surface the card sits on when the card itself is clear.
  const l = r.bgLum !== null ? r.bgLum : r.surfaceLum;
  const dark = l < 0.45;
  if (dark && r.hasImage) return 'tint';
  if (dark) return 'tint';
  if (r.hasImage && !r.hasShadow && r.ratio > 1.6 && r.h < 200) return 'edge';
  if (!r.hasShadow && !r.hasBorder && r.hasImage) return 'edge';
  if (r.ratio > 3) return 'row';
  if (r.hasShadow || r.hasBorder) return 'card';
  return 'row';
}

const rows = [...found.values()].map((r) => ({ ...r, tier: tierFor(r) }));
rows.sort((a, b) => a.tier.localeCompare(b.tier) || a.block.localeCompare(b.block));

console.log(`\nMeasured ${rows.length} of ${BLOCKS.length} contenders.\n`);
console.log('  tier     bg     shadow img  ratio   block');
rows.forEach((r) => {
  let bg = 'none ';
  const l = r.bgLum !== null ? r.bgLum : r.surfaceLum;
  bg = l < 0.45 ? 'DARK ' : 'light';
  console.log(`  ${r.tier.padEnd(7)}  ${bg}  ${r.hasShadow ? 'yes' : ' - '}   ${r.hasImage ? 'yes' : ' - '}  ${String(r.ratio).padEnd(5)}  ${r.block}`);
});

const counts = rows.reduce((a, r) => { a[r.tier] = (a[r.tier] || 0) + 1; return a; }, {});
console.log(`\n${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('  ·  ')}`);
const missing = BLOCKS.filter((b) => !found.has(b));
if (missing.length) console.log(`\nnot found on any page (${missing.length}): ${missing.join(', ')}`);

if (process.argv.includes('--json')) {
  fs.writeFileSync('audits/contender-shapes.json', JSON.stringify(rows, null, 2));
  console.log('\nwrote audits/contender-shapes.json');
}
