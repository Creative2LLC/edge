import {
  appendFormMetadata,
  applyPhoneValidation,
  createFormSession,
  extractApiMessage,
  isFormValid,
  normalizeFormAction,
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
  eyebrow: 'Events and Training',
  heading: 'Community Event, Conference, and Training Request',
  intro: 'Tell us about your event, audience, and request so NCMEC can review the opportunity.',
  formAction: '',
  submissionMode: 'native',
  embedUrl: 'https://formstack.io/CB73D',
  buttonText: 'Submit Request',
  successMessage: 'Thank you. Your event request has been submitted.',
  errorMessage: 'We could not submit your request. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

const COUNTRIES = [
  'United States of America',
  'Canada',
  'Mexico',
  'United Kingdom',
  'Australia',
  'France',
  'Germany',
  'India',
  'Ireland',
  'Italy',
  'Japan',
  'Netherlands',
  'New Zealand',
  'Spain',
  'Switzerland',
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
  'N/A',
];

const EVENT_TYPES = ['Community Event', 'Conference', 'Meeting', 'Social Media Event', 'Training', 'Other'];
const ACTIVITY_TYPES = ['Exhibit Booth/Table', 'Presentation', 'Panel Discussion', 'Other'];
const DELIVERY_TYPES = ['In-Person', 'Virtual Live', 'Virtual Pre-recorded', 'I\'m not sure', 'N/A'];
const EVENT_REACH = ['Local', 'State', 'Regional', 'National'];
const HEAR_ABOUT_OPTIONS = [
  'Conference',
  'NCMEC Employee',
  'Website',
  'Webinar or training hosted by NCMEC',
  'Webinar or training hosted by another organization',
  'Word of mouth',
  'Other',
];
const NCMEC_RESOURCES = [
  'I have not used NCMEC resources before',
  'Investigation support and assistance (i.e. reported a child missing, Team Adam, Child Victim Identification Program [CVIP], forensics, etc)',
  'Attended a training (i.e. online, in-person, hybrid)',
  'Attended a conference presentation (i.e. online, in-person, hybrid)',
  'Other',
];
const TARGET_AUDIENCES = [
  'CAC Staff',
  'Child Welfare',
  'Educators',
  'Faith-based organizations',
  'General Public/Community',
  'Juvenile Justice personnel',
  'Law Enforcement',
  'Medical Professionals',
  'Mental Health Professionals',
  'Nonprofit Organizations',
  'Parents',
  'Parole/Probation Officers',
  'Prosecutors',
  'Public Defenders',
  'Public Safety Communication/Dispatchers',
  'Victim Services',
  'Youth',
  'Youth Serving Organization',
  'Other',
];
const MATERIAL_OPTIONS = [
  'NCMEC General Resources and Programs',
  'Child Safety and Prevention Resources (i.e. Child ID Kits, KidSmartz, NetSmartz, etc.)',
  'Missing Children Education Materials',
  'NCMEC Merchandise *Merchandise proceeds will benefit NCMEC programs.',
  'Exploited Children Education Materials',
  'Other',
];
const AMENITY_OPTIONS = ['Table/Chairs', 'Electricity', 'Refreshments', 'None', 'Other'];
const SOCIAL_ENGAGEMENT_OPTIONS = [
  'Twitter Chat',
  'Instagram Live',
  'Facebook Live',
  'Social media engagement (i.e. retweets, shares, etc.)',
  'Other (please specify)',
];
const TOPIC_OPTIONS = [
  'Child Sex Trafficking',
  'Internet Crimes Against Children',
  'Missing and Exploited Children',
  'Prevention',
  'Victim and Family Services',
  'Other',
];
const SPEAKER_EXPENSES = [
  'Lodging',
  'Non-local Transportation (i.e. rental car, flights, etc.)',
  'Per Diem',
  'Donation/Honorarium',
  'Local Transportation (i.e. mileage, parking, etc.)',
  'Unable to cover any cost',
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
  defaultValue = '',
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
    if (defaultValue === option) item.selected = true;
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

  form.append(
    buildHidden('Case.Origin', 'Web'),
    buildHidden('Case.BusinessHoursId', '01m80000000DDRiAAO'),
    buildHidden('inputCase.BusinessHoursId', 'Default'),
  );

  const steps = [
    {
      title: 'Requestor',
      element: buildStep(0, 'Requestor Information', 'Share who is submitting the request and how NCMEC can follow up.', [
        buildGrid(
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
            label: 'Job Title',
            name: 'Case.JobTitle__c',
            autocomplete: 'organization-title',
            required: true,
          }),
          buildInput({
            label: 'Organization Name',
            name: 'Case.OrganizationName__c',
            autocomplete: 'organization',
            required: true,
          }),
          buildSelect({
            label: 'Country',
            name: 'Case.Country__c',
            options: COUNTRIES,
            defaultValue: 'United States of America',
          }),
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
          }),
          buildSelect({
            label: 'State/Province',
            name: 'Case.CaseState__c',
            options: STATES,
          }),
          buildInput({
            label: 'Zip/Postal Code',
            name: 'Case.ZipPostalCode__c',
            autocomplete: 'postal-code',
          }),
          buildInput({
            label: 'Email Address',
            name: 'Case.EmailAddress__c',
            type: 'email',
            autocomplete: 'email',
            inputMode: 'email',
            required: true,
          }),
          buildInput({
            label: 'Phone Number',
            name: 'Case.PhoneNumber__c',
            type: 'tel',
            autocomplete: 'tel',
            inputMode: 'tel',
          }),
          buildInput({
            label: 'NCMEC Contact Name',
            name: 'Case.NCMECContactName__c',
          }),
          buildSelect({
            label: 'How did you hear about NCMEC?',
            name: 'Case.How_did_you_hear_about_NCMEC__c',
            options: HEAR_ABOUT_OPTIONS,
          }),
          buildInput({
            label: 'Conference Name',
            name: 'Case.Please_specify_name_of_conference__c',
          }),
          buildInput({
            label: 'Other Source',
            name: 'Case.How_did_you_hear_about_NCMEC_Other__c',
          }),
          buildCheckboxGroup({
            label: 'What NCMEC resources have you used before?',
            name: 'Case.What_NCMEC_resources_have_you_used_befor__c',
            options: NCMEC_RESOURCES,
          }),
          buildInput({
            label: 'Other NCMEC Resources Used',
            name: 'Case.Other_NCMEC_resources_used__c',
          }),
        ),
      ]),
    },
    {
      title: 'Event',
      element: buildStep(1, 'Event Details', 'Describe the event type, location, timing, and expected reach.', [
        buildGrid(
          buildSelect({
            label: 'Event Type',
            name: 'Case.EventType__c',
            options: EVENT_TYPES,
            required: true,
          }),
          buildInput({
            label: 'Event Type Other',
            name: 'Case.EventTypeOther__c',
          }),
          buildCheckboxGroup({
            label: 'Activity Type',
            name: 'Case.ActivityType__c',
            options: ACTIVITY_TYPES,
          }),
          buildSelect({
            label: 'Delivery Type',
            name: 'Case.DeliveryType__c',
            options: DELIVERY_TYPES,
          }),
          buildInput({
            label: 'Event Name',
            name: 'Case.EventName__c',
            required: true,
          }),
          buildInput({
            label: 'Event Start Date',
            name: 'Case.EventStartDate__c',
            type: 'date',
            required: true,
          }),
          buildInput({
            label: 'Event End Date',
            name: 'Case.EventEndDate__c',
            type: 'date',
            required: true,
          }),
          buildTextarea({
            label: 'Description',
            name: 'Case.Description',
            required: true,
          }),
          buildSelect({
            label: 'Event Country',
            name: 'Case.EventCountry__c',
            options: COUNTRIES,
            defaultValue: 'United States of America',
          }),
          buildInput({
            label: 'Event Location Address',
            name: 'Case.EventLocationAddress__c',
          }),
          buildInput({
            label: 'Event City',
            name: 'Case.EventCity__c',
            required: true,
          }),
          buildSelect({
            label: 'Event State',
            name: 'Case.EventState__c',
            options: STATES,
            required: true,
          }),
          buildInput({
            label: 'Event Zip',
            name: 'Case.EventZip__c',
          }),
          buildInput({
            label: 'Estimated Attendance Size',
            name: 'Case.EstimatedAttendanceSize__c',
            inputMode: 'numeric',
            required: true,
          }),
          buildCheckboxGroup({
            label: 'Event Reach',
            name: 'Case.Event_Reach__c',
            options: EVENT_REACH,
            required: true,
          }),
          buildInput({
            label: 'Other Participating Organizations',
            name: 'Case.OtherParticipatingOrganizations__c',
          }),
          buildInput({
            label: 'Website / Social Media Handles',
            name: 'Case.WebsiteSocialMediaHandles__c',
          }),
        ),
      ]),
    },
    {
      title: 'Audience',
      element: buildStep(2, 'Audience and Support', 'Tell us who the event serves and what support or materials are needed.', [
        buildGrid(
          buildCheckboxGroup({
            label: 'Target Audience',
            name: 'Case.TargetAudience__c',
            options: TARGET_AUDIENCES,
            required: true,
          }),
          buildInput({
            label: 'Target Audience Other',
            name: 'Case.TargetAudienceOther__c',
          }),
          buildCheckboxGroup({
            label: 'Materials Applicable to Event',
            name: 'Case.MaterialsForEvent__c',
            options: MATERIAL_OPTIONS,
          }),
          buildInput({
            label: 'Other Materials Requested',
            name: 'Case.OtherMaterialsForEvent__c',
          }),
          buildCheckboxGroup({
            label: 'Amenities Provided',
            name: 'Case.Amenities_For_Event__c',
            options: AMENITY_OPTIONS,
          }),
          buildInput({
            label: 'Other Amenities Provided',
            name: 'Case.OtherAmenitiesForEvent__c',
          }),
          buildCheckboxGroup({
            label: 'Type of Social Engagement',
            name: 'Case.Type_Of_SocialEngagement__c',
            options: SOCIAL_ENGAGEMENT_OPTIONS,
          }),
          buildInput({
            label: 'Other Social Engagement Details',
            name: 'Case.OtherSocialEngagementDetails__c',
          }),
        ),
      ]),
    },
    {
      title: 'Request',
      element: buildStep(3, 'Speaker and Request Summary', 'Add speaker topic preferences, logistics, goals, and prior efforts.', [
        buildGrid(
          buildSelect({
            label: 'First Topic Choice',
            name: 'Case.FirstTopicChoice__c',
            options: TOPIC_OPTIONS,
            required: true,
          }),
          buildSelect({
            label: 'Second Topic Choice',
            name: 'Case.SecondTopicChoice__c',
            options: [...TOPIC_OPTIONS, 'N/A'],
            defaultValue: 'N/A',
          }),
          buildSelect({
            label: 'Third Topic Choice',
            name: 'Case.Third_Topic_Choice__c',
            options: [...TOPIC_OPTIONS, 'N/A'],
            defaultValue: 'N/A',
          }),
          buildCheckboxGroup({
            label: 'Speaker Expenses Your Organization Can Cover',
            name: 'Case.SpeakerExpenses__c',
            options: SPEAKER_EXPENSES,
          }),
          buildInput({
            label: 'Length of Presentation in Minutes',
            name: 'Case.LengthOfPresentation__c',
            inputMode: 'numeric',
          }),
          buildSelect({
            label: 'Will engagement be repeated?',
            name: 'Case.EngagementRepeated__c',
            options: ['Yes', 'No'],
          }),
          buildSelect({
            label: 'Will the presentation be recorded?',
            name: 'Case.PresentationRecorded__c',
            options: ['Yes', 'No', 'I\'m not sure'],
          }),
          buildTextarea({
            label: 'Request Summary',
            name: 'Case.RequestSummary__c',
            required: true,
          }),
          buildTextarea({
            label: 'Goals and Outcomes',
            name: 'Case.GoalsAndOutcomes__c',
            required: true,
          }),
          buildTextarea({
            label: 'Previous Efforts',
            name: 'Case.PreviousEfforts__c',
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

  form.append(progress, stepsWrap);
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
    const checked = group.querySelectorAll(`input[name="${CSS.escape(group.dataset.requiredName)}"]:checked`).length;
    const first = group.querySelector(`input[name="${CSS.escape(group.dataset.requiredName)}"]`);
    if (first) first.setCustomValidity(checked ? '' : 'Select at least one option.');
    if (!checked) valid = false;
  });
  if (!valid) step.querySelector(':invalid')?.reportValidity();
  return valid;
}

function bindRequiredCheckboxGroups(form) {
  form.querySelectorAll('[data-required-name]').forEach((group) => {
    const first = group.querySelector(`input[name="${CSS.escape(group.dataset.requiredName)}"]`);
    const inputs = [...group.querySelectorAll(`input[name="${CSS.escape(group.dataset.requiredName)}"]`)];
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
  formData.set('originalFormName', 'NCMEC Event Request Form');
  formData.set('originalFormUrl', originalFormUrl || DEFAULTS.embedUrl);
  formData.set('Case.Origin', formData.get('Case.Origin') || 'Web');
  formData.set('Case.BusinessHoursId', formData.get('Case.BusinessHoursId') || '01m80000000DDRiAAO');
  formData.set('inputCase.BusinessHoursId', formData.get('inputCase.BusinessHoursId') || 'Default');
}

function getValues(formData, name) {
  return formData.getAll(name).filter(Boolean).join(', ');
}

function appendNormalizedFields(formData) {
  formData.set('firstName', formData.get('Case.FirstName__c') || '');
  formData.set('lastName', formData.get('Case.LastName__c') || '');
  formData.set('organization', formData.get('Case.OrganizationName__c') || '');
  formData.set('email', formData.get('Case.EmailAddress__c') || '');
  formData.set('phone', formData.get('Case.PhoneNumber__c') || '');
  formData.set('eventType', formData.get('Case.EventType__c') || '');
  formData.set('eventName', formData.get('Case.EventName__c') || '');
  formData.set('eventStartDate', formData.get('Case.EventStartDate__c') || '');
  formData.set('eventEndDate', formData.get('Case.EventEndDate__c') || '');
  formData.set('eventReach', getValues(formData, 'Case.Event_Reach__c'));
  formData.set('targetAudience', getValues(formData, 'Case.TargetAudience__c'));
}

function buildOriginalEmbed(embedUrl) {
  const frame = document.createElement('iframe');
  frame.className = 'event-request-form-embed';
  frame.title = 'NCMEC event request form';
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
      new CustomEvent('event-request-form:submit', {
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
  if (topPadding) block.style.setProperty('--event-request-form-top-padding', topPadding);

  const formAction = normalizeFormAction(getTextField(block, 'formAction').value || DEFAULTS.formAction);
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

  if (submissionMode === 'original-formstack') {
    shell.append(header, buildOriginalEmbed(embedUrl));
    block.replaceChildren(shell);
    return;
  }

  const { form } = buildForm();
  applyPhoneValidation(form.querySelector('[name="Case.PhoneNumber__c"]'));
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

  const formSession = createFormSession(form, 'event-request-form');

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
