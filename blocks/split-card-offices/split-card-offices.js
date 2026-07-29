import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

/* ---------- AEM resource + field helpers (mirrors split-card-info.js) ---------- */

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

function normalizeJsonFieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.href || value.path || value.url || '').trim();
  }
  return '';
}

function normalizeColorValue(value) {
  const normalized = normalizeJsonFieldValue(value);
  if (!normalized) return '';
  // EDS may auto-link a hex value into an href; pull the hex back out.
  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalized) && hexMatch) {
    return hexMatch[0];
  }
  return normalized;
}

async function getBlockResourceData(block) {
  const resource = block.getAttribute('data-aue-resource') || '';
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return {};

  try {
    const response = await fetch(`${resourcePath}.json`);
    if (!response.ok) return {};
    return await response.json();
  } catch (error) {
    return {};
  }
}

const FIELD_INDEX = {
  headingText: 0,
  feature1Icon: 1,
  feature1IconColor: 2,
  feature1Heading: 3,
  feature2Icon: 4,
  feature2IconColor: 5,
  feature2Text: 6,
  feature3Icon: 7,
  feature3IconColor: 8,
  feature3Text: 9,
  button1Icon: 10,
  button1Text: 11,
  button1Link: 12,
  button2Icon: 13,
  button2Text: 14,
  button2Link: 15,
};

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getRowCell(row) {
  if (!row) return null;
  if (row.children.length === 2) return row.children[1];
  return row.children[0] || row;
}

function getFallbackCell(block, name) {
  const index = FIELD_INDEX[name];
  if (index === undefined) return null;
  return getRowCell(getRows(block)[index]);
}

function getField(block, name) {
  return readTextField(block, name, { fallbackCell: getFallbackCell(block, name) }).value;
}

function getRichTextField(block, name) {
  return readRichTextField(block, name, { fallbackCell: getFallbackCell(block, name) }).html;
}

function getLinkField(block, name) {
  return readLinkField(block, name, { fallbackCell: getFallbackCell(block, name) }).value;
}

function getPictureFor(block, name) {
  return readImageField(block, name, { fallbackCell: getFallbackCell(block, name) }).picture;
}

/**
 * Color text fields get auto-linked by EDS (because `#abc123` looks like a
 * URL fragment) and the resulting <a> often loses its data-aue-prop marker.
 * Walk every row that has *no* data-aue-prop element and read the anchor
 * text positionally — same trick split-card-info.js / split-card.js use.
 */
function collectOrphanedColorValues(block) {
  const values = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.querySelector('[data-aue-prop]')) return;
    const anchor = row.querySelector('a');
    if (anchor) values.push(anchor.textContent.trim());
    else values.push(row.textContent.trim());
  });
  return values;
}

/* ---------- Icon builders ---------- */

/**
 * Build a color-tinted icon using CSS mask, mirroring the split-card-detail
 * `buildIcon` pattern. Falls back to a plain <img> when no color is supplied.
 */
function buildColoredIcon(picture, color, size, className) {
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.style.setProperty('width', `${size}px`, 'important');
  wrap.style.setProperty('height', `${size}px`, 'important');
  wrap.style.setProperty('flex', `0 0 ${size}px`, 'important');

  const img = picture?.querySelector('img');
  if (!img) return wrap;

  wrap.style.setProperty('background-color', color, 'important');
  wrap.style.setProperty('-webkit-mask-image', `url(${img.src})`, 'important');
  wrap.style.setProperty('mask-image', `url(${img.src})`, 'important');
  wrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
  wrap.style.setProperty('mask-size', 'contain', 'important');
  wrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('-webkit-mask-position', 'center', 'important');
  wrap.style.setProperty('mask-position', 'center', 'important');

  return wrap;
}

/**
 * Plain logo image (used on the CTA buttons). Keeps original colors.
 */
function buildPlainIcon(picture, size, className) {
  const wrap = document.createElement('span');
  wrap.className = className;

  const img = picture?.querySelector('img')?.cloneNode(true);
  if (!img) return wrap;

  img.removeAttribute('width');
  img.removeAttribute('height');
  img.style.setProperty('width', `${size}px`, 'important');
  img.style.setProperty('height', `${size}px`, 'important');
  img.style.setProperty('object-fit', 'contain', 'important');
  img.loading = 'lazy';
  wrap.append(img);
  return wrap;
}

/* ---------------------------------- decorate ---------------------------------- */

