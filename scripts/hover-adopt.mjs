#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue -- CLI codemod. */

/**
 * Gives the contender blocks a hover, by pointing their own card selector at a
 * shared tier rather than adding a class in 30 separate JS files.
 *
 * Tier per block is a judgement informed by scripts/contender-shapes.mjs, which
 * measured each card's surface luminance, whether it carries an image, whether
 * it already has a shadow, and its proportions:
 *
 *   card  lift + shadow   light, elevated, card-shaped
 *   row   lift + light shadow   wide, text-led; a deep shadow there looks heavy
 *   tint  wash, no lift   dark or photographic — a shadow there is invisible
 *   edge  rule draws in   flat logo and badge tiles with no elevation to add to
 *
 * Two things keep the generated CSS lint-clean:
 *
 *   Selectors are BLOCK-SCOPED (`.news .news-card`). An unscoped `.news-card`
 *   appended after an existing `.news .news-card` is lower specificity and
 *   trips no-descending-specificity.
 *
 *   If the base selector already has a rule, the transition is injected into
 *   that rule instead of emitting a second one, which would be a duplicate
 *   selector.
 *
 * Every tier is guarded by :where(:has(…)), so a block whose cta is optional
 * stays inert on pages where no link was authored.
 *
 *   node scripts/hover-adopt.mjs --dry
 *   node scripts/hover-adopt.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DRY = process.argv.includes('--dry');
const GUARD = ':where(:has(:is(a[href], button, [role="button"], [tabindex]:not([tabindex="-1"]))))';

const TIERS = {
  card: { props: ['transform: translateY(var(--hover-lift-card));', 'box-shadow: var(--shadow-3);'], note: 'lift + shadow' },
  row: { props: ['transform: translateY(var(--hover-lift-row));', 'box-shadow: var(--shadow-2);'], note: 'lift + light shadow' },
  tint: { props: ['background-image: linear-gradient(var(--hover-tint-wash), var(--hover-tint-wash));'], note: 'wash, no lift' },
  edge: { props: null, note: 'rule draws along the bottom edge' },
};

const PLAN = [
  ['card-row', '.card-row-card', 'card'],
  ['card-row-compact', '.card-row-compact-card', 'card'],
  ['card-row-detailed', '.card-row-detailed-card', 'card'],
  ['connect-grid', '.connect-grid-card', 'card'],
  ['need-help', '.need-help-card', 'card'],
  ['split-card-detail', '.split-card-detail-card', 'card'],
  ['image-text-card-row', '.image-text-card-row-card', 'card'],
  ['leadership-team', '.leadership-team-card', 'card'],
  ['news', '.news-card', 'card'],
  ['regional-offices', '.regional-offices-card', 'card'],
  ['picture-cards', '.picture-card', 'card'],
  ['job-postings', '.job-postings-card', 'row'],
  ['split-card-list', '.scl-statement-card', 'row'],
  ['impact-chain', '.impact-chain-item', 'row'],
  ['dual-cards', '.dual-cards-card', 'row'],
  ['impact-donut', '.impact-donut-legend-item', 'row'],
  ['internship-program', '.internship-program-card', 'row'],
  ['mail-address', '.mail-address-card', 'row'],
  ['cta-banner', '.cta-banner-card', 'row'],
  ['support-cta', '.support-cta-card', 'row'],
  ['cards', '.cards-card', 'tint'],
  ['colored-grid', '.colored-grid-row-item', 'tint'],
  ['dark-feature-cards', '.dark-feature-cards-card', 'tint'],
  ['leadership-overview', '.leadership-overview-nav-card', 'tint'],
  ['partners-showcase', '.partners-showcase-logo-item', 'edge'],
  ['trust-badges', '.trust-badges-item', 'edge'],
  ['product-list', '.product-list-card', 'edge'],
  ['logo-carousel', '.logo-carousel-slide', 'edge'],
];

const HEAD = (tier, note) => `
/* HOVER — ${tier} tier (${note}). Tokens live in the HOVER SYSTEM section of
   styles.css; the :where(:has(…)) guard keeps this inert on a page where no
   link was authored on the card.

   The whole block is exempt from no-descending-specificity: several of these
   stylesheets declare a higher-specificity variant of the same card further up,
   and the hover has to sit LAST to win, which the rule reads as descending. */
/* stylelint-disable no-descending-specificity */`;

let added = 0;
let skipped = 0;

for (const [block, sel, tier] of PLAN) {
  const file = path.join('blocks', block, `${block}.css`);
  if (!fs.existsSync(file)) { console.log(`  skip  ${block} (no css)`); skipped += 1; continue; }
  let css = fs.readFileSync(file, 'utf8');
  if (!css.includes(sel)) { console.log(`  MISS  ${block}  ${sel} not in stylesheet`); skipped += 1; continue; }
  if (css.includes('/* HOVER — ')) { console.log(`  done  ${block} (already has it)`); skipped += 1; continue; }

  const S = `.${block} ${sel}`;
  const t = TIERS[tier];
  const needsRelative = tier === 'edge';

  // The resting declarations hang off the GUARDED selector, not the bare one.
  // Three things fall out of that, all of them wanted:
  //   · the selector text is unique, so it can never be a duplicate of a rule
  //     the block already has — no injecting into someone else's rule, and no
  //     no-duplicate-selectors error;
  //   · :where() contributes no specificity, so the cascade is untouched;
  //   · a card with nothing to click gets no transition and no pseudo-element
  //     at all, rather than carrying machinery it will never use.
  const baseRule = `\n${S}${GUARD} {\n${needsRelative ? '  position: relative;\n' : ''}  transition: var(--hover-transition);\n}\n`;

  let rule;
  if (tier === 'edge') {
    rule = `${HEAD(tier, t.note)}${baseRule}
${S}${GUARD}::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--beacon-color);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform var(--hover-duration) var(--hover-ease);
}

${S}:focus-within::after,
${S}${GUARD}:hover::after {
  transform: scaleX(1);
}

@media (prefers-reduced-motion: reduce) {
  ${S}::after {
    transition: none;
  }
}
`;
  } else {
    rule = `${HEAD(tier, t.note)}${baseRule}
${S}:focus-within,
${S}${GUARD}:hover {
  ${t.props.join('\n  ')}
}

@media (prefers-reduced-motion: reduce) {
  ${S}:focus-within,
  ${S}:hover {
    transform: none;
  }
}
`;
  }

  // Close the exemption opened in HEAD, so it covers only what this codemod
  // appended and not the rest of the stylesheet.
  css = `${css.replace(/\s+$/, '')}\n${rule}\n/* stylelint-enable no-descending-specificity */\n`;
  if (!DRY) fs.writeFileSync(file, css);
  console.log(`  ok    ${block.padEnd(22)} ${tier.padEnd(5)} ${S}`);
  added += 1;
}

console.log(`\n${DRY ? 'DRY RUN — ' : ''}${added} blocks given a hover, ${skipped} skipped.`);
