import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readLinkField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import { animateCountUpOnVisible } from '../../scripts/count-up.js';
import injectColorPickers from '../../scripts/block-color-picker.js';
import { applyAnimatedMarkers } from '../../scripts/animated-marker.js';
import {
  applyColoredFieldLayoutOptions,
  syncColoredFieldLayoutOptions,
} from '../../scripts/colored-field-options.js';

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TARGET_OPTION_VALUES = ['self', 'blank', 'same-tab', 'new-tab'];
const PADDING_STYLE_VALUES = [
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
const BORDER_RADIUS_VALUES = ['none', 'small', 'medium', 'large'];
const CONFIG_OPTION_VALUES = [
  'left',
  'center',
  'right',
  'justify',
  'stretch',
  'top',
  'middle',
  'bottom',
  'show',
  'hide',
  'icon',
  'fluid',
  'self',
  'blank',
  'same-tab',
  'new-tab',
  'solid',
  'outlined',
  'inverted',
  'none',
  'yes',
  'no',
  'true',
  'false',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'circle',
  'underline',
  'content-spacing-small',
  'content-spacing-medium',
  'content-spacing-large',
  ...PADDING_STYLE_VALUES.filter((value) => value !== 'default'),
];

// Offsets below match _statistics.json's ACTUAL current field order (fields were regrouped
// under UI tabs by a later commit — tabs don't consume a row, but the reorder invalidated
// these offsets: verticalDividers moved before the button fields instead of after them, and
// markerTerms/markerColor/markerStyle moved after contentSpacing/paddingStyle/borderRadius/
// dropShadow instead of before them. Everything else in this table was already correct.
const CURRENT_IMAGE_MODE_OFFSETS = {
  iconMaxWidth: 1,
  iconMaxHeight: 2,
  statValues: 3,
  statLabels: 4,
  verticalDividers: 5,
  defaultButtonText: 6,
  defaultButtonLink: 7,
  defaultButtonTarget: 8,
  blockBackgroundColor: 9,
  headingTextColor: 10,
  headingFontSize: 11,
  headingFontWeight: 12,
  bodyTextColor: 13,
  bodyFontSize: 14,
  bodyFontWeight: 15,
  valueTextColor: 16,
  valueFontSize: 17,
  valueFontWeight: 18,
  labelTextColor: 19,
  labelFontSize: 20,
  labelFontWeight: 21,
  minHeight: 22,
  minHeightMobile: 23,
  contentSpacing: 24,
  paddingStyle: 25,
  borderRadius: 26,
  dropShadow: 27,
  markerTerms: 28,
  markerColor: 29,
  markerStyle: 30,
  disclaimer: 31,
  disclaimerFontSize: 32,
};

const LEGACY_IMAGE_MODE_OFFSETS = {
  defaultButtonText: 3,
  defaultButtonLink: 4,
  defaultButtonTarget: 5,
  verticalDividers: 6,
  blockBackgroundColor: 7,
  headingTextColor: 8,
  headingFontSize: 9,
  headingFontWeight: 10,
  bodyTextColor: 11,
  bodyFontSize: 12,
  bodyFontWeight: 13,
  valueTextColor: 14,
  valueFontSize: 15,
  valueFontWeight: 16,
  labelTextColor: 17,
  labelFontSize: 18,
  labelFontWeight: 19,
  minHeight: 20,
  minHeightMobile: 21,
  statValues: 22,
  statLabels: 23,
  markerTerms: 25,
  markerColor: 26,
  markerStyle: 27,
  contentSpacing: 28,
  paddingStyle: 29,
  borderRadius: 30,
  dropShadow: 31,
  disclaimer: 32,
  disclaimerFontSize: 33,
};

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

function getFieldValue(block, name, altKeys, fallbackCell = null) {
  const propNames = [
    name,
    ...(altKeys || []).filter((key) => /^[a-z][a-z0-9-]*$/i.test(key)),
  ];
  const labels = [
    name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(),
    ...(altKeys || []),
  ];
  const field = readTextField(block, propNames, { labels, fallbackCell });
  return {
    source: field.source || field.cell,
    value: field.value,
    row: field.cell ? directRowOf(block, field.cell) : null,
  };
}

function readField(block, name, altKeys, fallbackCell = null) {
  const field = getFieldValue(block, name, altKeys, fallbackCell);
  if (field.row) field.row.remove();
  else if (field.source) {
    let rowEl = field.source;
    while (rowEl && rowEl.parentElement !== block) {
      rowEl = rowEl.parentElement;
    }
    if (rowEl && rowEl.parentElement === block) rowEl.remove();
  }
  return field;
}

function readImageBlockField(block, name, altKeys, fallbackCell = null) {
  const labels = [
    name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(),
    ...(altKeys || []),
  ];
  const field = readImageField(block, name, { labels, fallbackCell });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

function readLinkBlockField(block, name, altKeys, fallbackCell = null) {
  const labels = [
    name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(),
    ...(altKeys || []),
  ];
  const field = readLinkField(block, name, { labels, fallbackCell });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

function normalizeLines(value) {
  if (!value) return [];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeElementLines(element) {
  if (!element) return [];

  const lineNodes = [...element.querySelectorAll(':scope > p, :scope > div, :scope > li')]
    .filter((node) => node.textContent.trim());
  if (lineNodes.length > 1) {
    return lineNodes.map((node) => node.textContent.trim()).filter(Boolean);
  }

  const html = element.innerHTML || '';
  if (/<br\s*\/?>(?:\s*)/i.test(html)) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    return normalizeLines(clone.textContent || '');
  }

  return [];
}

function normalizeFieldLines(field, fallbackValue = '') {
  const elementLines = normalizeElementLines(field?.source);
  if (elementLines.length > 1) return elementLines;
  return normalizeLines(field?.value || fallbackValue);
}

function splitCollapsedStatValues(value) {
  const normalized = String(value || '').replace(/\u00a0/g, ' ').trim();
  if (!normalized) return [];

  const statValueRe = /(?:^|\s)([-+$]?\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|trillion|thousand)|[kmb])?[%+]?|[A-Za-z]{1,3}[%+])/giu;
  const values = [...normalized.matchAll(statValueRe)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  const remainder = values.reduce(
    (remaining, valuePart) => remaining.replace(valuePart, ''),
    normalized,
  ).replace(/\s+/g, '');

  return values.length > 1 && !remainder ? values : [normalized];
}

function normalizeStatValueLines(field, fallbackValue = '') {
  const lines = normalizeFieldLines(field, fallbackValue);
  return lines.length === 1 ? splitCollapsedStatValues(lines[0]) : lines;
}

function splitCollapsedStatLabels(value, expectedCount = 0) {
  const normalized = String(value || '').replace(/\u00a0/g, ' ').trim();
  if (!normalized || expectedCount < 2) return normalized ? [normalized] : [];

  const separatorParts = normalized
    .split(/\s*(?:\||;|�)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (separatorParts.length === expectedCount) return separatorParts;

  const yearParts = normalized
    .replace(/\((\d{4})\)\s+/g, '($1)|')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    yearParts.length === expectedCount
    && yearParts.every((part) => /\(\d{4}\)/u.test(part))
  ) return yearParts;

  // Split on a bare year (e.g. "in 2024") followed by an uppercase-starting word.
  // Handles labels like "...in 2024 Next label..." where each label ends with a year.
  const yearBoundaryParts = normalized
    .replace(/(\d{4})\s+(?=[A-Z])/gu, '$1|')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (yearBoundaryParts.length === expectedCount) return yearBoundaryParts;

  const sentenceEndParts = normalized
    .replace(/([.!?])\s+(?=[A-Za-z0-9])/gu, '$1|')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentenceEndParts.length === expectedCount) return sentenceEndParts;

  // Split on sentence-casing boundaries: lowercase letter → space → uppercase word.
  // Handles adjacent labels with no separator, e.g. "exploitation Missing children".
  // Requires the uppercase word to have a following lowercase letter (avoids splitting
  // on acronyms like "DNA" or single-letter words like "A").
  const sentenceBoundaryParts = normalized
    .replace(/([a-z])\s+(?=[A-Z][a-z])/gu, '$1|')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentenceBoundaryParts.length === expectedCount) return sentenceBoundaryParts;

  // Combined: apply year-boundary then sentence-boundary in one pass.
  // Handles labels like "...in 2024 Recovery rate Years..." where each heuristic
  // alone only finds one of the two split points.
  const combinedParts = normalized
    .replace(/(\d{4})\s+(?=[A-Z])/gu, '$1|')
    .replace(/([a-z])\s+(?=[A-Z][a-z])/gu, '$1|')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (combinedParts.length === expectedCount) return combinedParts;

  // Some published pages collapse item labels with no separator and use acronym-led
  // labels, e.g. "resolved AMBER Alert cases supported Missing child posters...".
  const acronymBoundaryParts = normalized
    .replace(/(\d{4})\s+(?=[A-Z])/gu, '$1|')
    .replace(/([a-z])\s+(?=(?:[A-Z]{2,}(?:\s+[A-Z][a-z])?|[A-Z][a-z]))/gu, '$1|')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (acronymBoundaryParts.length === expectedCount) return acronymBoundaryParts;

  const boundaryParts = normalized
    .split(/\s+(?=(?:exploitation reports analyzed|people reached annually|public\b|esp\b)\b)/iu)
    .map((part) => part.trim())
    .filter(Boolean);
  if (boundaryParts.length === expectedCount) return boundaryParts;

  const words = normalized.split(/\s+/u).filter(Boolean);
  if (words.length === expectedCount) return words;

  return [normalized];
}

