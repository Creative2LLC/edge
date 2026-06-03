import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { animateCountUp, animateCountUpOnVisible } from '../../scripts/count-up.js';
import { buildMap, STATE_NAMES } from '../us-map/us-map.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  intro: 1,
  apiBaseUrl: 2,
  year: 3,
  datasetSlug: 4,
  geoType: 5,
  emptyMessage: 6,
  sampleDataMode: 7,
};

const ITEM_COLUMN_INDEX = {
  label: 0,
  code: 1,
  value: 2,
  description: 3,
  color: 4,
};

const DEFAULTS = {
  heading: 'CyberTipline Reports by Geography',
  datasetSlug: 'domestic-state-reports',
  geoType: 'state',
  emptyMessage: 'No CyberTipline geography data is available.',
};

const STATE_CODES = new Set(Object.keys(STATE_NAMES));

const SAMPLE_STATE_ROWS = [
  ['California', 'CA', 189278, 49294],
  ['Texas', 'TX', 114980, 27780],
  ['Florida', 'FL', 94320, 25560],
  ['New York', 'NY', 67580, 16670],
  ['Pennsylvania', 'PA', 36164, 29775],
  ['Illinois', 'IL', 51420, 12370],
  ['Arizona', 'AZ', 39016, 9657],
  ['Ohio', 'OH', 42180, 9060],
  ['Georgia', 'GA', 39260, 9520],
  ['North Carolina', 'NC', 36240, 8880],
  ['Michigan', 'MI', 30940, 8900],
  ['Washington', 'WA', 27180, 6100],
  ['Alabama', 'AL', 14358, 16839],
  ['Colorado', 'CO', 22409, 7584],
  ['Connecticut', 'CT', 12719, 2655],
  ['Delaware', 'DE', 3849, 2088],
  ['District of Columbia', 'DC', 147, 0],
];

const SAMPLE_COUNTRY_ROWS = [
  ['United States', 'US', 512480],
  ['Philippines', 'PH', 145230],
  ['India', 'IN', 118620],
  ['United Kingdom', 'GB', 92440],
  ['Brazil', 'BR', 87310],
  ['Canada', 'CA', 64180],
  ['Mexico', 'MX', 58290],
  ['Australia', 'AU', 41950],
  ['Germany', 'DE', 33210],
  ['France', 'FR', 28760],
];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeToken(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function normalizeSampleDataMode(value) {
  const normalized = normalizeToken(value);
  if (['always', 'alwaysusesample', 'force', 'forced', 'on'].includes(normalized)) return 'always';
  if (['when-empty', 'whenempty', 'usewhenempty', 'fallback', 'fallback-only'].includes(normalized)) return 'when-empty';
  return 'off';
}

function normalizeGeoType(value) {
  const normalized = normalizeToken(value);
  if (['country', 'countryglobal', 'global', 'world'].includes(normalized)) return 'country';
  if (['auto'].includes(normalized)) return 'auto';
  return normalized || DEFAULTS.geoType;
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value || '').replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return '';
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: Number(value) % 1 === 0 ? 0 : 1,
  });
}

function fieldValue(block, name, rowIndex, labels = []) {
  const field = readTextField(block, name, {
    rowIndex,
    labels,
  });

  return {
    source: field.source || field.cell,
    value: field.value,
  };
}

function richField(block, name, rowIndex, labels = []) {
  const field = readRichTextField(block, name, {
    rowIndex,
    labels,
  });

  return {
    source: field.source || field.cell,
    html: field.html,
    text: field.text,
  };
}

function moveField(field, target, fallback = '') {
  if (!target) return;

  if (field?.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
  }

  if (!target.childNodes.length && fallback) {
    target.textContent = fallback;
  }
}

function isItemRow(row) {
  const cols = [...row.children];
  return Boolean(
    row.querySelector('[data-aue-prop="label"]')
      || row.querySelector('[data-aue-prop="value"]')
      || row.querySelector('[data-aue-prop="geoCode"]')
      || cols.length >= 5,
  );
}

