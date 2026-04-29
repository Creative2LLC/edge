const FIELD_LABELS = {
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  provider: ['provider', 'organization', 'organization code'],
  caseNumber: ['case number', 'case', 'case id'],
  posterNumber: ['poster number', 'poster', 'number', 'num'],
  environment: ['environment', 'env'],
  submitLabel: ['submit label', 'button label'],
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
  const url = new URL(`${route}/${encodeURIComponent(provider)}/${encodeURIComponent(caseNumber)}/${posterNumber}`, `${apiRoot}/`);
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

function createEnvironmentSelect(value) {
  const label = document.createElement('label');
  label.className = 'poster-results-field';

  const span = document.createElement('span');
  span.textContent = 'Environment';

  const select = document.createElement('select');
  [
    ['prod', 'Production'],
    ['staging', 'Staging'],
  ].forEach(([optionValue, text]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = text;
    option.selected = optionValue === value;
    select.append(option);
  });

  label.append(span, select);
  return { label, select };
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
    ['Missing From', child.missingCityState || [child.missingCity, child.missingState].filter(Boolean).join(', ')],
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
    heading: getFieldValue(block, 'heading', 0, 'Poster Results'),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 1)),
    provider: getFieldValue(block, 'provider', 2),
    caseNumber: getFieldValue(block, 'caseNumber', 3),
    posterNumber: parsePosterNumber(getFieldValue(block, 'posterNumber', 4, '1')),
    environment: normalizeEnvironment(getFieldValue(block, 'environment', 5, 'prod')),
    submitLabel: getFieldValue(block, 'submitLabel', 6, 'Search'),
  };

  const section = document.createElement('div');
  section.className = 'poster-results-inner';

  const heading = document.createElement('h2');
  heading.className = 'poster-results-heading';
  heading.textContent = config.heading;

  const form = document.createElement('form');
  form.className = 'poster-results-form';

  const providerField = createTextInput('Provider', config.provider);
  const caseField = createTextInput('Case Number', config.caseNumber);
  const posterField = createTextInput('Poster Number', String(config.posterNumber));
  const environmentField = createEnvironmentSelect(config.environment);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = config.submitLabel;

  form.append(
    providerField.label,
    caseField.label,
    posterField.label,
    environmentField.label,
    submit,
  );

  const status = document.createElement('p');
  status.hidden = true;

  const results = document.createElement('div');
  results.className = 'poster-results-list';

  section.append(heading, form, status, results);
  block.replaceChildren(section);

  async function loadPoster() {
    const provider = normalizeText(providerField.input.value);
    const caseNumber = normalizeText(caseField.input.value);
    const posterNumber = parsePosterNumber(posterField.input.value);
    const environment = environmentField.select.value;

    if (!config.apiBaseUrl || !provider || !caseNumber) {
      setStatus(status, 'Enter an API base URL, provider, and case number.', 'error');
      results.replaceChildren();
      return;
    }

    setStatus(status, 'Loading poster results...', 'loading');
    submit.disabled = true;

    try {
      const endpoint = buildEndpoint(config, provider, caseNumber, posterNumber, environment);
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

  if (config.apiBaseUrl && config.provider && config.caseNumber) {
    await loadPoster();
  }
}
