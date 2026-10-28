#!/usr/bin/env node
/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI audit. */
/* eslint-disable no-continue, max-len -- Text-node walk control flow. */
/**
 * Find text that a block cuts off: a text line that runs past the edge of an
 * ancestor with `overflow: hidden | clip` (fixed heights, max-heights, etc.).
 *
 *   node scripts/text-clip-sweep.mjs [remote|local] [host] [--pages=/a,/b] [--widths=1440,1024]
 *     [--stress]   double every authored text node first (what clips with longer copy?)
 *   Run with MSYS_NO_PATHCONV=1 from Git Bash, or the /paths get mangled.
 *
 * Intentional hiding is skipped: display:none / [hidden] / aria-hidden, sr-only
 * boxes, scroll containers, collapsed (near-zero-height) panels, and text that is
 * entirely outside a horizontal clip (off-screen carousel slides). line-clamp and
 * ellipsis truncation are reported separately as "intentional".
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const REPO = '//wsl.localhost/Ubuntu/home/jpanch/projects/NCMEC-Redesign/edge';
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const positional = args.filter((a) => !a.startsWith('--'));
const mode = positional[0] || 'remote';
const HOST = positional[1] || 'https://test--edge--creative2llc.aem.page';
const WIDTHS = (flag('widths') || '1440,1200,1024,920,768,390').split(',').map(Number);
const OUT = flag('out') || path.join(REPO, 'audits', `text-clip-${mode}.json`);
const CONCURRENCY = 3;
const STRESS = args.includes('--stress');

const TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.html': 'text/html',
};

async function pageList() {
  if (flag('pages')) return flag('pages').split(',');
  const res = await fetch(`${HOST}/query-index.json?limit=1000`);
  const { data } = await res.json();
  return data.map((d) => d.path).filter((p) => !/^\/(nav|footer)$|\/fragments?\//.test(p));
}

/* Runs in the page. */
function findClippedText() {
  const SCROLLABLE = new Set(['auto', 'scroll']);
  const CLIPPING = new Set(['hidden', 'clip']);
  const CAROUSELISH = /carousel|slider|slide|track|swiper|marquee|ticker|scroller/i;
  const out = [];
  const root = document.querySelector('main') || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });

  const label = (el) => {
    if (!el) return '';
    const cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
  };

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent) continue;
    if (parent.closest('[aria-hidden="true"], [hidden], .sr-only, .visually-hidden, script, style, noscript, template')) continue;
    if (!parent.checkVisibility({ visibilityProperty: true })) continue;

    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;
    const t = {
      top: Math.min(...rects.map((r) => r.top)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
      left: Math.min(...rects.map((r) => r.left)),
      right: Math.max(...rects.map((r) => r.right)),
    };

    for (let a = parent; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (SCROLLABLE.has(cs.overflowY) || SCROLLABLE.has(cs.overflowX)) break; // reachable by scrolling
      const clipY = CLIPPING.has(cs.overflowY);
      const clipX = CLIPPING.has(cs.overflowX);
      if (!clipX && !clipY) continue;

      const b = a.getBoundingClientRect();
      if (b.width <= 2 || b.height <= 2) break; // sr-only style box
      const box = {
        top: b.top + a.clientTop,
        left: b.left + a.clientLeft,
        bottom: b.top + a.clientTop + a.clientHeight,
        right: b.left + a.clientLeft + a.clientWidth,
      };
      const intentional = (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')
        || cs.textOverflow === 'ellipsis' || getComputedStyle(parent).textOverflow === 'ellipsis'
        || (getComputedStyle(parent).webkitLineClamp || 'none') !== 'none';

      let axis = '';
      let cut = 0;
      let full = false;
      if (clipY && a.clientHeight > 20) {
        const below = t.bottom - box.bottom;
        const above = box.top - t.top;
        if (below > 2 || above > 2) {
          axis = 'y';
          cut = Math.round(Math.max(below, above));
          full = t.top >= box.bottom - 1 || t.bottom <= box.top + 1;
        }
      }
      if (!axis && clipX) {
        const right = t.right - box.right;
        const left = box.left - t.left;
        const fullX = t.left >= box.right - 1 || t.right <= box.left + 1;
        if ((right > 2 || left > 2) && !fullX) {
          axis = 'x';
          cut = Math.round(Math.max(right, left));
        }
      }
      if (axis) {
        const block = parent.closest('.block');
        out.push({
          block: block ? [...block.classList].filter((c) => c !== 'block').join('.') : '(no block)',
          clipper: label(a),
          clipperHeight: Math.round(a.clientHeight),
          clipperWidth: Math.round(a.clientWidth),
          axis,
          cut,
          full,
          intentional: Boolean(intentional),
          carousel: CAROUSELISH.test(label(a)) || Boolean(parent.closest('[class*="carousel"], [class*="slider"], [class*="track"]')),
          text: n.textContent.trim().replace(/\s+/g, ' ').slice(0, 70),
        });
        break;
      }
      // No cut here (e.g. an overflow-x: clip row) - an outer box may still clip it.
    }
  }
  return out;
}