function itemValue(row, name, columnIndex) {
  const field = readTextField(row, name, {
    columnIndex,
    fallbackCell: row.children[columnIndex],
  });

  return field.value;
}

function normalizeRow(row, index = 0) {
  const value = parseNumber(row?.value ?? row?.count ?? row?.reports);
  const label = normalizeText(row?.label || row?.name || row?.state || row?.country);
  const rawCode = normalizeText(row?.geo_code || row?.code || row?.abbr || row?.abbreviation);
  const code = rawCode.toUpperCase();

  if (!label || !Number.isFinite(value)) return null;

  return {
    id: row?.id || `${code || label}-${index}`,
    label,
    code,
    geoType: normalizeToken(row?.geo_type || row?.geoType || ''),
    geoCode: code,
    value,
    displayValue: normalizeText(row?.display_value || row?.displayValue) || formatNumber(value),
    values: row?.values && typeof row.values === 'object' ? row.values : {},
    description: normalizeText(row?.description || row?.summary),
    color: normalizeText(row?.color),
    sortOrder: Number.isFinite(Number(row?.sort_order ?? row?.order))
      ? Number(row?.sort_order ?? row?.order)
      : index,
  };
}

function authoredRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter(isItemRow)
    .map((row, index) => {
      const label = itemValue(row, 'label', ITEM_COLUMN_INDEX.label);
      const code = itemValue(row, 'code', ITEM_COLUMN_INDEX.code);
      const value = parseNumber(itemValue(row, 'value', ITEM_COLUMN_INDEX.value));
      const description = itemValue(row, 'description', ITEM_COLUMN_INDEX.description);
      const color = itemValue(row, 'color', ITEM_COLUMN_INDEX.color);

      if (!label || !Number.isFinite(value)) return null;

      return normalizeRow({
        label,
        code,
        geo_code: code,
        value,
        display_value: formatNumber(value),
        description,
        color,
        sort_order: index,
      }, index);
    })
    .filter(Boolean);
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => normalizeRow(row, index))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.value - a.value;
    });
}

function datasetFromPayload(payload, datasetSlug) {
  const data = payload?.data || payload || {};
  const matchingDataset = data.datasets?.find?.((entry) => entry.slug === datasetSlug);
  const dataset = data.dataset || matchingDataset || data;

  return {
    report: data.report || {
      year: data.year,
      title: data.title,
    },
    dataset: {
      slug: dataset?.slug || datasetSlug,
      title: dataset?.title || '',
      description: dataset?.description || '',
      type: dataset?.type || '',
      geoScope: dataset?.geo_scope || dataset?.geoScope || '',
      columns: Array.isArray(dataset?.columns) ? dataset.columns : [],
      totals: dataset?.totals || {},
      metadata: dataset?.metadata || {},
      rows: normalizeRows(dataset?.rows || dataset?.data || []),
    },
  };
}

function sampleRows(entries, geoType) {
  return normalizeRows(entries.map(([label, code, firstValue, secondValue], index) => {
    const hasBreakdown = Number.isFinite(Number(secondValue));
    const referrals = hasBreakdown ? Number(firstValue) : null;
    const informational = hasBreakdown ? Number(secondValue) : null;
    const value = hasBreakdown ? referrals + informational : Number(firstValue);

    return {
      label,
      code,
      geo_code: code,
      geo_type: geoType,
      value,
      display_value: formatNumber(value),
      values: hasBreakdown ? {
        referrals,
        informational,
      } : {},
      description: 'Sample data for map and chart testing. Replace with published CyberTipline report data before launch.',
      sort_order: index,
    };
  }));
}

