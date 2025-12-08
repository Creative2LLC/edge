import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const FALLBACK_OVERLAY_COLOR = '#000000';
const FALLBACK_OVERLAY_OPACITY = 0.6;

function getField(block, name, rowIndex, columnIndex = 0) {
  const instrumented = block.querySelector(`[data-aue-prop="${name}"]`);
  if (instrumented) return instrumented;
  const row = block.children[rowIndex];
  if (!row) return null;
  return row.children[columnIndex] || row;
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
  return href
    ? {
        href,
        label,
        instrumentationSource: anchor || sourceEl,
      }
    : {};
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

export default function decorate(block) {
  const introSource = getField(block, 'intro', 0, 0);
  const primaryLabel = getField(block, 'primaryLabel', 1, 0);
  const primaryLink = getField(block, 'primaryLink', 1, 1) || primaryLabel;
  const secondaryLabel = getField(block, 'secondaryLabel', 2, 0);
  const secondaryLink = getField(block, 'secondaryLink', 2, 1) || secondaryLabel;
  const backgroundAltSource = getField(block, 'backgroundAlt', 3, 1);
  const backgroundAlt = textContent(backgroundAltSource);
  const backgroundSource = getField(block, 'backgroundImage', 3, 0) || block.querySelector('picture');
  const overlayColorSource = getField(block, 'overlayColor', 4, 0);
  const overlayOpacitySource = getField(block, 'overlayOpacity', 4, 1);
  const overlayColor = textContent(overlayColorSource) || FALLBACK_OVERLAY_COLOR;
  const overlayOpacity = parseOpacity(textContent(overlayOpacitySource))
    ?? FALLBACK_OVERLAY_OPACITY;

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
  const primaryBtn = buildButton(extractLinkData(primaryLink), 'primary');
  const secondaryBtn = buildButton(extractLinkData(secondaryLink), 'secondary');
  if (primaryBtn) actions.append(primaryBtn);
  if (secondaryBtn) actions.append(secondaryBtn);
  if (actions.children.length) content.append(actions);

  const newChildren = [];
  const media = document.createElement('div');
  media.className = 'giving-media';
  const bg = buildBackground(backgroundSource, backgroundAlt);
  if (bg) media.append(bg);
  if (media.childElementCount) newChildren.push(media);

  if (bg && backgroundAltSource) {
    moveInstrumentation(backgroundAltSource, bg.querySelector('img') || bg);
  }

  const meta = document.createElement('div');
  meta.className = 'giving-meta';
  meta.hidden = true;
  if (overlayColorSource) {
    const colorHolder = document.createElement('div');
    colorHolder.textContent = overlayColor;
    moveInstrumentation(overlayColorSource, colorHolder);
    meta.append(colorHolder);
  }
  if (overlayOpacitySource) {
    const opacityHolder = document.createElement('div');
    opacityHolder.textContent = overlayOpacity;
    moveInstrumentation(overlayOpacitySource, opacityHolder);
    meta.append(opacityHolder);
  }

  if (content.childElementCount) newChildren.push(content);
  if (meta.childElementCount) newChildren.push(meta);

  block.replaceChildren(...newChildren);
  block.style.setProperty('--giving-overlay-color', overlayColor);
  block.style.setProperty('--giving-overlay-opacity', overlayOpacity);
}
