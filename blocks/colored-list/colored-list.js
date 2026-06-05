import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';
import injectColorPickers from '../../scripts/block-color-picker.js';

const BLOCK_FIELD_NAMES = [
  'listStyle',
  'textColor',
  'markerColor',
  'markerTextColor',
  'horizontalAlign',
  'verticalAlign',
  'fontSize',
  'fontWeight',
  'minHeight',
];

function directRowOf(block, element) {
  let rowEl = element;
  while (rowEl && rowEl.parentElement !== block) {
    rowEl = rowEl.parentElement;
  }
  return rowEl && rowEl.parentElement === block ? rowEl : null;
}

function readBlockField(block, name, labels = []) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

const IS_EDITOR = window.self !== window.top;

function readColorField(block, name, labels = []) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (IS_EDITOR && field.source) row.hidden = true;
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

function watchColorField(source, cssVar, block) {
  if (!source) return;
  new MutationObserver(() => {
    const color = normalizeColorValue(source.textContent.trim());
    if (color) block.style.setProperty(cssVar, color);
  }).observe(source, { childList: true, characterData: true, subtree: true });
}

function readItemText(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function readItemRichText(row, name, index) {
  return readRichTextField(row, name, { fallbackCell: row.children[index] });
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

function appendPlainText(wrapper, text) {
  const normalized = String(text || '').replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return;

  normalized.split(/\n{2,}/u).forEach((chunk) => {
    const paragraph = document.createElement('p');
    chunk.split('\n').forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement('br'));
      paragraph.append(document.createTextNode(line.trim()));
    });
    wrapper.append(paragraph);
  });
}

function appendRichText(field, element) {
  if (field.source) {
    moveInstrumentation(field.source, element);
    while (field.source.firstChild) element.append(field.source.firstChild);
    return;
  }

  if (field.html && /<[^>]+>/u.test(field.html)) {
    element.innerHTML = field.html;
    return;
  }

  appendPlainText(element, field.text);
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isBlockFieldRow(row) {
  return BLOCK_FIELD_NAMES.some((name) => row.querySelector(`[data-aue-prop="${name}"]`));
}

function getMarkerText(listStyle, customMarker, index) {
  if (customMarker) return customMarker;
  if (listStyle === 'number' || listStyle === 'circle-number') return `${index + 1}`;
  if (listStyle === 'bullet') return '•';
  return '';
}

function buildItem(row, listStyle, index) {
  const itemTextField = readItemRichText(row, 'itemText', 0);
  const markerTextField = readItemText(row, 'markerText', 1);
  const itemTextColor = normalizeColorValue(readItemText(row, 'itemTextColor', 2).value);
  const itemMarkerColor = normalizeColorValue(readItemText(row, 'itemMarkerColor', 3).value);
  const itemMarkerTextColor = normalizeColorValue(readItemText(row, 'itemMarkerTextColor', 4).value);
  const isPlaceholder = hasAuthoringContext(row) && !itemTextField.text && !itemTextField.html;

  if (!itemTextField.text && !itemTextField.html && !isPlaceholder) return null;

  const item = document.createElement('li');
  item.className = 'colored-list-item';
  moveInstrumentation(row, item);
  if (itemTextColor) item.style.setProperty('--colored-list-item-text-color', itemTextColor);
  if (itemMarkerColor) item.style.setProperty('--colored-list-item-marker-color', itemMarkerColor);
  if (itemMarkerTextColor) item.style.setProperty('--colored-list-item-marker-text-color', itemMarkerTextColor);

  const marker = document.createElement('span');
  marker.className = 'colored-list-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = getMarkerText(listStyle, markerTextField.value, index);
  if (markerTextField.source) moveInstrumentation(markerTextField.source, marker);
  item.append(marker);

  const content = document.createElement('div');
  content.className = 'colored-list-item-content';
  if (isPlaceholder) {
    content.classList.add('is-authoring-placeholder');
    content.textContent = 'Add list item text in the editor.';
  } else {
    appendRichText(itemTextField, content);
  }
  item.append(content);

  return item;
}

export default function decorate(block) {
  const listStyle = normalizeOption(
    readBlockField(block, 'listStyle', ['list style', 'type']).value,
    ['bullet', 'number', 'circle-number', 'circle-bullet'],
    'bullet',
  );
  const txtField = readColorField(block, 'textColor', ['text color', 'color']);
  const textColor = normalizeColorValue(txtField.value) || '#404041';
  const mrkField = readColorField(block, 'markerColor', ['marker color', 'bullet color']);
  const markerColor = normalizeColorValue(mrkField.value) || '#008DB6';
  const mrkTxtField = readColorField(block, 'markerTextColor', ['marker text color']);
  const markerTextColor = normalizeColorValue(mrkTxtField.value) || '#FFFFFF';
  const horizontalAlign = normalizeOption(
    readBlockField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment']).value,
    ['left', 'center', 'right'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readBlockField(block, 'verticalAlign', ['vertical alignment']).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  const fontSize = normalizeCssLength(readBlockField(block, 'fontSize', ['font size', 'text size']).value, 'font-size');
  const fontWeight = normalizeFontWeight(readBlockField(block, 'fontWeight', ['font weight', 'weight']).value);
  const minHeight = normalizeCssLength(readBlockField(block, 'minHeight', ['minimum height', 'min height']).value, 'min-height');

  block.classList.add(
    `colored-list-style-${listStyle}`,
    `colored-list-h-${horizontalAlign}`,
    `colored-list-v-${verticalAlign}`,
  );
  block.style.setProperty('--colored-list-text-color', textColor);
  block.style.setProperty('--colored-list-marker-color', markerColor);
  block.style.setProperty('--colored-list-marker-text-color', markerTextColor);
  if (fontSize) block.style.setProperty('--colored-list-font-size', fontSize);
  if (fontWeight) block.style.setProperty('--colored-list-font-weight', fontWeight);
  if (minHeight) block.style.setProperty('--colored-list-min-height', minHeight);

  const inner = document.createElement('div');
  inner.className = 'colored-list-inner';

  const list = document.createElement(listStyle === 'number' || listStyle === 'circle-number' ? 'ol' : 'ul');
  list.className = 'colored-list-items';

  [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isBlockFieldRow(row))
    .forEach((row, index) => {
      const item = buildItem(row, listStyle, index);
      if (item) list.append(item);
    });

  if (!list.children.length && hasAuthoringContext(block)) {
    const placeholder = document.createElement('li');
    placeholder.className = 'colored-list-item is-authoring-placeholder';
    placeholder.textContent = 'Add colored list items in the editor.';
    list.append(placeholder);
  }

  inner.append(list);

  if (IS_EDITOR) {
    const archive = document.createElement('span');
    archive.hidden = true;
    [...block.querySelectorAll(':scope > div[hidden]')].forEach((row) => archive.append(row));
    if (archive.children.length) inner.append(archive);
  }

  block.replaceChildren(inner);

  if (IS_EDITOR) {
    watchColorField(txtField.source, '--colored-list-text-color', block);
    watchColorField(mrkField.source, '--colored-list-marker-color', block);
    watchColorField(mrkTxtField.source, '--colored-list-marker-text-color', block);
  }

  injectColorPickers(block, [
    { label: 'Text', cssVar: '--colored-list-text-color', value: textColor },
    { label: 'Marker', cssVar: '--colored-list-marker-color', value: markerColor },
    { label: 'Marker Text', cssVar: '--colored-list-marker-text-color', value: markerTextColor },
  ]);
}
