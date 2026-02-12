import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(block, name) {
  const instrumented = block.querySelector(`[data-aue-prop="${name}"]`);
  if (instrumented) return instrumented;
  return null;
}

function extractLinkData(sourceEl) {
  if (!sourceEl) return {};
  const anchor = sourceEl.tagName === 'A' ? sourceEl : sourceEl.querySelector('a');
  const rawText = (anchor || sourceEl).textContent?.trim() || '';
  const href = anchor?.href || (/^https?:\/\//i.test(rawText) ? rawText : '');
  const label = anchor?.textContent?.trim() || rawText;
  return href ? { href, label, source: anchor || sourceEl } : {};
}

function parseLegacyFields(block) {
  const fields = {};
  const rowsToRemove = [];

  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];

    const keyMap = {
      heading: 'heading',
      text: 'heading',
      'primary button text': 'primaryButtonText',
      'primary button link': 'primaryButtonLink',
      'secondary button text': 'secondaryButtonText',
      'secondary button link': 'secondaryButtonLink',
    };

    if (keyMap[key]) {
      fields[keyMap[key]] = valueEl;
      rowsToRemove.push(row);
    }
  });

  return { fields, rowsToRemove };
}

function buildBackground(block) {
  const source = getField(block, 'image');
  const picture = source?.querySelector('picture')
    || block.querySelector('picture');
  if (!picture) return null;

  const img = picture.querySelector('img');
  if (!img) return picture;

  const altSource = getField(block, 'imageAlt');
  const alt = altSource?.textContent?.trim() || img.alt || '';

  const optimized = createOptimizedPicture(img.src, alt, false, [
    { media: '(min-width: 900px)', width: '2000' },
    { media: '(min-width: 600px)', width: '1400' },
    { width: '900' },
  ]);

  moveInstrumentation(img, optimized.querySelector('img') || optimized);
  picture.replaceWith(optimized);
  return optimized;
}

const ARROW_SVG = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.167 10h11.666M10.833 5l5 5-5 5" stroke="currentColor" stroke-width="1.67" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function buildButton(text, linkData, variant) {
  if (!text && !linkData?.href) return null;
  const btn = document.createElement('a');
  btn.className = `image-card-btn image-card-btn-${variant}`;
  btn.href = linkData?.href || '#';

  const label = document.createElement('span');
  label.textContent = text || linkData?.label || '';
  btn.append(label);

  const arrow = document.createElement('span');
  arrow.className = 'image-card-btn-arrow';
  arrow.innerHTML = ARROW_SVG;
  btn.append(arrow);

  if (linkData?.source) moveInstrumentation(linkData.source, btn);
  return btn;
}

export default function decorate(block) {
  /* --- gather fields --- */
  const headingSource = getField(block, 'heading');
  const primaryTextSource = getField(block, 'primaryButtonText');
  const primaryLinkSource = getField(block, 'primaryButtonLink');
  const secondaryTextSource = getField(block, 'secondaryButtonText');
  const secondaryLinkSource = getField(block, 'secondaryButtonLink');

  let headingText = headingSource?.textContent?.trim() || '';
  let primaryText = primaryTextSource?.textContent?.trim() || '';
  let primaryLink = extractLinkData(primaryLinkSource);
  let secondaryText = secondaryTextSource?.textContent?.trim() || '';
  let secondaryLink = extractLinkData(secondaryLinkSource);

  /* legacy fallback: 6-column rows [image | heading | btn1Text | btn1Link | btn2Text | btn2Link] */
  if (!headingText) {
    const { fields, rowsToRemove } = parseLegacyFields(block);
    if (fields.heading) headingText = fields.heading.textContent.trim();
    if (fields.primaryButtonText) primaryText = fields.primaryButtonText.textContent.trim();
    if (fields.primaryButtonLink) primaryLink = extractLinkData(fields.primaryButtonLink);
    if (fields.secondaryButtonText) secondaryText = fields.secondaryButtonText.textContent.trim();
    if (fields.secondaryButtonLink) secondaryLink = extractLinkData(fields.secondaryButtonLink);
    rowsToRemove.forEach((r) => r.remove());
  }

  /* --- background image --- */
  const bg = buildBackground(block);

  /* --- build DOM --- */
  const media = document.createElement('div');
  media.className = 'image-card-media';
  if (bg) media.append(bg);

  const content = document.createElement('div');
  content.className = 'image-card-content';

  if (headingText) {
    const h2 = document.createElement('h2');
    h2.className = 'image-card-heading';
    h2.textContent = headingText;
    if (headingSource) moveInstrumentation(headingSource, h2);
    content.append(h2);
  }

  const actions = document.createElement('div');
  actions.className = 'image-card-actions';

  const primaryBtn = buildButton(primaryText, primaryLink, 'primary');
  const secondaryBtn = buildButton(secondaryText, secondaryLink, 'secondary');
  if (primaryBtn) actions.append(primaryBtn);
  if (secondaryBtn) actions.append(secondaryBtn);
  if (actions.children.length) content.append(actions);

  block.replaceChildren(media, content);
}
