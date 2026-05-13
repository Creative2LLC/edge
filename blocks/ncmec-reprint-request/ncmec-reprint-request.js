import {
  appendFormMetadata,
  applyPhoneValidation,
  createFormSession,
  extractApiMessage,
  isFormValid,
  updateFormStatus,
} from '../../scripts/form-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  eyebrow: 0,
  heading: 1,
  intro: 2,
  formAction: 3,
  buttonText: 4,
  successMessage: 5,
  errorMessage: 6,
  topPadding: 7,
};

const DEFAULTS = {
  eyebrow: 'Publication Permissions',
  heading: 'NCMEC Reprint Request Form',
  intro: 'Use this form to request permission to reprint NCMEC publication content.',
  formAction: '',
  buttonText: 'Submit Request',
  successMessage: 'Thank you. Your reprint request has been submitted.',
  errorMessage: 'We could not submit your request. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AS', 'American Samoa'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['GU', 'Guam'],
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
  ['MP', 'Northern Mariana Islands'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['PR', 'Puerto Rico'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['VI', 'U.S. Virgin Islands'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];

const ORG_TYPES = [
  ['nonProfit', 'Non-profit'],
  ['forProfit', 'For profit'],
  ['gov', 'Law Enforcement/Government Agency'],
  ['na', 'Not applicable (requestor is an individual)'],
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

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function buildRequiredMarker() {
  const marker = document.createElement('span');
  marker.className = 'ncmec-reprint-request-required';
  marker.textContent = ' *';
  return marker;
}

function buildLabel(label, required) {
  const labelText = document.createElement('span');
  labelText.className = 'ncmec-reprint-request-label';
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
  pattern = '',
  title = '',
}) {
  const field = document.createElement('label');
  field.className = 'ncmec-reprint-request-field';

  const input = document.createElement('input');
  input.className = 'ncmec-reprint-request-input';
  input.type = type;
  input.name = name;
  if (required) input.required = true;
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputMode) input.inputMode = inputMode;
  if (pattern) input.pattern = pattern;
  if (title) input.title = title;

  field.append(buildLabel(label, required), input);
  return field;
}

function buildTextarea({
  label,
  name,
  rows = 5,
  placeholder = '',
}) {
  const field = document.createElement('label');
  field.className = 'ncmec-reprint-request-field';

  const textarea = document.createElement('textarea');
  textarea.className = 'ncmec-reprint-request-textarea';
  textarea.name = name;
  textarea.rows = rows;
  if (placeholder) textarea.placeholder = placeholder;

  field.append(buildLabel(label, false), textarea);
  return field;
}

function buildSelect({
  label,
  name,
  options,
  required = false,
  placeholder = 'Select',
}) {
  const field = document.createElement('label');
  field.className = 'ncmec-reprint-request-field';

  const select = document.createElement('select');
  select.className = 'ncmec-reprint-request-select';
  select.name = name;
  if (required) select.required = true;

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  select.append(placeholderOption);

  options.forEach(([value, labelText]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelText;
    select.append(option);
  });

  field.append(buildLabel(label, required), select);
  return field;
}

function buildRadioGroup({
  legend,
  name,
  options,
  required = false,
  defaultValue = '',
}) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'ncmec-reprint-request-radio-group';

  const legendElement = document.createElement('legend');
  legendElement.className = 'ncmec-reprint-request-label';
  legendElement.textContent = legend;
  if (required) legendElement.append(buildRequiredMarker());
  fieldset.append(legendElement);

  const list = document.createElement('div');
  list.className = 'ncmec-reprint-request-radio-list';

  options.forEach(([value, label], index) => {
    const item = document.createElement('label');
    item.className = 'ncmec-reprint-request-radio-item';

    const input = document.createElement('input');
    input.className = 'ncmec-reprint-request-radio';
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.required = required;
    input.checked = value === defaultValue || (!defaultValue && index === 0 && !required);

    const text = document.createElement('span');
    text.textContent = label;

    item.append(input, text);
    list.append(item);
  });

  fieldset.append(list);
  return fieldset;
}

function buildSection(title) {
  const section = document.createElement('fieldset');
  section.className = 'ncmec-reprint-request-section';

  const legend = document.createElement('legend');
  legend.className = 'ncmec-reprint-request-section-title';
  legend.textContent = title;
  section.append(legend);

  const grid = document.createElement('div');
  grid.className = 'ncmec-reprint-request-grid';
  section.append(grid);

  return { section, grid };
}

function buildHidden(name, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  return input;
}

function buildTerms() {
  const terms = document.createElement('div');
  terms.className = 'ncmec-reprint-request-terms';

  const heading = document.createElement('h3');
  heading.textContent = 'By submitting this form, you agree to the following terms and conditions:';

  const list = document.createElement('ul');
  [
    'You will not modify the Content in any way unless specifically authorized in writing by NCMEC.',
    'You will not delete or alter any copyright, trademark or other intellectual property or proprietary notices contained in the Content.',
  ].forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry;
    list.append(item);
  });

  terms.append(heading, list);
  return terms;
}

