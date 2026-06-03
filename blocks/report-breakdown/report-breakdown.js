import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { animateCountUp } from '../../scripts/count-up.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BLOCK_ROW_INDEX = {
  heading: 0,
  defaultYear: 1,
  tableLabels: 2,
  totalLabel: 3,
  apiEndpoint: 4,
  emptyStateMessage: 5,
};

const ITEM_COLUMN_INDEX = {
  year: 0,
  reportType: 1,
  reportCount: 2,
  color: 3,
};

const DEFAULTS = {
  heading: '2024 CyberTipline Reports by Type',
  defaultYear: '2024',
  tableLabels: {
    type: 'Report Type',
    count: 'Reports',
  },
  totalLabel: 'Total',
  emptyStateMessage: 'No report data available.',
  authorMessage: 'Add report-breakdown items in Universal Editor or connect an API endpoint.',
};

const FALLBACK_COLORS = [
  '#ffad5b',
  '#8ccfdf',
  '#f45b97',
  '#72c679',
  '#9a7dd2',
  '#ffb885',
  '#f0f34a',
  '#eb4638',
];

let blockSequence = 0;

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isReportItemRow(row) {
  const cols = [...row.children];
  return Boolean(
    row.querySelector('[data-aue-prop="year"]')
      || row.querySelector('[data-aue-prop="reportType"]')
      || row.querySelector('[data-aue-prop="reportCount"]')
      || cols.length >= 4,
  );
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isReportItemRow(row));
}

function getParentFallbackCell(scope, rowIndex) {
  if (!scope?.classList?.contains('report-breakdown')) return null;
  const row = getParentRows(scope)[rowIndex];
  return row?.children?.[0] || row || null;
}

function getField(scope, name, rowIndexMap, columnIndex = 0) {
  const rowIndex = rowIndexMap?.[name];
  const options = {
    rowIndex,
    columnIndex,
    fallbackCell: rowIndexMap === ITEM_COLUMN_INDEX
      ? scope.children[columnIndex]
      : getParentFallbackCell(scope, rowIndex),
  };
  const linkField = readLinkField(scope, name, options);
  if (linkField.source) {
    return {
      source: linkField.source,
      value: linkField.value,
    };
  }

  const textField = readTextField(scope, name, options);
  if (textField.source) {
    return {
      source: textField.source,
      value: textField.value,
    };
  }

  return {
    source: linkField.cell || textField.cell,
    value: linkField.value || textField.value,
  };
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!target) return;

  if (!field?.source) {
    target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      element.setAttribute(key, value);
    }
  });
  return element;
}

