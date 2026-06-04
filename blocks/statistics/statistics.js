import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import { readImageField, readTextField } from '../../scripts/block-field-utils.js';
import { animateCountUpOnVisible } from '../../scripts/count-up.js';

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

function parseTextColors(value) {
  return normalizeLines(value).reduce((colors, line) => {
    const separatorIndex = line.includes('|') ? line.indexOf('|') : line.indexOf(':');
    if (separatorIndex <= 0) return colors;

    const key = normalizeColorKey(line.slice(0, separatorIndex));
    const color = line.slice(separatorIndex + 1).trim();
    if (!color) return colors;

    if (['heading', 'title'].includes(key)) colors.heading = color;
    else if (['body', 'body text', 'copy', 'subheading', 'subtitle'].includes(key)) colors.body = color;
    else if (['value', 'stat value', 'stat values'].includes(key)) colors.value = color;
    else if (['label', 'stat label', 'stat labels'].includes(key)) colors.label = color;

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

    if (['body size', 'body text size', 'copy size'].includes(key)) {
      sizes.body = size;
    } else if (['value size', 'stat value size', 'stat values size'].includes(key)) {
      sizes.value = size;
    } else if (['label size', 'stat label size', 'stat labels size'].includes(key)) {
      sizes.label = size;
    }

    return sizes;
  }, {});
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
            '[data-aue-prop="subheading"]',
            '[data-aue-prop="verticalDividers"]',
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
  const headingField = readField(block, 'heading', ['heading', 'title']);
  const contentAlignmentField = readField(block, 'contentAlignment', ['content alignment', 'heading alignment']);
  const bodyTextField = readField(block, 'bodyText', ['body text', 'body', 'copy', 'subheading']);
  const verticalDividersField = readField(block, 'verticalDividers', ['vertical dividers', 'dividers']);
  const statValuesField = readField(block, 'statValues', ['stat values', 'values']);
  const statLabelsField = readField(block, 'statLabels', ['stat labels', 'labels']);
  const textStylesField = readField(block, 'textColors', ['text styles', 'text colors', 'colors']);

  const values = normalizeLines(statValuesField.value);
  const labels = normalizeLines(statLabelsField.value);
  const textColors = parseTextColors(textStylesField.value);
  const textSizes = parseTextSizes(textStylesField.value);

  if (textColors.heading) block.style.setProperty('--statistics-heading-color', textColors.heading);
  if (textColors.body) block.style.setProperty('--statistics-body-color', textColors.body);
  if (textColors.value) block.style.setProperty('--statistics-value-color', textColors.value);
  if (textColors.label) block.style.setProperty('--statistics-label-color', textColors.label);
  if (textSizes.body) block.style.setProperty('--statistics-body-size', textSizes.body);
  if (textSizes.value) block.style.setProperty('--statistics-value-size', textSizes.value);
  if (textSizes.label) block.style.setProperty('--statistics-label-size', textSizes.label);

  const alignment = contentAlignmentField.value.toLowerCase();
  if (alignment === 'left' || alignment === 'right') {
    block.classList.add(`statistics-align-${alignment}`);
  }

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

  block.querySelectorAll('.statistics-value').forEach((valueEl, index) => {
    animateCountUpOnVisible(valueEl, {
      displayValue: valueEl.dataset.finalValue,
      duration: 950 + (index * 120),
    });
  });
}
