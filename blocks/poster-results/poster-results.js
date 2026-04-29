const DEFAULTS = {
  heading: 'Search Missing Children Posters',
  eyebrow: 'Poster Search',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  submitLabel: 'Search',
  submitTipUrl: '/gethelpnow/cybertipline',
  organizationLogo: '',
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

  const configRow = getRows(block)[0];
  const cell = configRow ? [...configRow.children][columnIndex] : null;
  return getReferenceValue(cell);
}

function getFieldValue(block, name, columnIndex, fallback = '') {
  return getPropValue(block, name) || getLegacyValue(block, name, columnIndex) || fallback;
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

function posterPath(person) {
  return [person.orgPrefix, person.caseNumber, person.seqNumber || 1]
    .map((value) => encodeURIComponent(value))
    .join('/');
}

function firstValue(source, keys) {
  return keys.map((key) => source?.[key]).find((value) => normalizeText(value)) || '';
}

function photoSource(photo) {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  if (photo.base64) return `data:image/jpeg;base64,${photo.base64}`;
  return photo.url || photo.photoUrl || photo.photoUri || '';
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

function formatAgencyLine(payload, child) {
  const agency = detailValue(payload, child, [
    'investigatingAgency',
    'lawEnforcementAgency',
    'policeDepartment',
    'agencyName',
    'contactAgency',
  ]);
  const phone = detailValue(payload, child, [
    'agencyPhone',
    'phone',
    'phoneNumber',
    'contactPhone',
    'lawEnforcementPhone',
  ]);

  return { agency, phone };
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

  const caseNumber = payload?.caseNumber || child.caseNumber;
  if (caseNumber) {
    const ncmec = document.createElement('p');
    ncmec.className = 'poster-results-detail-case';
    ncmec.textContent = `NCMEC: ${caseNumber}`;
    info.append(ncmec);
  }

  footer.append(info);
  return footer;
}

function renderPosterDetail(container, meta, payload, config, onBack) {
  container.replaceChildren();
  meta.textContent = '';

  const children = Array.isArray(payload?.children) ? payload.children : [];
  const child = children[0] || payload || {};
  const name = fullName(child) || payload?.fullName || payload?.name || 'Missing child poster';
  const photos = Array.isArray(child.photos) ? child.photos : [];
  const imageSrc = photoSource(photos[0]) || child.image_url || child.thumbnail_url;
  const missingDate = detailValue(payload, child, ['missingDate', 'dateMissing', 'missingSince']);

  const detail = document.createElement('article');
  detail.className = 'poster-results-detail';

  detail.append(createActionBar(config));

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
    ['Missing Since', missingDate],
    ['Missing From', locationText(child)],
    ['Age Now', detailValue(payload, child, ['age', 'ageNow'])],
    ['Age Missing', detailValue(payload, child, ['ageMissing', 'missingAge'])],
    ['Gender', detailValue(payload, child, ['sex', 'gender'])],
    ['Race', detailValue(payload, child, ['race'])],
    ['Hair Color', detailValue(payload, child, ['hairColor', 'hair'])],
    ['Eye Color', detailValue(payload, child, ['eyeColor', 'eyes'])],
    ['Height', detailValue(payload, child, ['height'])],
    ['Weight', detailValue(payload, child, ['weight'])],
  ]);
  body.append(details);

  if (missingDate) {
    const seen = document.createElement('p');
    seen.className = 'poster-results-detail-seen';
    seen.textContent = `${name} was last seen on ${missingDate}.`;
    body.append(seen);
  }

  const narrative = firstValue(payload, ['circumstances', 'description', 'posterText', 'remarks'])
    || firstValue(child, ['circumstances', 'description', 'posterText', 'remarks']);
  if (narrative) {
    const copy = document.createElement('p');
    copy.className = 'poster-results-detail-copy';
    copy.textContent = narrative;
    body.append(copy);
  }

  layout.append(body);
  detail.append(back, layout, createDetailFooter(config, payload, child));
  container.append(detail);
}

function createResultCard(person, onSelect) {
  const card = document.createElement('article');
  card.className = 'poster-results-card';

  if (person.thumbnail_url) {
    const imageLink = document.createElement('button');
    imageLink.type = 'button';
    imageLink.className = 'poster-results-photo';
    imageLink.addEventListener('click', () => onSelect(person));

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

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'poster-results-card-link';
  link.textContent = 'View details';
  link.addEventListener('click', () => onSelect(person));
  body.append(link);

  card.append(body);
  return card;
}

function renderResults(container, meta, payload, onSelect) {
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

  people.forEach((person) => container.append(createResultCard(person, onSelect)));
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
    qrCodeUrl: getFieldValue(block, 'qrCodeUrl', 7, DEFAULTS.qrCodeUrl),
    qrCodeLabel: getFieldValue(block, 'qrCodeLabel', 8, DEFAULTS.qrCodeLabel),
  };

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
  const pagination = document.createElement('nav');
  pagination.className = 'poster-results-pagination';
  pagination.setAttribute('aria-label', 'Poster search pagination');

  let currentPage = 1;
  let totalPages = 1;
  let currentNearSearch = false;
  let lastPayload = null;
  let searchPosters;
  let renderPagination = () => {};
  let restoreResults = () => {};
  const nearMe = createNearMeSection(config, () => searchPosters(1, true));

  inner.append(header, form, nearMe.wrap, status, meta, results, pagination);
  block.replaceChildren(inner);

  async function showPosterDetail(person) {
    setStatus(status, 'Loading poster details...', 'loading');
    results.replaceChildren();
    pagination.replaceChildren();
    pagination.hidden = true;

    try {
      const url = new URL(`/api/posters/${posterPath(person)}`, `${config.apiBaseUrl}/`);
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setStatus(status, '', '');
      renderPosterDetail(results, meta, payload, config, restoreResults);
    } catch (error) {
      setStatus(status, 'Poster details are unavailable.', 'error');
      restoreResults();
    }
  }

  restoreResults = () => {
    if (lastPayload) {
      renderResults(results, meta, lastPayload, showPosterDetail);
      renderPagination();
    }
  };

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
      lastPayload = payload;
      setStatus(status, '', '');
      renderResults(results, meta, payload, showPosterDetail);
      renderPagination();
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
      lastPayload = null;
    }, 0);
  });
}
