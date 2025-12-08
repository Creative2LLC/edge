import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const FALLBACK_OVERLAY_COLOR = '#000000';
const FALLBACK_OVERLAY_OPACITY = 0.6;

const FALLBACK_POSITIONS = {
  intro: [0, 0],
  primaryButton: [1, 0],
  secondaryButton: [2, 0],
  backgroundImage: [3, 0],
};

function getField(block, name, rowIndex, columnIndex = 0) {
  const instrumented = block.querySelector(`[data-aue-prop="${name}"]`);
  if (instrumented) return instrumented;
  const [fallbackRow, fallbackCol] = FALLBACK_POSITIONS[name] || [];
  const row = block.children[rowIndex ?? fallbackRow];
  if (!row) return null;
  return row.children[columnIndex ?? fallbackCol] || row;
}

function textContent(el) {
  return el?.textContent?.trim() || '';
}

function parseOpacity(value) {
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  return Math.min(Math.max(parsed, 0), 1);
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

function extractLinkData(sourceEl) {
  if (!sourceEl) return {};
  const anchor = sourceEl.tagName === 'A' ? sourceEl : sourceEl.querySelector('a');
  const rawText = (anchor || sourceEl).textContent?.trim() || '';
  const href = anchor?.href || (isUrl(rawText) ? rawText : '');
  const label = anchor?.textContent?.trim() || (href ? rawText || href : rawText);
  return href ? { href, label, instrumentationSource: anchor || sourceEl } : {};
}

function buildButton(linkData, variant) {
  if (!linkData?.href) return null;
  const btn = document.createElement('a');
  btn.className = `button${variant ? ` ${variant}` : ''}`;
  btn.textContent = linkData.label || linkData.href;
  btn.href = linkData.href || '#';
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';
  if (linkData.instrumentationSource) {
    moveInstrumentation(linkData.instrumentationSource, btn);
  }
  return btn;
}

function buildBackground(mediaSource, alt) {
  if (!mediaSource) return null;
  const picture = mediaSource.querySelector('picture');
  const img = picture?.querySelector('img') || mediaSource.querySelector('img');
  const src = img?.src || mediaSource.textContent?.trim();
  if (!src) return null;
  const optimized = createOptimizedPicture(src, alt || img?.alt || '', false, [
    { media: '(min-width: 900px)', width: '2000' },
    { media: '(min-width: 600px)', width: '1400' },
    { width: '900' },
  ]);
  moveInstrumentation(img || mediaSource, optimized.querySelector('img') || optimized);
  return optimized;
}

function readMetadata(block) {
  const meta = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    const value = valueEl.textContent.trim();
    if (key === 'overlay color') {
      meta.overlayColor = value;
      rowsToRemove.push(row);
    }
    if (key === 'overlay opacity') {
      meta.overlayOpacity = value;
      rowsToRemove.push(row);
    }
    if (key === 'background alt') {
      meta.backgroundAlt = value;
      rowsToRemove.push(row);
    }
  });
  rowsToRemove.forEach((row) => row.remove());
  return meta;
}

export default function decorate(block) {
  const introSource = getField(block, 'intro');
  const primaryButtonSource = getField(block, 'primaryButton');
  const secondaryButtonSource = getField(block, 'secondaryButton');
  const backgroundSource = getField(block, 'backgroundImage') || block.querySelector('picture');
  const metadata = readMetadata(block);
  const overlayColor = metadata.overlayColor || FALLBACK_OVERLAY_COLOR;
  const overlayOpacity = parseOpacity(metadata.overlayOpacity) ?? FALLBACK_OVERLAY_OPACITY;

  const content = document.createElement('div');
  content.className = 'giving-content';

  if (introSource) {
    const intro = document.createElement('div');
    intro.className = 'giving-intro';
    moveInstrumentation(introSource, intro);
    while (introSource.firstChild) {
      intro.append(introSource.firstChild);
    }
    content.append(intro);
  }

  const actions = document.createElement('div');
  actions.className = 'giving-actions';
  const primaryBtn = buildButton(extractLinkData(primaryButtonSource), 'primary');
  const secondaryBtn = buildButton(extractLinkData(secondaryButtonSource), 'secondary');
  if (primaryBtn) actions.append(primaryBtn);
  if (secondaryBtn) actions.append(secondaryBtn);
  if (actions.children.length) content.append(actions);

  const newChildren = [];
  const media = document.createElement('div');
  media.className = 'giving-media';
  const bgAlt = metadata.backgroundAlt || backgroundSource?.querySelector('img')?.alt || '';
  const bg = buildBackground(backgroundSource, bgAlt);
  if (bg) media.append(bg);
  if (media.childElementCount) newChildren.push(media);

  if (content.childElementCount) newChildren.push(content);

  block.replaceChildren(...newChildren);
  block.style.setProperty('--giving-overlay-color', overlayColor);
  block.style.setProperty('--giving-overlay-opacity', overlayOpacity);
}
