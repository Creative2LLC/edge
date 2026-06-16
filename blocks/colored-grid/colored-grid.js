import {
  readAueResourceFields,
  resourcePathFromAueResource,
} from '../../scripts/block-field-utils.js';

const BLOCK_FIELD_NAMES = [
  'backgroundColor',
  'textColor',
  'padding',
  'rowGap',
  'borderRadius',
  'maxWidth',
  'minHeight',
  'verticalAlign',
];

const ROW_FIELD_NAMES = [
  'columns',
  'backgroundColor',
  'textColor',
  'padding',
  'gap',
  'borderRadius',
  'minHeight',
  'horizontalAlign',
  'verticalAlign',
];

const COLORED_GRID_ROW_SELECTOR = [
  '[data-aue-model="colored-grid-row"]',
  '[data-aue-filter="colored-grid-row"]',
  '[data-aue-label="Colored Grid Row"]',
].join(', ');

const ROW_RUNTIME_CLASS_PREFIXES = [
  'colored-grid-row-h-',
  'colored-grid-row-v-',
];

const ROW_RUNTIME_STYLE_PROPS = [
  '--colored-grid-row-columns',
  '--colored-grid-row-bg',
  '--colored-grid-row-text',
  '--colored-grid-row-padding',
  '--colored-grid-row-gap',
  '--colored-grid-row-radius',
  '--colored-grid-row-min-height',
];

function fieldSelector(name) {
  return `[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`;
}

function fieldSource(row, name) {
  if (!row) return null;

  return row.matches?.(fieldSelector(name))
    ? row
    : row.querySelector?.(fieldSelector(name)) || null;
}

function hasNamedField(row, names) {
  return names.some((name) => fieldSource(row, name));
}

function directRows(scope) {
  return [...(scope?.querySelectorAll?.(':scope > div') || [])];
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute?.('data-aue-resource')
      || scope?.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isEditorContext() {
  return Boolean(document.querySelector('[data-aue-resource]'));
}

function normalizeResourceValue(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(normalizeResourceValue).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return String(value.value || value.text || value.label || value.name || '').trim();
  }
  return String(value).trim();
}

function textFromRow(row, name) {
  if (!row) return '';

  const field = fieldSource(row, name);

  return (field?.textContent || row.textContent || '').trim();
}

function hasFieldSource(row) {
  return Boolean(
    row?.matches?.('[data-aue-prop], [data-richtext-prop]')
      || row?.querySelector?.('[data-aue-prop], [data-richtext-prop]'),
  );
}

function cleanupConfigRows(rows, isEditor) {
  rows.forEach((row) => {
    if (!row) return;

    if (isEditor && hasFieldSource(row)) {
      row.hidden = true;
      return;
    }

    row.remove();
  });
}

function resourcePathFor(scope) {
  return resourcePathFromAueResource(scope?.getAttribute?.('data-aue-resource') || '');
}

async function readResourceFields(scope, names) {
  return readAueResourceFields(resourcePathFor(scope), names);
}

function readConfigFields(names, rows, resourceFields = {}) {
  const hasAnyNamedRows = rows.some(hasFieldSource);

  return names.reduce((fields, name, index) => {
    const namedRow = rows.find((candidate) => fieldSource(candidate, name));
    const row = namedRow || (!hasAnyNamedRows ? rows[index] || null : null);
    const resourceValue = normalizeResourceValue(resourceFields[name]);
    const domValue = textFromRow(row, name);

    fields[name] = {
      row,
      source: fieldSource(row, name),
      value: resourceValue || domValue,
    };

    return fields;
  }, {});
}

function isExplicitRowItem(row) {
  if (!row || row.hidden || row.classList?.contains('colored-grid-field-archive')) return false;
  if (row.matches?.(COLORED_GRID_ROW_SELECTOR)) return true;

  const resource = row.getAttribute?.('data-aue-resource') || '';
  return resource.includes('/colored_grid/colored_grid_row');
}

