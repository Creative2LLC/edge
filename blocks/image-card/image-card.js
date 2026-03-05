import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveAttributes } from '../../scripts/scripts.js';

function getField(block, name) {
  const instrumented = block.querySelector(`[data-aue-prop="${name}"]`);
  if (instrumented) return instrumented;
  return null;
}

function moveFieldBinding(from, to) {
  if (!from || !to) return;
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-prop')
        || attr.startsWith('data-richtext-prop')
        || attr === 'data-aue-label'
        || attr.startsWith('data-richtext-')),
  );
}

function getLinkUrl(sourceEl) {
  if (!sourceEl) return '';
  const a = sourceEl.querySelector('a');
  if (a && a.href) return a.href;
  return sourceEl.textContent.trim();
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

  const target = optimized.querySelector('img') || optimized;
  moveFieldBinding(source, target);
  moveFieldBinding(altSource, target);
  picture.replaceWith(optimized);
  return optimized;
}

const ARROW_SVG = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.167 10h11.666M10.833 5l5 5-5 5" stroke="currentColor" stroke-width="1.67" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function buildButton(text, url, variant) {
  if (!text && !url) return null;
  const btn = document.createElement('a');
  btn.className = `image-card-btn image-card-btn-${variant}`;
  btn.href = url || '#';
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';

  const label = document.createElement('span');
  label.textContent = text;
  btn.append(label);

  const arrow = document.createElement('span');
  arrow.className = 'image-card-btn-arrow';
  arrow.innerHTML = ARROW_SVG;
  btn.append(arrow);

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
  let primaryUrl = getLinkUrl(primaryLinkSource);
  let secondaryText = secondaryTextSource?.textContent?.trim() || '';
  let secondaryUrl = getLinkUrl(secondaryLinkSource);

  /* legacy fallback */
  if (!headingText) {
    const { fields, rowsToRemove } = parseLegacyFields(block);
    if (fields.heading) headingText = fields.heading.textContent.trim();
    if (fields.primaryButtonText) primaryText = fields.primaryButtonText.textContent.trim();
    if (fields.primaryButtonLink) primaryUrl = getLinkUrl(fields.primaryButtonLink);
    if (fields.secondaryButtonText) secondaryText = fields.secondaryButtonText.textContent.trim();
    if (fields.secondaryButtonLink) secondaryUrl = getLinkUrl(fields.secondaryButtonLink);
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
    if (headingSource) moveFieldBinding(headingSource, h2);
    content.append(h2);
  }

  const actions = document.createElement('div');
  actions.className = 'image-card-actions';

  const primaryBtn = buildButton(primaryText, primaryUrl, 'primary');
  const secondaryBtn = buildButton(secondaryText, secondaryUrl, 'secondary');
  if (primaryBtn) actions.append(primaryBtn);
  if (secondaryBtn) actions.append(secondaryBtn);
  if (actions.children.length) content.append(actions);

  block.replaceChildren(media, content);
}
