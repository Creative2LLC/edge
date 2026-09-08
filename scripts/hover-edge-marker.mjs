#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue -- CLI codemod. */

/**
 * Swaps the edge tier's plain 2px rule for the site's own marker underline.
 *
 * The marker is already the site's vocabulary for "this is worth looking at" —
 * animated-marker.js draws it under headings in the colored blocks and in
 * statistics. Reusing its hand-drawn bezier means the hover on a logo tile is
 * recognisably the same mark rather than a second, unrelated flourish.
 *
 * Done in pure CSS rather than by calling the marker script:
 *   · the path is the same one animated-marker.js uses for style="underline"
 *     (M4 20 C29 11 70 24 116 13, viewBox 0 0 120 32);
 *   · it is applied as a MASK, not a background image, so the colour stays a
 *     CSS custom property — a data-URI fill could not read a token;
 *   · it reveals with clip-path rather than scaleX, which wipes the stroke in
 *     left to right like a pen instead of stretching it.
 *
 * Colour defaults to --text-marker-color, so any block that already themes its
 * marker themes this too, and an author changing markerColor moves both.
 */
import fs from 'node:fs';
import path from 'node:path';

const EDGE_BLOCKS = ['partners-showcase', 'trust-badges', 'product-list', 'logo-carousel'];

const OLD_AFTER = `  height: 2px;
  border-radius: 2px;
  background: var(--beacon-color);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform var(--hover-duration) var(--hover-ease);`;

const NEW_AFTER = `  height: 12px;
  background: var(--hover-edge-color, var(--text-marker-color, #f5c84b));
  mask-image: var(--hover-edge-mark);
  mask-size: 100% 100%;
  mask-repeat: no-repeat;
  clip-path: inset(0 100% 0 0);
  transition: clip-path var(--hover-edge-duration) var(--hover-ease);`;

let n = 0;
for (const b of EDGE_BLOCKS) {
  const file = path.join('blocks', b, `${b}.css`);
  if (!fs.existsSync(file)) { console.log(`  skip  ${b}`); continue; }
  let css = fs.readFileSync(file, 'utf8');
  if (!css.includes(OLD_AFTER)) { console.log(`  MISS  ${b} (edge rule not in expected shape)`); continue; }

  css = css.replace(OLD_AFTER, NEW_AFTER);
  // The reveal is a wipe now, not a scale.
  css = css.replace(/(\n[^\n]*:hover::after \{\n) {2}transform: scaleX\(1\);/, '$1  clip-path: inset(0 0 0 0);');
  fs.writeFileSync(file, css);
  console.log(`  ok    ${b}`);
  n += 1;
}
console.log(`\n${n} edge blocks switched to the marker underline.`);
