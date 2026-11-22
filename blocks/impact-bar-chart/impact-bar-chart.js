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
import { markButtonSurface } from '../../scripts/button-utils.js';
import createChartTooltip, { formatChartShare } from '../../scripts/chart-tooltip.js';

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
  disclaimer: 13,
  valueScale: 14,
};

// Rounded axis tops: a value scale ends on one of these times a power of ten.
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 7.5, 8, 10];
// Auto switches to a log scale when the tallest bar is this many times the shortest.
const LOG_SCALE_RATIO = 50;
// A log axis drops its rounded top label when it would crowd the power of ten below it.
const MIN_TICK_GAP = 0.05;

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

const NON_METRIC_KEYS = new Set(['label', 'description', 'value', 'total']);

let viewInstance = 0;

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

/**
 * Chart Style. Blank is the classic column chart the client asked to keep (2026-11-22); the
 * horizontal bars this block drew before are now the opt-in "bars" styles.
 */
function chartLayout(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['bars', 'horizontal'].includes(normalized)) return { layout: 'bars', style: 'standard' };
  if (['bars-skinny', 'horizontal-skinny'].includes(normalized)) return { layout: 'bars', style: 'skinny' };
  return { layout: 'columns', style: normalized === 'skinny' ? 'skinny' : 'standard' };
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

function tableDisplayMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['toggle', 'switch', 'tabs'].includes(normalized)) return 'toggle';
  if (['table', 'table-only'].includes(normalized)) return 'table';
  if (['show', 'true', 'yes', '1'].includes(normalized)) return 'show';
  return 'hide';
}

function metricColor(dataset, rows, key, index) {
  const rowColor = rows
    .map((row) => row.values?.colors?.[key] || row.raw?.values?.colors?.[key])
    .find(Boolean);

  return normalizeColor(dataset.metadata?.colors?.[key] || rowColor, index);
}

function deriveMetrics(dataset, rows, configuredMetrics) {
  if (configuredMetrics.length) return configuredMetrics;

  const datasetType = normalizeText(dataset.type).toLowerCase().replace(/-/g, '_');
  const supportsMultipleSeries = ['stacked_bar', 'grouped_bar', 'multi_bar'].includes(datasetType);
  if (!supportsMultipleSeries) return [];

  let columns = (dataset.columns || [])
    .filter((column) => !NON_METRIC_KEYS.has(normalizeText(column.key).toLowerCase()));

  if (!columns.length) {
    const keys = [];
    rows.forEach((row) => {
      Object.entries(row.values || {}).forEach(([key, value]) => {
        if (!NON_METRIC_KEYS.has(key) && typeof value !== 'object' && !keys.includes(key)) {
          keys.push(key);
        }
      });
    });
    columns = keys.map((key) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    }));
  }

  return columns.map((column, index) => ({
    key: column.key,
    label: column.label,
    color: metricColor(dataset, rows, column.key, index),
  }));
}

function tableColumns(dataset, metrics, valueKey) {
  if (dataset.columns?.length) return dataset.columns;

  if (metrics.length) {
    return [
      { key: 'label', label: 'Category' },
      ...metrics.map(({ key, label }) => ({ key, label, align: 'right' })),
      { key: 'total', label: 'Total', align: 'right' },
    ];
  }

  return [
    { key: 'label', label: 'Category' },
    { key: valueKey, label: 'Value', align: 'right' },
  ];
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

function buildDisclaimer(field) {
  if (!field.text && !field.html && !field.source) return null;

  const disclaimer = document.createElement('div');
  disclaimer.className = 'impact-bar-chart-disclaimer';
  moveRich(field, disclaimer);

  return disclaimer.childNodes.length ? disclaimer : null;
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
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', [
    `${row.label}: ${formatNumber(total)} total`,
    ...metrics.map((metric) => (
      `${metric.label}: ${formatNumber(rowNumericValue(row, metric.key) ?? 0)}`
    )),
  ].join('. '));

  metrics.forEach((metric) => {
    const value = rowNumericValue(row, metric.key) ?? 0;
    const segmentWidth = total > 0 ? (value / total) * 100 : 0;
    const segment = document.createElement('span');

    segment.className = 'impact-bar-chart-segment';
    segment.style.setProperty('--impact-bar-chart-segment-width', `${segmentWidth}%`);
    segment.style.setProperty('--impact-bar-chart-segment-color', metric.color);
    segment.dataset.metricIndex = String(metrics.indexOf(metric));
    segment.setAttribute('aria-hidden', 'true');
    bar.append(segment);
  });

  return bar;
}