function normalizeStatLabelLines(field, fallbackValue = '', expectedCount = 0) {
  const lines = normalizeFieldLines(field, fallbackValue);
  return lines.length === 1 ? splitCollapsedStatLabels(lines[0], expectedCount) : lines;
}

function createStatField(value = '') {
  return { source: null, value };
}

function expandCollapsedStatItems(items) {
  return items.flatMap((item) => {
    const values = splitCollapsedStatValues(item?.valueField?.value);
    if (values.length <= 1) return [item];

    const labels = splitCollapsedStatLabels(item?.labelField?.value, values.length);

    return values.map((value, index) => ({
      ...item,
      row: null,
      imageField: index === 0 ? item.imageField : null,
      topLabelField: index === 0 ? item.topLabelField : createStatField(),
      valueField: createStatField(value),
      labelField: createStatField(labels[index] || ''),
      buttonTextField: index === 0 ? item.buttonTextField : createStatField(),
      buttonLinkField: index === 0 ? item.buttonLinkField : createStatField(),
      buttonTarget: index === 0 ? item.buttonTarget : '',
      isAuthoringPlaceholder: false,
    }));
  });
}

function isLikelyRenderedHeading(value) {
  const text = String(value || '').trim();
  return Boolean(text && text.length <= 80 && !/[.!?]$/u.test(text));
}

function restoreRenderedHeading(inner, removeBody = false) {
  const bodyEl = inner?.querySelector(':scope > .statistics-body');
  const hasHeading = Boolean(inner?.querySelector(':scope > .statistics-heading'));
  const hasAuthoredBodyBinding = Boolean(bodyEl?.matches(
    '[data-aue-prop="bodyText"], [data-richtext-prop="bodyText"]',
  ));
  const bodyText = bodyEl?.textContent?.trim() || '';
  if (hasHeading || hasAuthoredBodyBinding || !isLikelyRenderedHeading(bodyText)) return;

  const heading = document.createElement('h2');
  heading.className = 'statistics-heading';
  heading.textContent = bodyText;
  inner.insertBefore(heading, bodyEl);

  if (removeBody) bodyEl.remove();
}

function removeDuplicateRenderedBody(inner) {
  const headingEl = inner?.querySelector(':scope > .statistics-heading');
  const bodyEl = inner?.querySelector(':scope > .statistics-body');
  const hasAuthoredBodyBinding = Boolean(bodyEl?.matches(
    '[data-aue-prop="bodyText"], [data-richtext-prop="bodyText"]',
  ));
  const headingText = headingEl?.textContent?.trim() || '';
  const bodyText = bodyEl?.textContent?.trim() || '';
  if (!hasAuthoredBodyBinding && headingText && headingText === bodyText) bodyEl.remove();
}

function ensureRenderedLabel(item) {
  const existing = item.querySelector(':scope > .statistics-label');
  if (existing) return existing;

  const label = document.createElement('div');
  label.className = 'statistics-label';
  item.append(label);
  return label;
}

function redistributeRenderedLabels(items) {
  if (items.length < 2) return;

  const firstLabel = items[0].querySelector(':scope > .statistics-label');
  const labels = splitCollapsedStatLabels(firstLabel?.textContent, items.length);
  if (labels.length !== items.length) return;

  items.forEach((item, index) => {
    ensureRenderedLabel(item).textContent = labels[index] || '';
  });
}

// When all labels are authored in the first item and the rest have none,
// attempt to split and redistribute them across all items.
function redistributeAuthoredLabels(items) {
  if (items.length < 2) return items;
  const firstLabel = items[0]?.labelField?.value;
  if (!firstLabel) return items;
  const restHaveNoLabels = items.slice(1).every((item) => !item.labelField?.value);
  if (!restHaveNoLabels) return items;
  const labels = splitCollapsedStatLabels(firstLabel, items.length);
  if (labels.length !== items.length) return items;
  return items.map((item, i) => ({
    ...item,
    labelField: createStatField(labels[i] || ''),
  }));
}

function normalizeRenderedStatistics(block) {
  const inner = block.querySelector(':scope > .statistics-inner');
  const list = inner?.querySelector?.(':scope > .statistics-list');
  const items = [...(list?.children || [])].filter((item) => item.classList.contains('statistics-item'));

  const [item] = items;
  const valueEl = item?.querySelector(':scope > .statistics-value');
  const labelEl = item?.querySelector(':scope > .statistics-label');
  const values = items.length === 1 ? splitCollapsedStatValues(valueEl?.textContent) : [];
  const willSplitSingleItem = values.length > 1;

  if (items.length > 1 || willSplitSingleItem) {
    restoreRenderedHeading(inner, true);
  }
  removeDuplicateRenderedBody(inner);
  redistributeRenderedLabels(items);

  if (!willSplitSingleItem) return;

  const labels = splitCollapsedStatLabels(labelEl?.textContent, values.length);
  const renderedItems = values.map((value, index) => {
    const renderedItem = document.createElement('li');
    renderedItem.className = item.className;

    const renderedValue = document.createElement('div');
    renderedValue.className = valueEl?.className || 'statistics-value';
    renderedValue.textContent = value;
    renderedValue.dataset.finalValue = value;
    renderedValue.setAttribute('aria-label', value);
    renderedItem.append(renderedValue);

    const renderedLabel = document.createElement('div');
    renderedLabel.className = labelEl?.className || 'statistics-label';
    renderedLabel.textContent = labels[index] || '';
    renderedItem.append(renderedLabel);

    return renderedItem;
  });

  list.replaceChildren(...renderedItems);
}
function snapshotAuthoredFieldValues(block) {
  return [...block.querySelectorAll('[data-aue-prop], [data-richtext-prop]')]
    .reduce((values, source) => {
      const name = source.getAttribute('data-aue-prop')
        || source.getAttribute('data-richtext-prop');
      if (!name || values[name] !== undefined || !directRowOf(block, source)) return values;

      const lines = normalizeElementLines(source);
      values[name] = lines.length ? lines.join('\n') : source.textContent?.trim() || '';
      return values;
    }, {});
}

function buildTextElement(tag, className, field) {
  if (!field?.value && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
  } else {
    el.textContent = field.value;
  }
  return el;
}

function buildOptimizedPicture(imageField, altText, imageMode = 'icon') {
  const sourceImg = imageField?.img;
  if (!sourceImg) return null;

  const width = imageMode === 'fluid' ? '1200' : '192';
  const picture = createOptimizedPicture(
    sourceImg.src,
    altText || sourceImg.alt || '',
    false,
    [{ width }],
  );
  const img = picture.querySelector('img');

  if (
    imageField.source
    && imageField.source !== imageField.picture
    && imageField.source !== sourceImg
  ) {
    moveInstrumentation(imageField.source, picture);
  }
  if (imageField.picture && imageField.picture !== imageField.source) {
    moveInstrumentation(imageField.picture, picture);
  }
  if (img) moveInstrumentation(sourceImg, img);

  return picture;
}

function normalizeColorKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z]+/g, ' ');
}

const LABELED_CONFIG_FIELDS = new Set([
  'heading',
  'title',
  'content alignment',
  'horizontal alignment',
  'heading alignment',
  'vertical alignment',
  'body text',
  'body',
  'copy',
  'subheading',
  'icon image',
  'image',
  'icon',
  'icon image alt text',
  'image alt text',
  'icon alt text',
  'image mode',
  'default button text',
  'button text',
  'default button link',
  'button link',
  'default button target',
  'button target',
  'vertical dividers',
  'dividers',
  'block background color',
  'background color',
  'heading text color',
  'heading color',
  'heading font size',
  'heading size',
  'heading font weight',
  'heading weight',
  'body text color',
  'body color',
  'body font size',
  'body size',
  'body font weight',
  'body weight',
  'value text color',
  'stat value color',
  'value color',
  'value font size',
  'stat value font size',
  'value size',
  'value font weight',
  'stat value font weight',
  'value weight',
  'label text color',
  'stat label color',
  'label color',
  'label font size',
  'stat label font size',
  'label size',
  'label font weight',
  'stat label font weight',
  'label weight',
  'minimum height',
  'min height',
  'mobile min height',
  'minimum height mobile',
  'stat values',
  'values',
  'stat labels',
  'labels',
  'text styles',
  'text colors',
  'colors',
  'marker text',
  'marker terms',
  'highlight text',
  'marker color',
  'highlight color',
  'marker style',
  'content spacing',
  'stat content spacing',
  'item spacing',
]);

