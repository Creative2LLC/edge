import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readTextField,
} from '../../scripts/block-field-utils.js';
import injectColorPickers from '../../scripts/block-color-picker.js';
import { resolveAlignAnchoredFields } from '../../scripts/flattened-item-utils.js';
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

// markerColor is also a hex-color select field, so it's just as vulnerable to the
// row-position drift as textColor/blockBackgroundColor above — added here for the same
// reason. applyAnimatedMarkers() (scripts/animated-marker.js) sets the marker color as
// the --text-marker-color custom property on `markerRoot`, so correcting it after the
// fact is just a style update, not a re-run of the marker-wrapping logic.
function syncResourceColorFields(resourcePath, block, markerRoot) {
  readAueResourceFields(resourcePath, ['textColor', 'blockBackgroundColor', 'markerColor'])
    .then((fields) => {
      const color = normalizeColorValue(fields.textColor);
      if (color) block.style.setProperty('--colored-heading-color', color);
      if (Object.prototype.hasOwnProperty.call(fields, 'blockBackgroundColor')) {
        applyBlockBackground(block, fields.blockBackgroundColor);
      }
      const markerColor = normalizeColorValue(fields.markerColor);
      if (markerColor && markerRoot) {
        markerRoot.style.setProperty('--text-marker-color', markerColor);
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

function getPublishedCellText(row) {
  return (fieldCell(row)?.textContent || row?.textContent || '').replace(/\s+/g, ' ').trim();
}

function isPublishedControlValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (/^h[1-6]$/u.test(normalized)) return true;
  if (['left', 'center', 'right', 'justify', 'top', 'middle', 'bottom'].includes(normalized)) {
    return true;
  }
  if (['default', 'none', 'all-sm', 'all-md', 'all-lg'].includes(normalized)) return true;
  if (/^(?:vertical|horizontal|top|bottom)-(?:sm|md|lg)$/u.test(normalized)) return true;
  if (/^(?:[1-9]00)$/u.test(normalized)) return true;
  if (normalizeColorValue(normalized)) return true;
  if (normalizeCssLength(normalized, 'font-size')) return true;
  return false;
}

function derivePublishedFields(rows) {
  const values = rows.map(getPublishedCellText).filter(Boolean);
  const findValue = (predicate) => values.find((value) => predicate(value)) || '';

  // paddingStyle and marginStyle share one option vocabulary, so no value-shape
  // search can tell them apart — they have to come from a position. Anchored on the
  // alignment pair against the UNFILTERED rows, since empty cells still hold a slot.
  const anchored = resolveAlignAnchoredFields(rows.map(getPublishedCellText));
  const alignAnchored = Boolean(anchored);

  return {
    alignAnchored,
    heading: findValue((value) => !isPublishedControlValue(value)),
    headingLevel: findValue((value) => /^h[1-6]$/iu.test(value.trim())),
    textColor: findValue((value) => normalizeColorValue(value)),
    blockBackgroundColor: (anchored ? anchored.blockBackgroundColor : '') || values
      .map((value) => normalizeColorValue(value))
      .filter(Boolean)[1] || '',
    minHeight: (anchored ? anchored.minHeight : '') || '',
    minHeightMobile: (anchored ? anchored.minHeightMobile : '') || '',
    paddingStyle: (anchored ? anchored.paddingStyle : '') || '',
    marginStyle: (anchored ? anchored.marginStyle : '') || '',
    fontSize: findValue((value) => normalizeCssLength(value, 'font-size') && !/^(?:[1-9]00)$/u.test(value.trim())),
    fontWeight: findValue((value) => normalizeFontWeight(value)),
    horizontalAlign: findValue((value) => ['left', 'center', 'right', 'justify'].includes(value.trim().toLowerCase())),
    verticalAlign: findValue((value) => ['top', 'middle', 'bottom'].includes(value.trim().toLowerCase())),
  };
}

export default function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const resourcePath = getAueResourcePath(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const publishedFields = isEditor ? {} : derivePublishedFields(rows);

  // Fixed indices below match _colored-heading.json's ACTUAL current field order (fields
  // were regrouped under UI tabs by a later commit; "tab" entries are UI-only and consume
  // no row). Order: heading(0), headingLevel(1), textColor(2), fontSize(3), fontWeight(4),
  // horizontalAlign(5), verticalAlign(6), minHeight(7), minHeightMobile(8), paddingStyle(9),
  // marginStyle(10), blockBackgroundColor(11), dropShadow(12), markerTerms(13),
  // markerColor(14), markerStyle(15). blockBackgroundColor now sits at a fixed position
  // (it is no longer an optionally-inserted row after textColor), so it's read at its own
  // index like every other field instead of via a heuristic rowOffset.
  const headingField = readField(block, 'heading', ['title', 'text', 'heading text'], fieldCell(rows[0]), isEditor);
  if (!isEditor && publishedFields.heading) headingField.value = publishedFields.heading;
  const headingLevel = normalizeOption(
    publishedFields.headingLevel
      || readField(block, 'headingLevel', ['heading level', 'h tag', 'tag'], fieldCell(rows[1]), isEditor).value,
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    'h2',
  );
  const txtField = readColorField(block, 'textColor', ['text color', 'color'], isEditor, fieldCell(rows[2]));
  const textColor = normalizeColorValue(txtField.value || publishedFields.textColor)
    || (hasDarkSectionBackground(block) ? '#FFF' : '#00264D');
  const fontSize = normalizeCssLength(
    publishedFields.fontSize
      || readField(block, 'fontSize', ['font size', 'text size'], fieldCell(rows[3]), isEditor).value,
    'font-size',
  );
  const fontWeight = normalizeFontWeight(
    publishedFields.fontWeight
      || readField(block, 'fontWeight', ['font weight', 'weight'], fieldCell(rows[4]), isEditor).value,
  );
  const horizontalAlign = normalizeOption(
    publishedFields.horizontalAlign
      || readField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment'], fieldCell(rows[5]), isEditor).value,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const verticalAlign = normalizeOption(
    publishedFields.verticalAlign
      || readField(block, 'verticalAlign', ['vertical alignment'], fieldCell(rows[6]), isEditor).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  // When the published layout is recognised its answer is authoritative even when
  // empty — rows[7] holds fontWeight in that layout, so falling through to it is what
  // rendered an authored weight of 700 as min-height: 700px on live.
  const minHeight = normalizeCssLength(
    publishedFields.alignAnchored
      ? publishedFields.minHeight
      : readField(block, 'minHeight', ['minimum height', 'min height'], fieldCell(rows[7]), isEditor).value,
    'min-height',
  );
  const minHeightMobile = normalizeCssLength(
    publishedFields.alignAnchored
      ? publishedFields.minHeightMobile
      : readField(block, 'minHeightMobile', ['mobile min height', 'min height mobile', 'minimum height mobile'], fieldCell(rows[8]), isEditor).value,
    'min-height',
  );
  const paddingStyleField = readField(
    block,
    'paddingStyle',
    ['padding style', 'padding'],
    fieldCell(rows[9]),
    isEditor,
  );
  if (publishedFields.alignAnchored) paddingStyleField.value = publishedFields.paddingStyle;
  const marginStyleField = readField(
    block,
    'marginStyle',
    ['margin style', 'margin'],
    fieldCell(rows[10]),
    isEditor,
  );
  if (publishedFields.alignAnchored) marginStyleField.value = publishedFields.marginStyle;
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color', 'background color'],
    isEditor,
    fieldCell(rows[11]),
  );
  // See colored-text.js: in the published layout rows[11] is marginStyle, whose
  // literal value is truthy and would short-circuit the resolved one away.
  const blockBackgroundColor = normalizeColorValue(
    publishedFields.alignAnchored
      ? publishedFields.blockBackgroundColor
      : blockBgField.value || publishedFields.blockBackgroundColor,
  );
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

  syncResourceColorFields(resourcePath, block, heading);
  syncColoredFieldLayoutOptions(resourcePath, block, 'colored-heading');
}
