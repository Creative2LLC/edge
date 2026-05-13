import {
  appendFormMetadata,
  applyPhoneValidation,
  createFormSession,
  extractApiMessage,
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
  eyebrow: 'Team HOPE',
  heading: 'Become a Team HOPE Volunteer',
  intro: 'Apply to support families of missing and exploited children through Team HOPE.',
  formAction: '',
  buttonText: 'Submit Application',
  continueText: 'Continue',
  successMessage: 'Thank you for your interest in volunteering with Team HOPE. We will follow up with you soon.',
  errorMessage: 'We could not submit your application. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

const CASE_TYPES = [
  ['Missing Child', 'Missing Child'],
  ['Recovered Child', 'Recovered Child'],
  ['Sexually Exploited Child', 'Sexually Exploited Child'],
  ['Family Abduction', 'Family Abduction'],
  ['Nonfamily Abduction', 'Nonfamily Abduction'],
  ['Endangered Runaway', 'Endangered Runaway'],
  ['Other', 'Other'],
];

const PANEL_META = [
  ['personal', 'Personal Info'],
  ['child-case', 'Child Case'],
  ['background', 'Background'],
  ['references', 'References'],
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
  marker.className = 'team-hope-volunteer-required';
  marker.textContent = ' *';
  return marker;
}

function buildLabel(label, required) {
  const labelText = document.createElement('span');
  labelText.className = 'team-hope-volunteer-label';
  labelText.textContent = label;
  if (required) labelText.append(buildRequiredMarker());
  return labelText;
}

function buildHidden(name, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  return input;
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
  placeholder = '',
}) {
  const field = document.createElement('label');
  field.className = 'team-hope-volunteer-field';

  const input = document.createElement('input');
  input.className = 'team-hope-volunteer-input';
  input.type = type;
  input.name = name;
  if (required) input.required = true;
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputMode) input.inputMode = inputMode;
  if (pattern) input.pattern = pattern;
  if (title) input.title = title;
  if (placeholder) input.placeholder = placeholder;

  field.append(buildLabel(label, required), input);
  return field;
}

function buildTextarea({
  label,
  name,
  required = false,
  rows = 5,
  placeholder = '',
}) {
  const field = document.createElement('label');
  field.className = 'team-hope-volunteer-field';

  const textarea = document.createElement('textarea');
  textarea.className = 'team-hope-volunteer-textarea';
  textarea.name = name;
  textarea.rows = rows;
  if (required) textarea.required = true;
  if (placeholder) textarea.placeholder = placeholder;

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
  field.className = 'team-hope-volunteer-field';

  const select = document.createElement('select');
  select.className = 'team-hope-volunteer-select';
  select.name = name;
  if (required) select.required = true;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);

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
  required = false,
  options,
}) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'team-hope-volunteer-radio-group';

  const legendElement = document.createElement('legend');
  legendElement.className = 'team-hope-volunteer-label';
  legendElement.textContent = legend;
  if (required) legendElement.append(buildRequiredMarker());
  fieldset.append(legendElement);

  const list = document.createElement('div');
  list.className = 'team-hope-volunteer-radio-list';
  options.forEach(([value, text]) => {
    const item = document.createElement('label');
    item.className = 'team-hope-volunteer-radio-item';
    const input = document.createElement('input');
    input.className = 'team-hope-volunteer-radio';
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.required = required;
    const labelText = document.createElement('span');
    labelText.textContent = text;
    item.append(input, labelText);
    list.append(item);
  });

  fieldset.append(list);
  return fieldset;
}

function buildSectionIntro(text) {
  const intro = document.createElement('p');
  intro.className = 'team-hope-volunteer-section-intro';
  intro.textContent = text;
  return intro;
}

function buildFieldGroup(title) {
  const group = document.createElement('div');
  group.className = 'team-hope-volunteer-field-group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.append(heading);
  return group;
}

function buildGrid(...items) {
  const grid = document.createElement('div');
  grid.className = 'team-hope-volunteer-grid';
  grid.append(...items);
  return grid;
}

function dateInput(label, name, required = false) {
  return buildInput({
    label,
    name,
    inputMode: 'numeric',
    pattern: '^(0[1-9]|1[0-2])-([0-2][0-9]|3[01])-\\d{4}$',
    title: 'Use mm-dd-yyyy for dates.',
    required,
  });
}

