#!/usr/bin/env node
/* eslint-disable no-console -- CLI audit output. */

/**
 * Skeleton geometry check.
 *
 * The shared loading system (scripts/skeleton.js + the LOADING SYSTEM section of
 * styles/styles.css) deliberately restates NO block geometry. A placeholder
 * instead BORROWS the block's own card / media / body classes, so it inherits
 * that block's real grid, radius, aspect-ratio and padding for free.
 *
 * That is the design's strength and its one fragile point: rename or restructure
 * a card class and the skeleton silently collapses to zero height, or loses its
 * shimmer to the block's flat placeholder colour. Nothing in eslint or stylelint
 * can see that — it only shows up in a browser.
 *
 * So this renders every wired-up skeleton against the block's REAL stylesheet and
 * asserts the things that break silently:
 *
 *   - every borrowed class is still matched by a rule that applies to the
 *     element. This is the load-bearing assertion, because a size threshold
 *     does not catch a rename: strip .amber-alerts-card and the placeholder is
 *     still 628px wide, just wrong — it quietly loses the two-column grid and
 *     stacks instead. Verified by walking the CSSOM (see borrowIsLive).
 *   - the item has real width and height (a class that never existed gives 0x0)
 *   - the media bone fills its wrapper (the wrapper keeps the block's ratio)
 *   - bones are actually sweeping (the block's own background did not win)
 *   - bones are spaced (the body's gap, or the measured fallback, applied)
 *
 * Usage: node scripts/skeleton-check.mjs [--shot <file.png>]
 * Exit 1 on any failure.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8917;

/**
 * One entry per skeleton call site in the codebase. `call` must stay a verbatim
 * copy of the options the block passes; that is what makes this a check on the
 * blocks rather than on itself.
 */
const CASES = [
  {
    name: 'resources-browser (grid)',
    css: ['resources-browser'],
    host: '<div class="resources-browser"><div class="resources-browser-cards" id="T"></div></div>',
    call: {
      count: 8,
      item: 'resources-browser-card',
      media: 'resources-browser-card-image',
      body: 'resources-browser-card-content',
      lines: ['pill', 'title', 'title-sm', 'text', 'text-sm'],
      label: 'Loading resources',
    },
  },
  {
    name: 'resources-browser (list view)',
    css: ['resources-browser'],
    host: '<div class="resources-browser"><div class="resources-browser-cards" data-view="list" id="T"></div></div>',
    call: {
      count: 2,
      item: 'resources-browser-card',
      media: 'resources-browser-card-image',
      body: 'resources-browser-card-content',
      lines: ['pill', 'title', 'title-sm', 'text', 'text-sm'],
      label: 'Loading resources',
    },
  },
  {
    name: 'article-list',
    css: ['article-list'],
    host: '<div class="article-list"><div class="article-list-grid" id="T"></div></div>',
    call: {
      count: 6,
      item: 'article-list-card',
      media: 'article-list-card-media',
      body: 'article-list-card-body',
      lines: ['label', 'title', 'title-sm', 'text', 'text-sm'],
      label: 'Loading articles',
    },
  },
  {
    name: 'resources (carousel)',
    css: ['resources'],
    host: '<div class="resources"><div class="resources-inner"><div class="resources-cards" id="T"></div></div></div>',
    call: {
      count: 4,
      item: 'resources-card',
      media: 'resources-card-image',
      body: 'resources-card-content',
      lines: ['pill', 'title', 'text', 'text-sm'],
      label: 'Loading resources',
    },
  },
  {
    name: 'event-calendar (month grid)',
    css: ['event-calendar'],
    host: '<div class="event-calendar"><div class="event-calendar-grid"><div class="event-calendar-days" id="T"></div></div></div>',
    call: {
      count: 35, item: 'event-calendar-day', lines: ['label:30'], label: 'Loading events',
    },
    // One bone per cell, so there is nothing to space it from.
    skipGap: true,
  },
  {
    name: 'event-calendar (featured cards)',
    css: ['event-calendar'],
    host: '<div class="event-calendar"><div class="event-calendar-featured" id="T"></div></div>',
    call: {
      count: 3,
      item: 'event-calendar-featured-card',
      media: 'event-calendar-featured-image',
      body: 'event-calendar-featured-content',
      lines: ['label', 'title', 'text', 'text-sm'],
      label: 'Loading featured events',
    },
  },
  {
    name: 'amber-alerts',
    css: ['amber-alerts'],
    host: '<div class="amber-alerts"><div class="amber-alerts-list" id="T"></div></div>',
    call: {
      count: 2,
      item: 'amber-alerts-card',
      media: 'amber-alerts-card-media',
      body: 'amber-alerts-card-body',
      lines: ['pill', 'title', 'text', 'text-sm', 'button'],
      label: 'Loading active AMBER Alerts',
    },
  },
  {
    name: 'poster-results (detail)',
    css: ['poster-results'],
    host: '<div class="poster-results"><div class="poster-results-inner"><div class="poster-results-list" id="T"></div></div></div>',
    call: {
      count: 1,
      item: 'poster-results-skeleton',
      media: 'poster-results-skeleton-photo',
      body: 'poster-results-skeleton-lines',
      lines: ['title', 'label', 'text:85', 'text:70', 'text:85', 'text:70'],
      label: 'Loading poster',
    },
  },
  {
    name: 'related-articles (carousel)',
    css: ['related-articles'],
    host: '<div class="related-articles"><div class="related-articles-track" id="T"></div></div>',
    call: {
      count: 3,
      item: 'related-articles-card related-articles-slide',
      media: 'related-articles-card-media',
      body: 'related-articles-card-body',
      lines: ['label', 'title', 'text', 'text-sm'],
      label: 'Loading related articles',
    },
  },
  {
    name: 'report-archive (accordion)',
    css: ['report-archive'],
    host: '<div class="report-archive"><div class="report-archive-wrapper"><div class="report-archive-accordion" id="T"></div></div></div>',
    call: {
      count: 4, item: 'report-archive-item', body: 'report-archive-trigger', lines: ['title-sm'], label: 'Loading reports',
    },
    skipGap: true,
  },
];

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
};