function hasLabeledConfigRows(rows) {
  return rows.some((row) => LABELED_CONFIG_FIELDS.has(
    normalizeColorKey(row?.children?.[0]?.textContent),
  ));
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (hexMatch) return hexMatch[0];
  if (window.CSS?.supports?.('color', normalized)) return normalized;
  return '';
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

function getColorLuminance(value) {
  const channels = parseColorChannels(value);
  if (!channels) return null;

  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function isDarkColor(value) {
  const luminance = getColorLuminance(value);
  return luminance !== null && luminance < 0.3;
}

function isLightColor(value) {
  const luminance = getColorLuminance(value);
  return luminance !== null && luminance > 0.72;
}

function hasLikelyBackgroundLeadColor(colors = []) {
  const [firstColor, ...restColors] = colors;
  return colors.length >= 3
    && isDarkColor(firstColor)
    && restColors.some((color) => isLightColor(color));
}

function getInheritedTextColor(block) {
  const gridItem = block.closest('.colored-grid-row-item');
  const grid = block.closest('.colored-grid');
  return normalizeUsableColor(gridItem?.style?.getPropertyValue('--colored-grid-row-text'))
    || normalizeUsableColor(grid?.style?.getPropertyValue('--colored-grid-text'));
}

function getNearestBackgroundColor(block) {
  const gridItem = block.closest('.colored-grid-row-item');
  const grid = block.closest('.colored-grid');
  const section = block.closest('.section');
  return gridItem?.style?.getPropertyValue('--colored-grid-row-bg')
    || grid?.style?.getPropertyValue('--colored-grid-bg')
    || section?.getAttribute('data-background-color')
    || section?.getAttribute('data-backgroundcolor')
    || section?.style?.backgroundColor
    || '';
}

function defaultColorForContext(block, fallback) {
  return getInheritedTextColor(block)
    || (isDarkColor(getNearestBackgroundColor(block)) ? '#FFF' : fallback);
}

function defaultValueColorForContext(block, hasBodyText) {
  if (!hasBodyText && block.closest('.colored-grid') && isDarkColor(getNearestBackgroundColor(block))) {
    return '#039ab5';
  }

  return defaultColorForContext(block, '#00264d');
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

function normalizeContentSpacing(value, fallback = 'none') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (normalized === 'none') return 'none';
  if (!normalized.startsWith('content-spacing-')) return fallback;

  const option = normalized.replace(/^content-spacing-/u, '');
  return ['small', 'medium', 'large'].includes(option) ? option : fallback;
}

function normalizeImageMode(value, fallback = 'icon') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) return fallback;
  if (normalized.includes('fluid') || normalized.includes('responsive') || normalized.includes('full')) return 'fluid';
  if (normalized.includes('icon')) return 'icon';
  return fallback;
}

function normalizePaddingStyle(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!normalized) return fallback;

  const option = normalized.startsWith('padding-')
    ? normalized.replace(/^padding-/u, '')
    : normalized;
  return PADDING_STYLE_VALUES.includes(option) ? option : fallback;
}

function normalizeBorderRadius(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return BORDER_RADIUS_VALUES.includes(normalized) ? normalized : fallback;
}

function rowText(row) {
  return fieldCell(row)?.textContent?.trim() || '';
}

function rowHasMedia(row) {
  return Boolean(row?.querySelector?.('picture, img'));
}

function hasOptionValue(row, allowedValues) {
  return Boolean(normalizeOption(rowText(row), allowedValues, ''));
}

function isHexColorText(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '').trim());
}

function isCssLengthText(value) {
  return /^-?\d+(\.\d+)?(?:px|em|rem|vh|vw|vmin|vmax)$/i.test(String(value || '').trim());
}

function isFontWeightText(value) {
  return /^(?:[1-9]00)$/u.test(String(value || '').trim());
}

function isLikelyValueFontSizeText(value) {
  const size = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(size) && size >= 40 && size <= 200;
}

function isLikelyLabelFontSizeText(value) {
  const size = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(size) && size > 0 && size <= 80;
}

function isTargetText(value) {
  return Boolean(normalizeOption(value, TARGET_OPTION_VALUES, ''));
}

function isConfigOnlyText(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return isHexColorText(text)
    || isCssLengthText(text)
    || isFontWeightText(text)
    || Boolean(normalizeOption(text, CONFIG_OPTION_VALUES, ''))
    || Boolean(normalizePaddingStyle(text, ''));
}

function isLikelyStatValue(value) {
  return /^\s*[-+$]?\d/u.test(String(value || ''));
}

function isLikelyButtonText(value) {
  return /^(?:download(?:\s+\w+)*|learn more(?: here\.?)?|read more|view report)$/iu
    .test(String(value || '').trim());
}

function isHexAnchor(anchor) {
  return HEX_COLOR_RE.test(anchor?.getAttribute?.('href') || '');
}

