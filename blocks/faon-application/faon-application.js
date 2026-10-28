import {
  appendFormMetadata,
  applyPhoneValidation,
  createFormSession,
  extractApiMessage,
  isFormValid,
  resolveFormAction,
  updateFormStatus,
} from '../../scripts/form-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';
import { applyButtonStyle } from '../../scripts/button-utils.js';

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
  eyebrow: 'Family Advocacy',
  heading: 'Family Advocacy Outreach Network Membership Application',
  intro: 'Apply to join FAON so NCMEC can connect families with counseling services and professional support.',
  submissionMode: 'backend',
  formAction: '',
  jotformAction: 'https://submit.jotform.com/submit/233355995169168',
  buttonText: 'Apply to Join',
  successMessage: 'Thank you. Your FAON membership application has been submitted.',
  errorMessage: 'We could not submit your application. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL or switch to Jotform submission mode.',
};

const MEMBERSHIP_OPTIONS = [
  'Licensed clinician. (Select this option if you are applying yourself, and not your organization, as an FAON Member. Your FAON status goes with you regardless of which place you work).',
  'Services organization. (Select this option if you are applying your organization, and not yourself, as an FAON Member. Your FAON status stays with the organization, and not you, should you leave the organization listed on this application).',
  'Pre-licensed clinician. (Select this option if you plan to get your license soon. If you do not plan to get a license, please select Services Organization above).',
];

const CASE_TYPES = [
  'Child Sexual Abuse Materials (CSAM)',
  'Child Sex Trafficking',
  'Online Sexual Exploitation (Financial Sextortion, Sadistic Online Exploitation, Generative Artificial Intelligence CSAM)',
  'Family Abduction',
  'Non-Family Abduction',
  'Voluntary Missing/Runaway Youth',
];

const SERVICE_MODES = ['In-Person', 'Virtual'];

const TREATMENT_MODALITIES = [
  'Art Therapy',
  'Animal Assisted Therapy',
  'CBT',
  'TF-CBT',
  'DBT',
  'EMDR',
  'Family Systems Therapy',
  'Marriage and Family Therapy',
  'Play Therapy',
];

const REFERRAL_SOURCES = [
  'FAD Specialist contacted me for a referral',
  'Online (Google, social media, LinkedIn)',
  'Conference',
  'Psychotherapy Networker Symposium',
  'Colleague',
  'Other NCMEC Employee',
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
  'U.S. Virgin Islands',
  'Utah',
  'Vermont',
  'Virginia',
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
  if (/^-?\d+(\.\d)?$/.test(trimmed)) return `${trimmed}px`;
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
  marker.className = 'faon-application-required';
  marker.textContent = ' *';
  return marker;
}

function buildLabel(label, required) {
  const labelText = document.createElement('span');
  labelText.className = 'faon-application-label';
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
  field.className = 'faon-application-field';

  const input = document.createElement('input');
  input.className = 'faon-application-input';
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
  required = false,
}) {
  const field = document.createElement('label');
  field.className = 'faon-application-field faon-application-field-wide';

  const textarea = document.createElement('textarea');
  textarea.className = 'faon-application-textarea';
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
  multiple = false,
}) {
  const field = document.createElement('label');
  field.className = 'faon-application-field';
  if (multiple) field.classList.add('faon-application-field-wide');

  const select = document.createElement('select');
  select.className = 'faon-application-select';
  select.name = name;
  select.multiple = multiple;
  if (required) select.required = true;

  if (!multiple) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Select one';
    select.append(empty);
  }

  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option;
    item.textContent = option;
    select.append(item);
  });

  field.append(buildLabel(label, required), select);
  return field;
}

function buildRadioItem(name, value, required, otherName = '') {
  const field = document.createElement('label');
  field.className = 'faon-application-choice-item';

  const input = document.createElement('input');
  input.className = 'faon-application-choice';
  input.type = 'radio';
  input.name = name;
  input.value = value;
  if (required) input.required = true;

  const text = document.createElement('span');
  text.textContent = value === 'other' ? 'Other' : value;
  field.append(input, text);

  if (otherName) {
    const otherInput = document.createElement('input');
    otherInput.className = 'faon-application-input faon-application-other-input';
    otherInput.type = 'text';
    otherInput.name = otherName;
    otherInput.placeholder = 'Please specify';
    otherInput.disabled = true;

    input.addEventListener('change', () => {
      otherInput.disabled = !input.checked;
      if (!input.checked) otherInput.value = '';
    });

    field.append(otherInput);
  }

  return field;
}

