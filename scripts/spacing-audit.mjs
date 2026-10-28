#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */
/* eslint-disable no-continue, max-len, object-curly-newline -- CLI control flow. */

/**
 * Spacing audit: extracts every spacing value (padding / margin / gap /
 * max-width) across blocks/ + styles/, clusters them, and reports the sprawl so
 * a consistent token scale can be designed from the real numbers.
 *
 * Reports:
 *   - unit mix (how much is hardcoded px vs rem vs clamp/var)
 *   - the de-facto px scale (value -> frequency) and how many are "off-scale"
 *   - container max-widths (should converge on ~1 canonical value)
 *   - one-off values (used <=2x) = snap-to-scale candidates
 *
 * Writes audits/spacing-audit.csv and .json.
 *
 * Usage: npm run spacing-audit
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOTS = ['blocks', 'styles'];
const OUT_DIR = 'audits';
// Standard 4px-based scale to test existing values against.
const SCALE = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128];

const GROUPS = {
  gap: /^(gap|row-gap|column-gap)$/,
  padding: /^padding(-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?$/,
  margin: /^margin(-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?$/,
  'max-width': /^max-width$/,
};

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

function groupFor(prop) {
  return Object.keys(GROUPS).find((g) => GROUPS[g].test(prop)) || null;
}

function nearestScale(px) {
  let best = SCALE[0];
  for (const s of SCALE) if (Math.abs(s - px) < Math.abs(best - px)) best = s;
  return best;
}

async function main() {
  const files = (await Promise.all(ROOTS.map((r) => walk(r)))).flat();

  const units = {
    px: 0, rem: 0, em: 0, '%': 0, clamp: 0, var: 0, calc: 0, other: 0,
  };
  let declCount = 0;
  // key `${group}|${value}` -> { group, value, count, files:Set }
  const values = new Map();
  const pxByGroup = new Map(); // group -> Map(px -> count)
  const maxWidths = new Map();

  const declRe = /([a-z-]+)\s*:\s*([^;{}]+);/gi;
  const tokenRe = /(-?\d*\.?\d+)(px|rem|em|vw|vh|%|ch|fr|pt)|\b0\b|clamp\([^)]*\)|calc\([^)]*\)|var\(--[^)]*\)/gi;

  for (const file of files) {
    const css = (await fs.readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = declRe.exec(css)) !== null) {
      const prop = m[1].toLowerCase();
      const group = groupFor(prop);
      if (!group) continue;
      const rawValue = m[2].trim();
      declCount += 1;

      const tokens = rawValue.match(tokenRe) || [];
      for (const tok of tokens) {
        const t = tok.toLowerCase();
        if (t.startsWith('clamp(')) units.clamp += 1;
        else if (t.startsWith('var(')) units.var += 1;
        else if (t.startsWith('calc(')) units.calc += 1;
        else if (t.endsWith('px')) {
          units.px += 1;
          const px = parseFloat(t);
          if (group === 'max-width') maxWidths.set(t, (maxWidths.get(t) || 0) + 1);
          else {
            if (!pxByGroup.has(group)) pxByGroup.set(group, new Map());
            const g = pxByGroup.get(group);
            g.set(px, (g.get(px) || 0) + 1);
          }
        } else if (t.endsWith('rem')) units.rem += 1;
        else if (t.endsWith('em')) units.em += 1;
        else if (t.endsWith('%')) units['%'] += 1;
        else units.other += 1;

        const key = `${group}|${t}`;
        if (!values.has(key)) values.set(key, { group, value: t, count: 0, files: new Set() });
        const rec = values.get(key);
        rec.count += 1;
        rec.files.add(path.basename(file));
      }
    }
  }

  // ---- report ----
  console.log(`\nScanned ${files.length} CSS files, ${declCount} spacing declarations.\n`);

  const unitTotal = Object.values(units).reduce((a, b) => a + b, 0) || 1;
  console.log('UNIT MIX (share of spacing tokens):');
  Object.entries(units).sort((a, b) => b[1] - a[1]).forEach(([u, n]) => {
    if (n) console.log(`  ${u.padEnd(6)} ${String(n).padStart(5)}  ${((n / unitTotal) * 100).toFixed(1)}%`);
  });

  // De-facto px scale across gap/padding/margin combined.
  const allPx = new Map();
  for (const g of pxByGroup.values()) for (const [px, n] of g) allPx.set(px, (allPx.get(px) || 0) + n);
  const pxSorted = [...allPx.entries()].sort((a, b) => a[0] - b[0]);
  const distinctPx = pxSorted.length;
  const offScale = pxSorted.filter(([px]) => nearestScale(px) !== px);

  console.log(`\nDE-FACTO px SPACING SCALE — ${distinctPx} distinct px values (gap/padding/margin):`);
  console.log('  value  count  nearest-4px-step  (* = off-scale)');
  for (const [px, n] of [...allPx.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    const near = nearestScale(px);
    const flag = near === px ? '' : ` * -> ${near}px (off by ${Math.abs(near - px)})`;
    console.log(`  ${String(`${px}px`).padStart(7)} ${String(n).padStart(5)}   ${near}px${flag}`);
  }
  console.log(`\n  ${offScale.length} of ${distinctPx} distinct px values are off the 4px scale.`);

  console.log('\nCONTAINER max-width VALUES (ideally converge on ~1):');
  [...maxWidths.entries()].sort((a, b) => b[1] - a[1]).forEach(([v, n]) => console.log(`  ${v.padEnd(10)} ${n}x`));

  const oneOffs = [...values.values()].filter((v) => v.count <= 2 && /px$/.test(v.value))
    .sort((a, b) => a.group.localeCompare(b.group));
  console.log(`\nONE-OFF px VALUES (used <=2x) — snap-to-scale candidates: ${oneOffs.length}`);
  oneOffs.slice(0, 25).forEach((v) => console.log(`  ${v.group.padEnd(10)} ${v.value.padEnd(9)} ${v.count}x  [${[...v.files].slice(0, 3).join(', ')}]`));

  await fs.mkdir(OUT_DIR, { recursive: true });
  const rows = [...values.values()].sort((a, b) => b.count - a.count);
  const csv = ['group,value,count,files',
    ...rows.map((r) => `${r.group},"${r.value}",${r.count},"${[...r.files].join(' ')}"`)].join('\n');
  await fs.writeFile(path.join(OUT_DIR, 'spacing-audit.csv'), `${csv}\n`, 'utf8');
  await fs.writeFile(path.join(OUT_DIR, 'spacing-audit.json'), `${JSON.stringify({
    files: files.length, declCount, units, distinctPx, offScale: offScale.length,
  }, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${path.join(OUT_DIR, 'spacing-audit.csv')} and .json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
