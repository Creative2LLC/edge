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
  eyebrow: 'Program Partners',
  heading: 'Community Education Partner Reporting Form',
  intro: 'Existing Community Education Partners can submit quarterly reporting data for the most recent quarter.',
  formAction: '',
  submissionMode: 'native',
  embedUrl: 'https://formstack.io/14373',
  buttonText: 'Submit Report',
  successMessage: 'Thank you. Your Community Education Partner report has been submitted.',
  errorMessage: 'We could not submit your report. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

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
  'N/A',
];

const PRESENTATION_TYPES = [
  'Be Safer Online with NetSmartz: Grades K-2',
  'Being a Good Digital Citizen: Grades 3-5',
  'NetSmartz: Online Safety for Middle School',
  'Advanced Online Safety for High School,',
  'NetSmartz Parents, Guardians, and Community Members',
  'Be Safer Online with NetSmartz: Grades K-2 (Spanish)',
  'Being a Good Digital Citizen: Grades 3-5 (Spanish)',
  'NetSmartz: Online Safety for Middle School (Spanish)',
  'Advanced Online Safety for High School (Spanish)',
  'Internet Safety: Parents, Guardians & Community (Spanish)',
  'Teaching Modern Safety with "Into the Cloud" Season 1 Grades K-2',
  'Teaching Modern Safety with "Into the Cloud" Season 1 Grades 3-5',
  'Teaching Modern Safety with "Into the Cloud" Season 2 Grades 3-5',
  'Teaching Modern Safety with "Into the Cloud" Season 1 Grades K-2 (Spanish)',
  'Teaching Modern Safety with "Into the Cloud" Season 1 Grades 3-5 (Spanish)',
  'Teaching Modern Safety with "Into the Cloud" Season 2 Grades 3-5 (Spanish)',
  'KidSmartz',
  'Community/Tabling Event featuring NCMEC Resources',
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
  marker.className = 'cep-reporting-required';
  marker.textContent = ' *';
  return marker;
}

function buildLabel(label, required) {
  const labelText = document.createElement('span');
  labelText.className = 'cep-reporting-label';
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
  field.className = 'cep-reporting-field';

  const input = document.createElement('input');
  input.className = 'cep-reporting-input';
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
  rows = 5,
}) {
  const field = document.createElement('label');
  field.className = 'cep-reporting-field cep-reporting-field-wide';

  const textarea = document.createElement('textarea');
  textarea.className = 'cep-reporting-textarea';
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
  defaultValue = '',
}) {
  const field = document.createElement('label');
  field.className = 'cep-reporting-field';

  const select = document.createElement('select');
  select.className = 'cep-reporting-select';
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
    if (defaultValue === option) item.selected = true;
    select.append(item);
  });

  field.append(buildLabel(label, required), select);
  return field;
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
  grid.className = 'cep-reporting-grid';
  grid.append(...children);
  return grid;
}

function buildStep(index, title, description, children) {
  const panel = document.createElement('section');
  panel.className = 'cep-reporting-step';
  panel.dataset.step = String(index);

  const header = document.createElement('div');
  header.className = 'cep-reporting-step-header';

  const kicker = document.createElement('p');
  kicker.className = 'cep-reporting-step-kicker';
  kicker.textContent = `Step ${index + 1}`;

  const heading = document.createElement('h3');
  heading.className = 'cep-reporting-step-title';
  heading.textContent = title;

  const copy = document.createElement('p');
  copy.className = 'cep-reporting-step-copy';
  copy.textContent = description;

  const content = document.createElement('div');
  content.className = 'cep-reporting-step-content';
  content.append(...children);

  header.append(kicker, heading, copy);
  panel.append(header, content);
  return panel;
}

function buildProgress(steps) {
  const progress = document.createElement('div');
  progress.className = 'cep-reporting-progress';
  progress.setAttribute('aria-label', 'Form progress');

  steps.forEach((step, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cep-reporting-progress-step';
    button.dataset.stepTarget = String(index);
    button.setAttribute('aria-current', index === 0 ? 'step' : 'false');

    const number = document.createElement('span');
    number.className = 'cep-reporting-progress-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const label = document.createElement('span');
    label.className = 'cep-reporting-progress-label';
    label.textContent = step.title;

    button.append(number, label);
    progress.append(button);
  });

  return progress;
}

function getCurrentQuarterLabel(date = new Date()) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  const quarterRanges = {
    1: 'Q1 (1 JAN - 31 MAR)',
    2: 'Q2 (1 APR - 30 JUN)',
    3: 'Q3 (1 JUL - 30 SEP)',
    4: 'Q4 (1 OCT - 31 DEC)',
  };
  return quarterRanges[quarter];
}

