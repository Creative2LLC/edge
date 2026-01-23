import { moveInstrumentation } from '../../scripts/scripts.js';

const LEGACY_LABELS = {
  heading: ['heading', 'title'],
  stat1Value: ['stat 1 value', 'stat1 value', 'value 1'],
  stat1Label: ['stat 1 label', 'stat1 label', 'label 1'],
  stat2Value: ['stat 2 value', 'stat2 value', 'value 2'],
  stat2Label: ['stat 2 label', 'stat2 label', 'label 2'],
  stat3Value: ['stat 3 value', 'stat3 value', 'value 3'],
  stat3Label: ['stat 3 label', 'stat3 label', 'label 3'],
};

function collectLegacyFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(LEGACY_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      map[name] = { source: valueEl, value: valueEl.textContent.trim() };
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getField(block, legacyMap, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  return legacyMap[name] || { source: null, value: '' };
}

function buildTextElement(tag, className, field) {
  if (!field?.value && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else {
    el.textContent = field.value;
  }
  return el;
}

function buildItem(valueField, labelField) {
  if (!valueField?.value && !labelField?.value && !valueField?.source && !labelField?.source) {
    return null;
  }
  const item = document.createElement('li');
  item.className = 'statistics-item';
  const valueEl = buildTextElement('div', 'statistics-value', valueField);
  const labelEl = buildTextElement('div', 'statistics-label', labelField);
  if (valueEl) item.append(valueEl);
  if (labelEl) item.append(labelEl);
  return item;
}

export default function decorate(block) {
  const legacyMap = collectLegacyFields(block);
  const headingField = getField(block, legacyMap, 'heading');
  const statFields = [
    [getField(block, legacyMap, 'stat1Value'), getField(block, legacyMap, 'stat1Label')],
    [getField(block, legacyMap, 'stat2Value'), getField(block, legacyMap, 'stat2Label')],
    [getField(block, legacyMap, 'stat3Value'), getField(block, legacyMap, 'stat3Label')],
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'statistics-inner';

  const heading = buildTextElement('h2', 'statistics-heading', headingField);
  if (heading) wrapper.append(heading);

  const list = document.createElement('ul');
  list.className = 'statistics-list';
  statFields.forEach(([valueField, labelField]) => {
    const item = buildItem(valueField, labelField);
    if (item) list.append(item);
  });
  if (list.childElementCount) wrapper.append(list);

  block.replaceChildren(wrapper);
}
