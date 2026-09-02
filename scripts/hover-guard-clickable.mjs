#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue -- CLI codemod. */

/**
 * Makes a block's own card hover conditional on the card actually containing
 * something clickable.
 *
 * Several blocks have an OPTIONAL cta / link field, so the same block is
 * clickable on one page and inert on the next. A lift on the inert instance
 * promises a click that is not there — which is worse than no hover, because it
 * reads as a broken control rather than as static content.
 *
 * :has() settles it per instance at render time: no JS, no authoring flag, and
 * it tracks the content rather than the block type. It is already used in
 * carousel, footer, hero and report-section-nav, so it is established here.
 *
 * :hover only. :focus-within cannot fire without a focusable descendant, so it
 * is already self-limiting and is left alone.
 *
 *   node scripts/hover-guard-clickable.mjs --dry
 *   node scripts/hover-guard-clickable.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DRY = process.argv.includes('--dry');
const CLICKABLE = ':has(:is(a[href], button, [role="button"], [tabindex]:not([tabindex="-1"])))';

// Card surfaces whose block offers the cta/link as an optional field.
const TARGETS = [
  ['article-list', '.article-list .article-list-card'],
  ['case-anniversaries', '.case-anniversaries-card'],
  ['historical-trends', '.historical-trends .historical-trends-card'],
  ['resources-browser', '.resources-browser .resources-browser-card'],
  ['numbered-cards', '.numbered-cards-carousel-layout .numbered-cards-card'],
  // bare class: this block hovers the card in several variant rules and they
  // must all gain the guard together, or the card body reacts while the card
  // itself does not.
  ['numbered-cards-custom', '.numbered-cards-custom-card'],
  ['faq', '.faq .faq-item'],
  ['amber-still-missing', '.amber-still-missing .amber-still-missing-accordion'],
  ['info-cards-grid', '.info-cards-grid-card-default.info-cards-grid-card-has-hover-bg'],
  ['info-cards-grid', '.info-cards-grid-card-default.info-cards-grid-card-has-default-hover'],
  ['event-calendar', '.event-calendar .event-calendar-featured-card'],
  ['resources-carousel', '.resources-carousel .resources-carousel-card'],
];

let changed = 0;
let missed = 0;

for (const [block, selector] of TARGETS) {
  const file = path.join('blocks', block, `${block}.css`);
  if (!fs.existsSync(file)) { console.log(`  skip  ${block} (no css)`); missed += 1; continue; }
  let css = fs.readFileSync(file, 'utf8');

  const needle = `${selector}:hover`;
  if (!css.includes(needle)) { console.log(`  MISS  ${block}  ${needle}`); missed += 1; continue; }
  if (css.includes(`${selector}${CLICKABLE}:hover`)) { console.log(`  done  ${block} (already guarded)`); continue; }

  css = css.split(needle).join(`${selector}${CLICKABLE}:hover`);
  console.log(`  ok    ${block}  ${selector}`);
  if (!DRY) fs.writeFileSync(file, css);
  changed += 1;
}

console.log(`\n${DRY ? 'DRY RUN — ' : ''}${changed} guarded, ${missed} not found.`);
