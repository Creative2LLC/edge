/* eslint-disable no-use-before-define */
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  bodyText: 1,
  primaryButtonText: 2,
  primaryButtonLink: 3,
  secondaryButtonText: 4,
  secondaryButtonLink: 5,
  surfaceColor: 6,
  chartTrackColor: 7,
};

const DEFAULT_SEGMENT_COLOR = '#008DB6';
const DEFAULT_STAT_COLOR = '#1491bf';
const DEFAULT_SURFACE_COLOR = '#ffffff';
const DEFAULT_TRACK_COLOR = '#edf1f3';
const ANIMATION_DURATION = 1400;

function getBlockField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const field = readTextField(block, name, {
    rowIndex,
    columnIndex,
    fallbackCell: getBlockFallbackCell(block, name),
  });
  return { source: field.source || field.cell, value: field.value };
}

function getBlockRichField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const field = readRichTextField(block, name, {
    rowIndex,
    columnIndex,
    fallbackCell: getBlockFallbackCell(block, name),
  });
  return field.source || field.cell;
}

function getBlockLinkField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const field = readLinkField(block, name, {
    rowIndex,
    columnIndex,
    fallbackCell: getBlockFallbackCell(block, name),
  });
  return { source: field.source || field.cell, value: field.value };
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')].filter((row) => !isImpactItemRow(row));
}

function getParentCells(block) {
  return getParentRows(block)
    .map((row) => row.children[0] || row)
    .filter(Boolean);
}

function getBlockFallbackCell(block, name) {
  const parentCells = getParentCells(block);
  const plainTextCells = parentCells.filter((cell) => {
    const text = cell.textContent.trim();
    return text && !cell.querySelector('a[href]');
  });
  const linkCells = parentCells.filter((cell) => cell.querySelector('a[href]'));
  const colorCells = parentCells.filter((cell) => {
    const value = cell.textContent.trim();
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
  });
  const fallbackMap = {
    heading: plainTextCells[0],
    bodyText: plainTextCells[1],
    primaryButtonText: plainTextCells[2],
    primaryButtonLink: linkCells[0],
    secondaryButtonText: plainTextCells[3],
    secondaryButtonLink: linkCells[1],
    surfaceColor: colorCells[0],
    chartTrackColor: colorCells[1],
  };
  return fallbackMap[name] || null;
}

function getItemField(row, name, columnIndexes) {
  const indexes = Array.isArray(columnIndexes) ? columnIndexes : [columnIndexes];
  const cell = indexes
    .filter((index) => Number.isInteger(index) && index >= 0)
    .map((index) => row.children[index])
    .find(Boolean);
  const field = readTextField(row, name, { fallbackCell: cell });
  return { source: field.source, value: field.value };
}