function parseNumber(value) {
  const normalized = String(value || '')
    .replace(/,/g, '')
    .replace(/[^0-9.-]+/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
  return Math.round(value || 0).toLocaleString('en-US');
}

function normalizeYear(value) {
  return String(value || '').trim();
}

function normalizeColor(value, index) {
  const normalized = String(value || '').trim();
  return normalized || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function parseTableLabels(value) {
  const [typeLabel, countLabel] = String(value || '')
    .split('|', 2)
    .map((part) => part.trim());

  return {
    type: typeLabel || DEFAULTS.tableLabels.type,
    count: countLabel || DEFAULTS.tableLabels.count,
  };
}

function normalizeBlockEntries(rows, fallbackYear = DEFAULTS.defaultYear) {
  const entries = [];
  const placeholders = [];

  rows.forEach((row, index) => {
    const isItemRow = isReportItemRow(row);

    if (!isItemRow) return;

    const yearField = getField(row, 'year', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.year);
    const reportTypeField = getField(
      row,
      'reportType',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.reportType,
    );
    const reportCountField = getField(
      row,
      'reportCount',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.reportCount,
    );
    const colorField = getField(row, 'color', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.color);
    const reportCount = parseNumber(reportCountField.value);
    const hasVisibleContent = Boolean(
      yearField.value || reportTypeField.value || reportCountField.value || colorField.value,
    );
    const isAuthoringPlaceholder = hasAuthoringContext(row)
      && (!hasVisibleContent
        || !yearField.value
        || !reportTypeField.value
        || !Number.isFinite(reportCount));

    if (!hasVisibleContent && !isAuthoringPlaceholder) {
      return;
    }

    if (isAuthoringPlaceholder) {
      placeholders.push({
        year: normalizeYear(yearField.value) || normalizeYear(fallbackYear) || DEFAULTS.defaultYear,
        reportType: reportTypeField.value,
        reportCount: Number.isFinite(reportCount) ? reportCount : 0,
        reportCountRaw: reportCountField.value,
        color: normalizeColor(colorField.value, index),
        order: index,
        row,
        yearField,
        reportTypeField,
        reportCountField,
        isAuthoringPlaceholder: true,
      });
      return;
    }

    if (!yearField.value || !reportTypeField.value || !Number.isFinite(reportCount)) {
      return;
    }

    entries.push({
      year: normalizeYear(yearField.value),
      reportType: reportTypeField.value,
      reportCount,
      color: normalizeColor(colorField.value, index),
      order: index,
      row,
      yearField,
      reportTypeField,
      reportCountField,
    });
  });

  return {
    entries,
    placeholders,
  };
}

function normalizeApiEntry(rawEntry, index) {
  const year = normalizeYear(
    rawEntry?.year
      || rawEntry?.tab
      || rawEntry?.period
      || rawEntry?.dataset
      || '',
  );
  const reportType = String(
    rawEntry?.reportType
      || rawEntry?.type
      || rawEntry?.name
      || rawEntry?.label
      || '',
  ).trim();
  const reportCount = parseNumber(
    rawEntry?.reportCount
      || rawEntry?.reports
      || rawEntry?.count
      || rawEntry?.value
      || rawEntry?.total,
  );

  if (!year || !reportType || !Number.isFinite(reportCount)) return null;

  return {
    year,
    reportType,
    reportCount,
    color: normalizeColor(rawEntry?.color || rawEntry?.hex, index),
    order: Number.isFinite(rawEntry?.order) ? rawEntry.order : index,
  };
}

function normalizeApiEntries(payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.flatMap((entry, index) => {
      const groupedItems = entry?.items || entry?.entries || entry?.data || entry?.reportsByType;
      if (Array.isArray(groupedItems)) {
        const year = normalizeYear(entry?.year || entry?.label || entry?.name || '');
        return groupedItems
          .map((groupedEntry, groupedIndex) => normalizeApiEntry({
            ...groupedEntry,
            year: groupedEntry?.year || year,
            order: groupedEntry?.order ?? groupedIndex,
          }, groupedIndex))
          .filter(Boolean);
      }

      const normalizedEntry = normalizeApiEntry(entry, index);
      return normalizedEntry ? [normalizedEntry] : [];
    });
  }

  if (typeof payload === 'object') {
    const directCollection = payload.items || payload.entries || payload.data || payload.results;
    if (Array.isArray(directCollection)) return normalizeApiEntries(directCollection);

    const groupedCollection = payload.years || payload.datasets;
    if (Array.isArray(groupedCollection)) return normalizeApiEntries(groupedCollection);

    return Object.entries(payload).flatMap(([year, value]) => {
      if (!Array.isArray(value)) return [];
      return value
        .map((entry, index) => normalizeApiEntry({
          ...entry,
          year: entry?.year || year,
          order: entry?.order ?? index,
        }, index))
        .filter(Boolean);
    });
  }

  return [];
}

async function fetchApiEntries(apiEndpoint) {
  if (!apiEndpoint) return [];

  try {
    const response = await fetch(apiEndpoint, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) return [];

    const payload = await response.json();
    return normalizeApiEntries(payload);
  } catch (e) {
    return [];
  }
}

function sortYearsDescending(yearA, yearB) {
  const numericA = Number.parseInt(yearA, 10);
  const numericB = Number.parseInt(yearB, 10);

  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return numericB - numericA;
  }

  return yearB.localeCompare(yearA, undefined, { numeric: true, sensitivity: 'base' });
}