function buildSeriesValues(row, metrics) {
  const list = document.createElement('ul');
  list.className = 'impact-bar-chart-series-values';

  metrics.forEach((metric) => {
    const item = document.createElement('li');
    const marker = document.createElement('span');
    const label = document.createElement('span');
    const value = document.createElement('strong');

    marker.className = 'impact-bar-chart-series-marker';
    marker.style.setProperty('--impact-bar-chart-segment-color', metric.color);
    marker.setAttribute('aria-hidden', 'true');
    label.textContent = metric.label;
    value.textContent = formatNumber(rowNumericValue(row, metric.key) ?? 0);
    item.append(marker, label, value);
    list.append(item);
  });

  return list;
}

/**
 * Hover and keyboard readout. Pointing at a bar fades the others and shows its value and
 * its share of the whole chart above the bar's end; on a stacked bar, each segment shows
 * its own share of that bar. The chart is one tab stop; the arrow keys step through bars.
 */
function enableBarHighlight(list, entries, config) {
  const live = entries.filter(({ row }) => !row.isAuthoringPlaceholder);
  if (!live.length) return;

  const grandTotal = live.reduce((sum, entry) => sum + entry.total, 0);
  const tooltip = createChartTooltip(list);
  let active = null;

  const anchorAbove = (element) => {
    const rect = element.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    return [rect.right - listRect.left, rect.top - listRect.top];
  };

  const setActive = (entry, segment = null) => {
    if (active && active !== entry) active.item.classList.remove('is-active');
    active = entry;
    list.classList.toggle('has-active-bar', Boolean(entry));
    if (!entry) {
      tooltip.hide();
      return;
    }
    entry.item.classList.add('is-active');

    if (segment) {
      const metric = config.metrics[Number(segment.dataset.metricIndex)];
      const value = rowNumericValue(entry.row, metric.key) ?? 0;
      const rect = segment.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      tooltip.show({
        value: formatNumber(value),
        label: `${metric.label} · ${entry.row.label}`,
        color: metric.color,
        detail: `${formatChartShare(value, entry.total)} of ${entry.row.label}`,
      }, rect.left - listRect.left + (rect.width / 2), rect.top - listRect.top);
      return;
    }

    const [x, y] = anchorAbove(entry.bar);
    tooltip.show({
      value: entry.display,
      label: entry.row.label,
      color: entry.color,
      detail: live.length > 1 ? `${formatChartShare(entry.total, grandTotal)} of the total` : '',
    }, x, y);
  };

  live.forEach((entry) => {
    entry.item.classList.add('is-linked');
    entry.item.addEventListener('pointerenter', () => setActive(entry));
    entry.item.addEventListener('pointerleave', () => setActive(null));
    entry.bar.querySelectorAll('.impact-bar-chart-segment').forEach((segment) => {
      segment.addEventListener('pointerenter', () => setActive(entry, segment));
      segment.addEventListener('pointerleave', () => setActive(entry));
    });
  });

  list.tabIndex = 0;
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Chart. Use the arrow keys to read each bar.');
  list.addEventListener('focus', () => {
    if (!active) setActive(live[0]);
  });
  list.addEventListener('blur', () => setActive(null));
  list.addEventListener('keydown', (event) => {
    const step = {
      ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
    }[event.key];
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (!step) return;
    event.preventDefault();
    const current = live.indexOf(active);
    setActive(live[current < 0 ? 0 : (current + step + live.length) % live.length]);
  });
}

