import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { buildAmberPosterDetailHref } from '../../scripts/poster-link-utils.js';

const DEFAULTS = {
  heading: 'Active AMBER Alerts',
  eyebrow: 'AMBER Alert',
  copy: 'Review active AMBER Alerts and share information with law enforcement if you have seen a child or vehicle.',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  state: '',
  emptyMessage: 'There are no AMBER Alerts at this time.',
  detailLabel: 'Open poster',
  posterPagePath: '/missing-children-posters',
  disclosure: 'Notice: The National Center for Missing & Exploited Children® certifies the posters on this site only if they contain the NCMEC logo and the 1-800-THE-LOST® (1-800-843-5678) number. All other posters are the responsibility of the agency whose logo appears on the poster.',
};

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  eyebrow: ['eyebrow', 'label'],
  copy: ['copy', 'description', 'intro copy'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  state: ['state', 'default state filter'],
  emptyMessage: ['empty message', 'no alerts message'],
  detailLabel: ['detail label', 'button label', 'detail button label'],
  posterPagePath: ['poster page path', 'poster page url', 'poster url'],
  disclosure: ['disclosure', 'notice', 'disclosure text'],
};

const STATES = [
  ['', 'All states'],
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];

function normalizeText(value) {
  return `${value || ''}`.trim();
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

function setStatus(node, message, type = '') {
  node.className = `amber-alerts-status${type ? ` is-${type}` : ''}`;
  node.textContent = message;
  node.hidden = !message;
}

function caseNumber(alert) {
  return normalizeText(alert.case_number || alert.caseNumber || alert.amberId);
}

function sequenceNumber(alert) {
  return normalizeText(alert.sequence_number || alert.seqNumber || alert.seqNum);
}

function personId(alert) {
  return normalizeText(alert.personId || alert.personID || alert.id);
}

function alertName(alert) {
  return normalizeText(alert.name || alert.fullName)
    || [alert.firstName, alert.middleName, alert.lastName].map(normalizeText).filter(Boolean).join(' ')
    || 'AMBER Alert';
}

function amberPosterUrl(alert, posterPagePath) {
  return buildAmberPosterDetailHref({
    caseNumber: caseNumber(alert),
    sequenceNumber: personId(alert) || sequenceNumber(alert) || '1',
    personId: personId(alert),
    name: alertName(alert),
    posterPagePath,
  });
}

function normalizedName(alert) {
  return alertName(alert).toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchingDetailAlert(payload, sourceAlert) {
  const people = Array.isArray(payload?.data) ? payload.data : [];
  if (!people.length) return payload || {};

  const sourceId = personId(sourceAlert);
  if (sourceId) {
    const match = people.find((person) => personId(person) === sourceId);
    if (match) return match;
  }

  const sourceSequence = sequenceNumber(sourceAlert);
  if (sourceSequence) {
    const match = people.find((person) => (
      sequenceNumber(person) === sourceSequence || personId(person) === sourceSequence
    ));
    if (match) return match;
  }

  const sourceName = normalizedName(sourceAlert);
  if (sourceName) {
    const match = people.find((person) => normalizedName(person) === sourceName);
    if (match) return match;
  }

  return people.length === 1 ? people[0] : sourceAlert;
}

function createDetailRow(label, value) {
  if (!normalizeText(value)) return null;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  return [dt, dd];
}

function appendDetailRows(list, rows) {
  rows.forEach(([label, value]) => {
    const row = createDetailRow(label, value);
    if (row) list.append(...row);
  });
}

function createAlertCard(alert, config) {
  const card = document.createElement('article');
  card.className = 'amber-alerts-card';

  if (alert.image_url) {
    const media = document.createElement('div');
    media.className = 'amber-alerts-card-media';
    const img = document.createElement('img');
    img.src = alert.image_url;
    img.alt = alertName(alert);
    img.loading = 'lazy';
    media.append(img);
    card.append(media);
  } else {
    card.classList.add('is-no-media');
  }

  const body = document.createElement('div');
  body.className = 'amber-alerts-card-body';

  const badge = document.createElement('p');
  badge.className = 'amber-alerts-card-badge';
  badge.textContent = 'AMBER Alert';

  const title = document.createElement('h3');
  title.textContent = alertName(alert);

  const details = document.createElement('dl');
  appendDetailRows(details, [
    ['Case', caseNumber(alert)],
    ['Missing From', alert.missing_location || alert.missingLocation],
    ['Alert Date', alert.missing_date || alert.missingDate],
    ['Issued For', alert.issued_for || alert.issuedFor],
  ]);

  const actions = document.createElement('div');
  actions.className = 'amber-alerts-card-actions';
  const posterUrl = amberPosterUrl(alert, config.posterPagePath);
  if (posterUrl) {
    const poster = document.createElement('a');
    poster.href = posterUrl;
    poster.target = '_blank';
    poster.rel = 'noopener noreferrer';
    poster.textContent = config.detailLabel;
    actions.append(poster);
  }

  body.append(badge, title, details);
  if (actions.children.length) body.append(actions);
  card.append(body);
  return card;
}

function renderAlerts(container, payload, config) {
  container.replaceChildren();
  const alerts = Array.isArray(payload?.data) ? payload.data : [];

  if (!alerts.length) {
    const empty = document.createElement('p');
    empty.className = 'amber-alerts-empty';
    empty.textContent = config.emptyMessage;
    container.append(empty);
    return;
  }

  alerts.forEach((alert) => container.append(createAlertCard(alert, config)));
}

function detailImage(payload, sourceAlert) {
  const alert = matchingDetailAlert(payload, sourceAlert);
  return normalizeText(
    alert.image_url
      || alert.thumbnail_url
      || alert.imageUrl
      || alert.thumbnailUrl
      || alert.image?.image_url,
  );
}

function createStateFilter(defaultState) {
  const label = document.createElement('label');
  label.className = 'amber-alerts-filter';
  const span = document.createElement('span');
  span.textContent = 'Filter by state';
  const select = document.createElement('select');
  STATES.forEach(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    option.selected = value === defaultState;
    select.append(option);
  });
  label.append(span, select);
  return { label, select };
}

export default async function decorate(block) {
  const config = {
    heading: getFieldValue(block, 'heading', 0, DEFAULTS.heading),
    eyebrow: getFieldValue(block, 'eyebrow', 1, DEFAULTS.eyebrow),
    copy: getFieldValue(block, 'copy', 2, DEFAULTS.copy),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 3, DEFAULTS.apiBaseUrl)),
    state: getFieldValue(block, 'state', 4, DEFAULTS.state).toUpperCase(),
    emptyMessage: getFieldValue(block, 'emptyMessage', 5, DEFAULTS.emptyMessage),
    detailLabel: getFieldValue(block, 'detailLabel', 6, DEFAULTS.detailLabel),
    posterPagePath: getFieldValue(block, 'posterPagePath', 7, DEFAULTS.posterPagePath),
    disclosure: getFieldValue(block, 'disclosure', 8, DEFAULTS.disclosure),
  };

  const inner = document.createElement('div');
  inner.className = 'amber-alerts-inner';

  const header = document.createElement('div');
  header.className = 'amber-alerts-header';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'amber-alerts-eyebrow';
  eyebrow.textContent = config.eyebrow;
  const heading = document.createElement('h2');
  heading.textContent = config.heading;
  const copy = document.createElement('p');
  copy.className = 'amber-alerts-copy';
  copy.textContent = config.copy;
  header.append(eyebrow, heading, copy);

  const { select: stateSelect } = createStateFilter(config.state);

  const status = document.createElement('p');
  status.hidden = true;
  const list = document.createElement('div');
  list.className = 'amber-alerts-list';

  const disclosure = document.createElement('p');
  disclosure.className = 'amber-alerts-disclosure';
  disclosure.textContent = config.disclosure;

  inner.append(header, status, list);
  if (config.disclosure) inner.append(disclosure);
  block.replaceChildren(inner);

  const loadAlerts = async () => {
    setStatus(status, 'Loading active AMBER Alerts...', 'loading');
    list.replaceChildren();

    try {
      const url = new URL('/api/amber-alerts', `${config.apiBaseUrl}/`);
      if (stateSelect.value) url.searchParams.set('state', stateSelect.value);
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const alerts = Array.isArray(payload?.data) ? payload.data : [];
      await Promise.all(alerts.map(async (alert) => {
        if (alert.image_url || !caseNumber(alert)) return;
        try {
          const detailUrl = new URL(
            `/api/amber-alerts/${encodeURIComponent(caseNumber(alert))}`,
            `${config.apiBaseUrl}/`,
          );
          const detailResponse = await fetch(detailUrl.toString(), {
            headers: { Accept: 'application/json' },
          });
          if (!detailResponse.ok) return;
          const detailPayload = await detailResponse.json();
          const image = detailImage(detailPayload, alert);
          if (image) alert.image_url = image;
        } catch (error) {
          // The card remains usable without an image.
        }
      }));
      setStatus(status, '', '');
      renderAlerts(list, payload, config);
    } catch (error) {
      setStatus(status, 'AMBER Alerts are unavailable.', 'error');
    }
  };

  stateSelect.addEventListener('change', loadAlerts);
  loadAlerts();
}