function sampleDatasetForConfig(config) {
  const isCountry = config.geoType === 'country'
    || config.datasetSlug.includes('country')
    || config.datasetSlug.includes('global');
  const rows = sampleRows(isCountry ? SAMPLE_COUNTRY_ROWS : SAMPLE_STATE_ROWS, isCountry ? 'country' : 'state');
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return {
    report: {
      year: config.year || 'Sample',
      title: 'Sample CyberTipline Report',
    },
    dataset: {
      slug: config.datasetSlug,
      title: isCountry ? 'Sample Global Reports by Country' : 'Sample Domestic Reports by State',
      description: 'Sample data is enabled for block testing while the CyberTipline API has no published dataset.',
      type: isCountry ? 'bar' : 'map',
      geoScope: isCountry ? 'global' : 'us',
      columns: [],
      totals: {
        value: total,
        display_value: formatNumber(total),
      },
      metadata: {
        map_caption: 'Sample data. Hover or select a state to test the interaction model.',
      },
      rows,
    },
  };
}

async function fetchDataset(config) {
  if (!config.apiBaseUrl || !config.datasetSlug) return null;

  const requestFailed = async (response, endpoint) => {
    let body = '';
    try {
      body = await response.text();
    } catch (e) {
      body = '';
    }

    return {
      error: {
        status: response.status,
        endpoint: endpoint.toString(),
        body: body.slice(0, 500),
      },
    };
  };

  try {
    if (config.year) {
      const endpointPath = [
        '/api/cybertipline-reports',
        encodeURIComponent(config.year),
        'datasets',
        encodeURIComponent(config.datasetSlug),
      ].join('/');
      const endpoint = new URL(
        endpointPath,
        `${config.apiBaseUrl}/`,
      );
      if (config.geoType && config.geoType !== 'auto') {
        endpoint.searchParams.set('geo_type', config.geoType);
      }

      const response = await fetch(endpoint.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return requestFailed(response, endpoint);

      return datasetFromPayload(await response.json(), config.datasetSlug);
    }

    const endpoint = new URL('/api/cybertipline-reports/current', `${config.apiBaseUrl}/`);
    const response = await fetch(endpoint.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return requestFailed(response, endpoint);

    return datasetFromPayload(await response.json(), config.datasetSlug);
  } catch (error) {
    return {
      error: {
        status: 0,
        endpoint: config.apiBaseUrl,
        body: error?.message || 'CyberTipline data request failed.',
      },
    };
  }
}

function exposeFetchError(block, error) {
  if (!error) return;

  block.dataset.cybertiplineGeoReportError = [
    error.status ? `status=${error.status}` : '',
    error.endpoint ? `url=${error.endpoint}` : '',
  ].filter(Boolean).join(' ');

  // eslint-disable-next-line no-console
  console.warn('[cybertipline-geo-report] API request failed.', error);
}

function buildHeader(headingField, introField, dataset, report) {
  const header = document.createElement('div');
  header.className = 'cybertipline-geo-report-header';

  const kicker = document.createElement('p');
  kicker.className = 'cybertipline-geo-report-kicker';
  kicker.textContent = report?.year ? `${report.year} CyberTipline data` : 'CyberTipline data';

  const heading = document.createElement('h2');
  heading.className = 'cybertipline-geo-report-heading';
  moveField(headingField, heading, headingField.value || dataset.title || DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'cybertipline-geo-report-intro';
  moveField(introField, intro, introField.text || dataset.description || '');

  header.append(kicker, heading);
  if (intro.childNodes.length) header.append(intro);

  return header;
}

const BREAKDOWN_METRICS = [
  {
    key: 'referrals',
    label: 'Referrals',
    aliases: ['referrals', 'referral', 'referralreports'],
  },
  {
    key: 'informational',
    label: 'Informational',
    aliases: ['informational', 'information', 'informationalreports', 'informationreports'],
  },
];

function labelFromMetricKey(key) {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metricValue(row, metric) {
  const values = row?.values || {};
  const aliases = new Set(metric.aliases.map(normalizeToken));
  const entry = Object.entries(values).find(([key]) => aliases.has(normalizeToken(key)));
  if (!entry) return null;

  const numericValue = parseNumber(entry[1]);
  return {
    key: metric.key,
    label: metric.label,
    value: numericValue,
    displayValue: Number.isFinite(numericValue)
      ? formatNumber(numericValue)
      : normalizeText(entry[1]),
  };
}

function rowBreakdownEntries(row) {
  return BREAKDOWN_METRICS
    .map((metric) => metricValue(row, metric))
    .filter((entry) => entry && entry.displayValue !== '');
}

function rowTotalEntry(row) {
  return {
    key: 'total',
    label: 'Total',
    value: row?.value,
    displayValue: row?.displayValue || formatNumber(row?.value),
  };
}

function rowMetaEntries(row) {
  return Object.entries(row.values || {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .slice(0, 4)
    .map(([key, value]) => ({
      label: labelFromMetricKey(key),
      value: Number.isFinite(parseNumber(value)) ? formatNumber(parseNumber(value)) : String(value),
    }));
}

function totalDisplay(dataset) {
  const totals = dataset?.totals || {};
  const value = totals.display_value
    || totals.displayValue
    || totals.reports
    || totals.total
    || totals.value;

  return Number.isFinite(Number(value)) ? formatNumber(value) : normalizeText(value);
}

function totalMetaEntries(dataset) {
  return Object.entries(dataset?.totals || {})
    .filter(([key]) => !['display_value', 'displayValue'].includes(key))
    .slice(0, 4)
    .map(([key, value]) => ({
      label: key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      value: Number.isFinite(Number(value)) ? formatNumber(value) : String(value),
    }));
}

function renderDetail(panel, row, dataset, animate = false) {
  panel.replaceChildren();

  const eyebrow = document.createElement('p');
  eyebrow.className = 'cybertipline-geo-report-detail-eyebrow';
  eyebrow.textContent = row ? 'Selected geography' : 'Hover or select a location';

  const title = document.createElement('h3');
  title.className = 'cybertipline-geo-report-detail-title';
  title.textContent = row?.label || dataset.title || 'Geography data';

  const value = document.createElement('strong');
  value.className = 'cybertipline-geo-report-detail-value';
  value.textContent = row?.displayValue || totalDisplay(dataset) || '';

  const body = document.createElement('p');
  body.className = 'cybertipline-geo-report-detail-body';
  body.textContent = row?.description
    || dataset.description
    || 'Select a row or map location to view the report count and supporting details.';

  panel.append(eyebrow, title);
  if (value.textContent) panel.append(value);
  panel.append(body);

  const metaEntries = row ? rowMetaEntries(row) : totalMetaEntries(dataset);
  if (metaEntries.length) {
    const meta = document.createElement('dl');
    meta.className = 'cybertipline-geo-report-detail-meta';
    metaEntries.forEach((entry) => {
      const term = document.createElement('dt');
      term.textContent = entry.label;
      const definition = document.createElement('dd');
      definition.textContent = entry.value;
      meta.append(term, definition);
    });
    panel.append(meta);
  }

  if (animate && row && value.textContent) {
    animateCountUp(value, {
      displayValue: row.displayValue,
      duration: 520,
    });
  }
}

function colorForRatio(ratio) {
  const clamped = Math.max(0, Math.min(ratio, 1));
  const start = [213, 235, 242];
  const mid = [20, 145, 191];
  const end = [17, 58, 103];
  const from = clamped < 0.65 ? start : mid;
  const to = clamped < 0.65 ? mid : end;
  const local = clamped < 0.65 ? clamped / 0.65 : (clamped - 0.65) / 0.35;
  const channels = from.map((channel, index) => (
    Math.round(channel + ((to[index] - channel) * local))
  ));

  return `rgb(${channels.join(' ')})`;
}

function buildMapCardMetric(entry) {
  const metric = document.createElement('div');
  metric.className = `cybertipline-geo-report-map-card-metric is-${entry.key}`;

  const icon = document.createElement('span');
  icon.className = 'cybertipline-geo-report-map-card-icon';
  icon.setAttribute('aria-hidden', 'true');

  const value = document.createElement('strong');
  value.textContent = entry.displayValue;

  const label = document.createElement('span');
  label.textContent = entry.label;

  metric.append(icon, value, label);
  return metric;
}

function positionMapCard(card, event, wrap) {
  if (!event) {
    card.style.left = '24px';
    card.style.top = '24px';
    card.classList.remove('is-flipped');
    return;
  }

  const wrapRect = wrap.getBoundingClientRect();
  const cardWidth = Math.min(430, wrapRect.width - 32);
  const rawLeft = event.clientX - wrapRect.left + 22;
  const rawTop = event.clientY - wrapRect.top - 28;
  const maxLeft = Math.max(wrapRect.width - cardWidth - 16, 16);
  const left = Math.max(16, Math.min(rawLeft, maxLeft));
  const top = Math.max(16, Math.min(rawTop, Math.max(wrapRect.height - 250, 16)));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.setProperty('--map-card-width', `${cardWidth}px`);
  card.classList.toggle('is-flipped', left < rawLeft);
}

function renderMapCard(card, row, event, wrap) {
  if (!row) {
    card.hidden = true;
    return;
  }

  card.replaceChildren();

  const title = document.createElement('h3');
  title.textContent = row.label;

  const metrics = document.createElement('div');
  metrics.className = 'cybertipline-geo-report-map-card-metrics';
  rowBreakdownEntries(row).forEach((entry) => metrics.append(buildMapCardMetric(entry)));

  const total = document.createElement('div');
  total.className = 'cybertipline-geo-report-map-card-total';
  const totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total';
  const totalValue = document.createElement('strong');
  totalValue.textContent = rowTotalEntry(row).displayValue;
  total.append(totalLabel, totalValue);

  card.append(title);
  if (metrics.childElementCount) {
    card.append(metrics);
  }
  card.append(total);
  card.hidden = false;
  positionMapCard(card, event, wrap);
}

function buildMapPanel(rows, dataset, onPreview, onSelect) {
  const rowByCode = new Map(rows.map((row) => [row.geoCode, row]));
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const wrap = document.createElement('div');
  wrap.className = 'cybertipline-geo-report-map-wrap';
  const svg = buildMap();
  const hoverCard = document.createElement('div');
  hoverCard.className = 'cybertipline-geo-report-map-card';
  hoverCard.hidden = true;

  svg.classList.add('cybertipline-geo-report-map');
  svg.querySelectorAll('path[data-state]').forEach((path) => {
    const code = path.dataset.state;
    const row = rowByCode.get(code);
    path.tabIndex = row ? 0 : -1;
    path.classList.toggle('has-data', Boolean(row));
    path.setAttribute('aria-disabled', row ? 'false' : 'true');

    if (row) {
      path.style.setProperty('--geo-fill', row.color || colorForRatio(row.value / maxValue));
      path.setAttribute('aria-label', `${row.label}: ${row.displayValue}`);
      path.addEventListener('mouseenter', (event) => {
        onPreview(row, true);
        renderMapCard(hoverCard, row, event, wrap);
      });
      path.addEventListener('mousemove', (event) => positionMapCard(hoverCard, event, wrap));
      path.addEventListener('mouseleave', () => {
        renderMapCard(hoverCard, null);
        onPreview(null, false);
      });
      path.addEventListener('focus', () => {
        onPreview(row, true);
        renderMapCard(hoverCard, row, null, wrap);
      });
      path.addEventListener('blur', () => renderMapCard(hoverCard, null));
      path.addEventListener('click', () => {
        onSelect(row);
        svg.querySelectorAll('path.is-selected').forEach((selected) => {
          selected.classList.remove('is-selected');
        });
        path.classList.add('is-selected');
      });
      path.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        path.click();
      });
    }
  });

  const caption = document.createElement('p');
  caption.className = 'cybertipline-geo-report-map-caption';
  caption.textContent = dataset.metadata?.map_caption || 'Hover or select a state to view report details.';

  wrap.append(svg, hoverCard, caption);
  return wrap;
}

function buildRowCell(text, className) {
  const cell = document.createElement('span');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function buildRowButton(row, maxValue, index, onPreview, onSelect, hasBreakdown) {
  const item = document.createElement('li');
  item.className = 'cybertipline-geo-report-row';
  item.style.setProperty('--bar-width', `${Math.max((row.value / maxValue) * 100, 2)}%`);
  item.style.setProperty('--row-index', index);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cybertipline-geo-report-row-button';
  button.setAttribute('aria-label', `${row.label}: ${row.displayValue}`);
  button.addEventListener('mouseenter', () => onPreview(row, true));
  button.addEventListener('mouseleave', () => onPreview(null, false));
  button.addEventListener('focus', () => onPreview(row, true));
  button.addEventListener('click', () => {
    onSelect(row);
    item.parentElement?.querySelectorAll('.cybertipline-geo-report-row.is-selected').forEach((selected) => {
      selected.classList.remove('is-selected');
    });
    item.classList.add('is-selected');
  });

  const rank = document.createElement('span');
  rank.className = 'cybertipline-geo-report-row-rank';
  rank.textContent = String(index + 1).padStart(2, '0');

  const label = document.createElement('span');
  label.className = 'cybertipline-geo-report-row-label';
  label.textContent = row.label;

  const value = document.createElement('span');
  value.className = 'cybertipline-geo-report-row-value';
  value.textContent = row.displayValue;

  if (hasBreakdown) {
    const metricMap = new Map(rowBreakdownEntries(row).map((entry) => [entry.key, entry]));
    const referrals = metricMap.get('referrals')?.displayValue || '-';
    const informational = metricMap.get('informational')?.displayValue || '-';

    button.classList.add('is-tabular');
    button.append(
      label,
      buildRowCell(referrals, 'cybertipline-geo-report-row-referrals'),
      buildRowCell(informational, 'cybertipline-geo-report-row-informational'),
      value,
    );
  } else {
    button.append(rank, label, value);
  }

  const bar = document.createElement('span');
  bar.className = 'cybertipline-geo-report-row-bar';
  bar.setAttribute('aria-hidden', 'true');

  button.append(bar);
  item.append(button);
  return item;
}

function enableBarReveal(list) {
  if (!list) return;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    list.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    list.classList.add('is-visible');
    observer.disconnect();
  }, { threshold: 0.25 });

  observer.observe(list);
}

function buildRowsPanel(rows, onPreview, onSelect) {
  const shell = document.createElement('div');
  shell.className = 'cybertipline-geo-report-table';
  const hasBreakdown = rows.some((row) => rowBreakdownEntries(row).length);

  if (hasBreakdown) {
    const title = document.createElement('h3');
    title.textContent = 'Reports by State';
    title.className = 'cybertipline-geo-report-table-title';

    const header = document.createElement('div');
    header.className = 'cybertipline-geo-report-table-header';
    header.append(
      buildRowCell('US State', 'cybertipline-geo-report-table-heading'),
      buildRowCell('Referrals', 'cybertipline-geo-report-table-heading is-numeric'),
      buildRowCell('Informational', 'cybertipline-geo-report-table-heading is-numeric'),
      buildRowCell('Total', 'cybertipline-geo-report-table-heading is-numeric'),
    );
    shell.append(title, header);
  }

  const list = document.createElement('ol');
  list.className = 'cybertipline-geo-report-rows';
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  rows.forEach((row, index) => {
    list.append(buildRowButton(row, maxValue, index, onPreview, onSelect, hasBreakdown));
  });

  enableBarReveal(list);
  shell.append(list);
  return shell;
}

function shouldRenderMap(rows, requestedGeoType, dataset) {
  if (requestedGeoType === 'country') return false;
  if (dataset.geoScope && dataset.geoScope !== 'us') return false;

  const stateRows = rows.filter((row) => STATE_CODES.has(row.geoCode));
  return stateRows.length >= Math.min(rows.length, 8);
}

function buildEmpty(message) {
  const empty = document.createElement('div');
  empty.className = 'cybertipline-geo-report-empty';
  empty.textContent = message || DEFAULTS.emptyMessage;
  return empty;
}

export default async function decorate(block) {
  const headingField = fieldValue(block, 'heading', BLOCK_ROW_INDEX.heading, ['heading', 'title']);
  const introField = richField(block, 'intro', BLOCK_ROW_INDEX.intro, ['intro', 'description']);
  const apiBaseUrlField = fieldValue(block, 'apiBaseUrl', BLOCK_ROW_INDEX.apiBaseUrl, ['api base url', 'backend url']);
  const yearField = fieldValue(block, 'year', BLOCK_ROW_INDEX.year, ['year']);
  const datasetSlugField = fieldValue(block, 'datasetSlug', BLOCK_ROW_INDEX.datasetSlug, ['dataset slug']);
  const geoTypeField = fieldValue(block, 'geoType', BLOCK_ROW_INDEX.geoType, ['geo type']);
  const emptyMessageField = fieldValue(block, 'emptyMessage', BLOCK_ROW_INDEX.emptyMessage, ['empty message']);
  const sampleDataModeField = fieldValue(block, 'sampleDataMode', BLOCK_ROW_INDEX.sampleDataMode, ['sample data mode']);

  const config = {
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrlField.value),
    year: normalizeToken(yearField.value),
    datasetSlug: normalizeToken(datasetSlugField.value) || DEFAULTS.datasetSlug,
    geoType: normalizeGeoType(geoTypeField.value),
    sampleDataMode: normalizeSampleDataMode(sampleDataModeField.value),
  };
  const apiResult = config.sampleDataMode === 'always' ? null : await fetchDataset(config);
  exposeFetchError(block, apiResult?.error);
  const apiDataset = apiResult?.dataset ? apiResult : null;
  const fallbackRows = authoredRows(block);
  const shouldUseSampleData = config.sampleDataMode === 'always'
    || (config.sampleDataMode === 'when-empty' && !apiDataset?.dataset?.rows?.length && !fallbackRows.length);
  const sampleDataset = shouldUseSampleData ? sampleDatasetForConfig(config) : null;
  const dataset = sampleDataset?.dataset || apiDataset?.dataset || {
    slug: config.datasetSlug,
    title: headingField.value || DEFAULTS.heading,
    description: introField.text,
    geoScope: config.geoType === 'country' ? 'global' : 'us',
    totals: {},
    metadata: {},
    rows: fallbackRows,
  };
  const report = sampleDataset?.report || apiDataset?.report;
  const rows = dataset.rows?.length ? dataset.rows : fallbackRows;

  block.classList.toggle('is-sample-data', Boolean(sampleDataset));
  if (sampleDataset) block.dataset.cybertiplineGeoReportSource = 'sample';
  else block.removeAttribute('data-cybertipline-geo-report-source');

  const inner = document.createElement('div');
  inner.className = 'cybertipline-geo-report-inner';
  inner.append(buildHeader(headingField, introField, dataset, report));

  if (!rows.length) {
    inner.append(buildEmpty(emptyMessageField.value));
    block.replaceChildren(inner);
    return;
  }

  let selectedRow = rows[0];
  const detail = document.createElement('aside');
  detail.className = 'cybertipline-geo-report-detail';

  const onPreview = (row, animate) => {
    renderDetail(detail, row || selectedRow, dataset, animate);
  };
  const onSelect = (row) => {
    selectedRow = row;
    detail.classList.add('is-selected');
    renderDetail(detail, row, dataset, true);
  };

  const body = document.createElement('div');
  body.className = 'cybertipline-geo-report-body';
  const mapRows = rows.filter((row) => STATE_CODES.has(row.geoCode));
  if (shouldRenderMap(rows, config.geoType, dataset)) {
    body.append(buildMapPanel(mapRows, dataset, onPreview, onSelect));
  } else {
    body.classList.add('cybertipline-geo-report-body-list-only');
  }

  const side = document.createElement('div');
  side.className = 'cybertipline-geo-report-side';
  side.append(detail, buildRowsPanel(rows, onPreview, onSelect));
  body.append(side);
  inner.append(body);
  block.replaceChildren(inner);

  renderDetail(detail, selectedRow, dataset, false);
  detail.querySelectorAll('.cybertipline-geo-report-detail-value').forEach((valueEl) => {
    animateCountUpOnVisible(valueEl, {
      displayValue: valueEl.textContent,
      duration: 800,
    });
  });
}