function groupEntriesByYear(entries) {
  const datasets = new Map();

  entries.forEach((entry, index) => {
    const year = normalizeYear(entry.year);
    if (!year) return;

    if (!datasets.has(year)) datasets.set(year, []);
    datasets.get(year).push({
      ...entry,
      order: Number.isFinite(entry.order) ? entry.order : index,
      color: normalizeColor(entry.color, index),
    });
  });

  return [...datasets.keys()]
    .sort(sortYearsDescending)
    .map((year) => {
      const yearEntries = datasets.get(year)
        .sort((entryA, entryB) => entryA.order - entryB.order);
      const total = yearEntries.reduce((sum, entry) => sum + entry.reportCount, 0);

      return {
        year,
        entries: yearEntries,
        placeholderEntries: [],
        tableEntries: yearEntries,
        total,
      };
    });
}

function mergeAuthoringPlaceholders(datasets, placeholders, preferredYear) {
  if (!placeholders.length) return datasets;

  const datasetMap = new Map(datasets.map((dataset) => [dataset.year, {
    ...dataset,
    entries: [...dataset.entries],
    placeholderEntries: [...(dataset.placeholderEntries || [])],
  }]));

  placeholders.forEach((placeholder, index) => {
    const targetYear = normalizeYear(placeholder.year)
      || normalizeYear(preferredYear)
      || DEFAULTS.defaultYear;

    if (!datasetMap.has(targetYear)) {
      datasetMap.set(targetYear, {
        year: targetYear,
        entries: [],
        placeholderEntries: [],
        tableEntries: [],
        total: 0,
      });
    }

    datasetMap.get(targetYear).placeholderEntries.push({
      ...placeholder,
      order: Number.isFinite(placeholder.order) ? placeholder.order : datasets.length + index,
    });
  });

  return [...datasetMap.keys()]
    .sort(sortYearsDescending)
    .map((year) => {
      const dataset = datasetMap.get(year);
      const entries = [...dataset.entries]
        .sort((entryA, entryB) => entryA.order - entryB.order);
      const placeholderEntries = [...(dataset.placeholderEntries || [])]
        .sort((entryA, entryB) => entryA.order - entryB.order);

      return {
        year,
        entries,
        placeholderEntries,
        tableEntries: [...entries, ...placeholderEntries],
        total: entries.reduce((sum, entry) => sum + entry.reportCount, 0),
      };
    });
}

function sanitizeId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildSemiDonut(dataset) {
  const width = 1440;
  const height = 820;
  const centerX = width / 2;
  const centerY = 760;
  const radius = 560;
  const strokeWidth = 162;
  const minVisibleSegmentShare = 0.01;
  const basePath = createSvgElement('path', {
    // Draw the upper semicircle so the chart arches above the table overlay.
    d: `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`,
    class: 'report-breakdown-arc-track',
  });
  const totalLength = basePath.getTotalLength();
  const svg = createSvgElement('svg', {
    class: 'report-breakdown-chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${dataset.year} report breakdown chart.`,
  });

  basePath.setAttribute('fill', 'none');
  basePath.setAttribute('stroke-width', `${strokeWidth}`);
  basePath.setAttribute('stroke-linecap', 'butt');

  const arcGroup = createSvgElement('g', {
    class: 'report-breakdown-arc-group',
  });
  const rawSegmentLengths = dataset.entries.map((entry) => (
    dataset.total > 0 ? (entry.reportCount / dataset.total) * totalLength : 0
  ));
  const visualSegmentLengths = [...rawSegmentLengths];

  if (dataset.entries.length > 2) {
    const minVisibleLength = totalLength * minVisibleSegmentShare;
    let visualBoost = 0;

    visualSegmentLengths.forEach((segmentLength, index) => {
      if (segmentLength > 0 && segmentLength < minVisibleLength) {
        visualBoost += minVisibleLength - segmentLength;
        visualSegmentLengths[index] = minVisibleLength;
      }
    });

    if (visualBoost > 0) {
      const largestIndex = rawSegmentLengths.indexOf(Math.max(...rawSegmentLengths));
      if (largestIndex >= 0) {
        visualSegmentLengths[largestIndex] = Math.max(
          visualSegmentLengths[largestIndex] - visualBoost,
          0,
        );
      }
    }
  }

  let consumedLength = 0;

  dataset.entries.forEach((entry, index) => {
    const rawSegmentLength = rawSegmentLengths[index] || 0;
    const segmentLength = visualSegmentLengths[index] || 0;
    const arc = createSvgElement('path', {
      d: basePath.getAttribute('d'),
      class: 'report-breakdown-arc',
    });

    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', entry.color);
    arc.setAttribute('stroke-width', `${strokeWidth}`);
    arc.setAttribute('stroke-linecap', 'butt');
    arc.style.strokeDasharray = `${segmentLength} ${Math.max(totalLength - segmentLength, 0)}`;
    arc.style.strokeDashoffset = `${-consumedLength}`;

    if (segmentLength > rawSegmentLength) {
      arc.classList.add('is-boosted');
    }

    arcGroup.append(arc);
    consumedLength += segmentLength;
  });

  svg.append(basePath, arcGroup);
  return svg;
}

