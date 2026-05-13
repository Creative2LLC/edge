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
  eyebrow: 'Code Adam',
  heading: 'Help Make Your Business a Safer Place for Children.',
  intro: 'Order your free Code Adam kit today.',
  formAction: '',
  buttonText: 'Order Free Kit',
  successMessage: 'Thank you. Your Code Adam kit request has been submitted.',
  errorMessage: 'We could not submit your request. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
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
  marker.className = 'code-adam-kit-required';
  marker.textContent = ' *';
  return marker;
}

function buildLabel(label, required) {
  const labelText = document.createElement('span');
  labelText.className = 'code-adam-kit-label';
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
  field.className = 'code-adam-kit-field';

  const input = document.createElement('input');
  input.className = 'code-adam-kit-input';
  input.type = type;
  input.name = name;
  if (required) input.required = true;
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputMode) input.inputMode = inputMode;

  field.append(buildLabel(label, required), input);
  return field;
}

function buildTextarea({
  label,
  name,
  rows = 4,
}) {
  const field = document.createElement('label');
  field.className = 'code-adam-kit-field';

  const textarea = document.createElement('textarea');
  textarea.className = 'code-adam-kit-textarea';
  textarea.name = name;
  textarea.rows = rows;

  field.append(buildLabel(label, false), textarea);
  return field;
}

function buildSelect({
  label,
  name,
  options,
  required = false,
  placeholder = 'Select one',
}) {
  const field = document.createElement('label');
  field.className = 'code-adam-kit-field';

  const select = document.createElement('select');
  select.className = 'code-adam-kit-select';
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

function buildSection(title) {
  const section = document.createElement('fieldset');
  section.className = 'code-adam-kit-section';

  const legend = document.createElement('legend');
  legend.className = 'code-adam-kit-section-title';
  legend.textContent = title;
  section.append(legend);

  const grid = document.createElement('div');
  grid.className = 'code-adam-kit-grid';
  section.append(grid);

  return { section, grid };
}

function buildForm() {
  const form = document.createElement('form');
  form.className = 'code-adam-kit-form';

  const organization = buildSection('Organization');
  organization.grid.append(
    buildInput({
      label: 'Business or Organization Name',
      name: 'organizationName',
      autocomplete: 'organization',
      required: true,
    }),
    buildSelect({
      label: 'Organization Type',
      name: 'organizationType',
      options: [
        ['Retail', 'Retail'],
        ['Restaurant', 'Restaurant'],
        ['Entertainment Venue', 'Entertainment Venue'],
        ['Hospitality', 'Hospitality'],
        ['Community Organization', 'Community Organization'],
        ['Other', 'Other'],
      ],
      required: true,
    }),
    buildInput({
      label: 'Number of Locations',
      name: 'locationCount',
      type: 'number',
      inputMode: 'numeric',
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
      label: 'Email Address',
      name: 'email',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      required: true,
    }),
    buildInput({
      label: 'Phone Number',
      name: 'phone',
      type: 'tel',
      autocomplete: 'tel',
      inputMode: 'tel',
      required: true,
    }),
  );

  const shipping = buildSection('Shipping Address');
  shipping.grid.append(
    buildInput({
      label: 'Address Line 1',
      name: 'addressLine1',
      autocomplete: 'address-line1',
      required: true,
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
      required: true,
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
    buildTextarea({
      label: 'Additional Notes',
      name: 'notes',
      rows: 4,
    }),
  );

  form.append(organization.section, contact.section, shipping.section);
  applyPhoneValidation(form.querySelector('[name="phone"]'));
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
      new CustomEvent('code-adam-kit:submit', {
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
      form.querySelector('[name="phone"]')?.dispatchEvent(new Event('input'));
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
  if (topPadding) block.style.setProperty('--code-adam-kit-top-padding', topPadding);

  const formAction = getTextField(block, 'formAction').value || DEFAULTS.formAction;
  const successMessage = getTextField(block, 'successMessage').value || DEFAULTS.successMessage;
  const errorMessage = getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage;

  const shell = document.createElement('div');
  shell.className = 'code-adam-kit-shell';

  const header = document.createElement('div');
  header.className = 'code-adam-kit-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'code-adam-kit-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'code-adam-kit-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'code-adam-kit-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);
  header.append(eyebrow, heading, intro);

  const form = buildForm();

  const actions = document.createElement('div');
  actions.className = 'code-adam-kit-actions';

  const status = document.createElement('p');
  status.className = 'code-adam-kit-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'code-adam-kit-submit';
  moveText(getTextField(block, 'buttonText'), submitButton, DEFAULTS.buttonText);

  actions.append(status, submitButton);
  form.append(actions);

  const formSession = createFormSession(form, 'code-adam-kit');

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
