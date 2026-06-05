import { moveInstrumentation } from '../../scripts/scripts.js';
import { readImageField, readLinkField, readTextField } from '../../scripts/block-field-utils.js';
import { injectColorPickers } from '../../scripts/block-color-picker.js';

function directRowOf(block, element) {
  let rowEl = element;
  while (rowEl && rowEl.parentElement !== block) {
    rowEl = rowEl.parentElement;
  }
  return rowEl && rowEl.parentElement === block ? rowEl : null;
}

const IS_EDITOR = Boolean(document.querySelector('[data-aue-resource]'));

function readField(block, name, labels = []) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

// Like readField but keeps the row hidden in editor context so the source
// element stays in the DOM and color picker changes can write back through it.
function readColorField(block, name, labels = []) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (IS_EDITOR && field.source) {
      row.style.cssText = 'display:none!important';
    } else {
      row.remove();
    }
  }
  return field;
}

function readLink(block, name, labels = []) {
  const field = readLinkField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

function readImage(block, name, labels = []) {
  const field = readImageField(block, name, { labels });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : '';
}

function normalizeCssLength(value, propertyName) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^-?\d+(\.\d+)?$/u.test(normalized)) return `${normalized}px`;
  if (!window.CSS?.supports || window.CSS.supports(propertyName, normalized)) return normalized;
  return '';
}

function normalizeOption(value, allowedValues, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return allowedValues.includes(normalized) ? normalized : fallback;
}

function normalizeFontWeight(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const namedWeights = {
    regular: '400',
    normal: '400',
    medium: '500',
    semibold: '600',
    'semi-bold': '600',
    bold: '700',
    extrabold: '800',
    'extra-bold': '800',
  };
  if (namedWeights[normalized]) return namedWeights[normalized];
  return /^(?:[1-9]00)$/u.test(normalized) ? normalized : '';
}

function normalizeIconName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildImageIcon(imageField, altText) {
  if (!imageField?.img && !imageField?.picture) return null;

  const icon = document.createElement('span');
  icon.className = 'colored-button-icon';
  let media;

  if (imageField.picture) {
    media = imageField.picture.cloneNode(true);
  } else {
    media = imageField.img.cloneNode(true);
  }

  const img = media.tagName === 'IMG' ? media : media.querySelector('img');
  if (img) {
    img.alt = altText || '';
    img.loading = 'lazy';
    if (imageField.img) moveInstrumentation(imageField.img, img);
  }
  if (imageField.source && media) moveInstrumentation(imageField.source, media);
  icon.append(media);
  return icon;
}

function buildNamedIcon(iconName, altText) {
  const normalizedName = normalizeIconName(iconName);
  if (!normalizedName) return null;

  const icon = document.createElement('span');
  icon.className = 'colored-button-icon';

  const img = document.createElement('img');
  img.src = `${window.hlx?.codeBasePath || ''}/icons/${normalizedName}.svg`;
  img.alt = altText || '';
  img.loading = 'lazy';
  img.width = 20;
  img.height = 20;
  icon.append(img);

  return icon;
}

function appendLabel(labelField, label, fallbackLabel) {
  if (labelField.source) {
    moveInstrumentation(labelField.source, label);
    while (labelField.source.firstChild) label.append(labelField.source.firstChild);
  }

  if (!label.textContent.trim()) {
    label.textContent = fallbackLabel;
  }
}

export default function decorate(block) {
  const labelField = readField(block, 'label', ['button text', 'text', 'label']);
  const linkField = readLink(block, 'link', ['button link', 'url', 'href']);
  const bgField = readColorField(block, 'backgroundColor', ['background color', 'button color']);
  const backgroundColor = normalizeColorValue(bgField.value) || '#008DB6';
  const txtField = readColorField(block, 'textColor', ['text color']);
  const textColor = normalizeColorValue(txtField.value) || '#FFFFFF';
  const bdrField = readColorField(block, 'borderColor', ['border color']);
  const borderColor = normalizeColorValue(bdrField.value) || backgroundColor;
  const appearance = normalizeOption(readField(block, 'appearance', ['style', 'button style']).value, ['solid', 'outlined', 'inverted'], 'solid');
  const invertOnHover = normalizeOption(readField(block, 'invertOnHover', ['invert on hover']).value, ['yes', 'no'], 'no');
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'button alignment']).value,
    ['left', 'center', 'right', 'stretch'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment']).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  const fontSize = normalizeCssLength(readField(block, 'fontSize', ['font size', 'text size']).value, 'font-size');
  const fontWeight = normalizeFontWeight(readField(block, 'fontWeight', ['font weight', 'weight']).value);
  const iconField = readImage(block, 'icon', ['icon', 'icon image']);
  const iconName = readField(block, 'iconName', ['icon name']).value;
  const iconAlt = readField(block, 'iconAlt', ['icon alt', 'icon alt text']).value;
  const iconPosition = normalizeOption(readField(block, 'iconPosition', ['icon position']).value, ['left', 'right', 'none'], 'left');
  const iconSize = normalizeCssLength(readField(block, 'iconSize', ['icon size']).value, 'width');
  const minHeight = normalizeCssLength(readField(block, 'minHeight', ['minimum height', 'min height']).value, 'min-height');

  block.classList.add(
    `colored-button-h-${horizontalAlign}`,
    `colored-button-v-${verticalAlign}`,
    `colored-button-appearance-${appearance}`,
  );
  if (invertOnHover === 'yes') block.classList.add('colored-button-invert-hover');
  if (fontSize) block.style.setProperty('--colored-button-font-size', fontSize);
  if (fontWeight) block.style.setProperty('--colored-button-font-weight', fontWeight);
  if (iconSize) block.style.setProperty('--colored-button-icon-size', iconSize);
  if (minHeight) block.style.setProperty('--colored-button-min-height', minHeight);
  block.style.setProperty('--colored-button-bg', backgroundColor);
  block.style.setProperty('--colored-button-text', textColor);
  block.style.setProperty('--colored-button-border', borderColor);

  const inner = document.createElement('div');
  inner.className = 'colored-button-inner';

  const href = linkField.value;
  const button = document.createElement(href ? 'a' : 'button');
  button.className = 'colored-button-link';
  if (href) button.href = href;
  if (!href) button.type = 'button';
  if (linkField.source) moveInstrumentation(linkField.source, button);

  const label = document.createElement('span');
  label.className = 'colored-button-label';
  appendLabel(labelField, label, labelField.value || 'Button');

  const icon = iconPosition === 'none'
    ? null
    : buildImageIcon(iconField, iconAlt) || buildNamedIcon(iconName, iconAlt);

  if (icon && iconPosition === 'left') button.append(icon);
  button.append(label);
  if (icon && iconPosition === 'right') button.append(icon);

  inner.append(button);
  block.replaceChildren(inner);

  injectColorPickers(block, [
    { label: 'Background', cssVar: '--colored-button-bg', value: backgroundColor, source: bgField.source, prop: 'backgroundColor' },
    { label: 'Text', cssVar: '--colored-button-text', value: textColor, source: txtField.source, prop: 'textColor' },
    { label: 'Border', cssVar: '--colored-button-border', value: borderColor, source: bdrField.source, prop: 'borderColor' },
  ]);
}