const pages = await pageList();
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const jobs = pages.map((p) => ({ p }));
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function settle(page) {
  // Walk the page so reveal-on-scroll blocks and lazy content settle.
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1200);
}

// One load per page, then resize through the widths: the preview host rate-limits
// (429) if every width is a fresh load.
async function run({ p }) {
  const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: 1000 } });
  const page = await ctx.newPage();
  if (mode === 'local') {
    await page.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      const ext = path.extname(u.pathname);
      if (!/^\/(scripts|blocks|styles|icons)\//.test(u.pathname) || !TYPES[ext]) return route.continue();
      const local = path.join(REPO, u.pathname);
      if (!fs.existsSync(local)) return route.continue();
      return route.fulfill({ status: 200, contentType: TYPES[ext], body: fs.readFileSync(local) });
    });
  }
  try {
    let loaded = false;
    for (let attempt = 0; attempt < 4 && !loaded; attempt += 1) {
      if (attempt) await sleep(30000 * attempt);
      const res = await page.goto(`${HOST}${p}`, { waitUntil: 'networkidle', timeout: 90000 });
      const status = res?.status();
      const blocks = await page.evaluate(() => document.querySelectorAll('main .block').length);
      loaded = status === 200 && blocks > 0;
      if (!loaded && status !== 429 && status !== 200) break;
      if (!loaded && attempt === 3) throw new Error(`not loaded (status ${status}, ${blocks} blocks)`);
    }
    if (!loaded) throw new Error('not loaded');
    if (STRESS) {
      // Simulate an author writing twice as much copy: finds blocks that clip as soon
      // as the content grows, not only the ones clipping today.
      await page.evaluate(() => {
        const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
        const nodes = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.textContent.trim().length > 12 && !n.parentElement.closest('script, style, button, nav')) nodes.push(n);
        }
        nodes.forEach((n) => { n.textContent = `${n.textContent} ${n.textContent.trim()}`; });
      });
    }
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 1000 });
      await settle(page);
      const found = await page.evaluate(findClippedText);
      found.forEach((f) => results.push({ page: p, width: w, ...f }));
    }
  } catch (e) {
    results.push({ page: p, error: e.message.split('\n')[0] });
  } finally {
    await ctx.close();
  }
}

let next = 0;
let done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const job = jobs[next];
    next += 1;
    await run(job);
    done += 1;
    if (done % 10 === 0) console.log(`${done}/${jobs.length}`);
  }
}));
await browser.close();

fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

// Summary: real clipping grouped by block + clipper.
const real = results.filter((r) => !r.error && !r.intentional);
const groups = new Map();
real.forEach((r) => {
  const key = `${r.block} | ${r.clipper} | ${r.axis}${r.carousel ? ' (carousel)' : ''}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
});
console.log(`\n${pages.length} pages x ${WIDTHS.length} widths; ${results.filter((r) => r.error).length} load errors`);
results.filter((r) => r.error).forEach((r) => console.log(`   ERROR ${r.page}: ${r.error}`));
console.log(`intentional truncation (line-clamp/ellipsis): ${results.filter((r) => r.intentional).length} text nodes\n`);
[...groups.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([key, rows]) => {
    const widths = [...new Set(rows.map((r) => r.width))].sort((a, b) => b - a).join(',');
    const pagesHit = [...new Set(rows.map((r) => r.page))];
    const maxCut = Math.max(...rows.map((r) => r.cut));
    console.log(`${key}\n   ${rows.length} nodes, max cut ${maxCut}px, widths ${widths}, ${pagesHit.length} pages: ${pagesHit.slice(0, 4).join(' ')}${pagesHit.length > 4 ? ' …' : ''}`);
    console.log(`   e.g. "${rows[0].text}" (${rows[0].page} @${rows[0].width}, cut ${rows[0].cut}px${rows[0].full ? ', fully hidden' : ''})`);
  });
console.log(`\nfull results: ${OUT}`);
