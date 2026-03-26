import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  bodyText: 1,
  primaryButtonText: 2,
  primaryButtonLink: 3,
  secondaryButtonText: 4,
  secondaryButtonLink: 5,
  surfaceColor: 6,
  chartTrackColor: 7,
  statValues: 8,
  statLabels: 9,
  segmentValues: 10,
  segmentLabels: 11,
  segmentColors: 12,
};

const DEFAULT_SEGMENT_COLOR = '#008DB6';
const DEFAULT_SURFACE_COLOR = '#ffffff';
const DEFAULT_TRACK_COLOR = '#edf1f3';
const ANIMATION_DURATION = 1400;

function getBlockField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const row = block.children[rowIndex];
  if (!row) return { source: null, value: '' };

  const cell = row.children[columnIndex] || row;
  return { source: cell, value: cell.textContent.trim() };
}

function getBlockRichField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source;

  const row = block.children[rowIndex];
  if (!row) return null;
  return row.children[columnIndex] || row;
}

function getBlockLinkField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }

  const row = block.children[rowIndex];
  if (!row) return { source: null, value: '' };

  const cell = row.children[columnIndex] || row;
  const anchor = cell.querySelector('a');
  return { source: cell, value: anchor?.href || cell.textContent.trim() };
}

function getItemField(row, name, columnIndex) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const cols = [...row.children];
  if (cols[columnIndex]) return { source: null, value: cols[columnIndex].textContent.trim() };
  return { source: null, value: '' };
}

function buildRichContent(source, className) {
  if (!source) return null;

  const content = document.createElement('div');
  content.className = className;
  moveInstrumentation(source, content);
  while (source.firstChild) content.append(source.firstChild);

  return content.childNodes.length ? content : null;
}

function buildButton(labelField, linkField, variant) {
  if (!labelField.value && !linkField.value) return null;

  const label = labelField.value || 'Learn More';
  const button = document.createElement(linkField.value ? 'a' : 'span');
  button.className = `impact-donut-button ${variant}`;
  button.textContent = label;

  if (linkField.value) button.href = linkField.value;
  if (labelField.source || linkField.source) {
    moveInstrumentation(labelField.source || linkField.source, button);
  }

  return button;
}

