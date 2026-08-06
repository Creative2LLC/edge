import {
  appendFormMetadata,
  createFormSession,
  extractApiMessage,
  isFormValid,
  normalizeFormAction,
  resolveFormAction,
  updateFormStatus,
} from '../../scripts/form-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';
import focusScrollableRegion from '../../scripts/a11y-utils.js';

const FIELD_INDEX = {
  eyebrow: 0,
  heading: 1,
  intro: 2,
  formAction: 3,
  submissionMode: 4,
  notificationEmail: 5,
  clientTokensEndpoint: 6,
  docsUrl: 7,
  buttonText: 8,
  successMessage: 9,
  errorMessage: 10,
  topPadding: 11,
};

const DEFAULTS = {
  eyebrow: 'Poster API Registration',
  heading: 'Missing Child Poster API Registration',
  intro:
    'Register your application to request access to NCMEC missing child poster data.',
  formAction: '',
  submissionMode: 'backend-store-email',
  clientTokensEndpoint: '/content/endpoints/posterapi/registration/clienttokens',
  docsUrl: 'http://external-api-posterqa.ncmecad.net/swagger/index.html',
  buttonText: 'Register Application',
  successMessage:
    'Thank you. Your request has been submitted.',
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

const COUNTRY_OPTIONS = [
  ['United States', 'United States'],
  ['Canada', 'Canada'],
  ['Mexico', 'Mexico'],
  ['Other', 'Other'],
];

const SUBMISSION_MODES = new Set([
  'backend-store',
  'backend-email',
  'backend-store-email',
  'legacy-aem',
]);

const TERMS_TEXT = `Please read the following terms of use carefully. By accessing and signing up
for this Poster Application Programming Interface ("API") service offered by the National
Center for Missing & Exploited Children (the "Poster API Service"), you agree to be bound
by the terms listed below. The general NCMEC website terms and conditions and privacy
policy incorporates these Terms of Service.

Signing up for the Poster API Service does not create a partnership or other contractual
relationship between you and NCMEC. The Poster API Service was designed solely to
facilitate the distribution of missing and unidentified children posters in order to more
quickly recover missing children.

You agree that you are responsible for checking NCMEC's Poster API Service for the most
up-to-date posters and status. NCMEC owns all content on the Poster API Service,
including copyrights, trademarks, service marks, designs, text, graphics, layout, logos,
pictures, audio/video clips, information, and data. You agree that you will not delete or
alter copyright, trademark, intellectual property, or proprietary notices contained in the
content.

You will not use the content for any commercial, fundraising, or sponsorship purpose, or
in any way that creates an impression of endorsement, affiliation, partnership, or
sponsorship by NCMEC. You agree to inform NCMEC if you intend to use the Poster API
Service or content in connection with technology-assisted programs, including artificial
intelligence or facial recognition technologies.

NCMEC reserves the right to change, update, discontinue, restrict, terminate, or prevent
access to the Poster API Service or content at any time without notice.`;

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

function normalizeSubmissionMode(value) {
  const mode = String(value || DEFAULTS.submissionMode).trim().toLowerCase();
  return SUBMISSION_MODES.has(mode) ? mode : DEFAULTS.submissionMode;
}

function buildRequiredMarker() {
  const marker = document.createElement('span');
  marker.className = 'missing-child-poster-api-registration-required';
  marker.textContent = ' *';
  return marker;
}

function buildHelpText(text) {
  if (!text) return null;
  const help = document.createElement('span');
  help.className = 'missing-child-poster-api-registration-help';
  help.textContent = text;
  return help;
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
  placeholder = '',
  help = '',
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
  if (placeholder) input.placeholder = placeholder;

  field.append(buildFieldLabel(label, required), input);
  const helpText = buildHelpText(help);
  if (helpText) field.append(helpText);
  return field;
}

function buildTextarea({
  label,
  name,
  required = false,
  rows = 4,
  help = '',
}) {
  const field = document.createElement('label');
  field.className = 'missing-child-poster-api-registration-field';

  const textarea = document.createElement('textarea');
  textarea.className = 'missing-child-poster-api-registration-textarea';
  textarea.name = name;
  textarea.rows = rows;
  if (required) textarea.required = true;

  field.append(buildFieldLabel(label, required), textarea);
  const helpText = buildHelpText(help);
  if (helpText) field.append(helpText);
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

function buildCheckbox({ label, name, required = false }) {
  const field = document.createElement('label');
  field.className = 'missing-child-poster-api-registration-checkbox-field';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = name;
  input.value = '1';
  if (required) input.required = true;

  const labelText = document.createElement('span');
  labelText.textContent = label;
  if (required) labelText.append(buildRequiredMarker());

  field.append(input, labelText);
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

async function postLegacyRegistration(endpoint, data) {
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
  return parseJsonResponse(response);
}

async function postBackendRegistration(endpoint, data, config, formSession) {
  const body = new FormData();
  Object.entries(data).forEach(([key, value]) => body.set(key, value));
  body.set('submissionMode', config.submissionMode);
  if (config.notificationEmail) {
    body.set('notificationEmail', config.notificationEmail);
  }
  appendFormMetadata(body, formSession);

  const response = await fetch(endpoint, {
    method: 'POST',
    body,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const message = await extractApiMessage(response);
    throw new Error(message || `Registration failed (${response.status}).`);
  }

  return parseJsonResponse(response);
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

function getResponseTokens(responseData) {
  if (responseData?.clientID && responseData?.clientSecret) return responseData;
  if (responseData?.clientId && responseData?.clientSecret) {
    return {
      clientID: responseData.clientId,
      clientSecret: responseData.clientSecret,
    };
  }
  if (responseData?.tokens?.clientID && responseData?.tokens?.clientSecret) {
    return responseData.tokens;
  }
  return null;
}

function bindSubmit(block, form, submitButton, status, credentialsPanel, config) {
  const formSession = createFormSession(
    form,
    'missing-child-poster-api-registration',
  );

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
    updateFormStatus(status, 'Submitting registration...', 'info');

    try {
      const responseData = config.submissionMode === 'legacy-aem'
        ? await postLegacyRegistration(config.formAction, data)
        : await postBackendRegistration(config.formAction, data, config, formSession);
      let tokens = getResponseTokens(responseData);

      if (!tokens && config.submissionMode === 'legacy-aem' && config.clientTokensEndpoint) {
        tokens = await fetchClientTokens(config.clientTokensEndpoint);
      }

      form.reset();
      formSession.reset();
      if (tokens) showCredentials(credentialsPanel, tokens, config.docsUrl);
      updateFormStatus(status, responseData?.message || config.successMessage, 'success');
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
      help: 'What is the name of the company\'s application that will be using data from the API?',
    }),
  );

  const company = buildSection('Company Information');
  company.grid.append(
    buildInput({
      label: 'Company or Organization Name',
      name: 'organizationName',
      autocomplete: 'organization',
    }),
    buildInput({
      label: 'Website URL',
      name: 'organizationUrl',
      type: 'url',
      autocomplete: 'url',
      placeholder: 'https://',
    }),
  );

  const address = buildSection('Address');
  address.grid.append(
    buildInput({
      label: 'Address Line 1',
      name: 'addressLine1',
      autocomplete: 'address-line1',
    }),
    buildInput({
      label: 'Address Line 2',
      name: 'addressLine2',
      autocomplete: 'address-line2',
    }),
    buildInput({
      label: 'City',
      name: 'city',
      autocomplete: 'address-level2',
    }),
    buildInput({
      label: 'County',
      name: 'county',
    }),
    buildSelect({
      label: 'State/Province/Region',
      name: 'stateProvinceRegion',
      options: US_STATES,
      placeholder: 'Select a state',
    }),
    buildInput({
      label: 'ZIP/Postal Code',
      name: 'zipPostalCode',
      autocomplete: 'postal-code',
      inputMode: 'numeric',
    }),
    buildSelect({
      label: 'Country',
      name: 'country',
      options: COUNTRY_OPTIONS,
      placeholder: 'Select a country',
      value: 'United States',
    }),
  );

  const contact = buildSection('Primary Contact');
  contact.grid.append(
    buildInput({
      label: 'Full Name',
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
      label: 'Email Address',
      name: 'emailAddress',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      required: true,
    }),
    buildInput({
      label: 'Phone Number',
      name: 'phoneNumber',
      type: 'tel',
      autocomplete: 'tel',
      inputMode: 'tel',
    }),
  );

  const additional = buildSection('Additional Information');
  additional.grid.append(
    buildTextarea({
      label: 'What type of medium will be used to display the posters? Please be specific.',
      name: 'posterDisplayMediumType',
      rows: 3,
      required: true,
    }),
    buildInput({
      label: 'How would you describe your distribution coverage area?',
      name: 'posterDistributionCoverageArea',
      required: true,
      help: 'For example: national, certain regions, or local area.',
    }),
    buildTextarea({
      label: 'How will the poster information be distributed by your company?',
      name: 'posterDistributionInformation',
      rows: 5,
      required: true,
    }),
  );

  const terms = buildSection('Terms of Service');
  const termsCopy = document.createElement('div');
  termsCopy.className = 'missing-child-poster-api-registration-terms';
  focusScrollableRegion(termsCopy, 'Terms of Service');
  TERMS_TEXT.split('\n\n').forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph.replace(/\s+/g, ' ').trim();
    termsCopy.append(p);
  });
  terms.grid.append(
    termsCopy,
    buildCheckbox({
      label: 'I have read and agree to the Terms of Service.',
      name: 'termsAccepted',
      required: true,
    }),
  );

  form.append(
    app.section,
    company.section,
    address.section,
    contact.section,
    additional.section,
    terms.section,
  );
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

  const submissionMode = normalizeSubmissionMode(getTextField(block, 'submissionMode').value);
  const authoredAction = getTextField(block, 'formAction').value;
  const config = {
    formAction: submissionMode === 'legacy-aem'
      ? normalizeFormAction(authoredAction || '/content/endpoints/posterapi/registration')
      : resolveFormAction('missing-child-poster-api-registration', authoredAction),
    submissionMode,
    notificationEmail: getTextField(block, 'notificationEmail').value,
    clientTokensEndpoint: normalizeFormAction(
      getTextField(block, 'clientTokensEndpoint').value
      || DEFAULTS.clientTokensEndpoint,
    ),
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

  if (!config.formAction) {
    submitButton.disabled = true;
    updateFormStatus(status, 'A valid form endpoint is required before this form can submit.', 'error');
    return;
  }

  bindSubmit(block, form, submitButton, status, credentialsPanel, config);
}
