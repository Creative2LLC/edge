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
  submissionMode: 8,
  embedUrl: 9,
};

const DEFAULTS = {
  eyebrow: 'Training',
  heading: 'Missing Kids Readiness Program (MKRP) Training Registration',
  intro: 'Register your agency or emergency communications center for Missing Kids Readiness Program training.',
  formAction: '',
  submissionMode: 'native',
  embedUrl: 'https://www.missingkids.org/education/training/apply?class=mkrp-lea',
  buttonText: 'Submit Registration',
  successMessage: 'Thank you. Your training registration has been submitted. The Training team will review your application and respond within two business days.',
  errorMessage: 'We could not submit your training registration. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

const COURSES = [
  'MKRP - Law Enforcement Agencies',
  'MKRP - Emergency Communications',
];

const HEARD_ABOUT_OPTIONS = [
  'Conference',
  'NCMEC Employee',
  'Website',
  'Webinar or training hosted by NCMEC',
  'Webinar or training hosted by another organization',
  'Word of mouth',
  'Other',
];

const STATES = [
  'Alabama',
  'Alaska',
  'American Samoa',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'District of Columbia',
  'Florida',
  'Georgia',
  'Guam',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Northern Mariana Islands',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Puerto Rico',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Virgin Islands',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
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
  marker.className = 'event-request-form-required';
  marker.textContent = ' *';
  return marker;
}

function buildLabel(label, required) {
  const labelText = document.createElement('span');
  labelText.className = 'event-request-form-label';
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
}) {
  const field = document.createElement('label');
  field.className = 'event-request-form-field';

  const input = document.createElement('input');
  input.className = 'event-request-form-input';
  input.type = type;
  input.name = name;
  if (required) input.required = true;
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputMode) input.inputMode = inputMode;
  if (placeholder) input.placeholder = placeholder;

  field.append(buildLabel(label, required), input);
  return field;
}

function buildTextarea({
  label,
  name,
  required = false,
  rows = 5,
}) {
  const field = document.createElement('label');
  field.className = 'event-request-form-field event-request-form-field-wide';

  const textarea = document.createElement('textarea');
  textarea.className = 'event-request-form-textarea';
  textarea.name = name;
  textarea.rows = rows;
  if (required) textarea.required = true;

  field.append(buildLabel(label, required), textarea);
  return field;
}

function buildSelect({
  label,
  name,
  options,
  required = false,
}) {
  const field = document.createElement('label');
  field.className = 'event-request-form-field';

  const select = document.createElement('select');
  select.className = 'event-request-form-select';
  select.name = name;
  if (required) select.required = true;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select one';
  select.append(placeholder);

  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option;
    item.textContent = option;
    select.append(item);
  });

  field.append(buildLabel(label, required), select);
  return field;
}

function buildChoiceItem(name, value, type = 'radio') {
  const field = document.createElement('label');
  field.className = 'event-request-form-choice-item';

  const input = document.createElement('input');
  input.className = 'event-request-form-choice';
  input.type = type;
  input.name = name;
  input.value = value;

  const text = document.createElement('span');
  text.textContent = value;
  field.append(input, text);
  return field;
}