function buildTableRow(entry, index) {
  const row = document.createElement('div');
  row.className = 'report-breakdown-row';
  row.style.setProperty('--row-index', index);
  if (entry.row) moveInstrumentation(entry.row, row);

  const type = document.createElement('div');
  type.className = 'report-breakdown-type';

  const count = document.createElement('div');
  count.className = 'report-breakdown-count';

  const swatch = document.createElement('span');
  swatch.className = 'report-breakdown-swatch';
  swatch.style.backgroundColor = entry.color;
  swatch.setAttribute('aria-hidden', 'true');

  if (entry.isAuthoringPlaceholder) {
    row.classList.add('is-authoring-placeholder');

    moveFieldContent(
      entry.reportTypeField,
      type,
      entry.reportType || 'New report breakdown item',
    );
    moveFieldContent(
      entry.reportCountField,
      count,
      entry.reportCountRaw || 'Add report count',
    );

    row.append(type, count, swatch);
    return row;
  }

  if (entry.reportTypeField?.source) {
    moveFieldContent(entry.reportTypeField, type, entry.reportType);
  } else {
    type.textContent = entry.reportType;
  }

  if (entry.reportCountField?.source) {
    moveFieldContent(entry.reportCountField, count, formatNumber(entry.reportCount));
  } else {
    count.textContent = formatNumber(entry.reportCount);
  }
  count.dataset.countUpValue = count.textContent;

  row.append(type, count, swatch);
  return row;
}

function buildPanel(dataset, state) {
  const panel = document.createElement('section');
  const sanitizedYear = sanitizeId(dataset.year) || 'dataset';
  panel.className = 'report-breakdown-panel';
  panel.id = `${state.instanceId}-panel-${sanitizedYear}`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('tabindex', '0');
  panel.setAttribute('aria-labelledby', `${state.instanceId}-tab-${sanitizedYear}`);
  panel.hidden = dataset.year !== state.activeYear;

  const chartShell = document.createElement('div');
  chartShell.className = 'report-breakdown-chart-shell';
  chartShell.append(buildSemiDonut(dataset));

  const tableShell = document.createElement('div');
  tableShell.className = 'report-breakdown-table-shell';

  const tableHead = document.createElement('div');
  tableHead.className = 'report-breakdown-table-head';

  const typeHead = document.createElement('span');
  typeHead.className = 'report-breakdown-table-label';
  typeHead.textContent = state.tableLabels.type;

  const countHead = document.createElement('span');
  countHead.className = 'report-breakdown-table-label';
  countHead.textContent = state.tableLabels.count;

  const markerHead = document.createElement('span');
  markerHead.className = 'report-breakdown-table-marker';
  markerHead.setAttribute('aria-hidden', 'true');

  tableHead.append(typeHead, countHead, markerHead);

  const rows = document.createElement('div');
  rows.className = 'report-breakdown-table-body';
  (dataset.tableEntries || dataset.entries).forEach((entry, index) => {
    rows.append(buildTableRow(entry, index));
  });

  const totalRow = document.createElement('div');
  totalRow.className = 'report-breakdown-total';

  const totalLabel = document.createElement('span');
  totalLabel.className = 'report-breakdown-total-label';
  totalLabel.textContent = state.totalLabel;

  const totalValue = document.createElement('strong');
  totalValue.className = 'report-breakdown-total-value';
  totalValue.textContent = formatNumber(dataset.total);
  totalValue.dataset.countUpValue = totalValue.textContent;

  totalRow.append(totalLabel, totalValue);
  tableShell.append(tableHead, rows, totalRow);
  panel.append(chartShell, tableShell);

  return panel;
}