function zipInput(label, name, required = true) {
  return buildInput({
    label,
    name,
    autocomplete: 'postal-code',
    inputMode: 'numeric',
    pattern: '^\\d{5}(-\\d{4})?$',
    title: 'Enter a valid ZIP code.',
    required,
  });
}

function phoneInput(label, name, required = false) {
  return buildInput({
    label,
    name,
    type: 'tel',
    autocomplete: 'tel',
    inputMode: 'tel',
    required,
  });
}

function buildPersonalPanel() {
  return buildGrid(
    buildInput({
      label: 'Name',
      name: '_01name',
      autocomplete: 'name',
      required: true,
    }),
    buildInput({
      label: 'Street',
      name: '_02street',
      autocomplete: 'street-address',
      required: true,
    }),
    buildInput({
      label: 'City',
      name: '_03city',
      autocomplete: 'address-level2',
      required: true,
    }),
    buildSelect({
      label: 'State',
      name: '_04state',
      options: US_STATES,
      required: true,
    }),
    zipInput('Zip Code', '_05zipcode'),
    phoneInput('Home Phone', '_06phone', true),
    buildInput({
      label: 'Email',
      name: '_07email',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      placeholder: 'jane.doe@example.com',
      required: true,
    }),
    phoneInput('Work Phone', '_08workPhone'),
    phoneInput('Cell Phone', '_09cellPhone'),
    dateInput('Date of Birth', '_10dateOfBirth'),
    buildInput({
      label: 'Best Way/Time to Reach',
      name: '_11contactMethod',
    }),
  );
}

function buildChildCasePanel() {
  const note = buildSectionIntro(
    'If your child is or has been missing, please answer the following questions.',
  );
  return buildGrid(
    buildInput({
      label: "Missing, Recovered, or Sexually Exploited Child's Name",
      name: '_12childName',
      required: true,
    }),
    dateInput('His/Her Date of Birth', '_13childBirthDate'),
    buildSelect({
      label: 'Case Type',
      name: '_14caseType',
      options: CASE_TYPES,
      required: true,
    }),
    note,
    dateInput('His/Her Missing Date', '_15dateMissing'),
    dateInput('His/Her Recovery Date', '_16dateRecovered'),
    buildInput({
      label: 'NCMEC Case Number',
      name: '_17caseNumber',
    }),
    buildInput({
      label: 'NCMEC Case Manager',
      name: '_18caseManager',
    }),
    buildInput({
      label: 'Website',
      name: '_19childWebsite',
      type: 'url',
      placeholder: 'If you have a website for your missing child',
    }),
    buildInput({
      label: 'Online Flier/Facebook Page',
      name: '_20otherWebsite',
      type: 'url',
      placeholder: 'If there is another web page for your missing child',
    }),
  );
}

function buildBackgroundPanel() {
  return buildGrid(
    buildTextarea({
      label: 'How did you find out about Team HOPE?',
      name: '_21explainHow',
      required: true,
    }),
    buildTextarea({
      label: 'List other volunteer activities you have been involved with.',
      name: '_22explainActivities',
      required: true,
    }),
    buildTextarea({
      label: 'List special skills/talents, areas of expertise and knowledge.',
      name: '_23explainSkills',
      required: true,
    }),
    buildTextarea({
      label: 'List languages in which you are fluent.',
      name: '_24explainLanguages',
      required: true,
    }),
    buildTextarea({
      label: 'Have you had experience working with families in crisis situations?',
      name: '_25explainExperience',
      required: true,
    }),
    buildInput({
      label: 'How many hours a week are you able to commit to Team HOPE?',
      name: '_26hoursAvailable',
      inputMode: 'numeric',
    }),
    buildRadioGroup({
      legend: 'Have you ever been convicted of a felony or misdemeanor?',
      name: '_27hasConviction',
      options: [['no', 'No'], ['yes', 'Yes']],
    }),
    buildTextarea({
      label: 'If yes, explain below.',
      name: '_29explainConviction',
      rows: 4,
    }),
  );
}

