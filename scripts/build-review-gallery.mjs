#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax -- CLI output. */
/* eslint-disable no-continue, max-len -- CLI control flow. */

/**
 * Builds a single self-contained HTML review gallery from the screenshots
 * captured by `audit:pages`. Each page becomes a row of its viewport
 * screenshots (thumbnails, click to enlarge), with overflow badges pulled from
 * each page's summary.json — so you can triage the whole site's responsive
 * state in one scroll instead of opening PNGs one by one.
 *
 * Output: audits/pages/gallery.html  (open it in a browser)
 *   - images are referenced by relative path, so keep it inside audits/pages/
 *   - toolbar: filter by viewport, search pages, "overflow only", thumb size
 *
 * Usage:
 *   npm run gallery
 *   node scripts/build-review-gallery.mjs --root audits/pages
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { existsSync } from 'node:fs';

const DEFAULT_ROOT = 'audits/pages';
const OVERFLOW_TOLERANCE_PX = 3;

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1]) { args.root = argv[i + 1]; i += 1; }
  }
  return args;
}

function numericPrefix(name) {
  const m = name.match(/(\d+)/);
  return m ? Number(m[1]) : 9999;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[c]));

async function collectPages(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const pages = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const screensDir = path.join(root, entry.name, 'screens');
    if (!existsSync(screensDir)) continue;

    // eslint-disable-next-line no-await-in-loop
    const files = (await fs.readdir(screensDir)).filter((f) => f.endsWith('.png'));
    if (files.length === 0) continue;

    let summary = {};
    try {
      // eslint-disable-next-line no-await-in-loop
      summary = JSON.parse(await fs.readFile(path.join(root, entry.name, 'summary.json'), 'utf8'));
    } catch { /* no summary */ }
    const overflowByVp = Object.fromEntries((summary.overflow || []).map((o) => [o.viewport, o.overflowPx]));

    const shots = files
      .map((file) => {
        const vp = file.replace(/\.png$/, '');
        return { vp, src: `${entry.name}/screens/${file}`, over: overflowByVp[vp] ?? null };
      })
      .sort((a, b) => numericPrefix(a.vp) - numericPrefix(b.vp) || a.vp.localeCompare(b.vp));

    pages.push({
      name: entry.name,
      scores: summary.scores || {},
      maxOverflow: summary.maxOverflowPx ?? null,
      lhPass: summary.lhPass ?? null,
      shots,
    });
  }
  // Overflow pages first, then alphabetical.
  pages.sort((a, b) => (b.maxOverflow ?? -1) - (a.maxOverflow ?? -1) || a.name.localeCompare(b.name));
  return pages;
}

function renderPage(page) {
  const badge = page.maxOverflow > OVERFLOW_TOLERANCE_PX
    ? `<span class="tag bad">overflow ${page.maxOverflow}px</span>` : '';
  const lh = Object.keys(page.scores).length
    ? `<span class="tag">LH ${['performance', 'accessibility', 'best-practices', 'seo'].map((c) => page.scores[c] ?? '-').join('/')}</span>` : '';

  const thumbs = page.shots.map((s) => {
    const over = s.over != null && s.over > OVERFLOW_TOLERANCE_PX ? `<span class="ovf">+${s.over}px</span>` : '';
    return `<figure class="thumb" data-vp="${esc(s.vp)}">
      <figcaption>${esc(s.vp)}${over}</figcaption>
      <img loading="lazy" src="${esc(s.src)}" alt="${esc(page.name)} ${esc(s.vp)}" data-full="${esc(s.src)}">
    </figure>`;
  }).join('');

  const path0 = `/${page.name.replace(/-/g, '/')}`; // rough hint back to the URL
  return `<section class="page${page.maxOverflow > OVERFLOW_TOLERANCE_PX ? ' has-ovf' : ''}" data-name="${esc(page.name)}">
    <h2>${esc(page.name)} ${badge} ${lh}
      <a class="live" href="https://test--edge--creative2llc.aem.page${esc(path0)}" target="_blank" rel="noopener">live &#8599;</a>
    </h2>
    <div class="row">${thumbs}</div>
  </section>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.root)) throw new Error(`No ${args.root} — run \`npm run audit:pages\` first.`);
  const pages = await collectPages(args.root);
  if (pages.length === 0) throw new Error(`No screenshots found under ${args.root}/*/screens/.`);

  const viewports = [...new Set(pages.flatMap((p) => p.shots.map((s) => s.vp)))]
    .sort((a, b) => numericPrefix(a) - numericPrefix(b));
  const vpToggles = viewports.map((vp) => `<label><input type="checkbox" checked data-vp="${esc(vp)}"> ${esc(vp)}</label>`).join('');
  const ovfCount = pages.filter((p) => p.maxOverflow > OVERFLOW_TOLERANCE_PX).length;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Responsive Review Gallery</title>
