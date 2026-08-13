import {
  buildAmberPosterDetailHref,
  buildCleanPosterPath,
  buildPosterDetailHref,
  currentPosterPagePath,
} from '../../scripts/poster-link-utils.js';

const DEFAULTS = {
  heading: 'Poster Results',
  eyebrow: 'Poster Search',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  submitLabel: 'Search',
  submitTipUrl: '/gethelpnow/cybertipline',
  organizationLogo: new URL('./NCMEC_Heart_Logo.png', import.meta.url).href,
  organizationLogoAlt: 'National Center for Missing & Exploited Children',
  qrCodeUrl: '',
  qrCodeLabel: 'this QR Code',
};

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  eyebrow: ['eyebrow', 'label'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  submitLabel: ['submit label', 'button label'],
  submitTipUrl: ['submit tip url', 'tip url'],
  organizationLogo: ['organization logo', 'detail footer logo', 'logo'],
  organizationLogoAlt: ['organization logo alt', 'detail footer logo alt', 'logo alt'],
  qrCodeUrl: ['qr code url', 'qr code pdf url'],
  qrCodeLabel: ['qr code label', 'qr code link label'],
};

const STATES = [
  ['All', 'State'],
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

const COUNTRIES = [
  ['All', 'Country'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['MX', 'Mexico'],
];

const RACES = [
  ['All', 'Race'],
  ['Am. Ind.', 'Am. Ind.'],
  ['Asian', 'Asian'],
  ['Biracial', 'Biracial'],
  ['Black', 'Black'],
  ['Hispanic', 'Hispanic'],
  ['Pacific Islander', 'Pacific Islander'],
  ['Unknown', 'Unknown'],
  ['White', 'White'],
];

const HAIR_COLORS = [
  ['All', 'Hair Color'],
  ['Auburn', 'Auburn'],
  ['Bald', 'Bald'],
  ['Black', 'Black'],
  ['Blonde', 'Blonde'],
  ['Brown', 'Brown'],
  ['Grey', 'Grey'],
  ['Lt. Brown', 'Lt. Brown'],
  ['Red', 'Red'],
  ['Salt Pepper', 'Salt Pepper'],
  ['Sandy', 'Sandy'],
  ['Unknown', 'Unknown'],
  ['White', 'White'],
];

const EYE_COLORS = [
  ['All', 'Eye Color'],
  ['Black', 'Black'],
  ['Blue', 'Blue'],
  ['Brown', 'Brown'],
  ['Green', 'Green'],
  ['Grey', 'Grey'],
  ['Hazel', 'Hazel'],
  ['Pink', 'Pink'],
  ['Unknown', 'Unknown'],
];

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizePosterHeading(value) {
  const heading = normalizeText(value);
  return heading === 'Search Missing Children Posters' ? DEFAULTS.heading : heading;
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function joinValues(values, separator = ', ') {
  return values.map(normalizeText).filter(Boolean).join(separator);
}

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getReferenceValue(source) {
  if (!source) return '';
  const link = source.tagName === 'A'
    ? source
    : source.querySelector('[href]') || source.closest('a[href]');
  const media = source.tagName === 'IMG' ? source : source.querySelector('img');

  return normalizeText(
    link?.getAttribute('href')
      || media?.getAttribute('src')
      || source.getAttribute('href')
      || source.getAttribute('src')
      || source.getAttribute('data-href')
      || source.getAttribute('data-src')
      || source.getAttribute('data-path')
      || source.getAttribute('data-url')
      || source.textContent,
  );
}

function getPropValue(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  return getReferenceValue(source);
}

function getLegacyValue(block, name, columnIndex) {
  const labels = FIELD_LABELS[name] || [];
  const labeledRow = getRows(block).find((row) => {
    if (row.children.length !== 2) return false;
    const label = normalizeText(row.children[0].textContent).toLowerCase();
    return labels.some((entry) => label === entry || label.includes(entry));
  });

  if (labeledRow) {
    return getReferenceValue(labeledRow.children[1]);
  }

  const compactRow = getRows(block)[columnIndex];
  if (compactRow) {
    const compactValue = getReferenceValue(compactRow.children[0] || compactRow);
    if (compactValue) return compactValue;
  }

  const configRow = getRows(block)[0];
  const cell = configRow ? [...configRow.children][columnIndex] : null;
  return getReferenceValue(cell);
}

function getFieldValue(block, name, columnIndex, fallback = '') {
  return getPropValue(block, name) || getLegacyValue(block, name, columnIndex) || fallback;
}

function getAuthoredAssetValue(block, name, columnIndex, extensionPattern) {
  const direct = getPropValue(block, name) || getLegacyValue(block, name, columnIndex);
  if (extensionPattern.test(direct)) return direct;

  const field = block.querySelector(`[data-aue-prop="${name}"]`);
  const fieldLink = getReferenceValue(field);
  if (extensionPattern.test(fieldLink)) return fieldLink;

  const legacyCell = getRows(block)[0]?.children[columnIndex];
  const legacyLink = getReferenceValue(legacyCell);
  if (extensionPattern.test(legacyLink)) return legacyLink;

  const compactCell = getRows(block)[columnIndex]?.children[0] || getRows(block)[columnIndex];
  const compactLink = getReferenceValue(compactCell);
  if (extensionPattern.test(compactLink)) return compactLink;

  const matchingLink = [...block.querySelectorAll('a[href]')]
    .map((link) => link.getAttribute('href') || '')
    .find((href) => extensionPattern.test(href));

  return matchingLink || direct || fieldLink || legacyLink;
}

function createField(labelText, name, type = 'text', placeholder = '') {
  const label = document.createElement('label');
  label.className = 'poster-results-field';

  const span = document.createElement('span');
  span.className = 'poster-results-field-label';
  span.textContent = labelText;

  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.placeholder = placeholder;
  input.autocomplete = 'off';

  label.append(span, input);
  return input;
}

function createSelect(labelText, name, options) {
  const label = document.createElement('label');
  label.className = 'poster-results-field';

  const span = document.createElement('span');
  span.className = 'poster-results-field-label';
  span.textContent = labelText;

  const select = document.createElement('select');
  select.name = name;
  options.forEach(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  });

  label.append(span, select);
  return select;
}

function createInfoTooltip(text) {
  const tip = document.createElement('span');
  tip.className = 'poster-results-near-me-tip';
  tip.tabIndex = 0;
  tip.setAttribute('aria-label', text);
  tip.append(document.createTextNode('i'));

  const tooltip = document.createElement('span');
  tooltip.className = 'poster-results-near-me-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.textContent = text;
  tip.append(tooltip);
  return tip;
}

function createRadioGroup(labelText, name, options) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'poster-results-radio-group';

  const legend = document.createElement('legend');
  legend.textContent = labelText;
  fieldset.append(legend);

  options.forEach(([value, text, tooltipText], index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = index === 0;
    label.append(input, document.createTextNode(text));
    if (tooltipText) label.append(createInfoTooltip(tooltipText));
    fieldset.append(label);
  });

  return fieldset;
}
function createSortToggle(options) {
  const control = document.createElement('div');
  control.className = 'poster-results-sort-toggle';
  control.setAttribute('role', 'group');
  control.setAttribute('aria-label', 'Sort results');

  const label = document.createElement('span');
  label.className = 'poster-results-sort-label';
  label.textContent = 'Sort by';
  control.append(label);

  const buttons = document.createElement('div');
  buttons.className = 'poster-results-sort-options';
  options.forEach(([value, text], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster-results-sort-option';
    button.dataset.sort = value;
    button.textContent = text;
    button.setAttribute('aria-pressed', String(index === 0));
    if (index === 0) button.classList.add('is-active');
    buttons.append(button);
  });
  control.append(buttons);
  return control;
}

function setStatus(node, message, type = '') {
  node.className = `poster-results-status${type ? ` is-${type}` : ''}`;
  node.textContent = message;
  node.hidden = !message;
}

// The poster API can take a couple of seconds to respond (photos are encoded
// server-side), so paint a poster-shaped placeholder immediately instead of
// leaving the visitor on a blank page. renderPosterDetail/renderAmberPosterDetail
// both replaceChildren() on the same container, so this clears itself on render.
function renderPosterSkeleton(container) {
  const skeleton = document.createElement('div');
  skeleton.className = 'poster-results-skeleton';
  skeleton.setAttribute('aria-hidden', 'true');

  const photo = document.createElement('div');
  photo.className = 'poster-results-skeleton-photo';

  const lines = document.createElement('div');
  lines.className = 'poster-results-skeleton-lines';
  ['title', 'sub', 'row', 'row', 'row', 'row'].forEach((variant) => {
    const line = document.createElement('span');
    line.className = `poster-results-skeleton-line is-${variant}`;
    lines.append(line);
  });

  skeleton.append(photo, lines);
  container.append(skeleton);
}

function fullName(person) {
  return [person.firstName, person.middleName, person.lastName]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');
}

function displayName(person, fallback = 'Missing child poster') {
  return fullName(person) || normalizeText(person?.fullName || person?.name) || fallback;
}

function locationText(person) {
  return [
    person.missingCity || person.city || person.foundCity,
    person.missingState || person.state || person.foundState,
    person.missingCountry || person.country || person.foundCountry,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(', ');
}

function posterReference(person) {
  return [person.orgPrefix, person.caseNumber, person.seqNumber || 1]
    .map(normalizeText)
    .filter(Boolean)
    .join('/');
}

function posterDetailUrl(person) {
  const [provider, caseNumber, seqNumber = '1'] = posterReference(person).split('/');
  const personType = person?.isChild === false ? 'related' : '';
  return buildPosterDetailHref({
    provider,
    caseNumber,
    sequenceNumber: seqNumber,
    posterPagePath: currentPosterPagePath(),
    details: {
      name: displayName(person, ''),
      image_url: normalizeText(person.image_url || person.imageUrl),
      thumbnail_url: normalizeText(person.thumbnail_url || person.thumbnailUrl),
      missing_city: normalizeText(person.missingCity || person.city),
      missing_state: normalizeText(person.missingState || person.state),
      missing_country: normalizeText(person.missingCountry || person.country),
      missing_date: normalizeText(person.missingDate || person.dateMissing || person.missingSince),
      age: normalizeText(person.age || person.ageNow),
      org_name: normalizeText(person.orgName),
      person_type: personType,
    },
  });
}

function amberCaseNumber(alert) {
  return normalizeText(
    alert?.case_number || alert?.caseNumber || alert?.amberId || alert?.amberCaseNumber,
  );
}

function canonicalPosterPath(directRequest) {
  if (!directRequest) return '';

  if (directRequest.type === 'amber') {
    return buildCleanPosterPath({
      provider: 'AMBER',
      caseNumber: directRequest.caseNumber,
      sequenceNumber: directRequest.personId || directRequest.seqNumber || '1',
    });
  }

  return buildCleanPosterPath({
    provider: directRequest.provider,
    caseNumber: directRequest.caseNumber,
    sequenceNumber: directRequest.num || '1',
  });
}

function replaceWithCanonicalPosterUrl(directRequest) {
  if (directRequest?.preview
    || (directRequest?.type === 'amber' && (directRequest.personId || directRequest.name))) return;

  const canonicalPath = canonicalPosterPath(directRequest);
  if (!canonicalPath || !window.history?.replaceState) return;

  const personType = directRequest.personType === 'related' ? '?person_type=related' : '';
  const canonicalUrl = `${canonicalPath}${personType}${window.location.hash}`;
  if (`${window.location.pathname}${window.location.hash}` !== canonicalUrl || window.location.search) {
    window.history.replaceState(null, '', canonicalUrl);
  }
}

function hasRenderablePosterPayload(payload) {
  const children = Array.isArray(payload?.children) ? payload.children : [];
  const child = children[0] || payload || {};
  const hasPhoto = normalizeText(
    child.image_url
      || child.thumbnail_url
      || child.imageUrl
      || child.thumbnailUrl
      || child.image?.image_url,
  ) || (Array.isArray(child.photos) && child.photos.length > 0);
  const hasLocation = normalizeText(
    child.missingCity
      || child.city
      || child.missingState
      || child.state
      || child.missingCountry
      || child.country,
  );
  const hasMissingDate = normalizeText(
    payload?.missingDate
      || payload?.dateMissing
      || payload?.missingSince
      || child.missingDate
      || child.dateMissing
      || child.missingSince,
  );
  return Boolean(
    normalizeText(payload?.caseNumber || child.caseNumber)
      || displayName(child, '')
      || hasPhoto
      || hasLocation
      || hasMissingDate,
  );
}

function computedPosterImageUrl(provider, caseNumber, seqNumber, size = '') {
  if (!provider || !caseNumber) return '';
  const suffix = size === 'thumbnail' ? 't' : '';
  return `https://api.missingkids.org/photographs/${provider}${caseNumber}c${seqNumber}${suffix}.jpg`;
}

function fallbackPosterPayload(directRequest) {
  if (!directRequest || directRequest.type !== 'poster') return {};

  const params = new URLSearchParams(window.location.search);
  const provider = normalizeText(directRequest.provider).toUpperCase();
  const caseNumber = normalizeText(directRequest.caseNumber);
  const seqNumber = normalizeText(directRequest.num) || '1';
  const imageUrl = normalizeText(params.get('image_url'))
    || computedPosterImageUrl(provider, caseNumber, seqNumber);
  const thumbnailUrl = normalizeText(params.get('thumbnail_url'))
    || computedPosterImageUrl(provider, caseNumber, seqNumber, 'thumbnail');
  const missingLocation = normalizeText(params.get('missing_location'));

  return {
    success: 1,
    version: 2,
    caseNumber,
    children: [{
      caseNumber,
      orgPrefix: provider,
      orgName: normalizeText(params.get('org_name')),
      seqNumber,
      name: normalizeText(params.get('name')),
      fullName: normalizeText(params.get('name')),
      image_url: imageUrl,
      imageUrl,
      thumbnail_url: thumbnailUrl,
      thumbnailUrl,
      missingCity: normalizeText(params.get('missing_city') || missingLocation),
      missingState: normalizeText(params.get('missing_state')),
      missingCountry: normalizeText(params.get('missing_country')),
      missingDate: normalizeText(params.get('missing_date')),
      age: normalizeText(params.get('age')),
    }],
  };
}

function posterPayloadForRender(payload, directRequest) {
  if (hasRenderablePosterPayload(payload)) return payload;

  // eslint-disable-next-line no-console
  console.warn('[poster-results] Poster detail API returned no renderable data; using fallback.', {
    directRequest,
    payload,
  });

  return fallbackPosterPayload(directRequest);
}

function sequenceNumber(person) {
  return normalizeText(person?.sequence_number || person?.seqNumber || person?.seqNum);
}

function personId(person) {
  return normalizeText(person?.personId || person?.personID || person?.id);
}

function amberPosterDetailUrl(alert, fallbackCaseNumber = '') {
  const caseNumber = amberCaseNumber(alert) || normalizeText(fallbackCaseNumber);
  if (!caseNumber) return '';

  return buildAmberPosterDetailHref({
    caseNumber,
    sequenceNumber: personId(alert) || sequenceNumber(alert) || '1',
    personId: personId(alert),
    name: displayName(alert, ''),
    posterPagePath: currentPosterPagePath(),
  });
}

function normalizedPersonName(person) {
  return displayName(person, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchingPerson(payload, sourcePerson = {}) {
  let people = [];
  if (Array.isArray(payload?.data)) {
    people = payload.data;
  } else if (Array.isArray(payload?.children)) {
    people = payload.children;
  }
  if (!people.length) return sourcePerson || payload || {};

  const sourceId = personId(sourcePerson);
  if (sourceId) {
    const match = people.find((person) => personId(person) === sourceId);
    if (match) return match;
  }

  const sourceSequence = sequenceNumber(sourcePerson);
  if (sourceSequence) {
    const match = people.find((person) => (
      sequenceNumber(person) === sourceSequence || personId(person) === sourceSequence
    ));
    if (match) return match;
  }

  const sourceName = normalizedPersonName(sourcePerson);
  if (sourceName) {
    const match = people.find((person) => normalizedPersonName(person) === sourceName);
    if (match) return match;
  }

  return people.length === 1 ? people[0] : sourcePerson;
}

function firstValue(source, keys) {
  return keys.map((key) => source?.[key]).find((value) => normalizeText(value)) || '';
}

function deepFirstValue(source, keys, depth = 0) {
  if (!source || typeof source !== 'object' || depth > 4) return '';

  const direct = firstValue(source, keys);
  if (direct) return direct;

  return Object.values(source).reduce((found, value) => {
    if (found) return found;
    if (Array.isArray(value)) {
      return value.reduce((arrayFound, item) => (
        arrayFound || deepFirstValue(item, keys, depth + 1)
      ), '');
    }
    return deepFirstValue(value, keys, depth + 1);
  }, '');
}

function detailDeepValue(payload, child, keys) {
  return firstValue(child, keys)
    || firstValue(payload, keys)
    || deepFirstValue(child, keys)
    || deepFirstValue(payload, keys);
}

function firstArrayItem(...values) {
  return values.flatMap((value) => (Array.isArray(value) ? value : [])).find(Boolean) || {};
}

function firstArrayValue(value) {
  return Array.isArray(value) ? normalizeText(value[0]) : normalizeText(value);
}

function formatPhoneNumber(value) {
  const text = normalizeText(value);
  const digits = text.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return text;
}

function photoSource(photo) {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  if (photo.base64) return `data:image/jpeg;base64,${photo.base64}`;
  return photo.url || photo.photoUrl || photo.photoUri || '';
}

function photoSourcesForFields(child, fields) {
  return fields
    .flatMap((key) => (Array.isArray(child?.[key]) ? child[key] : []))
    .map(photoSource)
    .map(normalizeText)
    .filter(Boolean);
}

function primaryPhotoSources(child) {
  return [
    ...photoSourcesForFields(child, ['photos']),
    child?.image_url,
    child?.thumbnail_url,
    child?.imageUrl,
    child?.thumbnailUrl,
    child?.image?.image_url,
  ].map(normalizeText).filter(Boolean);
}

function childPhotoSources(child) {
  return [
    ...photoSourcesForFields(child, ['photos', 'ageProgressionPhotos', 'extraPhotos']),
    ...primaryPhotoSources(child),
  ];
}

function createDetailRow(label, value) {
  // Some fields (e.g. unidentified `races`) arrive as arrays; render them joined.
  const display = Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean).join(', ')
    : normalizeText(value);
  if (!display) return null;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = display;
  return [dt, dd];
}

function appendDetailRows(list, rows) {
  rows.forEach(([label, value]) => {
    const row = createDetailRow(label, value);
    if (row) list.append(...row);
  });
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

  const aName = normalizedPersonName(a);
  const bName = normalizedPersonName(b);
  return Boolean(aName && bName && aName === bName);
}

function relatedAmberPeople(payload, selectedPerson) {
  const people = [
    ...arrayItems(payload?.related_people),
    ...arrayItems(payload?.companions),
    ...arrayItems(payload?.data),
    ...arrayItems(payload?.childBean?.personList),
  ].filter((person) => !samePerson(person, selectedPerson));

  return uniqueItems(people, (person) => (
    personId(person) || `${readablePersonType(person)}:${normalizedPersonName(person)}`
  ));
}

function vehicleItems(payload, selectedPerson) {
  const people = relatedAmberPeople(payload, selectedPerson);
  const vehicles = [
    ...arrayItems(payload?.vehicles),
    ...arrayItems(payload?.childBean?.vehicleList),
    ...arrayItems(selectedPerson?.vehicles),
    ...arrayItems(selectedPerson?.vehicleList),
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
    ], ' ');
}

function createLinkedNameElement(tagName, name, href, className = '') {
  const title = document.createElement(tagName);
  if (className) title.className = className;
  if (!href) {
    title.textContent = name;
    return title;
  }

  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'poster-results-linked-name';
  link.textContent = name;
  title.append(link);
  return title;
}

function amberVehicleRows(vehicle) {
  const rows = [
    ['Make', firstValue(vehicle, ['make'])],
    ['Model', firstValue(vehicle, ['model'])],
    ['Year', firstValue(vehicle, ['year', 'modelYear'])],
    ['Color', firstValue(vehicle, ['color', 'colorPrimary', 'primaryColor'])],
    ['License plate', firstValue(vehicle, ['license_plate', 'licensePlateText', 'licensePlate'])],
    ['License state', firstValue(vehicle, ['license_state', 'licensePlateState', 'plateState'])],
    ['Description', firstValue(vehicle, ['description', 'vehicleDescription'])],
  ];

  if (!rows.some(([, value]) => normalizeText(value))) {
    rows.unshift(['Vehicle', vehicleSummary(vehicle)]);
  }

  return rows;
}

function appendPhotoGallery(container, child, name, sources = childPhotoSources(child)) {
  const photos = [...new Set(sources)];
  if (photos.length <= 1) return;

  const gallery = document.createElement('div');
  gallery.className = 'poster-results-detail-gallery';
  photos.forEach((src) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster-results-detail-thumb';
    const img = document.createElement('img');
    img.src = src;
    img.alt = name;
    img.loading = 'lazy';
    button.append(img);
    button.addEventListener('click', () => {
      const main = container.querySelector('.poster-results-detail-media img');
      if (main) main.src = src;
    });
    gallery.append(button);
  });
  container.querySelector('.poster-results-detail-body')?.append(gallery);
}

function createSupplementaryPhotoSection(title, sources, name) {
  const photos = [...new Set(sources)];
  if (!photos.length) return null;

  const section = document.createElement('section');
  section.className = 'poster-results-participant poster-results-supplementary-photos';

  const heading = document.createElement('h4');
  heading.className = 'poster-results-participant-heading';
  heading.textContent = title;
  section.append(heading);

  const layout = document.createElement('div');
  layout.className = 'poster-results-detail-layout';
  const media = document.createElement('div');
  media.className = 'poster-results-detail-media';
  const [firstPhoto] = photos;
  const image = document.createElement('img');
  image.src = firstPhoto;
  image.alt = `${name} - ${title}`;
  image.loading = 'lazy';
  media.append(image);

  const body = document.createElement('div');
  body.className = 'poster-results-detail-body';
  appendPhotoGallery({
    querySelector: (selector) => (selector === '.poster-results-detail-media img' ? image : body),
  }, null, name, photos);

  layout.append(media, body);
  section.append(layout);
  return section;
}

function formatAgencyLine(payload, child) {
  const contact = firstArrayItem(child?.contacts, payload?.contacts);
  const agency = detailDeepValue(payload, child, [
    'investigatingAgency',
    'lawEnforcementAgency',
    'policeDepartment',
    'agencyName',
    'contactAgency',
    'policeDepartmentName',
    'investigatingAgencyName',
    'investigatingAgencyDisplayName',
    'leadAgency',
    'leadAgencyName',
    'displayAgency',
    'displayAgencyName',
    'orgName',
    'departmentName',
  ]) || normalizeText(contact.name);
  const agencyState = detailDeepValue(payload, child, [
    'investigatingAgencyState',
    'lawEnforcementAgencyState',
    'policeDepartmentState',
    'agencyState',
    'leadAgencyState',
    'orgState',
    'state',
  ]) || normalizeText(contact.state);
  const phone = detailDeepValue(payload, child, [
    'agencyPhone',
    'phone',
    'phoneNumber',
    'contactPhone',
    'lawEnforcementPhone',
    'investigatingAgencyPhone',
    'investigatingAgencyPhoneNumber',
    'policeDepartmentPhone',
    'agencyPhoneNumber',
    'leadAgencyPhone',
    'leadAgencyPhoneNumber',
    'orgPhone',
    'telephone',
    'telephoneNumber',
    'phoneNumbers',
  ]) || firstArrayValue(contact.phoneNumbers);

  const agencyWithState = agency && agencyState && !agency.includes(`(${agencyState})`)
    ? `${agency} (${agencyState})`
    : agency;

  return { agency: agencyWithState, phone: formatPhoneNumber(phone) };
}

function agencyLines(payload, child) {
  const contacts = uniqueItems([
    ...arrayItems(child?.contacts),
    ...arrayItems(payload?.contacts),
  ], (contact) => [
    normalizeText(contact.name),
    normalizeText(contact.state),
    firstArrayValue(contact.phoneNumbers),
  ].join(':')).map((contact) => {
    const name = normalizeText(contact.name);
    const state = normalizeText(contact.state);
    return {
      agency: name && state && !name.includes(`(${state})`) ? `${name} (${state})` : name,
      phone: formatPhoneNumber(firstArrayValue(contact.phoneNumbers)),
    };
  }).filter(({ agency, phone }) => agency || phone);

  if (contacts.length) return contacts;

  const fallback = formatAgencyLine(payload, child);
  return fallback.agency || fallback.phone ? [fallback] : [];
}

function posterNarrative(payload, child) {
  const keys = [
    'circumstances',
    'circumstance',
    'missingCircumstances',
    'caseCircumstances',
    'description',
    'posterDescription',
    'posterText',
    'posterCopy',
    'remarks',
    'remark',
    'caseRemarks',
    'comment',
    'comments',
    'narrative',
    'childDescription',
    'otherInfo',
    'additionalInformation',
  ];
  return detailDeepValue(payload, child, keys);
}

function createActionLink(label, href) {
  const link = document.createElement('a');
  link.className = 'poster-results-detail-action';
  link.href = href;
  link.textContent = label;
  return link;
}

function createActionButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'poster-results-detail-action';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createShareButton() {
  return createActionButton('SHARE', () => {
    const shareData = {
      title: document.title,
      url: window.location.href,
    };

    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
      return;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  });
}

function createActionBar(config, options = {}) {
  const { includePrint = true } = options;
  const actions = document.createElement('div');
  actions.className = 'poster-results-detail-actions';

  actions.append(createActionLink('CALL 911', 'tel:911'));
  actions.append(createActionLink('SUBMIT A TIP', config.submitTipUrl));
  if (includePrint) {
    actions.append(createActionButton('PRINT POSTER', () => window.print()));
  }
  actions.append(createShareButton());

  return actions;
}

function createOrganizationMark(config) {
  const wrap = document.createElement('div');
  wrap.className = 'poster-results-detail-logo';

  if (config.organizationLogo) {
    const img = document.createElement('img');
    img.src = config.organizationLogo;
    img.alt = config.organizationLogoAlt;
    wrap.append(img);
    return wrap;
  }

  const kicker = document.createElement('span');
  kicker.textContent = 'National Center for';
  const name = document.createElement('strong');
  name.textContent = 'Missing & Exploited';
  const suffix = document.createElement('span');
  suffix.textContent = 'Children';
  wrap.append(kicker, name, suffix);
  return wrap;
}

function createDetailFooter(config, payload, child) {
  const footer = document.createElement('div');
  footer.className = 'poster-results-detail-footer';
  footer.append(createOrganizationMark(config));

  const info = document.createElement('div');
  info.className = 'poster-results-detail-footer-info';

  const agencies = agencyLines(payload, child);
  if (agencies.length) {
    const agency = document.createElement('p');
    agency.className = 'poster-results-detail-agency';
    agencies.forEach((entry, index) => {
      if (index) agency.append(document.createTextNode(' or '));
      agency.append(document.createTextNode(entry.agency || 'Law Enforcement Agency'));
      if (entry.phone) {
        const phone = document.createElement('a');
        phone.href = `tel:${entry.phone.replace(/[^\d+]/g, '')}`;
        phone.textContent = entry.phone;
        agency.append(document.createTextNode(' '), phone);
      }
    });
    info.append(agency);
  }

  const caseNumber = payload?.caseNumber
    || payload?.case_number
    || child.caseNumber
    || child.case_number;
  if (caseNumber) {
    const ncmec = document.createElement('p');
    ncmec.className = 'poster-results-detail-case';
    ncmec.textContent = `NCMEC: ${caseNumber}`;
    info.append(ncmec);
  }

  footer.append(info);
  return footer;
}

function createMissingChildHeading(label = 'Missing Child') {
  const heading = document.createElement('div');
  heading.className = 'poster-results-missing-child-heading';
  const start = document.createElement('span');
  const text = document.createElement('h1');
  text.textContent = label;
  const end = document.createElement('span');
  heading.append(start, text, end);
  return heading;
}

function isUnidentifiedPoster(payload, child) {
  return payload?.unidentified === true
    || Boolean(normalizeText(child?.dateFound || child?.foundCity || child?.foundState));
}

function posterTypeLabel(children, unidentified) {
  if (unidentified) return 'Unidentified';
  return children.length > 1 ? 'Missing Children' : 'Missing Child';
}

// Simple line icons (Lucide-style) shown beside each fact, matching the legacy
// poster. stroke="currentColor" so they inherit the surrounding text color.
const POSTER_FACT_ICONS = {
  date: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  location: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  age: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/>',
  gender: '<circle cx="12" cy="8" r="4"/><path d="M6 21v-1a6 6 0 0 1 12 0v1"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  vehicle: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  id: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h.01"/><path d="M11 7h6"/><path d="M11 11h6"/><path d="M11 15h6"/><path d="M7 11h.01"/><path d="M7 15h.01"/>',
};

function posterFactIcon(name) {
  const icon = document.createElement('span');
  icon.className = 'poster-results-fact-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${POSTER_FACT_ICONS[name] || ''}</svg>`;
  return icon;
}

function formatPosterDate(value) {
  const text = normalizeText(value);
  if (!text) return '';

  const dateOnly = text.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(?:AM|PM)?$/i, '').trim();
  const isoDate = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!isoDate) return dateOnly || text;

  const [, year, month, day] = isoDate;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)) return dateOnly;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatPosterLocation(value) {
  return normalizeText(value)
    .replace(/,\s*(?:US|USA|United States)$/i, '')
    .trim();
}
function capitalizeWords(value) {
  return normalizeText(value).toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function participantFacts(person, unidentified) {
  const date = formatPosterDate(firstValue(person, ['missingDate', 'dateMissing', 'missingSince', 'dateFound', 'foundDate']));
  const location = formatPosterLocation(locationText(person));
  const age = firstValue(person, ['approximateAge', 'age', 'ageNow']);
  const gender = firstValue(person, ['sex', 'gender']);

  const facts = [];
  if (date) facts.push({ icon: 'date', label: unidentified ? 'Date Found' : 'Missing Since', value: date });
  if (location) facts.push({ icon: 'location', label: unidentified ? 'Location Found' : '', value: location });
  if (age && `${age}` !== '-1') {
    facts.push({ icon: 'age', label: unidentified ? 'Estimated Age' : 'Age Now', value: `${age} Years Old` });
  }
  if (gender) facts.push({ icon: 'gender', label: '', value: capitalizeWords(gender) });
  return facts;
}

function appendFactRows(container, facts) {
  facts.forEach(({ icon, label, value }) => {
    if (!normalizeText(value)) return;
    const row = document.createElement('p');
    row.className = 'poster-results-fact';
    row.append(posterFactIcon(icon));

    const text = document.createElement('span');
    text.className = 'poster-results-fact-text';
    if (label) {
      const strong = document.createElement('span');
      strong.className = 'poster-results-fact-label';
      strong.textContent = `${label}: `;
      text.append(strong);
    }
    text.append(document.createTextNode(value));
    row.append(text);
    container.append(row);
  });
}

function participantPosterUrl(payload, person, isMain, personType = '') {
  if (isMain) return '';
  const provider = normalizeText(
    person.orgPrefix || payload?.organizationCode || payload?.orgPrefix,
  );
  const caseNumber = normalizeText(
    person.caseNumber || payload?.caseNumber || payload?.case_number,
  );
  const seq = normalizeText(sequenceNumber(person));
  if (!provider || !caseNumber || !seq) return '';
  const href = buildCleanPosterPath({ provider, caseNumber, sequenceNumber: seq });
  return personType === 'related' ? `${href}?person_type=related` : href;
}

function buildParticipantSection(payload, {
  person, heading, main, unidentified, facts, href,
}) {
  const section = document.createElement('section');
  section.className = `poster-results-participant${main ? ' is-main' : ''}`;

  if (heading) {
    const headingEl = document.createElement('h4');
    headingEl.className = 'poster-results-participant-heading';
    headingEl.textContent = heading;
    section.append(headingEl);
  }

  const layout = document.createElement('div');
  layout.className = 'poster-results-detail-layout';

  const name = displayName(person, heading || 'Missing Child');
  const image = childPhotoSources(person)[0];
  if (image) {
    const media = document.createElement('div');
    media.className = 'poster-results-detail-media';
    const img = document.createElement('img');
    img.src = image;
    img.alt = name;
    img.loading = 'lazy';
    media.append(img);
    layout.append(media);
  }

  const body = document.createElement('div');
  body.className = 'poster-results-detail-body';

  const title = createLinkedNameElement(
    'h3',
    name,
    href === undefined ? participantPosterUrl(payload, person, main) : href,
    'poster-results-detail-name',
  );
  body.append(title);

  const ncic = firstValue(person, ['ncicNumber', 'ncic']);
  const namus = firstValue(person, ['namus', 'namUs', 'namusNumber', 'namUsNumber']);
  if (ncic || namus) {
    const ncicEl = document.createElement('p');
    ncicEl.className = 'poster-results-detail-ncic';
    ncicEl.textContent = [
      ncic ? `NCIC# ${ncic}` : '',
      namus ? `NamUs# ${namus}` : '',
    ].filter(Boolean).join(', ');
    body.append(ncicEl);
  }

  const factsEl = document.createElement('div');
  factsEl.className = 'poster-results-detail-facts';
  appendFactRows(factsEl, facts ?? participantFacts(person, unidentified));
  body.append(factsEl);

  if (main) {
    const narrative = posterNarrative(payload, person);
    if (narrative) {
      const copy = document.createElement('p');
      copy.className = 'poster-results-detail-copy';
      copy.textContent = narrative;
      body.append(copy);
    }
  }

  layout.append(body);
  section.append(layout);
  appendPhotoGallery(section, person, name, unidentified
    ? primaryPhotoSources(person)
    : childPhotoSources(person));
  return section;
}

function renderPosterDetail(container, meta, payload, config, onBack) {
  container.replaceChildren();
  meta.textContent = '';

  const children = Array.isArray(payload?.children) && payload.children.length
    ? payload.children
    : [payload || {}];
  const companions = arrayItems(payload?.companions);
  const mainChild = children[0] || {};
  const selectedRelated = payload?.selectedPersonType === 'related' && companions.length > 0;
  const unidentified = !selectedRelated && isUnidentifiedPoster(payload, mainChild);

  const detail = document.createElement('article');
  detail.className = 'poster-results-detail';

  detail.append(
    createMissingChildHeading(selectedRelated
      ? readablePersonType(companions[0])
      : posterTypeLabel(children, unidentified)),
    createActionBar(config),
  );

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'poster-results-detail-back';
  back.textContent = 'Back to results';
  back.addEventListener('click', onBack);
  detail.append(back);

  const childEntries = children.map((person, index) => {
    let heading = 'Associated Child';
    if (index === 0) heading = selectedRelated ? 'Missing Child' : '';
    return {
      person,
      main: !selectedRelated && index === 0,
      unidentified,
      heading,
    };
  });
  const companionEntries = companions.map((person, index) => ({
    person,
    main: selectedRelated && index === 0,
    unidentified: false,
    heading: capitalizeWords(firstValue(person, ['companionType']) || 'Companion'),
    href: selectedRelated && index === 0
      ? ''
      : participantPosterUrl(payload, person, false, 'related'),
  }));
  const otherRelatedEntries = [
    ...arrayItems(payload?.suspects),
    ...arrayItems(payload?.abductors),
    ...arrayItems(payload?.related_people),
    ...arrayItems(payload?.relatedPeople),
  ].map((person) => ({
    person,
    main: false,
    unidentified: false,
    heading: readablePersonType(person),
    href: participantPosterUrl(payload, person, false, 'related'),
  }));
  const entries = selectedRelated
    ? [...companionEntries, ...childEntries, ...otherRelatedEntries]
    : [...childEntries, ...companionEntries, ...otherRelatedEntries];

  uniqueItems(entries, (entry) => (
    personId(entry.person)
      || (sequenceNumber(entry.person)
        ? `${entry.main ? 'main' : entry.heading}:${sequenceNumber(entry.person)}`
        : '')
      || `${entry.heading}:${normalizedPersonName(entry.person)}`
  )).forEach((entry) => detail.append(buildParticipantSection(payload, entry)));
  if (unidentified) {
    const ageProgressionPhotos = createSupplementaryPhotoSection(
      'Age-Progression Photos',
      photoSourcesForFields(mainChild, ['ageProgressionPhotos']),
      displayName(mainChild, 'Unidentified Person'),
    );
    const extraPhotos = createSupplementaryPhotoSection(
      'Extra Photos',
      photoSourcesForFields(mainChild, ['extraPhotos']),
      displayName(mainChild, 'Unidentified Person'),
    );
    if (ageProgressionPhotos) detail.append(ageProgressionPhotos);
    if (extraPhotos) detail.append(extraPhotos);
  }
  detail.append(createDetailFooter(config, payload, mainChild));
  container.append(detail);
}

// Vehicle information is a peer section so AMBER posters follow the same
// stacked structure as missing-child posters.
function createAmberVehicleSection(payload, selectedPerson) {
  const vehicles = vehicleItems(payload, selectedPerson);
  if (!vehicles.length) return null;

  const section = document.createElement('section');
  section.className = 'poster-results-participant poster-results-amber-vehicle-section';

  const heading = document.createElement('h4');
  heading.className = 'poster-results-participant-heading';
  heading.textContent = 'Vehicle Information';
  section.append(heading);

  const list = document.createElement('div');
  list.className = 'poster-results-amber-vehicle-list';
  vehicles.forEach((vehicle) => {
    const details = document.createElement('dl');
    appendDetailRows(details, amberVehicleRows(vehicle));
    if (details.children.length) list.append(details);
  });

  if (list.children.length) section.append(list);
  return list.children.length ? section : null;
}

// AMBER alert metadata, shown below the red AMBER ALERT poster heading.
function createAmberBanner(payload, alert) {
  const banner = document.createElement('div');
  banner.className = 'poster-results-amber-banner';

  const meta = document.createElement('div');
  meta.className = 'poster-results-amber-banner-meta';

  const issuedValue = alert.issued_for || alert.issuedFor
    || firstValue(alert, ['state', 'missing_state', 'missingState']);
  const issuedFor = document.createElement('p');
  issuedFor.className = 'poster-results-amber-banner-issued';
  const issuedStrong = document.createElement('strong');
  issuedStrong.textContent = issuedValue || 'Active alert';
  issuedFor.append('Issued for ', issuedStrong);
  meta.append(issuedFor);

  const caseNumber = payload.case_number || payload.caseNumber
    || alert.case_number || alert.caseNumber;
  if (caseNumber) {
    const caseText = document.createElement('p');
    caseText.className = 'poster-results-amber-banner-case';
    caseText.textContent = `Alert #${caseNumber}`;
    meta.append(caseText);
  }

  if (payload?.preview === true) {
    const preview = document.createElement('p');
    preview.className = 'poster-results-amber-preview-notice';
    preview.textContent = 'Archived staging preview - not an active alert';
    banner.append(preview);
  }

  banner.append(meta);
  return banner;
}

// Physical-description spec rows shown for any AMBER person (subject or
// companion). Kept as a clean typographic grid so the icon facts above stay the
// visual focus, matching the modern poster's hierarchy.
function amberSpecRows(person) {
  return [
    ['Date of Birth', formatPosterDate(firstValue(person, ['dateOfBirth', 'birthDate', 'dob']))],
    ['Age Missing', firstValue(person, ['ageMissing', 'missingAge'])],
    ['Gender', capitalizeWords(firstValue(person, ['sex', 'gender']))],
    ['Race', capitalizeWords(firstValue(person, ['race', 'skinColor']))],
    ['Hair', capitalizeWords(firstValue(person, ['hairColor']))],
    ['Eyes', capitalizeWords(firstValue(person, ['eyeColor']))],
    ['Height', joinValues([firstValue(person, ['height']), firstValue(person, ['heightTo'])], ' - ')],
    ['Weight', joinValues([firstValue(person, ['weight']), firstValue(person, ['weightTo'])], ' - ')],
  ];
}

// Headline icon facts for an AMBER subject
// the missing-kids poster's icon fact rows.
function amberSubjectFacts(person) {
  const facts = [];
  const missing = formatPosterDate(firstValue(person, ['missing_date', 'missingDate', 'dateMissing', 'missingSince']));
  if (missing) facts.push({ icon: 'date', label: 'Missing Since', value: missing });
  const from = formatPosterLocation(firstValue(person, ['missing_location', 'missingLocation']) || locationText(person));
  if (from) facts.push({ icon: 'location', label: 'Missing From', value: from });
  const ageNow = firstValue(person, ['age', 'ageNow']);
  if (ageNow && `${ageNow}` !== '-1') {
    facts.push({ icon: 'age', label: 'Age Now', value: `${ageNow} Years Old` });
  }
  return facts;
}

function appendAmberSpecGrid(container, person) {
  const rows = amberSpecRows(person).filter(([, value]) => normalizeText(value));
  if (!rows.length) return;
  const specs = document.createElement('dl');
  specs.className = 'poster-results-amber-specs';
  rows.forEach(([label, value]) => {
    const cell = document.createElement('div');
    cell.className = 'poster-results-amber-spec';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = Array.isArray(value)
      ? value.map(normalizeText).filter(Boolean).join(', ')
      : normalizeText(value);
    cell.append(dt, dd);
    specs.append(cell);
  });
  container.append(specs);
}

// Modern companion sections: same stacked, icon-led treatment as the subject,
// so companions read as part of one poster instead of a boxed-off card.
function createAmberCompanionSection(payload, person, caseNumber) {
  const section = buildParticipantSection(payload, {
    person,
    heading: readablePersonType(person),
    main: false,
    facts: amberSubjectFacts(person),
    href: amberPosterDetailUrl(person, caseNumber),
  });
  section.classList.add('poster-results-amber-companion');
  appendAmberSpecGrid(section.querySelector('.poster-results-detail-body'), person);
  return section;
}

function renderAmberPosterDetail(container, meta, payload, sourceAlert, config) {
  container.replaceChildren();
  meta.textContent = '';

  const alert = matchingPerson(payload, sourceAlert);
  const name = displayName(alert, 'AMBER Alert');
  const imageSrc = childPhotoSources(alert)[0];
  const caseNumber = payload.case_number || payload.caseNumber
    || alert.case_number || alert.caseNumber;

  const detail = document.createElement('article');
  detail.className = 'poster-results-detail poster-results-amber-poster';
  detail.append(
    createMissingChildHeading('AMBER Alert'),
    createAmberBanner(payload, alert),
    createActionBar(config, { includePrint: false }),
  );

  const subject = document.createElement('section');
  subject.className = 'poster-results-participant is-main poster-results-amber-subject';
  const layout = document.createElement('div');
  layout.className = 'poster-results-detail-layout';

  if (imageSrc) {
    const media = document.createElement('div');
    media.className = 'poster-results-detail-media';
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = name;
    media.append(img);
    layout.append(media);
  }

  const body = document.createElement('div');
  body.className = 'poster-results-detail-body';
  body.append(createLinkedNameElement(
    'h3',
    name,
    amberPosterDetailUrl(alert, caseNumber),
    'poster-results-detail-name',
  ));

  const ncic = firstValue(alert, ['ncicNumber', 'ncic']);
  const namus = firstValue(alert, ['namus', 'namUs', 'namusNumber', 'namUsNumber']);
  if (ncic || namus) {
    const ncicEl = document.createElement('p');
    ncicEl.className = 'poster-results-detail-ncic';
    ncicEl.textContent = [
      ncic ? `NCIC# ${ncic}` : '',
      namus ? `NamUs# ${namus}` : '',
    ].filter(Boolean).join(', ');
    body.append(ncicEl);
  }

  const factsEl = document.createElement('div');
  factsEl.className = 'poster-results-detail-facts';
  appendFactRows(factsEl, amberSubjectFacts(alert));
  body.append(factsEl);

  appendAmberSpecGrid(body, alert);

  layout.append(body);
  subject.append(layout);
  appendPhotoGallery(subject, alert, name);
  detail.append(subject);

  const vehicleSection = createAmberVehicleSection(payload, alert);
  if (vehicleSection) detail.append(vehicleSection);

  const narrative = posterNarrative(payload, alert);
  if (narrative) {
    const callout = document.createElement('div');
    callout.className = 'poster-results-amber-narrative';
    const copy = document.createElement('p');
    copy.textContent = narrative;
    callout.append(copy);
    detail.append(callout);
  }

  relatedAmberPeople(payload, alert).forEach((person) => {
    detail.append(createAmberCompanionSection(payload, person, caseNumber));
  });

  detail.append(createDetailFooter(config, payload, alert));
  container.append(detail);
}

function posterPathIndex(segments) {
  if (segments[0] === 'poster') return 0;
  if (segments[0]?.length === 2 && segments[1] === 'poster') return 1;
  return -1;
}

function legacyPosterPathRequest() {
  const normalizedPath = window.location.pathname
    .replace(/^\/content\/edge(?=\/)/, '')
    .replace(/\/+$/g, '')
    .replace(/\.html$/i, '');
  const segments = normalizedPath.split('/').filter(Boolean);
  const posterIndex = posterPathIndex(segments);

  if (posterIndex < 0) return null;

  const provider = normalizeText(segments[posterIndex + 1]).toUpperCase();
  const caseNumber = normalizeText(segments[posterIndex + 2]);
  const sequenceOrLayout = normalizeText(segments[posterIndex + 3]);
  if (!provider || !caseNumber) return null;

  const seqNumber = /^\d+$/.test(sequenceOrLayout) ? sequenceOrLayout : '1';
  const type = provider.toUpperCase() === 'AMBER' ? 'amber' : 'poster';

  if (type === 'amber') {
    return {
      type,
      caseNumber,
      seqNumber,
    };
  }

  return {
    type,
    provider,
    caseNumber,
    num: seqNumber,
  };
}

function directPosterRequest() {
  const params = new URLSearchParams(window.location.search);
  const personType = normalizeText(params.get('person_type')).toLowerCase() === 'related'
    ? 'related'
    : '';
  const poster = normalizeText(params.get('poster'));
  if (poster) {
    const [rawProvider, caseNumber, num = '1'] = poster.split('/').map(normalizeText);
    const provider = rawProvider.toUpperCase();
    if (provider && caseNumber) {
      if (provider.toUpperCase() === 'AMBER') {
        return {
          type: 'amber',
          caseNumber,
          seqNumber: num,
        };
      }

      return {
        type: 'poster',
        provider,
        caseNumber,
        num,
        personType,
      };
    }
  }

  const amberPreviewCase = normalizeText(params.get('amber_preview'));
  if (amberPreviewCase) {
    return {
      type: 'amber',
      preview: true,
      caseNumber: amberPreviewCase,
      seqNumber: normalizeText(params.get('seq')),
      personId: normalizeText(params.get('person_id')),
      name: normalizeText(params.get('name')),
    };
  }

  const amberCase = normalizeText(params.get('amber_case'));
  if (amberCase) {
    return {
      type: 'amber',
      caseNumber: amberCase,
      seqNumber: normalizeText(params.get('seq')),
      personId: normalizeText(params.get('person_id')),
      name: normalizeText(params.get('name')),
    };
  }

  const provider = normalizeText(params.get('provider'));
  const caseNumber = normalizeText(params.get('case'));
  if (provider && caseNumber) {
    return {
      type: 'poster',
      provider,
      caseNumber,
      num: normalizeText(params.get('num')) || '1',
      personType,
    };
  }

  const legacyRequest = legacyPosterPathRequest();
  return legacyRequest ? { ...legacyRequest, personType } : null;
}

function enterDirectPosterPage(block) {
  document.body.classList.add('poster-results-direct-page');

  const section = block.closest('.section') || block.parentElement;
  section?.classList.add('poster-results-direct-section');

  const main = block.closest('main');
  if (main && section) {
    [...main.children].forEach((child) => {
      child.hidden = child !== section;
    });
  }

  if (section) {
    [...section.children].forEach((child) => {
      child.hidden = child !== block && !child.contains(block);
    });
  }
}

function createResultCard(person) {
  const card = document.createElement('article');
  card.className = 'poster-results-card';
  const detailUrl = posterDetailUrl(person);
  const imageUrl = normalizeText(
    person.image_url || person.imageUrl || person.thumbnail_url || person.thumbnailUrl,
  );

  if (imageUrl) {
    card.classList.add('has-photo');
    const imageLink = document.createElement('a');
    imageLink.href = detailUrl;
    imageLink.target = '_blank';
    imageLink.rel = 'noopener noreferrer';
    imageLink.className = 'poster-results-photo';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = fullName(person) || 'Missing child poster';
    img.loading = 'lazy';
    imageLink.append(img);
    card.append(imageLink);
  } else {
    card.classList.add('no-photo');
  }

  const body = document.createElement('div');
  body.className = 'poster-results-card-body';

  const title = document.createElement('h3');
  const titleLink = document.createElement('a');
  titleLink.href = detailUrl;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.className = 'poster-results-card-title-link';
  titleLink.textContent = fullName(person) || 'Unidentified child';
  title.append(titleLink);
  body.append(title);

  const details = document.createElement('dl');
  [
    ['Missing Since', formatPosterDate(person.missingDate)],
    ['Missing From', formatPosterLocation(locationText(person))],
    ['Age Now', person.age],
  ].forEach(([label, value]) => {
    if (!normalizeText(value)) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    details.append(dt, dd);
  });
  body.append(details);

  const actions = document.createElement('div');
  actions.className = 'poster-results-card-actions';
  const link = document.createElement('a');
  link.className = 'poster-results-card-link';
  link.href = detailUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'View Poster';
  actions.append(link);
  body.append(actions);

  card.append(body);
  return card;
}

function renderResults(container, meta, payload) {
  container.replaceChildren();

  const people = Array.isArray(payload?.data) ? payload.data : [];
  const page = payload?.current_page || 1;
  const totalPages = payload?.total_pages || 1;
  const geo = payload?.geolocation;
  const geoText = geo?.distanceInMiles
    ? ` within ${geo.distanceInMiles} miles${geo.zip ? ` of ${geo.zip}` : ''}`
    : '';
  meta.textContent = payload?.total_records
    ? `Showing ${people.length} of ${payload.total_records} results${geoText} - Page ${page} of ${totalPages}`
    : 'Showing 0 results';

  if (!people.length) {
    const empty = document.createElement('p');
    empty.className = 'poster-results-empty';
    empty.textContent = 'No poster results found.';
    container.append(empty);
    return;
  }

  people.forEach((person) => container.append(createResultCard(person)));
}

function amberSummaryImage(alert) {
  return childPhotoSources(alert)[0]
    || deepFirstValue(alert, ['image_url', 'thumbnail_url', 'imageUrl', 'thumbnailUrl']);
}

function createAmberCardAction(label, href) {
  const action = document.createElement('a');
  action.href = href;
  action.target = '_blank';
  action.rel = 'noopener noreferrer';
  action.className = 'poster-results-amber-card-action';
  action.textContent = label;
  return action;
}

function createAmberSummaryCard(alert) {
  const card = document.createElement('article');
  card.className = 'poster-results-amber-card';
  const href = amberPosterDetailUrl(alert);
  const imageUrl = amberSummaryImage(alert);

  if (imageUrl) {
    const media = document.createElement(href ? 'a' : 'div');
    media.className = 'poster-results-amber-card-media';
    if (href) {
      media.href = href;
      media.target = '_blank';
      media.rel = 'noopener noreferrer';
    }
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = displayName(alert, 'AMBER Alert');
    img.loading = 'lazy';
    media.append(img);
    card.append(media);
  } else {
    card.classList.add('is-no-media');
  }

  const body = document.createElement('div');
  body.className = 'poster-results-amber-card-body';
  const badge = document.createElement('p');
  badge.className = 'poster-results-amber-card-badge';
  badge.textContent = 'AMBER Alert';
  const title = createLinkedNameElement(
    'h3',
    displayName(alert, 'AMBER Alert'),
    href,
    'poster-results-amber-card-title',
  );
  const details = document.createElement('dl');
  appendDetailRows(details, [
    ['Case', amberCaseNumber(alert)],
    ['Missing From', formatPosterLocation(firstValue(alert, ['missing_location', 'missingLocation']) || locationText(alert))],
    ['Issued For', firstValue(alert, ['issued_for', 'issuedFor'])],
  ]);
  const actions = document.createElement('div');
  actions.className = 'poster-results-amber-card-actions';
  if (href) {
    actions.append(createAmberCardAction('Open poster', href));
  }

  body.append(badge, title);
  if (details.children.length) body.append(details);
  if (actions.children.length) body.append(actions);
  card.append(body);
  return card;
}

function createAmberSummarySection() {
  const section = document.createElement('section');
  section.className = 'poster-results-amber-summary';
  section.hidden = true;

  const header = document.createElement('div');
  header.className = 'poster-results-amber-summary-header';
  const eyebrow = document.createElement('p');
  eyebrow.textContent = 'AMBER Alert';
  const heading = document.createElement('h2');
  heading.textContent = 'Active AMBER Alerts';
  const copy = document.createElement('p');
  copy.className = 'poster-results-amber-summary-copy';
  copy.textContent = 'Review active AMBER Alerts and share information with law enforcement if you have seen a child or vehicle.';
  header.append(eyebrow, heading, copy);

  const list = document.createElement('div');
  list.className = 'poster-results-amber-summary-list';
  section.append(header, list);
  return { section, list };
}

async function loadAmberSummary(config, list, section) {
  try {
    const url = new URL('/api/amber-alerts', `${config.apiBaseUrl}/`);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const alerts = Array.isArray(payload?.data) ? payload.data : [];
    if (!alerts.length) return;
    await Promise.all(alerts.map(async (alert) => {
      if (amberSummaryImage(alert) || !amberCaseNumber(alert)) return;
      try {
        const detailUrl = new URL(
          `/api/amber-alerts/${encodeURIComponent(amberCaseNumber(alert))}`,
          `${config.apiBaseUrl}/`,
        );
        const detailResponse = await fetch(detailUrl.toString(), {
          headers: { Accept: 'application/json' },
        });
        if (!detailResponse.ok) return;
        const detailPayload = await detailResponse.json();
        const detailAlert = matchingPerson(detailPayload, alert);
        const image = amberSummaryImage(detailAlert) || amberSummaryImage(detailPayload);
        if (image) alert.image_url = image;
      } catch (error) {
        // The card remains usable without an image.
      }
    }));
    list.replaceChildren(...alerts.slice(0, 3).map(createAmberSummaryCard));
    section.hidden = false;
  } catch (error) {
    section.hidden = true;
  }
}

function appendParams(url, form) {
  const formData = new FormData(form);
  [...formData.entries()].forEach(([key, value]) => {
    if (normalizeText(value) && value !== 'All') {
      url.searchParams.set(key, value);
    }
  });
}

const NEAR_ME_TOOLTIP = 'Search for children who have gone missing within 50 miles '
  + 'of your current location. (Location is estimated using your IP address.)';
const COMPANION_TOOLTIP = 'Companion or Suspect. This is someone who is believed to be with a child.';
const UNIDENTIFIED_TOOLTIP = "Cases of unidentified remains of children from NCMEC's Help ID Me program.";
const LOCATION_TOOLTIP = 'Missing location and location found.';
const DATE_TOOLTIP = 'Enter a date range when the child went missing or when the unidentified child was found.';

function appendFieldTooltip(input, text) {
  input.closest('label')?.querySelector('.poster-results-field-label')?.append(createInfoTooltip(text));
}

function createNearMeSection(onNearMe) {
  const wrap = document.createElement('div');
  wrap.className = 'poster-results-near-me';

  const divider = document.createElement('span');
  divider.className = 'poster-results-near-me-divider';
  divider.textContent = 'or';

  const action = document.createElement('div');
  action.className = 'poster-results-near-me-action';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'poster-results-near-me-button';
  button.textContent = 'Search Near Me';
  button.addEventListener('click', onNearMe);

  action.append(button, createInfoTooltip(NEAR_ME_TOOLTIP));
  wrap.append(divider, action);
  return { wrap, button };
}

export default async function decorate(block) {
  const localApiOverride = window.location.hostname === 'localhost'
    ? normalizeApiBaseUrl(new URLSearchParams(window.location.search).get('api_base_url'))
    : '';
  const config = {
    heading: normalizePosterHeading(getFieldValue(block, 'heading', 0, DEFAULTS.heading)),
    eyebrow: getFieldValue(block, 'eyebrow', 1, DEFAULTS.eyebrow),
    apiBaseUrl: localApiOverride
      || normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 2, DEFAULTS.apiBaseUrl)),
    submitLabel: getFieldValue(block, 'submitLabel', 3, DEFAULTS.submitLabel),
    submitTipUrl: getFieldValue(block, 'submitTipUrl', 4, DEFAULTS.submitTipUrl),
    organizationLogo: getFieldValue(block, 'organizationLogo', 5, DEFAULTS.organizationLogo),
    organizationLogoAlt: getFieldValue(
      block,
      'organizationLogoAlt',
      6,
      DEFAULTS.organizationLogoAlt,
    ),
    qrCodeUrl: getAuthoredAssetValue(block, 'qrCodeUrl', 7, /\.pdf(?:[?#].*)?$/i)
      || DEFAULTS.qrCodeUrl,
    qrCodeLabel: getFieldValue(block, 'qrCodeLabel', 8, DEFAULTS.qrCodeLabel),
  };

  const directRequest = directPosterRequest();
  if (directRequest) {
    const existingDirectPoster = document.querySelector('.poster-results.is-poster-page');
    if (existingDirectPoster && existingDirectPoster !== block) {
      block.hidden = true;
      block.replaceChildren();
      return;
    }

    block.classList.add('is-poster-page');
    enterDirectPosterPage(block);

    const inner = document.createElement('div');
    inner.className = 'poster-results-inner';
    const status = document.createElement('p');
    status.hidden = true;
    const meta = document.createElement('p');
    meta.className = 'poster-results-meta';
    const results = document.createElement('div');
    results.className = 'poster-results-list';

    inner.append(status, meta, results);
    block.replaceChildren(inner);
    renderPosterSkeleton(results);

    try {
      if (directRequest.type === 'amber') {
        const url = new URL(
          `/api/amber-alerts${directRequest.preview ? '/preview' : ''}/${encodeURIComponent(directRequest.caseNumber)}`,
          `${config.apiBaseUrl}/`,
        );
        const response = await fetch(url.toString(), {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        setStatus(status, '', '');
        replaceWithCanonicalPosterUrl(directRequest);
        renderAmberPosterDetail(results, meta, payload, {
          caseNumber: directRequest.caseNumber,
          seqNumber: directRequest.seqNumber,
          personId: directRequest.personId,
          name: directRequest.name,
        }, config);
        return;
      }

      const url = new URL(
        `/api/posters/${[
          directRequest.provider,
          directRequest.caseNumber,
          directRequest.num || 1,
        ].map((segment) => encodeURIComponent(segment)).join('/')}`,
        `${config.apiBaseUrl}/`,
      );
      if (directRequest.personType === 'related') {
        url.searchParams.set('person_type', 'related');
      }
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const renderPayload = posterPayloadForRender(payload, directRequest);
      setStatus(status, '', '');
      replaceWithCanonicalPosterUrl(directRequest);
      renderPosterDetail(results, meta, renderPayload, config, () => window.history.back());
      return;
    } catch (error) {
      results.replaceChildren();
      setStatus(status, 'Poster details are unavailable.', 'error');
      return;
    }
  }

  const inner = document.createElement('div');
  inner.className = 'poster-results-inner';

  const header = document.createElement('div');
  header.className = 'poster-results-header';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'poster-results-eyebrow';
  eyebrow.textContent = config.eyebrow;
  const heading = document.createElement('h2');
  heading.className = 'poster-results-heading';
  heading.textContent = config.heading;
  header.append(eyebrow, heading);

  const form = document.createElement('form');
  form.className = 'poster-results-form';

  const firstName = createField('First Name', 'first_name', 'text', 'First Name');
  const lastName = createField('Last Name', 'last_name', 'text', 'Last Name');
  const city = createField('City', 'city', 'text', 'City');
  const state = createSelect('State', 'state', STATES);
  const country = createSelect('Country', 'country', COUNTRIES);
  const fromDate = createField('From', 'from_date', 'date', 'mm/dd/yy');
  const toDate = createField('To', 'to_date', 'date', 'mm/dd/yy');
  const ageNowMin = createField('Age Now Min', 'age_now_min', 'number', '0');
  const ageNowMax = createField('Age Now Max', 'age_now_max', 'number', '99+');
  const ageMissingMin = createField('Age Missing Min', 'age_missing_min', 'number', '0');
  const ageMissingMax = createField('Age Missing Max', 'age_missing_max', 'number', '99+');
  const race = createSelect('Race', 'race', RACES);
  const hairColor = createSelect('Hair Color', 'hair_color', HAIR_COLORS);
  const eyeColor = createSelect('Eye Color', 'eye_color', EYE_COLORS);

  appendFieldTooltip(city, LOCATION_TOOLTIP);
  appendFieldTooltip(fromDate, DATE_TOOLTIP);

  [ageNowMin, ageNowMax, ageMissingMin, ageMissingMax].forEach((input) => {
    input.min = '0';
    input.step = '1';
  });

  const subject = createRadioGroup('Refine', 'subject', [
    ['child', 'Child'],
    ['companion', 'Companion', COMPANION_TOOLTIP],
    ['unidentified', 'Unidentified', UNIDENTIFIED_TOOLTIP],
  ]);
  const sort = createSortToggle([
    ['MostRecent', 'Most Recent'],
    ['AZ', 'A-Z'],
  ]);
  const gender = createRadioGroup('Gender', 'gender', [
    ['All', 'All'],
    ['male', 'Male'],
    ['female', 'Female'],
  ]);

  let searchPosters;

  const topControls = document.createElement('div');
  topControls.className = 'poster-results-form-top';
  topControls.append(subject);

  // Sort lives above the results (not in the form) and re-queries the API on
  // change, so it only appears once there are results to sort.
  const sortBar = document.createElement('div');
  sortBar.className = 'poster-results-sort-bar';
  sortBar.hidden = true;
  sortBar.append(sort);
  const getSortValue = () => sortBar.querySelector('.poster-results-sort-option.is-active')?.dataset.sort || '';

  const divider = document.createElement('div');
  divider.className = 'poster-results-form-divider';

  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'poster-results-field-grid';

  const identityColumn = document.createElement('div');
  identityColumn.className = 'poster-results-field-column';
  identityColumn.append(
    firstName.closest('label'),
    lastName.closest('label'),
    fromDate.closest('label'),
    toDate.closest('label'),
  );

  const locationColumn = document.createElement('div');
  locationColumn.className = 'poster-results-field-column';
  locationColumn.append(
    city.closest('label'),
    state.closest('label'),
    country.closest('label'),
  );

  const ageColumn = document.createElement('div');
  ageColumn.className = 'poster-results-field-column poster-results-field-column-ages';
  ageColumn.append(
    ageNowMin.closest('label'),
    ageNowMax.closest('label'),
    ageMissingMin.closest('label'),
    ageMissingMax.closest('label'),
  );

  const appearanceColumn = document.createElement('div');
  appearanceColumn.className = 'poster-results-field-column';
  appearanceColumn.append(
    gender,
    race.closest('label'),
    hairColor.closest('label'),
    eyeColor.closest('label'),
  );

  fieldGrid.append(identityColumn, locationColumn, ageColumn, appearanceColumn);

  const submitRow = document.createElement('div');
  submitRow.className = 'poster-results-actions';
  const reset = document.createElement('button');
  reset.type = 'reset';
  reset.className = 'poster-results-reset';
  reset.textContent = 'Reset';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'poster-results-submit';
  submit.textContent = config.submitLabel;
  const nearMe = createNearMeSection(() => searchPosters(1, true));
  submitRow.append(submit, reset, nearMe.wrap);

  form.append(topControls, divider, fieldGrid, submitRow);

  const status = document.createElement('p');
  status.hidden = true;
  const meta = document.createElement('p');
  meta.className = 'poster-results-meta';
  const resultsToolbar = document.createElement('div');
  resultsToolbar.className = 'poster-results-results-toolbar';
  resultsToolbar.append(meta, sortBar);
  const results = document.createElement('div');
  results.className = 'poster-results-list';
  const backToSearch = document.createElement('button');
  backToSearch.type = 'button';
  backToSearch.className = 'poster-results-back-to-search';
  backToSearch.textContent = 'Top of search';
  backToSearch.hidden = true;
  backToSearch.addEventListener('click', () => {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    firstName.focus({ preventScroll: true });
  });
  const pagination = document.createElement('nav');
  pagination.className = 'poster-results-pagination';
  pagination.setAttribute('aria-label', 'Poster search pagination');

  let currentPage = 1;
  let totalPages = 1;
  let currentNearSearch = false;
  let renderPagination = () => {};

  const amberSummary = createAmberSummarySection();

  inner.append(
    amberSummary.section,
    header,
    form,
    status,
    resultsToolbar,
    backToSearch,
    results,
    pagination,
  );
  block.replaceChildren(inner);
  loadAmberSummary(config, amberSummary.list, amberSummary.section);

  renderPagination = () => {
    pagination.replaceChildren();
    pagination.hidden = totalPages <= 1;
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = 'Previous';
    prev.disabled = currentPage <= 1;
    prev.addEventListener('click', () => searchPosters(currentPage - 1, currentNearSearch));

    const label = document.createElement('span');
    label.textContent = `Page ${currentPage} of ${totalPages}`;

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Next';
    next.disabled = currentPage >= totalPages;
    next.addEventListener('click', () => searchPosters(currentPage + 1, currentNearSearch));

    pagination.append(prev, label, next);
  };

  searchPosters = async (page = 1, nearCurrentLocation = false) => {
    setStatus(status, nearCurrentLocation ? 'Searching near your location...' : 'Searching posters...', 'loading');
    submit.disabled = true;
    nearMe.button.disabled = true;
    results.replaceChildren();
    meta.textContent = '';
    backToSearch.hidden = true;
    pagination.replaceChildren();
    pagination.hidden = true;

    try {
      const url = new URL('/api/posters/search', `${config.apiBaseUrl}/`);
      if (nearCurrentLocation) {
        url.searchParams.set('near_me', '1');
      } else {
        appendParams(url, form);
      }
      // Sort is applied to both regular and near-me searches so it can re-query
      // on the fly (see the sortBar change handler) without re-entering filters.
      const sortValue = getSortValue();
      if (sortValue) url.searchParams.set('sort', sortValue);
      url.searchParams.set('page', String(Math.max(1, page)));
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      currentPage = payload.current_page || page;
      totalPages = payload.total_pages || 1;
      currentNearSearch = nearCurrentLocation;
      setStatus(status, '', '');
      renderResults(results, meta, payload);
      backToSearch.hidden = !results.children.length;
      sortBar.hidden = !results.children.length;
      renderPagination();
      if (results.children.length) {
        meta.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      sortBar.hidden = true;
      setStatus(status, nearCurrentLocation ? 'Search near me is unavailable.' : 'Poster search is unavailable.', 'error');
    } finally {
      submit.disabled = false;
      nearMe.button.disabled = false;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    searchPosters(1);
  });

  // Changing sort re-queries the current search (page 1) on the fly. The bar is
  // only visible once results exist, so this can't fire before an initial search.
  sortBar.addEventListener('click', (event) => {
    const button = event.target.closest('.poster-results-sort-option');
    if (!button || sortBar.hidden || button.classList.contains('is-active')) return;
    sortBar.querySelectorAll('.poster-results-sort-option').forEach((option) => {
      const active = option === button;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-pressed', String(active));
    });
    searchPosters(1, currentNearSearch);
  });

  form.addEventListener('reset', () => {
    window.setTimeout(() => {
      results.replaceChildren();
      pagination.replaceChildren();
      meta.textContent = '';
      backToSearch.hidden = true;
      sortBar.hidden = true;
      setStatus(status, '', '');
      currentPage = 1;
      totalPages = 1;
      currentNearSearch = false;
    }, 0);
  });
}