function buildChart(rows, config) {
  const list = document.createElement('div');
  const values = rows.map((row) => rowTotal(row, config.valueKey, config.metrics));
  const maxValue = Math.max(...values, 0);

  list.className = 'impact-bar-chart-list';
  const entries = [];

  rows.forEach((row, index) => {
    const item = document.createElement('div');
    const label = document.createElement('p');
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
    const bar = config.metrics.length
      ? buildStackedBar(row, maxValue, config.metrics)
      : buildSingleBar(row, maxValue, config.valueKey, index);
    track.append(bar);

    value.className = 'impact-bar-chart-value';
    value.textContent = config.metrics.length
      ? formatNumber(rowTotal(row, config.valueKey, config.metrics))
      : rowDisplayValue(row, config.valueKey);
    value.hidden = !config.showValues;

    item.append(label, track, value);

    if (config.metrics.length && config.showValues) {
      item.append(buildSeriesValues(row, config.metrics));
    }

    if (description) {
      const body = document.createElement('p');
      body.className = 'impact-bar-chart-description';
      body.textContent = description;
      item.append(body);
    }

    list.append(item);
    entries.push({
      row,
      item,
      bar,
      total: values[index],
      display: value.textContent,
      color: config.metrics.length ? config.metrics[0].color : normalizeColor(row.color, index),
    });
  });

  enableBarHighlight(list, entries, config);
  return list;
}

/* ---- Columns (the classic impact chart) ---- */

function niceCeil(value) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = NICE_STEPS.find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

function resolveScale(setting, values) {
  const normalized = normalizeText(setting).toLowerCase();
  if (normalized === 'log' || normalized === 'linear') return normalized;
  const positive = values.filter((value) => value > 0);
  if (positive.length < 2) return 'linear';
  return Math.max(...positive) / Math.min(...positive) >= LOG_SCALE_RATIO ? 'log' : 'linear';
}

/**
 * The value axis: where a value sits (0 = baseline, 1 = top) and the labelled ticks. Linear
 * steps in four or five round intervals; log puts 0 on the baseline, then each power of ten,
 * then the rounded top, so a 1 still shows beside a 30,000.
 */
function buildAxis(maxValue, scale) {
  if (scale === 'log') {
    const top = niceCeil(maxValue);
    const span = Math.log10(top + 1);
    const position = (value) => (value > 0 ? Math.min(Math.log10(value + 1) / span, 1) : 0);
    const ticks = [0];
    for (let power = 10; power < top; power *= 10) ticks.push(power);
    if (position(top) - position(ticks[ticks.length - 1]) >= MIN_TICK_GAP) ticks.push(top);
    return { position, ticks };
  }

  const step = niceCeil(maxValue / 4);
  const top = Math.max(Math.ceil(maxValue / step) * step, step);
  const ticks = [];
  for (let tick = 0; tick <= top; tick += step) ticks.push(tick);
  return { position: (value) => Math.max(0, Math.min(value / top, 1)), ticks };
}

