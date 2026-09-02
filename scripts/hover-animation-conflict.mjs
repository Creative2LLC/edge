#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, no-cond-assign, no-continue -- CLI audit. */

/**
 * Finds hover transforms that can never render.
 *
 * A CSS animation with fill-mode `both` or `forwards` keeps applying its final
 * keyframe after it finishes, and animated values beat normal declarations in
 * the cascade. So a card with a reveal animation that ends on
 * `transform: translateY(0)` will ignore `:hover { transform: … }` forever —
 * the hover CSS is there, reads correctly, and does nothing.
 *
 * `backwards` is the correct fill for a reveal: it holds the FROM state before
 * the animation starts and releases the property once it ends.
 * resource-downloads already does this; article-list does not.
 */
import fs from 'node:fs';
import path from 'node:path';

const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let total = 0;

console.log('\nHover transforms blocked by an animation fill-mode:\n');

for (const block of fs.readdirSync('blocks')) {
  const file = path.join('blocks', block, `${block}.css`);
  if (!fs.existsSync(file)) continue;
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  // Keyframes that actually animate transform.
  const transformKeyframes = new Set(
    [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)]
      .filter((m) => /transform\s*:/.test(m[2]))
      .map((m) => m[1]),
  );
  if (!transformKeyframes.size) continue;

  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rule.exec(css))) {
    const selector = m[1].trim();
    const body = m[2];
    if (selector.startsWith('@') || selector.includes(':hover')) continue;

    const anim = body.match(/animation\s*:\s*([^;]+)/);
    if (!anim) continue;
    const name = anim[1].trim().split(/\s+/)[0];
    if (!transformKeyframes.has(name)) continue;
    let fill = null;
    if (/\bboth\b/.test(anim[1])) fill = 'both';
    else if (/\bforwards\b/.test(anim[1])) fill = 'forwards';
    if (!fill) continue;

    // Does the same class have a hover rule that sets transform?
    const cls = selector.split(',')[0].trim().split(/[\s>+~]+/).pop();
    const hoverRe = new RegExp(`${esc(cls)}[^{,]*:hover[^{]*\\{[^}]*transform`);
    if (!hoverRe.test(css)) continue;

    total += 1;
    console.log(`  ${block.padEnd(24)} ${cls.padEnd(34)} fill: ${fill}   (${name})`);
  }
}

console.log(`\n${total} hover transform${total === 1 ? '' : 's'} that cannot render.`);
console.log('Fix: change the reveal animation to fill-mode `backwards`.\n');
