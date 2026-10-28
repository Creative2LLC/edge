#!/usr/bin/env node

/* eslint-disable no-console, no-restricted-syntax, prefer-template, max-len, object-curly-newline, no-continue -- CLI report. */

/**
 * Creates a visual gallery of every axe color-contrast finding from an
 * accessibility audit's summary.json.
 *
 * Usage:
 *   npm run audit:contrast
 *   npm run audit:contrast -- --input audits/accessibility-rerun/summary.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_INPUT = 'audits/accessibility/summary.json';
const DEFAULT_OUTPUT = 'audits/accessibility/contrast-examples.html';

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input' && argv[i + 1]) { args.input = argv[i + 1]; i += 1; } else if (argv[i] === '--out' && argv[i + 1]) { args.output = argv[i + 1]; i += 1; }
  }
  return args;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function contrastDetails(summary) {
  const match = summary.match(/contrast of ([\d.]+).*?foreground color: (#[0-9a-f]{6,8}).*?background color: (#[0-9a-f]{6,8}).*?Expected contrast ratio of ([\d.]+)/is);
  if (!match) return null;
  return { ratio: match[1], foreground: match[2], background: match[3], expected: match[4] };
}

function collectFindings(summary) {
  const rows = [];
  for (const page of summary.pages || []) {
    const contrast = (page.violations || []).find((violation) => violation.id === 'color-contrast');
    if (!contrast) continue;
    for (const node of contrast.nodes || []) {
      rows.push({
        url: page.url,
        title: page.title,
        selector: (node.target || []).join(' '),
        html: node.html,
        failureSummary: node.failureSummary || '',
        ...contrastDetails(node.failureSummary || ''),
      });
    }
  }
  return rows;
}

function card(finding) {
  const search = [finding.title, finding.url, finding.selector, finding.html, finding.failureSummary].join(' ').toLowerCase();
  const swatch = finding.foreground
    ? '<div class="swatch" style="color:' + finding.foreground + ';background:' + finding.background + '">Aa&nbsp; Sample text</div><p class="colors"><code>' + finding.foreground + '</code> on <code>' + finding.background + '</code></p>'
    : '<div class="swatch unavailable">Color pair could not be calculated automatically.</div>';
  const ratio = finding.ratio
    ? '<span class="ratio bad">' + finding.ratio + ':1</span><span class="expected">needs ' + finding.expected + ':1</span>'
    : '<span class="ratio unknown">manual review</span>';
  return '<article class="finding" data-search="' + escapeHtml(search) + '"><div class="preview">' + swatch + '</div><div class="detail"><div class="topline">' + ratio + '<a href="' + escapeHtml(finding.url) + '" target="_blank" rel="noopener">Open page</a></div><h2>' + escapeHtml(finding.title || new URL(finding.url).pathname) + '</h2><p class="url">' + escapeHtml(new URL(finding.url).pathname) + '</p><p><strong>Selector</strong><code class="selector">' + escapeHtml(finding.selector) + '</code></p><button class="copy" type="button" data-selector="' + escapeHtml(finding.selector) + '">Copy selector</button><p><strong>Element</strong><code class="html">' + escapeHtml(finding.html) + '</code></p><details><summary>axe explanation</summary><pre>' + escapeHtml(finding.failureSummary) + '</pre></details></div></article>';
}

function reportHtml(metadata, findings) {
  const numeric = findings.filter((finding) => finding.ratio).length;
  const cards = findings.map(card).join('\n');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Color contrast gallery</title><style>body{margin:0;background:#f4f7fa;color:#17212b;font:16px/1.5 system-ui,sans-serif}header{padding:2rem max(1.25rem,calc((100vw - 1400px)/2));background:#102b46;color:#fff}h1{margin:0;font-size:clamp(1.8rem,3vw,2.7rem)}header p{max-width:70ch}.toolbar{position:sticky;top:0;z-index:1;padding:1rem max(1.25rem,calc((100vw - 1400px)/2));background:#fff;border-bottom:1px solid #cbd5df}.toolbar input{box-sizing:border-box;width:min(100%,700px);padding:.7rem;border:1px solid #64748b;border-radius:.3rem;font:inherit}.count{margin-left:.6rem;color:#475569}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(370px,1fr));gap:1.25rem;padding:1.5rem max(1.25rem,calc((100vw - 1400px)/2))}.finding{overflow:hidden;background:#fff;border:1px solid #cbd5df;border-radius:.5rem;box-shadow:0 1px 2px rgb(15 23 42/.06)}.preview{padding:1rem;background:#e7edf3}.swatch{display:flex;min-height:92px;align-items:center;justify-content:center;border:1px solid rgb(0 0 0/.2);border-radius:.3rem;font-size:20px;font-weight:700;text-align:center}.swatch.unavailable{background:repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 12px,#cbd5e1 12px,#cbd5e1 24px);color:#17212b;font-size:15px}.colors{margin:.55rem 0 0;text-align:center}.detail{padding:1rem}.topline{display:flex;gap:.65rem;align-items:center}.topline a{margin-left:auto}.ratio{padding:.15rem .45rem;border-radius:999px;font-weight:700}.bad{background:#fee2e2;color:#991b1b}.unknown{background:#fef3c7;color:#92400e}.expected{color:#7f1d1d;font-size:.9rem}h2{margin:.7rem 0 0;font-size:1.1rem}.url{margin:.1rem 0 1rem;color:#475569;font-size:.9rem}code{font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}.selector,.html{display:block;max-height:6em;overflow:auto;padding:.45rem;background:#f1f5f9;border-radius:.25rem;overflow-wrap:anywhere}.copy{padding:.35rem .6rem;border:1px solid #075985;border-radius:.25rem;background:#fff;color:#075985;font:inherit;font-size:.85rem;cursor:pointer}details{margin-top:.75rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.4 ui-monospace,monospace}.hidden{display:none}</style></head><body><header><h1>Color contrast gallery</h1><p>' + findings.length + ' flagged elements from ' + metadata.pagesScanned + ' pages. Each card reproduces the reported foreground/background pair so you can judge the issue before opening the live page. ' + numeric + ' findings include a calculable color pair; the rest need visual/manual review.</p></header><div class="toolbar"><label for="filter">Filter by page, component, selector, or color</label><br><input id="filter" type="search" placeholder="Example: news-tag, #008db6, /about"><span class="count" id="count"></span></div><main class="gallery">' + cards + '</main><script>const input=document.querySelector("#filter");const cards=[...document.querySelectorAll(".finding")];const count=document.querySelector("#count");function filter(){const value=input.value.toLowerCase();let shown=0;cards.forEach((card)=>{const match=card.dataset.search.includes(value);card.classList.toggle("hidden",!match);if(match)shown+=1;});count.textContent=shown+" shown";}input.addEventListener("input",filter);filter();document.addEventListener("click",(event)=>{const button=event.target.closest(".copy");if(!button)return;navigator.clipboard.writeText(button.dataset.selector);button.textContent="Copied";setTimeout(()=>{button.textContent="Copy selector";},1200);});</script></body></html>';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = JSON.parse(await fs.readFile(args.input, 'utf8'));
  const findings = collectFindings(summary);
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, reportHtml(summary.metadata || {}, findings), 'utf8');
  console.log('Wrote ' + args.output + ' with ' + findings.length + ' color-contrast examples.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
