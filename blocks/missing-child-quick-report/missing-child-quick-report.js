import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  eyebrow: 0,
  heading: 1,
  intro: 2,
  emergencyHeading: 3,
  emergencyCopy: 4,
  formAction: 5,
  buttonText: 6,
  successMessage: 7,
  errorMessage: 8,
  topPadding: 9,
};

const DEFAULTS = {
  eyebrow: 'Quick Report',
  heading: 'I have seen a missing child',
  intro: 'Use this form to send NCMEC details about a possible sighting of a missing child.',
  emergencyHeading: 'Is the child in immediate danger?',
  emergencyCopy: 'Call 911 now. You can also contact NCMEC 24 hours a day at 1-800-THE-LOST (1-800-843-5678).',
  formAction: 'https://www.missingkids.org/missingkids/servlet/FormMultipartServlet',
  buttonText: 'Submit Report',
  successMessage: 'Thanks for reporting. Your information has been submitted.',
  errorMessage: 'We could not submit this report. Please call 1-800-THE-LOST (1-800-843-5678).',
  fromAddress: 'servlet@ncmec.org',
  mailtoAddress: 'hotline@ncmec.org',
  subject: 'missingkids online-sighting Web Form',
  formType: 'quickReport',
  action: 'sendEmailReport',
};

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

function getQueryValue(name) {
  try {
    return new URLSearchParams(window.location.search).get(name)?.trim() || '';
  } catch {
    return '';
  }
}

function makeId(base) {
  return `${base}-${Math.random().toString(36).slice(2, 9)}`;
}

function appendHidden(form, name, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  form.append(input);
  return input;
}

function buildTextInput({
  label,
  name,
  value = '',
  required = false,
  autocomplete = '',
}) {
  const field = document.createElement('label');
  field.className = 'missing-child-quick-report-field';

  const labelText = document.createElement('span');
  labelText.className = 'missing-child-quick-report-label';
  labelText.textContent = label;
  if (required) {
    const marker = document.createElement('span');
    marker.className = 'missing-child-quick-report-required';
    marker.textContent = ' *';
    labelText.append(marker);
  }

  const input = document.createElement('input');
  input.className = 'missing-child-quick-report-input';
  input.type = 'text';
  input.name = name;
  input.value = value;
  if (required) input.required = true;
  if (autocomplete) input.autocomplete = autocomplete;

  field.append(labelText, input);
  return field;
}

function buildTextarea({
  label,
  name,
  required = false,
  rows = 4,
}) {
  const field = document.createElement('label');
  field.className = 'missing-child-quick-report-field';

  const labelText = document.createElement('span');
  labelText.className = 'missing-child-quick-report-label';
  labelText.textContent = label;
  if (required) {
    const marker = document.createElement('span');
    marker.className = 'missing-child-quick-report-required';
    marker.textContent = ' *';
    labelText.append(marker);
  }

  const textarea = document.createElement('textarea');
  textarea.className = 'missing-child-quick-report-textarea';
  textarea.name = name;
  textarea.rows = rows;
  if (required) textarea.required = true;

  field.append(labelText, textarea);
  return field;
}

function buildRunawayTrainField() {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'missing-child-quick-report-choice';

  const legend = document.createElement('legend');
  legend.className = 'missing-child-quick-report-label';
  legend.textContent = 'Is this report based on a child featured in a "Runaway Train" video?';
  fieldset.append(legend);

  const options = document.createElement('div');
  options.className = 'missing-child-quick-report-choice-options';

  [
    ['_u05baseonvideo_yes', 'Yes'],
    ['_u06baseonvideo_no', 'No'],
  ].forEach(([name, label]) => {
    const option = document.createElement('label');
    option.className = 'missing-child-quick-report-radio';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'baseonvideo';
    input.value = label;
    input.dataset.legacyName = name;

    const text = document.createElement('span');
    text.textContent = label;

    option.append(input, text);
    options.append(option);
  });

  fieldset.append(options);
  return fieldset;
}

function syncLegacyVideoFields(form) {
  const selected = form.querySelector('input[name="baseonvideo"]:checked')?.value || '';
  form.querySelector('input[name="_u05baseonvideo_yes"]').value = selected === 'Yes' ? 'Yes' : '';
  form.querySelector('input[name="_u06baseonvideo_no"]').value = selected === 'No' ? 'No' : '';
}

function buildPosterContext({ missingName, img, posterUrl }) {
  if (!missingName && !img && !posterUrl) return null;

  const context = document.createElement('aside');
  context.className = 'missing-child-quick-report-context';

  if (img) {
    const image = document.createElement('img');
    image.src = img;
    image.alt = missingName ? `Poster image for ${missingName}` : 'Missing child poster image';
    context.append(image);
  }

  const body = document.createElement('div');
  body.className = 'missing-child-quick-report-context-body';

  const label = document.createElement('p');
  label.className = 'missing-child-quick-report-context-label';
  label.textContent = 'Report connected to';
  body.append(label);

  if (missingName) {
    const name = document.createElement('p');
    name.className = 'missing-child-quick-report-context-name';
    name.textContent = missingName;
    body.append(name);
  }

  if (posterUrl) {
    const link = document.createElement('a');
    link.href = posterUrl;
    link.textContent = 'View poster';
    link.target = '_blank';
    link.rel = 'noopener';
    body.append(link);
  }

  context.append(body);
  return context;
}

function updateStatus(status, message, tone = 'info') {
  status.textContent = message;
  status.hidden = !message;
  status.classList.remove('is-info', 'is-success', 'is-error');
  if (message) status.classList.add(`is-${tone}`);
}

