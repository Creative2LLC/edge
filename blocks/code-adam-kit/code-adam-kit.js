import {
  appendFormMetadata,
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
  submissionMode: 8,
  embedUrl: 9,
};

const DEFAULTS = {
  eyebrow: 'Code Adam',
  heading: 'Help Make Your Business a Safer Place for Children.',
  intro: 'Order your free Code Adam kit today.',
  formAction: '',
  submissionMode: 'native',
  embedUrl: 'https://formstack.io/4CE0F',
  buttonText: 'Order Free Kit',
  successMessage: 'Thank you. Your Code Adam kit request has been submitted.',
  errorMessage: 'We could not submit your request. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

const US_STATES = [
  ['Alabama', 'Alabama'],
  ['Alaska', 'Alaska'],
  ['American Samoa', 'American Samoa'],
  ['Arizona', 'Arizona'],
  ['Arkansas', 'Arkansas'],
  ['California', 'California'],
  ['Colorado', 'Colorado'],
  ['Connecticut', 'Connecticut'],
  ['Delaware', 'Delaware'],
  ['District of Columbia', 'District of Columbia'],
  ['Florida', 'Florida'],
  ['Georgia', 'Georgia'],
  ['Guam', 'Guam'],
  ['Hawaii', 'Hawaii'],
  ['Idaho', 'Idaho'],
  ['Illinois', 'Illinois'],
  ['Indiana', 'Indiana'],
  ['Iowa', 'Iowa'],
  ['Kansas', 'Kansas'],
  ['Kentucky', 'Kentucky'],
  ['Louisiana', 'Louisiana'],
  ['Maine', 'Maine'],
  ['Maryland', 'Maryland'],
  ['Massachusetts', 'Massachusetts'],
  ['Michigan', 'Michigan'],
  ['Minnesota', 'Minnesota'],
  ['Mississippi', 'Mississippi'],
  ['Missouri', 'Missouri'],
  ['Montana', 'Montana'],
  ['Nebraska', 'Nebraska'],
  ['Nevada', 'Nevada'],
  ['New Hampshire', 'New Hampshire'],
  ['New Jersey', 'New Jersey'],
  ['New Mexico', 'New Mexico'],
  ['New York', 'New York'],
  ['North Carolina', 'North Carolina'],
  ['North Dakota', 'North Dakota'],
  ['Northern Mariana Islands', 'Northern Mariana Islands'],
  ['Ohio', 'Ohio'],
  ['Oklahoma', 'Oklahoma'],
  ['Oregon', 'Oregon'],
  ['Pennsylvania', 'Pennsylvania'],
  ['Puerto Rico', 'Puerto Rico'],
  ['Rhode Island', 'Rhode Island'],
  ['South Carolina', 'South Carolina'],
  ['South Dakota', 'South Dakota'],
  ['Tennessee', 'Tennessee'],
  ['Texas', 'Texas'],
  ['U.S. Virgin Islands', 'U.S. Virgin Islands'],
  ['Utah', 'Utah'],
  ['Vermont', 'Vermont'],
  ['Virginia', 'Virginia'],
  ['Washington', 'Washington'],
  ['West Virginia', 'West Virginia'],
  ['Wisconsin', 'Wisconsin'],
  ['Wyoming', 'Wyoming'],
];

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

function buildCheckbox({
  label,
  name,
  checked = false,
}) {
  const field = document.createElement('label');
  field.className = 'code-adam-kit-field code-adam-kit-checkbox-field';

  const input = document.createElement('input');
  input.className = 'code-adam-kit-checkbox';
  input.type = 'checkbox';
  input.name = name;
  input.value = 'true';
  input.checked = checked;

  field.append(input, buildLabel(label, false));
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

  const country = document.createElement('input');
  country.type = 'hidden';
  country.name = 'CodeAdam__c.Country__c';
  country.value = 'United States of America';
  form.append(country);

  const organization = buildSection('Organization');
  organization.grid.append(
    buildInput({
      label: 'Business or Organization Name',
      name: 'CodeAdam__c.Organization_Name__c',
      autocomplete: 'organization',
      required: true,
    }),
    buildSelect({
      label: 'Organization Type',
      name: 'CodeAdam__c.Organization_Type__c',
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
      label: 'Store Number',
      name: 'CodeAdam__c.Store_Number__c',
    }),
  );

  const contact = buildSection('Contact');
  contact.grid.append(
    buildInput({
      label: 'First Name',
      name: 'CodeAdam__c.First_Name__c',
      autocomplete: 'given-name',
      required: true,
    }),
    buildInput({
      label: 'Last Name',
      name: 'CodeAdam__c.Name',
      autocomplete: 'family-name',
      required: true,
    }),
    buildInput({
      label: 'Job Title',
      name: 'CodeAdam__c.Job_Title__c',
      autocomplete: 'organization-title',
    }),
    buildInput({
      label: 'Email Address',
      name: 'CodeAdam__c.CodeAdam_Email__c',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      required: true,
    }),
    buildInput({
      label: 'Re-enter Email',
      name: 'FSGFShortAnswer390',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      required: true,
    }),
  );

  const shipping = buildSection('Shipping Address');
  shipping.grid.append(
    buildInput({
      label: 'USA Street Address',
      name: 'CodeAdam__c.Street_Address__c',
      autocomplete: 'address-line1',
      required: true,
    }),
    buildInput({
      label: 'Apt/Suite',
      name: 'CodeAdam__c.Apt_Suite__c',
      autocomplete: 'address-line2',
    }),
    buildInput({
      label: 'City',
      name: 'CodeAdam__c.City__c',
      autocomplete: 'address-level2',
      required: true,
    }),
    buildSelect({
      label: 'State',
      name: 'CodeAdam__c.State__c',
      options: US_STATES,
      placeholder: 'Select a state',
      required: true,
    }),
    buildInput({
      label: 'ZIP Code',
      name: 'CodeAdam__c.Zipcode__c',
      autocomplete: 'postal-code',
      inputMode: 'numeric',
      required: true,
    }),
  );

  const kit = buildSection('Kit Request');
  kit.grid.append(
    buildSelect({
      label: 'Number of Kits',
      name: 'CodeAdam__c.Number_of_Kits__c',
      options: ['0', '1', '2', '3', '4', '5'].map((value) => [value, value]),
      required: true,
      placeholder: 'Select number of kits',
    }),
    buildSelect({
      label: 'Number of Additional Window Decals',
      name: 'CodeAdam__c.Number_of_Window_Decals__c',
      options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
        .map((value) => [value, value]),
      placeholder: 'Select number of decals',
    }),
    buildCheckbox({
      label: 'Sign me up for the NCMEC Newsletter',
      name: 'CodeAdam__c.Sign_me_up_for_the_NCMEC_Newsletter__c',
      checked: true,
    }),
  );

  form.append(organization.section, contact.section, shipping.section, kit.section);
  return form;
}

function applyEmailConfirmationValidation(form) {
  const email = form.querySelector('[name="CodeAdam__c.CodeAdam_Email__c"]');
  const confirmation = form.querySelector('[name="FSGFShortAnswer390"]');
  if (!email || !confirmation) return;

  const validate = () => {
    const matches = !confirmation.value || email.value === confirmation.value;
    confirmation.setCustomValidity(matches ? '' : 'Email and re-entered email must match.');
  };

  email.addEventListener('input', validate);
  confirmation.addEventListener('input', validate);
  confirmation.addEventListener('blur', validate);
  validate();
}

function appendOriginalFormMetadata(formData, originalFormUrl) {
  formData.set('originalFormName', 'Code Adam');
  formData.set('originalFormUrl', originalFormUrl || DEFAULTS.embedUrl);
  if (!formData.has('CodeAdam__c.Number_of_Window_Decals__c')) {
    formData.set('CodeAdam__c.Number_of_Window_Decals__c', '0');
  }
}

function buildOriginalEmbed(embedUrl) {
  const frame = document.createElement('iframe');
  frame.className = 'code-adam-kit-embed';
  frame.title = 'Code Adam order form';
  frame.src = embedUrl || DEFAULTS.embedUrl;
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.setAttribute('allow', 'clipboard-write');
  return frame;
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
    appendOriginalFormMetadata(formData, config.originalFormUrl);

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
  const submissionMode = getTextField(block, 'submissionMode').value || DEFAULTS.submissionMode;
  const embedUrl = getTextField(block, 'embedUrl').value || DEFAULTS.embedUrl;
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

  if (submissionMode === 'original-formstack') {
    shell.append(header, buildOriginalEmbed(embedUrl));
    block.replaceChildren(shell);
    return;
  }

  const form = buildForm();
  applyEmailConfirmationValidation(form);

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
    originalFormUrl: embedUrl,
    successMessage,
    errorMessage,
    isAuthoring: hasAuthoringContext(block),
  }, formSession);
}
