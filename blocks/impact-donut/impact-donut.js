/* eslint-disable no-use-before-define */
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import {
  applyButtonStyle,
  isDarkSurface,
  markButtonSurface,
  readAppendedStyles,
  takeAppendedStyleCells,
} from '../../scripts/button-utils.js';
import createChartTooltip, { formatChartShare } from '../../scripts/chart-tooltip.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  bodyText: 1,
  primaryButtonText: 2,
  primaryButtonLink: 3,
  secondaryButtonText: 4,
  secondaryButtonLink: 5,
  surfaceColor: 6,
  chartTrackColor: 7,
  textMode: 8,
};

const DEFAULT_SEGMENT_COLOR = '#008EB7';
const DEFAULT_SURFACE_COLOR = '#ffffff';
const DEFAULT_TRACK_COLOR = '#edf1f3';
const ANIMATION_DURATION = 1400;
// The donut hole is inset 22% of the chart's width, so the ring starts at 56% of its radius.
const RING_INNER_RATIO = 0.56;
// How much of its own colour a segment keeps while another one is highlighted.
const DIMMED_SEGMENT_MIX = 30;

function normalizeTextMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'light' ? 'light' : 'dark';
}

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

function buildRichContent(source, className, tag = 'div') {
  if (!source) return null;

  const content = document.createElement(tag);
  content.className = className;
  moveInstrumentation(source, content);
  while (source.firstChild) content.append(source.firstChild);

  return content.childNodes.length ? content : null;
}

