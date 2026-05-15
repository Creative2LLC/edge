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
  submissionMode: 3,
  formAction: 4,
  jotformAction: 5,
  buttonText: 6,
  successMessage: 7,
  errorMessage: 8,
  topPadding: 9,
};

const DEFAULTS = {
  eyebrow: 'Fundraising',
  heading: 'Host a Fundraiser',
  intro: 'Tell us how you would like to raise funds for NCMEC, and our team will follow up with more information.',
  submissionMode: 'backend',
  formAction: '',
  jotformAction: 'https://submit.jotform.com/submit/252933506907159',
  buttonText: 'Submit',
  successMessage: 'Thank you. Your fundraiser interest form has been submitted.',
  errorMessage: 'We could not submit your request. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL or switch to Jotform submission mode.',
};

const FUNDRAISING_OPTIONS = [
  'Local events',
  'Annual fundraisers',
  'Workplace giving',
  'Social Media',
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
  marker.className = 'host-a-fundraiser-required';
  marker.textContent = ' *';
  return marker;
}

function buildLabel(label, required) {
  const labelText = document.createElement('span');
  labelText.className = 'host-a-fundraiser-label';
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
  pattern = '',
  title = '',
}) {
  const field = document.createElement('label');
  field.className = 'host-a-fundraiser-field';

  const input = document.createElement('input');
  input.className = 'host-a-fundraiser-input';
  input.type = type;
  input.name = name;
  if (required) input.required = true;
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputMode) input.inputMode = inputMode;
  if (placeholder) input.placeholder = placeholder;
  if (pattern) input.pattern = pattern;
  if (title) input.title = title;

  field.append(buildLabel(label, required), input);
  return field;
}

function buildTextarea({
  label,
  name,
  rows = 5,
}) {
  const field = document.createElement('label');
  field.className = 'host-a-fundraiser-field host-a-fundraiser-field-wide';

  const textarea = document.createElement('textarea');
  textarea.className = 'host-a-fundraiser-textarea';
  textarea.name = name;
  textarea.rows = rows;

  field.append(buildLabel(label, false), textarea);
  return field;
}

function buildCheckbox(value) {
  const field = document.createElement('label');
  field.className = 'host-a-fundraiser-checkbox-item';

  const input = document.createElement('input');
  input.className = 'host-a-fundraiser-checkbox';
  input.type = 'checkbox';
  input.name = 'q17_whatKind[]';
  input.value = value;

  const text = document.createElement('span');
  text.textContent = value;
  field.append(input, text);
  return field;
}

function buildCheckboxGroup() {
  const group = document.createElement('fieldset');
  group.className = 'host-a-fundraiser-checkbox-group host-a-fundraiser-field-wide';

  const legend = document.createElement('legend');
  legend.className = 'host-a-fundraiser-label';
  legend.textContent = 'What kind of fundraising are you interested in?';

  const list = document.createElement('div');
  list.className = 'host-a-fundraiser-checkbox-list';
  FUNDRAISING_OPTIONS.forEach((option) => list.append(buildCheckbox(option)));

  const other = document.createElement('label');
  other.className = 'host-a-fundraiser-checkbox-item host-a-fundraiser-other';

  const otherCheckbox = document.createElement('input');
  otherCheckbox.className = 'host-a-fundraiser-checkbox';
  otherCheckbox.type = 'checkbox';
  otherCheckbox.name = 'q17_whatKind[other]';
  otherCheckbox.value = 'other';

  const otherText = document.createElement('span');
  otherText.textContent = 'Other';

  const otherInput = document.createElement('input');
  otherInput.className = 'host-a-fundraiser-input host-a-fundraiser-other-input';
  otherInput.type = 'text';
  otherInput.name = 'q17_whatKind[other]';
  otherInput.placeholder = 'Please type another option here';
  otherInput.disabled = true;

  otherCheckbox.addEventListener('change', () => {
    otherInput.disabled = !otherCheckbox.checked;
    if (!otherCheckbox.checked) otherInput.value = '';
  });

  other.append(otherCheckbox, otherText, otherInput);
  list.append(other);
  group.append(legend, list);
  return group;
}