function buildRadioGroup({
  label,
  name,
  options,
  required = false,
  otherName = '',
}) {
  const group = document.createElement('fieldset');
  group.className = 'faon-application-choice-group faon-application-field-wide';
  if (required) {
    group.dataset.requiredNames = [name, otherName].filter(Boolean).join(',');
  }

  const legend = document.createElement('legend');
  legend.className = 'faon-application-label';
  legend.textContent = label;
  if (required) legend.append(buildRequiredMarker());

  const list = document.createElement('div');
  list.className = 'faon-application-choice-list';
  options.forEach((option) => list.append(buildRadioItem(name, option, required)));
  if (otherName) list.append(buildRadioItem(name, 'other', required, otherName));

  group.append(legend, list);
  return group;
}

function buildCheckboxItem(name, value, required, otherName = '') {
  const field = document.createElement('label');
  field.className = 'faon-application-choice-item';

  const input = document.createElement('input');
  input.className = 'faon-application-choice';
  input.type = 'checkbox';
  // The "Other" box is left unnamed on purpose: it only reveals the text input
  // beside it, and the two sharing a name made the field arrive as whichever
  // came last in the DOM rather than as the typed answer.
  if (!otherName) input.name = name;
  input.value = otherName ? 'other' : value;
  if (required) input.required = true;

  const text = document.createElement('span');
  text.textContent = otherName ? 'Other' : value;
  field.append(input, text);

  if (otherName) {
    const otherInput = document.createElement('input');
    otherInput.className = 'faon-application-input faon-application-other-input';
    otherInput.type = 'text';
    otherInput.name = otherName;
    otherInput.placeholder = 'Please specify';
    otherInput.disabled = true;

    input.addEventListener('change', () => {
      otherInput.disabled = !input.checked;
      if (!input.checked) otherInput.value = '';
    });

    field.append(otherInput);
  }

  return field;
}

function buildCheckboxGroup({
  label,
  name,
  options,
  required = false,
  otherName = '',
}) {
  const group = document.createElement('fieldset');
  group.className = 'faon-application-choice-group faon-application-field-wide';

  const legend = document.createElement('legend');
  legend.className = 'faon-application-label';
  legend.textContent = label;
  if (required) legend.append(buildRequiredMarker());

  const list = document.createElement('div');
  list.className = 'faon-application-choice-list';
  options.forEach((option) => list.append(buildCheckboxItem(name, option, false)));
  if (otherName) list.append(buildCheckboxItem(name, 'other', false, otherName));

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
  grid.className = 'faon-application-grid';
  grid.append(...children);
  return grid;
}

function buildSectionIntro(text) {
  const intro = document.createElement('p');
  intro.className = 'faon-application-section-intro';
  intro.textContent = text;
  return intro;
}

function buildLicenseFields(key, required = false, title = '') {
  const group = document.createElement('div');
  group.className = 'faon-application-field-group';

  if (title) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    group.append(heading);
  }

  group.append(buildGrid(
    buildInput({
      label: 'Professional First Name',
      name: `${key}FirstName`,
      required,
      autocomplete: 'given-name',
    }),
    buildInput({
      label: 'Professional Last Name',
      name: `${key}LastName`,
      required,
      autocomplete: 'family-name',
    }),
    buildInput({
      label: 'License Number',
      name: `${key}Number`,
      required,
    }),
    buildInput({
      label: 'Type of License',
      name: `${key}Role`,
      placeholder: 'LMFT, LCSW, LPC, etc.',
      required,
    }),
    buildInput({
      label: 'Licensing State',
      name: `${key}State`,
      required,
    }),
    buildInput({
      label: 'License Expiration Date',
      name: `${key}ExpiresOn`,
      type: 'date',
      required,
    }),
  ));

  return group;
}

