import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import {
  fetchImpactDataset,
  formatNumber,
  hasAuthoringContext,
  normalizeApiBaseUrl,
  normalizeColor,
  normalizeRows,
  normalizeText,
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
  valueKey: 6,
  metricKeys: 7,
  chartStyle: 8,
  showValues: 9,
  showTable: 10,
  emptyMessage: 11,
  textMode: 12,
};

const ITEM_COLUMN_INDEX = {
  label: 0,
  value: 1,
  values: 2,
  description: 3,
  color: 4,
};

const DEFAULTS = {
  emptyMessage: 'No impact chart data is available.',
};

function isItemRow(row) {
  return Boolean(
    row.getAttribute('data-aue-model') === 'impact-bar-chart-row'
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
        label: labelField.value || (isPlaceholder ? 'New chart row' : ''),
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

function parseMetricKeys(value) {
  return normalizeText(value)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.includes('|') ? line.split('|') : line.split(',');
      const label = normalizeText(parts[0]);
      const key = normalizeText(parts[1])
        || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      if (!label || !key) return null;

      return {
        key,
        label,
        color: normalizeColor(parts[2], index),
      };
    })
    .filter(Boolean);
}

function chartStyleClass(value) {
  return normalizeText(value).toLowerCase() === 'skinny' ? 'skinny' : 'standard';
}

function textModeClass(value) {
  return normalizeText(value).toLowerCase() === 'light' ? 'light' : 'dark';
}

function booleanSelect(value, defaultValue) {
  const normalized = normalizeText(value).toLowerCase();
  if (['show', 'true', 'yes', '1'].includes(normalized)) return true;
  if (['hide', 'false', 'no', '0'].includes(normalized)) return false;
  return defaultValue;
}

function rowTotal(row, valueKey, metrics) {
  if (metrics.length) {
    const total = metrics.reduce((sum, metric) => {
      const value = rowNumericValue(row, metric.key);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    if (total > 0) return total;
  }

  return rowNumericValue(row, valueKey) ?? 0;
}

function buildHeader(headingField, introField, dataset) {
  const header = document.createElement('div');
  header.className = 'impact-bar-chart-header';

  const headingText = headingField.value || dataset.title || '';
  if (headingText || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'impact-bar-chart-heading';
    moveText(headingField, heading, headingText);
    header.append(heading);
  }

  const introText = introField.text || dataset.description || '';
  if (introText || introField.html || introField.source) {
    const intro = document.createElement('div');
    intro.className = 'impact-bar-chart-intro';
    moveRich(introField, intro, introText);
    header.append(intro);
  }

  return header;
}

function buildEmpty(message, isAuthoring) {
  const empty = document.createElement('div');
  empty.className = 'impact-bar-chart-empty';
  empty.textContent = message || (isAuthoring
    ? 'Add impact chart rows in Universal Editor or connect an API endpoint.'
    : DEFAULTS.emptyMessage);
  return empty;
}

function buildLegend(metrics) {
  if (metrics.length < 2) return null;

  const legend = document.createElement('ul');
  legend.className = 'impact-bar-chart-legend';

  metrics.forEach((metric) => {
    const item = document.createElement('li');
    const marker = document.createElement('span');
    const label = document.createElement('span');

    marker.className = 'impact-bar-chart-legend-marker';
    marker.style.setProperty('--impact-bar-chart-segment-color', metric.color);
    label.textContent = metric.label;

    item.append(marker, label);
    legend.append(item);
  });

  return legend;
}

function buildSingleBar(row, maxValue, valueKey, rowIndex) {
  const numeric = rowNumericValue(row, valueKey) ?? 0;
  const width = maxValue > 0 ? Math.max((numeric / maxValue) * 100, numeric > 0 ? 2 : 0) : 0;
  const fill = document.createElement('span');

  fill.className = 'impact-bar-chart-fill';
  fill.style.setProperty('--impact-bar-chart-bar-width', `${width}%`);
  fill.style.setProperty('--impact-bar-chart-color', normalizeColor(row.color, rowIndex));

  return fill;
}

function buildStackedBar(row, maxValue, metrics) {
  const bar = document.createElement('span');
  const total = rowTotal(row, 'value', metrics);
  const outerWidth = maxValue > 0 ? Math.max((total / maxValue) * 100, total > 0 ? 2 : 0) : 0;

  bar.className = 'impact-bar-chart-stack';
  bar.style.setProperty('--impact-bar-chart-bar-width', `${outerWidth}%`);

  metrics.forEach((metric) => {
    const value = rowNumericValue(row, metric.key) ?? 0;
    const segmentWidth = total > 0 ? (value / total) * 100 : 0;
    const segment = document.createElement('span');

    segment.className = 'impact-bar-chart-segment';
    segment.style.setProperty('--impact-bar-chart-segment-width', `${segmentWidth}%`);
    segment.style.setProperty('--impact-bar-chart-segment-color', metric.color);
    segment.title = `${metric.label}: ${formatNumber(value)}`;
    bar.append(segment);
  });

  return bar;
}

function buildChart(rows, config) {
  const list = document.createElement('div');
  const values = rows.map((row) => rowTotal(row, config.valueKey, config.metrics));
  const maxValue = Math.max(...values, 0);

  list.className = 'impact-bar-chart-list';

  rows.forEach((row, index) => {
    const item = document.createElement('div');
    const label = document.createElement('div');
    const track = document.createElement('div');
    const value = document.createElement('div');
    const { description } = row;

    item.className = 'impact-bar-chart-row';
    item.style.setProperty('--row-index', index);
    if (row.row) moveInstrumentation(row.row, item);
    setItemLabel(item, [row.label, row.description]);
    if (row.isAuthoringPlaceholder) item.classList.add('is-authoring-placeholder');

    label.className = 'impact-bar-chart-label';
    label.textContent = row.label;

    track.className = 'impact-bar-chart-track';
    track.append(config.metrics.length
      ? buildStackedBar(row, maxValue, config.metrics)
      : buildSingleBar(row, maxValue, config.valueKey, index));

    value.className = 'impact-bar-chart-value';
    value.textContent = config.metrics.length
      ? formatNumber(rowTotal(row, config.valueKey, config.metrics))
      : rowDisplayValue(row, config.valueKey);
    value.hidden = !config.showValues;

    item.append(label, track, value);

    if (description) {
      const body = document.createElement('p');
      body.className = 'impact-bar-chart-description';
      body.textContent = description;
      item.append(body);
    }

    list.append(item);
  });

  return list;
}

function buildTable(rows, config) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const headerRow = document.createElement('tr');
  const headers = [
    { key: 'label', label: 'Category' },
    ...(config.metrics.length ? config.metrics : [{ key: config.valueKey, label: 'Value' }]),
  ];

  table.className = 'impact-bar-chart-table';

  headers.forEach((header) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = header.label;
    if (header.key !== 'label') th.className = 'is-numeric';
    headerRow.append(th);
  });

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    headers.forEach((header) => {
      const td = document.createElement('td');
      td.dataset.label = header.label;
      td.textContent = header.key === 'label'
        ? row.label
        : rowDisplayValue(row, header.key);
      if (header.key !== 'label') td.className = 'is-numeric';
      tr.append(td);
    });
    tbody.append(tr);
  });

  thead.append(headerRow);
  table.append(thead, tbody);
  return table;
}

