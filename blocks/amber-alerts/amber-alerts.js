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
  detailLabel: 'View alert',
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

function firstValue(source, keys) {
  return keys.map((key) => source?.[key]).find((value) => normalizeText(value)) || '';
}

function joinValues(values) {
  return values.map(normalizeText).filter(Boolean).join(', ');
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

function posterPageUrl(alert, posterPagePath = DEFAULTS.posterPagePath) {
  return buildAmberPosterDetailHref({
    caseNumber: caseNumber(alert),
    sequenceNumber: personId(alert) || sequenceNumber(alert) || '1',
    personId: personId(alert),
    name: alertName(alert),
    posterPagePath,
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

  const detail = document.createElement('button');
  detail.type = 'button';
  detail.textContent = config.detailLabel;
  detail.disabled = !caseNumber(alert);
  detail.addEventListener('click', () => onSelect(alert));
  actions.append(detail);

  if (caseNumber(alert)) {
    const poster = document.createElement('a');
    poster.href = posterPageUrl(alert, config.posterPagePath);
    poster.target = '_blank';
    poster.rel = 'noopener noreferrer';
    poster.className = 'amber-alerts-card-secondary';
    poster.textContent = 'Open poster';
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

function appendImageGallery(container, alert) {
  const images = [
    alert.image_url,
    alert.thumbnail_url,
    alert.image?.image_url,
    alert.imageUrl,
    alert.thumbnailUrl,
  ].map(normalizeText).filter(Boolean);
  const uniqueImages = [...new Set(images)];
  if (uniqueImages.length <= 1) return;

  const gallery = document.createElement('div');
  gallery.className = 'amber-alerts-detail-gallery';
  uniqueImages.forEach((src) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alertName(alert);
    img.loading = 'lazy';
    gallery.append(img);
  });
  container.append(gallery);
}

function arrayItems(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function uniqueItems(items, keyForItem) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyForItem(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readablePersonType(person) {
  const rawType = firstValue(person, ['person_type', 'personType', 'type']);
  const normalized = rawType.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.includes('suspect')) return 'Suspect';
  if (normalized.includes('abductor')) return 'Abductor';
  if (normalized.includes('companion')) return 'Companion';
  if (normalized === 'child' || normalized.includes('missingchild')) return 'Missing Child';
  return rawType.replace(/([a-z])([A-Z])/g, '$1 $2') || 'Related Person';
}

function samePerson(a, b) {
  const aId = personId(a);
  const bId = personId(b);
  if (aId && bId && aId === bId) return true;

  const aSequence = sequenceNumber(a);
  const bSequence = sequenceNumber(b);
  if (aId && bSequence && aId === bSequence) return true;
  if (bId && aSequence && bId === aSequence) return true;
  if (aSequence && bSequence && aSequence === bSequence) return true;

  const aName = normalizedName(a);
  const bName = normalizedName(b);
  return Boolean(aName && bName && aName === bName);
}

function relatedPeople(payload, selectedAlert) {
  const people = [
    ...arrayItems(payload?.related_people),
    ...arrayItems(payload?.companions),
    ...arrayItems(payload?.data),
    ...arrayItems(payload?.childBean?.personList),
  ].filter((person) => !samePerson(person, selectedAlert));

  return uniqueItems(people, (person) => (
    personId(person) || `${readablePersonType(person)}:${normalizedName(person)}`
  ));
}

function vehicleItems(payload, selectedAlert) {
  const people = relatedPeople(payload, selectedAlert);
  const vehicles = [
    ...arrayItems(payload?.vehicles),
    ...arrayItems(payload?.childBean?.vehicleList),
    ...arrayItems(selectedAlert?.vehicles),
    ...arrayItems(selectedAlert?.vehicleList),
    ...people.flatMap((person) => [
      ...arrayItems(person?.vehicles),
      ...arrayItems(person?.vehicleList),
    ]),
  ];

  return uniqueItems(vehicles, (vehicle) => (
    normalizeText(vehicle.vehicle_id || vehicle.vehicleId)
    || [vehicle.license_plate, vehicle.licensePlateText, vehicle.summary].map(normalizeText).join(':')
  ));
}

function vehicleSummary(vehicle) {
  return firstValue(vehicle, ['summary'])
    || joinValues([
      firstValue(vehicle, ['year', 'modelYear']),
      firstValue(vehicle, ['color', 'colorPrimary', 'primaryColor']),
      firstValue(vehicle, ['make']),
      firstValue(vehicle, ['model']),
      firstValue(vehicle, ['style', 'bodyStyle']),
    ]);
}

function appendRelatedPeople(container, payload, selectedAlert) {
  const people = relatedPeople(payload, selectedAlert);
  if (!people.length) return;

  const section = document.createElement('section');
  section.className = 'amber-alerts-related';
  const heading = document.createElement('h4');
  heading.textContent = 'Related People';
  const list = document.createElement('div');
  list.className = 'amber-alerts-related-list';

  people.forEach((person) => {
    const row = document.createElement('article');
    row.className = 'amber-alerts-related-person';
    const image = detailImage({ data: [person] }, person);
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = alertName(person);
      img.loading = 'lazy';
      row.append(img);
    }

    const content = document.createElement('div');
    const title = document.createElement('h5');
    title.textContent = alertName(person);
    const type = document.createElement('p');
    type.textContent = readablePersonType(person);
    const details = document.createElement('dl');
    appendDetailRows(details, [
      ['Age', firstValue(person, ['age', 'ageNow'])],
      ['Gender', firstValue(person, ['sex', 'gender'])],
      ['Race', firstValue(person, ['race', 'skinColor'])],
      ['Hair Color', firstValue(person, ['hairColor'])],
      ['Eye Color', firstValue(person, ['eyeColor'])],
      ['Height', firstValue(person, ['height'])],
      ['Weight', firstValue(person, ['weight'])],
    ]);
    content.append(title, type, details);
    row.append(content);
    list.append(row);
  });

  section.append(heading, list);
  container.append(section);
}

function appendVehicles(container, payload, selectedAlert) {
  const vehicles = vehicleItems(payload, selectedAlert);
  if (!vehicles.length) return;

  const section = document.createElement('section');
  section.className = 'amber-alerts-related';
  const heading = document.createElement('h4');
  heading.textContent = vehicles.length > 1 ? 'Vehicles' : 'Vehicle';
  const list = document.createElement('div');
  list.className = 'amber-alerts-vehicle-list';

  vehicles.forEach((vehicle) => {
    const details = document.createElement('dl');
    appendDetailRows(details, [
      ['Vehicle', vehicleSummary(vehicle)],
      ['License Plate', firstValue(vehicle, ['license_plate', 'licensePlateText', 'licensePlate'])],
      ['License State', firstValue(vehicle, ['license_state', 'licensePlateState', 'plateState'])],
      ['Description', firstValue(vehicle, ['description', 'vehicleDescription'])],
    ]);
    list.append(details);
  });

  section.append(heading, list);
  container.append(section);
}

function renderDetail(container, payload, sourceAlert, onBack) {
  container.replaceChildren();
  const alert = matchingDetailAlert(payload, sourceAlert);
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
    ['NCMEC', firstValue(alert, ['ncmecNumber', 'ncmecCaseNumber', 'caseNumber'])],
    ['NCIC', firstValue(alert, ['ncicNumber', 'ncic'])],
    ['Missing From', alert.missing_location || alert.missingLocation],
    ['Alert Date', alert.missing_date || alert.missingDate],
    ['Missing Since', firstValue(alert, ['missingDate', 'dateMissing', 'missingSince'])],
    ['Issued For', alert.issued_for || alert.issuedFor],
    ['Age Now', firstValue(alert, ['age', 'ageNow'])],
    ['Age Missing', firstValue(alert, ['ageMissing', 'missingAge'])],
    ['Gender', firstValue(alert, ['sex', 'gender'])],
    ['Race', firstValue(alert, ['race'])],
    ['Hair Color', firstValue(alert, ['hairColor'])],
    ['Eye Color', firstValue(alert, ['eyeColor'])],
    ['Height', joinValues([firstValue(alert, ['height']), firstValue(alert, ['heightTo'])])],
    ['Weight', joinValues([firstValue(alert, ['weight']), firstValue(alert, ['weightTo'])])],
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
  appendRelatedPeople(content, payload, alert);
  appendVehicles(content, payload, alert);
  appendImageGallery(content, alert);
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

  const disclosure = document.createElement('p');
  disclosure.className = 'amber-alerts-disclosure';
  disclosure.textContent = config.disclosure;

  inner.append(header, controls, status, list);
  if (config.disclosure) inner.append(disclosure);
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
      renderDetail(list, payload, alert, restoreList);
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
