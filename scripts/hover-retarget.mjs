#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-cond-assign, no-continue -- CLI codemod. */

/**
 * Points each genuine content-card hover at the shared hover tokens, and gives
 * it a keyboard state.
 *
 * The list is explicit rather than derived. A pattern match over ":hover rules
 * that are not buttons" also catches SVG map regions, nav dropdowns, table rows
 * and the hero scroll cue — surfaces whose interaction is deliberately its own
 * thing. Those are left alone.
 *
 * For each entry:
 *   transform   -> var(--hover-lift-card | -row)
 *   box-shadow  -> var(--shadow-3)
 *   selector    += :focus-within, so the link already inside the card finally
 *                  produces a visible state for keyboard users
 *
 * Colour is deliberately NOT touched: a card's hover colour is semantic to its
 * block. See the --hover-surface hook in styles.css.
 *
 *   node scripts/hover-retarget.mjs --dry
 *   node scripts/hover-retarget.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DRY = process.argv.includes('--dry');

// block, selector to retarget, tier, and whether it contains something
// focusable (verified in audits/hover-focusable.mjs).
const TARGETS = [
  ['article-list', '.article-list .article-list-card', 'card', true],
  ['case-anniversaries', '.case-anniversaries-card', 'card', true],
  ['historical-trends', '.historical-trends .historical-trends-card', 'card', false],
  ['resources-browser', '.resources-browser .resources-browser-card', 'card', true],
  ['numbered-cards', '.numbered-cards-carousel-layout .numbered-cards-card', 'card', false],
  // Its hover lives inside @media (prefers-reduced-motion: no-preference);
  // retargeting the values leaves that guard intact.
  ['resource-downloads', '.resource-downloads-item:not(.is-informative)', 'row', true],
  ['faq', '.faq .faq-item', 'row', true],
  ['amber-still-missing', '.amber-still-missing .amber-still-missing-accordion', 'row', true],
];

const LIFT = { card: 'var(--hover-lift-card)', row: 'var(--hover-lift-row)' };

let changed = 0;
let skipped = 0;

for (const [block, selector, tier, focusable] of TARGETS) {
  const file = path.join('blocks', block, `${block}.css`);
  if (!fs.existsSync(file)) { console.log(`  skip  ${block} (no css)`); skipped += 1; continue; }
  let css = fs.readFileSync(file, 'utf8');

  const head = `${selector}:hover`;
  const at = css.indexOf(head);
  if (at < 0) { console.log(`  MISS  ${block}  ${head}`); skipped += 1; continue; }

  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) { console.log(`  MISS  ${block} (no rule body)`); skipped += 1; continue; }

  let body = css.slice(open + 1, close);

  const originals = [];
  body = body.replace(/(^|;)(\s*)transform\s*:\s*([^;]+)/i, (m, a, b, v) => {
    originals.push(`transform ${v.trim()}`);
    return `${a}${b}transform: translateY(${LIFT[tier]})`;
  });
  body = body.replace(/(^|;)(\s*)box-shadow\s*:\s*[^;]+/i, (m, a, b) => {
    originals.push('box-shadow');
    return `${a}${b}box-shadow: var(--shadow-3)`;
  });

  if (!originals.length) { console.log(`  skip  ${block} (nothing to retarget)`); skipped += 1; continue; }

  // Give the card a keyboard state. Only where something inside can hold
  // focus — otherwise :focus-within can never match and the selector is a lie.
  const newHead = focusable ? `${selector}:hover,\n${selector}:focus-within` : head;
  const after = `${newHead} {${body}}`;

  console.log(`\n  ${block}`);
  console.log(`     was: ${originals.join(', ')}`);
  console.log(`     now: ${tier} tier${focusable ? ' + :focus-within' : '  (no focusable child — hover only)'}`);

  if (!DRY) {
    css = css.slice(0, at) + after + css.slice(close + 1);
    fs.writeFileSync(file, css);
  }
  changed += 1;
}

console.log(`\n${DRY ? 'DRY RUN — ' : ''}${changed} retargeted, ${skipped} skipped.`);
if (!DRY) console.log('Run stylelint next.');
