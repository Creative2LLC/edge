import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readTextField,
} from '../../scripts/block-field-utils.js';
import injectColorPickers from '../../scripts/block-color-picker.js';
import {
  applyColoredFieldLayoutOptions,
  syncColoredFieldLayoutOptions,
} from '../../scripts/colored-field-options.js';

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

function hasInsertedBlockBackgroundRow(block, rows, rowIndex, legacyFieldCount) {
  if (block.querySelector('[data-aue-prop="blockBackgroundColor"]')) return true;
  if (normalizeColorValue(fieldCell(rows[rowIndex])?.textContent)) return true;
  return rows.length > legacyFieldCount;
}

function applyBlockBackground(block, value) {
  const color = normalizeColorValue(value);
  if (!color) {
    block.classList.remove('has-block-background');
    block.style.removeProperty('--colored-heading-block-bg');
    return;
  }

  block.classList.add('has-block-background');
  block.style.setProperty('--colored-heading-block-bg', color);
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
  readAueResourceFields(resourcePath, ['textColor', 'blockBackgroundColor'])
    .then((fields) => {
      const color = normalizeColorValue(fields.textColor);
      if (color) block.style.setProperty('--colored-heading-color', color);
      if (Object.prototype.hasOwnProperty.call(fields, 'blockBackgroundColor')) {
        applyBlockBackground(block, fields.blockBackgroundColor);
      }
    });
}

function appendHeadingText(field, heading, fallbackText) {
  if (field.source) {
    moveInstrumentation(field.source, heading);
    while (field.source.firstChild) heading.append(field.source.firstChild);
  }

  if (!heading.textContent.trim()) {
    heading.textContent = field?.value || fallbackText;
  }
}

function hasAuthoringContext(block) {
  return Boolean(block.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'));
}

export default function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const resourcePath = getAueResourcePath(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const rowOffset = hasInsertedBlockBackgroundRow(block, rows, 3, 9) ? 1 : 0;

  const headingField = readField(block, 'heading', ['title', 'text', 'heading text'], fieldCell(rows[0]));
  const headingLevel = normalizeOption(
    readField(block, 'headingLevel', ['heading level', 'h tag', 'tag'], fieldCell(rows[1])).value,
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    'h2',
  );
  const txtField = readColorField(block, 'textColor', ['text color', 'color'], isEditor, fieldCell(rows[2]));
  const textColor = normalizeColorValue(txtField.value) || '#00264D';
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color', 'background color'],
    isEditor,
    rowOffset ? fieldCell(rows[3]) : null,
  );
  const blockBackgroundColor = normalizeColorValue(blockBgField.value);
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment'], fieldCell(rows[3 + rowOffset])).value,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment'], fieldCell(rows[4 + rowOffset])).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  const fontSize = normalizeCssLength(
    readField(block, 'fontSize', ['font size', 'text size'], fieldCell(rows[5 + rowOffset])).value,
    'font-size',
  );
  const fontWeight = normalizeFontWeight(
    readField(block, 'fontWeight', ['font weight', 'weight'], fieldCell(rows[6 + rowOffset])).value,
  );
  const minHeight = normalizeCssLength(
    readField(block, 'minHeight', ['minimum height', 'min height'], fieldCell(rows[7 + rowOffset])).value,
    'min-height',
  );
  const minHeightMobile = normalizeCssLength(
    readField(block, 'minHeightMobile', ['mobile min height', 'min height mobile', 'minimum height mobile'], fieldCell(rows[8 + rowOffset])).value,
    'min-height',
  );
  const paddingStyleField = readField(
    block,
    'paddingStyle',
    ['padding style', 'padding'],
    fieldCell(rows[9 + rowOffset]),
  );
  const marginStyleField = readField(
    block,
    'marginStyle',
    ['margin style', 'margin'],
    fieldCell(rows[10 + rowOffset]),
  );
  const dropShadowField = readField(
    block,
    'dropShadow',
    ['drop shadow', 'shadow'],
    fieldCell(rows[11 + rowOffset]),
  );

  block.classList.add(`colored-heading-h-${horizontalAlign}`, `colored-heading-v-${verticalAlign}`);
  applyColoredFieldLayoutOptions(block, 'colored-heading', {
    paddingStyle: paddingStyleField.value,
    marginStyle: marginStyleField.value,
    dropShadow: dropShadowField.value,
  });
  block.style.setProperty('--colored-heading-color', textColor);
  applyBlockBackground(block, blockBackgroundColor);
  if (fontSize) {
    block.classList.add('has-custom-size');
    block.style.setProperty('--colored-heading-size', fontSize);
  }
  if (fontWeight) {
    block.classList.add('has-custom-weight');
    block.style.setProperty('--colored-heading-weight', fontWeight);
  }
  if (minHeight) block.style.setProperty('--colored-heading-min-height', minHeight);
  if (minHeightMobile) block.style.setProperty('--colored-heading-min-height-mobile', minHeightMobile);

  const inner = document.createElement('div');
  inner.className = 'colored-heading-inner';

  const heading = document.createElement(headingLevel);
  heading.className = 'colored-heading-title';
  appendHeadingText(
    headingField,
    heading,
    hasAuthoringContext(block) ? 'Add colored heading in the editor.' : '',
  );

  if (!heading.textContent.trim()) {
    block.replaceChildren();
    return;
  }

  if (hasAuthoringContext(block) && heading.textContent.trim() === 'Add colored heading in the editor.') {
    heading.classList.add('is-authoring-placeholder');
  }

  inner.append(heading);

  if (isEditor) {
    const archive = document.createElement('span');
    archive.hidden = true;
    [...block.querySelectorAll(':scope > div[hidden]')].forEach((row) => archive.append(row));
    if (archive.children.length) inner.append(archive);
  }

  block.replaceChildren(inner);

  if (isEditor) {
    watchColorField(txtField.source, '--colored-heading-color', block);
    watchBlockBackgroundField(blockBgField.source, block);
  }

  injectColorPickers(block, [
    { label: 'Text Color', cssVar: '--colored-heading-color', value: textColor },
    {
      label: 'Block Background',
      cssVar: '--colored-heading-block-bg',
      value: blockBackgroundColor || '#ffffff',
      className: 'has-block-background',
    },
  ]);

  syncResourceColorFields(resourcePath, block);
  syncColoredFieldLayoutOptions(resourcePath, block, 'colored-heading');
}
