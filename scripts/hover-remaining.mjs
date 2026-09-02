#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-cond-assign, no-continue -- CLI audit. */

/**
 * What is actually left to do on hover.
 *
 * Two things this gets right that a quick grep does not:
 *
 *  1. A selector list cannot be split on every comma. The clickable guard
 *     contains `:is(a[href], button, …)`, so a naive split shreds it into
 *     fragments like `[tabindex]:not([tabindex="-1"])))):hover`. Depth-aware
 *     splitting only breaks on commas at paren depth zero.
 *
 *  2. "Not a button" needs BOTH tests: the name-based one (btn / button /
 *     link / cta) and the action-based one (submit / reset / back / prev /
 *     load-more …). Using either alone lets a pile of buttons through and
 *     inflates the remaining count.
 */
import fs from 'node:fs';
import path from 'node:path';

const NAME = /(^|[.\-_])(a|button|btn|link|cta)([.\-_]|$)/i;
const ACTION = /(submit|reset|-back|prev|next|continue|load-more|trigger|toggle|close|play|-send|-search\b|apply|download|-view|-nav|arrow|dot\b|pill|chip|filter|-tab\b|-select|-input|-field|checkbox|radio|hamburger|social|step)/i;

/** Split a selector list on commas that are NOT inside parentheses. */
function splitSelectors(list) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The compound the :hover attaches to, ignoring anything inside parens. */
function hoveredCompound(sel) {
  const head = sel.split(':hover')[0];
  const flat = head.replace(/\([^()]*\)/g, '');
  return flat.split(/[\s>+~]+/).filter(Boolean).pop() || '';
}

const surfaces = [];
const controls = [];

for (const b of fs.readdirSync('blocks')) {
  const file = path.join('blocks', b, `${b}.css`);
  if (!fs.existsSync(file)) continue;
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rule.exec(css))) {
    const list = m[1].trim().replace(/\s+/g, ' ');
    const body = m[2];
    if (!list.includes(':hover') || list.startsWith('@')) continue;
    if (!/transform\s*:|box-shadow\s*:/.test(body)) continue;

    for (const sel of splitSelectors(list)) {
      if (!sel.includes(':hover')) continue;
      const cmp = hoveredCompound(sel);
      const entry = {
        block: b,
        sel,
        tokenised: /var\(--hover-lift|var\(--shadow-[1-4]\)/.test(body),
        guarded: sel.includes(':where(:has('),
      };
      if (NAME.test(cmp) || ACTION.test(cmp)) controls.push(entry); else surfaces.push(entry);
    }
  }
}

const done = surfaces.filter((s) => s.tokenised);
const todo = surfaces.filter((s) => !s.tokenised);

console.log(`\nHover rules that move something (transform or shadow): ${surfaces.length + controls.length}`);
console.log(`  buttons / controls  — out of scope by design : ${controls.length}`);
console.log(`  genuine surfaces                             : ${surfaces.length}`);
console.log(`      on tokens : ${done.length}`);
console.log(`      remaining : ${todo.length}\n`);

console.log('REMAINING SURFACES:');
const grouped = {};
todo.forEach((t) => { (grouped[t.block] = grouped[t.block] || []).push(t.sel); });
Object.entries(grouped).sort().forEach(([b, list]) => {
  console.log(`  ${b}`);
  list.forEach((s) => console.log(`      ${s.slice(0, 74)}`));
});