function buildStaffFields(key, title) {
  const group = document.createElement('div');
  group.className = 'faon-application-field-group';

  const heading = document.createElement('h3');
  heading.textContent = title;

  group.append(heading, buildGrid(
    buildInput({
      label: 'Staff First Name',
      name: `${key}FirstName`,
      autocomplete: 'given-name',
    }),
    buildInput({
      label: 'Staff Last Name',
      name: `${key}LastName`,
      autocomplete: 'family-name',
    }),
    buildInput({
      label: 'Title/Role',
      name: `${key}Role`,
    }),
    buildInput({
      label: 'Email',
      name: `${key}Email`,
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
    }),
    buildInput({
      label: 'Phone Area Code',
      name: `${key}PhoneAreaCode`,
      inputMode: 'numeric',
      pattern: '^\\d{3}$',
      title: 'Enter a 3 digit area code.',
    }),
    buildInput({
      label: 'Phone Number',
      name: `${key}Phone`,
      type: 'tel',
      inputMode: 'tel',
    }),
  ));

  return group;
}

function buildAddressFields(key, title, required = false) {
  const group = document.createElement('div');
  group.className = 'faon-application-field-group';

  const heading = document.createElement('h3');
  heading.textContent = title;

  group.append(heading, buildGrid(
    buildInput({
      label: 'Street Address',
      name: `${key}AddressLine1`,
      autocomplete: 'address-line1',
      required,
    }),
    buildInput({
      label: 'Street Address Line 2',
      name: `${key}AddressLine2`,
      autocomplete: 'address-line2',
    }),
    buildInput({
      label: 'City',
      name: `${key}City`,
      autocomplete: 'address-level2',
      required,
    }),
    buildInput({
      label: 'State / Province',
      name: `${key}State`,
      autocomplete: 'address-level1',
      required,
    }),
    buildInput({
      label: 'Postal / Zip Code',
      name: `${key}Postal`,
      autocomplete: 'postal-code',
      required,
    }),
  ));

  return group;
}

function buildTerms() {
  const group = document.createElement('fieldset');
  group.className = 'faon-application-terms faon-application-field-wide';

  const legend = document.createElement('legend');
  legend.className = 'faon-application-label';
  legend.textContent = 'Terms and Conditions';
  legend.append(buildRequiredMarker());

  [
    ['agreementVirtualInterview', 'I agree to a virtual interview, to keep my contact information up to date with NCMEC, and that the contact information provided is the best way for NCMEC to contact me.'],
    ['agreementTraining', 'I agree to attend at least one free NCMEC training/networking event or complete 2 free NCMEC CONNECT courses each calendar year.'],
    ['agreementReferralRequests', 'I agree to respond to referral requests, indicating if I am available or not to take the referral.'],
  ].forEach(([name, label]) => {
    const item = document.createElement('label');
    item.className = 'faon-application-choice-item';

    const input = document.createElement('input');
    input.className = 'faon-application-choice';
    input.type = 'checkbox';
    input.name = name;
    input.value = 'Yes';
    input.required = true;

    const text = document.createElement('span');
    text.textContent = label;
    item.append(input, text);
    group.append(item);
  });

  return group;
}

function buildPanel(index, title, children, open = false) {
  const panel = document.createElement('section');
  panel.className = 'faon-application-panel accordion';
  if (open) panel.classList.add('is-open');

  const trigger = document.createElement('button');
  trigger.className = 'faon-application-panel-trigger accordion-trigger';
  trigger.type = 'button';
  trigger.id = `faon-application-panel-${index}-trigger`;
  trigger.setAttribute('aria-controls', `faon-application-panel-${index}`);
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');

  const number = document.createElement('span');
  number.className = 'faon-application-panel-number';
  number.textContent = String(index).padStart(2, '0');

  const text = document.createElement('span');
  text.className = 'faon-application-panel-title accordion-label';
  text.textContent = title;

  const icon = document.createElement('span');
  icon.className = 'faon-application-panel-icon accordion-icon';
  icon.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'faon-application-panel-body accordion-panel';
  body.id = `faon-application-panel-${index}`;
  body.setAttribute('aria-labelledby', trigger.id);

  const inner = document.createElement('div');
  inner.className = 'faon-application-panel-inner';
  inner.append(...children);

  const footer = document.createElement('div');
  footer.className = 'faon-application-panel-footer';

  const next = document.createElement('button');
  next.className = 'faon-application-continue';
  applyButtonStyle(next, 'primary');
  next.type = 'button';
  next.textContent = index === 5 ? 'Review Application' : 'Continue';
  footer.append(next);
  inner.append(footer);

  body.append(inner);
  trigger.append(number, text, icon);
  panel.append(trigger, body);
  return panel;
}