function isLikelyHrefText(value) {
  const normalized = String(value || '').trim();
  if (!normalized || HEX_COLOR_RE.test(normalized)) return false;
  return /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|\.{1,2}\/|#(?![0-9a-f]{3,8}$))/i.test(normalized)
    || /\.(?:html?|pdf)(?:[?#]|$)/i.test(normalized);
}

function hasUsableLink(row) {
  const anchors = [...(row?.querySelectorAll?.('a[href]') || [])];
  if (anchors.some((anchor) => !isHexAnchor(anchor))) return true;
  return isLikelyHrefText(rowText(row));
}

function findLegacyAlignmentIndex(rows) {
  const maxStart = Math.min(rows.length - 1, 3);
  for (let index = 0; index < maxStart; index += 1) {
    if (
      hasOptionValue(rows[index], ['left', 'center', 'right'])
      && hasOptionValue(rows[index + 1], ['top', 'middle', 'bottom'])
    ) {
      return index;
    }
  }
  return -1;
}

function findLegacyImageModeIndex(rows, alignmentIndex) {
  const start = Math.max(0, alignmentIndex + 2);
  const end = Math.min(rows.length, alignmentIndex + 8);
  for (let index = start; index < end; index += 1) {
    if (normalizeImageMode(rowText(rows[index]), '')) return index;
  }
  return -1;
}

function hasTrustedLegacyOffsetValue(rows, imageModeIndex, offset, predicate) {
  if (imageModeIndex < 0 || !Number.isInteger(offset)) return false;

  const row = rows[imageModeIndex + offset];
  if (!row) return false;

  const text = rowText(row);
  return !text || predicate(text);
}

function hasTrustedLegacyOffsets(rows, imageModeIndex, offsets) {
  if (imageModeIndex < 0) return false;

  const checks = [
    ['verticalDividers', (text) => Boolean(normalizeOption(text, ['show', 'hide'], ''))],
    ['markerColor', isHexColorText],
    ['markerStyle', (text) => Boolean(normalizeOption(text, ['circle', 'underline'], ''))],
    ['contentSpacing', (text) => Boolean(normalizeContentSpacing(text, ''))],
    ['paddingStyle', (text) => Boolean(normalizePaddingStyle(text, ''))],
    ['borderRadius', (text) => Boolean(normalizeBorderRadius(text, ''))],
  ];

  const score = checks.reduce((count, [name, predicate]) => (
    count + (hasTrustedLegacyOffsetValue(rows, imageModeIndex, offsets[name], predicate) ? 1 : 0)
  ), 0);

  return score >= 4;
}

function snapshotPublishedFieldValues(rows) {
  const alignmentIndex = findLegacyAlignmentIndex(rows);
  const imageModeIndex = alignmentIndex >= 0
    ? findLegacyImageModeIndex(rows, alignmentIndex)
    : -1;
  if (
    imageModeIndex < 0
    || !hasTrustedLegacyOffsets(rows, imageModeIndex, CURRENT_IMAGE_MODE_OFFSETS)
  ) {
    return {};
  }

  return Object.entries(CURRENT_IMAGE_MODE_OFFSETS).reduce((values, [name, offset]) => {
    const value = rowText(rows[imageModeIndex + offset]);
    if (value) values[name] = value;
    return values;
  }, {});
}

function getLegacyConfig(rows) {
  if (hasLabeledConfigRows(rows)) {
    return {
      active: false,
      isCompact: false,
      compactCell() {
        return null;
      },
      compactValue() {
        return '';
      },
      cell() {
        return null;
      },
      bodyTextCell() {
        return null;
      },
      imageModeCell() {
        return null;
      },
      iconImageCell() {
        return null;
      },
      iconAltCell() {
        return null;
      },
      cleanupCompactRows() {},
    };
  }

  const alignmentIndex = findLegacyAlignmentIndex(rows);
  const active = alignmentIndex >= 0;
  const imageModeIndex = active ? findLegacyImageModeIndex(rows, alignmentIndex) : -1;
  const compactIconIndex = active
    ? rows.findIndex((row, index) => index >= alignmentIndex + 2 && rowHasMedia(row))
    : -1;
  const compactTextRows = (
    active
      ? rows.slice(alignmentIndex + 2).filter((row) => rowText(row) || rowHasMedia(row))
      : []
  );
  const compactTextRowsReversed = [...compactTextRows].reverse();
  const compactImageModeRow = compactTextRows
    .find((row) => normalizeImageMode(rowText(row), '')) || null;
  const compactMarkerStyleRow = compactTextRows
    .find((row) => hasOptionValue(row, ['circle', 'underline'])) || null;
  const compactBorderRadiusRow = compactTextRowsReversed
    .find((row) => normalizeBorderRadius(rowText(row), '')) || null;
  const compactPaddingStyleRow = compactTextRowsReversed
    .find((row) => (
      row !== compactBorderRadiusRow
      && normalizePaddingStyle(rowText(row), '')
    )) || null;
  const compactContentSpacingRow = compactTextRowsReversed
    .find((row) => (
      row !== compactBorderRadiusRow
      && row !== compactPaddingStyleRow
      && normalizeContentSpacing(rowText(row), '')
    )) || null;
  const compactColorRows = compactTextRows.filter((row) => isHexColorText(rowText(row)));
  const compactMarkerStyleIndex = compactMarkerStyleRow
    ? compactTextRows.indexOf(compactMarkerStyleRow)
    : -1;
  const compactMarkerColorRow = compactMarkerStyleIndex > 0
    && isHexColorText(rowText(compactTextRows[compactMarkerStyleIndex - 1]))
    ? compactTextRows[compactMarkerStyleIndex - 1]
    : null;
  const compactStyleColorRows = compactColorRows.filter((row) => row !== compactMarkerColorRow);
  const compactLengthRows = compactTextRows.filter((row) => isCssLengthText(rowText(row)));
  const compactWeightRows = compactTextRows.filter((row) => isFontWeightText(rowText(row)));
  const compactTargetRow = compactTextRows
    .find((row) => isTargetText(rowText(row))) || null;
  const compactDividerRow = compactTextRows.find((row) => hasOptionValue(row, ['show', 'hide'])) || null;
  const compactLinkRows = compactTextRows.filter(hasUsableLink);
  const compactConfigRows = new Set([
    compactImageModeRow,
    compactMarkerStyleRow,
    compactContentSpacingRow,
    compactPaddingStyleRow,
    compactBorderRadiusRow,
    compactTargetRow,
    compactDividerRow,
  ].filter(Boolean));
  const compactContentRows = compactTextRows.filter((row) => {
    const text = rowText(row);
    return text
      && !compactConfigRows.has(row)
      && !isConfigOnlyText(text)
      && !hasUsableLink(row);
  });
  const statValueRow = compactContentRows.find((row) => isLikelyStatValue(rowText(row)))
    || compactContentRows.find((row) => !isLikelyButtonText(rowText(row)))
    || null;
  const statValueIndex = compactContentRows.indexOf(statValueRow);
  const preStatContentRows = statValueIndex > 0 ? compactContentRows.slice(0, statValueIndex) : [];
  const headingRow = preStatContentRows.length > 1 ? preStatContentRows[0] : null;
  const bodyTextRow = headingRow ? preStatContentRows[1] : preStatContentRows[0] || null;
  const statLabelRow = statValueIndex >= 0
    ? compactContentRows.slice(statValueIndex + 1).find((row) => (
      rowText(row) && !isLikelyButtonText(rowText(row))
    ))
    : null;
  const compactButtonRows = compactContentRows.filter((row) => (
    row !== bodyTextRow
      && row !== statValueRow
      && row !== statLabelRow
      && isLikelyButtonText(rowText(row))
  ));
  const compactButtonTextRow = compactButtonRows[0]
    || compactLinkRows.find((row) => isLikelyButtonText(rowText(row)))
    || null;
  const compactButtonTextIndex = compactButtonTextRow
    ? compactTextRows.indexOf(compactButtonTextRow)
    : -1;
  const compactButtonLinkRow = compactButtonTextRow && hasUsableLink(compactButtonTextRow)
    ? compactButtonTextRow
    : compactLinkRows.find((row) => (
      compactButtonTextIndex < 0 || compactTextRows.indexOf(row) > compactButtonTextIndex
    )) || null;
  const bodySizeRow = bodyTextRow && compactLengthRows.length > 1
    ? compactLengthRows[0]
    : null;
  const styleLengthRows = compactLengthRows.filter((row) => row !== bodySizeRow);
  const valueSizeRow = styleLengthRows
    .find((row) => isLikelyValueFontSizeText(rowText(row))) || null;
  const labelSizeRow = styleLengthRows.find((row) => (
    row !== valueSizeRow
      && isLikelyLabelFontSizeText(rowText(row))
  )) || null;
  const labelWeightRow = compactWeightRows[0] || null;
  const minHeightRows = styleLengthRows
    .filter((row) => row !== valueSizeRow && row !== labelSizeRow);
  const compactStyleColors = compactStyleColorRows.map((row) => rowText(row));
  const colorCount = compactStyleColors.length;
  const leadingDarkColorRow = hasLikelyBackgroundLeadColor(compactStyleColors)
    ? compactStyleColorRows[0]
    : null;
  const blockBackgroundColorRow = leadingDarkColorRow
    || (colorCount >= 5 ? compactStyleColorRows[0] : null);
  const resolvedStyleColorRows = blockBackgroundColorRow === compactStyleColorRows[0]
    ? compactStyleColorRows.slice(1)
    : compactStyleColorRows;
  const resolvedColorCount = resolvedStyleColorRows.length;
  let headingColorRow = null;
  let bodyColorRow = null;

  if (blockBackgroundColorRow) {
    if (resolvedColorCount >= 4) {
      [headingColorRow, bodyColorRow] = resolvedStyleColorRows;
    } else if (resolvedColorCount >= 3) {
      [bodyColorRow] = resolvedStyleColorRows;
    }
  } else if (colorCount >= 5) {
    [, headingColorRow, bodyColorRow] = compactStyleColorRows;
  } else if (colorCount === 4) {
    [headingColorRow, bodyColorRow] = compactStyleColorRows;
  } else if (colorCount === 3) {
    [bodyColorRow] = compactStyleColorRows;
  }

  const valueColorRow = resolvedColorCount >= 2
    ? resolvedStyleColorRows[resolvedColorCount - 2]
    : resolvedStyleColorRows[0] || null;
  const labelColorRow = resolvedColorCount >= 2
    ? resolvedStyleColorRows[resolvedColorCount - 1]
    : null;
  const trustedOffsetMaps = [
    CURRENT_IMAGE_MODE_OFFSETS,
    LEGACY_IMAGE_MODE_OFFSETS,
  ].filter((offsets) => hasTrustedLegacyOffsets(rows, imageModeIndex, offsets));
  const offsetRow = (offset, predicate) => {
    if (imageModeIndex < 0 || !Number.isInteger(offset)) return null;
    const row = rows[imageModeIndex + offset];
    return row && predicate(rowText(row)) ? row : null;
  };
  const legacyOffsetRow = (name, predicate) => trustedOffsetMaps
    .map((offsets) => offsetRow(offsets[name], predicate))
    .find(Boolean) || null;
  const isContentRow = (value) => Boolean(
    value && !isConfigOnlyText(value) && !isLikelyButtonText(value),
  );
  const compactFields = {
    heading: headingRow,
    bodyText: bodyTextRow,
    imageMode: compactImageModeRow,
    defaultButtonText: compactButtonTextRow,
    defaultButtonLink: compactButtonLinkRow,
    defaultButtonTarget: compactTargetRow,
    verticalDividers: compactDividerRow,
    blockBackgroundColor: legacyOffsetRow('blockBackgroundColor', isHexColorText) || blockBackgroundColorRow,
    headingTextColor: legacyOffsetRow('headingTextColor', isHexColorText) || headingColorRow,
    headingFontSize: legacyOffsetRow('headingFontSize', isCssLengthText),
    headingFontWeight: legacyOffsetRow('headingFontWeight', isFontWeightText),
    bodyTextColor: legacyOffsetRow('bodyTextColor', isHexColorText) || bodyColorRow,
    bodyFontSize: legacyOffsetRow('bodyFontSize', isCssLengthText) || bodySizeRow,
    bodyFontWeight: legacyOffsetRow('bodyFontWeight', isFontWeightText),
    valueTextColor: legacyOffsetRow('valueTextColor', isHexColorText) || valueColorRow,
    valueFontSize: legacyOffsetRow('valueFontSize', isCssLengthText) || valueSizeRow,
    valueFontWeight: legacyOffsetRow('valueFontWeight', isFontWeightText),
    labelTextColor: legacyOffsetRow('labelTextColor', isHexColorText) || labelColorRow,
    labelFontSize: legacyOffsetRow('labelFontSize', isCssLengthText) || labelSizeRow,
    labelFontWeight: legacyOffsetRow('labelFontWeight', isFontWeightText) || labelWeightRow,
    minHeight: legacyOffsetRow('minHeight', isCssLengthText) || minHeightRows[0],
    minHeightMobile: legacyOffsetRow('minHeightMobile', isCssLengthText) || minHeightRows[1],
    statValues: legacyOffsetRow('statValues', isContentRow) || statValueRow,
    statLabels: legacyOffsetRow('statLabels', isContentRow) || statLabelRow,
    markerTerms: legacyOffsetRow('markerTerms', isContentRow),
    markerColor: legacyOffsetRow('markerColor', isHexColorText) || compactMarkerColorRow,
    markerStyle: compactMarkerStyleRow,
    contentSpacing: compactContentSpacingRow,
    paddingStyle: compactPaddingStyleRow,
    borderRadius: compactBorderRadiusRow,
  };

  return {
    active,
    isCompact: active && Boolean(statValueRow),
    compactCell(name) {
      return fieldCell(compactFields[name]);
    },
    compactValue(name) {
      return rowText(compactFields[name]);
    },
    cell(modelIndex) {
      if (!active) return null;
      if (modelIndex === 0) return alignmentIndex >= 2 ? fieldCell(rows[0]) : null;
      return fieldCell(rows[alignmentIndex + modelIndex - 1]);
    },
    bodyTextCell() {
      if (active && alignmentIndex >= 2) return fieldCell(rows[1]);
      return fieldCell(compactFields.bodyText);
    },
    imageModeCell(offset) {
      if (!active || imageModeIndex < 0) return null;
      return fieldCell(rows[imageModeIndex + offset]);
    },
    iconImageCell() {
      if (!active) return null;

      const expected = rows[alignmentIndex + 3];
      if (rowHasMedia(expected)) return fieldCell(expected);

      if (compactIconIndex >= 0) return fieldCell(rows[compactIconIndex]);

      const end = imageModeIndex >= 0 ? imageModeIndex : Math.min(rows.length, alignmentIndex + 8);
      const row = rows.slice(alignmentIndex + 2, end).find(rowHasMedia);
      return fieldCell(row);
    },
    iconAltCell() {
      if (!active || imageModeIndex !== alignmentIndex + 5) return null;
      return fieldCell(rows[alignmentIndex + 4]);
    },
    cleanupCompactRows() {
      const keepRows = new Set(Object.values(compactFields).filter(Boolean));
      compactTextRows.forEach((row) => {
        if (!keepRows.has(row)) row.remove();
      });
    },
  };
}

function isCompactItemValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized || HEX_COLOR_RE.test(normalized)) return false;
  return !isConfigOnlyText(normalized);
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

function setCssVar(block, name, value) {
  if (value) block.style.setProperty(name, value);
}

function setCssVarOnElement(element, name, value) {
  if (value) element.style.setProperty(name, value);
}

function applyBlockBackground(block, value) {
  const color = normalizeColorValue(value);
  if (!color) {
    block.classList.remove('has-block-background');
    block.style.removeProperty('--statistics-block-bg');
    return;
  }

  block.classList.add('has-block-background');
  block.style.setProperty('--statistics-block-bg', color);
}

function parseTextColors(value) {
  return normalizeLines(value).reduce((colors, line) => {
    const separatorIndex = line.includes('|') ? line.indexOf('|') : line.indexOf(':');
    if (separatorIndex <= 0) return colors;

    const key = normalizeColorKey(line.slice(0, separatorIndex));
    const color = line.slice(separatorIndex + 1).trim();
    if (!color) return colors;

    if (['heading', 'heading color', 'title'].includes(key)) colors.heading = color;
    else if (['body', 'body color', 'body text', 'copy', 'subheading', 'subtitle'].includes(key)) colors.body = color;
    else if (['value', 'value color', 'stat value', 'stat values'].includes(key)) colors.value = color;
    else if (['label', 'label color', 'stat label', 'stat labels'].includes(key)) colors.label = color;

    return colors;
  }, {});
}

function parseTextSizes(value) {
  return normalizeLines(value).reduce((sizes, line) => {
    const separatorIndex = line.includes('|') ? line.indexOf('|') : line.indexOf(':');
    if (separatorIndex <= 0) return sizes;

    const key = normalizeColorKey(line.slice(0, separatorIndex));
    const size = line.slice(separatorIndex + 1).trim();
    if (!size) return sizes;

    if (['heading size', 'heading text size', 'title size'].includes(key)) {
      sizes.heading = size;
    } else if (['body size', 'body text size', 'copy size'].includes(key)) {
      sizes.body = size;
    } else if (['value size', 'stat value size', 'stat values size'].includes(key)) {
      sizes.value = size;
    } else if (['label size', 'stat label size', 'stat labels size'].includes(key)) {
      sizes.label = size;
    }

    return sizes;
  }, {});
}

function parseTextWeights(value) {
  return normalizeLines(value).reduce((weights, line) => {
    const separatorIndex = line.includes('|') ? line.indexOf('|') : line.indexOf(':');
    if (separatorIndex <= 0) return weights;

    const key = normalizeColorKey(line.slice(0, separatorIndex));
    const weight = normalizeFontWeight(line.slice(separatorIndex + 1).trim());
    if (!weight) return weights;

    if (['heading weight', 'heading font weight', 'title weight'].includes(key)) {
      weights.heading = weight;
    } else if (['body weight', 'body font weight', 'body text weight', 'copy weight'].includes(key)) {
      weights.body = weight;
    } else if (['value weight', 'value font weight', 'stat value weight'].includes(key)) {
      weights.value = weight;
    } else if (['label weight', 'label font weight', 'stat label weight'].includes(key)) {
      weights.label = weight;
    }

    return weights;
  }, {});
}

function applyContentSpacing(block, value) {
  const spacing = normalizeContentSpacing(value, 'none');
  const amounts = {
    none: '0px',
    small: '8px',
    medium: '16px',
    large: '24px',
  };
  block.style.setProperty('--statistics-content-spacing', amounts[spacing]);
}

function applyStatisticsStyles(block, fields = {}) {
  if (Object.prototype.hasOwnProperty.call(fields, 'blockBackgroundColor')) {
    applyBlockBackground(block, fields.blockBackgroundColor);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'contentSpacing')) {
    applyContentSpacing(block, fields.contentSpacing);
  }
  setCssVar(block, '--statistics-heading-color', normalizeColorValue(fields.headingTextColor));
  setCssVar(block, '--statistics-body-color', normalizeColorValue(fields.bodyTextColor));
  setCssVar(block, '--statistics-value-color', normalizeColorValue(fields.valueTextColor));
  setCssVar(block, '--statistics-label-color', normalizeColorValue(fields.labelTextColor));
  setCssVar(block, '--statistics-heading-size', normalizeCssLength(fields.headingFontSize, 'font-size'));
  setCssVar(block, '--statistics-body-size', normalizeCssLength(fields.bodyFontSize, 'font-size'));
  setCssVar(block, '--statistics-value-size', normalizeCssLength(fields.valueFontSize, 'font-size'));
  setCssVar(block, '--statistics-label-size', normalizeCssLength(fields.labelFontSize, 'font-size'));
  setCssVar(block, '--statistics-heading-weight', normalizeFontWeight(fields.headingFontWeight));
  setCssVar(block, '--statistics-body-weight', normalizeFontWeight(fields.bodyFontWeight));
  setCssVar(block, '--statistics-value-weight', normalizeFontWeight(fields.valueFontWeight));
  setCssVar(block, '--statistics-label-weight', normalizeFontWeight(fields.labelFontWeight));
  setCssVar(block, '--statistics-min-height', normalizeCssLength(fields.minHeight, 'min-height'));
  setCssVar(block, '--statistics-min-height-mobile', normalizeCssLength(fields.minHeightMobile, 'min-height'));
  setCssVar(block, '--statistics-icon-max-width', normalizeCssLength(fields.iconMaxWidth, 'max-width'));
  setCssVar(block, '--statistics-icon-max-height', normalizeCssLength(fields.iconMaxHeight, 'max-height'));
}