function buildForm() {
  const form = document.createElement('form');
  form.className = 'cep-reporting-form';

  const currentQuarter = getCurrentQuarterLabel();
  const steps = [
    {
      title: 'Partner',
      element: buildStep(0, 'Partner Information', 'Confirm the organization and contact submitting this quarterly report.', [
        buildGrid(
          buildInput({
            label: 'Organization Name',
            name: 'Case.OrganizationName__c',
            autocomplete: 'organization',
            required: true,
          }),
          buildInput({
            label: 'First Name',
            name: 'Case.FirstName__c',
            autocomplete: 'given-name',
            required: true,
          }),
          buildInput({
            label: 'Last Name',
            name: 'Case.LastName__c',
            autocomplete: 'family-name',
            required: true,
          }),
          buildInput({
            label: 'Email Address',
            name: 'Case.EmailAddress__c',
            type: 'email',
            autocomplete: 'email',
            inputMode: 'email',
            required: true,
          }),
        ),
      ]),
    },
    {
      title: 'Location',
      element: buildStep(1, 'Partner Location', 'Provide the mailing address associated with this partner report.', [
        buildGrid(
          buildInput({
            label: 'Address Line 1',
            name: 'Case.AddressLine1__c',
            autocomplete: 'address-line1',
            required: true,
          }),
          buildInput({
            label: 'Address Line 2',
            name: 'Case.AddressLine2__c',
            autocomplete: 'address-line2',
          }),
          buildInput({
            label: 'City',
            name: 'Case.City__c',
            autocomplete: 'address-level2',
            required: true,
          }),
          buildSelect({
            label: 'State',
            name: 'Case.CaseState__c',
            options: STATES,
            required: true,
          }),
          buildInput({
            label: 'Zip/Postal Code',
            name: 'Case.ZipPostalCode__c',
            autocomplete: 'postal-code',
            required: true,
          }),
        ),
      ]),
    },
    {
      title: 'Quarter',
      element: buildStep(2, 'Quarterly Data', 'Report the most recent quarter and the education sessions delivered.', [
        buildGrid(
          buildInput({
            label: 'Start Date',
            name: 'Case.Start_date_of_the_quarter__c',
            type: 'date',
          }),
          buildInput({
            label: 'End Date of the Quarter',
            name: 'Case.End_date_of_the_quarter__c',
            type: 'date',
          }),
          buildSelect({
            label: 'Quarter',
            name: 'Case.Quarter__c',
            options: ['Q1 (1 JAN - 31 MAR)', 'Q2 (1 APR - 30 JUN)', 'Q3 (1 JUL - 30 SEP)', 'Q4 (1 OCT - 31 DEC)'],
            defaultValue: currentQuarter,
            required: true,
          }),
          buildSelect({
            label: 'Presentation Type',
            name: 'Case.CEP__c.A_1_.Presentation_Type__c',
            options: PRESENTATION_TYPES,
          }),
          buildInput({
            label: 'Number of Sessions',
            name: 'Case.CEP__c.A_1_.Number_of_Sessions__c',
            type: 'number',
            inputMode: 'numeric',
            required: true,
          }),
          buildInput({
            label: 'Child Attendees',
            name: 'Case.CEP__c.A_1_.Number_of_Adult_Attendees__c',
            type: 'number',
            inputMode: 'numeric',
            required: true,
          }),
          buildInput({
            label: 'Adult Attendees',
            name: 'Case.CEP__c.A_1_.Number_of_Child_Attendees__c',
            type: 'number',
            inputMode: 'numeric',
            required: true,
          }),
        ),
      ]),
    },
    {
      title: 'Narrative',
      element: buildStep(3, 'Quarterly Narrative', 'Share successes, challenges, and context from this quarter.', [
        buildGrid(
          buildTextarea({
            label: 'What went well this quarter? Please share any anecdotes or especially successful events.',
            name: 'Case.What_went_well_this_quarter__c',
            rows: 6,
          }),
          buildTextarea({
            label: 'What challenges did you experience this quarter?',
            name: 'Case.What_challenges_did_you_experience_this__c',
            rows: 6,
          }),
        ),
      ]),
    },
  ];

  const progress = buildProgress(steps);
  const stepsWrap = document.createElement('div');
  stepsWrap.className = 'cep-reporting-steps';
  stepsWrap.append(...steps.map((step) => step.element));

  form.append(
    buildHidden('originalFormName', 'Community Education Partner Reporting Form'),
    progress,
    stepsWrap,
  );
  return { form, steps };
}

