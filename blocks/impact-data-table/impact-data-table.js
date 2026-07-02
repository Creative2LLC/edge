import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import {
  deriveColumns,
  fetchImpactDataset,
  hasAuthoringContext,
  normalizeApiBaseUrl,
  normalizeRows,
  parseColumns,
  parseKeyValueLines,
  parseNumber,
  rowDisplayValue,
  rowNumericValue,
} from '../../scripts/impact-data-utils.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  intro: 1,
  apiBaseUrl: 2,
  year: 3,
  datasetSlug: 4,
  apiEndpoint: 5,
  columns: 6,
  tableStyle: 7,
  emptyMessage: 8,
  disclaimer: 9,
};

const ITEM_COLUMN_INDEX = {
  label: 0,
  value: 1,
  values: 2,
  description: 3,
  color: 4,
};

const DEFAULTS = {
  emptyMessage: 'No impact data is available.',
};

function isItemRow(row) {
  return Boolean(
    row.getAttribute('data-aue-model') === 'impact-data-table-row'
      || row.querySelector([
        '[data-aue-prop="label"]',
        '[data-aue-prop="value"]',
        '[data-aue-prop="values"]',
        '[data-aue-prop="description"]',
        '[data-aue-prop="color"]',
      ].join(', '))
      || (!hasAuthoringContext(row) && row.children.length >= 5),
  );
}

function parentRows(block) {
  return [...block.querySelectorAll(':scope > div')].filter((row) => !isItemRow(row));
}

function fallbackCell(block, rowIndex) {
  const row = parentRows(block)[rowIndex];
  return row?.children?.[0] || row || null;
}

function readText(block, name, rowIndex, labels = []) {
  const field = readTextField(block, name, {
    rowIndex,
    labels,
    fallbackCell: fallbackCell(block, rowIndex),
  });

  return {
    source: field.source || field.cell,
    value: field.value,
  };
}

function readRich(block, name, rowIndex, labels = []) {
  const field = readRichTextField(block, name, {
    rowIndex,
    labels,
    fallbackCell: fallbackCell(block, rowIndex),
  });

  return {
    source: field.source || field.cell,
    html: field.html,
    text: field.text,
  };
}

function readItemText(row, name, columnIndex) {
  const field = readTextField(row, name, {
    columnIndex,
    fallbackCell: row.children[columnIndex],
  });

  return {
    source: field.source || field.cell,
    value: field.value,
  };
}

function moveText(field, target, fallbackValue = '') {
  if (field?.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
  }

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function moveRich(field, target, fallbackValue = '') {
  if (field?.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
  } else if (field?.html) {
    target.innerHTML = field.html;
  }

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function authoredRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter(isItemRow)
    .map((row, index) => {
      const labelField = readItemText(row, 'label', ITEM_COLUMN_INDEX.label);
      const valueField = readItemText(row, 'value', ITEM_COLUMN_INDEX.value);
      const valuesField = readItemText(row, 'values', ITEM_COLUMN_INDEX.values);
      const descriptionField = readItemText(row, 'description', ITEM_COLUMN_INDEX.description);
      const colorField = readItemText(row, 'color', ITEM_COLUMN_INDEX.color);
      const hasContent = Boolean(
        labelField.value
          || valueField.value
          || valuesField.value
          || descriptionField.value
          || colorField.value,
      );
      const isPlaceholder = hasAuthoringContext(row) && !hasContent;

      if (!hasContent && !isPlaceholder) return null;

      const normalized = normalizeRows([{
        label: labelField.value || (isPlaceholder ? 'New impact row' : ''),
        value: parseNumber(valueField.value),
        display_value: valueField.value,
        values: parseKeyValueLines(valuesField.value),
        description: descriptionField.value,
        color: colorField.value,
        sort_order: index,
      }])[0];

      if (!normalized) return null;

      return {
        ...normalized,
        row,
        isAuthoringPlaceholder: isPlaceholder,
      };
    })
    .filter(Boolean);
}

function tableStyleClass(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return ['default', 'compact', 'inverted'].includes(normalized) ? normalized : 'default';
}

function columnIsNumeric(column, rows) {
  if (column.align === 'right' || column.type === 'number') return true;
  if (column.key === 'value') return true;

  return rows.some((row) => Number.isFinite(rowNumericValue(row, column.key)));
}

function buildHeader(headingField, introField, dataset) {
  const header = document.createElement('div');
  header.className = 'impact-data-table-header';

  const headingText = headingField.value || dataset.title || '';
  if (headingText || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'impact-data-table-heading';
    moveText(headingField, heading, headingText);
    header.append(heading);
  }

  const introText = introField.text || dataset.description || '';
  if (introText || introField.html || introField.source) {
    const intro = document.createElement('div');
    intro.className = 'impact-data-table-intro';
    moveRich(introField, intro, introText);
    header.append(intro);
  }

  return header;
}

function buildEmpty(message, isAuthoring) {
  const empty = document.createElement('div');
  empty.className = 'impact-data-table-empty';
  empty.textContent = message || (isAuthoring
    ? 'Add impact table rows in Universal Editor or connect an API endpoint.'
    : DEFAULTS.emptyMessage);
  return empty;
}

function buildDisclaimer(field) {
  if (!field.text && !field.html && !field.source) return null;

  const disclaimer = document.createElement('div');
  disclaimer.className = 'impact-data-table-disclaimer';
  moveRich(field, disclaimer);

  return disclaimer.childNodes.length ? disclaimer : null;
}

function buildCell(row, column, isNumeric) {
  const cell = document.createElement('td');
  const value = rowDisplayValue(row, column.key);

  cell.className = isNumeric ? 'is-numeric' : '';
  cell.dataset.label = column.label;
  cell.textContent = value;

  return cell;
}

function buildTable(dataset, columns, rows) {
  const wrap = document.createElement('div');
  wrap.className = 'impact-data-table-table-wrap';

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const numericColumns = new Map(columns.map((column) => [
    column.key,
    columnIsNumeric(column, rows),
  ]));

  columns.forEach((column) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = column.label;
    if (numericColumns.get(column.key)) th.className = 'is-numeric';
    headerRow.append(th);
  });
  thead.append(headerRow);

  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.row) moveInstrumentation(row.row, tr);
    setItemLabel(tr, [row.label, row.description]);
    if (row.isAuthoringPlaceholder) tr.classList.add('is-authoring-placeholder');

    columns.forEach((column) => {
      tr.append(buildCell(row, column, numericColumns.get(column.key)));
    });

    tbody.append(tr);
  });

  table.append(thead, tbody);

  const captionText = dataset.metadata?.caption || dataset.metadata?.source_note || '';
  if (captionText) {
    const caption = document.createElement('caption');
    caption.textContent = captionText;
    table.append(caption);
  }

  wrap.append(table);
  return wrap;
}