function buildButton(labelField, linkField, style, isAuthoring) {
  const label = labelField.value.trim();
  const href = linkField.value.trim();

  if (!label) return null;
  // A button with nowhere to go is not published. In the editor it still shows,
  // disabled, so the author can see the link is missing.
  if (!href && !isAuthoring) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = 'impact-donut-button';
  if (href) {
    button.href = href;
  } else {
    button.setAttribute('aria-disabled', 'true');
    button.title = 'Add a link to publish this button';
  }
  if (href && linkField.source) moveInstrumentation(linkField.source, button);

  if (labelField.source) {
    moveFieldContent(labelField, button, label);
  } else {
    button.textContent = label;
  }

  if (!button.textContent.trim()) return null;
  // The look comes from the button standard.
  return applyButtonStyle(button, style);
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

// A swatch in a segment's own colour. The arcs can wear any colour, text can't: darkening
// the colour until the number read as text left "33M+" brown beside a peach arc, so the
// number takes the block's ink and this mark carries the colour-coding instead.
function buildColorKey(color, className) {
  const key = document.createElement('span');
  key.className = `impact-donut-key ${className}`;
  key.setAttribute('aria-hidden', 'true');
  key.style.setProperty('--impact-donut-key-color', color);
  return key;
}

function buildStatItem(item, index) {
  const stat = document.createElement('article');
  stat.className = 'impact-donut-stat impact-donut-reveal';
  stat.style.setProperty('--stagger-index', index);
  if (item.segmentKey !== undefined) stat.dataset.segmentKey = item.segmentKey;
  if (item.row) moveInstrumentation(item.row, stat);
  setItemLabel(stat, [item.label]);

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

  if (item.displayColor) {
    stat.classList.add('has-key');
    stat.append(buildColorKey(item.displayColor, 'impact-donut-stat-key'));
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
  item.dataset.segmentKey = segment.segmentKey;
  if (segment.row) moveInstrumentation(segment.row, item);
  setItemLabel(item, [segment.label]);

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

  // The percentage is text, so it takes the block's ink; the swatch beside it matches the arc.
  const value = document.createElement('p');
  value.className = 'impact-donut-legend-value';
  if (segment.valueField?.source) moveInstrumentation(segment.valueField.source, value);
  value.textContent = '0%';
  const valueRow = document.createElement('div');
  valueRow.className = 'impact-donut-legend-value-row';
  valueRow.append(buildColorKey(segment.color, 'impact-donut-legend-key'), value);
  item.append(valueRow);

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

function renderDonut(chart, segments, progress, activeKey = null) {
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const revealedAngle = 360 * clampedProgress;
  const gradientStops = [];
  let startAngle = 0;

  segments.forEach((segment) => {
    const segmentAngle = 360 * (segment.percentage / 100);
    const visibleEnd = Math.min(startAngle + segmentAngle, revealedAngle);
    if (visibleEnd > startAngle) {
      // While one segment is highlighted the rest fade toward the surface, so the hovered
      // arc keeps its exact colour and still matches its swatch.
      const color = activeKey === null || segment.segmentKey === activeKey
        ? segment.color
        : `color-mix(in srgb, ${segment.color} ${DIMMED_SEGMENT_MIX}%, var(--impact-donut-surface))`;
      gradientStops.push(`${color} ${startAngle}deg ${visibleEnd}deg`);
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

function animateChart(block, chart, chartSegments, legendEntries, onComplete = () => {}) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finishImmediately = () => {
    renderDonut(chart, chartSegments, 1);
    updateLegendValues(legendEntries, 1);
    block.classList.add('is-visible');
    onComplete();
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
      } else {
        onComplete();
      }
    };

    window.requestAnimationFrame(tick);
    observer.disconnect();
  }, {
    threshold: 0.35,
  });

  observer.observe(block);
}

/**
 * Hover and keyboard highlighting for the donut. Pointing at an arc, or at its legend
 * entry or stat, dims the other arcs and shows the segment's value beside it. The chart is
 * one tab stop; the arrow keys step through the segments.
 */
function enableSegmentHighlight(block, chart, chartShell, chartSegments) {
  if (!chartSegments.length) return;

  const bounds = [];
  chartSegments.reduce((start, segment) => {
    const end = start + (360 * (segment.percentage / 100));
    bounds.push({ segment, start, end });
    return end;
  }, 0);

  const tooltip = createChartTooltip(chartShell);
  let activeKey = null;

  const linkedItems = (key) => block.querySelectorAll(
    `.impact-donut-legend-item[data-segment-key="${key}"], .impact-donut-stat[data-segment-key="${key}"]`,
  );

  const showTooltip = ({ segment, start, end }) => {
    const chartRect = chart.getBoundingClientRect();
    const shellRect = chartShell.getBoundingClientRect();
    const radius = chartRect.width / 2;
    // The gradient starts at 9 o'clock (the chart is turned -90deg), so a gradient angle g
    // sits at g - 90 measured clockwise from 12 o'clock on screen.
    const screenAngle = (((start + end) / 2) - 90) * (Math.PI / 180);
    const ringMiddle = radius * ((1 + RING_INNER_RATIO) / 2);
    const x = chartRect.left - shellRect.left + radius + (ringMiddle * Math.sin(screenAngle));
    const y = chartRect.top - shellRect.top + radius - (ringMiddle * Math.cos(screenAngle));
    const percentLabel = formatChartShare(segment.percentage, 100);
    // A display value such as "33M+" does not say how big the arc is; the share does.
    tooltip.show({
      value: segment.value || percentLabel,
      label: segment.label || 'Segment',
      color: segment.color,
      detail: segment.value && segment.value !== percentLabel ? `${percentLabel} of total` : '',
    }, x, y);
  };

  const setActive = (key) => {
    if (key === activeKey) return;
    if (activeKey !== null) {
      linkedItems(activeKey).forEach((item) => item.classList.remove('is-active'));
    }
    activeKey = key;
    block.classList.toggle('has-active-segment', key !== null);
    renderDonut(chart, chartSegments, 1, key);

    const entry = bounds.find(({ segment }) => segment.segmentKey === key);
    if (!entry) {
      tooltip.hide();
      return;
    }
    linkedItems(key).forEach((item) => item.classList.add('is-active'));
    showTooltip(entry);
  };

  const keyAtPoint = (clientX, clientY) => {
    const rect = chart.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = clientX - (rect.left + radius);
    const dy = clientY - (rect.top + radius);
    const distance = Math.hypot(dx, dy) / radius;
    if (distance < RING_INNER_RATIO || distance > 1) return null;
    const screenAngle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const gradientAngle = (screenAngle + 90) % 360;
    const hit = bounds.find(({ start, end }) => gradientAngle >= start && gradientAngle < end);
    return hit ? hit.segment.segmentKey : null;
  };

  chart.addEventListener('pointermove', (event) => setActive(keyAtPoint(event.clientX, event.clientY)));
  chart.addEventListener('pointerdown', (event) => setActive(keyAtPoint(event.clientX, event.clientY)));
  chart.addEventListener('pointerleave', () => setActive(null));

  block.querySelectorAll('.impact-donut-legend-item[data-segment-key], .impact-donut-stat[data-segment-key]')
    .forEach((item) => {
      const key = Number(item.dataset.segmentKey);
      if (!bounds.some(({ segment }) => segment.segmentKey === key)) return;
      item.classList.add('is-linked');
      item.addEventListener('pointerenter', () => setActive(key));
      item.addEventListener('pointerleave', () => setActive(null));
    });

  chart.tabIndex = 0;
  chart.addEventListener('focus', () => {
    if (activeKey === null) setActive(bounds[0].segment.segmentKey);
  });
  chart.addEventListener('blur', () => setActive(null));
  chart.addEventListener('keydown', (event) => {
    const step = {
      ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
    }[event.key];
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (!step) return;
    event.preventDefault();
    const current = bounds.findIndex(({ segment }) => segment.segmentKey === activeKey);
    const next = (current + step + bounds.length) % bounds.length;
    setActive(bounds[next].segment.segmentKey);
  });
}

export default function decorate(block) {
  // Appended style dropdowns come out of the published markup first; see button-utils.
  takeAppendedStyleCells(block);
  // Style dropdowns appended to the model; read before any row is consumed.
  const [primaryButtonStyle, secondaryButtonStyle] = readAppendedStyles(
    block,
    ['primaryButtonStyle', 'secondaryButtonStyle'],
    [...block.children].filter((row) => !isImpactItemRow(row)),
  );
  const isAuthoring = hasAuthoringContext(block);
  const headingSource = getBlockRichField(block, 'heading');
  const bodySource = getBlockRichField(block, 'bodyText');
  const primaryButtonTextField = getBlockField(block, 'primaryButtonText');
  const primaryButtonLinkField = getBlockLinkField(block, 'primaryButtonLink');
  const secondaryButtonTextField = getBlockField(block, 'secondaryButtonText');
  const secondaryButtonLinkField = getBlockLinkField(block, 'secondaryButtonLink');
  const surfaceColorField = getBlockField(block, 'surfaceColor');
  const surfaceColor = surfaceColorField.value || DEFAULT_SURFACE_COLOR;
  const chartTrackColorField = getBlockField(block, 'chartTrackColor');
  const textModeField = getBlockField(block, 'textMode');

  block.classList.toggle('impact-donut-text-light', normalizeTextMode(textModeField.value) === 'light');

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

  const segments = segmentItems.map((item, index) => ({
    ...item,
    segmentKey: index,
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

  const copyIntro = document.createElement('div');
  copyIntro.className = 'impact-donut-copy-intro';

  const heading = buildRichContent(headingSource, 'impact-donut-heading', 'h2');
  if (heading) {
    copyIntro.append(heading);
  }

  const body = buildRichContent(bodySource, 'impact-donut-body');
  if (body) copyIntro.append(body);
  if (copyIntro.childElementCount) copy.append(copyIntro);

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
  const primaryButton = buildButton(
    primaryButtonTextField,
    primaryButtonLinkField,
    primaryButtonStyle || 'primary',
    isAuthoring,
  );
  const secondaryButton = buildButton(
    secondaryButtonTextField,
    secondaryButtonLinkField,
    secondaryButtonStyle || 'secondary',
    isAuthoring,
  );
  if (primaryButton) actions.append(primaryButton);
  if (secondaryButton) actions.append(secondaryButton);
  // Light text means the author chose a dark surface; the buttons follow it.
  const actionsOnDark = block.classList.contains('impact-donut-text-light')
    || isDarkSurface(surfaceColorField.value);
  markButtonSurface(actions, actionsOnDark);
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

      // Legend above the donut at every width: it reads better, and putting it
      // first in the DOM (rather than reordering in CSS) keeps the visual order
      // and the screen-reader order the same.
      if (legend.childElementCount) chartSide.prepend(legend);
    }

    const inner = document.createElement('div');
    inner.className = 'impact-donut-inner';
    inner.append(copy);
    inner.append(chartSide);

    const chartTrackColor = chartTrackColorField.value || DEFAULT_TRACK_COLOR;
    block.style.setProperty('--impact-donut-surface', surfaceColor);
    block.style.setProperty('--impact-donut-track', chartTrackColor);

    block.replaceChildren(inner);
    animateChart(block, chart, chartSegments, legendEntries, () => {
      enableSegmentHighlight(block, chart, chartShell, chartSegments);
    });
    return;
  }

  const inner = document.createElement('div');
  inner.className = 'impact-donut-inner';
  inner.append(copy);
  inner.append(chartSide);

  const chartTrackColor = chartTrackColorField.value || DEFAULT_TRACK_COLOR;
  block.style.setProperty('--impact-donut-surface', surfaceColor);
  block.style.setProperty('--impact-donut-track', chartTrackColor);

  block.replaceChildren(inner);
  animateChart(block, chart, chartSegments, [], () => {
    enableSegmentHighlight(block, chart, chartShell, chartSegments);
  });
}