function buildEmptyState(message, isAuthoring) {
  const empty = document.createElement('div');
  empty.className = 'report-breakdown-empty';

  const text = document.createElement('p');
  text.className = 'report-breakdown-empty-title';
  text.textContent = message || DEFAULTS.emptyStateMessage;
  empty.append(text);

  if (isAuthoring) {
    const hint = document.createElement('p');
    hint.className = 'report-breakdown-empty-body';
    hint.textContent = DEFAULTS.authorMessage;
    empty.append(hint);
  }

  return empty;
}

function animateActivePanel(panel, reducedMotion) {
  if (reducedMotion || !panel) return;

  const chartShell = panel.querySelector('.report-breakdown-chart-shell');
  const tableShell = panel.querySelector('.report-breakdown-table-shell');
  const rows = [...panel.querySelectorAll('.report-breakdown-row')];

  if (chartShell?.animate) {
    chartShell.animate([
      {
        opacity: 0.35,
        transform: 'translateY(30px) scale(0.985)',
        clipPath: 'inset(0 100% 0 0 round 42px)',
      },
      {
        opacity: 1,
        transform: 'translateY(0) scale(1)',
        clipPath: 'inset(0 0 0 0 round 42px)',
      },
    ], {
      duration: 900,
      easing: 'cubic-bezier(0.2, 1, 0.22, 1)',
      fill: 'both',
    });
  }

  if (tableShell?.animate) {
    tableShell.animate([
      {
        opacity: 0.55,
        transform: 'translateY(18px)',
      },
      {
        opacity: 1,
        transform: 'translateY(0)',
      },
    ], {
      duration: 620,
      easing: 'cubic-bezier(0.2, 1, 0.22, 1)',
      fill: 'both',
    });
  }

  rows.forEach((row, index) => {
    if (!row.animate) return;
    row.animate([
      {
        opacity: 0,
        transform: 'translateY(10px)',
      },
      {
        opacity: 1,
        transform: 'translateY(0)',
      },
    ], {
      duration: 420,
      delay: 140 + (index * 45),
      easing: 'ease',
      fill: 'both',
    });
  });

  panel.querySelectorAll('[data-count-up-value]').forEach((element, index) => {
    animateCountUp(element, {
      displayValue: element.dataset.countUpValue,
      duration: 700 + (index * 45),
    });
  });
}

function activateYear(state, year, shouldAnimate = false) {
  const nextPanel = state.panels.get(year);
  if (!nextPanel) return;

  state.activeYear = year;

  state.tabs.forEach(({ button, year: tabYear }) => {
    const isActive = tabYear === year;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  });

  state.panels.forEach((panel, panelYear) => {
    panel.hidden = panelYear !== year;
  });

  if (state.isVisible && shouldAnimate) {
    animateActivePanel(nextPanel, state.reducedMotion);
  }
}

function enableReveal(block, state) {
  if (state.reducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    state.isVisible = true;
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    const isVisible = entries.some((entry) => entry.isIntersecting);
    if (!isVisible) return;

    block.classList.add('is-visible');
    state.isVisible = true;
    animateActivePanel(state.panels.get(state.activeYear), state.reducedMotion);
    observer.disconnect();
  }, {
    threshold: 0.2,
  });

  observer.observe(block);
}

async function resolveEntries(apiEndpoint, authoredEntries, isAuthoring, authoredPlaceholders) {
  if (isAuthoring && (authoredEntries.length || authoredPlaceholders.length)) {
    return authoredEntries;
  }

  const apiEntries = await fetchApiEntries(apiEndpoint);
  if (apiEntries.length) return apiEntries;

  return authoredEntries;
}