async function resolveDataset(config, authoredDataset) {
  const hasApiConfig = Boolean(config.apiEndpoint || config.apiBaseUrl);
  if (!hasApiConfig) return authoredDataset;

  const apiDataset = await fetchImpactDataset(config, 'impact-data-table');
  return apiDataset?.dataset?.rows?.length ? apiDataset : authoredDataset;
}

export default async function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const headingField = readText(block, 'heading', BLOCK_ROW_INDEX.heading, ['heading', 'title']);
  const introField = readRich(block, 'intro', BLOCK_ROW_INDEX.intro, ['intro', 'description']);
  const apiBaseUrlField = readText(block, 'apiBaseUrl', BLOCK_ROW_INDEX.apiBaseUrl, ['api base url', 'backend url']);
  const yearField = readText(block, 'year', BLOCK_ROW_INDEX.year, ['year']);
  const datasetSlugField = readText(block, 'datasetSlug', BLOCK_ROW_INDEX.datasetSlug, ['dataset slug']);
  const apiEndpointField = readText(block, 'apiEndpoint', BLOCK_ROW_INDEX.apiEndpoint, ['api endpoint']);
  const columnsField = readText(block, 'columns', BLOCK_ROW_INDEX.columns, ['columns']);
  const tableStyleField = readText(block, 'tableStyle', BLOCK_ROW_INDEX.tableStyle, ['table style']);
  const emptyMessageField = readText(block, 'emptyMessage', BLOCK_ROW_INDEX.emptyMessage, ['empty message']);
  const disclaimerField = readRich(block, 'disclaimer', BLOCK_ROW_INDEX.disclaimer, ['disclaimer']);
  const configuredColumns = parseColumns(columnsField.value);
  const rows = authoredRows(block);
  const authoredDataset = {
    dataset: {
      title: headingField.value,
      description: introField.text,
      columns: configuredColumns,
      rows,
      metadata: {},
    },
  };
  const resolved = await resolveDataset({
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrlField.value),
    year: yearField.value,
    datasetSlug: datasetSlugField.value,
    apiEndpoint: apiEndpointField.value,
  }, authoredDataset);
  const dataset = resolved?.dataset || authoredDataset?.dataset || {
    title: headingField.value,
    description: introField.text,
    columns: configuredColumns,
    rows,
    metadata: {},
  };
  const displayRows = dataset.rows || rows;
  let columns = dataset.columns?.length ? dataset.columns : configuredColumns;
  if (!columns.length) columns = deriveColumns(displayRows);

  block.classList.add(`impact-data-table-style-${tableStyleClass(tableStyleField.value)}`);

  const inner = document.createElement('div');
  inner.className = 'impact-data-table-inner';
  const header = buildHeader(headingField, introField, dataset);
  if (header.childElementCount) inner.append(header);

  if (!displayRows.length) {
    inner.append(buildEmpty(emptyMessageField.value, isAuthoring));
    const disclaimer = buildDisclaimer(disclaimerField);
    if (disclaimer) inner.append(disclaimer);
    block.replaceChildren(inner);
    return;
  }

  inner.append(buildTable(dataset, columns, displayRows));
  const disclaimer = buildDisclaimer(disclaimerField);
  if (disclaimer) inner.append(disclaimer);
  block.replaceChildren(inner);
}
