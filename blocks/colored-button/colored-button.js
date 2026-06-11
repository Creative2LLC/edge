import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import injectColorPickers from '../../scripts/block-color-picker.js';

function directRowOf(block, element) {
  let rowEl = element;
  while (rowEl && rowEl.parentElement !== block) {
    rowEl = rowEl.parentElement;
  }
  return rowEl && rowEl.parentElement === block ? rowEl : null;
}

function fieldCell(row) {
  if (!row) return null;
  return row.children.length > 1 ? row.children[1] : row.children[0] || row;
}

function readField(block, name, labels = [], fallbackCell = null) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

// In editor context, hides the row instead of removing it so the data-aue-prop
// source element stays in the DOM. It gets moved into a hidden archive inside
// inner before replaceChildren, then a MutationObserver keeps the CSS variable
// in sync when UE writes a new value to that element via the Properties panel.
function readColorField(block, name, labels = [], isEditor = false, fallbackCell = null) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (isEditor && field.source) row.hidden = true;
    else row.remove();
  }
  return field;
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : '';
}

function applyBlockBackground(block, value) {
  const color = normalizeColorValue(value);
  if (!color) {
    block.classList.remove('has-block-background');
    block.style.removeProperty('--colored-button-block-bg');
    return;
  }

  block.classList.add('has-block-background');
  block.style.setProperty('--colored-button-block-bg', color);
}

function watchColorField(source, cssVar, block) {
  if (!source) return;
  new MutationObserver(() => {
    const color = normalizeColorValue(source.textContent.trim());
    if (color) block.style.setProperty(cssVar, color);
  }).observe(source, { childList: true, characterData: true, subtree: true });
}

function watchBlockBackgroundField(source, block) {
  if (!source) return;
  new MutationObserver(() => {
    applyBlockBackground(block, source.textContent);
  }).observe(source, { childList: true, characterData: true, subtree: true });
}

function syncResourceColorFields(resourcePath, block) {
  readAueResourceFields(resourcePath, ['backgroundColor', 'textColor', 'borderColor', 'blockBackgroundColor'])
    .then((fields) => {
      const backgroundColor = normalizeColorValue(fields.backgroundColor);
      const textColor = normalizeColorValue(fields.textColor);
      const borderColor = normalizeColorValue(fields.borderColor);

      if (backgroundColor) block.style.setProperty('--colored-button-bg', backgroundColor);
      if (textColor) block.style.setProperty('--colored-button-text', textColor);
      if (borderColor) block.style.setProperty('--colored-button-border', borderColor);
      else if (backgroundColor) block.style.setProperty('--colored-button-border', backgroundColor);
      applyBlockBackground(block, fields.blockBackgroundColor);
    });
}

function readLink(block, name, labels = [], fallbackCell = null) {
  const field = readLinkField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

function readImage(block, name, labels = [], fallbackCell = null) {
  const field = readImageField(block, name, { labels, fallbackCell });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
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
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const resourcePath = getAueResourcePath(block);
  const rows = [...block.querySelectorAll(':scope > div')];

  const labelField = readField(block, 'label', ['button text', 'text', 'label'], fieldCell(rows[0]));
  const linkField = readLink(block, 'link', ['button link', 'url', 'href'], fieldCell(rows[1]));
  const bgField = readColorField(
    block,
    'backgroundColor',
    ['background color', 'button color'],
    isEditor,
    fieldCell(rows[2]),
  );
  const backgroundColor = normalizeColorValue(bgField.value) || '#008DB6';
  const txtField = readColorField(block, 'textColor', ['text color'], isEditor, fieldCell(rows[3]));
  const textColor = normalizeColorValue(txtField.value) || '#FFFFFF';
  const bdrField = readColorField(block, 'borderColor', ['border color'], isEditor, fieldCell(rows[4]));
  const borderColor = normalizeColorValue(bdrField.value) || backgroundColor;
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color'],
    isEditor,
  );
  const blockBackgroundColor = normalizeColorValue(blockBgField.value);
  const appearance = normalizeOption(
    readField(block, 'appearance', ['style', 'button style'], fieldCell(rows[5])).value,
    ['solid', 'outlined', 'inverted'],
    'solid',
  );
  const invertOnHover = normalizeOption(
    readField(block, 'invertOnHover', ['invert on hover'], fieldCell(rows[6])).value,
    ['yes', 'no'],
    'no',
  );
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'button alignment'], fieldCell(rows[7])).value,
    ['left', 'center', 'right', 'stretch'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment'], fieldCell(rows[8])).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  const fontSize = normalizeCssLength(readField(block, 'fontSize', ['font size', 'text size'], fieldCell(rows[9])).value, 'font-size');
  const fontWeight = normalizeFontWeight(readField(block, 'fontWeight', ['font weight', 'weight'], fieldCell(rows[10])).value);
  const iconField = readImage(block, 'icon', ['icon', 'icon image'], fieldCell(rows[11]));
  const iconName = readField(block, 'iconName', ['icon name'], fieldCell(rows[12])).value;
  const iconAlt = readField(block, 'iconAlt', ['icon alt', 'icon alt text'], fieldCell(rows[13])).value;
  const iconPosition = normalizeOption(
    readField(block, 'iconPosition', ['icon position'], fieldCell(rows[14])).value,
    ['left', 'right', 'none'],
    'left',
  );
  const iconSize = normalizeCssLength(readField(block, 'iconSize', ['icon size'], fieldCell(rows[15])).value, 'width');
  const minHeight = normalizeCssLength(readField(block, 'minHeight', ['minimum height', 'min height'], fieldCell(rows[16])).value, 'min-height');

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
  applyBlockBackground(block, blockBackgroundColor);

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

  if (isEditor) {
    const archive = document.createElement('span');
    archive.hidden = true;
    [...block.querySelectorAll(':scope > div[hidden]')].forEach((row) => archive.append(row));
    if (archive.children.length) inner.append(archive);
  }

  block.replaceChildren(inner);

  if (isEditor) {
    watchColorField(bgField.source, '--colored-button-bg', block);
    watchColorField(txtField.source, '--colored-button-text', block);
    watchColorField(bdrField.source, '--colored-button-border', block);
    watchBlockBackgroundField(blockBgField.source, block);
  }

  injectColorPickers(block, [
    { label: 'Button Background', cssVar: '--colored-button-bg', value: backgroundColor },
    { label: 'Text', cssVar: '--colored-button-text', value: textColor },
    { label: 'Border', cssVar: '--colored-button-border', value: borderColor },
    {
      label: 'Block Background',
      cssVar: '--colored-button-block-bg',
      value: blockBackgroundColor || '#ffffff',
      className: 'has-block-background',
    },
  ]);

  syncResourceColorFields(resourcePath, block);
}
