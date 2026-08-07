#!/usr/bin/env node

/* eslint-disable */
import fs from 'node:fs/promises';
import path from 'node:path';

const getOption = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const input = getOption('--input', 'audits/accessibility/summary.json');
const output = getOption('--out', 'audits/accessibility/manual-review.html');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const summary = JSON.parse(await fs.readFile(input, 'utf8'));
const findings = [];
for (const page of summary.pages || []) {
  for (const check of page.incomplete || []) {
    for (const node of check.nodes || []) {
      findings.push({ page, check, node, selector: (node.target || []).join(' ') });
    }
  }
}

const cards = findings.map(({ page, check, node, selector }, index) => {
  const search = [check.id, check.help, page.url, page.title, selector].join(' ').toLowerCase();
  return '<article data-search="' + escapeHtml(search) + '"><div class="number">' + (index + 1) + '</div><div><p><b>' + escapeHtml(node.impact || 'needs-review') + '</b> · <code>' + escapeHtml(check.id) + '</code> · <a href="' + escapeHtml(page.url) + '" target="_blank">Open page</a></p><h2>' + escapeHtml(check.help) + '</h2><p>' + escapeHtml(check.description) + '</p><p><b>WCAG:</b> ' + escapeHtml((check.wcag || []).join(', ') || 'Not mapped') + '</p><p><b>Selector</b><code>' + escapeHtml(selector) + '</code></p><button data-selector="' + escapeHtml(selector) + '">Copy selector</button><p><b>Element found</b><code>' + escapeHtml(node.html) + '</code></p><details open><summary>What needs review</summary><pre>' + escapeHtml(node.failureSummary || 'Review this element on the live page.') + '</pre></details><p><a href="' + escapeHtml(check.helpUrl) + '" target="_blank">Open Axe guidance</a></p></div></article>';
}).join('');

const report = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accessibility manual-review checklist</title><style>body{margin:0;background:#f4f7fa;color:#17212b;font:16px/1.5 system-ui,sans-serif}header{padding:2rem max(1.25rem,calc((100vw - 1400px)/2));background:#102b46;color:#fff}.toolbar,.list{padding:1rem max(1.25rem,calc((100vw - 1400px)/2))}.toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #cbd5df}.toolbar input{width:min(100%,700px);padding:.65rem;font:inherit}.list{display:grid;gap:1rem;max-width:1400px}article{display:grid;grid-template-columns:3.5rem 1fr;background:#fff;border:1px solid #cbd5df;border-radius:.5rem;overflow:hidden}article>div:last-child{padding:1rem}.number{padding:1rem .5rem;background:#e7edf3;font-size:1.25rem;font-weight:700;text-align:center}h2{font-size:1.15rem}code{display:block;max-height:7em;overflow:auto;padding:.45rem;background:#f1f5f9;overflow-wrap:anywhere}button{padding:.35rem .6rem;background:#fff;border:1px solid #075985;color:#075985;border-radius:.25rem;font:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere}.hidden{display:none}@media(max-width:600px){article{grid-template-columns:1fr}.number{text-align:left;padding:.4rem 1rem}}</style><body><header><h1>Accessibility manual-review checklist</h1><p>' + findings.length + ' individual Axe incomplete results. They are not confirmed failures; review each live-page item and mark it pass, issue, or not applicable.</p></header><div class="toolbar"><label for="filter">Filter by rule, page, or selector</label><br><input id="filter" type="search" placeholder="Example: aria, carousel, /get-help"> <span id="count"></span></div><main class="list">' + cards + '</main><script>const input=document.querySelector("#filter"),cards=[...document.querySelectorAll("article")],count=document.querySelector("#count");function filter(){let shown=0;cards.forEach((card)=>{const match=card.dataset.search.includes(input.value.toLowerCase());card.classList.toggle("hidden",!match);if(match)shown+=1;});count.textContent=shown+" shown";}input.oninput=filter;filter();document.onclick=(event)=>{const button=event.target.closest("button");if(button){navigator.clipboard.writeText(button.dataset.selector);button.textContent="Copied";setTimeout(()=>{button.textContent="Copy selector";},1200);}};</script></body></html>';

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, report, 'utf8');
console.log('Wrote ' + output + ' with ' + findings.length + ' manual-review items.');
