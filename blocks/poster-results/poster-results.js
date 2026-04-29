const FIELD_LABELS = {
  heading: ['heading', 'title'],
  eyebrow: ['eyebrow', 'label'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  provider: ['provider', 'organization', 'organization code'],
  caseNumber: ['case number', 'case', 'case id'],
  posterNumber: ['poster number', 'poster', 'number', 'num'],
  environment: ['environment', 'env'],
  submitLabel: ['submit label', 'button label'],
};

const DEFAULTS = {
  heading: 'Search Missing Children Posters',
  eyebrow: 'Poster Search',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  provider: 'NCMC',
  posterNumber: 1,
  environment: 'prod',
  submitLabel: 'Search',
};

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
  const rows = getRows(block);
  const labeledRow = rows.find((row) => {
    if (row.children.length !== 2) return false;
    const label = normalizeText(row.children[0].textContent).toLowerCase();
    return labels.some((entry) => label === entry || label.includes(entry));
  });

  if (labeledRow) {
    const valueCell = labeledRow.children[1];
    const anchor = valueCell.querySelector('a');
    return normalizeText(anchor?.getAttribute('href') || valueCell.textContent);
  }

  const configRow = rows[0];
  if (!configRow) return '';
  const cell = [...configRow.children][columnIndex];
  if (!cell) return '';
  const anchor = cell.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || cell.textContent);
}

function getFieldValue(block, name, columnIndex, fallback = '') {
  return getPropValue(block, name) || getLegacyValue(block, name, columnIndex) || fallback;
}

function parsePosterNumber(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function normalizeEnvironment(value) {
  return normalizeText(value).toLowerCase().startsWith('stag') ? 'staging' : 'prod';
}

function buildEndpoint(config, provider, caseNumber, posterNumber, environment) {
  const apiRoot = normalizeApiBaseUrl(config.apiBaseUrl);
  const route = environment === 'staging' ? '/api/posters/staging' : '/api/posters';
  const path = [
    route,
    encodeURIComponent(provider),
    encodeURIComponent(caseNumber),
    posterNumber,
  ].join('/');
  const url = new URL(path, `${apiRoot}/`);
  return url.toString();
}

function createTextInput(labelText, value = '') {
  const label = document.createElement('label');
  label.className = 'poster-results-field';

  const span = document.createElement('span');
  span.textContent = labelText;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.autocomplete = 'off';

  label.append(span, input);
  return { label, input };
}

function setStatus(node, message, type = '') {
  node.className = `poster-results-status${type ? ` is-${type}` : ''}`;
  node.textContent = message;
  node.hidden = !message;
}

function fullName(child) {
  return [
    child.firstName,
    child.middleName,
    child.lastName,
  ].map(normalizeText).filter(Boolean).join(' ');
}

function detailEntries(child) {
  return [
    ['Age', child.age || child.ageNow],
    ['Missing Since', child.missingDate || child.dateMissing],
    [
      'Missing From',
      child.missingCityState || [child.missingCity, child.missingState].filter(Boolean).join(', '),
    ],
    ['Case', child.caseNumber],
  ].filter(([, value]) => normalizeText(value));
}

function createChildCard(child) {
  const card = document.createElement('article');
  card.className = 'poster-results-card';

  const photo = child.photos?.[0];
  const imageData = typeof photo === 'string' ? photo : photo?.base64;
  if (imageData) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'poster-results-photo';
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${imageData}`;
    img.alt = fullName(child) || 'Poster photo';
    imageWrap.append(img);
    card.append(imageWrap);
  }

  const body = document.createElement('div');
  body.className = 'poster-results-card-body';

  const title = document.createElement('h3');
  title.textContent = fullName(child) || 'Poster result';
  body.append(title);

  const details = document.createElement('dl');
  detailEntries(child).forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    details.append(dt, dd);
  });
  if (details.children.length) body.append(details);

  card.append(body);
  return card;
}

function renderPoster(container, payload) {
  container.replaceChildren();

  const children = Array.isArray(payload?.children) ? payload.children : [];
  if (!children.length) {
    const empty = document.createElement('p');
    empty.className = 'poster-results-empty';
    empty.textContent = 'No poster results found.';
    container.append(empty);
    return;
  }

  children.forEach((child) => {
    container.append(createChildCard(child));
  });
}

export default async function decorate(block) {
  const config = {
    heading: getFieldValue(block, 'heading', 0, DEFAULTS.heading),
    eyebrow: getFieldValue(block, 'eyebrow', 1, DEFAULTS.eyebrow),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 2, DEFAULTS.apiBaseUrl)),
    provider: getFieldValue(block, 'provider', 3, DEFAULTS.provider),
    caseNumber: getFieldValue(block, 'caseNumber', 4),
    posterNumber: parsePosterNumber(getFieldValue(
      block,
      'posterNumber',
      5,
      String(DEFAULTS.posterNumber),
    )),
    environment: normalizeEnvironment(getFieldValue(block, 'environment', 6, DEFAULTS.environment)),
    submitLabel: getFieldValue(block, 'submitLabel', 7, DEFAULTS.submitLabel),
  };

  const section = document.createElement('div');
  section.className = 'poster-results-inner';

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

  const caseField = createTextInput('Case Number', config.caseNumber);
  caseField.input.placeholder = 'Enter a case number';
  caseField.input.inputMode = 'numeric';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = config.submitLabel;

  form.append(caseField.label, submit);

  const status = document.createElement('p');
  status.hidden = true;

  const results = document.createElement('div');
  results.className = 'poster-results-list';

  section.append(header, form, status, results);
  block.replaceChildren(section);

  async function loadPoster() {
    const caseNumber = normalizeText(caseField.input.value);

    if (!caseNumber) {
      setStatus(status, 'Enter a case number.', 'error');
      results.replaceChildren();
      return;
    }

    setStatus(status, 'Loading poster results...', 'loading');
    submit.disabled = true;

    try {
      const endpoint = buildEndpoint(
        config,
        config.provider,
        caseNumber,
        config.posterNumber,
        config.environment,
      );
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setStatus(status, '', '');
      renderPoster(results, payload);
    } catch (error) {
      results.replaceChildren();
      setStatus(status, 'Poster results are unavailable.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    loadPoster();
  });

  if (config.caseNumber) {
    await loadPoster();
  }
}