<style>
  :root { --bg:#fff; --fg:#1a1a1a; --muted:#6b7680; --card:#f6f6f7; --line:#e2e2e6; --bad:#c7352b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#15171a; --fg:#e8e8ea; --muted:#9aa2a9; --card:#1e2126; --line:#2c313a; --bad:#ff6a5c; } }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  header.bar { position:sticky; top:0; z-index:10; background:var(--bg); border-bottom:1px solid var(--line);
    padding:10px 16px; display:flex; flex-wrap:wrap; gap:14px; align-items:center; }
  header.bar h1 { font-size:15px; margin:0 8px 0 0; }
  header.bar .count { color:var(--muted); font-size:13px; }
  header.bar input[type=search] { padding:6px 10px; border:1px solid var(--line); border-radius:6px; background:var(--card); color:var(--fg); }
  header.bar .vps { display:flex; flex-wrap:wrap; gap:2px 12px; font-size:12px; color:var(--muted); }
  header.bar label { display:inline-flex; gap:4px; align-items:center; cursor:pointer; }
  header.bar .right { margin-left:auto; display:flex; gap:14px; align-items:center; font-size:13px; }
  main { padding:8px 16px 60px; }
  section.page { border-top:1px solid var(--line); padding:14px 0; }
  section.page h2 { font-size:14px; margin:0 0 10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .tag { font-size:11px; font-weight:600; padding:2px 7px; border-radius:99px; background:var(--card); color:var(--muted); }
  .tag.bad { background:var(--bad); color:#fff; }
  a.live { font-size:12px; color:var(--muted); text-decoration:none; margin-left:auto; }
  a.live:hover { color:var(--fg); }
  .row { display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; }
  figure.thumb { margin:0; flex:0 0 auto; width:var(--tw,220px); }
  figure.thumb figcaption { font-size:11px; color:var(--muted); margin-bottom:4px; display:flex; justify-content:space-between; }
  figure.thumb .ovf { color:var(--bad); font-weight:700; }
  figure.thumb img { width:100%; height:auto; max-height:520px; object-fit:cover; object-position:top;
    border:1px solid var(--line); border-radius:6px; background:#fff; cursor:zoom-in; display:block; }
  #lightbox { position:fixed; inset:0; background:rgba(0,0,0,.85); display:none; z-index:100; overflow:auto; cursor:zoom-out; }
  #lightbox img { display:block; margin:20px auto; max-width:1240px; width:100%; }
  .hidden { display:none !important; }
</style>
</head>
<body>
<header class="bar">
  <h1>Responsive Review</h1>
  <span class="count">${pages.length} pages &middot; <strong style="color:var(--bad)">${ovfCount}</strong> with overflow</span>
  <input type="search" id="search" placeholder="filter pages...">
  <div class="vps">${vpToggles}</div>
  <div class="right">
    <label><input type="checkbox" id="ovfOnly"> overflow only</label>
    <label>size <input type="range" id="size" min="140" max="420" value="220"></label>
  </div>
</header>
<main id="pages">
${pages.map(renderPage).join('\n')}
</main>
<div id="lightbox"><img alt=""></div>
<script>
  const root = document.documentElement;
  const lb = document.getElementById('lightbox');
  const lbImg = lb.querySelector('img');
  document.getElementById('pages').addEventListener('click', (e) => {
    const img = e.target.closest('img[data-full]');
    if (!img) return;
    lbImg.src = img.dataset.full; lb.style.display = 'block';
  });
  lb.addEventListener('click', () => { lb.style.display = 'none'; lbImg.src = ''; });
  document.getElementById('size').addEventListener('input', (e) => root.style.setProperty('--tw', e.target.value + 'px'));

  const search = document.getElementById('search');
  const ovfOnly = document.getElementById('ovfOnly');
  function applyPageFilters() {
    const q = search.value.trim().toLowerCase();
    document.querySelectorAll('section.page').forEach((s) => {
      const nameHit = s.dataset.name.includes(q);
      const ovfHit = !ovfOnly.checked || s.classList.contains('has-ovf');
      s.classList.toggle('hidden', !(nameHit && ovfHit));
    });
  }
  search.addEventListener('input', applyPageFilters);
  ovfOnly.addEventListener('change', applyPageFilters);

  document.querySelectorAll('.vps input[data-vp]').forEach((cb) => {
    cb.addEventListener('change', () => {
      document.querySelectorAll('figure.thumb[data-vp="' + CSS.escape(cb.dataset.vp) + '"]')
        .forEach((f) => f.classList.toggle('hidden', !cb.checked));
    });
  });
</script>
</body>
</html>
`;

  const out = path.join(args.root, 'gallery.html');
  await fs.writeFile(out, html, 'utf8');
  console.log(`Wrote ${out}`);
  console.log(`${pages.length} pages, ${viewports.length} viewports (${ovfCount} pages with overflow).`);
  console.log(`Open it: file://${path.resolve(out)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