function observeChart(block) {
  if (!('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      block.classList.add('is-visible');
      observer.unobserve(block);
    });
  }, { threshold: 0.18 });

  observer.observe(block);
}

async function resolveDataset(config, authoredDataset) {
  const hasApiConfig = Boolean(config.apiEndpoint || config.apiBaseUrl);
  if (!hasApiConfig) return authoredDataset;

  const apiDataset = await fetchImpactDataset(config, 'impact-bar-chart');
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
  const valueKeyField = readText(block, 'valueKey', BLOCK_ROW_INDEX.valueKey, ['value key']);
  const metricKeysField = readText(block, 'metricKeys', BLOCK_ROW_INDEX.metricKeys, ['metric keys', 'metrics']);
  const chartStyleField = readText(block, 'chartStyle', BLOCK_ROW_INDEX.chartStyle, ['chart style']);
  const showValuesField = readText(block, 'showValues', BLOCK_ROW_INDEX.showValues, ['show values']);
  const showTableField = readText(block, 'showTable', BLOCK_ROW_INDEX.showTable, ['show table']);
  const emptyMessageField = readText(block, 'emptyMessage', BLOCK_ROW_INDEX.emptyMessage, ['empty message']);
  const textModeField = readText(block, 'textMode', BLOCK_ROW_INDEX.textMode, ['text mode']);
  const rows = authoredRows(block);
  const authoredDataset = {
    dataset: {
      title: headingField.value,
      description: introField.text,
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
  const dataset = resolved?.dataset || authoredDataset.dataset;
  const displayRows = dataset.rows || rows;
  const metrics = parseMetricKeys(metricKeysField.value);
  const config = {
    valueKey: normalizeText(valueKeyField.value) || 'value',
    metrics,
    showValues: booleanSelect(showValuesField.value, true),
    showTable: booleanSelect(showTableField.value, false),
  };
  const inner = document.createElement('div');
  const header = buildHeader(headingField, introField, dataset);
  const legend = buildLegend(metrics);

  block.classList.add(`impact-bar-chart-style-${chartStyleClass(chartStyleField.value)}`);
  block.classList.toggle('impact-bar-chart-text-light', textModeClass(textModeField.value) === 'light');
  inner.className = 'impact-bar-chart-inner';

  if (header.childElementCount) inner.append(header);

  if (!displayRows.length) {
    inner.append(buildEmpty(emptyMessageField.value, isAuthoring));
    block.replaceChildren(inner);
    return;
  }

  if (legend) inner.append(legend);
  inner.append(buildChart(displayRows, config));
  if (config.showTable) inner.append(buildTable(displayRows, config));

  block.replaceChildren(inner);
  observeChart(block);
}