function syncResourceStyles(resourcePath, block) {
  readAueResourceFields(resourcePath, [
    'blockBackgroundColor',
    'headingTextColor',
    'headingFontSize',
    'headingFontWeight',
    'bodyTextColor',
    'bodyFontSize',
    'bodyFontWeight',
    'valueTextColor',
    'valueFontSize',
    'valueFontWeight',
    'labelTextColor',
    'labelFontSize',
    'labelFontWeight',
    'minHeight',
    'minHeightMobile',
    'iconMaxWidth',
    'iconMaxHeight',
    'contentSpacing',
  ]).then((fields) => applyStatisticsStyles(block, fields));
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isStatisticsItemContainer(row) {
  return row?.getAttribute?.('data-aue-model') === 'statistics-item'
    || row?.getAttribute?.('data-aue-label') === 'Statistics Item';
}

function itemFieldCount(row, selector) {
  return row?.querySelectorAll?.(selector).length || 0;
}

function isItemRow(row) {
  if (!row?.children?.length) return false;
  const itemFieldSelector = [
    '[data-aue-prop="statValue"]',
    '[data-aue-prop="statTopLabel"]',
    '[data-aue-prop="statLabel"]',
    '[data-aue-prop="image"]',
    '[data-aue-prop="buttonText"]',
    '[data-aue-prop="buttonLink"]',
  ].join(', ');

  if (row.querySelector(itemFieldSelector)) {
    return isStatisticsItemContainer(row)
      || itemFieldCount(row, itemFieldSelector) > 1
      || row.querySelector('picture');
  }

  if (!row.querySelector('picture')) return false;

  return [...row.children].some((cell, index) => (
    index > 0 && isCompactItemValue(cell.textContent)
  ));
}

function readItemTextField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function readItemImageField(row, name, index) {
  return readImageField(row, name, { fallbackCell: row.children[index] });
}

function readItemLinkField(row, name, index) {
  return readLinkField(row, name, { fallbackCell: row.children[index] });
}

function readItemRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => (
      isItemRow(row)
        && !row.querySelector(
          [
            '[data-aue-prop="heading"]',
            '[data-aue-prop="bodyText"]',
            '[data-aue-prop="contentAlignment"]',
            '[data-aue-prop="verticalAlignment"]',
            '[data-aue-prop="subheading"]',
            '[data-aue-prop="iconImage"]',
            '[data-aue-prop="iconImageAlt"]',
            '[data-aue-prop="defaultButtonText"]',
            '[data-aue-prop="defaultButtonLink"]',
            '[data-aue-prop="defaultButtonTarget"]',
            '[data-aue-prop="verticalDividers"]',
            '[data-aue-prop="blockBackgroundColor"]',
            '[data-aue-prop="headingTextColor"]',
            '[data-aue-prop="headingFontSize"]',
            '[data-aue-prop="headingFontWeight"]',
            '[data-aue-prop="bodyTextColor"]',
            '[data-aue-prop="bodyFontSize"]',
            '[data-aue-prop="bodyFontWeight"]',
            '[data-aue-prop="valueTextColor"]',
            '[data-aue-prop="valueFontSize"]',
            '[data-aue-prop="valueFontWeight"]',
            '[data-aue-prop="labelTextColor"]',
            '[data-aue-prop="labelFontSize"]',
            '[data-aue-prop="labelFontWeight"]',
            '[data-aue-prop="minHeight"]',
            '[data-aue-prop="minHeightMobile"]',
            '[data-aue-prop="statValues"]',
            '[data-aue-prop="statLabels"]',
            '[data-aue-prop="textColors"]',
            '[data-aue-prop="contentSpacing"]',
          ].join(', '),
        )
    ));
}

