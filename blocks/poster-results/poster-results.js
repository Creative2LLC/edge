import {
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

function createRadioGroup(labelText, name, options) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'poster-results-radio-group';

  const legend = document.createElement('legend');
  legend.textContent = labelText;
  fieldset.append(legend);

  options.forEach(([value, text], index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = index === 0;
    label.append(input, document.createTextNode(text));
    fieldset.append(label);
  });

  return fieldset;
}

function setStatus(node, message, type = '') {
  node.className = `poster-results-status${type ? ` is-${type}` : ''}`;
  node.textContent = message;
  node.hidden = !message;
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
    person.missingCity || person.city,
    person.missingState || person.state,
    person.missingCountry || person.country,
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
    },
  });
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
  const canonicalPath = canonicalPosterPath(directRequest);
  if (!canonicalPath || !window.history?.replaceState) return;

  const canonicalUrl = `${canonicalPath}${window.location.hash}`;
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

function childPhotoSources(child) {
  const photos = Array.isArray(child?.photos) ? child.photos : [];
  return [
    ...photos.map(photoSource),
    child?.image_url,
    child?.thumbnail_url,
    child?.imageUrl,
    child?.thumbnailUrl,
    child?.image?.image_url,
  ].map(normalizeText).filter(Boolean);
}

function createDetailRow(label, value) {
  if (!normalizeText(value)) return null;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  return [dt, dd];
}

