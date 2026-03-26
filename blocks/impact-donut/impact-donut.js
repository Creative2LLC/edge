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
};

const DEFAULT_SEGMENT_COLOR = '#008DB6';
const DEFAULT_SURFACE_COLOR = '#ffffff';
const DEFAULT_TRACK_COLOR = '#edf1f3';
const ANIMATION_DURATION = 1400;

function getBlockField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const source = block.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const row = block.children[rowIndex];
  if (!row) return { source: null, value: '' };

  const cell = row.children[columnIndex] || row;
  return { source: cell, value: cell.textContent.trim() };
}

function getBlockRichField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const source = block.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
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
  const source = row.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const cols = [...row.children];
  if (cols[columnIndex]) return { source: null, value: cols[columnIndex].textContent.trim() };
  return { source: null, value: '' };
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
  if (!labelField.value && !labelField.source && !linkField.value) return null;

  const button = document.createElement(linkField.value ? 'a' : 'span');
  button.className = `impact-donut-button ${variant}`;
  if (linkField.value) button.href = linkField.value;
  if (linkField.source) moveInstrumentation(linkField.source, button);

  if (labelField.source) {
    moveFieldContent(labelField, button, labelField.value || 'Learn More');
  } else {
    button.textContent = labelField.value || 'Learn More';
  }

  return button;
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

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function buildStatItem(item, index) {
  const stat = document.createElement('article');
  stat.className = 'impact-donut-stat impact-donut-reveal';
  stat.style.setProperty('--stagger-index', index);
  if (item.row) moveInstrumentation(item.row, stat);

  if (item.isAuthoringPlaceholder) {
    stat.classList.add('is-authoring-placeholder');
    stat.append(
      buildAuthoringPlaceholder('p', 'impact-donut-placeholder-title', 'New impact stat'),
      buildAuthoringPlaceholder(
        'p',
        'impact-donut-placeholder-body',
        'Add the stat value and label in Universal Editor.',
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
        'Add the segment value, label, and color in Universal Editor.',
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
    const cols = [...row.children];
    const isItemRow = row.querySelector('[data-aue-prop="itemType"]')
      || row.querySelector('[data-aue-prop="value"]')
      || row.querySelector('[data-aue-prop="label"]')
      || cols.length >= 4;

    if (!isItemRow) return;

    const itemTypeField = getItemField(row, 'itemType', 0);
    const valueField = getItemField(row, 'value', 1);
    const labelField = getItemField(row, 'label', 2);
    const colorField = getItemField(row, 'color', 3);
    const itemType = normalizeItemType(itemTypeField.value);
    const hasVisibleContent = Boolean(valueField.value || labelField.value || colorField.value);
    const isAuthoringPlaceholder = hasAuthoringContext(row) && !hasVisibleContent;

    if (!hasVisibleContent && !isAuthoringPlaceholder) return;

    const item = {
      type: itemType,
      value: valueField.value,
      label: labelField.value,
      color: colorField.value || DEFAULT_SEGMENT_COLOR,
      valueField,
      labelField,
      row,
      isAuthoringPlaceholder,
    };

    if (itemType === 'segment') {
      segmentItems.push({
        ...item,
        numericValue: parseSegmentValue(valueField.value),
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

  if (statItems.length || isAuthoring) {
    const statsGrid = document.createElement('div');
    statsGrid.className = 'impact-donut-stats';
    statItems.forEach((item, index) => {
      statsGrid.append(buildStatItem(item, index));
    });

    if (statItems.length) {
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
    const legend = document.createElement('div');
    legend.className = 'impact-donut-legend';
    const legendEntries = [];

    segments.forEach((segment, index) => {
      const legendItem = buildLegendItem(segment, index);
      legend.append(legendItem.item);
      legendEntries.push(legendItem);
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