function bindSubmit(block, form, button, status, messages) {
  form.addEventListener('submit', (event) => {
    if (!form.reportValidity()) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    syncLegacyVideoFields(form);

    const iframe = document.createElement('iframe');
    iframe.name = makeId('missing-child-quick-report-submit');
    iframe.className = 'missing-child-quick-report-submit-frame';
    iframe.hidden = true;
    iframe.setAttribute('aria-hidden', 'true');
    form.after(iframe);

    form.target = iframe.name;
    button.disabled = true;
    block.classList.add('is-submitting');
    updateStatus(status, 'Submitting report...', 'info');

    let completed = false;
    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 1000);
      form.removeAttribute('target');
      button.disabled = false;
      block.classList.remove('is-submitting');
    };

    iframe.addEventListener('load', () => {
      if (completed) return;
      completed = true;
      form.reset();
      updateStatus(status, messages.success, 'success');
      cleanup();
    });

    window.setTimeout(() => {
      if (completed) return;
      completed = true;
      updateStatus(status, messages.error, 'error');
      cleanup();
    }, 15000);

    form.submit();
  });
}

export default function decorate(block) {
  const missingName = getQueryValue('missingName');
  const posterUrl = getQueryValue('posterUrl');
  const img = getQueryValue('img');
  const topPadding = normalizeLengthValue(getTextField(block, 'topPadding').value);
  if (topPadding) block.style.setProperty('--missing-child-quick-report-top-padding', topPadding);

  const action = getTextField(block, 'formAction').value || DEFAULTS.formAction;
  const successMessage = getTextField(block, 'successMessage').value || DEFAULTS.successMessage;
  const errorMessage = getTextField(block, 'errorMessage').value || DEFAULTS.errorMessage;

  const shell = document.createElement('div');
  shell.className = 'missing-child-quick-report-shell';

  const header = document.createElement('div');
  header.className = 'missing-child-quick-report-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'missing-child-quick-report-eyebrow';
  moveText(getTextField(block, 'eyebrow'), eyebrow, DEFAULTS.eyebrow);

  const heading = document.createElement('h2');
  heading.className = 'missing-child-quick-report-heading';
  moveText(getTextField(block, 'heading'), heading, DEFAULTS.heading);

  const intro = document.createElement('div');
  intro.className = 'missing-child-quick-report-intro';
  moveHtml(getRichField(block, 'intro'), intro, DEFAULTS.intro);

  header.append(eyebrow, heading, intro);

  const emergency = document.createElement('aside');
  emergency.className = 'missing-child-quick-report-emergency';

  const emergencyHeading = document.createElement('h3');
  emergencyHeading.className = 'missing-child-quick-report-emergency-heading';
  moveText(getTextField(block, 'emergencyHeading'), emergencyHeading, DEFAULTS.emergencyHeading);

  const emergencyCopy = document.createElement('div');
  emergencyCopy.className = 'missing-child-quick-report-emergency-copy';
  moveHtml(getRichField(block, 'emergencyCopy'), emergencyCopy, DEFAULTS.emergencyCopy);
  emergency.append(emergencyHeading, emergencyCopy);

  const form = document.createElement('form');
  form.className = 'missing-child-quick-report-form';
  form.method = 'post';
  form.action = action;

  const posterContext = buildPosterContext({ missingName, img, posterUrl });
  if (posterContext) form.append(posterContext);

  form.append(
    buildTextInput({
      label: 'Missing Child\'s Name',
      name: '_u00childname',
      value: missingName,
      required: true,
    }),
    buildTextInput({
      label: 'When',
      name: '_u01when',
      autocomplete: 'off',
    }),
    buildTextarea({
      label: 'Where (complete address if possible)',
      name: '_u02location',
      rows: 3,
    }),
    buildTextarea({
      label: 'Description and/or circumstances',
      name: '_u03description',
      rows: 5,
      required: true,
    }),
    buildTextarea({
      label: 'Your contact info (name, email, phone)',
      name: '_u04contactInfo',
      rows: 4,
    }),
    buildRunawayTrainField(),
  );

  appendHidden(form, 'action', DEFAULTS.action);
  appendHidden(form, 'fromAddress', DEFAULTS.fromAddress);
  appendHidden(form, 'mailtoAddress', DEFAULTS.mailtoAddress);
  appendHidden(form, 'subject', DEFAULTS.subject);
  appendHidden(form, 'formType', DEFAULTS.formType);
  appendHidden(form, '_s00_missingName', missingName);
  appendHidden(form, '_s00_posterUrl', posterUrl);
  appendHidden(form, '_u05baseonvideo_yes', '');
  appendHidden(form, '_u06baseonvideo_no', '');

  const actions = document.createElement('div');
  actions.className = 'missing-child-quick-report-actions';

  const status = document.createElement('p');
  status.className = 'missing-child-quick-report-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'missing-child-quick-report-submit';
  moveText(getTextField(block, 'buttonText'), button, DEFAULTS.buttonText);

  actions.append(status, button);
  form.append(actions);

  const callCenter = document.createElement('p');
  callCenter.className = 'missing-child-quick-report-call-center';
  callCenter.innerHTML = '<strong>NCMEC 24-Hour Call Center</strong><br><a href="tel:+18008435678">1-800-THE-LOST (1-800-843-5678)</a>';
  form.append(callCenter);

  shell.append(header, emergency, form);
  block.replaceChildren(shell);

  bindSubmit(block, form, button, status, {
    success: successMessage,
    error: errorMessage,
  });
}
