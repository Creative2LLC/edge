import {
  decorateButtons,
  loadBlock,
  wrapTextNodes,
} from '../../scripts/aem.js';
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

const ROW_ITEM_STYLE_PROPS = [
  '--colored-grid-item-column-span',
  ...ROW_RUNTIME_STYLE_PROPS,
];

const LOADABLE_CONTENT_BLOCKS = new Set([
  'cards',
  'colored-button',
  'colored-heading',
  'colored-list',
  'colored-text',
  'columns',
  'image',
  'impact-donut',
  'info-cards-grid',
  'statistics',
]);

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

function normalizeBlockName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-\d{4,}$/u, '')
    .replace(/^-|-$/g, '');
}

function getResourceBlockName(element) {
  const resource = element?.getAttribute?.('data-aue-resource') || '';
  const segments = resource.split('/').filter(Boolean);
  return normalizeBlockName(segments[segments.length - 1] || '');
}

function getContentBlockName(element) {
  return normalizeBlockName(
    element?.getAttribute?.('data-aue-model')
      || element?.dataset?.blockName
      || getResourceBlockName(element),
  );
}

function cleanupNestedAuthoringChrome(element) {
  if (!isEditorContext()) return;
  element.querySelectorAll(':scope > .color-picker-bar')
    .forEach((bar) => bar.remove());
}

function hasRenderableContent(element) {
  return [...element.children].some((child) => {
    if (
      child.hidden
        || child.classList.contains('color-picker-bar')
        || child.classList.contains('colored-grid-child-empty')
        || child.classList.contains('colored-grid-field-archive')
    ) return false;

    if (child.querySelector('img, picture, svg, video, canvas, iframe, a, button, li')) {
      return true;
    }

    return Boolean(child.textContent.trim());
  });
}

function getPlaceholderTarget(element) {
  return element.querySelector(
    [
      ':scope > .statistics-inner',
      ':scope > .colored-heading-inner',
      ':scope > .colored-text-inner',
      ':scope > .colored-list-inner',
      ':scope > .colored-button-inner',
    ].join(', '),
  ) || element;
}

function ensureNestedBlockPlaceholder(element) {
  if (!isEditorContext() || hasRenderableContent(element)) return;

  const target = getPlaceholderTarget(element);
  if (hasRenderableContent(target)) return;

  const placeholder = document.createElement('div');
  placeholder.className = 'colored-grid-child-empty';
  placeholder.textContent = `Add ${element.getAttribute('data-aue-label') || 'content'} in the editor.`;
  target.append(placeholder);
}

