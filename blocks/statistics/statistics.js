import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { animateCountUpOnVisible } from '../../scripts/count-up.js';
import injectColorPickers from '../../scripts/block-color-picker.js';

function directRowOf(block, element) {
  let rowEl = element;
  while (rowEl && rowEl.parentElement !== block) {
    rowEl = rowEl.parentElement;
  }
  return rowEl && rowEl.parentElement === block ? rowEl : null;
}

function getFieldValue(block, name, altKeys) {
  const propNames = [
    name,
    ...(altKeys || []).filter((key) => /^[a-z][a-z0-9-]*$/i.test(key)),
  ];
  const labels = [
    name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(),
    ...(altKeys || []),
  ];
  const field = readTextField(block, propNames, { labels });
  return {
    source: field.source || field.cell,
    value: field.value,
    row: field.cell ? directRowOf(block, field.cell) : null,
  };
}

function readField(block, name, altKeys) {
  const field = getFieldValue(block, name, altKeys);
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

function buildOptimizedPicture(imageField, altText) {
  const sourceImg = imageField?.img;
  if (!sourceImg) return null;

  const picture = createOptimizedPicture(
    sourceImg.src,
    altText || sourceImg.alt || '',
    false,
    [{ width: '192' }],
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

function normalizeLines(value) {
  if (!value) return [];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeColorKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z]+/g, ' ');
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalized) && hexMatch) return hexMatch[0];
  return normalized;
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

function setCssVar(block, name, value) {
  if (value) block.style.setProperty(name, value);
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

function applyStatisticsStyles(block, fields = {}) {
  if (Object.prototype.hasOwnProperty.call(fields, 'blockBackgroundColor')) {
    applyBlockBackground(block, fields.blockBackgroundColor);
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
  ]).then((fields) => applyStatisticsStyles(block, fields));
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isItemRow(row) {
  if (!row?.children?.length) return false;
  return Boolean(
    row.querySelector('[data-aue-prop="statValue"], [data-aue-prop="statLabel"], [data-aue-prop="image"]')
      || row.querySelector('picture'),
  );
}

function readItemTextField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function readItemImageField(row, name, index) {
  return readImageField(row, name, { fallbackCell: row.children[index] });
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
          ].join(', '),
        )
    ));
}

function getAuthoredItems(block) {
  return readItemRows(block).map((row) => {
    const imageField = readItemImageField(row, 'image', 0);
    const imageAltField = readItemTextField(row, 'imageAlt', 1);
    const valueField = readItemTextField(row, 'statValue', 2);
    const labelField = readItemTextField(row, 'statLabel', 3);

    return {
      row,
      imageField,
      imageAlt: imageAltField.value,
      valueField,
      labelField,
      isAuthoringPlaceholder: hasAuthoringContext(row)
        && !imageField.img
        && !valueField.value
        && !labelField.value,
    };
  });
}

function getLegacyItems(values, labels) {
  const count = Math.max(values.length, labels.length);
  return Array.from({ length: count }, (_, index) => ({
    row: null,
    imageField: null,
    imageAlt: '',
    valueField: { source: null, value: values[index] || '' },
    labelField: { source: null, value: labels[index] || '' },
    isAuthoringPlaceholder: false,
  }));
}

function appendFieldContent(field, element, fallbackValue = '') {
  if (field?.source) {
    moveInstrumentation(field.source, element);
    while (field.source.firstChild) element.append(field.source.firstChild);
  } else if (fallbackValue) {
    element.textContent = fallbackValue;
  }
}