function buildForm() {
  const form = document.createElement('form');
  form.className = 'ncmec-reprint-request-form';
  form.append(buildHidden('LanguageId', 'en'), buildHidden('action', 'reprintRequest'));

  const requestor = buildSection('Requestor Information');
  requestor.grid.append(
    buildInput({
      label: 'Requestor Name',
      name: 'requestorName',
      autocomplete: 'name',
      required: true,
    }),
    buildInput({
      label: 'Organization Name',
      name: 'orgName',
      autocomplete: 'organization',
      required: true,
    }),
    buildRadioGroup({
      legend: 'Organization Type',
      name: 'orgType',
      options: ORG_TYPES,
      defaultValue: 'nonProfit',
    }),
    buildInput({
      label: 'Address 1',
      name: 'address1',
      autocomplete: 'address-line1',
      required: true,
    }),
    buildInput({
      label: 'Address 2',
      name: 'address2',
      autocomplete: 'address-line2',
    }),
    buildInput({
      label: 'City',
      name: 'city',
      autocomplete: 'address-level2',
      required: true,
    }),
    buildSelect({
      label: 'State',
      name: 'state',
      options: US_STATES,
      required: true,
    }),
    buildInput({
      label: 'Zip Code',
      name: 'zip',
      autocomplete: 'postal-code',
      inputMode: 'numeric',
      pattern: '^\\d{5}(-\\d{4})?$',
      title: 'Enter a valid ZIP code.',
      required: true,
    }),
    buildInput({
      label: 'Contact Phone',
      name: 'contactPhone',
      type: 'tel',
      autocomplete: 'tel',
      inputMode: 'tel',
      required: true,
    }),
    buildInput({
      label: 'Email',
      name: 'email',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      required: true,
    }),
  );

  const publication = buildSection('Publication Request');
  publication.grid.append(
    buildInput({
      label: 'Publication Title',
      name: 'publicationTitle',
      required: true,
    }),
    buildInput({
      label: 'Publication Date',
      name: 'publicationDate',
      inputMode: 'numeric',
      pattern: '^(0[1-9]|1[0-2])-([0-2][0-9]|3[01])-\\d{4}$',
      title: 'Use mm-dd-yyyy for dates.',
      required: true,
    }),
    buildInput({
      label: 'Requestor Publication, Conference, or Event Name',
      name: 'event',
      required: true,
    }),
    buildInput({
      label: 'Requested Format of Reprinted Publication',
      name: 'reprintedFormat',
      required: true,
    }),
  );

  const permissions = buildSection('Permissions');
  permissions.grid.append(
    buildRadioGroup({
      legend: 'How will the NCMEC publication be used?',
      name: 'agreement',
      required: true,
      options: [
        ['yes', 'I am using the NCMEC publication exactly as it appears in the original publication.'],
        ['no', 'I would like to modify the text of the NCMEC publication.'],
      ],
    }),
    buildTextarea({
      label: 'Describe Modifications',
      name: 'modifications',
      placeholder: 'Describe modifications here.',
    }),
    buildTerms(),
  );

  form.append(requestor.section, publication.section, permissions.section);
  applyPhoneValidation(form.querySelector('[name="contactPhone"]'));
  return form;
}

function bindSubmit(block, form, submitButton, status, config, formSession) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!isFormValid(form)) return;

    if (!config.action) {
      const message = config.isAuthoring
        ? DEFAULTS.missingEndpointAuthorMessage
        : DEFAULTS.missingEndpointMessage;
      updateFormStatus(status, message, 'info');
      return;
    }

    const formData = new FormData(form);
    appendFormMetadata(formData, formSession);

    block.dispatchEvent(
      new CustomEvent('ncmec-reprint-request:submit', {
        bubbles: true,
        detail: Object.fromEntries(formData.entries()),
      }),
    );

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    updateFormStatus(status, 'Submitting request...', 'info');

    try {
      const response = await fetch(config.action, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
      });
      const responseMessage = await extractApiMessage(response);

      if (!response.ok) {
        throw new Error(responseMessage || config.errorMessage);
      }

      form.reset();
      formSession.reset();
      form.querySelector('[name="contactPhone"]')?.dispatchEvent(new Event('input'));
      updateFormStatus(status, responseMessage || config.successMessage, 'success');
    } catch (error) {
      const message = error instanceof Error
        && error.message
        && error.message !== 'Failed to fetch'
        ? error.message
        : config.errorMessage;
      updateFormStatus(status, message, 'error');
    } finally {
      submitButton.disabled = false;
      block.classList.remove('is-submitting');
    }
  });
}

export default function decorate(block) {
  const topPadding = normalizeLengthValue(getTextField(block, 'topPadding').value);
  if (topPadding) block.style.setProperty('--ncmec-reprint-request-top-padding', topPadding);

  const formAction = getTextField(block, 'formAction').value || DEFAULTS.formAction;
  const successMessage = getTextField(block, 'successMessage').value || DEFAULTS.successMessage;
  const errorMessage = getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage;

  const shell = document.createElement('div');
  shell.className = 'ncmec-reprint-request-shell';

  const header = document.createElement('div');
  header.className = 'ncmec-reprint-request-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'ncmec-reprint-request-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'ncmec-reprint-request-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'ncmec-reprint-request-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);
  header.append(eyebrow, heading, intro);

  const form = buildForm();
  const actions = document.createElement('div');
  actions.className = 'ncmec-reprint-request-actions';

  const status = document.createElement('p');
  status.className = 'ncmec-reprint-request-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'ncmec-reprint-request-submit';
  moveText(getTextField(block, 'buttonText'), submitButton, DEFAULTS.buttonText);

  actions.append(status, submitButton);
  form.append(actions);

  const formSession = createFormSession(form, 'ncmec-reprint-request');

  shell.append(header, form);
  block.replaceChildren(shell);

  bindSubmit(block, form, submitButton, status, {
    action: formAction,
    successMessage,
    errorMessage,
    isAuthoring: hasAuthoringContext(block),
  }, formSession);
  observeReveal(block);
}