function buildForm() {
  const form = document.createElement('form');
  form.className = 'faon-application-form';

  const applicantPanel = buildPanel(1, 'Applicant Information', [
    buildSectionIntro('Start with the primary applicant and organization contact information.'),
    buildGrid(
      buildInput({
        label: 'First Name',
        name: 'applicantFirstName',
        autocomplete: 'given-name',
        required: true,
      }),
      buildInput({
        label: 'Last Name',
        name: 'applicantLastName',
        autocomplete: 'family-name',
        required: true,
      }),
      buildInput({
        label: 'Organization Name',
        name: 'organizationName',
        autocomplete: 'organization',
        required: true,
      }),
      buildInput({
        label: 'Website',
        name: 'organizationWebsite',
        type: 'url',
        placeholder: 'https://example.org',
        required: true,
      }),
      buildInput({
        label: 'Job Title',
        name: 'jobTitle',
        autocomplete: 'organization-title',
      }),
      buildInput({
        label: 'Applicant Phone Number',
        name: 'applicantPhone',
        type: 'tel',
        autocomplete: 'tel',
        inputMode: 'tel',
        placeholder: '(000) 000-0000',
        required: true,
      }),
      buildInput({
        label: 'Applicant Email Address',
        name: 'applicantEmail',
        type: 'email',
        autocomplete: 'email',
        inputMode: 'email',
        placeholder: 'example@example.com',
        required: true,
      }),
    ),
  ], true);

  const licensePanel = buildPanel(2, 'Professional License', [
    buildRadioGroup({
      label: 'I am interested in joining FAON as a...',
      name: 'membershipInterest',
      options: MEMBERSHIP_OPTIONS,
      required: true,
    }),
    buildLicenseFields('primaryLicense', true, 'Primary License'),
    buildLicenseFields('organizationProviderLicense', false, 'Organization Provider License'),
    buildLicenseFields('supervisorLicense', false, 'Supervisor License'),
    buildRadioGroup({
      label: 'Do you want to add an additional license?',
      name: 'addAdditionalLicense',
      options: ['Yes', 'No'],
    }),
    buildLicenseFields('additionalLicense1', false, 'Additional License 1'),
    buildLicenseFields('additionalLicense2', false, 'Additional License 2'),
    buildLicenseFields('additionalLicense3', false, 'Additional License 3'),
    buildTextarea({
      label: 'If you have more licenses to list, please provide that information here.',
      name: 'additionalLicenses',
      rows: 4,
    }),
  ]);

  const staffPanel = buildPanel(3, 'Staff and Compliance', [
    buildSectionIntro('Add additional clinical staff who can provide services to NCMEC cases.'),
    buildStaffFields('staffMember1', 'Staff Member 1'),
    buildStaffFields('staffMember2', 'Staff Member 2'),
    buildStaffFields('staffMember3', 'Staff Member 3'),
    buildTextarea({
      label: 'Additional staff members',
      name: 'additionalStaffMembers',
      rows: 5,
    }),
    buildRadioGroup({
      label: 'Has there ever been disciplinary action against you, the agency or any professionals in the group?',
      name: 'hasDisciplinaryAction',
      options: ['Yes', 'No'],
      required: true,
    }),
    buildTextarea({
      label: 'Please provide detailed information for each incident.',
      name: 'disciplinaryActionDetails',
      rows: 5,
    }),
  ]);

  const servicePanel = buildPanel(4, 'Service Details', [
    buildCheckboxGroup({
      label: 'I can clinically support those impacted by',
      name: 'clinicalSupportFor[]',
      options: CASE_TYPES,
      required: true,
      otherName: 'clinicalSupportForOther',
    }),
    buildInput({
      label: 'If you offer services in languages other than English, please list them.',
      name: 'languagesOffered',
    }),
    buildCheckboxGroup({
      label: 'How do you provide services?',
      name: 'serviceDeliveryMethods[]',
      options: SERVICE_MODES,
      required: true,
      otherName: 'serviceDeliveryMethodsOther',
    }),
    buildAddressFields('inPersonLocation', 'In-Person Location', true),
    buildRadioGroup({
      label: 'Do you want to add another in-person location?',
      name: 'addAnotherLocation',
      options: ['Yes', 'No'],
    }),
    buildAddressFields('additionalInPersonLocation1', 'Additional In-Person Location 1'),
    buildAddressFields('additionalInPersonLocation2', 'Additional In-Person Location 2'),
    buildAddressFields('additionalInPersonLocation3', 'Additional In-Person Location 3'),
    buildTextarea({
      label: 'If you have more in-person locations to list, please provide that information here.',
      name: 'additionalLocations',
      rows: 4,
    }),
    buildSelect({
      label: 'What US states/territories do you provide virtual services in?',
      // Multi-select, so the name carries `[]`: posted bare, only the last
      // state selected would survive.
      name: 'virtualServiceStates[]',
      options: STATES,
      multiple: true,
      required: true,
    }),
    buildAddressFields('mailingAddress', 'Mailing Address', true),
    buildCheckboxGroup({
      label: 'Treatment Modalities',
      name: 'treatmentModalities[]',
      options: TREATMENT_MODALITIES,
      required: true,
      otherName: 'treatmentModalitiesOther',
    }),
    buildGrid(
      buildInput({
        label: 'Minimum Age Served',
        name: 'ageMinimum',
        type: 'number',
        inputMode: 'numeric',
        required: true,
      }),
      buildInput({
        label: 'Maximum Age Served',
        name: 'ageMaximum',
        type: 'number',
        inputMode: 'numeric',
        required: true,
      }),
    ),
  ]);

  const referralPanel = buildPanel(5, 'Fees and Referrals', [
    buildGrid(
      buildInput({
        label: 'Self-pay rate for individual counseling',
        name: 'selfPayRate',
        required: true,
      }),
      buildInput({
        label: 'Sliding scale/reduced fee rate',
        name: 'slidingScaleRate',
        required: true,
      }),
    ),
    buildInput({
      label: 'Do you offer pro-bono services and what are the requirements?',
      name: 'proBonoServices',
      required: true,
    }),
    buildTextarea({
      label: 'Which insurances are you in-network with?',
      name: 'insuranceNetworks',
      required: true,
    }),
    buildTextarea({
      label: 'Please list any additional payment methods you accept.',
      name: 'additionalPaymentMethods',
    }),
    buildRadioGroup({
      label: 'Do you have professional liability insurance?',
      name: 'hasLiabilityInsurance',
      options: ['Yes', 'No'],
      required: true,
    }),
    buildTextarea({
      label: 'Which days and times do you provide counseling services?',
      name: 'serviceDaysAndTimes',
      required: true,
    }),
    buildRadioGroup({
      label: 'Do you currently, or often, have a waitlist for counseling services?',
      name: 'hasWaitlist',
      options: ['Yes', 'No'],
      required: true,
    }),
    buildTextarea({
      label: 'What is your current or typical waitlist?',
      name: 'waitlistDetails',
    }),
    buildTextarea({
      label: 'Is there anything else that you would like us to know about yourself or your practice/organization?',
      name: 'additionalInformation',
      rows: 5,
    }),
    buildRadioGroup({
      label: 'How did you hear about FAON?',
      name: 'howDidYouHear',
      options: REFERRAL_SOURCES,
      required: true,
      otherName: 'howDidYouHearOther',
    }),
    buildTerms(),
    buildRadioGroup({
      label: 'Would you like to share your contact information with other FAON members?',
      name: 'shareContactWithFaonMembers',
      options: ['Yes', 'No'],
    }),
  ]);

  form.append(applicantPanel, licensePanel, staffPanel, servicePanel, referralPanel);
  form.append(
    buildHidden('q302_typeA302', ''),
    buildHidden('jotformFormId', '233355995169168'),
  );

  applyPhoneValidation(form.querySelector('[name="applicantPhone"]'));
  return form;
}

