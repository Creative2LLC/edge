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
  eyebrow: 'Leadership Training',
  heading: 'Protect. Reduce. Prevent. Leadership (PRPL) Application',
  intro: 'Apply for the PRPL cohort-based leadership seminar for professionals responding to missing and exploited child cases.',
  formAction: '',
  submissionMode: 'native',
  embedUrl: 'https://form.asana.com/?k=wi_yh-YJYDsMWQF4qO_8Pw&d=12268102754041',
  buttonText: 'Submit Application',
  successMessage: 'Thank you. Your PRPL application has been submitted.',
  errorMessage: 'We could not submit your application. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

const DISCIPLINES = [
  'Sworn Law Enforcement',
  'Prosecutor',
  '911',
  'Amber Alert Coordinator',
  'Missing Child Clearinghouse',
];

const LEADERSHIP_LEVELS = [
  'Executive/Command Leadership',
  'Senior Leadership',
  'Supervisor/Unit Leadership',
  'Senior Investigator/Senior Prosecutor/Lead Dispatcher',
  'Emerging Leader preparing for supervisory roles',
];

const RESPONSIBILITIES = [
  'Missing Child Investigations',
  'Amber Alert Activation/Coordinator',
  'Child Sexual Exploitation Investigations',
  'Online Exploitation/ICAC Cases',
  'Emergency Communication Response',
  'Prosecution of Crimes Against Children',
  'Clearinghouse Operations',
  'Policy/Protocol Development',
  'Multi-Agency Coordination',
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
  asanaId = '',
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
  if (asanaId) input.dataset.asanaFieldId = asanaId;
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
  asanaId = '',
  required = false,
  rows = 6,
  hint = '',
}) {
  const field = document.createElement('label');
  field.className = 'event-request-form-field event-request-form-field-wide';

  const textarea = document.createElement('textarea');
  textarea.className = 'event-request-form-textarea';
  textarea.name = name;
  textarea.rows = rows;
  if (asanaId) textarea.dataset.asanaFieldId = asanaId;
  if (required) textarea.required = true;

  field.append(buildLabel(label, required));
  if (hint) {
    const help = document.createElement('span');
    help.className = 'event-request-form-step-copy';
    help.textContent = hint;
    field.append(help);
  }
  field.append(textarea);
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

function buildCheckboxItem(name, value) {
  const field = document.createElement('label');
  field.className = 'event-request-form-choice-item';

  const input = document.createElement('input');
  input.className = 'event-request-form-choice';
  input.type = 'checkbox';
  input.name = name;
  input.value = value;

  const text = document.createElement('span');
  text.textContent = value;
  field.append(input, text);
  return field;
}

function buildCheckboxGroup({
  label,
  name,
  options,
  required = false,
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
  options.forEach((option) => list.append(buildCheckboxItem(name, option)));
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
      title: 'Participant',
      element: buildStep(0, 'Participant Information', 'Provide your agency contact information and current role.', [
        buildGrid(
          buildInput({
            label: 'First Name',
            name: 'firstName',
            asanaId: '1213860260294941',
            autocomplete: 'given-name',
            required: true,
          }),
          buildInput({
            label: 'Last Name',
            name: 'lastName',
            asanaId: '1213857930343766',
            autocomplete: 'family-name',
            required: true,
          }),
          buildInput({
            label: 'Rank/Title/Role',
            name: 'rankTitleRole',
            asanaId: '1213857930343768',
            autocomplete: 'organization-title',
            required: true,
          }),
          buildInput({
            label: 'Agency Name',
            name: 'agencyName',
            asanaId: '1213857930343772',
            autocomplete: 'organization',
            required: true,
          }),
          buildInput({
            label: 'Agency Email Address',
            name: 'agencyEmail',
            asanaId: '1213860260294942',
            type: 'email',
            autocomplete: 'email',
            inputMode: 'email',
            required: true,
          }),
          buildInput({
            label: 'Agency Phone Number',
            name: 'agencyPhone',
            asanaId: '1213857930343886',
            type: 'tel',
            autocomplete: 'tel',
            inputMode: 'tel',
            required: true,
          }),
          buildInput({
            label: 'City',
            name: 'city',
            asanaId: '1213857930343780',
            autocomplete: 'address-level2',
            required: true,
          }),
          buildSelect({
            label: 'Which discipline best describes your current role?',
            name: 'discipline',
            options: DISCIPLINES,
            required: true,
          }),
          buildInput({
            label: 'Total Years in Profession',
            name: 'totalYearsInProfession',
            asanaId: '1213857930343785',
            type: 'number',
            inputMode: 'numeric',
          }),
          buildInput({
            label: 'Total Years in Current Role',
            name: 'totalYearsInCurrentRole',
            asanaId: '1213857930343787',
            type: 'number',
            inputMode: 'numeric',
          }),
        ),
      ]),
    },
    {
      title: 'Leadership',
      element: buildStep(1, 'Leadership Role', 'Describe your leadership scope and operational responsibilities.', [
        buildGrid(
          buildSelect({
            label: 'Do you currently supervise employees?',
            name: 'currentlySuperviseEmployees',
            options: ['Yes', 'No'],
            required: true,
          }),
          buildSelect({
            label: 'Which best describes your leadership level in your agency?',
            name: 'leadershipLevel',
            options: LEADERSHIP_LEVELS,
            required: true,
          }),
          buildCheckboxGroup({
            label: 'Which responsibilities are part of your current role?',
            name: 'currentResponsibilities',
            options: RESPONSIBILITIES,
            required: true,
          }),
        ),
      ]),
    },
    {
      title: 'Impact',
      element: buildStep(2, 'Leadership Impact', 'Explain why PRPL is relevant to your work and agency readiness.', [
        buildGrid(
          buildTextarea({
            label: 'Why are you interested in participating in PRPL?',
            name: 'interestInPrpl',
            asanaId: '1213857930343811',
            hint: '150-250 words',
            required: true,
          }),
          buildTextarea({
            label: 'What leadership or operational challenge related to missing or exploited children are you currently facing in your role?',
            name: 'currentOperationalChallenge',
            asanaId: '1213857930343813',
            hint: '150-250 words',
            required: true,
          }),
          buildTextarea({
            label: 'Describe a time you worked across disciplines during a case or initiative. What made the collaboration successful or challenging?',
            name: 'crossDisciplineExperience',
            asanaId: '1213857930343815',
            hint: '150-250 words',
            required: true,
          }),
        ),
      ]),
    },
    {
      title: 'Commitment',
      element: buildStep(3, 'Program Commitment', 'Confirm availability, agency approval, and prior NCMEC training experience.', [
        buildGrid(
          buildSelect({
            label: 'Are you able to commit to this full program experience?',
            name: 'fullProgramCommitment',
            options: ['Yes', 'No'],
            required: true,
          }),
          buildSelect({
            label: 'Have you already been approved to attend PRPL by your organization/agency?',
            name: 'agencyApproval',
            options: ['Yes', 'No'],
            required: true,
          }),
          buildSelect({
            label: 'Applicants selected for PRPL will receive conditional acceptance. Do you understand and agree to this process?',
            name: 'conditionalAcceptanceAgreement',
            options: ['Yes', 'No'],
            required: true,
          }),
          buildSelect({
            label: 'Have you previously attended a NCMEC presentation or training program?',
            name: 'previousNcmecTraining',
            options: ['Yes', 'No'],
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
    buildHidden('originalFormName', 'Protect. Reduce. Prevent. Leadership (PRPL) Application'),
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

function validateStep(step) {
  let valid = true;
  getStepFields(step).forEach((field) => {
    if (!field.checkValidity()) valid = false;
  });
  step.querySelectorAll('[data-required-name]').forEach((group) => {
    const name = group.dataset.requiredName;
    const checked = group.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`).length;
    const first = group.querySelector(`input[name="${CSS.escape(name)}"]`);
    if (first) first.setCustomValidity(checked ? '' : 'Select at least one option.');
    if (!checked) valid = false;
  });
  if (!valid) step.querySelector(':invalid')?.reportValidity();
  return valid;
}

function bindRequiredCheckboxGroups(form) {
  form.querySelectorAll('[data-required-name]').forEach((group) => {
    const name = group.dataset.requiredName;
    const first = group.querySelector(`input[name="${CSS.escape(name)}"]`);
    const inputs = [...group.querySelectorAll(`input[name="${CSS.escape(name)}"]`)];
    if (!first) return;

    const validate = () => {
      first.setCustomValidity(inputs.some((input) => input.checked) ? '' : 'Select at least one option.');
    };

    inputs.forEach((input) => input.addEventListener('change', validate));
    validate();
  });
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
  formData.set('originalFormName', 'Protect. Reduce. Prevent. Leadership (PRPL) Application');
  formData.set('originalFormUrl', originalFormUrl || DEFAULTS.embedUrl);
  formData.set('submissionSystem', 'Asana Forms');
}

function getValues(formData, name) {
  return formData.getAll(name).filter(Boolean).join(', ');
}

function appendNormalizedFields(formData) {
  formData.set('applicantName', `${formData.get('firstName') || ''} ${formData.get('lastName') || ''}`.trim());
  formData.set('email', formData.get('agencyEmail') || '');
  formData.set('phone', formData.get('agencyPhone') || '');
  formData.set('organization', formData.get('agencyName') || '');
  formData.set('responsibilities', getValues(formData, 'currentResponsibilities'));
}

function buildOriginalEmbed(embedUrl) {
  const frame = document.createElement('iframe');
  frame.className = 'event-request-form-embed';
  frame.title = 'PRPL application form';
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
      new CustomEvent('prpl-application:submit', {
        bubbles: true,
        detail: Object.fromEntries(formData.entries()),
      }),
    );

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    updateFormStatus(status, 'Submitting application...', 'info');

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
      bindRequiredCheckboxGroups(form);
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
  block.classList.add('event-request-form');
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

  if (submissionMode === 'original-asana') {
    shell.append(header, buildOriginalEmbed(embedUrl));
    block.replaceChildren(shell);
    return;
  }

  const { form } = buildForm();
  applyPhoneValidation(form.querySelector('[name="agencyPhone"]'));
  bindRequiredCheckboxGroups(form);

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

  const formSession = createFormSession(form, 'prpl-application');

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