// Navy or white, whichever reads on the bar: for a value label inside an authored colour.
function inkFor(hex) {
  const match = normalizeText(hex).match(/^#([0-9a-f]{3}|[0-9a-f]{6})/i);
  if (!match) return '';
  const digits = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1];
  const [r, g, b] = [0, 2, 4].map((index) => {
    const channel = parseInt(digits.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  return luminance > 0.3 ? 'var(--ncmec-navy-dark)' : '#fff';
}

// A percent column (e.g. offender-relationship) prints under each value, as "(22%)".
function rowPercent(row) {
  const percent = rowNumericValue(row, 'percent');
  return Number.isFinite(percent) ? `${formatNumber(percent)}%` : '';
}

/**
 * Hover and keyboard readout for the columns: the same shared tooltip as the bars. The
 * chart is one tab stop; the arrow keys step through every bar, group by group.
 */
function enableColumnReadout(host, bars) {
  const live = bars.filter(({ row }) => !row.isAuthoringPlaceholder);
  if (!live.length) return;

  const tooltip = createChartTooltip(host);
  let active = null;

  // `reveal` is for the keyboard: a column stepped to off the side of a scrolling chart is
  // brought into view. A pointer is already on its column, so hover never scrolls.
  const setActive = (entry, { reveal = false } = {}) => {
    if (active && active !== entry) active.bar.classList.remove('is-active');
    active = entry;
    host.classList.toggle('has-active-bar', Boolean(entry));
    if (!entry) {
      tooltip.hide();
      return;
    }
    entry.bar.classList.add('is-active');
    if (reveal) entry.bar.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const rect = entry.mark.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    tooltip.show({
      value: entry.display,
      label: entry.label,
      color: entry.color,
      detail: entry.detail,
    }, rect.left - hostRect.left + (rect.width / 2), rect.top - hostRect.top);
  };

  live.forEach((entry) => {
    entry.bar.addEventListener('pointerenter', () => setActive(entry));
    entry.bar.addEventListener('pointerleave', () => setActive(null));
  });

  host.tabIndex = 0;
  host.addEventListener('focus', () => {
    if (!active) setActive(live[0], { reveal: true });
  });
  host.addEventListener('blur', () => setActive(null));
  host.addEventListener('keydown', (event) => {
    const step = {
      ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
    }[event.key];
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (!step) return;
    event.preventDefault();
    const current = live.indexOf(active);
    setActive(
      live[current < 0 ? 0 : (current + step + live.length) % live.length],
      { reveal: true },
    );
  });
}

function buildColumns(rows, config) {
  const { metrics } = config;
  const series = metrics.length
    ? metrics
    : [{ key: config.valueKey, label: '', color: '' }];
  const valuesFor = (row) => series.map((metric) => rowNumericValue(row, metric.key) ?? 0);
  const allValues = rows.flatMap(valuesFor);
  const scale = resolveScale(config.valueScale, allValues);
  const axis = buildAxis(Math.max(...allValues, 1), scale);
  const grandTotal = rows.reduce((sum, row) => sum + rowTotal(row, config.valueKey, metrics), 0);
  const showLabels = config.showValues && !metrics.length;
  const hasPercent = rows.some((row) => rowPercent(row));

  const host = document.createElement('div');
  host.className = 'impact-bar-chart-columns';
  host.classList.add(`is-${scale}-scale`);
  host.style.setProperty('--impact-bar-chart-series', String(series.length));
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', `Column chart${scale === 'log' ? ' on a log scale' : ''}. Use the arrow keys to read each bar.`);

  const scroller = document.createElement('div');
  scroller.className = 'impact-bar-chart-columns-scroll';
  const frame = document.createElement('div');
  frame.className = 'impact-bar-chart-columns-frame';

  const yAxis = document.createElement('div');
  yAxis.className = 'impact-bar-chart-axis';
  yAxis.setAttribute('aria-hidden', 'true');
  const grid = document.createElement('div');
  grid.className = 'impact-bar-chart-grid';
  grid.setAttribute('aria-hidden', 'true');
  axis.ticks.forEach((tick) => {
    // A unitless 0-1 fraction: the CSS scales it by the plot height.
    const at = String(Number(axis.position(tick).toFixed(4)));
    const label = document.createElement('span');
    label.className = 'impact-bar-chart-tick';
    label.textContent = formatNumber(tick);
    label.style.setProperty('--impact-bar-chart-at', at);
    yAxis.append(label);
    const line = document.createElement('span');
    line.className = tick === 0 ? 'impact-bar-chart-gridline is-baseline' : 'impact-bar-chart-gridline';
    line.style.setProperty('--impact-bar-chart-at', at);
    grid.append(line);
  });

  const plot = document.createElement('div');
  plot.className = 'impact-bar-chart-plot';
  plot.style.setProperty('--impact-bar-chart-groups', String(rows.length));
  plot.append(grid);

  const entries = [];
  let barIndex = 0;
  rows.forEach((row, rowIndex) => {
    const group = document.createElement('div');
    group.className = 'impact-bar-chart-group';
    if (row.row) moveInstrumentation(row.row, group);
    setItemLabel(group, [row.label, row.description]);
    if (row.isAuthoringPlaceholder) group.classList.add('is-authoring-placeholder');

    const total = rowTotal(row, config.valueKey, metrics);
    const percent = rowPercent(row);
    group.setAttribute('role', 'img');
    group.setAttribute('aria-label', metrics.length
      ? `${row.label}: ${metrics.map((metric) => `${metric.label} ${formatNumber(rowNumericValue(row, metric.key) ?? 0)}`).join(', ')}`
      : `${row.label}: ${rowDisplayValue(row, config.valueKey)}${percent ? ` (${percent})` : ''}`);

    const barsBox = document.createElement('div');
    barsBox.className = 'impact-bar-chart-bars';

    series.forEach((metric, seriesIndex) => {
      const value = rowNumericValue(row, metric.key) ?? 0;
      const height = axis.position(value);
      // The slot is the column's full height: the hover target (a 1 is a sliver) and the
      // place a short column's value sits above it.
      const slot = document.createElement('span');
      slot.className = 'impact-bar-chart-slot';
      slot.style.setProperty('--impact-bar-chart-height', `${height * 100}%`);
      slot.style.setProperty('--bar-index', String(barIndex));
      barIndex += 1;
      const bar = document.createElement('span');
      bar.className = 'impact-bar-chart-bar';
      slot.append(bar);

      const authoredColor = metrics.length ? metric.color : normalizeText(row.color);
      if (authoredColor) slot.style.setProperty('--impact-bar-chart-bar-color', normalizeColor(authoredColor, seriesIndex));

      if (showLabels) {
        const label = document.createElement('span');
        label.className = 'impact-bar-chart-bar-value';
        label.setAttribute('aria-hidden', 'true');
        const number = document.createElement('span');
        number.textContent = rowDisplayValue(row, config.valueKey);
        label.append(number);
        if (hasPercent && percent) {
          const share = document.createElement('span');
          share.textContent = `(${percent})`;
          label.append(share);
        }
        // A tall column carries its value inside its top, a short one above it. Each sits
        // in the element it is drawn on, so the site's contrast pass judges it against the
        // right surface: the column, or the section behind it.
        const room = hasPercent ? 0.16 : 0.1;
        if (height < room) {
          label.classList.add('is-outside');
          slot.append(label);
        } else {
          if (authoredColor) label.style.color = inkFor(authoredColor);
          bar.append(label);
        }
      }

      barsBox.append(slot);
      entries.push({
        row,
        bar: slot,
        mark: bar,
        display: formatNumber(value),
        label: metrics.length ? `${metric.label} · ${row.label}` : row.label,
        color: authoredColor
          ? normalizeColor(authoredColor, seriesIndex)
          : 'var(--impact-bar-chart-bar-fill)',
        detail: metrics.length
          ? `${formatChartShare(value, total)} of ${row.label}`
          : (percent && `${percent} of the total`) || (rows.length > 1 ? `${formatChartShare(value, grandTotal)} of the total` : ''),
      });
    });

    const label = document.createElement('p');
    label.className = 'impact-bar-chart-group-label';
    label.textContent = row.label;
    label.setAttribute('aria-hidden', 'true');

    group.append(barsBox, label);
    group.style.setProperty('--row-index', rowIndex);
    plot.append(group);
  });

  frame.append(yAxis, plot);
  scroller.append(frame);
  host.append(scroller);
  enableColumnReadout(host, entries);
  return host;
}

function buildTable(rows, config, dataset) {
  const wrap = document.createElement('div');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const headerRow = document.createElement('tr');
  const headers = config.columns;

  wrap.className = 'impact-bar-chart-table-wrap';
  if (config.metrics.length > 1) wrap.classList.add('is-multiseries');
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', `${dataset.title || 'Impact chart'} data table`);
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
    if (config.instrumentTable && row.row) moveInstrumentation(row.row, tr);
    setItemLabel(tr, [row.label, row.description]);
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

  if (config.metrics.length) {
    const tfoot = document.createElement('tfoot');
    const totalRow = document.createElement('tr');

    headers.forEach((header, index) => {
      const cell = document.createElement('td');
      if (index === 0 || header.key === 'label') {
        cell.textContent = 'TOTAL';
      } else {
        const total = rows.reduce((sum, row) => {
          const value = header.key === 'total'
            ? rowTotal(row, config.valueKey, config.metrics)
            : rowNumericValue(row, header.key);
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        cell.textContent = formatNumber(total);
        cell.className = 'is-numeric';
      }
      cell.dataset.label = header.label;
      totalRow.append(cell);
    });

    tfoot.append(totalRow);
    table.append(tfoot);
  }

  const captionText = dataset.metadata?.caption || dataset.metadata?.source_note || '';
  if (captionText) {
    const caption = document.createElement('caption');
    caption.textContent = captionText;
    table.append(caption);
  }

  wrap.append(table);
  return wrap;
}

function buildViewSwitcher(chart, table) {
  viewInstance += 1;
  const controls = document.createElement('div');
  const chartButton = document.createElement('button');
  const tableButton = document.createElement('button');
  const chartPanel = document.createElement('div');
  const tablePanel = document.createElement('div');
  const chartId = `impact-bar-chart-view-${viewInstance}`;
  const tableId = `impact-bar-table-view-${viewInstance}`;

  controls.className = 'impact-bar-chart-view-toggle tab-list';
  controls.setAttribute('role', 'tablist');
  controls.setAttribute('aria-label', 'Data display');

  chartButton.type = 'button';
  chartButton.className = 'tab';
  chartButton.textContent = 'Chart';
  chartButton.setAttribute('role', 'tab');
  chartButton.setAttribute('aria-controls', chartId);

  tableButton.type = 'button';
  tableButton.className = 'tab';
  tableButton.textContent = 'Table';
  tableButton.setAttribute('role', 'tab');
  tableButton.setAttribute('aria-controls', tableId);

  chartPanel.id = chartId;
  chartPanel.className = 'impact-bar-chart-view-panel';
  chartPanel.setAttribute('role', 'tabpanel');
  chartPanel.append(chart);

  tablePanel.id = tableId;
  tablePanel.className = 'impact-bar-chart-view-panel';
  tablePanel.setAttribute('role', 'tabpanel');
  tablePanel.append(table);

  function selectView(view) {
    const showChart = view === 'chart';
    chartButton.setAttribute('aria-selected', String(showChart));
    tableButton.setAttribute('aria-selected', String(!showChart));
    chartButton.tabIndex = showChart ? 0 : -1;
    tableButton.tabIndex = showChart ? -1 : 0;
    chartPanel.hidden = !showChart;
    tablePanel.hidden = showChart;
  }

  chartButton.addEventListener('click', () => selectView('chart'));
  tableButton.addEventListener('click', () => selectView('table'));
  controls.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const nextButton = event.target === chartButton ? tableButton : chartButton;
    nextButton.click();
    nextButton.focus();
  });

  controls.append(chartButton, tableButton);
  selectView('chart');

  return [controls, chartPanel, tablePanel];
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
  const disclaimerField = readRich(block, 'disclaimer', BLOCK_ROW_INDEX.disclaimer, ['disclaimer']);
  const valueScaleField = readText(block, 'valueScale', BLOCK_ROW_INDEX.valueScale, ['value scale', 'scale']);
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
  const metrics = deriveMetrics(dataset, displayRows, parseMetricKeys(metricKeysField.value));
  const tableMode = tableDisplayMode(showTableField.value);
  const { layout, style } = chartLayout(chartStyleField.value);
  const config = {
    valueKey: normalizeText(valueKeyField.value) || 'value',
    metrics,
    showValues: booleanSelect(showValuesField.value, true),
    tableMode,
    instrumentTable: tableMode === 'table',
    valueScale: valueScaleField.value,
  };
  config.columns = tableColumns(dataset, config.metrics, config.valueKey);
  const inner = document.createElement('div');
  const header = buildHeader(headingField, introField, dataset);
  const legend = buildLegend(metrics);

  block.classList.add(`impact-bar-chart-style-${style}`, `impact-bar-chart-layout-${layout}`);
  block.classList.toggle('impact-bar-chart-text-light', textModeClass(textModeField.value) === 'light');
  // Light text is the dark-surface setting, so the Chart / Table tabs take their dark form.
  markButtonSurface(block, textModeClass(textModeField.value) === 'light');
  block.classList.toggle('impact-bar-chart-multiseries', metrics.length > 1);
  inner.className = 'impact-bar-chart-inner';

  if (header.childElementCount) inner.append(header);

  if (!displayRows.length) {
    inner.append(buildEmpty(emptyMessageField.value, isAuthoring));
    const disclaimer = buildDisclaimer(disclaimerField);
    if (disclaimer) inner.append(disclaimer);
    block.replaceChildren(inner);
    return;
  }

  if (legend && config.tableMode !== 'table') inner.append(legend);
  const buildVisual = layout === 'columns' ? buildColumns : buildChart;
  const chart = config.tableMode === 'table' ? null : buildVisual(displayRows, config);
  const table = config.tableMode === 'hide' ? null : buildTable(displayRows, config, dataset);

  if (config.tableMode === 'toggle') {
    inner.append(...buildViewSwitcher(chart, table));
  } else if (config.tableMode === 'table') {
    inner.append(table);
  } else {
    inner.append(chart);
    if (table) inner.append(table);
  }

  const disclaimer = buildDisclaimer(disclaimerField);
  if (disclaimer) inner.append(disclaimer);

  block.replaceChildren(inner);
  observeChart(block);
}
