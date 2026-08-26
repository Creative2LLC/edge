const DEFAULT_COLORS = [
  '#008db6',
  '#ffad5b',
  '#72c679',
  '#f45b97',
  '#9a7dd2',
  '#f0c64a',
  '#113a67',
];

export function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute?.('data-aue-resource')
      || scope?.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

export function normalizeText(value) {
  return String(value || '').trim();
}

export function normalizeToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

/**
 * Pull the URL out of an authored cell and drop anything after it.
 *
 * A plain `.trim()` is not enough: decorateButtons used to append a " →" CTA arrow
 * to auto-linked bare URLs, so the cell could read `https://api.example.com →`.
 * Chrome's URL parser accepts that and punycodes the space into the hostname
 * (`...on-vapor.xn--com%20-nn2c`), so every request 404s at DNS with no visible
 * error — while Node's parser throws, which is why no unit test caught it.
 *
 * The root cause is fixed in scripts/aem.js (isBareUrlAutolink), but this stays as
 * the second line of defence for any other decoration that touches a config cell.
 * cybertipline-geo-report.js has carried the same guard for a while.
 */
export function normalizeApiBaseUrl(value) {
  const text = normalizeText(value);
  const url = text.match(/https?:\/\/[^\s→›➜➔⟶]+/iu)?.[0] || text;
  return url.replace(/\/+$/, '');
}

export function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number.parseFloat(
    String(value).replace(/,/g, '').replace(/[^0-9.-]+/g, ''),
  );

  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return normalizeText(value);

  return numeric.toLocaleString('en-US', {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
  });
}

export function normalizeColor(value, index = 0) {
  const normalized = normalizeText(value);
  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

function keyFromLabel(label) {
  return normalizeText(label)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function parseKeyValueLines(value) {
  return normalizeText(value)
    .split(/\r?\n|\|/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((values, line) => {
      const separator = line.includes('=') ? '=' : ':';
      const separatorIndex = line.indexOf(separator);
      if (separatorIndex <= 0) return values;

      const key = keyFromLabel(line.slice(0, separatorIndex));
      const rawValue = line.slice(separatorIndex + 1).trim();
      if (key) values[key] = rawValue;

      return values;
    }, {});
}

function parseColumnLine(line) {
  const parts = line.includes('|')
    ? line.split('|')
    : line.split(',');
  const label = normalizeText(parts[0]);
  const key = normalizeText(parts[1]) || keyFromLabel(label);

  if (!label || !key) return null;

  return {
    key,
    label,
    align: normalizeText(parts[2]),
  };
}

export function parseColumns(value) {
  return normalizeText(value)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseColumnLine)
    .filter(Boolean);
}

export function normalizeColumns(columns) {
  return (Array.isArray(columns) ? columns : [])
    .map((column) => {
      if (typeof column === 'string') return parseColumnLine(column);
      if (!column || typeof column !== 'object') return null;

      const label = normalizeText(column.label || column.name || column.title || column.key);
      const key = normalizeText(column.key || column.field || column.name || keyFromLabel(label));
      if (!label || !key) return null;

      return {
        key,
        label,
        align: normalizeText(column.align || column.alignment),
        type: normalizeText(column.type || column.format),
      };
    })
    .filter(Boolean);
}

export function deriveColumns(rows) {
  const valueKeys = [];

  rows.forEach((row) => {
    Object.keys(row.values || {}).forEach((key) => {
      if (!valueKeys.includes(key)) valueKeys.push(key);
    });
  });

  if (valueKeys.length) {
    return [
      { key: 'label', label: 'Category' },
      ...valueKeys.map((key) => ({
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        align: 'right',
      })),
    ];
  }

  return [
    { key: 'label', label: 'Category' },
    { key: 'value', label: 'Value', align: 'right' },
  ];
}

function firstPresent(...values) {
  return values.find((value) => (
    value !== undefined && value !== null && String(value).trim() !== ''
  ));
}

export function normalizeRow(row, index = 0) {
  const values = row?.values && typeof row.values === 'object' ? row.values : {};
  const value = parseNumber(firstPresent(
    row?.value,
    row?.count,
    row?.total,
    row?.reports,
    values.value,
    values.count,
    values.total,
    values.reports,
  ));
  const label = normalizeText(firstPresent(
    row?.label,
    row?.name,
    row?.title,
    row?.category,
    row?.type,
    row?.agency,
  ));

  if (!label && !Number.isFinite(value)) return null;

  return {
    id: row?.id || `${label || 'row'}-${index}`,
    label,
    code: normalizeText(row?.code),
    value,
    displayValue: normalizeText(row?.display_value || row?.displayValue)
      || (Number.isFinite(value) ? formatNumber(value) : ''),
    values,
    description: normalizeText(row?.description || row?.summary || row?.note),
    color: normalizeText(row?.color),
    sortOrder: Number.isFinite(Number(row?.sort_order ?? row?.order))
      ? Number(row?.sort_order ?? row?.order)
      : index,
    raw: row || {},
  };
}

export function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => normalizeRow(row, index))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return 0;
    });
}