function getAuthoredItems(block) {
  return readItemRows(block).map((row) => {
    const imageField = readItemImageField(row, 'image', 0);
    const imageAltField = readItemTextField(row, 'imageAlt', 1);
    const imageModeField = readItemTextField(row, 'imageMode', 2);
    const iconMaxWidthField = readItemTextField(row, 'iconMaxWidth', 3);
    const iconMaxHeightField = readItemTextField(row, 'iconMaxHeight', 4);
    const valueField = readItemTextField(row, 'statValue', 5);
    const labelField = readItemTextField(row, 'statLabel', 6);
    const buttonTextField = readItemTextField(row, 'buttonText', 7);
    const buttonLinkField = readItemLinkField(row, 'buttonLink', 8);
    const buttonTargetField = readItemTextField(row, 'buttonTarget', 9);
    const topLabelField = readItemTextField(row, 'statTopLabel', 10);

    return {
      row,
      imageField,
      imageAlt: imageAltField.value,
      imageMode: imageModeField.value,
      iconMaxWidth: iconMaxWidthField.value,
      iconMaxHeight: iconMaxHeightField.value,
      valueField,
      topLabelField,
      labelField,
      buttonTextField,
      buttonLinkField,
      buttonTarget: buttonTargetField.value,
      isAuthoringPlaceholder: hasAuthoringContext(row)
        && !imageField.img
        && !valueField.value
        && !topLabelField.value
        && !labelField.value
        && !buttonTextField.value
        && !buttonLinkField.value,
    };
  });
}

function getLegacyItems(values, labels) {
  const count = Math.max(values.length, labels.length);
  return Array.from({ length: count }, (_, index) => ({
    row: null,
    imageField: null,
    imageAlt: '',
    imageMode: '',
    iconMaxWidth: '',
    iconMaxHeight: '',
    valueField: { source: null, value: values[index] || '' },
    topLabelField: { source: null, value: '' },
    labelField: { source: null, value: labels[index] || '' },
    buttonTextField: { source: null, value: '' },
    buttonLinkField: { source: null, value: '' },
    buttonTarget: '',
    isAuthoringPlaceholder: false,
  }));
}

function getLooseLegacyStatContent(rows) {
  const imageMode = rows
    .map((row) => normalizeImageMode(rowText(row), ''))
    .find(Boolean) || '';
  const contentRows = rows.filter((row) => {
    const text = rowText(row);
    return text
      && !isConfigOnlyText(text)
      && !isLikelyButtonText(text)
      && !normalizeImageMode(text, '');
  });
  const valueRow = contentRows.find((row) => isLikelyStatValue(rowText(row))) || null;
  const valueIndex = contentRows.indexOf(valueRow);
  const labelRow = valueIndex >= 0
    ? contentRows.slice(valueIndex + 1).find((row) => !isLikelyStatValue(rowText(row))) || null
    : null;
  const bodyTextRow = valueIndex > 0 ? contentRows[0] : null;

  return {
    bodyText: bodyTextRow ? rowText(bodyTextRow) : '',
    imageMode,
    values: valueRow ? [rowText(valueRow)] : [],
    labels: labelRow ? [rowText(labelRow)] : [],
  };
}

function getLooseLegacyStyleFallbacks(rows, { hasHeading = false, hasBody = false } = {}) {
  const colors = rows.map((row) => rowText(row)).filter(isHexColorText);
  const lengths = rows.map((row) => rowText(row)).filter(isCssLengthText);
  const styles = {
    blockBackgroundColor: '',
    headingTextColor: '',
    bodyTextColor: '',
    valueTextColor: '',
    valueFontSize: '',
    labelTextColor: '',
    labelFontSize: '',
    markerColor: '',
    minHeight: '',
  };

  if (colors.length) {
    const [firstColor] = colors;
    const hasDarkCardLead = hasLikelyBackgroundLeadColor(colors);
    const contentColors = hasDarkCardLead ? colors.slice(1) : colors.slice();
    const roleNames = [];

    if (hasDarkCardLead) styles.blockBackgroundColor = firstColor;
    if (hasHeading) roleNames.push('headingTextColor');
    if (hasBody) roleNames.push('bodyTextColor');
    roleNames.push('valueTextColor', 'labelTextColor');

    const roleColors = contentColors.length > roleNames.length
      ? contentColors.slice(0, -1)
      : contentColors;

    roleNames.forEach((name, index) => {
      if (roleColors[index]) styles[name] = roleColors[index];
    });

    if (contentColors.length > roleNames.length) {
      styles.markerColor = contentColors[contentColors.length - 1];
    }
  }

  styles.valueFontSize = lengths.find((value) => isLikelyValueFontSizeText(value)) || '';
  styles.labelFontSize = lengths.find((value) => (
    value !== styles.valueFontSize
      && isLikelyLabelFontSizeText(value)
  )) || '';
  styles.minHeight = lengths.find((value) => (
    value !== styles.valueFontSize
      && value !== styles.labelFontSize
      && isLikelyValueFontSizeText(value)
  )) || '';

  return styles;
}

function appendFieldContent(field, element, fallbackValue = '') {
  if (field?.source) {
    moveInstrumentation(field.source, element);
    while (field.source.firstChild) element.append(field.source.firstChild);
  } else if (fallbackValue) {
    element.textContent = fallbackValue;
  }
}

function appendButtonText(field, element, fallbackValue = '') {
  if (field?.source?.querySelector?.('a[href]')) {
    moveInstrumentation(field.source, element);
    element.textContent = fallbackValue;
    return;
  }

  appendFieldContent(field, element, fallbackValue);
}

function normalizeTarget(value) {
  const target = normalizeOption(value, TARGET_OPTION_VALUES, 'self');
  return ['blank', 'new-tab'].includes(target) ? '_blank' : '_self';
}

function normalizeButtonValue(value) {
  const normalized = String(value || '').trim();
  return normalized && !isConfigOnlyText(normalized) ? normalized : '';
}

function fieldHasContent(field) {
  return Boolean(
    String(field?.value || '').trim()
      || field?.source?.textContent?.trim()
      || field?.source?.querySelector?.('a[href], button'),
  );
}

function fieldText(field) {
  return String(field?.value || field?.source?.textContent || '').trim();
}

function isNamedBodyTextField(field) {
  return Boolean(field?.source?.matches?.(
    '[data-aue-prop="bodyText"], [data-richtext-prop="bodyText"]',
  ));
}

function suppressDuplicateFallbackBody(headingField, bodyField) {
  if (isNamedBodyTextField(bodyField)) return bodyField;
  const headingText = fieldText(headingField);
  const bodyText = fieldText(bodyField);
  if (!headingText || headingText !== bodyText) return bodyField;
  return { source: null, value: '' };
}

function applyItemDefaults(items, defaults) {
  const styledItems = items.map((item) => ({
    ...item,
    imageMode: item.imageMode || defaults.imageMode || 'icon',
    iconMaxWidth: item.iconMaxWidth || defaults.iconMaxWidth || '',
    iconMaxHeight: item.iconMaxHeight || defaults.iconMaxHeight || '',
  }));

  if (styledItems.length !== 1) return styledItems;

  const item = styledItems[0];

  return [{
    ...item,
    imageField: item.imageField?.img || !defaults.imageField?.img
      ? item.imageField
      : defaults.imageField,
    imageAlt: item.imageAlt || defaults.imageAlt || '',
    buttonTextField: fieldHasContent(item.buttonTextField)
      ? item.buttonTextField
      : defaults.buttonTextField,
    buttonLinkField: fieldHasContent(item.buttonLinkField)
      ? item.buttonLinkField
      : defaults.buttonLinkField,
    buttonTarget: item.buttonTarget || defaults.buttonTarget || '',
  }];
}

function buildItem(itemData) {
  const item = document.createElement('li');
  item.className = 'statistics-item';
  if (itemData.row) moveInstrumentation(itemData.row, item);
  setItemLabel(item, [itemData.labelField.value, itemData.topLabelField.value]);

  const imageMode = normalizeImageMode(itemData.imageMode, 'icon');
  const picture = buildOptimizedPicture(itemData.imageField, itemData.imageAlt, imageMode);
  if (picture) {
    const media = document.createElement('div');
    media.className = `statistics-image statistics-image-${imageMode}`;
    setCssVarOnElement(media, '--statistics-icon-max-width', normalizeCssLength(itemData.iconMaxWidth, 'max-width'));
    setCssVarOnElement(media, '--statistics-icon-max-height', normalizeCssLength(itemData.iconMaxHeight, 'max-height'));
    media.append(picture);
    item.append(media);
  }

  if (itemData.topLabelField.value || itemData.topLabelField.source) {
    const topLabelEl = document.createElement('div');
    topLabelEl.className = 'statistics-top-label';
    appendFieldContent(itemData.topLabelField, topLabelEl, itemData.topLabelField.value);
    item.append(topLabelEl);
  }

  if (itemData.valueField.value || itemData.valueField.source) {
    const valueEl = document.createElement('div');
    valueEl.className = 'statistics-value';
    appendFieldContent(itemData.valueField, valueEl, itemData.valueField.value);
    valueEl.dataset.finalValue = valueEl.textContent.trim();
    item.append(valueEl);
  }

  if (itemData.labelField.value || itemData.labelField.source) {
    const labelEl = document.createElement('div');
    labelEl.className = 'statistics-label';
    appendFieldContent(itemData.labelField, labelEl, itemData.labelField.value);
    item.append(labelEl);
  }

  const rawButtonText = itemData.buttonTextField.value;
  const rawButtonLink = itemData.buttonLinkField.value;
  const buttonText = normalizeButtonValue(rawButtonText);
  const buttonLink = normalizeButtonValue(rawButtonLink);

  const hasButton = buttonText || buttonLink;

  if (hasButton) {
    const button = document.createElement(buttonLink ? 'a' : 'span');
    button.className = 'statistics-button';
    appendButtonText(
      itemData.buttonTextField,
      button,
      buttonText || 'Learn more here.',
    );

    if (buttonLink) {
      button.href = buttonLink;
      button.target = normalizeTarget(itemData.buttonTarget);
      if (button.target === '_blank') button.rel = 'noopener noreferrer';
    }

    if (itemData.buttonLinkField.source) {
      moveInstrumentation(itemData.buttonLinkField.source, button);
    }
    item.append(button);
  }

  if (!item.children.length && itemData.isAuthoringPlaceholder) {
    item.classList.add('is-authoring-placeholder');
    item.textContent = 'Add statistic content in the editor.';
  }

  return item.children.length ? item : null;
}

