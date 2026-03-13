import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Try to find a field by data-aue-prop attribute (universal editor),
 * then fall back to scanning key-value rows.
 * This mirrors the pattern used by hero, info-cards-grid, and card-row.
 */
function getFieldValue(block, name, altKeys) {
  // 1. Try data-aue-prop (universal editor / xwalk)
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  // 2. Scan key-value rows (delivered page fallback)
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

/**
 * Read and remove the stat value color field from the block.
 * Follows the same readTextColor pattern used in hero.js.
 */
function readStatValueColor(block) {
  // Try data-aue-prop first
  const field = getFieldValue(block, 'statValueColor', [
    'stat value color',
    'value color',
    'statvaluecolor',
  ]);

  if (field.source) {
    // Remove the row containing this field so it doesn't appear as content
    if (field.row) {
      field.row.remove();
    } else {
      // In editor mode, the source might be directly in a wrapper row
      let rowEl = field.source;
      while (rowEl && rowEl.parentElement !== block) {
        rowEl = rowEl.parentElement;
      }
      if (rowEl && rowEl.parentElement === block) rowEl.remove();
    }
  }

  const raw = field.value;
  if (!raw) return '';
  const trimmed = raw.trim();
  // Accept hex colors with or without #
  if (/^#?[0-9a-fA-F]{3,6}$/.test(trimmed)) {
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }
  return '';
}

/**
 * Read and remove a text field from the block.
 */
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

export default function decorate(block) {
  // Read color FIRST (before other fields consume rows)
  const statValueColor = readStatValueColor(block);

  // Read content fields
  const headingField = readField(block, 'heading', ['heading', 'title']);
  const subheadingField = readField(block, 'subheading', ['subheading']);
  const statValuesField = readField(block, 'statValues', ['stat values', 'values']);
  const statLabelsField = readField(block, 'statLabels', ['stat labels', 'labels']);

  const values = normalizeLines(statValuesField.value);
  const labels = normalizeLines(statLabelsField.value);

  // Build the output DOM
  const wrapper = document.createElement('div');
  wrapper.className = 'statistics-inner';

  const heading = buildTextElement('h2', 'statistics-heading', headingField);
  if (heading) wrapper.append(heading);

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
      if (statValueColor) {
        valueEl.style.setProperty('color', statValueColor, 'important');
      }
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