function collectionFromPayload(payload, datasetSlug) {
  const data = payload?.data || payload || {};
  const normalizedSlug = normalizeToken(datasetSlug);

  if (Array.isArray(data?.dataset?.rows)) return data.dataset;
  if (Array.isArray(data?.rows)) return data;

  const datasets = data?.datasets || data?.report?.datasets || payload?.datasets;
  if (Array.isArray(datasets)) {
    return datasets.find((dataset) => normalizeToken(dataset?.slug) === normalizedSlug)
      || datasets.find((dataset) => Array.isArray(dataset?.rows))
      || null;
  }

  if (Array.isArray(data?.data)) return { rows: data.data };
  if (Array.isArray(payload)) return { rows: payload };

  return null;
}

export function normalizeDataset(payload, datasetSlug = '') {
  const data = payload?.data || payload || {};
  const dataset = collectionFromPayload(payload, datasetSlug);
  if (!dataset) return null;

  return {
    report: data.report || {
      year: data.year || payload?.year,
      title: data.title || payload?.title,
    },
    dataset: {
      slug: dataset.slug || datasetSlug,
      title: normalizeText(dataset.title || data.title),
      description: normalizeText(dataset.description || data.description),
      type: normalizeText(dataset.type || data.type),
      columns: normalizeColumns(dataset.columns),
      totals: dataset.totals || {},
      metadata: dataset.metadata || {},
      rows: normalizeRows(dataset.rows || dataset.data || []),
    },
  };
}

export function buildImpactDatasetEndpoint(config = {}) {
  if (config.apiEndpoint) return normalizeText(config.apiEndpoint);

  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  const datasetSlug = normalizeToken(config.datasetSlug);
  const year = normalizeText(config.year);

  if (!apiBaseUrl) return '';

  const endpoint = year && datasetSlug
    ? `/api/impact-reports/${encodeURIComponent(year)}/datasets/${encodeURIComponent(datasetSlug)}`
    : '/api/impact-reports/current';

  try {
    return new URL(endpoint, `${apiBaseUrl}/`).toString();
  } catch {
    return '';
  }
}

export async function fetchImpactDataset(config = {}, blockName = 'impact-data') {
  const endpoint = buildImpactDatasetEndpoint(config);
  if (!endpoint) return null;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');

      // eslint-disable-next-line no-console
      console.warn(`[${blockName}] API request failed.`, {
        status: response.status,
        endpoint,
        body,
      });

      return null;
    }

    const payload = await response.json();
    const dataset = normalizeDataset(payload, config.datasetSlug);

    if (!dataset?.dataset?.rows?.length) {
      // eslint-disable-next-line no-console
      console.warn(`[${blockName}] API response did not contain usable rows.`, {
        endpoint,
        datasetSlug: config.datasetSlug,
        payload,
      });
    }

    return dataset;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[${blockName}] API request failed.`, {
      endpoint,
      error: error?.message || error,
    });

    return null;
  }
}

export function rowDisplayValue(row, key) {
  if (!row) return '';
  if (key === 'label') return row.label;
  if (key === 'description') return row.description;
  if (key === 'value') return row.displayValue || (Number.isFinite(row.value) ? formatNumber(row.value) : '');

  const rawValue = firstPresent(row.values?.[key], row.raw?.[key], row[key]);
  const numeric = parseNumber(rawValue);

  if (Number.isFinite(numeric) && String(rawValue).match(/^[\s$+\-0-9,.%]+$/u)) {
    return formatNumber(numeric);
  }

  return normalizeText(rawValue);
}

export function rowNumericValue(row, key = 'value') {
  if (!row) return null;
  if (key === 'value') return row.value;

  return parseNumber(firstPresent(row.values?.[key], row.raw?.[key], row[key]));
}