function getBlockConfigRows(rows) {
  const firstRowIndex = rows.findIndex(isExplicitRowItem);
  const candidateRows = firstRowIndex >= 0 ? rows.slice(0, firstRowIndex) : rows;
  const namedFieldRows = candidateRows.filter((row) => (
    !row.getAttribute?.('data-aue-resource') && hasNamedField(row, BLOCK_FIELD_NAMES)
  ));

  if (namedFieldRows.length) return namedFieldRows;

  if (rows.some((row) => row.getAttribute?.('data-aue-resource'))) {
    return [];
  }

  if (firstRowIndex >= 0) {
    return rows.slice(0, firstRowIndex);
  }

  return rows.slice(0, BLOCK_FIELD_NAMES.length);
}

function isContentItem(row) {
  return Boolean(
    row
      && !row.hidden
      && !row.classList?.contains('colored-grid-field-archive')
      && !isExplicitRowItem(row)
      && (
        row.getAttribute?.('data-aue-resource')
          || row.children.length
          || row.textContent.trim()
      ),
  );
}

function getRowSegments(rows, blockConfigRows) {
  const blockConfigSet = new Set(blockConfigRows);
  const segments = [];
  let currentGroup = null;

  rows.forEach((row) => {
    if (blockConfigSet.has(row)) return;

    if (isExplicitRowItem(row)) {
      currentGroup = { type: 'row', row, items: [] };
      segments.push(currentGroup);
      return;
    }

    if (currentGroup && isContentItem(row)) {
      currentGroup.items.push(row);
      return;
    }

    if (isContentItem(row)) {
      segments.push({ type: 'item', item: row });
    }
  });

  return segments;
}

function isAueContentComponent(row) {
  return Boolean(
    row?.getAttribute?.('data-aue-resource')
      && !isExplicitRowItem(row),
  );
}

function getRowConfigRows(row) {
  const rows = directRows(row);
  const firstContentIndex = rows.findIndex((child, index) => (
    index >= ROW_FIELD_NAMES.length || isAueContentComponent(child)
  ));
  const rowFieldCount = firstContentIndex >= 0
    ? firstContentIndex
    : Math.min(rows.length, ROW_FIELD_NAMES.length);

  return rows.slice(0, rowFieldCount);
}

function getNestedRowItems(row, configRows) {
  const configSet = new Set(configRows);

  return directRows(row).filter((child) => !configSet.has(child) && isContentItem(child));
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : normalized;
}