function getStepFields(step) {
  return [...step.querySelectorAll('input, select, textarea')]
    .filter((field) => field.type !== 'hidden');
}

function setCurrentStep(form, index) {
  const steps = [...form.querySelectorAll('.cep-reporting-step')];
  const progressSteps = [...form.querySelectorAll('.cep-reporting-progress-step')];
  const nextButton = form.querySelector('.cep-reporting-next');
  const prevButton = form.querySelector('.cep-reporting-prev');
  const submitButton = form.querySelector('.cep-reporting-submit');

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

function validateStep(step) {
  let valid = true;
  getStepFields(step).forEach((field) => {
    if (!field.checkValidity()) valid = false;
  });
  if (!valid) step.querySelector(':invalid')?.reportValidity();
  return valid;
}

function bindStepControls(form) {
  const steps = [...form.querySelectorAll('.cep-reporting-step')];

  form.querySelector('.cep-reporting-next').addEventListener('click', () => {
    const current = Number(form.dataset.currentStep || '0');
    if (!validateStep(steps[current])) return;
    setCurrentStep(form, Math.min(current + 1, steps.length - 1));
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.querySelector('.cep-reporting-prev').addEventListener('click', () => {
    const current = Number(form.dataset.currentStep || '0');
    setCurrentStep(form, Math.max(current - 1, 0));
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.querySelectorAll('.cep-reporting-progress-step').forEach((button) => {
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
  formData.set('originalFormName', 'Community Education Partner Reporting Form');
  formData.set('originalFormUrl', originalFormUrl || DEFAULTS.embedUrl);
}

function appendNormalizedFields(formData) {
  formData.set('organization', formData.get('Case.OrganizationName__c') || '');
  formData.set('firstName', formData.get('Case.FirstName__c') || '');
  formData.set('lastName', formData.get('Case.LastName__c') || '');
  formData.set('email', formData.get('Case.EmailAddress__c') || '');
  formData.set('quarter', formData.get('Case.Quarter__c') || '');
  formData.set('presentationType', formData.get('Case.CEP__c.A_1_.Presentation_Type__c') || '');
  formData.set('numberOfSessions', formData.get('Case.CEP__c.A_1_.Number_of_Sessions__c') || '');
  formData.set('childAttendees', formData.get('Case.CEP__c.A_1_.Number_of_Adult_Attendees__c') || '');
  formData.set('adultAttendees', formData.get('Case.CEP__c.A_1_.Number_of_Child_Attendees__c') || '');
}

function buildOriginalEmbed(embedUrl) {
  const frame = document.createElement('iframe');
  frame.className = 'cep-reporting-embed';
  frame.title = 'Community Education Partner reporting form';
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
    if (!validateStep(form.querySelector('.cep-reporting-step.is-current'))) return;
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
      new CustomEvent('community-education-partner-reporting:submit', {
        bubbles: true,
        detail: Object.fromEntries(formData.entries()),
      }),
    );

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    updateFormStatus(status, 'Submitting report...', 'info');

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
  const topPadding = normalizeLengthValue(getTextField(block, 'topPadding').value);
  if (topPadding) block.style.setProperty('--cep-reporting-top-padding', topPadding);

  const formAction = getTextField(block, 'formAction').value || DEFAULTS.formAction;
  const submissionMode = getTextField(block, 'submissionMode').value || DEFAULTS.submissionMode;
  const embedUrl = getTextField(block, 'embedUrl').value || DEFAULTS.embedUrl;
  const successMessage = getTextField(block, 'successMessage').value || DEFAULTS.successMessage;
  const errorMessage = getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage;

  const shell = document.createElement('div');
  shell.className = 'cep-reporting-shell';

  const header = document.createElement('div');
  header.className = 'cep-reporting-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'cep-reporting-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'cep-reporting-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'cep-reporting-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);
  header.append(eyebrow, heading, intro);

  if (submissionMode === 'original-formstack') {
    shell.append(header, buildOriginalEmbed(embedUrl));
    block.replaceChildren(shell);
    return;
  }

  const { form } = buildForm();

  const actions = document.createElement('div');
  actions.className = 'cep-reporting-actions';

  const status = document.createElement('p');
  status.className = 'cep-reporting-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'cep-reporting-prev';
  previousButton.textContent = 'Back';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'cep-reporting-next';
  nextButton.textContent = 'Next';

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'cep-reporting-submit';
  moveText(getTextField(block, 'buttonText'), submitButton, DEFAULTS.buttonText);

  actions.append(status, previousButton, nextButton, submitButton);
  form.append(actions);

  const formSession = createFormSession(form, 'community-education-partner-reporting');

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