async function loadContentBlock(element) {
  const blockName = getContentBlockName(element);
  if (!LOADABLE_CONTENT_BLOCKS.has(blockName)) return;

  if (!element.dataset.blockStatus) {
    element.classList.add(blockName, 'block');
    element.dataset.blockName = blockName;
    element.dataset.blockStatus = 'initialized';
    element.classList.add('no-scroll-reveal');
    wrapTextNodes(element);
    decorateButtons(element);
  }

  await loadBlock(element);
  element.classList.add('is-visible');
  cleanupNestedAuthoringChrome(element);
  ensureNestedBlockPlaceholder(element);
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

function hasAueResource(row) {
  return Boolean(row?.getAttribute?.('data-aue-resource'));
}

function isNonResourceConfigRow(row) {
  return Boolean(row && !hasAueResource(row) && !isExplicitRowItem(row));
}

function getBlockConfigRows(rows) {
  const firstRowIndex = rows.findIndex(isExplicitRowItem);

  if (firstRowIndex > 0) {
    const leadingRows = rows.slice(0, firstRowIndex);
    if (leadingRows.every(isNonResourceConfigRow)) {
      return leadingRows.slice(0, BLOCK_FIELD_NAMES.length);
    }
  }

  const candidateRows = firstRowIndex >= 0 ? rows.slice(0, firstRowIndex) : rows;
  const namedFieldRows = candidateRows.filter((row) => (
    !hasAueResource(row) && hasNamedField(row, BLOCK_FIELD_NAMES)
  ));

  if (namedFieldRows.length) return namedFieldRows;

  const firstResourceIndex = rows.findIndex(hasAueResource);
  if (firstResourceIndex > 0) {
    const leadingRows = rows.slice(0, Math.min(firstResourceIndex, BLOCK_FIELD_NAMES.length));
    if (leadingRows.every(isNonResourceConfigRow)) return leadingRows;
  }

  if (firstResourceIndex >= 0) {
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

function resetRowItemRuntime(item) {
  item.classList.remove('colored-grid-row-item', 'colored-grid-row-start', 'has-colored-grid-row-background');
  ROW_RUNTIME_CLASS_PREFIXES.forEach((prefix) => {
    [...item.classList]
      .filter((className) => className.startsWith(prefix))
      .forEach((className) => item.classList.remove(className));
  });
  ROW_ITEM_STYLE_PROPS.forEach((property) => item.style.removeProperty(property));
}

function applyRowItemStyles(item, fields, isEditor, isFirstItem) {
  const columns = normalizeColumns(fields.columns.value);
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

  resetRowItemRuntime(item);
  item.classList.add('colored-grid-row-item');
  item.classList.toggle('colored-grid-row-start', isFirstItem);
  setPrefixedClass(item, 'colored-grid-row-h-', horizontalAlign);
  setPrefixedClass(item, 'colored-grid-row-v-', verticalAlign);
  item.style.setProperty('--colored-grid-item-column-span', 60 / columns);
  item.style.setProperty('--colored-grid-row-columns', columns);
  setRowBackground(item, fields.backgroundColor.value);
  setCssVar(item, '--colored-grid-row-text', normalizeColorValue(fields.textColor.value));
  setCssVar(item, '--colored-grid-row-padding', normalizeCssValue(fields.padding.value, 'padding'));
  setCssVar(item, '--colored-grid-row-gap', normalizeCssValue(fields.gap.value, 'gap'));
  setCssVar(item, '--colored-grid-row-radius', normalizeCssValue(fields.borderRadius.value, 'border-radius'));
  setCssVar(item, '--colored-grid-row-min-height', normalizeCssValue(fields.minHeight.value, 'min-height'));

  if (!isEditor) return;

  watchField(fields.columns.source, (value) => {
    const nextColumns = normalizeColumns(value);
    item.style.setProperty('--colored-grid-item-column-span', 60 / nextColumns);
    item.style.setProperty('--colored-grid-row-columns', nextColumns);
  });
  watchField(fields.backgroundColor.source, (value) => setRowBackground(item, value));
  watchField(fields.textColor.source, (value) => setCssVar(item, '--colored-grid-row-text', normalizeColorValue(value)));
  watchField(fields.padding.source, (value) => setCssVar(item, '--colored-grid-row-padding', normalizeCssValue(value, 'padding')));
  watchField(fields.gap.source, (value) => setCssVar(item, '--colored-grid-row-gap', normalizeCssValue(value, 'gap')));
  watchField(fields.borderRadius.source, (value) => setCssVar(item, '--colored-grid-row-radius', normalizeCssValue(value, 'border-radius')));
  watchField(fields.minHeight.source, (value) => setCssVar(item, '--colored-grid-row-min-height', normalizeCssValue(value, 'min-height')));
  watchField(fields.horizontalAlign.source, (value) => setPrefixedClass(
    item,
    'colored-grid-row-h-',
    normalizeOption(value, ['stretch', 'left', 'center', 'right'], 'stretch'),
  ));
  watchField(fields.verticalAlign.source, (value) => setPrefixedClass(
    item,
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

function cleanupRowMarkerFields(row) {
  directRows(row).forEach((child) => {
    if (hasAueResource(child)) return;
    if (hasFieldSource(child)) {
      child.hidden = true;
      return;
    }

    child.remove();
  });
}

function removeGeneratedPlaceholders(scope) {
  scope.querySelectorAll(':scope > .colored-grid-row-empty, :scope > .colored-grid-empty')
    .forEach((placeholder) => placeholder.remove());
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

function createEmptyRowPlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'colored-grid-row-empty';
  placeholder.textContent = 'Add content blocks to this row.';
  return placeholder;
}

async function decorateRow(row, items, isEditor) {
  removeGeneratedPlaceholders(row);
  preserveRowMarker(row, isEditor);

  const configRows = getRowConfigRows(row);
  const nestedItems = getNestedRowItems(row, configRows);
  const resourceFields = await readResourceFields(row, ROW_FIELD_NAMES);
  const fields = readConfigFields(ROW_FIELD_NAMES, configRows, resourceFields);
  const rowItems = [...nestedItems, ...items];
  const rendered = [];

  cleanupConfigRows(configRows, isEditor);
  cleanupRowMarkerFields(row);

  const isAuthoringRow = isEditor && hasAuthoringContext(row);

  if (isAuthoringRow) rendered.push(row);

  if (!rowItems.length && isAuthoringRow) {
    rowItems.push(createEmptyRowPlaceholder());
  }

  if (!rowItems.length) return rendered;

  const loadedItems = await Promise.all(rowItems.map(async (item, index) => {
    applyRowItemStyles(item, fields, isEditor, index === 0);
    await loadContentBlock(item);
    return item;
  }));
  rendered.push(...loadedItems);

  return rendered;
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
    resetRowItemRuntime(segment.item);
    await loadContentBlock(segment.item);
    return segment.item;
  }));

  renderedSegments
    .flat()
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
