#!/usr/bin/env node

/* eslint-disable no-console -- CLI audit progress output. */
/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue -- Sequential page scan is intentional. */

/**
 * Button & link inventory — from the RENDERED page, not from CSS source.
 *
 * A control's real appearance is the result of the whole cascade (global rule +
 * block rule + variant + state), so reading CSS declarations gives you fragments,
 * not what a visitor sees. This loads real pages, walks every <a> and <button>,
 * and records getComputedStyle. Identical computed appearance = one variant.
 *
 * Usage:
 *   node scripts/control-inventory.mjs                       # all pages in audits/page-list.txt
 *   node scripts/control-inventory.mjs /about /contact-us    # specific paths
 *   node scripts/control-inventory.mjs --limit 12
 *
 * Env: AUDIT_BASE_URL (default: the test branch)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL || 'https://test--edge--creative2llc.aem.page';
const OUT_DIR = 'audits/controls';
const PAGE_LIST = 'audits/page-list.txt';

function parseArgs(argv) {
  const paths = [];
  let limit = 0;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit') { limit = Number(argv[i + 1]) || 0; i += 1; continue; }
    if (argv[i].startsWith('--')) continue;
    paths.push(argv[i]);
  }
  return { paths, limit };
}

function loadPages({ paths, limit }) {
  if (paths.length) return paths;
  let list = [];
  try {
    list = fs.readFileSync(PAGE_LIST, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    list = ['/'];
  }
  return limit ? list.slice(0, limit) : list;
}

/* Runs in the browser. Collects one record per interactive control. */
function collectControls() {
  const PROPS = [
    'display', 'backgroundColor', 'backgroundImage', 'color', 'borderTopWidth',
    'borderTopStyle', 'borderTopColor', 'borderRadius', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight',
    'lineHeight', 'letterSpacing', 'textTransform', 'textDecorationLine',
    'boxShadow', 'width', 'height',
  ];

  const nodes = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]')];
  const out = [];

  for (const el of nodes) {
    const rect = el.getBoundingClientRect();
    // skip things that aren't actually rendered
    if (rect.width === 0 && rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;

    const style = {};
    PROPS.forEach((p) => { style[p] = cs[p]; });

    // what surface is it sitting on? walk up for the first non-transparent bg
    let ctx = el.parentElement;
    let ctxBg = 'rgba(0, 0, 0, 0)';
    while (ctx && ctx !== document.documentElement) {
      const b = getComputedStyle(ctx).backgroundColor;
      if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') { ctxBg = b; break; }
      ctx = ctx.parentElement;
    }

    const blockEl = el.closest('[data-block-name]');
    const sectionEl = el.closest('.section');

    out.push({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      classes: el.className && typeof el.className === 'string' ? el.className.trim() : '',
      href: el.getAttribute('href') || '',
      block: blockEl ? blockEl.dataset.blockName : (sectionEl ? '(section content)' : '(page)'),
      blockClasses: blockEl ? blockEl.className.trim() : '',
      hasIcon: !!el.querySelector('img, svg, .icon'),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      ctxBg,
      style,
    });
  }
  return out;
}

/* Two controls are the same variant when they render identically. */
function signatureOf(r) {
  const s = r.style;
  return [
    s.display, s.backgroundColor, s.backgroundImage === 'none' ? '' : s.backgroundImage,
    s.color, `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
    s.borderRadius, `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
    s.fontSize, s.fontWeight, s.letterSpacing, s.textTransform, s.textDecorationLine,
    s.boxShadow === 'none' ? '' : 'shadow',
    r.ctxBg,
  ].join(' | ');
}

/* Is this a button-shaped control, or a plain text link? */
function kindOf(r) {
  const s = r.style;
  const hasBg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
  const hasBorder = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none';
  const padded = parseFloat(s.paddingLeft) >= 8 || parseFloat(s.paddingTop) >= 6;
  const rounded = parseFloat(s.borderRadius) > 0;
  if (r.tag === 'button' || r.tag === 'input') return 'button';
  if ((hasBg || hasBorder) && (padded || rounded)) return 'button';
  if (/\b(button|btn|cta)\b/i.test(r.classes)) return 'button';
  return 'link';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pages = loadPages(args);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const variants = new Map();
  let scanned = 0;
  let controls = 0;
  const failed = [];

  for (const p of pages) {
    const url = BASE + p;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    } catch {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e2) {
        failed.push({ path: p, error: e2.message.split('\n')[0] });
        continue;
      }
    }
    // let lazily-loaded blocks decorate
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(600);

    let found = [];
    try {
      found = await page.evaluate(collectControls);
    } catch (e) {
      failed.push({ path: p, error: e.message.split('\n')[0] });
      continue;
    }

    scanned += 1;
    controls += found.length;

    for (const r of found) {
      const sig = signatureOf(r);
      if (!variants.has(sig)) {
        variants.set(sig, {
          sig, kind: kindOf(r), style: r.style, ctxBg: r.ctxBg, count: 0,
          examples: [], blocks: new Set(), pages: new Set(),
        });
      }
      const v = variants.get(sig);
      v.count += 1;
      v.blocks.add(r.block);
      v.pages.add(p);
      if (v.examples.length < 4) {
        v.examples.push({
          text: r.text, tag: r.tag, classes: r.classes, page: p, block: r.block, hasIcon: r.hasIcon, w: r.w, h: r.h,
        });
      }
    }
    console.log(`  ${String(scanned).padStart(3)}/${pages.length}  ${p}  (${found.length} controls, ${variants.size} variants so far)`);
  }

  await browser.close();

  const list = [...variants.values()]
    .map((v) => ({ ...v, blocks: [...v.blocks].sort(), pages: [...v.pages].sort() }))
    .sort((a, b) => b.count - a.count);

  const result = {
    base: BASE,
    generated: new Date().toISOString(),
    pagesScanned: scanned,
    controlsSeen: controls,
    variants: list,
    buttonVariants: list.filter((v) => v.kind === 'button').length,
    linkVariants: list.filter((v) => v.kind === 'link').length,
    failed,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'controls.json'), JSON.stringify(result, null, 2));

  console.log('');
  console.log(`pages scanned : ${scanned}${failed.length ? ` (${failed.length} failed)` : ''}`);
  console.log(`controls seen : ${controls}`);
  console.log(`unique button variants : ${result.buttonVariants}`);
  console.log(`unique link variants   : ${result.linkVariants}`);
  console.log(`→ ${path.join(OUT_DIR, 'controls.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