function detailValue(payload, child, keys) {
  return firstValue(child, keys) || firstValue(payload, keys);
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

function createAmberRelatedPeopleSection(payload, selectedPerson) {
  const people = relatedAmberPeople(payload, selectedPerson);
  if (!people.length) return null;

  const section = document.createElement('section');
  section.className = 'poster-results-related';
  const heading = document.createElement('h4');
  heading.textContent = 'Related People';
  const list = document.createElement('div');
  list.className = 'poster-results-related-list';

  people.forEach((person) => {
    const row = document.createElement('article');
    row.className = 'poster-results-related-person';
    const image = childPhotoSources(person)[0];
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = displayName(person, readablePersonType(person));
      img.loading = 'lazy';
      row.append(img);
    }

    const content = document.createElement('div');
    const title = document.createElement('h5');
    title.textContent = displayName(person, readablePersonType(person));
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
  return section;
}

function createAmberVehicleSection(payload, selectedPerson) {
  const vehicles = vehicleItems(payload, selectedPerson);
  if (!vehicles.length) return null;

  const section = document.createElement('section');
  section.className = 'poster-results-related';
  const heading = document.createElement('h4');
  heading.textContent = vehicles.length > 1 ? 'Vehicles' : 'Vehicle';
  const list = document.createElement('div');
  list.className = 'poster-results-vehicle-list';

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
  return section;
}

function appendAmberRelatedGrid(body, payload, selectedPerson) {
  const sections = [
    createAmberRelatedPeopleSection(payload, selectedPerson),
    createAmberVehicleSection(payload, selectedPerson),
  ].filter(Boolean);

  if (!sections.length) return;

  const grid = document.createElement('div');
  grid.className = `poster-results-related-grid${sections.length === 1 ? ' is-single' : ''}`;
  grid.append(...sections);
  body.append(grid);
}

function appendPhotoGallery(container, child, name) {
  const photos = [...new Set(childPhotoSources(child))];
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

function createActionBar(config) {
  const actions = document.createElement('div');
  actions.className = 'poster-results-detail-actions';

  actions.append(createActionLink('CALL 911', 'tel:911'));
  actions.append(createActionLink('SUBMIT A TIP', config.submitTipUrl));
  actions.append(createActionButton('PRINT POSTER', () => window.print()));
  actions.append(createActionButton('SHARE', async () => {
    const shareData = {
      title: document.title,
      url: window.location.href,
    };

    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
    }
  }));

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

  const agencyLine = formatAgencyLine(payload, child);
  if (agencyLine.agency || agencyLine.phone) {
    const agency = document.createElement('p');
    agency.className = 'poster-results-detail-agency';
    agency.textContent = agencyLine.agency || 'Law Enforcement Agency';
    if (agencyLine.phone) {
      const phone = document.createElement('a');
      phone.href = `tel:${agencyLine.phone.replace(/[^\d+]/g, '')}`;
      phone.textContent = agencyLine.phone;
      agency.append(document.createTextNode(' '), phone);
    }
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

function createMissingChildHeading() {
  const heading = document.createElement('div');
  heading.className = 'poster-results-missing-child-heading';
  const start = document.createElement('span');
  const text = document.createElement('h1');
  text.textContent = 'Missing Child';
  const end = document.createElement('span');
  heading.append(start, text, end);
  return heading;
}

function renderPosterDetail(container, meta, payload, config, onBack) {
  container.replaceChildren();
  meta.textContent = '';

  const children = Array.isArray(payload?.children) ? payload.children : [];
  const child = children[0] || payload || {};
  const name = displayName(child);
  const imageSrc = childPhotoSources(child)[0];
  const missingDate = detailValue(payload, child, ['missingDate', 'dateMissing', 'missingSince']);

  const detail = document.createElement('article');
  detail.className = 'poster-results-detail';

  detail.append(createMissingChildHeading(), createActionBar(config));

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'poster-results-detail-back';
  back.textContent = 'Back to results';
  back.addEventListener('click', onBack);

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
  const title = document.createElement('h3');
  title.textContent = name;
  body.append(title);

  const details = document.createElement('dl');
  appendDetailRows(details, [
    ['Case', payload?.caseNumber || child.caseNumber],
    ['NCIC', detailValue(payload, child, ['ncicNumber', 'ncic'])],
    ['Missing Since', missingDate],
    ['Missing From', locationText(child)],
    ['Age Now', detailValue(payload, child, ['age', 'ageNow'])],
    ['Age Missing', detailValue(payload, child, ['ageMissing', 'missingAge'])],
    ['Date of Birth', detailValue(payload, child, ['dateOfBirth', 'birthDate', 'dob'])],
    ['Gender', detailValue(payload, child, ['sex', 'gender'])],
    ['Race', detailValue(payload, child, ['race'])],
    ['Hair Color', detailValue(payload, child, ['hairColor', 'hair'])],
    ['Eye Color', detailValue(payload, child, ['eyeColor', 'eyes'])],
    ['Height', joinValues([
      detailValue(payload, child, ['height']),
      detailValue(payload, child, ['heightTo']),
    ], ' - ')],
    ['Weight', joinValues([
      detailValue(payload, child, ['weight']),
      detailValue(payload, child, ['weightTo']),
    ], ' - ')],
    ['Aliases', detailValue(payload, child, ['alias', 'aliases', 'nickname'])],
  ]);
  body.append(details);

  const narrative = posterNarrative(payload, child);
  if (narrative) {
    const copy = document.createElement('p');
    copy.className = 'poster-results-detail-copy';
    copy.textContent = narrative;
    body.append(copy);
  }

  layout.append(body);
  detail.append(back, layout, createDetailFooter(config, payload, child));
  container.append(detail);
  appendPhotoGallery(detail, child, name);
}

function renderAmberPosterDetail(container, meta, payload, sourceAlert, config) {
  container.replaceChildren();
  meta.textContent = '';

  const alert = matchingPerson(payload, sourceAlert);
  const name = displayName(alert, 'AMBER Alert');
  const imageSrc = childPhotoSources(alert)[0];
  const missingDate = firstValue(alert, ['missing_date', 'missingDate', 'dateMissing', 'missingSince']);

  const detail = document.createElement('article');
  detail.className = 'poster-results-detail poster-results-amber-poster';
  detail.append(createMissingChildHeading(), createActionBar(config));

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
  const title = document.createElement('h3');
  title.textContent = name;
  body.append(title);

  const caseLine = document.createElement('p');
  caseLine.className = 'poster-results-detail-subcase';
  caseLine.textContent = `NCMEC # ${payload.case_number || alert.case_number || alert.caseNumber || ''}`.trim();
  body.append(caseLine);

  const details = document.createElement('dl');
  appendDetailRows(details, [
    ['NCIC', firstValue(alert, ['ncicNumber', 'ncic'])],
    ['Missing Since', missingDate],
    ['Missing From', alert.missing_location || alert.missingLocation],
    ['Age Now', firstValue(alert, ['age', 'ageNow'])],
    ['Age Missing', firstValue(alert, ['ageMissing', 'missingAge'])],
    ['Date of Birth', firstValue(alert, ['dateOfBirth', 'birthDate', 'dob'])],
    ['Gender', firstValue(alert, ['sex', 'gender'])],
    ['Race', firstValue(alert, ['race'])],
    ['Hair Color', firstValue(alert, ['hairColor'])],
    ['Eye Color', firstValue(alert, ['eyeColor'])],
    ['Height', joinValues([firstValue(alert, ['height']), firstValue(alert, ['heightTo'])], ' - ')],
    ['Weight', joinValues([firstValue(alert, ['weight']), firstValue(alert, ['weightTo'])], ' - ')],
    ['Issued For', alert.issued_for || alert.issuedFor],
  ]);
  body.append(details);

  const narrative = posterNarrative(payload, alert);
  if (narrative) {
    const copy = document.createElement('p');
    copy.className = 'poster-results-detail-copy';
    copy.textContent = narrative;
    body.append(copy);
  }
  appendAmberRelatedGrid(body, payload, alert);

  layout.append(body);
  detail.append(layout, createDetailFooter(config, payload, alert));
  container.append(detail);
  appendPhotoGallery(detail, alert, name);
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
      };
    }
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
    };
  }

  return legacyPosterPathRequest();
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
    ['Missing Since', person.missingDate],
    ['Missing From', locationText(person)],
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

function appendParams(url, form) {
  const formData = new FormData(form);
  [...formData.entries()].forEach(([key, value]) => {
    if (normalizeText(value) && value !== 'All') {
      url.searchParams.set(key, value);
    }
  });
}

function createNearMeSection(onNearMe) {
  const wrap = document.createElement('div');
  wrap.className = 'poster-results-near-me';

  const divider = document.createElement('span');
  divider.className = 'poster-results-near-me-divider';
  divider.textContent = 'or';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'poster-results-near-me-button';
  button.textContent = 'Search Near Me';
  button.addEventListener('click', onNearMe);

  wrap.append(divider, button);
  return { wrap, button };
}

export default async function decorate(block) {
  const config = {
    heading: normalizePosterHeading(getFieldValue(block, 'heading', 0, DEFAULTS.heading)),
    eyebrow: getFieldValue(block, 'eyebrow', 1, DEFAULTS.eyebrow),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 2, DEFAULTS.apiBaseUrl)),
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
    setStatus(status, 'Loading poster...', 'loading');

    try {
      if (directRequest.type === 'amber') {
        const url = new URL(
          `/api/amber-alerts/${encodeURIComponent(directRequest.caseNumber)}`,
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

  [ageNowMin, ageNowMax, ageMissingMin, ageMissingMax].forEach((input) => {
    input.min = '0';
    input.step = '1';
  });

  const subject = createRadioGroup('Refine', 'subject', [
    ['child', 'Child'],
    ['companion', 'Companion'],
    ['unidentified', 'Unidentified'],
  ]);
  const sort = createRadioGroup('Sort By', 'sort', [
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
  topControls.append(subject, sort);

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
  submitRow.append(reset, submit, nearMe.wrap);

  form.append(topControls, divider, fieldGrid, submitRow);

  const status = document.createElement('p');
  status.hidden = true;
  const meta = document.createElement('p');
  meta.className = 'poster-results-meta';
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

  inner.append(header, form, status, meta, backToSearch, results, pagination);
  block.replaceChildren(inner);

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
      renderPagination();
      if (results.children.length) {
        meta.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
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

  form.addEventListener('reset', () => {
    window.setTimeout(() => {
      results.replaceChildren();
      pagination.replaceChildren();
      meta.textContent = '';
      backToSearch.hidden = true;
      setStatus(status, '', '');
      currentPage = 1;
      totalPages = 1;
      currentNearSearch = false;
    }, 0);
  });
}