function buildHidden(name, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  return input;
}

function buildForm() {
  const form = document.createElement('form');
  form.className = 'host-a-fundraiser-form';

  form.append(
    buildInput({
      label: 'First Name',
      name: 'q3_firstName',
      autocomplete: 'given-name',
      required: true,
    }),
    buildInput({
      label: 'Last Name',
      name: 'q6_lastName',
      autocomplete: 'family-name',
      required: true,
    }),
    buildInput({
      label: 'Job Title',
      name: 'q7_jobTitle',
      autocomplete: 'organization-title',
    }),
    buildInput({
      label: 'Organization/Company Name',
      name: 'q4_organizationcompanyName',
      autocomplete: 'organization',
    }),
    buildInput({
      label: 'Zip Code',
      name: 'q13_zipCode',
      autocomplete: 'postal-code',
      inputMode: 'numeric',
      pattern: '^\\d{5}(-\\d{4})?$',
      title: 'Enter a valid ZIP code.',
      required: true,
    }),
    buildInput({
      label: 'Phone Number',
      name: 'q9_phoneNumber[full]',
      type: 'tel',
      autocomplete: 'tel',
      inputMode: 'tel',
      placeholder: '(000) 000-0000',
    }),
    buildInput({
      label: 'Email',
      name: 'q5_email',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      placeholder: 'example@example.com',
      required: true,
    }),
    buildInput({
      label: 'Confirm Email',
      name: 'q5_email',
      type: 'email',
      autocomplete: 'off',
      inputMode: 'email',
      placeholder: 'example@example.com',
      required: true,
    }),
    buildCheckboxGroup(),
    buildTextarea({
      label: 'Tell us about your fundraising idea. How would you like to raise funds for NCMEC, and how can we support you in doing so?',
      name: 'q16_tellUs',
      rows: 6,
    }),
  );

  applyPhoneValidation(form.querySelector('[name="q9_phoneNumber[full]"]'));
  return form;
}

function applyEmailConfirmationValidation(form) {
  const emails = form.querySelectorAll('[name="q5_email"]');
  const email = emails[0];
  const confirmation = emails[1];
  if (!email || !confirmation) return;

  const validate = () => {
    const matches = !confirmation.value || email.value === confirmation.value;
    confirmation.setCustomValidity(matches ? '' : 'Email addresses must match.');
  };

  email.addEventListener('input', validate);
  confirmation.addEventListener('input', validate);
  confirmation.addEventListener('blur', validate);
  validate();
}

function appendNormalizedFields(formData) {
  const emails = formData.getAll('q5_email').filter(Boolean);
  formData.set('firstName', formData.get('q3_firstName') || '');
  formData.set('lastName', formData.get('q6_lastName') || '');
  formData.set('jobTitle', formData.get('q7_jobTitle') || '');
  formData.set('organization', formData.get('q4_organizationcompanyName') || '');
  formData.set('zipCode', formData.get('q13_zipCode') || '');
  formData.set('phone', formData.get('q9_phoneNumber[full]') || '');
  formData.set('email', emails[0] || '');
  formData.set('emailConfirmation', emails[1] || '');
  formData.set('fundraisingIdea', formData.get('q16_tellUs') || '');
  formData.set('originalFormUrl', 'https://form.jotform.com/252933506907159');
}

function appendJotformFields(formData) {
  const formId = '252933506907159';
  formData.set('formID', formId);
  formData.set('jsExecutionTracker', 'build-date-1778092923482');
  formData.set('submitSource', 'unknown');
  formData.set('submitDate', 'undefined');
  formData.set('buildDate', '1778092923482');
  formData.set('uploadServerUrl', 'https://upload.jotform.com/upload');
  formData.set('eventObserver', '1');
  formData.set('simple_spc', `${formId}-${formId}`);
  formData.set('website', '');
}

