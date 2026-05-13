import { isFormValid, updateFormStatus } from '../../scripts/form-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  eyebrow: 0,
  heading: 1,
  intro: 2,
  formAction: 3,
  clientTokensEndpoint: 4,
  docsUrl: 5,
  buttonText: 6,
  successMessage: 7,
  errorMessage: 8,
  topPadding: 9,
};

const DEFAULTS = {
  eyebrow: 'Poster API Registration',
  heading: 'Missing Child Poster API Registration',
  intro:
    'Register your application to request access to NCMEC missing child poster data.',
  formAction: '/content/endpoints/posterapi/registration',
  clientTokensEndpoint: '/content/endpoints/posterapi/registration/clienttokens',
  docsUrl: 'http://external-api-posterqa.ncmecad.net/swagger/index.html',
  buttonText: 'Register Application',
  successMessage:
    'Your application has been registered. Please record these credentials now.',
  errorMessage:
    'We could not register this application. Please review the form and try again.',
};

const US_STATES = [
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

const DISPLAY_MEDIUM_OPTIONS = [
  ['Website', 'Website'],
  ['Mobile Application', 'Mobile Application'],
  ['Digital Signage', 'Digital Signage'],
  ['Print', 'Print'],
  ['Other', 'Other'],
];

const COVERAGE_OPTIONS = [
  ['National', 'National'],
  ['Regional', 'Regional'],
  ['State', 'State'],
  ['Local', 'Local'],
  ['Other', 'Other'],
];

function observeReveal(block) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    block.classList.add('is-visible');
    observer.disconnect();
  }, { threshold: 0.16 });

  observer.observe(block);
}

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getIndexedFallbackCell(block, name) {
  const row = getRows(block)[FIELD_INDEX[name]];
  if (!row) return null;
  if (row.children.length === 2) return row.children[1];
  return row.children[0] || row;
}

function getTextField(block, name) {
  return readTextField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
}

function getRichField(block, name) {
  return readRichTextField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
}

function moveText(field, target, fallback = '') {
  if (field.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    return;
  }

  target.textContent = field.value || fallback;
}

function moveHtml(field, target, fallback = '') {
  if (field.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    return;
  }

  target.innerHTML = field.html || fallback;
}

function normalizeLengthValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

function buildRequiredMarker() {
  const marker = document.createElement('span');
  marker.className = 'missing-child-poster-api-registration-required';
  marker.textContent = ' *';
  return marker;
}

function buildFieldLabel(label, required) {
  const labelText = document.createElement('span');
  labelText.className = 'missing-child-poster-api-registration-label';
  labelText.textContent = label;
  if (required) labelText.append(buildRequiredMarker());
  return labelText;
}

function buildInput({
  label,
  name,
  type = 'text',
  required = false,
  autocomplete = '',
  inputMode = '',
}) {
  const field = document.createElement('label');
  field.className = 'missing-child-poster-api-registration-field';

  const input = document.createElement('input');
  input.className = 'missing-child-poster-api-registration-input';
  input.type = type;
  input.name = name;
  if (required) input.required = true;
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputMode) input.inputMode = inputMode;

  field.append(buildFieldLabel(label, required), input);
  return field;
}

function buildTextarea({
  label,
  name,
  required = false,
  rows = 4,
}) {
  const field = document.createElement('label');
  field.className = 'missing-child-poster-api-registration-field';

  const textarea = document.createElement('textarea');
  textarea.className = 'missing-child-poster-api-registration-textarea';
  textarea.name = name;
  textarea.rows = rows;
  if (required) textarea.required = true;

  field.append(buildFieldLabel(label, required), textarea);
  return field;
}

function buildSelect({
  label,
  name,
  options,
  required = false,
  placeholder = 'Select one',
  value = '',
}) {
  const field = document.createElement('label');
  field.className = 'missing-child-poster-api-registration-field';

  const select = document.createElement('select');
  select.className = 'missing-child-poster-api-registration-select';
  select.name = name;
  if (required) select.required = true;

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  placeholderOption.disabled = true;
  placeholderOption.selected = !value;
  select.append(placeholderOption);

  options.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    if (optionValue === value) option.selected = true;
    select.append(option);
  });

  field.append(buildFieldLabel(label, required), select);
  return field;
}

