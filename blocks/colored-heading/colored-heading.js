import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readTextField,
} from '../../scripts/block-field-utils.js';
import injectColorPickers from '../../scripts/block-color-picker.js';
import { applyAnimatedMarkers } from '../../scripts/animated-marker.js';
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

// In the editor, hide (don't remove) rows that carry Universal Editor instrumentation —
// permanently removing an aue-tracked node desyncs UE's resource tree from the DOM and
// breaks live-patching of that field on the next decoration pass (see cards.js's
// readSetting / colored-icon-text.js's readField for the same pattern). Also, fields left
// empty by the author frequently get NO row at all in the exported markup, so a positional
// fallback can silently grab a different field's value — only trust it on published pages
// (isEditor false), never in the editor where name-based data-aue-prop lookup is reliable.
function readField(block, name, labels = [], fallbackCell = null, isEditor = false) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell: isEditor ? null : fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (isEditor && field.source) row.hidden = true;
    else row.remove();
  }
  return field;
}

function readColorField(block, name, labels = [], isEditor = false, fallbackCell = null) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell: isEditor ? null : fallbackCell,
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

function parseColorChannels(value) {
  const normalized = String(value || '').trim();
  const hex = normalizeColorValue(normalized);

  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    const digits = hex.slice(1);
    const parts = digits.length === 3
      ? [...digits].map((digit) => `${digit}${digit}`)
      : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
    return parts.map((part) => Number.parseInt(part, 16));
  }

  const rgb = normalized.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return rgb ? rgb.slice(1, 4).map((part) => Number.parseInt(part, 10)) : null;
}

function hasDarkSectionBackground(block) {
  const section = block.closest('.section');
  const color = section?.getAttribute('data-background-color')
    || section?.getAttribute('data-backgroundcolor')
    || section?.style?.backgroundColor
    || '';
  const channels = parseColorChannels(color);
  if (!channels) return false;

  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) < 0.3;
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

  // Fixed indices below match _colored-heading.json's ACTUAL current field order (fields
  // were regrouped under UI tabs by a later commit; "tab" entries are UI-only and consume
  // no row). Order: heading(0), headingLevel(1), textColor(2), fontSize(3), fontWeight(4),
  // horizontalAlign(5), verticalAlign(6), minHeight(7), minHeightMobile(8), paddingStyle(9),
  // marginStyle(10), blockBackgroundColor(11), dropShadow(12), markerTerms(13),
  // markerColor(14), markerStyle(15). blockBackgroundColor now sits at a fixed position
  // (it is no longer an optionally-inserted row after textColor), so it's read at its own
  // index like every other field instead of via a heuristic rowOffset.
  const headingField = readField(block, 'heading', ['title', 'text', 'heading text'], fieldCell(rows[0]), isEditor);
  const headingLevel = normalizeOption(
    readField(block, 'headingLevel', ['heading level', 'h tag', 'tag'], fieldCell(rows[1]), isEditor).value,
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    'h2',
  );
  const txtField = readColorField(block, 'textColor', ['text color', 'color'], isEditor, fieldCell(rows[2]));
  const textColor = normalizeColorValue(txtField.value)
    || (hasDarkSectionBackground(block) ? '#FFF' : '#00264D');
  const fontSize = normalizeCssLength(
    readField(block, 'fontSize', ['font size', 'text size'], fieldCell(rows[3]), isEditor).value,
    'font-size',
  );
  const fontWeight = normalizeFontWeight(
    readField(block, 'fontWeight', ['font weight', 'weight'], fieldCell(rows[4]), isEditor).value,
  );
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment'], fieldCell(rows[5]), isEditor).value,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment'], fieldCell(rows[6]), isEditor).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  const minHeight = normalizeCssLength(
    readField(block, 'minHeight', ['minimum height', 'min height'], fieldCell(rows[7]), isEditor).value,
    'min-height',
  );
  const minHeightMobile = normalizeCssLength(
    readField(block, 'minHeightMobile', ['mobile min height', 'min height mobile', 'minimum height mobile'], fieldCell(rows[8]), isEditor).value,
    'min-height',
  );
  const paddingStyleField = readField(
    block,
    'paddingStyle',
    ['padding style', 'padding'],
    fieldCell(rows[9]),
    isEditor,
  );
  const marginStyleField = readField(
    block,
    'marginStyle',
    ['margin style', 'margin'],
    fieldCell(rows[10]),
    isEditor,
  );
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color', 'background color'],
    isEditor,
    fieldCell(rows[11]),
  );
  const blockBackgroundColor = normalizeColorValue(blockBgField.value);
  const dropShadowField = readField(
    block,
    'dropShadow',
    ['drop shadow', 'shadow'],
    fieldCell(rows[12]),
    isEditor,
  );
  const markerTermsField = readField(
    block,
    'markerTerms',
    ['marker text', 'marker terms', 'highlight text'],
    fieldCell(rows[13]),
    isEditor,
  );
  const markerColorField = readColorField(
    block,
    'markerColor',
    ['marker color', 'highlight marker color'],
    isEditor,
    fieldCell(rows[14]),
  );
  const markerStyleField = readField(
    block,
    'markerStyle',
    ['marker style', 'highlight marker style'],
    fieldCell(rows[15]),
    isEditor,
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
  applyAnimatedMarkers(heading, {
    terms: markerTermsField.value,
    color: markerColorField.value,
    style: markerStyleField.value,
  });

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