function buildPage() {
  const blocks = [...new Set(CASES.flatMap((c) => c.css))];
  const links = blocks
    .map((b) => `<link rel="stylesheet" href="/blocks/${b}/${b}.css">`)
    .join('\n');
  const sections = CASES
    .map((c, i) => `<section data-case="${i}">${c.host.replace('id="T"', `id="t${i}"`)}</section>`)
    .join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/styles/styles.css">
${links}
<style>body{padding:32px;background:#f6f6f6}section{margin-bottom:56px}</style>
</head><body class="appear">
${sections}
<script type="module">
import { showSkeleton } from '/scripts/skeleton.js';
const CASES = ${JSON.stringify(CASES.map((c) => c.call))};
CASES.forEach((call, i) => showSkeleton(document.getElementById('t' + i), call));
window.skeletonCheckReady = true;
</script></body></html>`;
}

const page = buildPage();

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (rel === 'index.html' || rel === '') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page);
    return;
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

await new Promise((resolve) => { server.listen(PORT, '127.0.0.1', resolve); });

const shotIndex = process.argv.indexOf('--shot');
const shotPath = shotIndex > -1 ? process.argv[shotIndex + 1] : '';

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
tab.on('pageerror', (e) => consoleErrors.push(String(e)));
tab.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await tab.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
await tab.waitForFunction(() => window.skeletonCheckReady === true);
// Past the 120ms fade-in delay, so opacity is settled when we measure.
await tab.waitForTimeout(400);

if (shotPath) await tab.screenshot({ path: shotPath, fullPage: true });

const measured = await tab.evaluate((calls) => {
  /**
   * Is every borrowed class actually matched by a rule that applies to `el`?
   *
   * Asked directly against the CSSOM rather than by diffing computed styles.
   * The diff version was tried first and is subtly wrong: to avoid the control
   * clone perturbing the grid it has to exclude width and height, and
   * .resources-card-image's ONLY contribution is `height: 300px` — so a live
   * class reported as dead. Walking the rules has no layout side effects and
   * answers the real question, which is whether the class was renamed.
   */
  const borrowIsLive = (el, className) => {
    if (!el || !className) return null;
    const tokens = className.split(/\s+/).filter(Boolean);

    const ruleHits = (rules, token) => {
      for (let i = 0; i < rules.length; i += 1) {
        const rule = rules[i];
        if (rule.selectorText && rule.selectorText.includes(`.${token}`)) {
          try {
            if (el.matches(rule.selectorText)) return true;
          } catch {
            // Pseudo-element selectors are not matchable; the class appearing
            // in one is still enough to call it live.
            return true;
          }
        }
        // Recurse AFTER the selector test, never instead of it. CSS Nesting
        // turned CSSStyleRule into a grouping rule, so an ordinary rule now
        // carries an empty .cssRules — an `if/else` that checks .cssRules first
        // silently swallows every plain selector and reports the whole sheet as
        // dead. The length check keeps that from happening again.
        if (rule.cssRules && rule.cssRules.length
          && ruleHits(rule.cssRules, token)) return true;
      }
      return false;
    };

    return tokens.every((token) => [...document.styleSheets].some((sheet) => {
      let rules;
      try { rules = sheet.cssRules; } catch { return false; }
      return rules ? ruleHits(rules, token) : false;
    }));
  };

  return calls.map((call, i) => {
    const host = document.getElementById(`t${i}`);
    const items = [...host.querySelectorAll(':scope > [data-skeleton-item]')];
    const first = items[0];
    if (!first) return { items: 0 };
    const rect = first.getBoundingClientRect();
    const media = first.querySelector('.skeleton-bone.is-media');
    const mediaWrap = first.querySelector('.skeleton-media');
    const bones = [...first.querySelectorAll('.skeleton-bone:not(.is-media)')];
    const boneStyle = bones[0] ? getComputedStyle(bones[0]) : null;
    const body = first.querySelector('.skeleton-body');
    const delays = items.map((el) => Number(el.style.getPropertyValue('--skeleton-index')));

    let boneGapOk = true;
    if (bones.length > 1) {
      const a = bones[0].getBoundingClientRect();
      const b = bones[1].getBoundingClientRect();
      boneGapOk = b.top - a.bottom >= 4;
    }

    let mediaFills = null;
    if (media && mediaWrap) {
      const boneH = media.getBoundingClientRect().height;
      const wrapH = mediaWrap.getBoundingClientRect().height;
      mediaFills = Math.abs(boneH - wrapH) < 1;
    }

    return {
      items: items.length,
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      mediaFills,
      mediaH: media ? Math.round(media.getBoundingClientRect().height) : null,
      sweeping: boneStyle ? boneStyle.animationName === 'skeleton-sweep' : false,
      tinted: boneStyle ? boneStyle.backgroundImage.includes('gradient') : false,
      boneGapOk,
      cascades: new Set(delays).size > 1 || items.length === 1,
      busy: host.getAttribute('aria-busy') === 'true',
      itemBorrowLive: borrowIsLive(first, call.item),
      mediaBorrowLive: borrowIsLive(mediaWrap, call.media),
      bodyBorrowLive: borrowIsLive(body, call.body),
    };
  });
}, CASES.map((c) => c.call));

await browser.close();
server.close();

const failures = [];
CASES.forEach((c, i) => {
  const m = measured[i];
  const fail = (msg) => failures.push(`${c.name}: ${msg}`);

  if (!m.items) { fail('rendered no skeleton items'); return; }
  if (m.items !== c.call.count) fail(`expected ${c.call.count} items, got ${m.items}`);
  if (m.w < 40) fail(`item width collapsed to ${m.w}px — borrowed class "${c.call.item}" may be gone`);
  if (m.h < 24) fail(`item height collapsed to ${m.h}px — borrowed class "${c.call.item}" may be gone`);

  // The rename check. Styles identical to a class-less control means the block
  // class matched nothing, which no size threshold would have noticed.
  if (c.call.item && !m.itemBorrowLive) fail(`borrowed item class "${c.call.item}" styles nothing — renamed or removed`);
  if (c.call.body && !m.bodyBorrowLive) fail(`borrowed body class "${c.call.body}" styles nothing — renamed or removed`);

  if (c.call.media) {
    if (!m.mediaBorrowLive) fail(`borrowed media class "${c.call.media}" styles nothing — renamed or removed`);
    if (m.mediaFills === false) fail(`media bone does not fill .skeleton-media (${m.mediaH}px)`);
    if (!m.mediaH) fail(`media area has no height — check "${c.call.media}"`);
  }
  if (!m.sweeping) fail('bones are not running skeleton-sweep — a block rule overrode the animation');
  if (!m.tinted) fail('bones lost their gradient — a block background beat .skeleton-bone');
  if (!c.skipGap && !m.boneGapOk) fail('bones are touching — body gap and the measured fallback both failed');
  if (!m.cascades) fail('every item shares one --skeleton-index; the cascade is not staggered');
  if (!m.busy) fail('container is not marked aria-busy');
});

if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.join(' | ')}`);

if (failures.length) {
  console.error('✖ skeleton-check FAILED\n');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log(`✔ skeleton-check: ${CASES.length} skeletons render with borrowed geometry, live sweep and staggered cascade.`);
CASES.forEach((c, i) => {
  const m = measured[i];
  console.log(`  ${c.name}: ${m.items} items @ ${m.w}x${m.h}${m.mediaH ? `, media ${m.mediaH}px` : ''}`);
});