function buildSection(title) {
  const section = document.createElement('fieldset');
  section.className = 'missing-child-poster-api-registration-section';

  const legend = document.createElement('legend');
  legend.className = 'missing-child-poster-api-registration-section-title';
  legend.textContent = title;
  section.append(legend);

  const grid = document.createElement('div');
  grid.className = 'missing-child-poster-api-registration-grid';
  section.append(grid);

  return { section, grid };
}

function getFormValues(form) {
  return Object.fromEntries(
    [...new FormData(form).entries()]
      .map(([name, value]) => [name, String(value).trim()]),
  );
}

function buildAdaptiveFormPayload(data) {
  return {
    afData: {
      afUnboundData: {
        data,
      },
    },
  };
}

async function parseJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return {};

  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function postRegistration(endpoint, data) {
  const body = new FormData();
  body.set('jcr:data', JSON.stringify(buildAdaptiveFormPayload(data)));

  const response = await fetch(endpoint, {
    method: 'POST',
    body,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const message = await parseJsonResponse(response);
    throw new Error(message?.error || `Registration failed (${response.status}).`);
  }
}

async function fetchClientTokens(endpoint) {
  const response = await fetch(endpoint, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Credential lookup failed (${response.status}).`);
  }

  const data = await parseJsonResponse(response);
  if (!data.clientID || !data.clientSecret) {
    throw new Error('The credential response was missing client keys.');
  }

  return data;
}

function createCredentialRow(label, value, type = 'text') {
  const row = document.createElement('div');
  row.className = 'missing-child-poster-api-registration-token';

  const labelText = document.createElement('span');
  labelText.className = 'missing-child-poster-api-registration-token-label';
  labelText.textContent = label;

  const control = document.createElement('div');
  control.className = 'missing-child-poster-api-registration-token-control';

  const input = document.createElement('input');
  input.type = type;
  input.readOnly = true;
  input.value = value;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'missing-child-poster-api-registration-token-button';
  copy.textContent = 'Copy';
  copy.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(input.value);
    copy.textContent = 'Copied';
    window.setTimeout(() => {
      copy.textContent = 'Copy';
    }, 1600);
  });

  control.append(input);
  if (type === 'password') {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'missing-child-poster-api-registration-token-button';
    toggle.textContent = 'Show';
    toggle.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      toggle.textContent = isHidden ? 'Hide' : 'Show';
    });
    control.append(toggle);
  }

  control.append(copy);
  row.append(labelText, control);
  return row;
}

function showCredentials(panel, tokens, docsUrl) {
  panel.hidden = false;
  panel.replaceChildren();

  const heading = document.createElement('h3');
  heading.className = 'missing-child-poster-api-registration-credentials-heading';
  heading.textContent = 'Application credentials';

  const copy = document.createElement('p');
  copy.className = 'missing-child-poster-api-registration-credentials-copy';
  copy.textContent = 'Please record these credentials now. They will not be displayed again.';

  const tokensList = document.createElement('div');
  tokensList.className = 'missing-child-poster-api-registration-tokens';
  tokensList.append(
    createCredentialRow('Client ID', tokens.clientID),
    createCredentialRow('Client Secret', tokens.clientSecret, 'password'),
  );

  panel.append(heading, copy, tokensList);

  if (docsUrl) {
    const docs = document.createElement('p');
    docs.className = 'missing-child-poster-api-registration-docs';

    const link = document.createElement('a');
    link.href = docsUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Poster API documentation';
    docs.append('Visit the ', link, ' for implementation details.');
    panel.append(docs);
  }
}

function bindSubmit(block, form, submitButton, status, credentialsPanel, config) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!isFormValid(form)) return;

    const data = getFormValues(form);
    block.dispatchEvent(
      new CustomEvent('missing-child-poster-api-registration:submit', {
        bubbles: true,
        detail: data,
      }),
    );

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    credentialsPanel.hidden = true;
    updateFormStatus(status, 'Registering application...', 'info');

    try {
      await postRegistration(config.formAction, data);
      const tokens = await fetchClientTokens(config.clientTokensEndpoint);
      form.reset();
      showCredentials(credentialsPanel, tokens, config.docsUrl);
      updateFormStatus(status, config.successMessage, 'success');
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : config.errorMessage;
      updateFormStatus(status, message || config.errorMessage, 'error');
    } finally {
      submitButton.disabled = false;
      block.classList.remove('is-submitting');
    }
  });
}

function buildForm() {
  const form = document.createElement('form');
  form.className = 'missing-child-poster-api-registration-form';

  const app = buildSection('Application');
  app.grid.append(
    buildInput({
      label: 'Application Name',
      name: 'applicationName',
      required: true,
    }),
    buildInput({
      label: 'Organization Name',
      name: 'organizationName',
      autocomplete: 'organization',
      required: true,
    }),
    buildInput({
      label: 'Organization Website',
      name: 'organizationUrl',
      type: 'url',
      autocomplete: 'url',
    }),
    buildSelect({
      label: 'Poster Display Medium',
      name: 'posterDisplayMediumType',
      options: DISPLAY_MEDIUM_OPTIONS,
      required: true,
    }),
    buildSelect({
      label: 'Distribution Coverage Area',
      name: 'posterDistributionCoverageArea',
      options: COVERAGE_OPTIONS,
      required: true,
    }),
    buildTextarea({
      label: 'Distribution Information',
      name: 'posterDistributionInformation',
      rows: 4,
      required: true,
    }),
  );

  const contact = buildSection('Contact');
  contact.grid.append(
    buildInput({
      label: 'Contact Name',
      name: 'contactName',
      autocomplete: 'name',
      required: true,
    }),
    buildInput({
      label: 'Job Title',
      name: 'jobTitle',
      autocomplete: 'organization-title',
    }),
    buildInput({
      label: 'Phone Number',
      name: 'phoneNumber',
      type: 'tel',
      autocomplete: 'tel',
      inputMode: 'tel',
      required: true,
    }),
    buildInput({
      label: 'Email Address',
      name: 'emailAddress',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      required: true,
    }),
  );

  const address = buildSection('Address');
  address.grid.append(
    buildInput({
      label: 'Address Line 1',
      name: 'line1',
      autocomplete: 'address-line1',
      required: true,
    }),
    buildInput({
      label: 'Address Line 2',
      name: 'line2',
      autocomplete: 'address-line2',
    }),
    buildInput({
      label: 'City',
      name: 'city',
      autocomplete: 'address-level2',
      required: true,
    }),
    buildInput({
      label: 'County',
      name: 'county',
    }),
    buildSelect({
      label: 'State',
      name: 'state',
      options: US_STATES,
      placeholder: 'Select a state',
      required: true,
    }),
    buildInput({
      label: 'ZIP Code',
      name: 'zip',
      autocomplete: 'postal-code',
      inputMode: 'numeric',
      required: true,
    }),
    buildInput({
      label: 'Country',
      name: 'country',
      autocomplete: 'country-name',
      required: true,
    }),
  );

  form.append(app.section, contact.section, address.section);
  form.querySelector('[name="country"]').value = 'United States';
  return form;
}

export default function decorate(block) {
  const topPadding = normalizeLengthValue(getTextField(block, 'topPadding').value);
  if (topPadding) {
    block.style.setProperty(
      '--missing-child-poster-api-registration-top-padding',
      topPadding,
    );
  }

  const config = {
    formAction: getTextField(block, 'formAction').value || DEFAULTS.formAction,
    clientTokensEndpoint:
      getTextField(block, 'clientTokensEndpoint').value
      || DEFAULTS.clientTokensEndpoint,
    docsUrl: getTextField(block, 'docsUrl').value || DEFAULTS.docsUrl,
    successMessage:
      getTextField(block, 'successMessage').value || DEFAULTS.successMessage,
    errorMessage:
      getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage,
  };

  const shell = document.createElement('div');
  shell.className = 'missing-child-poster-api-registration-shell';

  const header = document.createElement('div');
  header.className = 'missing-child-poster-api-registration-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'missing-child-poster-api-registration-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'missing-child-poster-api-registration-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'missing-child-poster-api-registration-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);

  header.append(eyebrow, heading, intro);

  const form = buildForm();

  const actions = document.createElement('div');
  actions.className = 'missing-child-poster-api-registration-actions';

  const status = document.createElement('p');
  status.className = 'missing-child-poster-api-registration-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'missing-child-poster-api-registration-submit';
  moveText(getTextField(block, 'buttonText'), submitButton, DEFAULTS.buttonText);

  actions.append(status, submitButton);
  form.append(actions);

  const credentialsPanel = document.createElement('section');
  credentialsPanel.className = 'missing-child-poster-api-registration-credentials';
  credentialsPanel.hidden = true;

  shell.append(header, form, credentialsPanel);
  block.replaceChildren(shell);

  bindSubmit(block, form, submitButton, status, credentialsPanel, config);
  observeReveal(block);
}