function postToJotform(formData, action) {
  return new Promise((resolve, reject) => {
    const frameName = `host-a-fundraiser-jotform-${Date.now()}`;
    const iframe = document.createElement('iframe');
    iframe.name = frameName;
    iframe.hidden = true;

    const proxy = document.createElement('form');
    proxy.method = 'post';
    proxy.action = action;
    proxy.target = frameName;
    proxy.acceptCharset = 'utf-8';
    proxy.hidden = true;

    formData.forEach((value, name) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      proxy.append(input);
    });

    let settled = false;
    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
        proxy.remove();
      }, 1000);
    };

    iframe.addEventListener('load', () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    });

    iframe.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Jotform submission failed.'));
    });

    document.body.append(iframe, proxy);
    proxy.submit();

    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, 5000);
  });
}

function bindSubmit(block, form, submitButton, status, config, formSession) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!isFormValid(form)) return;

    if (config.mode !== 'jotform' && !config.action) {
      const message = config.isAuthoring
        ? DEFAULTS.missingEndpointAuthorMessage
        : DEFAULTS.missingEndpointMessage;
      updateFormStatus(status, message, 'info');
      return;
    }

    const formData = new FormData(form);
    appendFormMetadata(formData, formSession);
    appendNormalizedFields(formData);

    block.dispatchEvent(
      new CustomEvent('host-a-fundraiser:submit', {
        bubbles: true,
        detail: Object.fromEntries(formData.entries()),
      }),
    );

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    updateFormStatus(status, 'Submitting request...', 'info');

    try {
      if (config.mode === 'jotform') {
        appendJotformFields(formData);
        await postToJotform(formData, config.jotformAction);
      } else {
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

        if (responseMessage) {
          updateFormStatus(status, responseMessage, 'success');
          return;
        }
      }

      form.reset();
      formSession.reset();
      form.querySelector('.host-a-fundraiser-other-input').disabled = true;
      updateFormStatus(status, config.successMessage, 'success');
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
  if (topPadding) block.style.setProperty('--host-a-fundraiser-top-padding', topPadding);

  const submissionMode = getTextField(block, 'submissionMode').value || DEFAULTS.submissionMode;
  const formAction = getTextField(block, 'formAction').value || DEFAULTS.formAction;
  const jotformAction = getTextField(block, 'jotformAction').value || DEFAULTS.jotformAction;
  const successMessage = getTextField(block, 'successMessage').value || DEFAULTS.successMessage;
  const errorMessage = getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage;

  const shell = document.createElement('div');
  shell.className = 'host-a-fundraiser-shell';

  const header = document.createElement('div');
  header.className = 'host-a-fundraiser-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'host-a-fundraiser-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'host-a-fundraiser-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'host-a-fundraiser-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);
  header.append(eyebrow, heading, intro);

  const form = buildForm();
  applyEmailConfirmationValidation(form);

  form.append(
    buildHidden('jotformFormId', '252933506907159'),
    buildHidden('submissionMode', submissionMode),
  );

  const actions = document.createElement('div');
  actions.className = 'host-a-fundraiser-actions';

  const status = document.createElement('p');
  status.className = 'host-a-fundraiser-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'host-a-fundraiser-submit';
  moveText(getTextField(block, 'buttonText'), submitButton, DEFAULTS.buttonText);

  actions.append(status, submitButton);
  form.append(actions);

  const formSession = createFormSession(form, 'host-a-fundraiser');

  shell.append(header, form);
  block.replaceChildren(shell);

  bindSubmit(block, form, submitButton, status, {
    mode: submissionMode,
    action: formAction,
    jotformAction,
    successMessage,
    errorMessage,
    isAuthoring: hasAuthoringContext(block),
  }, formSession);
}