export default function decorate(block) {
  if (block.querySelector(':scope > .statistics-inner')) {
    normalizeRenderedStatistics(block);
    syncResourceStyles(getAueResourcePath(block), block);
    syncColoredFieldLayoutOptions(getAueResourcePath(block), block, 'statistics');
    return;
  }

  const resourcePath = getAueResourcePath(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const publishedFieldValues = snapshotPublishedFieldValues(rows);
  const authoredFieldValues = snapshotAuthoredFieldValues(block);
  const legacyConfig = getLegacyConfig(rows);
  const looseLegacy = getLooseLegacyStatContent(rows);
  const configCell = (index) => legacyConfig.cell(index);
  const legacyCell = (imageModeOffset) => (
    legacyConfig.isCompact ? null : legacyConfig.imageModeCell(imageModeOffset)
  );

  const headingField = readField(
    block,
    'heading',
    ['heading', 'title'],
    legacyConfig.compactCell('heading') || configCell(0),
  );
  const contentAlignmentField = readField(
    block,
    'contentAlignment',
    ['content alignment', 'horizontal alignment', 'heading alignment'],
    configCell(1),
  );
  const verticalAlignmentField = readField(block, 'verticalAlignment', ['vertical alignment'], configCell(2));
  const bodyTextCell = legacyConfig.active ? legacyConfig.bodyTextCell() : configCell(3);
  const bodyTextField = readField(
    block,
    'bodyText',
    ['body text', 'body', 'copy', 'subheading'],
    bodyTextCell,
  );
  const iconImageField = readImageBlockField(
    block,
    'iconImage',
    ['icon image', 'image', 'icon'],
    legacyConfig.iconImageCell() || configCell(4),
  );
  const iconImageAltField = readField(
    block,
    'iconImageAlt',
    ['icon image alt text', 'image alt text', 'icon alt text'],
    legacyConfig.iconAltCell(),
  );
  const imageModeField = readField(
    block,
    'imageMode',
    ['image display mode', 'image mode', 'image sizing'],
    legacyConfig.compactCell('imageMode') || legacyCell(0),
  );
  const iconMaxWidthField = readField(
    block,
    'iconMaxWidth',
    ['icon max width', 'icon width', 'image max width'],
    legacyCell(1),
  );
  const iconMaxHeightField = readField(
    block,
    'iconMaxHeight',
    ['icon max height', 'icon height', 'image max height'],
    legacyCell(2),
  );
  const defaultButtonTextField = readField(
    block,
    'defaultButtonText',
    ['button text', 'cta text'],
    legacyConfig.compactCell('defaultButtonText') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.defaultButtonText),
  );
  const defaultButtonLinkField = readLinkBlockField(
    block,
    'defaultButtonLink',
    ['button link', 'cta link'],
    legacyConfig.compactCell('defaultButtonLink') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.defaultButtonLink),
  );
  const defaultButtonTargetField = readField(
    block,
    'defaultButtonTarget',
    ['button target', 'open link in'],
    legacyConfig.compactCell('defaultButtonTarget') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.defaultButtonTarget),
  );
  const verticalDividersField = readField(
    block,
    'verticalDividers',
    ['vertical dividers', 'dividers'],
    legacyConfig.compactCell('verticalDividers') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.verticalDividers),
  );
  const blockBackgroundField = readField(
    block,
    'blockBackgroundColor',
    ['block background color', 'background color'],
    legacyConfig.compactCell('blockBackgroundColor') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.blockBackgroundColor),
  );
  const headingColorField = readField(
    block,
    'headingTextColor',
    ['heading text color', 'heading color'],
    legacyConfig.compactCell('headingTextColor') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.headingTextColor),
  );
  const headingSizeField = readField(
    block,
    'headingFontSize',
    ['heading font size', 'heading size'],
    legacyConfig.compactCell('headingFontSize') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.headingFontSize),
  );
  const headingWeightField = readField(
    block,
    'headingFontWeight',
    ['heading font weight', 'heading weight'],
    legacyConfig.compactCell('headingFontWeight') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.headingFontWeight),
  );
  const bodyColorField = readField(
    block,
    'bodyTextColor',
    ['body text color', 'body color'],
    legacyConfig.compactCell('bodyTextColor') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.bodyTextColor),
  );
  const bodySizeField = readField(
    block,
    'bodyFontSize',
    ['body font size', 'body size'],
    legacyConfig.compactCell('bodyFontSize') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.bodyFontSize),
  );
  const bodyWeightField = readField(
    block,
    'bodyFontWeight',
    ['body font weight', 'body weight'],
    legacyConfig.compactCell('bodyFontWeight') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.bodyFontWeight),
  );
  const valueColorField = readField(
    block,
    'valueTextColor',
    ['stat value text color', 'value text color', 'value color'],
    legacyConfig.compactCell('valueTextColor') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.valueTextColor),
  );
  const valueSizeField = readField(
    block,
    'valueFontSize',
    ['stat value font size', 'value font size', 'value size'],
    legacyConfig.compactCell('valueFontSize') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.valueFontSize),
  );
  const valueWeightField = readField(
    block,
    'valueFontWeight',
    ['stat value font weight', 'value font weight', 'value weight'],
    legacyConfig.compactCell('valueFontWeight') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.valueFontWeight),
  );
  const labelColorField = readField(
    block,
    'labelTextColor',
    ['stat label text color', 'label text color', 'label color'],
    legacyConfig.compactCell('labelTextColor') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.labelTextColor),
  );
  const labelSizeField = readField(
    block,
    'labelFontSize',
    ['stat label font size', 'label font size', 'label size'],
    legacyConfig.compactCell('labelFontSize') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.labelFontSize),
  );
  const labelWeightField = readField(
    block,
    'labelFontWeight',
    ['stat label font weight', 'label font weight', 'label weight'],
    legacyConfig.compactCell('labelFontWeight') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.labelFontWeight),
  );
  const minHeightField = readField(
    block,
    'minHeight',
    ['minimum height', 'min height'],
    legacyConfig.compactCell('minHeight') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.minHeight),
  );
  const minHeightMobileField = readField(
    block,
    'minHeightMobile',
    ['mobile min height', 'minimum height mobile'],
    legacyConfig.compactCell('minHeightMobile') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.minHeightMobile),
  );
  const statValuesField = readField(
    block,
    'statValues',
    ['stat values', 'values'],
    legacyConfig.compactCell('statValues') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.statValues),
  );
  const statLabelsField = readField(
    block,
    'statLabels',
    ['stat labels', 'labels'],
    legacyConfig.compactCell('statLabels') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.statLabels),
  );
  // "textColors" is a deprecated combined field that no longer exists in the current
  // model (superseded by the dedicated *TextColor fields above) — there's no valid
  // current position for it, so it relies solely on data-aue-prop matching in the editor.
  const textStylesField = readField(block, 'textColors', ['text styles', 'text colors', 'colors'], null);
  const markerTermsField = readField(
    block,
    'markerTerms',
    ['marker text', 'marker terms', 'highlight text'],
    legacyConfig.compactCell('markerTerms') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.markerTerms),
  );
  const markerColorField = readField(
    block,
    'markerColor',
    ['marker color', 'highlight marker color'],
    legacyConfig.compactCell('markerColor') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.markerColor),
  );
  const markerStyleField = readField(
    block,
    'markerStyle',
    ['marker style', 'highlight marker style'],
    legacyConfig.compactCell('markerStyle') || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.markerStyle),
  );
  const contentSpacingField = readField(
    block,
    'contentSpacing',
    ['content spacing', 'stat content spacing', 'item spacing'],
    legacyConfig.compactCell('contentSpacing')
      || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.contentSpacing),
  );
  const paddingStyleField = readField(
    block,
    'paddingStyle',
    ['padding style', 'padding', 'content padding'],
    legacyConfig.compactCell('paddingStyle')
      || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.paddingStyle),
  );
  const borderRadiusField = readField(
    block,
    'borderRadius',
    ['border radius'],
    legacyConfig.compactCell('borderRadius')
      || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.borderRadius),
  );
  const dropShadowField = readField(
    block,
    'dropShadow',
    ['drop shadow', 'shadow'],
    legacyConfig.compactCell('dropShadow')
      || legacyCell(CURRENT_IMAGE_MODE_OFFSETS.dropShadow),
  );
  const disclaimerField = readField(
    block,
    'disclaimer',
    ['disclaimer', 'disclaimer text'],
    legacyCell(CURRENT_IMAGE_MODE_OFFSETS.disclaimer),
  );
  const disclaimerFontSizeField = readField(
    block,
    'disclaimerFontSize',
    ['disclaimer font size'],
    legacyCell(CURRENT_IMAGE_MODE_OFFSETS.disclaimerFontSize),
  );
  const compactValue = (name) => legacyConfig.compactValue?.(name) || '';
  const authoredOrPublishedValue = (name) => authoredFieldValues[name] || publishedFieldValues[name] || '';
  const explicitFieldValue = (field, name) => {
    const inlineValue = field?.source || field?.row?.children?.length > 1
      ? field.value
      : '';
    return inlineValue || authoredOrPublishedValue(name);
  };
  const fieldFallback = (name) => (
    authoredOrPublishedValue(name) || compactValue(name) || ''
  );
  legacyConfig.cleanupCompactRows();

  const values = normalizeStatValueLines(statValuesField, fieldFallback('statValues'));
  const labels = normalizeStatLabelLines(statLabelsField, fieldFallback('statLabels'), values.length);
  const effectiveValues = values.length ? values : looseLegacy.values;
  const effectiveLabels = labels.length ? labels : looseLegacy.labels;
  const effectiveBodyTextField = suppressDuplicateFallbackBody(
    headingField,
    fieldHasContent(bodyTextField) || !looseLegacy.bodyText
      ? bodyTextField
      : { source: null, value: looseLegacy.bodyText },
  );
  const hasHeadingText = fieldHasContent(headingField);
  const hasBodyText = fieldHasContent(effectiveBodyTextField);
  const looseLegacyStyles = getLooseLegacyStyleFallbacks(rows, {
    hasHeading: hasHeadingText,
    hasBody: hasBodyText,
  });
  const textColors = parseTextColors(textStylesField.value);
  const textSizes = parseTextSizes(textStylesField.value);
  const textWeights = parseTextWeights(textStylesField.value);
  const resolvedHeadingFontSize = hasHeadingText
    ? explicitFieldValue(headingSizeField, 'headingFontSize')
    : '';
  const resolvedHeadingFontWeight = hasHeadingText
    ? explicitFieldValue(headingWeightField, 'headingFontWeight')
    : '';
  const resolvedBodyFontSize = hasBodyText
    ? explicitFieldValue(bodySizeField, 'bodyFontSize')
    : '';
  const resolvedBodyFontWeight = hasBodyText
    ? explicitFieldValue(bodyWeightField, 'bodyFontWeight')
    : '';
  const resolvedValueFontWeight = explicitFieldValue(valueWeightField, 'valueFontWeight');
  const resolvedLabelFontWeight = explicitFieldValue(labelWeightField, 'labelFontWeight');
  const resolvedMinHeightMobile = explicitFieldValue(minHeightMobileField, 'minHeightMobile');
  const headingColor = normalizeColorValue(explicitFieldValue(headingColorField, 'headingTextColor'))
    || normalizeColorValue(looseLegacyStyles.headingTextColor)
    || textColors.heading
    || defaultColorForContext(block, '#00264d');
  const bodyColor = normalizeColorValue(explicitFieldValue(bodyColorField, 'bodyTextColor'))
    || normalizeColorValue(looseLegacyStyles.bodyTextColor)
    || textColors.body
    || defaultColorForContext(block, '#404041');
  const valueColor = normalizeColorValue(explicitFieldValue(valueColorField, 'valueTextColor'))
    || normalizeColorValue(looseLegacyStyles.valueTextColor)
    || textColors.value
    || defaultValueColorForContext(block, hasBodyText);
  const labelColor = normalizeColorValue(explicitFieldValue(labelColorField, 'labelTextColor'))
    || normalizeColorValue(looseLegacyStyles.labelTextColor)
    || textColors.label
    || defaultColorForContext(block, '#6b6b6b');
  const blockBackgroundColor = normalizeColorValue(
    explicitFieldValue(blockBackgroundField, 'blockBackgroundColor'),
  ) || normalizeColorValue(looseLegacyStyles.blockBackgroundColor);
  const resolvedValueFontSize = explicitFieldValue(valueSizeField, 'valueFontSize')
    || looseLegacyStyles.valueFontSize;
  const resolvedLabelFontSize = explicitFieldValue(labelSizeField, 'labelFontSize')
    || looseLegacyStyles.labelFontSize;
  const resolvedMinHeight = explicitFieldValue(minHeightField, 'minHeight')
    || looseLegacyStyles.minHeight;
  const resolvedMarkerColor = explicitFieldValue(markerColorField, 'markerColor')
    || looseLegacyStyles.markerColor;

  if (textColors.heading) block.style.setProperty('--statistics-heading-color', textColors.heading);
  if (textColors.body) block.style.setProperty('--statistics-body-color', textColors.body);
  if (textColors.value) block.style.setProperty('--statistics-value-color', textColors.value);
  if (textColors.label) block.style.setProperty('--statistics-label-color', textColors.label);
  if (textSizes.heading) block.style.setProperty('--statistics-heading-size', textSizes.heading);
  if (textSizes.body) block.style.setProperty('--statistics-body-size', textSizes.body);
  if (textSizes.value) block.style.setProperty('--statistics-value-size', textSizes.value);
  if (textSizes.label) block.style.setProperty('--statistics-label-size', textSizes.label);
  if (textWeights.heading) block.style.setProperty('--statistics-heading-weight', textWeights.heading);
  if (textWeights.body) block.style.setProperty('--statistics-body-weight', textWeights.body);
  if (textWeights.value) block.style.setProperty('--statistics-value-weight', textWeights.value);
  if (textWeights.label) block.style.setProperty('--statistics-label-weight', textWeights.label);

  applyStatisticsStyles(block, {
    blockBackgroundColor,
    headingTextColor: headingColor,
    headingFontSize: resolvedHeadingFontSize,
    headingFontWeight: resolvedHeadingFontWeight,
    bodyTextColor: bodyColor,
    bodyFontSize: resolvedBodyFontSize,
    bodyFontWeight: resolvedBodyFontWeight,
    valueTextColor: valueColor,
    valueFontSize: resolvedValueFontSize,
    valueFontWeight: resolvedValueFontWeight,
    labelTextColor: labelColor,
    labelFontSize: resolvedLabelFontSize,
    labelFontWeight: resolvedLabelFontWeight,
    minHeight: resolvedMinHeight,
    minHeightMobile: resolvedMinHeightMobile,
    iconMaxWidth: iconMaxWidthField.value,
    iconMaxHeight: iconMaxHeightField.value,
    contentSpacing: contentSpacingField.value || fieldFallback('contentSpacing'),
  });

  const alignment = normalizeOption(contentAlignmentField.value, ['left', 'center', 'right'], 'center');
  const verticalAlignment = normalizeOption(verticalAlignmentField.value, ['top', 'middle', 'bottom'], 'top');
  const borderRadius = normalizeOption(
    borderRadiusField.value || fieldFallback('borderRadius'),
    ['none', 'small', 'medium', 'large'],
    'none',
  );
  block.classList.add(`statistics-align-${alignment}`, `statistics-v-${verticalAlignment}`, `statistics-radius-${borderRadius}`);

  if (verticalDividersField.value.toLowerCase() === 'hide') {
    block.classList.add('statistics-no-dividers');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'statistics-inner';

  const heading = buildTextElement('h2', 'statistics-heading', headingField);
  if (heading) wrapper.append(heading);

  const bodyText = buildTextElement('div', 'statistics-body', effectiveBodyTextField);
  if (bodyText) wrapper.append(bodyText);

  const list = document.createElement('ul');
  list.className = 'statistics-list';
  const authoredItems = getAuthoredItems(block);
  const items = applyItemDefaults(
    redistributeAuthoredLabels(
      expandCollapsedStatItems(
        authoredItems.length ? authoredItems : getLegacyItems(effectiveValues, effectiveLabels),
      ),
    ),
    {
      imageField: iconImageField,
      imageAlt: iconImageAltField.value,
      imageMode: imageModeField.value || looseLegacy.imageMode,
      iconMaxWidth: iconMaxWidthField.value,
      iconMaxHeight: iconMaxHeightField.value,
      buttonTextField: defaultButtonTextField,
      buttonLinkField: defaultButtonLinkField,
      buttonTarget: defaultButtonTargetField.value,
    },
  );
  items.forEach((itemData) => {
    const item = buildItem(itemData);
    if (item) list.append(item);
  });
  if (list.childElementCount) wrapper.append(list);

  const disclaimer = buildTextElement('div', 'statistics-disclaimer', disclaimerField);
  if (disclaimer) {
    setCssVarOnElement(disclaimer, '--statistics-disclaimer-size', normalizeCssLength(disclaimerFontSizeField.value, 'font-size'));
    wrapper.append(disclaimer);
  }

  block.replaceChildren(wrapper);
  // Multi-stat delivery markup can lose default alignment rows and misclassify the
  // heading as body text. Single-stat blocks keep their optional body unchanged.
  if (list.childElementCount > 1) {
    restoreRenderedHeading(wrapper, true);
  }
  applyAnimatedMarkers(wrapper, {
    terms: markerTermsField.value || fieldFallback('markerTerms'),
    color: resolvedMarkerColor,
    style: markerStyleField.value || fieldFallback('markerStyle'),
  });
  applyColoredFieldLayoutOptions(block, 'statistics', {
    paddingStyle: paddingStyleField.value || fieldFallback('paddingStyle'),
    dropShadow: dropShadowField.value || fieldFallback('dropShadow'),
  });

  injectColorPickers(block, [
    { label: 'Heading', cssVar: '--statistics-heading-color', value: headingColor },
    { label: 'Body', cssVar: '--statistics-body-color', value: bodyColor },
    { label: 'Value', cssVar: '--statistics-value-color', value: valueColor },
    { label: 'Label', cssVar: '--statistics-label-color', value: labelColor },
    {
      label: 'Block Background',
      cssVar: '--statistics-block-bg',
      value: blockBackgroundColor || '#ffffff',
      className: 'has-block-background',
    },
  ]);

  block.querySelectorAll('.statistics-value').forEach((valueEl, index) => {
    animateCountUpOnVisible(valueEl, {
      displayValue: valueEl.dataset.finalValue,
      duration: 950 + (index * 120),
    });
  });

  syncResourceStyles(resourcePath, block);
  syncColoredFieldLayoutOptions(resourcePath, block, 'statistics');
}