function hasItemField(row, name) {
  return Boolean(row.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`));
}

function isImpactItemRow(row) {
  const itemType = row.children[0]?.textContent.trim().toLowerCase();
  return itemType === 'stat'
    || itemType === 'segment'
    || hasItemField(row, 'itemType')
    || hasItemField(row, 'value')
    || hasItemField(row, 'label')
    || row.children.length >= 4;
}

function looksLikeColor(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;

  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized)
    || /^(?:rgb|hsl)a?\(/i.test(normalized)
    || /^[a-z]+$/i.test(normalized);
}

function hasExtendedItemFields(row) {
  if (hasItemField(row, 'chartValue') || hasItemField(row, 'displayColor')) return true;

  const cols = [...row.children];
  if (cols.length >= 6) return true;
  if (cols.length <= 4) return false;

  const chartValueCandidate = cols[3]?.textContent.trim() || '';
  const colorCandidate = cols[4]?.textContent.trim() || '';

  return Boolean(colorCandidate || (chartValueCandidate && !looksLikeColor(chartValueCandidate)));
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function buildAuthoringPlaceholder(tagName, className, text) {
  const placeholder = document.createElement(tagName);
  placeholder.className = `${className} ${className}-placeholder`;
  placeholder.textContent = text;
  return placeholder;
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!field?.source || !target) {
    if (!field?.source && fallbackValue) target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
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
  const label = labelField.value.trim();
  const href = linkField.value.trim();

  if (!label) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = `impact-donut-button ${variant}`;
  if (href) button.href = href;
  if (href && linkField.source) moveInstrumentation(linkField.source, button);

  if (labelField.source) {
    moveFieldContent(labelField, button, label);
  } else {
    button.textContent = label;
  }

  return button.textContent.trim() ? button : null;
}

function normalizeItemType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('segment') ? 'segment' : 'stat';
}

function parseSegmentValue(value) {
  const normalized = String(value || '').replace(/[^0-9.]+/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveSegmentNumericValue(chartValue, displayValue) {
  return parseSegmentValue(chartValue || displayValue);
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function buildStatItem(item, index) {
  const stat = document.createElement('article');
  stat.className = 'impact-donut-stat impact-donut-reveal';
  stat.style.setProperty('--stagger-index', index);
  stat.style.setProperty('--impact-donut-stat-color', item.displayColor || DEFAULT_STAT_COLOR);
  if (item.row) moveInstrumentation(item.row, stat);

  if (item.isAuthoringPlaceholder) {
    stat.classList.add('is-authoring-placeholder');
    stat.append(
      buildAuthoringPlaceholder(
        'p',
        'impact-donut-placeholder-title',
        item.placeholderTitle || 'New impact stat',
      ),
      buildAuthoringPlaceholder(
        'p',
        'impact-donut-placeholder-body',
        item.placeholderBody || 'Add the stat value and label in Universal Editor.',
      ),
    );
    return stat;
  }

  if (item.value || item.valueField?.source) {
    const value = document.createElement('div');
    value.className = 'impact-donut-stat-value';
    if (item.valueField?.source) {
      moveFieldContent(item.valueField, value, item.value);
    } else {
      value.textContent = item.value;
    }
    stat.append(value);
  }

  if (item.label || item.labelField?.source) {
    const label = document.createElement('p');
    label.className = 'impact-donut-stat-label';
    if (item.labelField?.source) {
      moveFieldContent(item.labelField, label, item.label);
    } else {
      label.textContent = item.label;
    }
    stat.append(label);
  }

  return stat;
}

function buildLegendItem(segment, index) {
  const item = document.createElement('div');
  item.className = 'impact-donut-legend-item impact-donut-reveal';
  item.style.setProperty('--stagger-index', index + 1);
  if (segment.row) moveInstrumentation(segment.row, item);

  if (segment.isAuthoringPlaceholder) {
    item.classList.add('is-authoring-placeholder');
    item.append(
      buildAuthoringPlaceholder('p', 'impact-donut-placeholder-title', 'New donut segment'),
      buildAuthoringPlaceholder(
        'p',
        'impact-donut-placeholder-body',
        'Add the display value, optional chart value, label, and colors in Universal Editor.',
      ),
    );
    return { item, value: null, segment };
  }

  const value = document.createElement('p');
  value.className = 'impact-donut-legend-value';
  value.style.color = segment.color;
  if (segment.valueField?.source) moveInstrumentation(segment.valueField.source, value);
  value.textContent = '0%';
  item.append(value);

  const label = document.createElement('p');
  label.className = 'impact-donut-legend-label';
  if (segment.labelField?.source) {
    moveFieldContent(segment.labelField, label, segment.label);
  } else {
    label.textContent = segment.label;
  }
  item.append(label);

  return { item, value, segment };
}

function updateLegendValues(legendEntries, progress) {
  legendEntries.forEach(({ value, segment }) => {
    if (!value || segment.isAuthoringPlaceholder) return;
    const percentage = Math.round(segment.percentage * progress);
    value.textContent = `${percentage}%`;
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

function animateChart(block, chart, chartSegments, legendEntries) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finishImmediately = () => {
    renderDonut(chart, chartSegments, 1);
    updateLegendValues(legendEntries, 1);
    block.classList.add('is-visible');
  };

  if (!chart || !chartSegments.length || reducedMotion || !('IntersectionObserver' in window)) {
    finishImmediately();
    return;
  }

  renderDonut(chart, chartSegments, 0);
  updateLegendValues(legendEntries, 0);

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

      renderDonut(chart, chartSegments, easedProgress);
      updateLegendValues(legendEntries, easedProgress);

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

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const headingField = getBlockField(block, 'heading');
  const bodySource = getBlockRichField(block, 'bodyText');
  const primaryButtonTextField = getBlockField(block, 'primaryButtonText');
  const primaryButtonLinkField = getBlockLinkField(block, 'primaryButtonLink');
  const secondaryButtonTextField = getBlockField(block, 'secondaryButtonText');
  const secondaryButtonLinkField = getBlockLinkField(block, 'secondaryButtonLink');
  const surfaceColorField = getBlockField(block, 'surfaceColor');
  const chartTrackColorField = getBlockField(block, 'chartTrackColor');

  const rows = [...block.querySelectorAll(':scope > div')];
  const statItems = [];
  const segmentItems = [];

  rows.forEach((row) => {
    if (!isImpactItemRow(row)) return;

    const usesExtendedFields = hasExtendedItemFields(row);
    const itemTypeField = getItemField(row, 'itemType', 0);
    const valueField = getItemField(row, 'value', 1);
    const labelField = getItemField(row, 'label', 2);
    const chartValueField = usesExtendedFields
      ? getItemField(row, 'chartValue', 3)
      : { source: null, value: '' };
    const colorField = getItemField(row, 'color', usesExtendedFields ? 4 : 3);
    const displayColorField = usesExtendedFields
      ? getItemField(row, 'displayColor', 5)
      : { source: null, value: '' };
    const itemType = normalizeItemType(itemTypeField.value);
    const hasVisibleContent = Boolean(
      valueField.value
        || labelField.value
        || chartValueField.value
        || colorField.value
        || displayColorField.value,
    );
    const isAuthoringPlaceholder = hasAuthoringContext(row) && !hasVisibleContent;

    if (!hasVisibleContent && !isAuthoringPlaceholder) return;

    const item = {
      type: itemType,
      value: valueField.value,
      label: labelField.value,
      color: colorField.value || DEFAULT_SEGMENT_COLOR,
      displayColor: displayColorField.value || '',
      chartValue: chartValueField.value,
      valueField,
      labelField,
      chartValueField,
      row,
      isAuthoringPlaceholder,
    };

    if (itemType === 'segment') {
      segmentItems.push({
        ...item,
        numericValue: resolveSegmentNumericValue(chartValueField.value, valueField.value),
      });
      return;
    }

    statItems.push(item);
  });

  const totalSegmentValue = segmentItems.reduce((sum, item) => (
    item.isAuthoringPlaceholder ? sum : sum + item.numericValue
  ), 0);

  const segments = segmentItems.map((item) => ({
    ...item,
    percentage: totalSegmentValue > 0 ? (item.numericValue / totalSegmentValue) * 100 : 0,
  }));

  const chartSegments = segments.filter(
    (segment) => !segment.isAuthoringPlaceholder && segment.percentage > 0,
  );
  const useSegmentStats = !statItems.length && segmentItems.length > 0;
  const displayStats = useSegmentStats
    ? segments.map((segment) => ({
      ...segment,
      displayColor: segment.displayColor || segment.color,
      placeholderTitle: 'New donut segment',
      placeholderBody: 'Add the display value, chart value, label, and color in Universal Editor.',
    }))
    : statItems;
  const showLegend = !useSegmentStats && (segmentItems.length || isAuthoring);

  const copy = document.createElement('div');
  copy.className = 'impact-donut-copy impact-donut-reveal';

  if (headingField.value || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'impact-donut-heading';
    if (headingField.source) {
      moveFieldContent(headingField, heading, headingField.value);
    } else {
      heading.textContent = headingField.value;
    }
    copy.append(heading);
  }

  const body = buildRichContent(bodySource, 'impact-donut-body');
  if (body) copy.append(body);

  if (displayStats.length || isAuthoring) {
    const statsGrid = document.createElement('div');
    statsGrid.className = 'impact-donut-stats';

    if (useSegmentStats) {
      const columns = displayStats.length === 3 ? 3 : Math.min(Math.max(displayStats.length, 1), 2);
      statsGrid.classList.add('is-segment-source');
      if (columns === 3) statsGrid.classList.add('is-three-up');
      statsGrid.style.setProperty('--impact-donut-stat-columns', `${columns}`);
    }

    displayStats.forEach((item, index) => {
      statsGrid.append(buildStatItem(item, index));
    });

    if (displayStats.length) {
      copy.append(statsGrid);
    }
  }

  const actions = document.createElement('div');
  actions.className = 'impact-donut-actions impact-donut-reveal';
  const primaryButton = buildButton(primaryButtonTextField, primaryButtonLinkField, 'primary');
  const secondaryButton = buildButton(secondaryButtonTextField, secondaryButtonLinkField, 'secondary');
  if (primaryButton) actions.append(primaryButton);
  if (secondaryButton) actions.append(secondaryButton);
  if (actions.childElementCount) copy.append(actions);

  const chartSide = document.createElement('div');
  chartSide.className = 'impact-donut-chart-side';

  const chartShell = document.createElement('div');
  chartShell.className = 'impact-donut-chart-shell impact-donut-reveal';

  const chart = document.createElement('div');
  chart.className = 'impact-donut-chart';
  const ariaSummary = chartSegments
    .map((segment) => `${Math.round(segment.percentage)}% ${segment.label}`)
    .join(', ');
  if (ariaSummary) chart.setAttribute('aria-label', ariaSummary);
  chart.setAttribute('role', 'img');

  const chartHole = document.createElement('div');
  chartHole.className = 'impact-donut-chart-hole';
  chart.append(chartHole);
  chartShell.append(chart);
  chartSide.append(chartShell);

  if (segmentItems.length || isAuthoring) {
    const legendEntries = [];

    if (showLegend) {
      const legend = document.createElement('div');
      legend.className = 'impact-donut-legend';

      segments.forEach((segment, index) => {
        const legendItem = buildLegendItem(segment, index);
        legend.append(legendItem.item);
        legendEntries.push(legendItem);
      });

      if (legend.childElementCount) chartSide.append(legend);
    }

    const inner = document.createElement('div');
    inner.className = 'impact-donut-inner';
    inner.append(copy);
    inner.append(chartSide);

    const surfaceColor = surfaceColorField.value || DEFAULT_SURFACE_COLOR;
    const chartTrackColor = chartTrackColorField.value || DEFAULT_TRACK_COLOR;
    block.style.setProperty('--impact-donut-surface', surfaceColor);
    block.style.setProperty('--impact-donut-track', chartTrackColor);

    block.replaceChildren(inner);
    animateChart(block, chart, chartSegments, legendEntries);
    return;
  }

  const inner = document.createElement('div');
  inner.className = 'impact-donut-inner';
  inner.append(copy);
  inner.append(chartSide);

  const surfaceColor = surfaceColorField.value || DEFAULT_SURFACE_COLOR;
  const chartTrackColor = chartTrackColorField.value || DEFAULT_TRACK_COLOR;
  block.style.setProperty('--impact-donut-surface', surfaceColor);
  block.style.setProperty('--impact-donut-track', chartTrackColor);

  block.replaceChildren(inner);
  animateChart(block, chart, chartSegments, []);
}
