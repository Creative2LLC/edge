#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-continue -- CLI codemod. */

/**
 * Wraps the clickable guard in :where() so it costs nothing in specificity.
 *
 * A bare :has(...) raises the hover rule above sibling rules that were written
 * to sit after it, which sets off no-descending-specificity all over the block
 * stylesheets and would mean reordering rules that are otherwise fine.
 *
 * :where() always contributes zero specificity, so
 *   .card:where(:has(a[href])):hover
 * weighs exactly the same as
 *   .card:hover
 * and the cascade is untouched. The guard still works — :where() only zeroes
 * the weight, not the match.
 */
import fs from 'node:fs';
import path from 'node:path';

const BARE = ':has(:is(a[href], button, [role="button"], [tabindex]:not([tabindex="-1"])))';
const WRAPPED = ':where(:has(:is(a[href], button, [role="button"], [tabindex]:not([tabindex="-1"]))))';

const files = [];
for (const b of fs.readdirSync('blocks')) {
  const f = path.join('blocks', b, `${b}.css`);
  if (fs.existsSync(f)) files.push(f);
}
files.push('styles/styles.css');

let n = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (!s.includes(BARE)) continue;
  if (s.includes(WRAPPED)) continue;
  const out = s.split(BARE).join(WRAPPED);
  fs.writeFileSync(f, out);
  const hits = s.split(BARE).length - 1;
  console.log(`  ${path.basename(f).padEnd(34)} ${hits} guard${hits === 1 ? '' : 's'} wrapped`);
  n += 1;
}
console.log(`\n${n} files updated.`);
