const DEFAULTS = {
  heading: 'Active AMBER Alerts',
  eyebrow: 'AMBER Alert',
  copy: 'Review active AMBER Alerts and share information with law enforcement if you have seen a child or vehicle.',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  state: '',
  emptyMessage: 'There are no AMBER Alerts at this time.',
  detailLabel: 'View alert',
};

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  eyebrow: ['eyebrow', 'label'],
  copy: ['copy', 'description', 'intro copy'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  state: ['state', 'default state filter'],
  emptyMessage: ['empty message', 'no alerts message'],
  detailLabel: ['detail label', 'button label', 'detail button label'],
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
  return [...block.querySelectorAll(':scope > div')];
}

function getPropValue(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return '';
  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || source.textContent);
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

function firstValue(source, keys) {
  return keys.map((key) => source?.[key]).find((value) => normalizeText(value)) || '';
}

function caseNumber(alert) {
  return normalizeText(alert.case_number || alert.caseNumber || alert.amberId);
}

function alertName(alert) {
  return normalizeText(alert.name || alert.fullName)
    || [alert.firstName, alert.middleName, alert.lastName].map(normalizeText).filter(Boolean).join(' ')
    || 'AMBER Alert';
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

function createAlertCard(alert, config, onSelect) {
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

  const detail = document.createElement('button');
  detail.type = 'button';
  detail.textContent = config.detailLabel;
  detail.disabled = !caseNumber(alert);
  detail.addEventListener('click', () => onSelect(alert));
  actions.append(detail);

  if (caseNumber(alert)) {
    const poster = document.createElement('button');
    poster.type = 'button';
    poster.className = 'amber-alerts-card-secondary';
    poster.textContent = 'Open poster';
    poster.addEventListener('click', () => onSelect(alert));
    actions.append(poster);
  }

  body.append(badge, title, details, actions);
  card.append(body);
  return card;
}

function renderAlerts(container, payload, config, onSelect) {
  container.replaceChildren();
  const alerts = Array.isArray(payload?.data) ? payload.data : [];

  if (!alerts.length) {
    const empty = document.createElement('p');
    empty.className = 'amber-alerts-empty';
    empty.textContent = config.emptyMessage;
    container.append(empty);
    return;
  }

  alerts.forEach((alert) => container.append(createAlertCard(alert, config, onSelect)));
}

function renderDetail(container, payload, onBack) {
  container.replaceChildren();
  const people = Array.isArray(payload?.data) ? payload.data : [];
  const alert = people[0] || payload || {};
  const detail = document.createElement('article');
  detail.className = 'amber-alerts-detail';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'amber-alerts-detail-back';
  back.textContent = 'Back to active alerts';
  back.addEventListener('click', onBack);

  const body = document.createElement('div');
  body.className = 'amber-alerts-detail-body';

  if (alert.image_url) {
    const media = document.createElement('div');
    media.className = 'amber-alerts-detail-media';
    const img = document.createElement('img');
    img.src = alert.image_url;
    img.alt = alertName(alert);
    media.append(img);
    body.append(media);
  }

  const content = document.createElement('div');
  content.className = 'amber-alerts-detail-content';
  const badge = document.createElement('p');
  badge.className = 'amber-alerts-card-badge';
  badge.textContent = 'AMBER Alert';
  const title = document.createElement('h3');
  title.textContent = alertName(alert);

  const details = document.createElement('dl');
  appendDetailRows(details, [
    ['Case', payload.case_number || caseNumber(alert)],
    ['Missing From', alert.missing_location || alert.missingLocation],
    ['Alert Date', alert.missing_date || alert.missingDate],
    ['Issued For', alert.issued_for || alert.issuedFor],
    ['Gender', firstValue(alert, ['sex', 'gender'])],
    ['Race', firstValue(alert, ['race'])],
    ['Hair Color', firstValue(alert, ['hairColor'])],
    ['Eye Color', firstValue(alert, ['eyeColor'])],
  ]);

  const narrative = firstValue(payload, ['circumstances', 'description', 'posterText', 'remarks'])
    || firstValue(alert, ['circumstances', 'description', 'posterText', 'remarks']);
  content.append(badge, title, details);
  if (narrative) {
    const copy = document.createElement('p');
    copy.className = 'amber-alerts-detail-copy';
    copy.textContent = narrative;
    content.append(copy);
  }
  body.append(content);
  detail.append(back, body);
  container.append(detail);
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

  const controls = document.createElement('div');
  controls.className = 'amber-alerts-controls';
  const { label: stateLabel, select: stateSelect } = createStateFilter(config.state);
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Refresh';
  controls.append(stateLabel, refresh);

  const status = document.createElement('p');
  status.hidden = true;
  const list = document.createElement('div');
  list.className = 'amber-alerts-list';

  inner.append(header, controls, status, list);
  block.replaceChildren(inner);

  let lastPayload = null;
  let restoreList = () => {};

  async function showAlertDetail(alert) {
    const id = caseNumber(alert);
    if (!id) return;
    setStatus(status, 'Loading alert details...', 'loading');
    list.replaceChildren();

    try {
      const url = new URL(`/api/amber-alerts/${encodeURIComponent(id)}`, `${config.apiBaseUrl}/`);
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setStatus(status, '', '');
      renderDetail(list, payload, restoreList);
    } catch (error) {
      setStatus(status, 'AMBER alert detail is unavailable.', 'error');
      restoreList();
    }
  }

  restoreList = () => {
    if (lastPayload) renderAlerts(list, lastPayload, config, showAlertDetail);
  };

  const loadAlerts = async () => {
    setStatus(status, 'Loading active AMBER Alerts...', 'loading');
    refresh.disabled = true;
    list.replaceChildren();

    try {
      const url = new URL('/api/amber-alerts', `${config.apiBaseUrl}/`);
      if (stateSelect.value) url.searchParams.set('state', stateSelect.value);
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      lastPayload = payload;
      setStatus(status, '', '');
      renderAlerts(list, payload, config, showAlertDetail);
    } catch (error) {
      setStatus(status, 'AMBER Alerts are unavailable.', 'error');
    } finally {
      refresh.disabled = false;
    }
  };

  refresh.addEventListener('click', loadAlerts);
  stateSelect.addEventListener('change', loadAlerts);
  loadAlerts();
}