function buildChoiceGroup({
  label,
  name,
  options,
  required = false,
  type = 'radio',
}) {
  const group = document.createElement('fieldset');
  group.className = 'event-request-form-choice-group event-request-form-field-wide';
  if (required) group.dataset.requiredName = name;

  const legend = document.createElement('legend');
  legend.className = 'event-request-form-label';
  legend.textContent = label;
  if (required) legend.append(buildRequiredMarker());

  const list = document.createElement('div');
  list.className = 'event-request-form-choice-list';
  options.forEach((option) => list.append(buildChoiceItem(name, option, type)));
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

function buildGrid(...children) {
  const grid = document.createElement('div');
  grid.className = 'event-request-form-grid';
  grid.append(...children);
  return grid;
}

function buildCoursePanel(course, children) {
  const panel = document.createElement('div');
  panel.className = 'training-course-panel';
  panel.dataset.coursePanel = course;
  panel.hidden = true;
  panel.append(...children);
  return panel;
}

function buildStep(index, title, description, children) {
  const panel = document.createElement('section');
  panel.className = 'event-request-form-step';
  panel.dataset.step = String(index);

  const header = document.createElement('div');
  header.className = 'event-request-form-step-header';

  const kicker = document.createElement('p');
  kicker.className = 'event-request-form-step-kicker';
  kicker.textContent = `Step ${index + 1}`;

  const heading = document.createElement('h3');
  heading.className = 'event-request-form-step-title';
  heading.textContent = title;

  const copy = document.createElement('p');
  copy.className = 'event-request-form-step-copy';
  copy.textContent = description;

  const content = document.createElement('div');
  content.className = 'event-request-form-step-content';
  content.append(...children);

  header.append(kicker, heading, copy);
  panel.append(header, content);
  return panel;
}

function buildProgress(steps) {
  const progress = document.createElement('div');
  progress.className = 'event-request-form-progress';
  progress.setAttribute('aria-label', 'Form progress');

  steps.forEach((step, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'event-request-form-progress-step';
    button.dataset.stepTarget = String(index);
    button.setAttribute('aria-current', index === 0 ? 'step' : 'false');

    const number = document.createElement('span');
    number.className = 'event-request-form-progress-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const label = document.createElement('span');
    label.className = 'event-request-form-progress-label';
    label.textContent = step.title;

    button.append(number, label);
    progress.append(button);
  });

  return progress;
}

function buildForm() {
  const form = document.createElement('form');
  form.className = 'event-request-form-form';

  const steps = [
    {
      title: 'Start Here',
      element: buildStep(0, 'Start Here', 'Choose the training course and tell us which agency or organization is registering.', [
        buildGrid(
          buildInput({
            label: 'Name of Agency or Organization',
            name: 'agency-name',
            autocomplete: 'organization',
            required: true,
          }),
          buildSelect({
            label: 'Which training course are you registering for?',
            name: 'course',
            options: COURSES,
            required: true,
          }),
          buildSelect({
            label: 'How did you learn about MKRP?',
            name: 'heard-about',
            options: HEARD_ABOUT_OPTIONS,
          }),
          buildInput({
            label: 'Other',
            name: 'heard-about-other',
          }),
        ),
      ]),
    },
    {
      title: 'Contact Info',
      element: buildStep(1, 'Contact Info', 'Provide the primary contact and mailing information for this registration.', [
        buildGrid(
          buildInput({
            label: 'Name of Primary Contact Person',
            name: 'poc-name',
            autocomplete: 'name',
            required: true,
          }),
          buildInput({
            label: 'Title of Primary Contact Person',
            name: 'poc-title',
            autocomplete: 'organization-title',
            required: true,
          }),
          buildInput({
            label: 'Daytime Phone Number',
            name: 'poc-phone-daytime',
            type: 'tel',
            autocomplete: 'tel',
            inputMode: 'tel',
            required: true,
          }),
          buildInput({
            label: 'Daytime Phone Extension',
            name: 'poc-phone-daytime-extension',
            inputMode: 'numeric',
          }),
          buildInput({
            label: 'Mobile Phone Number',
            name: 'poc-phone-mobile',
            type: 'tel',
            autocomplete: 'tel',
            inputMode: 'tel',
          }),
          buildInput({
            label: 'Fax Number',
            name: 'fax',
            type: 'tel',
            inputMode: 'tel',
          }),
          buildInput({
            label: 'Email Address',
            name: 'poc-email',
            type: 'email',
            autocomplete: 'email',
            inputMode: 'email',
            required: true,
          }),
          buildInput({
            label: 'Website',
            name: 'website',
            type: 'url',
            autocomplete: 'url',
          }),
          buildInput({
            label: 'Street Address',
            name: 'address-street',
            autocomplete: 'street-address',
            required: true,
          }),
          buildInput({
            label: 'City',
            name: 'address-city',
            autocomplete: 'address-level2',
            required: true,
          }),
          buildSelect({
            label: 'State',
            name: 'address-state',
            options: STATES,
            required: true,
          }),
          buildInput({
            label: 'ZIP Code',
            name: 'address-zipcode',
            autocomplete: 'postal-code',
            inputMode: 'numeric',
            required: true,
          }),
        ),
      ]),
    },
    {
      title: 'Course Info',
      element: buildStep(2, 'Course-specific Info', 'Complete the details that match the selected training course.', [
        buildGrid(
          buildCoursePanel('MKRP - Law Enforcement Agencies', [
            buildInput({
              label: 'ORI',
              name: 'course-lea-ori',
              required: true,
            }),
            buildInput({
              label: 'What is the population of your jurisdiction?',
              name: 'course-lea-population',
              type: 'number',
              inputMode: 'numeric',
              required: true,
            }),
            buildInput({
              label: 'How many employees are in your agency?',
              name: 'course-lea-employees',
              type: 'number',
              inputMode: 'numeric',
              required: true,
            }),
          ]),
          buildCoursePanel('MKRP - Emergency Communications', [
            buildChoiceGroup({
              label: 'Type of PSAP',
              name: 'course-ec-type-of-psap',
              options: ['Primary', 'Secondary'],
              required: true,
            }),
            buildChoiceGroup({
              label: 'Services Performed',
              name: 'course-ec-services-performed',
              options: ['Law Enforcement Only', 'Consolidated'],
              required: true,
            }),
            buildInput({
              label: 'Population Served',
              name: 'course-ec-population-served',
              type: 'number',
              inputMode: 'numeric',
              required: true,
            }),
            buildInput({
              label: 'Annual Call Volume',
              name: 'course-ec-call-volume',
              type: 'number',
              inputMode: 'numeric',
              required: true,
            }),
            buildInput({
              label: '# of Telecommunicator Positions',
              name: 'course-ec-telecom-positions',
              type: 'number',
              inputMode: 'numeric',
              required: true,
            }),
            buildInput({
              label: '# of Work Stations',
              name: 'course-ec-work-stations',
              type: 'number',
              inputMode: 'numeric',
              required: true,
            }),
            buildInput({
              label: '# of Agencies the PSAP Serves',
              name: 'course-ec-agencies-served',
              type: 'number',
              inputMode: 'numeric',
              required: true,
            }),
            buildTextarea({
              label: 'Notes',
              name: 'course-ec-notes',
            }),
          ]),
        ),
      ]),
    },
    {
      title: 'Submit',
      element: buildStep(3, 'Affirmation', 'Confirm this registration on behalf of the agency or PSAP.', [
        buildGrid(
          (() => {
            const copy = document.createElement('p');
            copy.className = 'training-affirmation';
            copy.textContent = 'On behalf of the above-named Agency/PSAP, I affirm all information is true and correct and acknowledge that incorrect information may cause this application to be rejected or issued recognition to become invalid.';
            return copy;
          })(),
          buildInput({
            label: 'Name',
            name: 'affirmation-name',
            autocomplete: 'name',
            required: true,
          }),
          buildInput({
            label: 'Title',
            name: 'affirmation-title',
            autocomplete: 'organization-title',
            required: true,
          }),
        ),
      ]),
    },
  ];

  const progress = buildProgress(steps);
  const stepsWrap = document.createElement('div');
  stepsWrap.className = 'event-request-form-steps';
  stepsWrap.append(...steps.map((step) => step.element));

  form.append(
    buildHidden('originalFormName', 'Missing Kids Readiness Program (MKRP) Training Registration'),
    buildHidden('subject', 'Missing Kids Readiness Program Training Application'),
    buildHidden('affirmation-date', ''),
    progress,
    stepsWrap,
  );
  return { form, steps };
}

function getStepFields(step) {
  return [...step.querySelectorAll('input, select, textarea')]
    .filter((field) => field.type !== 'hidden' && !field.disabled);
}

function setCurrentStep(form, index) {
  const steps = [...form.querySelectorAll('.event-request-form-step')];
  const progressSteps = [...form.querySelectorAll('.event-request-form-progress-step')];
  const nextButton = form.querySelector('.event-request-form-next');
  const prevButton = form.querySelector('.event-request-form-prev');
  const submitButton = form.querySelector('.event-request-form-submit');

  steps.forEach((step, stepIndex) => {
    const isCurrent = stepIndex === index;
    step.hidden = !isCurrent;
    step.classList.toggle('is-current', isCurrent);
  });

  progressSteps.forEach((step, stepIndex) => {
    step.classList.toggle('is-current', stepIndex === index);
    step.classList.toggle('is-complete', stepIndex < index);
    step.setAttribute('aria-current', stepIndex === index ? 'step' : 'false');
  });

  prevButton.disabled = index === 0;
  nextButton.hidden = index === steps.length - 1;
  submitButton.hidden = index !== steps.length - 1;
  form.dataset.currentStep = String(index);
}

function validateRequiredChoiceGroups(step) {
  let valid = true;
  step.querySelectorAll('[data-required-name]').forEach((group) => {
    const name = group.dataset.requiredName;
    const inputs = [...group.querySelectorAll(`input[name="${CSS.escape(name)}"]`)]
      .filter((input) => !input.disabled);
    const first = inputs[0];
    const checked = inputs.some((input) => input.checked);
    if (first) first.setCustomValidity(checked ? '' : 'Select one option.');
    if (inputs.length && !checked) valid = false;
  });
  return valid;
}

function validateStep(step) {
  let valid = true;
  getStepFields(step).forEach((field) => {
    if (!field.checkValidity()) valid = false;
  });
  if (!validateRequiredChoiceGroups(step)) valid = false;
  if (!valid) step.querySelector(':invalid')?.reportValidity();
  return valid;
}

function bindRequiredChoiceGroups(form) {
  form.querySelectorAll('[data-required-name]').forEach((group) => {
    const name = group.dataset.requiredName;
    const inputs = [...group.querySelectorAll(`input[name="${CSS.escape(name)}"]`)];
    const first = inputs[0];
    if (!first) return;

    const validate = () => {
      const enabled = inputs.filter((input) => !input.disabled);
      first.setCustomValidity(enabled.some((input) => input.checked) || !enabled.length ? '' : 'Select one option.');
    };

    inputs.forEach((input) => input.addEventListener('change', validate));
    validate();
  });
}

function setPanelEnabled(panel, enabled) {
  panel.hidden = !enabled;
  panel.querySelectorAll('input, select, textarea').forEach((field) => {
    field.disabled = !enabled;
  });
}

function syncCoursePanels(form) {
  const course = form.querySelector('[name="course"]')?.value || '';
  const panels = [...form.querySelectorAll('[data-course-panel]')];
  panels.forEach((panel) => setPanelEnabled(panel, panel.dataset.coursePanel === course));
  validateRequiredChoiceGroups(form);
}

function bindConditionalFields(form) {
  const heardAbout = form.querySelector('[name="heard-about"]');
  const other = form.querySelector('[name="heard-about-other"]');
  const course = form.querySelector('[name="course"]');

  const syncOther = () => {
    if (!heardAbout || !other) return;
    const enabled = heardAbout.value === 'Other';
    other.disabled = !enabled;
    if (!enabled) other.value = '';
  };

  heardAbout?.addEventListener('change', syncOther);
  course?.addEventListener('change', () => syncCoursePanels(form));
  syncOther();
  syncCoursePanels(form);
}

function bindStepControls(form) {
  const steps = [...form.querySelectorAll('.event-request-form-step')];

  form.querySelector('.event-request-form-next').addEventListener('click', () => {
    const current = Number(form.dataset.currentStep || '0');
    if (!validateStep(steps[current])) return;
    setCurrentStep(form, Math.min(current + 1, steps.length - 1));
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.querySelector('.event-request-form-prev').addEventListener('click', () => {
    const current = Number(form.dataset.currentStep || '0');
    setCurrentStep(form, Math.max(current - 1, 0));
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.querySelectorAll('.event-request-form-progress-step').forEach((button) => {
    button.addEventListener('click', () => {
      const target = Number(button.dataset.stepTarget);
      const current = Number(form.dataset.currentStep || '0');
      if (target <= current) {
        setCurrentStep(form, target);
        return;
      }
      if (target === current + 1 && validateStep(steps[current])) setCurrentStep(form, target);
    });
  });

  setCurrentStep(form, 0);
}

function appendOriginalFormMetadata(formData, originalFormUrl) {
  formData.set('originalFormName', 'Missing Kids Readiness Program (MKRP) Training Registration');
  formData.set('originalFormUrl', originalFormUrl || DEFAULTS.embedUrl);
  formData.set('submissionSystem', 'AEM Adaptive Forms');
  formData.set('adaptiveFormPath', '/content/forms/af/mkrp-training-registration');
}

function appendNormalizedFields(formData) {
  const today = new Date();
  formData.set('affirmation-date', today.toISOString().slice(0, 10));
  formData.set('agencyName', formData.get('agency-name') || '');
  formData.set('contactName', formData.get('poc-name') || '');
  formData.set('contactEmail', formData.get('poc-email') || '');
  formData.set('contactPhone', formData.get('poc-phone-daytime') || '');
  formData.set('courseName', formData.get('course') || '');
}

function buildOriginalEmbed(embedUrl) {
  const frame = document.createElement('iframe');
  frame.className = 'event-request-form-embed';
  frame.title = 'Apply for Training form';
  frame.src = embedUrl || DEFAULTS.embedUrl;
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  return frame;
}

function bindSubmit(block, form, submitButton, status, config, formSession) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!validateStep(form.querySelector('.event-request-form-step.is-current'))) return;
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
    appendNormalizedFields(formData);

    block.dispatchEvent(
      new CustomEvent('apply-for-training:submit', {
        bubbles: true,
        detail: Object.fromEntries(formData.entries()),
      }),
    );

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    updateFormStatus(status, 'Submitting registration...', 'info');

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
      bindConditionalFields(form);
      bindRequiredChoiceGroups(form);
      setCurrentStep(form, 0);
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
  block.classList.add('event-request-form', 'apply-for-training');
  const topPadding = normalizeLengthValue(getTextField(block, 'topPadding').value);
  if (topPadding) block.style.setProperty('--event-request-form-top-padding', topPadding);

  const formAction = getTextField(block, 'formAction').value || DEFAULTS.formAction;
  const submissionMode = getTextField(block, 'submissionMode').value || DEFAULTS.submissionMode;
  const embedUrl = getTextField(block, 'embedUrl').value || DEFAULTS.embedUrl;
  const successMessage = getTextField(block, 'successMessage').value || DEFAULTS.successMessage;
  const errorMessage = getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage;

  const shell = document.createElement('div');
  shell.className = 'event-request-form-shell';

  const header = document.createElement('div');
  header.className = 'event-request-form-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'event-request-form-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'event-request-form-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'event-request-form-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);
  header.append(eyebrow, heading, intro);

  if (submissionMode === 'original-aem') {
    shell.append(header, buildOriginalEmbed(embedUrl));
    block.replaceChildren(shell);
    return;
  }

  const { form } = buildForm();
  applyPhoneValidation(form.querySelector('[name="poc-phone-daytime"]'));
  applyPhoneValidation(form.querySelector('[name="poc-phone-mobile"]'));
  applyPhoneValidation(form.querySelector('[name="fax"]'));
  bindConditionalFields(form);
  bindRequiredChoiceGroups(form);

  const actions = document.createElement('div');
  actions.className = 'event-request-form-actions';

  const status = document.createElement('p');
  status.className = 'event-request-form-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'event-request-form-prev';
  previousButton.textContent = 'Back';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'event-request-form-next';
  nextButton.textContent = 'Next';

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'event-request-form-submit';
  moveText(getTextField(block, 'buttonText'), submitButton, DEFAULTS.buttonText);

  actions.append(status, previousButton, nextButton, submitButton);
  form.append(actions);

  const formSession = createFormSession(form, 'apply-for-training');

  shell.append(header, form);
  block.replaceChildren(shell);

  bindStepControls(form);
  bindSubmit(block, form, submitButton, status, {
    action: formAction,
    originalFormUrl: embedUrl,
    successMessage,
    errorMessage,
    isAuthoring: hasAuthoringContext(block),
  }, formSession);
}