function normalizeCssValue(value, propertyName) {
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

function normalizeColumns(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(Math.max(parsed, 1), 6);
}

function setCssVar(element, name, value) {
  if (value) {
    element.style.setProperty(name, value);
    return;
  }

  element.style.removeProperty(name);
}

function setPrefixedClass(element, prefix, value) {
  [...element.classList]
    .filter((className) => className.startsWith(prefix))
    .forEach((className) => element.classList.remove(className));

  if (value) element.classList.add(`${prefix}${value}`);
}

function setBlockBackground(block, value) {
  const backgroundColor = normalizeColorValue(value);
  block.classList.toggle('has-colored-grid-background', Boolean(backgroundColor));
  setCssVar(block, '--colored-grid-bg', backgroundColor);
}

function setRowBackground(row, value) {
  const backgroundColor = normalizeColorValue(value);
  row.classList.toggle('has-colored-grid-row-background', Boolean(backgroundColor));
  setCssVar(row, '--colored-grid-row-bg', backgroundColor);
}

function watchField(source, callback) {
  if (!source) return;

  new MutationObserver(() => callback(source.textContent?.trim() || ''))
    .observe(source, { childList: true, characterData: true, subtree: true });
}

function applyBlockStyles(block, fields, isEditor) {
  const verticalAlign = normalizeOption(
    fields.verticalAlign.value,
    ['top', 'middle', 'bottom'],
    'top',
  );

  setPrefixedClass(block, 'colored-grid-v-', verticalAlign);
  setBlockBackground(block, fields.backgroundColor.value);
  setCssVar(block, '--colored-grid-text', normalizeColorValue(fields.textColor.value));
  setCssVar(block, '--colored-grid-padding', normalizeCssValue(fields.padding.value, 'padding'));
  setCssVar(block, '--colored-grid-rows-gap', normalizeCssValue(fields.rowGap.value, 'gap'));
  setCssVar(block, '--colored-grid-radius', normalizeCssValue(fields.borderRadius.value, 'border-radius'));
  setCssVar(block, '--colored-grid-max-width', normalizeCssValue(fields.maxWidth.value, 'max-width'));
  setCssVar(block, '--colored-grid-min-height', normalizeCssValue(fields.minHeight.value, 'min-height'));

  if (!isEditor) return;

  watchField(fields.backgroundColor.source, (value) => setBlockBackground(block, value));
  watchField(fields.textColor.source, (value) => setCssVar(block, '--colored-grid-text', normalizeColorValue(value)));
  watchField(fields.padding.source, (value) => setCssVar(block, '--colored-grid-padding', normalizeCssValue(value, 'padding')));
  watchField(fields.rowGap.source, (value) => setCssVar(block, '--colored-grid-rows-gap', normalizeCssValue(value, 'gap')));
  watchField(fields.borderRadius.source, (value) => setCssVar(block, '--colored-grid-radius', normalizeCssValue(value, 'border-radius')));
  watchField(fields.maxWidth.source, (value) => setCssVar(block, '--colored-grid-max-width', normalizeCssValue(value, 'max-width')));
  watchField(fields.minHeight.source, (value) => setCssVar(block, '--colored-grid-min-height', normalizeCssValue(value, 'min-height')));
  watchField(fields.verticalAlign.source, (value) => setPrefixedClass(
    block,
    'colored-grid-v-',
    normalizeOption(value, ['top', 'middle', 'bottom'], 'top'),
  ));
}

function applyRowStyles(row, fields, isEditor) {
  const horizontalAlign = normalizeOption(
    fields.horizontalAlign.value,
    ['stretch', 'left', 'center', 'right'],
    'stretch',
  );
  const verticalAlign = normalizeOption(
    fields.verticalAlign.value,
    ['stretch', 'top', 'middle', 'bottom'],
    'stretch',
  );

  row.classList.add('colored-grid-row');
  setPrefixedClass(row, 'colored-grid-row-h-', horizontalAlign);
  setPrefixedClass(row, 'colored-grid-row-v-', verticalAlign);
  row.style.setProperty('--colored-grid-row-columns', normalizeColumns(fields.columns.value));
  setRowBackground(row, fields.backgroundColor.value);
  setCssVar(row, '--colored-grid-row-text', normalizeColorValue(fields.textColor.value));
  setCssVar(row, '--colored-grid-row-padding', normalizeCssValue(fields.padding.value, 'padding'));
  setCssVar(row, '--colored-grid-row-gap', normalizeCssValue(fields.gap.value, 'gap'));
  setCssVar(row, '--colored-grid-row-radius', normalizeCssValue(fields.borderRadius.value, 'border-radius'));
  setCssVar(row, '--colored-grid-row-min-height', normalizeCssValue(fields.minHeight.value, 'min-height'));

  if (!isEditor) return;

  watchField(fields.columns.source, (value) => row.style.setProperty('--colored-grid-row-columns', normalizeColumns(value)));
  watchField(fields.backgroundColor.source, (value) => setRowBackground(row, value));
  watchField(fields.textColor.source, (value) => setCssVar(row, '--colored-grid-row-text', normalizeColorValue(value)));
  watchField(fields.padding.source, (value) => setCssVar(row, '--colored-grid-row-padding', normalizeCssValue(value, 'padding')));
  watchField(fields.gap.source, (value) => setCssVar(row, '--colored-grid-row-gap', normalizeCssValue(value, 'gap')));
  watchField(fields.borderRadius.source, (value) => setCssVar(row, '--colored-grid-row-radius', normalizeCssValue(value, 'border-radius')));
  watchField(fields.minHeight.source, (value) => setCssVar(row, '--colored-grid-row-min-height', normalizeCssValue(value, 'min-height')));
  watchField(fields.horizontalAlign.source, (value) => setPrefixedClass(
    row,
    'colored-grid-row-h-',
    normalizeOption(value, ['stretch', 'left', 'center', 'right'], 'stretch'),
  ));
  watchField(fields.verticalAlign.source, (value) => setPrefixedClass(
    row,
    'colored-grid-row-v-',
    normalizeOption(value, ['stretch', 'top', 'middle', 'bottom'], 'stretch'),
  ));
}

function resetRowMarkerRuntime(row) {
  row.classList.remove('colored-grid-row', 'has-colored-grid-row-background');
  ROW_RUNTIME_CLASS_PREFIXES.forEach((prefix) => {
    [...row.classList]
      .filter((className) => className.startsWith(prefix))
      .forEach((className) => row.classList.remove(className));
  });
  ROW_RUNTIME_STYLE_PROPS.forEach((property) => row.style.removeProperty(property));
}

function preserveRowMarker(row, isEditor) {
  resetRowMarkerRuntime(row);
  if (!isEditor || !hasAuthoringContext(row)) return;

  row.setAttribute('data-aue-type', 'component');
  row.setAttribute('data-aue-behavior', 'component');
  row.removeAttribute('data-aue-filter');
  if (!row.getAttribute('data-aue-label')) row.setAttribute('data-aue-label', 'Colored Grid Row');
  row.classList.add('colored-grid-row-marker');
}

function removeGeneratedPlaceholders(scope) {
  scope.querySelectorAll(':scope > .colored-grid-row-empty, :scope > .colored-grid-empty')
    .forEach((placeholder) => placeholder.remove());
}

function hasVisibleContent(row) {
  return [...row.children].some((child) => (
    !child.hidden
      && child.style.display !== 'none'
      && !child.classList.contains('colored-grid-row-empty')
      && !child.classList.contains('colored-grid-field-archive')
  ));
}

function archiveHiddenFieldRows(block, inner, isEditor) {
  if (!isEditor) return;

  const archive = document.createElement('span');
  archive.className = 'colored-grid-field-archive';
  archive.hidden = true;

  [...block.querySelectorAll(':scope > div[hidden]')]
    .forEach((row) => archive.append(row));

  if (archive.children.length) inner.append(archive);
}

function appendEmptyRowPlaceholder(row) {
  const placeholder = document.createElement('div');
  placeholder.className = 'colored-grid-row-empty';
  placeholder.textContent = 'Add content blocks to this row.';
  row.append(placeholder);
}

async function decorateRow(row, items, isEditor) {
  removeGeneratedPlaceholders(row);
  preserveRowMarker(row, isEditor);

  const configRows = getRowConfigRows(row);
  const nestedItems = getNestedRowItems(row, configRows);
  const resourceFields = await readResourceFields(row, ROW_FIELD_NAMES);
  const fields = readConfigFields(ROW_FIELD_NAMES, configRows, resourceFields);
  const layout = document.createElement('div');
  const shell = document.createElement('div');

  shell.className = 'colored-grid-row-shell';
  applyRowStyles(layout, fields, isEditor);
  cleanupConfigRows(configRows, isEditor);
  nestedItems.forEach((item) => layout.append(item));
  items.forEach((item) => layout.append(item));

  const isAuthoringRow = isEditor && hasAuthoringContext(row);
  const hasRowContent = hasVisibleContent(layout);

  if (!hasRowContent && isAuthoringRow) {
    appendEmptyRowPlaceholder(layout);
  }

  if (!hasRowContent && !isAuthoringRow) return null;

  if (isAuthoringRow) shell.append(row);
  shell.append(layout);

  return shell;
}

export default async function decorate(block) {
  const isEditor = isEditorContext();
  const rows = directRows(block);
  const blockConfigRows = getBlockConfigRows(rows);
  const rowSegments = getRowSegments(rows, blockConfigRows);
  const hasRowMarkers = rowSegments.some((segment) => segment.type === 'row');
  const blockResourceFields = await readResourceFields(block, BLOCK_FIELD_NAMES);
  const blockFields = readConfigFields(BLOCK_FIELD_NAMES, blockConfigRows, blockResourceFields);

  removeGeneratedPlaceholders(block);
  applyBlockStyles(block, blockFields, isEditor);
  cleanupConfigRows(blockConfigRows, isEditor);

  const inner = document.createElement('div');
  inner.className = 'colored-grid-inner';

  const renderedSegments = await Promise.all(rowSegments.map(async (segment) => {
    if (segment.type === 'row') return decorateRow(segment.row, segment.items, isEditor);
    return segment.item;
  }));

  renderedSegments
    .filter(Boolean)
    .forEach((element) => inner.append(element));

  archiveHiddenFieldRows(block, inner, isEditor);

  if (!hasRowMarkers && hasAuthoringContext(block)) {
    const placeholder = document.createElement('div');
    placeholder.className = 'colored-grid-empty';
    placeholder.textContent = 'Add a Colored Grid Row before adding content blocks.';
    inner.prepend(placeholder);
  }

  block.replaceChildren(inner);
}
