const DEFAULTS = {
  heading: 'Search Missing Children Posters',
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

function cleanPosterPath(provider, caseNumber, seqNumber = '1') {
  if (!provider || !caseNumber) return '';

  return `/poster/${[provider, caseNumber, seqNumber]
    .map((segment) => encodeURIComponent(normalizeText(segment)))
    .join('/')}`;
}

function posterDetailUrl(person) {
  const [provider, caseNumber, seqNumber = '1'] = posterReference(person).split('/');
  return cleanPosterPath(provider?.toUpperCase(), caseNumber, seqNumber);
}

function canonicalPosterPath(directRequest) {
  if (!directRequest) return '';

  if (directRequest.type === 'amber') {
    return cleanPosterPath('AMBER', directRequest.caseNumber, directRequest.seqNumber || '1');
  }

  return cleanPosterPath(
    directRequest.provider?.toUpperCase(),
    directRequest.caseNumber,
    directRequest.num || '1',
  );
}

function replaceWithCanonicalPosterUrl(directRequest) {
  const canonicalPath = canonicalPosterPath(directRequest);
  if (!canonicalPath || !window.history?.replaceState) return;

  const canonicalUrl = `${canonicalPath}${window.location.hash}`;
  if (`${window.location.pathname}${window.location.hash}` !== canonicalUrl || window.location.search) {
    window.history.replaceState(null, '', canonicalUrl);
  }
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
    const match = people.find((person) => sequenceNumber(person) === sourceSequence);
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

  if (person.thumbnail_url) {
    const imageLink = document.createElement('a');
    imageLink.href = detailUrl;
    imageLink.target = '_blank';
    imageLink.rel = 'noopener noreferrer';
    imageLink.className = 'poster-results-photo';

    const img = document.createElement('img');
    img.src = person.thumbnail_url;
    img.alt = fullName(person) || 'Missing child poster';
    imageLink.append(img);
    card.append(imageLink);
  }

  const body = document.createElement('div');
  body.className = 'poster-results-card-body';

  const title = document.createElement('h3');
  title.textContent = fullName(person) || 'Unidentified child';
  body.append(title);

  const details = document.createElement('dl');
  [
    ['Case', person.caseNumber],
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

  const link = document.createElement('a');
  link.href = detailUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'poster-results-card-link';
  link.textContent = 'View details';
  body.append(link);

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

function createNearMeSection(config, onNearMe) {
  const wrap = document.createElement('div');
  wrap.className = 'poster-results-near-me';

  const divider = document.createElement('div');
  divider.className = 'poster-results-near-me-divider';
  const lineStart = document.createElement('span');
  const text = document.createElement('strong');
  text.textContent = 'or';
  const lineEnd = document.createElement('span');
  divider.append(lineStart, text, lineEnd);

  const action = document.createElement('div');
  action.className = 'poster-results-near-me-action';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Search Near Me';
  button.addEventListener('click', onNearMe);

  const tip = document.createElement('span');
  tip.className = 'poster-results-near-me-tip';
  tip.tabIndex = 0;
  tip.textContent = 'i';
  const tooltip = document.createElement('span');
  tooltip.className = 'poster-results-near-me-tooltip';
  tooltip.textContent = 'Search for children who have gone missing within 50 miles of your current location. Location is estimated using your IP address.';
  tip.append(tooltip);
  action.append(button, tip);

  const qr = document.createElement('p');
  qr.className = 'poster-results-qr';
  qr.append(document.createTextNode('Download, print, and share '));
  if (config.qrCodeUrl) {
    const link = document.createElement('a');
    link.href = config.qrCodeUrl;
    link.textContent = config.qrCodeLabel;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.removeAttribute('download');
    qr.append(link);
  } else {
    const placeholder = document.createElement('strong');
    placeholder.textContent = config.qrCodeLabel;
    qr.append(placeholder);
  }
  qr.append(document.createTextNode(' handout to help people view missing children from their area.'));

  wrap.append(divider, action, qr);
  return { wrap, button };
}

export default async function decorate(block) {
  const config = {
    heading: getFieldValue(block, 'heading', 0, DEFAULTS.heading),
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
      setStatus(status, '', '');
      replaceWithCanonicalPosterUrl(directRequest);
      renderPosterDetail(results, meta, payload, config, () => window.history.back());
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
  const fromDate = createField('From', 'from_date', 'date');
  const toDate = createField('To', 'to_date', 'date');
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
  const sort = createRadioGroup('Sort by', 'sort', [
    ['MostRecent', 'Most recent'],
    ['AZ', 'A - Z'],
  ]);
  const gender = createRadioGroup('Gender', 'gender', [
    ['All', 'All'],
    ['male', 'Male'],
    ['female', 'Female'],
  ]);

  const submitRow = document.createElement('div');
  submitRow.className = 'poster-results-actions';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = config.submitLabel;
  const reset = document.createElement('button');
  reset.type = 'reset';
  reset.className = 'poster-results-reset';
  reset.textContent = 'Reset';
  submitRow.append(submit, reset);

  form.append(
    firstName.closest('label'),
    lastName.closest('label'),
    sort,
    subject,
    city.closest('label'),
    state.closest('label'),
    country.closest('label'),
    fromDate.closest('label'),
    toDate.closest('label'),
    ageNowMin.closest('label'),
    ageNowMax.closest('label'),
    ageMissingMin.closest('label'),
    ageMissingMax.closest('label'),
    gender,
    race.closest('label'),
    hairColor.closest('label'),
    eyeColor.closest('label'),
    submitRow,
  );

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
  let searchPosters;
  let renderPagination = () => {};
  const nearMe = createNearMeSection(config, () => searchPosters(1, true));

  inner.append(header, form, nearMe.wrap, status, meta, backToSearch, results, pagination);
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
      setStatus(status, '', '');
      currentPage = 1;
      totalPages = 1;
      currentNearSearch = false;
    }, 0);
  });
}
