import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { buildPosterDetailHref } from '../../scripts/poster-link-utils.js';

const DEFAULTS = {
  intro: 'AMBER Alerts are usually resolved within hours. However, there are still some children who were featured in AMBER Alerts who are still missing. These children and their most up to date poster can be found below.',
  heading: 'Children Still Missing from AMBER Alerts - Expand for details',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  endpointPath: '/api/amber-alerts/still-missing',
  posterPagePath: '/missing-children-posters',
  emptyMessage: 'There are no children still missing from AMBER Alerts at this time.',
};

const FIELD_LABELS = {
  intro: ['intro', 'intro copy', 'description'],
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  endpointPath: ['endpoint path', 'endpoint', 'api endpoint'],
  posterPagePath: ['poster page path', 'poster page url', 'poster url'],
  emptyMessage: ['empty message', 'no records message'],
};

function normalizeText(value) {
  return `${value || ''}`.replace(/\s+/g, ' ').trim();
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function getRows(block) {
  return getBlockRows(block);
}

function getPropValue(block, name) {
  return normalizeText(readLinkField(block, name).value || readTextField(block, name).value);
}

function getLegacyValue(block, name, columnIndex) {
  const labels = FIELD_LABELS[name] || [];
  const labeledRow = getRows(block).find((row) => {
    if (row.children.length !== 2) return false;
    const label = normalizeText(row.children[0].textContent).toLowerCase();
    return labels.some((entry) => label === entry || label.includes(entry));
  });

  if (labeledRow) {
    const valueCell = labeledRow.children[1];
    const anchor = valueCell.querySelector('a');
    return normalizeText(anchor?.getAttribute('href') || valueCell.textContent);
  }

  const configRow = getRows(block)[0];
  const cell = configRow ? [...configRow.children][columnIndex] : null;
  if (!cell) return '';
  const anchor = cell.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || cell.textContent);
}

function getFieldValue(block, name, columnIndex, fallback = '') {
  return getPropValue(block, name) || getLegacyValue(block, name, columnIndex) || fallback;
}

function firstValue(source, keys) {
  return keys.map((key) => source?.[key]).find((value) => normalizeText(value)) || '';
}

function posterPartsFromUrl(url) {
  const match = normalizeText(url).match(/\/poster\/([^/]+)\/([^/\s?#]+)(?:\/([^/\s?#]+))?/i);
  if (!match) return {};

  return {
    orgPrefix: match[1],
    caseNumber: match[2],
    sequenceNumber: match[3] || '1',
  };
}

function posterHref(row, posterPagePath = DEFAULTS.posterPagePath) {
  const posterUrl = firstValue(row, ['poster_url', 'posterUrl', 'posterLink', 'poster']);
  const parts = posterPartsFromUrl(posterUrl);
  const orgPrefix = normalizeText(firstValue(row, ['org_prefix', 'orgPrefix', 'provider']) || parts.orgPrefix || 'NCMC').toUpperCase();
  const caseNumber = normalizeText(firstValue(row, ['case_number', 'caseNumber', 'ncmecNumber', 'ncmec']) || parts.caseNumber);
  const sequenceNumber = normalizeText(
    firstValue(row, ['sequence_number', 'sequenceNumber', 'seqNumber', 'seqNum']) || parts.sequenceNumber || '1',
  );

  if (!caseNumber) return '';

  return buildPosterDetailHref({
    provider: orgPrefix,
    caseNumber,
    sequenceNumber,
    posterPagePath,
  });
}

function normalizeRow(row, posterPagePath) {
  const href = posterHref(row, posterPagePath);
  return {
    name: normalizeText(firstValue(row, ['name', 'fullName']) || [
      row.firstName,
      row.middleName,
      row.lastName,
    ].map(normalizeText).filter(Boolean).join(' ')),
    missingState: normalizeText(firstValue(row, ['missing_state', 'missingState', 'lastSeenState', 'state'])),
    missingDate: normalizeText(firstValue(row, ['missing_date', 'missingDate', 'dateMissing', 'missingSince'])),
    posterHref: href,
  };
}

function rowsFromPayload(payload, posterPagePath) {
  const source = Array.isArray(payload?.data) ? payload.data : payload?.children;
  if (!Array.isArray(source)) return [];

  return source
    .filter((row) => row && typeof row === 'object')
    .map((row) => normalizeRow(row, posterPagePath))
    .filter((row) => row.name || row.missingState || row.missingDate || row.posterHref);
}

function renderTable(container, rows, config) {
  container.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'amber-still-missing-empty';
    empty.textContent = config.emptyMessage;
    container.append(empty);
    return;
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'amber-still-missing-table-wrap';

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Name', 'Missing State', 'Missing Date', 'Poster Link'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  });
  thead.append(headerRow);

  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    [row.name, row.missingState, row.missingDate].forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });

    const linkCell = document.createElement('td');
    if (row.posterHref) {
      const link = document.createElement('a');
      link.href = row.posterHref;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View poster';
      linkCell.append(link);
    }
    tr.append(linkCell);
    tbody.append(tr);
  });

  table.append(thead, tbody);
  tableWrap.append(table);
  container.append(tableWrap);
}

function setStatus(node, message, type = '') {
  node.className = `amber-still-missing-status${type ? ` is-${type}` : ''}`;
  node.textContent = message;
  node.hidden = !message;
}

export default async function decorate(block) {
  const config = {
    intro: getFieldValue(block, 'intro', 0, DEFAULTS.intro),
    heading: getFieldValue(block, 'heading', 1, DEFAULTS.heading),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 2, DEFAULTS.apiBaseUrl)),
    endpointPath: getFieldValue(block, 'endpointPath', 3, DEFAULTS.endpointPath),
    posterPagePath: getFieldValue(block, 'posterPagePath', 4, DEFAULTS.posterPagePath),
    emptyMessage: getFieldValue(block, 'emptyMessage', 5, DEFAULTS.emptyMessage),
  };

  const inner = document.createElement('div');
  inner.className = 'amber-still-missing-inner';

  const intro = document.createElement('p');
  intro.className = 'amber-still-missing-intro';
  intro.textContent = config.intro;

  const details = document.createElement('details');
  details.className = 'amber-still-missing-accordion';

  const summary = document.createElement('summary');
  summary.textContent = config.heading;

  const status = document.createElement('p');
  status.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'amber-still-missing-panel';

  details.append(summary, status, panel);
  inner.append(intro, details);
  block.replaceChildren(inner);

  setStatus(status, 'Loading children still missing from AMBER Alerts...', 'loading');

  try {
    const url = new URL(config.endpointPath, `${config.apiBaseUrl}/`);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows = rowsFromPayload(payload, config.posterPagePath);
    setStatus(status, '', '');
    renderTable(panel, rows, config);
  } catch (error) {
    setStatus(status, 'Children still missing from AMBER Alerts are unavailable.', 'error');
  }
}