function buildReferenceFields(prefix, number) {
  const group = buildFieldGroup(`Professional Reference ${number}`);
  const fieldNumber = number === 1
    ? ['30', '31', '32', '33', '34', '35', '36', '37', '38']
    : ['39', '40', '41', '42', '43', '44', '45', '46', '47'];
  const key = `reference_${number}`;

  group.append(buildGrid(
    buildInput({ label: 'Name', name: `_${fieldNumber[0]}${key}_name`, required: true }),
    buildInput({ label: 'Street', name: `_${fieldNumber[1]}${key}_street`, required: true }),
    buildInput({ label: 'City', name: `_${fieldNumber[2]}${key}_city`, required: true }),
    buildSelect({
      label: 'State',
      name: `_${fieldNumber[3]}${key}_state`,
      options: US_STATES,
      required: true,
    }),
    zipInput('Zip Code', `_${fieldNumber[4]}${key}_zipcode`),
    phoneInput('Phone', `_${fieldNumber[5]}${key}_phone`, true),
    buildInput({
      label: 'Email',
      name: `_${fieldNumber[6]}${key}_email`,
      type: 'email',
      inputMode: 'email',
      placeholder: 'jane.doe@example.com',
      required: true,
    }),
    buildInput({
      label: 'How long have you known this reference?',
      name: `_${fieldNumber[7]}${key}_known`,
      required: true,
    }),
    buildInput({
      label: 'How do you know this reference?',
      name: `_${fieldNumber[8]}${key}_relationship`,
      required: true,
    }),
  ));

  group.dataset.referencePrefix = prefix;
  return group;
}

function buildReferencesPanel() {
  const intro = buildSectionIntro(
    'Please list two professional references for us to contact, other than relatives and friends, who can attest to your character, skill and dependability.',
  );
  const wrapper = document.createElement('div');
  wrapper.className = 'team-hope-volunteer-reference-wrap';
  wrapper.append(
    intro,
    buildReferenceFields('reference1', 1),
    buildReferenceFields('reference2', 2),
  );
  return wrapper;
}

function buildPanel(index, id, title, content, isFinal = false) {
  const panel = document.createElement('section');
  panel.className = 'team-hope-volunteer-panel';
  panel.dataset.panelIndex = String(index);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'team-hope-volunteer-panel-trigger';
  button.id = `team-hope-volunteer-${id}-trigger`;
  button.setAttribute('aria-expanded', index === 0 ? 'true' : 'false');
  button.setAttribute('aria-controls', `team-hope-volunteer-${id}-panel`);

  const number = document.createElement('span');
  number.className = 'team-hope-volunteer-panel-number';
  number.textContent = String(index + 1).padStart(2, '0');

  const text = document.createElement('span');
  text.className = 'team-hope-volunteer-panel-title';
  text.textContent = title;

  const icon = document.createElement('span');
  icon.className = 'team-hope-volunteer-panel-icon';
  icon.setAttribute('aria-hidden', 'true');

  button.append(number, text, icon);

  const body = document.createElement('div');
  body.className = 'team-hope-volunteer-panel-body';
  body.id = `team-hope-volunteer-${id}-panel`;
  body.setAttribute('aria-labelledby', button.id);
  if (index !== 0) body.hidden = true;

  const inner = document.createElement('div');
  inner.className = 'team-hope-volunteer-panel-inner';
  inner.append(content);

  if (!isFinal) {
    const footer = document.createElement('div');
    footer.className = 'team-hope-volunteer-panel-footer';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'team-hope-volunteer-continue';
    next.textContent = DEFAULTS.continueText;
    footer.append(next);
    inner.append(footer);
  }

  body.append(inner);
  panel.append(button, body);
  return panel;
}

function buildPanels() {
  const builders = [
    buildPersonalPanel,
    buildChildCasePanel,
    buildBackgroundPanel,
    buildReferencesPanel,
  ];

  return PANEL_META.map(([id, title], index) => (
    buildPanel(index, id, title, builders[index](), index === PANEL_META.length - 1)
  ));
}

