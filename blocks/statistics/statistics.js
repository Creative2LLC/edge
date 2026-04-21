import { moveInstrumentation } from '../../scripts/scripts.js';

function getFieldValue(block, name, altKeys) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const keys = altKeys || [];
  const allKeys = [name.toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...keys];
  const rows = [...block.querySelectorAll(':scope > div')];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const cols = [...row.children];
    if (cols.length >= 2) {
      const key = cols[0].textContent.trim().toLowerCase();
      if (allKeys.includes(key)) {
        return { source: cols[1], value: cols[1].textContent.trim(), row };
      }
    }
  }

  return { source: null, value: '', row: null };
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
    else if (['subheading', 'subtitle'].includes(key)) colors.subheading = color;
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

    if (['value size', 'stat value size', 'stat values size'].includes(key)) {
      sizes.value = size;
    } else if (['label size', 'stat label size', 'stat labels size'].includes(key)) {
      sizes.label = size;
    }

    return sizes;
  }, {});
}

export default function decorate(block) {
  const headingField = readField(block, 'heading', ['heading', 'title']);
  const headingAlignmentField = readField(block, 'headingAlignment', ['heading alignment']);
  const subheadingField = readField(block, 'subheading', ['subheading']);
  const statValuesField = readField(block, 'statValues', ['stat values', 'values']);
  const statLabelsField = readField(block, 'statLabels', ['stat labels', 'labels']);
  const textStylesField = readField(block, 'textColors', ['text styles', 'text colors', 'colors']);

  const values = normalizeLines(statValuesField.value);
  const labels = normalizeLines(statLabelsField.value);
  const textColors = parseTextColors(textStylesField.value);
  const textSizes = parseTextSizes(textStylesField.value);

  if (textColors.heading) block.style.setProperty('--statistics-heading-color', textColors.heading);
  if (textColors.subheading) block.style.setProperty('--statistics-subheading-color', textColors.subheading);
  if (textColors.value) block.style.setProperty('--statistics-value-color', textColors.value);
  if (textColors.label) block.style.setProperty('--statistics-label-color', textColors.label);
  if (textSizes.value) block.style.setProperty('--statistics-value-size', textSizes.value);
  if (textSizes.label) block.style.setProperty('--statistics-label-size', textSizes.label);

  const wrapper = document.createElement('div');
  wrapper.className = 'statistics-inner';

  const heading = buildTextElement('h2', 'statistics-heading', headingField);
  if (heading) {
    const alignment = headingAlignmentField.value.toLowerCase();
    if (alignment === 'left' || alignment === 'right') {
      heading.classList.add(`statistics-heading-${alignment}`);
    }
    wrapper.append(heading);
  }

  const subheading = buildTextElement('div', 'statistics-subheading', subheadingField);
  if (subheading) wrapper.append(subheading);

  const list = document.createElement('ul');
  list.className = 'statistics-list';
  const count = Math.max(values.length, labels.length);
  for (let i = 0; i < count; i += 1) {
    const item = document.createElement('li');
    item.className = 'statistics-item';

    if (values[i]) {
      const valueEl = document.createElement('div');
      valueEl.className = 'statistics-value';
      valueEl.textContent = values[i];
      item.append(valueEl);
    }

    if (labels[i]) {
      const labelEl = document.createElement('div');
      labelEl.className = 'statistics-label';
      labelEl.textContent = labels[i];
      item.append(labelEl);
    }

    if (item.children.length) list.append(item);
  }
  if (list.childElementCount) wrapper.append(list);

  block.replaceChildren(wrapper);
}