export default async function decorate(block) {
  blockSequence += 1;

  const isAuthoring = hasAuthoringContext(block);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const headingField = getField(block, 'heading', BLOCK_ROW_INDEX);
  const defaultYearField = getField(block, 'defaultYear', BLOCK_ROW_INDEX);
  const tableLabelsField = getField(block, 'tableLabels', BLOCK_ROW_INDEX);
  const totalLabelField = getField(block, 'totalLabel', BLOCK_ROW_INDEX);
  const apiEndpointField = getField(block, 'apiEndpoint', BLOCK_ROW_INDEX);
  const emptyStateField = getField(block, 'emptyStateMessage', BLOCK_ROW_INDEX);
  const rows = [...block.querySelectorAll(':scope > div')];
  const requestedYear = defaultYearField.value || DEFAULTS.defaultYear;
  const {
    entries: authoredEntries,
    placeholders: authoredPlaceholders,
  } = normalizeBlockEntries(rows, requestedYear);
  const resolvedEntries = await resolveEntries(
    apiEndpointField.value,
    authoredEntries,
    isAuthoring,
    authoredPlaceholders,
  );
  const baseDatasets = groupEntriesByYear(resolvedEntries);
  const datasets = isAuthoring
    ? mergeAuthoringPlaceholders(baseDatasets, authoredPlaceholders, requestedYear)
    : baseDatasets;
  const activeYear = datasets.find((dataset) => dataset.year === requestedYear)?.year
    || datasets[0]?.year
    || DEFAULTS.defaultYear;

  const state = {
    instanceId: `report-breakdown-${blockSequence}`,
    reducedMotion,
    tableLabels: parseTableLabels(tableLabelsField.value),
    totalLabel: totalLabelField.value || DEFAULTS.totalLabel,
    activeYear,
    isVisible: false,
    tabs: [],
    panels: new Map(),
  };

  const inner = document.createElement('div');
  inner.className = 'report-breakdown-inner';

  const header = document.createElement('div');
  header.className = 'report-breakdown-header report-breakdown-reveal';
  if (headingField.value || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'report-breakdown-heading';
    moveFieldContent(headingField, heading, headingField.value || DEFAULTS.heading);
    header.append(heading);
  }
  inner.append(header);

  if (!datasets.length) {
    const empty = buildEmptyState(emptyStateField.value, isAuthoring);
    empty.classList.add('report-breakdown-reveal');
    inner.append(empty);
    block.replaceChildren(inner);
    enableReveal(block, state);
    return;
  }

  const tabsShell = document.createElement('div');
  tabsShell.className = 'report-breakdown-tabs-shell report-breakdown-reveal';

  const tabList = document.createElement('div');
  tabList.className = 'report-breakdown-tabs';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Report years');

  datasets.forEach((dataset) => {
    const sanitizedYear = sanitizeId(dataset.year) || 'dataset';
    const button = document.createElement('button');
    const isActive = dataset.year === state.activeYear;

    button.type = 'button';
    button.className = 'report-breakdown-tab';
    button.id = `${state.instanceId}-tab-${sanitizedYear}`;
    button.textContent = dataset.year;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.setAttribute('aria-controls', `${state.instanceId}-panel-${sanitizedYear}`);
    button.tabIndex = isActive ? 0 : -1;
    button.classList.toggle('is-active', isActive);
    button.addEventListener('click', () => activateYear(state, dataset.year, true));

    state.tabs.push({ button, year: dataset.year });
    tabList.append(button);
  });

  tabsShell.append(tabList);
  inner.append(tabsShell);

  const panelStack = document.createElement('div');
  panelStack.className = 'report-breakdown-panels report-breakdown-reveal';

  datasets.forEach((dataset) => {
    const panel = buildPanel(dataset, state);
    state.panels.set(dataset.year, panel);
    panelStack.append(panel);
  });

  inner.append(panelStack);
  block.replaceChildren(inner);
  activateYear(state, state.activeYear, false);
  enableReveal(block, state);
}
