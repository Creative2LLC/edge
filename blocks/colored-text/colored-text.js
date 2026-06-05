import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readRichTextField,
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

function readField(block, name, labels = []) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

function readColorField(block, name, labels = [], isEditor = false) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
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

function watchColorField(source, cssVar, block) {
  if (!source) return;
  new MutationObserver(() => {
    const color = normalizeColorValue(source.textContent.trim());
    if (color) block.style.setProperty(cssVar, color);
  }).observe(source, { childList: true, characterData: true, subtree: true });
}

function syncResourceColorField(resourcePath, block) {
  readAueResourceFields(resourcePath, ['textColor'])
    .then((fields) => {
      const color = normalizeColorValue(fields.textColor);
      if (color) block.style.setProperty('--colored-text-color', color);
    });
}

function readRichField(block, name, labels = []) {
  const field = readRichTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
  });
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

function hasAuthoringContext(block) {
  return Boolean(block.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'));
}

export default function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const resourcePath = getAueResourcePath(block);

  const textField = readRichField(block, 'text', ['body', 'copy']);
  const txtField = readColorField(block, 'textColor', ['text color', 'color'], isEditor);
  const textColor = normalizeColorValue(txtField.value);
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment']).value,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment']).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  const fontSize = normalizeCssLength(readField(block, 'fontSize', ['font size', 'text size']).value, 'font-size');
  const fontWeight = normalizeFontWeight(readField(block, 'fontWeight', ['font weight', 'weight']).value);
  const minHeight = normalizeCssLength(readField(block, 'minHeight', ['minimum height', 'min height']).value, 'min-height');

  block.classList.add(`colored-text-h-${horizontalAlign}`, `colored-text-v-${verticalAlign}`);
  if (textColor) block.style.setProperty('--colored-text-color', textColor);
  if (fontSize) block.style.setProperty('--colored-text-size', fontSize);
  if (fontWeight) block.style.setProperty('--colored-text-weight', fontWeight);
  if (minHeight) block.style.setProperty('--colored-text-min-height', minHeight);

  const inner = document.createElement('div');
  inner.className = 'colored-text-inner';

  const content = document.createElement('div');
  content.className = 'colored-text-content';

  if (textField.text || textField.html || textField.source) {
    appendRichText(textField, content);
  } else if (hasAuthoringContext(block)) {
    content.classList.add('is-authoring-placeholder');
    content.textContent = 'Add colored text in the editor.';
  }

  if (content.textContent.trim() || content.children.length) inner.append(content);

  if (isEditor) {
    const archive = document.createElement('span');
    archive.hidden = true;
    [...block.querySelectorAll(':scope > div[hidden]')].forEach((row) => archive.append(row));
    if (archive.children.length) inner.append(archive);
  }

  block.replaceChildren(inner);

  if (isEditor) {
    watchColorField(txtField.source, '--colored-text-color', block);
  }

  injectColorPickers(block, [
    { label: 'Text Color', cssVar: '--colored-text-color', value: textColor || '#404041' },
  ]);

  syncResourceColorField(resourcePath, block);
}
