import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  chartPoints: 2,
  highlightFrom: 3,
  cardsHeading: 4,
  lineColor: 5,
  baseFillColor: 6,
  highlightFillColor: 7,
};

const CARD_COLUMN_INDEX = {
  title: 0,
  bodyText: 1,
  linkText: 2,
  linkUrl: 3,
};

const DEFAULTS = {
  heading: 'Historical Trends',
  subheading:
    'CyberTipline report volume has grown dramatically as more platforms '
    + 'implement reporting and as awareness of online threats increases.',
  cardsHeading: 'Emerging Trends in 2024',
  lineColor: '#0a8fbc',
  baseFillColor: '#d9e8ef',
  highlightFillColor: '#f2c48a',
  chartPoints: [
    { label: '2014', value: 18 },
    { label: '2015', value: 42 },
    { label: '2016', value: 34 },
    { label: '2017', value: 50 },
    { label: '2018', value: 39 },
    { label: '2019', value: 46 },
    { label: '2020', value: 67 },
    { label: '2021', value: 54 },
    { label: '2022', value: 78 },
    { label: '2023', value: 74 },
    { label: '2024', value: 106 },
  ],
};

let chartSequence = 0;

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isTrendCardRow(row) {
  const cols = [...row.children];
  return Boolean(
    row.querySelector('[data-aue-prop="title"]')
      || row.querySelector('[data-aue-prop="bodyText"]')
      || row.querySelector('[data-aue-prop="linkText"]')
      || cols.length >= 4,
  );
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isTrendCardRow(row));
}

function getParentFallbackCell(scope, rowIndex) {
  if (!scope?.classList?.contains('historical-trends')) return null;
  const row = getParentRows(scope)[rowIndex];
  return row?.children?.[0] || row || null;
}

function getField(scope, name, rowIndexMap, columnIndex = 0) {
  const rowIndex = rowIndexMap?.[name];
  const options = {
    rowIndex,
    columnIndex,
    fallbackCell: rowIndexMap === CARD_COLUMN_INDEX
      ? scope.children[columnIndex]
      : getParentFallbackCell(scope, rowIndex),
  };
  const linkField = readLinkField(scope, name, options);
  const textField = readTextField(scope, name, options);
  return {
    source: linkField.source || textField.source || linkField.cell || textField.cell,
    value: linkField.value || textField.value,
  };
}