export default async function decorate(block) {
  const resourceData = await getBlockResourceData(block);

  const headingText = getField(block, 'headingText') || normalizeJsonFieldValue(resourceData.headingText);

  const button1Picture = getPictureFor(block, 'button1Icon');
  const button1Text = getField(block, 'button1Text') || normalizeJsonFieldValue(resourceData.button1Text);
  const button1Link = getLinkField(block, 'button1Link') || normalizeJsonFieldValue(resourceData.button1Link);

  const button2Picture = getPictureFor(block, 'button2Icon');
  const button2Text = getField(block, 'button2Text') || normalizeJsonFieldValue(resourceData.button2Text);
  const button2Link = getLinkField(block, 'button2Link') || normalizeJsonFieldValue(resourceData.button2Link);

  const feature1Picture = getPictureFor(block, 'feature1Icon');
  const feature1Heading = getField(block, 'feature1Heading') || normalizeJsonFieldValue(resourceData.feature1Heading);

  const feature2Picture = getPictureFor(block, 'feature2Icon');
  const feature2Text = getRichTextField(block, 'feature2Text') || normalizeJsonFieldValue(resourceData.feature2Text);

  const feature3Picture = getPictureFor(block, 'feature3Icon');
  const feature3Text = getRichTextField(block, 'feature3Text') || normalizeJsonFieldValue(resourceData.feature3Text);

  // Color fields: try resource JSON first (most reliable), then DOM by name,
  // then fall back to positionally reading orphaned auto-linked rows.
  let feature1IconColor = normalizeColorValue(resourceData.feature1IconColor) || normalizeColorValue(getField(block, 'feature1IconColor'));
  let feature2IconColor = normalizeColorValue(resourceData.feature2IconColor) || normalizeColorValue(getField(block, 'feature2IconColor'));
  let feature3IconColor = normalizeColorValue(resourceData.feature3IconColor) || normalizeColorValue(getField(block, 'feature3IconColor'));

  if (!feature1IconColor || !feature2IconColor || !feature3IconColor) {
    const orphans = collectOrphanedColorValues(block);
    // The three color fields appear in this order in _split-card-offices.json:
    //   feature1IconColor, feature2IconColor, feature3IconColor
    if (!feature1IconColor) feature1IconColor = normalizeColorValue(orphans[0] || '');
    if (!feature2IconColor) feature2IconColor = normalizeColorValue(orphans[1] || '');
    if (!feature3IconColor) feature3IconColor = normalizeColorValue(orphans[2] || '');
  }

  // Defaults
  feature1IconColor = feature1IconColor || '#FAAB60';
  feature2IconColor = feature2IconColor || '#008DB6';
  feature3IconColor = feature3IconColor || '#008DB6';

  /* ---------- build the new DOM ---------- */

  const container = document.createElement('div');
  container.className = 'split-card-offices-container';

  /* Left side */
  const left = document.createElement('div');
  left.className = 'split-card-offices-left';

  if (headingText) {
    const heading = document.createElement('h2');
    heading.className = 'split-card-offices-heading';
    heading.textContent = headingText;
    left.append(heading);
  }

  const buttonRow = document.createElement('div');
  buttonRow.className = 'split-card-offices-buttons';

  function buildCtaButton(picture, label, href) {
    if (!label && !picture) return null;
    const btn = document.createElement(href ? 'a' : 'span');
    btn.className = 'split-card-offices-cta-btn';
    if (href) btn.href = href;

    const iconEl = buildPlainIcon(picture, 24, 'split-card-offices-cta-btn-icon');
    btn.append(iconEl);

    if (label) {
      const labelEl = document.createElement('span');
      labelEl.className = 'split-card-offices-cta-btn-label';
      labelEl.textContent = label;
      btn.append(labelEl);
    }
    return btn;
  }

  const btn1 = buildCtaButton(button1Picture, button1Text, button1Link);
  const btn2 = buildCtaButton(button2Picture, button2Text, button2Link);
  if (btn1) buttonRow.append(btn1);
  if (btn2) buttonRow.append(btn2);

  container.append(left);

  /* Right side */
  const right = document.createElement('div');
  right.className = 'split-card-offices-right';

  function buildFeatureRow(picture, color, iconSize, isHeading, headingValue, richTextValue) {
    const row = document.createElement('div');
    row.className = 'split-card-offices-feature-row';
    if (isHeading) row.classList.add('is-heading-row');

    const icon = buildColoredIcon(picture, color, iconSize, 'split-card-offices-feature-icon');
    row.append(icon);

    const textWrap = document.createElement('div');
    textWrap.className = 'split-card-offices-feature-text';

    if (isHeading) {
      if (headingValue) {
        const h = document.createElement('h3');
        h.className = 'split-card-offices-feature-heading';
        h.textContent = headingValue;
        textWrap.append(h);
      }
    } else if (richTextValue) {
      textWrap.innerHTML = richTextValue;
    }

    row.append(textWrap);
    return row;
  }

  right.append(buildFeatureRow(feature1Picture, feature1IconColor, 48, true, feature1Heading, ''));
  right.append(buildFeatureRow(feature2Picture, feature2IconColor, 24, false, '', feature2Text));
  right.append(buildFeatureRow(feature3Picture, feature3IconColor, 24, false, '', feature3Text));
  if (btn1 || btn2) right.append(buttonRow);

  container.append(right);

  block.textContent = '';
  block.append(container);
}
