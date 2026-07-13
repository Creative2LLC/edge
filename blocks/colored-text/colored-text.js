import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readRichTextField,
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

// Fields with no authored value frequently don't get their own row in the exported markup
// at all, so a positional fallback can silently grab a totally different field's value. In
// the editor, named data-aue-prop lookup is reliable whenever a field genuinely has content,
// so a failed name lookup there means the field is genuinely empty — never fall back to a
// position guess in that case. Positional fallback is kept for true published pages, where
// there's no instrumentation to name-match against at all (matches colored-icon-text.js's
// readField/readColorField/readRichField pattern).
//
// Also hide (don't remove) rows that carry Universal Editor instrumentation while in the
// editor — permanently removing an aue-tracked node desyncs UE's resource tree from the DOM
// and breaks later live-edit syncing for the block (see cards.js's readSetting and
// colored-icon-text.js's readField for the same pattern/fix).
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

// Hex-color "select" fields (regex-validated) render in the editor as a bare
// <a href="#hex">#hex</a> with NO data-aue-prop at all — confirmed from live markup —
// unlike every other field type, which does get real instrumentation whenever it has
// content. Name-based lookup can never succeed for these, so unlike readField below,
// positional fallback must stay enabled in the editor too, or these fields always read
// empty (this caused a live regression: color pickers falling back to defaults because
// the field could never be read in the editor).
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

function normalizeUsableColor(value) {
  const color = normalizeColorValue(value);
  return color && !['inherit', 'initial', 'unset', 'transparent'].includes(color.toLowerCase())
    ? color
    : '';
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
  const gridItem = block.closest('.colored-grid-row-item');
  const grid = block.closest('.colored-grid');
  const section = block.closest('.section');
  const color = gridItem?.style?.getPropertyValue('--colored-grid-row-bg')
    || grid?.style?.getPropertyValue('--colored-grid-bg')
    || section?.getAttribute('data-background-color')
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

function getInheritedTextColor(block) {
  const gridItem = block.closest('.colored-grid-row-item');
  const grid = block.closest('.colored-grid');
  return normalizeUsableColor(gridItem?.style?.getPropertyValue('--colored-grid-row-text'))
    || normalizeUsableColor(grid?.style?.getPropertyValue('--colored-grid-text'));
}

function applyBlockBackground(block, value) {
  const color = normalizeColorValue(value);
  if (!color) {
    block.classList.remove('has-block-background');
    block.style.removeProperty('--colored-text-block-bg');
    return;
  }

  block.classList.add('has-block-background');
  block.style.setProperty('--colored-text-block-bg', color);
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
      if (color) block.style.setProperty('--colored-text-color', color);
      if (Object.prototype.hasOwnProperty.call(fields, 'blockBackgroundColor')) {
        applyBlockBackground(block, fields.blockBackgroundColor);
      }
    });
}