function getRichField(scope, name, rowIndexMap, columnIndex = 0) {
  const rowIndex = rowIndexMap?.[name];
  const field = readRichTextField(scope, name, {
    rowIndex,
    columnIndex,
    fallbackCell: rowIndexMap === CARD_COLUMN_INDEX
      ? scope.children[columnIndex]
      : getParentFallbackCell(scope, rowIndex),
  });
  return field.source || field.cell;
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

function buildRichContent(source, className) {
  if (!source) return null;

  const content = document.createElement('div');
  content.className = className;
  moveInstrumentation(source, content);
  while (source.firstChild) content.append(source.firstChild);

  return content.childNodes.length ? content : null;
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

function parseNumber(value) {
  const normalized = String(value || '')
    .replace(/,/g, '')
    .replace(/[^0-9.-]+/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseChartPoints(value) {
  if (!value) return [];

  return value.replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.includes('|')
        ? line.split('|', 2)
        : line.split(/[,:;]/, 2);
      const rawLabel = parts[0]?.trim();
      const rawValue = parts[1]?.trim();
      const parsedValue = parseNumber(rawValue);

      if (!rawLabel || !Number.isFinite(parsedValue)) return null;

      return {
        label: rawLabel,
        value: parsedValue,
        order: index,
      };
    })
    .filter(Boolean);
}

function normalizeChartPoints(value) {
  const parsedPoints = parseChartPoints(value);
  return parsedPoints.length >= 2 ? parsedPoints : DEFAULTS.chartPoints;
}

function getHighlightIndex(points, highlightFromValue) {
  const normalized = String(highlightFromValue || '').trim();
  if (!normalized) return Math.max(points.length - 4, 1);

  const exactIndex = points.findIndex((point) => point.label === normalized);
  if (exactIndex >= 0) return exactIndex;

  const numericTarget = parseNumber(normalized);
  if (!Number.isFinite(numericTarget)) return Math.max(points.length - 4, 1);

  const nextIndex = points.findIndex((point) => parseNumber(point.label) >= numericTarget);
  if (nextIndex >= 0) return nextIndex;

  return Math.max(points.length - 4, 1);
}

function getScaledPoints(points, width, height) {
  const topPadding = 28;
  const bottomPadding = 20;
  const leftPadding = 0;
  const rightPadding = 0;
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(maxValue - minValue, 1);
  const lowerBound = Math.max(0, minValue - (valueRange * 0.1));
  const upperBound = maxValue + (valueRange * 0.12);
  const innerWidth = Math.max(width - leftPadding - rightPadding, 1);
  const innerHeight = Math.max(height - topPadding - bottomPadding, 1);

  return points.map((point, index) => {
    const ratio = points.length === 1 ? 0 : index / (points.length - 1);
    const normalizedValue = (point.value - lowerBound) / (upperBound - lowerBound);

    return {
      ...point,
      x: leftPadding + (innerWidth * ratio),
      y: topPadding + ((1 - normalizedValue) * innerHeight),
    };
  });
}

function lineProperties(pointA, pointB) {
  const lengthX = pointB.x - pointA.x;
  const lengthY = pointB.y - pointA.y;

  return {
    length: Math.sqrt((lengthX ** 2) + (lengthY ** 2)),
    angle: Math.atan2(lengthY, lengthX),
  };
}

function controlPoint(current, previous, next, reverse = false) {
  const prev = previous || current;
  const nxt = next || current;
  const smoothing = 0.18;
  const properties = lineProperties(prev, nxt);
  const angle = properties.angle + (reverse ? Math.PI : 0);
  const length = properties.length * smoothing;

  return {
    x: current.x + (Math.cos(angle) * length),
    y: current.y + (Math.sin(angle) * length),
  };
}

function buildLinePath(points) {
  return points.reduce((path, point, index, allPoints) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const startControl = controlPoint(
      allPoints[index - 1],
      allPoints[index - 2],
      point,
    );
    const endControl = controlPoint(
      point,
      allPoints[index - 1],
      allPoints[index + 1],
      true,
    );

    return `${path} C ${startControl.x} ${startControl.y}, `
      + `${endControl.x} ${endControl.y}, ${point.x} ${point.y}`;
  }, '');
}

function buildAreaPath(linePath, points, baselineY) {
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  return `${linePath} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`;
}

function setGradientStops(gradient, color) {
  gradient.append(
    createSvgElement('stop', {
      offset: '0%',
      'stop-color': color,
      'stop-opacity': '0.88',
    }),
    createSvgElement('stop', {
      offset: '66%',
      'stop-color': color,
      'stop-opacity': '0.28',
    }),
    createSvgElement('stop', {
      offset: '100%',
      'stop-color': color,
      'stop-opacity': '0',
    }),
  );
}

function buildChart(points, highlightIndex, palette) {
  const width = 1100;
  const height = 380;
  const baselineY = height - 6;
  const scaledPoints = getScaledPoints(points, width, baselineY);
  const linePath = buildLinePath(scaledPoints);
  const areaPath = buildAreaPath(linePath, scaledPoints, baselineY);
  const highlightPoint = scaledPoints[highlightIndex] || scaledPoints[scaledPoints.length - 1];
  chartSequence += 1;
  const chartId = `historical-trends-${chartSequence}`;
  const svg = createSvgElement('svg', {
    class: 'historical-trends-chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Trend chart from ${points[0].label} to ${points[points.length - 1].label}.`,
  });
  const defs = createSvgElement('defs');
  const baseGradient = createSvgElement('linearGradient', {
    id: `${chartId}-base-gradient`,
    x1: '0',
    y1: '0',
    x2: '0',
    y2: '1',
  });
  const highlightGradient = createSvgElement('linearGradient', {
    id: `${chartId}-highlight-gradient`,
    x1: '0',
    y1: '0',
    x2: '0',
    y2: '1',
  });
  const highlightClip = createSvgElement('clipPath', {
    id: `${chartId}-highlight-clip`,
  });
  const lineDrawClipId = `${chartId}-line-draw-clip`;
  const lineDrawClip = createSvgElement('clipPath', {
    id: lineDrawClipId,
  });
  const lineDrawRect = createSvgElement('rect', {
    class: 'historical-trends-line-draw-rect',
    x: '0',
    y: '0',
    width: `${width}`,
    height: `${height}`,
  });
  lineDrawClip.append(lineDrawRect);
  const clipWidth = Math.max(width - highlightPoint.x, 0);
  const line = createSvgElement('path', {
    class: 'historical-trends-line',
    d: linePath,
    'clip-path': `url(#${lineDrawClipId})`,
  });

  setGradientStops(baseGradient, palette.baseFillColor);
  setGradientStops(highlightGradient, palette.highlightFillColor);

  highlightClip.append(createSvgElement('rect', {
    x: `${highlightPoint.x}`,
    y: '0',
    width: `${clipWidth}`,
    height: `${height}`,
  }));

  defs.append(baseGradient, highlightGradient, highlightClip, lineDrawClip);

  const fillGroup = createSvgElement('g', {
    class: 'historical-trends-fill-group',
  });
  const baseArea = createSvgElement('path', {
    class: 'historical-trends-area historical-trends-area-base',
    d: areaPath,
    fill: `url(#${chartId}-base-gradient)`,
  });
  const highlightArea = createSvgElement('path', {
    class: 'historical-trends-area historical-trends-area-highlight',
    d: areaPath,
    fill: `url(#${chartId}-highlight-gradient)`,
    'clip-path': `url(#${chartId}-highlight-clip)`,
  });

  fillGroup.append(baseArea, highlightArea);
  svg.append(defs, fillGroup, line);

  return { svg, line, points };
}

function buildAxis(points) {
  const axis = document.createElement('div');
  axis.className = 'historical-trends-axis';
  axis.style.setProperty('--historical-trends-axis-columns', points.length);

  points.forEach((point) => {
    const label = document.createElement('span');
    label.className = 'historical-trends-axis-label';
    label.textContent = point.label;
    axis.append(label);
  });

  return axis;
}

function buildCardLink(linkTextField, linkUrlField) {
  if (!linkTextField.value && !linkTextField.source && !linkUrlField.value) return null;

  const link = document.createElement(linkUrlField.value ? 'a' : 'span');
  link.className = 'historical-trends-card-link';

  if (linkUrlField.value) link.href = linkUrlField.value;
  if (linkUrlField.source) moveInstrumentation(linkUrlField.source, link);

  if (linkTextField.source) {
    moveFieldContent(linkTextField, link, linkTextField.value || 'Read More');
  } else {
    link.textContent = linkTextField.value || 'Read More';
  }

  return link;
}

function buildCard(item, index) {
  const card = document.createElement('article');
  card.className = 'historical-trends-card historical-trends-reveal';
  card.style.setProperty('--stagger-index', index + 2);
  if (item.row) moveInstrumentation(item.row, card);

  if (item.isAuthoringPlaceholder) {
    card.classList.add('is-authoring-placeholder');

    const title = document.createElement('h3');
    title.className = 'historical-trends-card-title';
    title.textContent = 'New trend card';

    const body = document.createElement('p');
    body.className = 'historical-trends-card-body';
    body.textContent = 'Add a title, summary, and optional link in Universal Editor.';

    card.append(title, body);
    return card;
  }

  if (item.titleField.value || item.titleField.source) {
    const title = document.createElement('h3');
    title.className = 'historical-trends-card-title';
    moveFieldContent(item.titleField, title, item.titleField.value);
    card.append(title);
  }

  const body = buildRichContent(item.bodySource, 'historical-trends-card-body');
  if (body) card.append(body);

  const link = buildCardLink(item.linkTextField, item.linkUrlField);
  if (link) card.append(link);

  return card;
}

function enableReveal(block) {
  if (!('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.some((entry) => entry.isIntersecting);
    if (!visible) return;

    block.classList.add('is-visible');
    observer.disconnect();
  }, {
    threshold: 0.24,
  });

  observer.observe(block);
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const headingField = getField(block, 'heading', BLOCK_ROW_INDEX);
  const subheadingSource = getRichField(block, 'subheading', BLOCK_ROW_INDEX);
  const chartPointsField = getField(block, 'chartPoints', BLOCK_ROW_INDEX);
  const highlightFromField = getField(block, 'highlightFrom', BLOCK_ROW_INDEX);
  const cardsHeadingField = getField(block, 'cardsHeading', BLOCK_ROW_INDEX);
  const lineColorField = getField(block, 'lineColor', BLOCK_ROW_INDEX);
  const baseFillColorField = getField(block, 'baseFillColor', BLOCK_ROW_INDEX);
  const highlightFillColorField = getField(block, 'highlightFillColor', BLOCK_ROW_INDEX);
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row) => {
    const isItemRow = isTrendCardRow(row);

    if (!isItemRow) return;

    const titleField = getField(row, 'title', CARD_COLUMN_INDEX, CARD_COLUMN_INDEX.title);
    const bodySource = getRichField(row, 'bodyText', CARD_COLUMN_INDEX, CARD_COLUMN_INDEX.bodyText);
    const linkTextField = getField(row, 'linkText', CARD_COLUMN_INDEX, CARD_COLUMN_INDEX.linkText);
    const linkUrlField = getField(row, 'linkUrl', CARD_COLUMN_INDEX, CARD_COLUMN_INDEX.linkUrl);

    if (!titleField.value && !bodySource && !linkTextField.value && !linkUrlField.value) return;

    cards.push({
      titleField,
      bodySource,
      linkTextField,
      linkUrlField,
      row,
    });
  });

  if (!cards.length && isAuthoring) {
    cards.push({ isAuthoringPlaceholder: true });
  }

  const chartPoints = normalizeChartPoints(chartPointsField.value);
  const highlightIndex = getHighlightIndex(chartPoints, highlightFromField.value);
  const palette = {
    lineColor: lineColorField.value || DEFAULTS.lineColor,
    baseFillColor: baseFillColorField.value || DEFAULTS.baseFillColor,
    highlightFillColor: highlightFillColorField.value || DEFAULTS.highlightFillColor,
  };
  block.style.setProperty('--historical-trends-line-color', palette.lineColor);

  const inner = document.createElement('div');
  inner.className = 'historical-trends-inner';

  const header = document.createElement('div');
  header.className = 'historical-trends-header historical-trends-reveal';
  header.style.setProperty('--stagger-index', '0');

  if (headingField.value || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'historical-trends-heading';
    moveFieldContent(headingField, heading, headingField.value || DEFAULTS.heading);
    header.append(heading);
  }

  const subheading = buildRichContent(
    subheadingSource,
    'historical-trends-subheading',
  );
  if (subheading) {
    header.append(subheading);
  } else if (DEFAULTS.subheading) {
    const fallbackSubheading = document.createElement('p');
    fallbackSubheading.className = 'historical-trends-subheading';
    fallbackSubheading.textContent = DEFAULTS.subheading;
    header.append(fallbackSubheading);
  }

  inner.append(header);

  const chartFrame = document.createElement('div');
  chartFrame.className = 'historical-trends-chart-frame historical-trends-reveal';
  chartFrame.style.setProperty('--stagger-index', '0.9');

  const chart = buildChart(chartPoints, highlightIndex, palette);
  chartFrame.append(chart.svg, buildAxis(chart.points));
  inner.append(chartFrame);

  const cardsSection = document.createElement('div');
  cardsSection.className = 'historical-trends-cards-section';

  if (cardsHeadingField.value || cardsHeadingField.source || DEFAULTS.cardsHeading) {
    const cardsHeading = document.createElement('h3');
    cardsHeading.className = 'historical-trends-cards-heading historical-trends-reveal';
    cardsHeading.style.setProperty('--stagger-index', '1.3');
    moveFieldContent(
      cardsHeadingField,
      cardsHeading,
      cardsHeadingField.value || DEFAULTS.cardsHeading,
    );
    cardsSection.append(cardsHeading);
  }

  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'historical-trends-cards';
  cards.forEach((card, index) => {
    cardsGrid.append(buildCard(card, index));
  });
  cardsSection.append(cardsGrid);
  inner.append(cardsSection);

  block.replaceChildren(inner);
  enableReveal(block);
}
