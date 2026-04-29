const DEFAULTS = {
  heading: 'Search Missing Children Posters',
  eyebrow: 'Poster Search',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  submitLabel: 'Search',
};

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  eyebrow: ['eyebrow', 'label'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  submitLabel: ['submit label', 'button label'],
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
  return [person.missingCity, person.missingState, person.missingCountry]
    .map(normalizeText)
    .filter(Boolean)
    .join(', ');
}

function posterPath(person) {
  return [person.orgPrefix, person.caseNumber, person.seqNumber || 1]
    .map((value) => encodeURIComponent(value))
    .join('/');
}

function createResultCard(person) {
  const card = document.createElement('article');
  card.className = 'poster-results-card';

  if (person.thumbnail_url) {
    const imageLink = document.createElement('a');
    imageLink.className = 'poster-results-photo';
    imageLink.href = person.poster_url || `/poster/${posterPath(person)}/screen`;
    imageLink.target = '_blank';
    imageLink.rel = 'noopener noreferrer';

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
  link.className = 'poster-results-card-link';
  link.href = person.poster_url || `/poster/${posterPath(person)}/screen`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'View poster';
  body.append(link);

  card.append(body);
  return card;
}

function renderResults(container, meta, payload) {
  container.replaceChildren();

  const people = Array.isArray(payload?.data) ? payload.data : [];
  const page = payload?.current_page || 1;
  const totalPages = payload?.total_pages || 1;
  meta.textContent = payload?.total_records
    ? `Showing ${people.length} of ${payload.total_records} results - Page ${page} of ${totalPages}`
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

export default async function decorate(block) {
  const config = {
    heading: getFieldValue(block, 'heading', 0, DEFAULTS.heading),
    eyebrow: getFieldValue(block, 'eyebrow', 1, DEFAULTS.eyebrow),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 2, DEFAULTS.apiBaseUrl)),
    submitLabel: getFieldValue(block, 'submitLabel', 3, DEFAULTS.submitLabel),
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

  inner.append(header, form, status, meta, results, pagination);
  block.replaceChildren(inner);

  let currentPage = 1;
  let totalPages = 1;
  let searchPosters;

  function renderPagination() {
    pagination.replaceChildren();
    pagination.hidden = totalPages <= 1;
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = 'Previous';
    prev.disabled = currentPage <= 1;
    prev.addEventListener('click', () => searchPosters(currentPage - 1));

    const label = document.createElement('span');
    label.textContent = `Page ${currentPage} of ${totalPages}`;

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Next';
    next.disabled = currentPage >= totalPages;
    next.addEventListener('click', () => searchPosters(currentPage + 1));

    pagination.append(prev, label, next);
  }

  searchPosters = async (page = 1) => {
    setStatus(status, 'Searching posters...', 'loading');
    submit.disabled = true;
    results.replaceChildren();
    meta.textContent = '';
    pagination.replaceChildren();
    pagination.hidden = true;

    try {
      const url = new URL('/api/posters/search', `${config.apiBaseUrl}/`);
      appendParams(url, form);
      url.searchParams.set('page', String(Math.max(1, page)));
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      currentPage = payload.current_page || page;
      totalPages = payload.total_pages || 1;
      setStatus(status, '', '');
      renderResults(results, meta, payload);
      renderPagination();
    } catch (error) {
      setStatus(status, 'Poster search is unavailable.', 'error');
    } finally {
      submit.disabled = false;
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
    }, 0);
  });
}
