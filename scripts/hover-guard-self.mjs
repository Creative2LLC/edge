#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue -- CLI codemod. */

/**
 * Widens the clickable guard to include a card that IS the link.
 *
 * `:has(a[href])` only inspects descendants. Several cards are themselves an
 * anchor — trust-badges-item is `<a class="trust-badges-item">` — so the guard
 * found nothing inside and suppressed the hover on a tile that is entirely
 * clickable. Caught by hovering it on the live site, not by reading the CSS.
 *
 * The fix matches either shape: the element itself, or something inside it.
 */
import fs from 'node:fs';
import path from 'node:path';

const CLICKABLE = ':is(a[href], button, [role="button"], [tabindex]:not([tabindex="-1"]))';
const OLD = `:where(:has(${CLICKABLE}))`;
const NEW = `:where(${CLICKABLE}, :has(${CLICKABLE}))`;

const files = fs.readdirSync('blocks')
  .map((b) => path.join('blocks', b, `${b}.css`))
  .filter((f) => fs.existsSync(f));
files.push('styles/styles.css');

let n = 0;
let hits = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (!s.includes(OLD)) continue;
  const count = s.split(OLD).length - 1;
  fs.writeFileSync(f, s.split(OLD).join(NEW));
  console.log(`  ${path.basename(f).padEnd(36)} ${count}`);
  n += 1;
  hits += count;
}
console.log(`\n${hits} guards widened across ${n} files.`);