function buildItem(itemData) {
  const item = document.createElement('li');
  item.className = 'statistics-item';
  if (itemData.row) moveInstrumentation(itemData.row, item);

  const picture = buildOptimizedPicture(itemData.imageField, itemData.imageAlt);
  if (picture) {
    const media = document.createElement('div');
    media.className = 'statistics-image';
    media.append(picture);
    item.append(media);
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

  if (!item.children.length && itemData.isAuthoringPlaceholder) {
    item.classList.add('is-authoring-placeholder');
    item.textContent = 'Add statistic content in the editor.';
  }

  return item.children.length ? item : null;
}

export default function decorate(block) {
  const resourcePath = getAueResourcePath(block);
  const headingField = readField(block, 'heading', ['heading', 'title']);
  const contentAlignmentField = readField(block, 'contentAlignment', ['content alignment', 'horizontal alignment', 'heading alignment']);
  const verticalAlignmentField = readField(block, 'verticalAlignment', ['vertical alignment']);
  const bodyTextField = readField(block, 'bodyText', ['body text', 'body', 'copy', 'subheading']);
  const verticalDividersField = readField(block, 'verticalDividers', ['vertical dividers', 'dividers']);
  const blockBackgroundField = readField(block, 'blockBackgroundColor', ['block background color', 'background color']);
  const headingColorField = readField(block, 'headingTextColor', ['heading text color', 'heading color']);
  const headingSizeField = readField(block, 'headingFontSize', ['heading font size', 'heading size']);
  const headingWeightField = readField(block, 'headingFontWeight', ['heading font weight', 'heading weight']);
  const bodyColorField = readField(block, 'bodyTextColor', ['body text color', 'body color']);
  const bodySizeField = readField(block, 'bodyFontSize', ['body font size', 'body size']);
  const bodyWeightField = readField(block, 'bodyFontWeight', ['body font weight', 'body weight']);
  const valueColorField = readField(block, 'valueTextColor', ['stat value text color', 'value text color', 'value color']);
  const valueSizeField = readField(block, 'valueFontSize', ['stat value font size', 'value font size', 'value size']);
  const valueWeightField = readField(block, 'valueFontWeight', ['stat value font weight', 'value font weight', 'value weight']);
  const labelColorField = readField(block, 'labelTextColor', ['stat label text color', 'label text color', 'label color']);
  const labelSizeField = readField(block, 'labelFontSize', ['stat label font size', 'label font size', 'label size']);
  const labelWeightField = readField(block, 'labelFontWeight', ['stat label font weight', 'label font weight', 'label weight']);
  const minHeightField = readField(block, 'minHeight', ['minimum height', 'min height']);
  const minHeightMobileField = readField(block, 'minHeightMobile', ['mobile min height', 'minimum height mobile']);
  const statValuesField = readField(block, 'statValues', ['stat values', 'values']);
  const statLabelsField = readField(block, 'statLabels', ['stat labels', 'labels']);
  const textStylesField = readField(block, 'textColors', ['text styles', 'text colors', 'colors']);

  const values = normalizeLines(statValuesField.value);
  const labels = normalizeLines(statLabelsField.value);
  const textColors = parseTextColors(textStylesField.value);
  const textSizes = parseTextSizes(textStylesField.value);
  const textWeights = parseTextWeights(textStylesField.value);
  const headingColor = normalizeColorValue(headingColorField.value) || textColors.heading || '#00264d';
  const bodyColor = normalizeColorValue(bodyColorField.value) || textColors.body || '#404041';
  const valueColor = normalizeColorValue(valueColorField.value) || textColors.value || '#00264d';
  const labelColor = normalizeColorValue(labelColorField.value) || textColors.label || '#6b6b6b';
  const blockBackgroundColor = normalizeColorValue(blockBackgroundField.value);

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
    blockBackgroundColor: blockBackgroundField.value,
    headingTextColor: headingColorField.value,
    headingFontSize: headingSizeField.value,
    headingFontWeight: headingWeightField.value,
    bodyTextColor: bodyColorField.value,
    bodyFontSize: bodySizeField.value,
    bodyFontWeight: bodyWeightField.value,
    valueTextColor: valueColorField.value,
    valueFontSize: valueSizeField.value,
    valueFontWeight: valueWeightField.value,
    labelTextColor: labelColorField.value,
    labelFontSize: labelSizeField.value,
    labelFontWeight: labelWeightField.value,
    minHeight: minHeightField.value,
    minHeightMobile: minHeightMobileField.value,
  });

  const alignment = normalizeOption(contentAlignmentField.value, ['left', 'center', 'right'], 'center');
  const verticalAlignment = normalizeOption(verticalAlignmentField.value, ['top', 'middle', 'bottom'], 'top');
  block.classList.add(`statistics-align-${alignment}`, `statistics-v-${verticalAlignment}`);

  if (verticalDividersField.value.toLowerCase() === 'hide') {
    block.classList.add('statistics-no-dividers');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'statistics-inner';

  const heading = buildTextElement('h2', 'statistics-heading', headingField);
  if (heading) wrapper.append(heading);

  const bodyText = buildTextElement('div', 'statistics-body', bodyTextField);
  if (bodyText) wrapper.append(bodyText);

  const list = document.createElement('ul');
  list.className = 'statistics-list';
  const authoredItems = getAuthoredItems(block);
  const items = authoredItems.length ? authoredItems : getLegacyItems(values, labels);
  items.forEach((itemData) => {
    const item = buildItem(itemData);
    if (item) list.append(item);
  });
  if (list.childElementCount) wrapper.append(list);

  block.replaceChildren(wrapper);

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
}