// The shared .accordion animates the panel open, so no height is measured here.
function refreshPanel(panel, open) {
  const trigger = panel.querySelector('.faon-application-panel-trigger');
  panel.classList.toggle('is-open', open);
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function bindPanels(form) {
  const panels = [...form.querySelectorAll('.faon-application-panel')];
  panels.forEach((panel, index) => {
    refreshPanel(panel, index === 0);
    panel.querySelector('.faon-application-panel-trigger').addEventListener('click', () => {
      refreshPanel(panel, !panel.classList.contains('is-open'));
    });
  });

  form.querySelectorAll('.faon-application-continue').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = button.closest('.faon-application-panel');
      const next = panel.nextElementSibling;
      refreshPanel(panel, false);
      if (next?.classList.contains('faon-application-panel')) {
        refreshPanel(next, true);
        next.querySelector('.faon-application-panel-trigger').focus({ preventScroll: true });
        next.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function bindRequiredCheckboxGroups(form) {
  form.querySelectorAll('[data-required-names]').forEach((group) => {
    const names = group.dataset.requiredNames.split(',');
    const inputs = names.flatMap((name) => [...group.querySelectorAll(`[name="${CSS.escape(name)}"]`)]);
    const firstInput = inputs[0];
    if (!firstInput) return;

    const validate = () => {
      const hasSelection = inputs.some((input) => input.checked);
      firstInput.setCustomValidity(hasSelection ? '' : 'Select at least one option.');
    };

    inputs.forEach((input) => input.addEventListener('change', validate));
    validate();
  });
}

function getAllValues(formData, name) {
  return formData.getAll(name).filter(Boolean).join(', ');
}

/*
 * Jotform-only aliases. The inputs themselves now carry clean names that the
 * NCMEC API validates against; these duplicate a few of them back under the
 * names the legacy Jotform build expects, and are appended only on that path.
 *
 * Note `website` is deliberately NOT aliased here: it is the name of one of the
 * two honeypots in form-utils, so populating it would trip our own spam trap.
 */
function appendJotformAliasFields(formData) {
  const minAge = formData.get('ageMinimum') || '';
  const maxAge = formData.get('ageMaximum') || '';
  formData.set('q302_typeA302', minAge && maxAge ? `${minAge} - ${maxAge}` : '');

  formData.set('firstName', formData.get('applicantFirstName') || '');
  formData.set('lastName', formData.get('applicantLastName') || '');
  formData.set('organization', formData.get('organizationName') || '');
  formData.set('phone', formData.get('applicantPhone') || '');
  formData.set('email', formData.get('applicantEmail') || '');
  formData.set('membershipType', formData.get('membershipInterest') || '');
  formData.set('caseTypes', getAllValues(formData, 'clinicalSupportFor[]'));
  formData.set('serviceModes', getAllValues(formData, 'serviceDeliveryMethods[]'));
  formData.set('virtualStates', getAllValues(formData, 'virtualServiceStates[]'));
  formData.set('originalFormUrl', 'https://form.jotform.com/233355995169168');
}

function appendJotformFields(formData) {
  const formId = '233355995169168';
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
    const frameName = `faon-application-jotform-${Date.now()}`;
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

    block.dispatchEvent(
      new CustomEvent('faon-application:submit', {
        bubbles: true,
        detail: Object.fromEntries(formData.entries()),
      }),
    );

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    updateFormStatus(status, 'Submitting application...', 'info');

    try {
      if (config.mode === 'jotform') {
        appendJotformAliasFields(formData);
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
      form.querySelectorAll('.faon-application-other-input').forEach((input) => {
        input.disabled = true;
      });
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
  if (topPadding) block.style.setProperty('--faon-application-top-padding', topPadding);

  const submissionMode = getTextField(block, 'submissionMode').value || DEFAULTS.submissionMode;
  const formAction = resolveFormAction('faon-application', getTextField(block, 'formAction').value || DEFAULTS.formAction);
  const jotformAction = getTextField(block, 'jotformAction').value || DEFAULTS.jotformAction;
  const successMessage = getTextField(block, 'successMessage').value || DEFAULTS.successMessage;
  const errorMessage = getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage;

  const shell = document.createElement('div');
  shell.className = 'faon-application-shell';

  const header = document.createElement('div');
  header.className = 'faon-application-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'faon-application-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'faon-application-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'faon-application-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);
  header.append(eyebrow, heading, intro);

  const form = buildForm();
  form.append(buildHidden('submissionMode', submissionMode));

  const actions = document.createElement('div');
  actions.className = 'faon-application-actions';

  const status = document.createElement('p');
  status.className = 'faon-application-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'faon-application-submit';
  applyButtonStyle(submitButton, 'primary');
  moveText(getTextField(block, 'buttonText'), submitButton, DEFAULTS.buttonText);

  actions.append(status, submitButton);
  form.append(actions);

  const formSession = createFormSession(form, 'faon-application');

  shell.append(header, form);
  block.replaceChildren(shell);

  bindPanels(form);
  bindRequiredCheckboxGroups(form);
  bindSubmit(block, form, submitButton, status, {
    mode: submissionMode,
    action: formAction,
    jotformAction,
    successMessage,
    errorMessage,
    isAuthoring: hasAuthoringContext(block),
  }, formSession);
}