function parseSegmentValue(value) {
  const normalized = String(value || '').replace(/[^0-9.]+/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLines(value) {
  if (!value) return [];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function buildStatItem(item, index) {
  const stat = document.createElement('article');
  stat.className = 'impact-donut-stat impact-donut-reveal';
  stat.style.setProperty('--stagger-index', index);
  if (item.row) moveInstrumentation(item.row, stat);

  const value = document.createElement('div');
  value.className = 'impact-donut-stat-value';
  value.textContent = item.value;
  stat.append(value);

  const label = document.createElement('p');
  label.className = 'impact-donut-stat-label';
  label.textContent = item.label;
  stat.append(label);

  return stat;
}

function buildLegendItem(segment, index) {
  const item = document.createElement('div');
  item.className = 'impact-donut-legend-item impact-donut-reveal';
  item.style.setProperty('--stagger-index', index + 1);
  if (segment.row) moveInstrumentation(segment.row, item);

  const value = document.createElement('p');
  value.className = 'impact-donut-legend-value';
  value.style.color = segment.color;
  value.textContent = '0%';
  item.append(value);

  const label = document.createElement('p');
  label.className = 'impact-donut-legend-label';
  label.textContent = segment.label;
  item.append(label);

  return { item, value };
}

function updateLegendValues(legendValues, segments, progress) {
  legendValues.forEach((legendValue, index) => {
    const percentage = Math.round(segments[index].percentage * progress);
    legendValue.textContent = `${percentage}%`;
  });
}

function renderDonut(chart, segments, progress) {
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const revealedAngle = 360 * clampedProgress;
  const gradientStops = [];
  let startAngle = 0;

  segments.forEach((segment) => {
    const segmentAngle = 360 * (segment.percentage / 100);
    const visibleEnd = Math.min(startAngle + segmentAngle, revealedAngle);
    if (visibleEnd > startAngle) {
      gradientStops.push(`${segment.color} ${startAngle}deg ${visibleEnd}deg`);
    }
    startAngle += segmentAngle;
  });

  if (revealedAngle < 360) {
    gradientStops.push(`var(--impact-donut-track) ${revealedAngle}deg 360deg`);
  }

  if (!gradientStops.length) {
    gradientStops.push('var(--impact-donut-track) 0deg 360deg');
  }

  chart.style.backgroundImage = `conic-gradient(${gradientStops.join(', ')})`;
}

function animateChart(block, chart, segments, legendValues) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finishImmediately = () => {
    renderDonut(chart, segments, 1);
    updateLegendValues(legendValues, segments, 1);
    block.classList.add('is-visible');
  };

  if (!chart || !segments.length || reducedMotion || !('IntersectionObserver' in window)) {
    finishImmediately();
    return;
  }

  renderDonut(chart, segments, 0);
  updateLegendValues(legendValues, segments, 0);

  let hasAnimated = false;
  const observer = new IntersectionObserver((entries) => {
    const isIntersecting = entries.some((entry) => entry.isIntersecting);
    if (!isIntersecting || hasAnimated) return;

    hasAnimated = true;
    block.classList.add('is-visible');

    const start = performance.now();
    const tick = (timestamp) => {
      const elapsed = timestamp - start;
      const rawProgress = Math.min(elapsed / ANIMATION_DURATION, 1);
      const easedProgress = easeOutCubic(rawProgress);

      renderDonut(chart, segments, easedProgress);
      updateLegendValues(legendValues, segments, easedProgress);

      if (rawProgress < 1) {
        window.requestAnimationFrame(tick);
      }
    };

    window.requestAnimationFrame(tick);
    observer.disconnect();
  }, {
    threshold: 0.35,
  });

  observer.observe(block);
}

function collectStatsFromFields(statItems, statValuesField, statLabelsField) {
  if (statItems.length) return statItems;

  const values = normalizeLines(statValuesField.value);
  const labels = normalizeLines(statLabelsField.value);
  const count = Math.max(values.length, labels.length);

  for (let i = 0; i < count; i += 1) {
    if (values[i] || labels[i]) {
      statItems.push({
        type: 'stat',
        value: values[i] || '',
        label: labels[i] || '',
      });
    }
  }

  return statItems;
}

function collectSegmentsFromFields(
  segmentItems,
  segmentValuesField,
  segmentLabelsField,
  segmentColorsField,
) {
  if (segmentItems.length) return segmentItems;

  const values = normalizeLines(segmentValuesField.value);
  const labels = normalizeLines(segmentLabelsField.value);
  const colors = normalizeLines(segmentColorsField.value);
  const count = Math.max(values.length, labels.length);

  for (let i = 0; i < count; i += 1) {
    const numericValue = parseSegmentValue(values[i]);
    if (numericValue) {
      segmentItems.push({
        type: 'segment',
        value: values[i] || '',
        label: labels[i] || '',
        color: colors[i] || DEFAULT_SEGMENT_COLOR,
        numericValue,
      });
    }
  }

  return segmentItems;
}

export default function decorate(block) {
  const headingField = getBlockField(block, 'heading');
  const bodySource = getBlockRichField(block, 'bodyText');
  const primaryButtonTextField = getBlockField(block, 'primaryButtonText');
  const primaryButtonLinkField = getBlockLinkField(block, 'primaryButtonLink');
  const secondaryButtonTextField = getBlockField(block, 'secondaryButtonText');
  const secondaryButtonLinkField = getBlockLinkField(block, 'secondaryButtonLink');
  const surfaceColorField = getBlockField(block, 'surfaceColor');
  const chartTrackColorField = getBlockField(block, 'chartTrackColor');
  const statValuesField = getBlockField(block, 'statValues');
  const statLabelsField = getBlockField(block, 'statLabels');
  const segmentValuesField = getBlockField(block, 'segmentValues');
  const segmentLabelsField = getBlockField(block, 'segmentLabels');
  const segmentColorsField = getBlockField(block, 'segmentColors');

  const rows = [...block.querySelectorAll(':scope > div')];
  const statItems = [];
  const segmentItems = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    const isItemRow = row.querySelector('[data-aue-prop="itemType"]')
      || row.querySelector('[data-aue-prop="value"]')
      || cols.length >= 4;

    if (!isItemRow) return;

    const itemTypeField = getItemField(row, 'itemType', 0);
    const valueField = getItemField(row, 'value', 1);
    const labelField = getItemField(row, 'label', 2);
    const colorField = getItemField(row, 'color', 3);

    const itemType = itemTypeField.value || 'stat';
    const item = {
      type: itemType,
      value: valueField.value,
      label: labelField.value,
      color: colorField.value || DEFAULT_SEGMENT_COLOR,
      row,
    };

    if (!item.value && !item.label) return;

    if (item.type === 'segment') {
      const numericValue = parseSegmentValue(item.value);
      if (!numericValue) return;
      segmentItems.push({
        ...item,
        numericValue,
      });
      return;
    }

    statItems.push(item);
  });

  collectStatsFromFields(statItems, statValuesField, statLabelsField);
  collectSegmentsFromFields(
    segmentItems,
    segmentValuesField,
    segmentLabelsField,
    segmentColorsField,
  );

  const totalSegmentValue = segmentItems.reduce((sum, item) => sum + item.numericValue, 0);
  const segments = totalSegmentValue > 0
    ? segmentItems.map((item) => ({
      ...item,
      percentage: (item.numericValue / totalSegmentValue) * 100,
    }))
    : [];

  const heading = document.createElement('h2');
  heading.className = 'impact-donut-heading';
  heading.textContent = headingField.value;
  if (headingField.source) moveInstrumentation(headingField.source, heading);

  const body = buildRichContent(bodySource, 'impact-donut-body');

  const statsGrid = document.createElement('div');
  statsGrid.className = 'impact-donut-stats';
  statItems.forEach((item, index) => {
    statsGrid.append(buildStatItem(item, index));
  });

  const actions = document.createElement('div');
  actions.className = 'impact-donut-actions impact-donut-reveal';
  const primaryButton = buildButton(primaryButtonTextField, primaryButtonLinkField, 'primary');
  const secondaryButton = buildButton(secondaryButtonTextField, secondaryButtonLinkField, 'secondary');
  if (primaryButton) actions.append(primaryButton);
  if (secondaryButton) actions.append(secondaryButton);

  const copy = document.createElement('div');
  copy.className = 'impact-donut-copy impact-donut-reveal';
  if (headingField.value) copy.append(heading);
  if (body) copy.append(body);
  if (statsGrid.childElementCount) copy.append(statsGrid);
  if (actions.childElementCount) copy.append(actions);

  const chartSide = document.createElement('div');
  chartSide.className = 'impact-donut-chart-side';

  const chartShell = document.createElement('div');
  chartShell.className = 'impact-donut-chart-shell impact-donut-reveal';

  const chart = document.createElement('div');
  chart.className = 'impact-donut-chart';
  const ariaSummary = segments.map((segment) => `${Math.round(segment.percentage)}% ${segment.label}`).join(', ');
  if (ariaSummary) chart.setAttribute('aria-label', ariaSummary);
  chart.setAttribute('role', 'img');

  const chartHole = document.createElement('div');
  chartHole.className = 'impact-donut-chart-hole';
  chart.append(chartHole);
  chartShell.append(chart);
  chartSide.append(chartShell);

  const legend = document.createElement('div');
  legend.className = 'impact-donut-legend';
  const legendValues = [];
  segments.forEach((segment, index) => {
    const legendItem = buildLegendItem(segment, index);
    legend.append(legendItem.item);
    legendValues.push(legendItem.value);
  });
  if (legend.childElementCount) chartSide.append(legend);

  const inner = document.createElement('div');
  inner.className = 'impact-donut-inner';
  inner.append(copy);
  inner.append(chartSide);

  const surfaceColor = surfaceColorField.value || DEFAULT_SURFACE_COLOR;
  const chartTrackColor = chartTrackColorField.value || DEFAULT_TRACK_COLOR;
  block.style.setProperty('--impact-donut-surface', surfaceColor);
  block.style.setProperty('--impact-donut-track', chartTrackColor);

  block.replaceChildren(inner);
  animateChart(block, chart, segments, legendValues);
}