function readRichField(block, name, labels = [], fallbackCell = null, isEditor = false) {
  const field = readRichTextField(block, name, {
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

const CONTENT_PADDING_OPTIONS = [
  'default',
  'none',
  'all-sm',
  'all-md',
  'all-lg',
  'vertical-sm',
  'vertical-md',
  'vertical-lg',
  'horizontal-sm',
  'horizontal-md',
  'horizontal-lg',
  'top-sm',
  'top-md',
  'top-lg',
  'bottom-sm',
  'bottom-md',
  'bottom-lg',
];
const CONTENT_PADDING_SPACE = { sm: '12px', md: '24px', lg: '40px' };

// Independent from the shared colored-field-options.js padding (which controls the
// block's own outer spacing) — this is a self-contained option, using its own CSS
// vars, so the two don't collide over --colored-field-padding-*.
function computeContentPadding(value) {
  const option = normalizeOption(value, CONTENT_PADDING_OPTIONS, 'default');
  if (option === 'default') return null;
  if (option === 'none') {
    return {
      top: '0', right: '0', bottom: '0', left: '0',
    };
  }

  const [, position, size] = option.match(/^(all|vertical|horizontal|top|bottom)-(sm|md|lg)$/u) || [];
  if (!position) return null;

  const amount = CONTENT_PADDING_SPACE[size];
  const zero = '0';
  const sides = {
    all: {
      top: amount, right: amount, bottom: amount, left: amount,
    },
    vertical: {
      top: amount, right: zero, bottom: amount, left: zero,
    },
    horizontal: {
      top: zero, right: amount, bottom: zero, left: amount,
    },
    top: {
      top: amount, right: zero, bottom: zero, left: zero,
    },
    bottom: {
      top: zero, right: zero, bottom: amount, left: zero,
    },
  };
  return sides[position];
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
  const normalized = String(text || '').replace(/\r\n?/gu, '\n');
  if (!normalized.trim()) return;

  normalized.replace(/^\n+|\n+$/gu, '').split(/\n{2,}/u).forEach((chunk) => {
    const paragraph = document.createElement('p');
    chunk.split('\n').forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement('br'));
      paragraph.append(document.createTextNode(line));
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

function richFieldHasList(field) {
  if (!field) return false;
  if (field.source?.querySelector?.('ol, ul')) return true;
  return /<(?:ol|ul)\b/i.test(field.html || '');
}

function shouldRestoreMissingListBackground(block, textField, fontSize) {
  if (hasAuthoringContext(block)) return false;
  if (block.closest('.columns')) return false;
  if (!block.closest('.colored-text-container')) return false;
  return fontSize === '28px' && richFieldHasList(textField);
}

export default function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const resourcePath = getAueResourcePath(block);
  const rows = [...block.querySelectorAll(':scope > div')];

  // Fixed field->row indices below match _colored-text.json's ACTUAL current field order
  // (fields were regrouped under UI tabs by a later commit, which changed this order without
  // the fixed-index reads here being updated). "tab" model entries are UI-only and consume no
  // row. Order: text(0), textColor(1), fontSize(2), fontWeight(3), horizontalAlign(4),
  // verticalAlign(5), minHeight(6), minHeightMobile(7), paddingStyle(8), marginStyle(9),
  // contentPaddingStyle(10), blockBackgroundColor(11), dropShadow(12), borderRadius(13),
  // markerTerms(14), markerColor(15), markerStyle(16). blockBackgroundColor is NOT adjacent
  // to textColor — it now sits unconditionally at a fixed position between contentPaddingStyle
  // and dropShadow, so the old "was an extra row inserted" heuristic (hasInsertedBlockBackgroundRow
  // / rowOffset) no longer applies and has been removed entirely.
  //
  // Positional fallback is only meaningful on true published pages (no instrumentation to
  // name-match against at all) — in the editor an empty field frequently gets no row at all,
  // so a position guess there can silently grab a different field's value. Matches
  // colored-icon-text.js's cellAt/fallback pattern.
  const fallback = (index) => (isEditor ? null : fieldCell(rows[index]));

  const textField = readRichField(block, 'text', ['body', 'copy'], fallback(0), isEditor);
  const txtField = readColorField(block, 'textColor', ['text color', 'color'], isEditor, fallback(1));
  const textColor = normalizeColorValue(txtField.value)
    || getInheritedTextColor(block)
    || (hasDarkSectionBackground(block) ? '#FFF' : '#404041');
  const fontSize = normalizeCssLength(readField(block, 'fontSize', ['font size', 'text size'], fallback(2), isEditor).value, 'font-size');
  const fontWeight = normalizeFontWeight(readField(block, 'fontWeight', ['font weight', 'weight'], fallback(3), isEditor).value);
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment'], fallback(4), isEditor).value,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment'], fallback(5), isEditor).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  const minHeight = normalizeCssLength(readField(block, 'minHeight', ['minimum height', 'min height'], fallback(6), isEditor).value, 'min-height');
  const minHeightMobile = normalizeCssLength(readField(block, 'minHeightMobile', ['mobile min height', 'min height mobile', 'minimum height mobile'], fallback(7), isEditor).value, 'min-height');
  const paddingStyleField = readField(
    block,
    'paddingStyle',
    ['padding style', 'padding'],
    fallback(8),
    isEditor,
  );
  const marginStyleField = readField(
    block,
    'marginStyle',
    ['margin style', 'margin'],
    fallback(9),
    isEditor,
  );
  const contentPaddingStyleField = readField(
    block,
    'contentPaddingStyle',
    ['content padding', 'inner padding'],
    fallback(10),
    isEditor,
  );
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color', 'background color'],
    isEditor,
    fallback(11),
  );
  let blockBackgroundColor = normalizeColorValue(blockBgField.value);
  const dropShadowField = readField(
    block,
    'dropShadow',
    ['drop shadow', 'shadow'],
    fallback(12),
    isEditor,
  );
  const borderRadiusField = readField(
    block,
    'borderRadius',
    ['border radius'],
    fallback(13),
    isEditor,
  );
  const markerTermsField = readField(
    block,
    'markerTerms',
    ['marker text', 'marker terms', 'highlight text'],
    fallback(14),
    isEditor,
  );
  const markerColorField = readColorField(
    block,
    'markerColor',
    ['marker color', 'highlight marker color'],
    isEditor,
    fallback(15),
  );
  const markerStyleField = readField(
    block,
    'markerStyle',
    ['marker style', 'highlight marker style'],
    fallback(16),
    isEditor,
  );

  if (!blockBackgroundColor && shouldRestoreMissingListBackground(block, textField, fontSize)) {
    blockBackgroundColor = '#FFF';
  }

  const borderRadius = normalizeOption(
    borderRadiusField.value,
    ['none', 'small', 'medium', 'large'],
    'none',
  );
  block.classList.add(
    `colored-text-h-${horizontalAlign}`,
    `colored-text-v-${verticalAlign}`,
    `colored-text-radius-${borderRadius}`,
  );
  applyColoredFieldLayoutOptions(block, 'colored-text', {
    paddingStyle: paddingStyleField.value,
    marginStyle: marginStyleField.value,
    dropShadow: dropShadowField.value,
  });
  if (textColor) block.style.setProperty('--colored-text-color', textColor);
  applyBlockBackground(block, blockBackgroundColor);
  if (fontSize) block.style.setProperty('--colored-text-size', fontSize);
  if (fontWeight) block.style.setProperty('--colored-text-weight', fontWeight);
  if (minHeight) block.style.setProperty('--colored-text-min-height', minHeight);
  if (minHeightMobile) block.style.setProperty('--colored-text-min-height-mobile', minHeightMobile);
  const contentPadding = computeContentPadding(contentPaddingStyleField.value);
  if (contentPadding) {
    block.style.setProperty('--colored-text-content-padding-top', contentPadding.top);
    block.style.setProperty('--colored-text-content-padding-right', contentPadding.right);
    block.style.setProperty('--colored-text-content-padding-bottom', contentPadding.bottom);
    block.style.setProperty('--colored-text-content-padding-left', contentPadding.left);
  }

  const inner = document.createElement('div');
  inner.className = 'colored-text-inner';

  const content = document.createElement('div');
  content.className = 'colored-text-content';

  if (textField.text.trim() || textField.html.trim() || textField.source) {
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
  applyAnimatedMarkers(content, {
    terms: markerTermsField.value,
    color: markerColorField.value,
    style: markerStyleField.value,
  });

  if (isEditor) {
    watchColorField(txtField.source, '--colored-text-color', block);
    watchBlockBackgroundField(blockBgField.source, block);
  }

  injectColorPickers(block, [
    { label: 'Text Color', cssVar: '--colored-text-color', value: textColor || '#404041' },
    {
      label: 'Block Background',
      cssVar: '--colored-text-block-bg',
      value: blockBackgroundColor || '#ffffff',
      className: 'has-block-background',
    },
  ]);

  syncResourceColorFields(resourcePath, block);
  syncColoredFieldLayoutOptions(resourcePath, block, 'colored-text');
}