function openPanel(form, index) {
  form.querySelectorAll('.team-hope-volunteer-panel').forEach((panel) => {
    const isOpen = panel.dataset.panelIndex === String(index);
    panel.classList.toggle('is-open', isOpen);
    panel.querySelector('.team-hope-volunteer-panel-trigger')
      ?.setAttribute('aria-expanded', String(isOpen));
    const body = panel.querySelector('.team-hope-volunteer-panel-body');
    if (body) body.hidden = !isOpen;
  });
}

function panelControls(panel) {
  return [...panel.querySelectorAll('input, select, textarea')]
    .filter((control) => !control.disabled && control.type !== 'hidden');
}

function validatePanel(panel) {
  const invalid = panelControls(panel).find((control) => !control.checkValidity());
  if (!invalid) {
    panel.classList.add('is-complete');
    return true;
  }

  panel.classList.remove('is-complete');
  invalid.reportValidity();
  return false;
}

function validateForm(form) {
  const panels = [...form.querySelectorAll('.team-hope-volunteer-panel')];
  const invalidPanel = panels.find((panel) => !panelControls(panel)
    .every((control) => control.checkValidity()));
  if (!invalidPanel) return true;

  openPanel(form, Number(invalidPanel.dataset.panelIndex));
  const invalid = panelControls(invalidPanel).find((control) => !control.checkValidity());
  invalid?.reportValidity();
  return false;
}

function setupAccordion(form) {
  form.querySelectorAll('.team-hope-volunteer-panel-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const panel = trigger.closest('.team-hope-volunteer-panel');
      openPanel(form, Number(panel.dataset.panelIndex));
    });
  });

  form.querySelectorAll('.team-hope-volunteer-continue').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = button.closest('.team-hope-volunteer-panel');
      if (!validatePanel(panel)) return;
      openPanel(form, Number(panel.dataset.panelIndex) + 1);
    });
  });

  form.addEventListener('input', (event) => {
    const panel = event.target.closest?.('.team-hope-volunteer-panel');
    if (panel && panelControls(panel).every((control) => control.checkValidity())) {
      panel.classList.add('is-complete');
    } else {
      panel?.classList.remove('is-complete');
    }
  });
}

function buildForm() {
  const form = document.createElement('form');
  form.className = 'team-hope-volunteer-form';
  form.append(
    buildHidden('action', 'sendEmailReport'),
    buildHidden('mailtoAddress', 'teamhope@ncmec.org'),
    buildHidden('fromAddress', 'servlet@ncmec.org'),
    buildHidden('subject', 'Team Hope Volunteer Application'),
    buildHidden('LanguageId', 'en'),
    ...buildPanels(),
  );

  ['_06phone', '_08workPhone', '_09cellPhone', '_35reference_1_phone', '_44reference_2_phone']
    .forEach((name) => applyPhoneValidation(form.querySelector(`[name="${name}"]`)));

  setupAccordion(form);
  return form;
}

function bindSubmit(block, form, submitButton, status, config, formSession) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!validateForm(form)) return;

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
      new CustomEvent('team-hope-volunteer:submit', {
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
      form.querySelectorAll('.team-hope-volunteer-panel').forEach((panel) => {
        panel.classList.remove('is-complete');
      });
      openPanel(form, 0);
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
  if (topPadding) block.style.setProperty('--team-hope-volunteer-top-padding', topPadding);

  const formAction = getTextField(block, 'formAction').value || DEFAULTS.formAction;
  const successMessage = getTextField(block, 'successMessage').value || DEFAULTS.successMessage;
  const errorMessage = getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage;

  const shell = document.createElement('div');
  shell.className = 'team-hope-volunteer-shell';

  const header = document.createElement('div');
  header.className = 'team-hope-volunteer-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'team-hope-volunteer-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'team-hope-volunteer-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'team-hope-volunteer-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);
  header.append(eyebrow, heading, intro);

  const form = buildForm();
  const actions = document.createElement('div');
  actions.className = 'team-hope-volunteer-actions';

  const status = document.createElement('p');
  status.className = 'team-hope-volunteer-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'team-hope-volunteer-submit';
  moveText(getTextField(block, 'buttonText'), submitButton, DEFAULTS.buttonText);

  actions.append(status, submitButton);
  form.append(actions);

  const formSession = createFormSession(form, 'team-hope-volunteer');

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
