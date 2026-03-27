import { moveAttributes } from '../../scripts/scripts.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  fieldPlaceholders: 2,
  topicOptions: 3,
  buttonText: 4,
  formAction: 5,
  statusMessages: 6,
  backgroundColor: 7,
};

const LEGACY_ROW_INDEX = {
  fullNamePlaceholder: 2,
  emailPlaceholder: 3,
  phonePlaceholder: 4,
  topicPlaceholder: 5,
  topicOptions: 6,
  messagePlaceholder: 7,
  buttonText: 8,
  formAction: 9,
  successMessage: 10,
  errorMessage: 11,
  backgroundColor: 12,
};

const FIELD_KEYS = ['fullName', 'email', 'phone', 'topic', 'message'];
const MESSAGE_KEYS = ['success', 'error'];

const KEY_ALIASES = {
  fullname: 'fullName',
  name: 'fullName',
  email: 'email',
  phone: 'phone',
  topic: 'topic',
  message: 'message',
  success: 'success',
  error: 'error',
};

const DEFAULTS = {
  heading: 'General Inquiries',
  subheading:
    'For non-urgent inquiries, send us a message '
    + 'and we\'ll respond within 2 business days.',
  fullNamePlaceholder: 'Full Name',
  emailPlaceholder: 'Email Address',
  phonePlaceholder: 'Phone (optional)',
  topicPlaceholder: 'Topic',
  topicOptions: [
    { label: 'General Question', value: 'General Question' },
    { label: 'Partnership Opportunity', value: 'Partnership Opportunity' },
    { label: 'Media Inquiry', value: 'Media Inquiry' },
    { label: 'Technical Issue', value: 'Technical Issue' },
    { label: 'Other', value: 'Other' },
  ],
  messagePlaceholder: 'Message',
  buttonText: 'Send Message',
  successMessage:
    'Thank you. We received your inquiry '
    + 'and will respond within 2 business days.',
  errorMessage: 'We couldn\'t send your message. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function extractNodeValue(node) {
  if (!node) return '';
  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  return anchor?.href || node.textContent.trim();
}

function getField(block, name, rowIndexMap, columnIndex = 0) {
  const source = block.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  if (source) {
    return { source, value: extractNodeValue(source) };
  }

  const rowIndex = rowIndexMap?.[name];
  const row = Number.isInteger(rowIndex) ? block.children[rowIndex] : null;
  if (!row) return { source: null, value: '' };

  const cell = row.children[columnIndex] || row;
  return { source: cell, value: extractNodeValue(cell) };
}

function getFieldFromMaps(block, name, rowMaps, columnIndex = 0) {
  for (let i = 0; i < rowMaps.length; i += 1) {
    const field = getField(block, name, rowMaps[i], columnIndex);
    if (field.source || field.value) return field;
  }

  return { source: null, value: '' };
}

function moveFieldBinding(from, to) {
  if (!from || !to) return;

  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter(
        (attr) => attr.startsWith('data-aue-prop')
          || attr.startsWith('data-richtext-prop')
          || attr === 'data-aue-label'
          || attr.startsWith('data-richtext-'),
      ),
  );
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!target) return;

  if (!field?.source) {
    target.textContent = fallbackValue || '';
    return;
  }

  moveFieldBinding(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function normalizeAccessibleLabel(text, fallback) {
  return (text || fallback || '')
    .replace(/\s*\(optional\)\s*/i, '')
    .trim();
}

function normalizeEntryKey(rawKey, fallbackKey = '') {
  const normalized = String(rawKey || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  return KEY_ALIASES[normalized] || fallbackKey;
}

function parseNamedEntries(value, orderedKeys) {
  if (!value) return {};

  const normalized = value.replace(/\r/g, '');
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.reduce((entries, line, index) => {
    if (!line) return entries;

    let key = orderedKeys[index] || '';
    let text = line;

    if (line.includes('|')) {
      const [rawKey, rawValue] = line.split('|', 2).map((part) => part.trim());
      key = normalizeEntryKey(rawKey, key);
      text = rawValue;
    }

    if (key && text) {
      entries[key] = text;
    }

    return entries;
  }, {});
}

function parseOptions(value) {
  if (!value) return [];

  const normalized = value.replace(/\r/g, '');
  const delimiter = normalized.includes('\n') ? /\n+/ : /;+/;
  return normalized
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [labelPart, valuePart] = entry.includes('|')
        ? entry.split('|', 2).map((part) => part.trim())
        : [entry, entry];

      return {
        label: labelPart || valuePart || '',
        value: valuePart || labelPart || '',
      };
    })
    .filter((entry) => entry.label && entry.value);
}

function createLabelShell(accessibleLabel) {
  const label = document.createElement('label');
  label.className = 'general-inquiries-field';

  const srLabel = document.createElement('span');
  srLabel.className = 'general-inquiries-sr-only';
  srLabel.textContent = accessibleLabel;
  label.append(srLabel);

  return label;
}

function buildInputField(field, config) {
  const placeholder = field.value || config.placeholder;
  const accessibleLabel = normalizeAccessibleLabel(placeholder, config.label);
  const label = createLabelShell(accessibleLabel);
  const input = document.createElement('input');

  input.className = 'general-inquiries-input';
  input.type = config.type || 'text';
  input.name = config.name;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', accessibleLabel);
  if (config.autocomplete) input.autocomplete = config.autocomplete;
  if (config.inputMode) input.inputMode = config.inputMode;
  if (config.required) input.required = true;

  moveFieldBinding(field.source, input);
  label.append(input);

  return label;
}

function buildTextareaField(field, config) {
  const placeholder = field.value || config.placeholder;
  const accessibleLabel = normalizeAccessibleLabel(placeholder, config.label);
  const label = createLabelShell(accessibleLabel);
  const textarea = document.createElement('textarea');

  textarea.className = 'general-inquiries-textarea';
  textarea.name = config.name;
  textarea.placeholder = placeholder;
  textarea.rows = config.rows || 6;
  textarea.setAttribute('aria-label', accessibleLabel);
  if (config.required) textarea.required = true;

  moveFieldBinding(field.source, textarea);
  label.append(textarea);

  return label;
}

function buildSelectField(placeholderField, optionsField, isAuthoring) {
  const placeholder = placeholderField.value || DEFAULTS.topicPlaceholder;
  const accessibleLabel = normalizeAccessibleLabel(placeholder, 'Topic');
  const label = createLabelShell(accessibleLabel);
  const select = document.createElement('select');
  const parsedOptions = parseOptions(optionsField.value);
  const optionEntries = parsedOptions.length ? parsedOptions : DEFAULTS.topicOptions;

  select.className = 'general-inquiries-select';
  select.name = 'topic';
  select.required = true;
  select.setAttribute('aria-label', accessibleLabel);

  const placeholderOption = document.createElement('option');
  placeholderOption.textContent = placeholder;
  placeholderOption.value = '';
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  select.append(placeholderOption);

  optionEntries.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    select.append(option);
  });

  if (!parsedOptions.length && isAuthoring && optionsField.source && !optionsField.value) {
    const helperOption = document.createElement('option');
    helperOption.value = '__missing-options__';
    helperOption.textContent = 'Add topic options in Universal Editor';
    helperOption.disabled = true;
    select.append(helperOption);
  }

  moveFieldBinding(placeholderField.source, select);
  label.append(select);

  return label;
}

function buildPlaceholderFields(block) {
  const combinedField = getField(block, 'fieldPlaceholders', BLOCK_ROW_INDEX);
  const combinedValues = parseNamedEntries(combinedField.value, FIELD_KEYS);

  if (combinedField.source || combinedField.value) {
    return {
      fullName: {
        source: null,
        value: combinedValues.fullName || DEFAULTS.fullNamePlaceholder,
      },
      email: {
        source: null,
        value: combinedValues.email || DEFAULTS.emailPlaceholder,
      },
      phone: {
        source: null,
        value: combinedValues.phone || DEFAULTS.phonePlaceholder,
      },
      topic: {
        source: null,
        value: combinedValues.topic || DEFAULTS.topicPlaceholder,
      },
      message: {
        source: null,
        value: combinedValues.message || DEFAULTS.messagePlaceholder,
      },
    };
  }

  return {
    fullName: getField(block, 'fullNamePlaceholder', LEGACY_ROW_INDEX),
    email: getField(block, 'emailPlaceholder', LEGACY_ROW_INDEX),
    phone: getField(block, 'phonePlaceholder', LEGACY_ROW_INDEX),
    topic: getField(block, 'topicPlaceholder', LEGACY_ROW_INDEX),
    message: getField(block, 'messagePlaceholder', LEGACY_ROW_INDEX),
  };
}

function buildStatusMessages(block) {
  const combinedField = getField(block, 'statusMessages', BLOCK_ROW_INDEX);
  const combinedValues = parseNamedEntries(combinedField.value, MESSAGE_KEYS);

  if (combinedField.source || combinedField.value) {
    return {
      success: combinedValues.success || DEFAULTS.successMessage,
      error: combinedValues.error || DEFAULTS.errorMessage,
    };
  }

  const successField = getField(block, 'successMessage', LEGACY_ROW_INDEX);
  const errorField = getField(block, 'errorMessage', LEGACY_ROW_INDEX);

  return {
    success: successField.value || DEFAULTS.successMessage,
    error: errorField.value || DEFAULTS.errorMessage,
  };
}

function setStatus(status, message, tone = 'info') {
  status.textContent = message;
  status.hidden = !message;
  status.classList.remove('is-info', 'is-success', 'is-error');
  if (message) status.classList.add(`is-${tone}`);
}

async function extractResponseMessage(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return '';

  try {
    const data = await response.json();
    return typeof data?.message === 'string' ? data.message.trim() : '';
  } catch {
    return '';
  }
}

function bindSubmit(block, form, submitButton, status, config) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;

    const formData = new FormData(form);
    formData.append('formId', 'general-inquiries');

    block.dispatchEvent(
      new CustomEvent('general-inquiries:submit', {
        bubbles: true,
        detail: Object.fromEntries(formData.entries()),
      }),
    );

    if (!config.action) {
      const message = config.isAuthoring
        ? DEFAULTS.missingEndpointAuthorMessage
        : DEFAULTS.missingEndpointMessage;
      setStatus(status, message, 'info');
      return;
    }

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    setStatus(status, '', 'info');

    try {
      const response = await fetch(config.action, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
      });
      const responseMessage = await extractResponseMessage(response);

      if (!response.ok) {
        throw new Error(responseMessage || config.errorMessage);
      }

      form.reset();
      setStatus(status, responseMessage || config.successMessage, 'success');
    } catch (error) {
      const message = error instanceof Error
        && error.message
        && error.message !== 'Failed to fetch'
        ? error.message
        : config.errorMessage;
      setStatus(status, message, 'error');
    } finally {
      submitButton.disabled = false;
      block.classList.remove('is-submitting');
    }
  });
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const placeholderFields = buildPlaceholderFields(block);
  const messages = buildStatusMessages(block);

  const headingField = getField(block, 'heading', BLOCK_ROW_INDEX);
  const subheadingField = getField(block, 'subheading', BLOCK_ROW_INDEX);
  const topicOptionsField = getFieldFromMaps(
    block,
    'topicOptions',
    [BLOCK_ROW_INDEX, LEGACY_ROW_INDEX],
  );
  const buttonTextField = getFieldFromMaps(
    block,
    'buttonText',
    [BLOCK_ROW_INDEX, LEGACY_ROW_INDEX],
  );
  const formActionField = getFieldFromMaps(
    block,
    'formAction',
    [BLOCK_ROW_INDEX, LEGACY_ROW_INDEX],
  );
  const backgroundColorField = getFieldFromMaps(
    block,
    'backgroundColor',
    [BLOCK_ROW_INDEX, LEGACY_ROW_INDEX],
  );

  const shell = document.createElement('div');
  shell.className = 'general-inquiries-shell';

  const copy = document.createElement('div');
  copy.className = 'general-inquiries-copy';

  const heading = document.createElement('h2');
  heading.className = 'general-inquiries-heading';
  moveFieldContent(headingField, heading, DEFAULTS.heading);
  copy.append(heading);

  const subheading = document.createElement('p');
  subheading.className = 'general-inquiries-subheading';
  moveFieldContent(subheadingField, subheading, DEFAULTS.subheading);
  copy.append(subheading);

  const form = document.createElement('form');
  form.className = 'general-inquiries-form';

  form.append(
    buildInputField(placeholderFields.fullName, {
      name: 'fullName',
      placeholder: DEFAULTS.fullNamePlaceholder,
      label: 'Full Name',
      autocomplete: 'name',
      required: true,
    }),
    buildInputField(placeholderFields.email, {
      name: 'email',
      placeholder: DEFAULTS.emailPlaceholder,
      label: 'Email Address',
      type: 'email',
      autocomplete: 'email',
      inputMode: 'email',
      required: true,
    }),
    buildInputField(placeholderFields.phone, {
      name: 'phone',
      placeholder: DEFAULTS.phonePlaceholder,
      label: 'Phone',
      type: 'tel',
      autocomplete: 'tel',
      inputMode: 'tel',
    }),
    buildSelectField(placeholderFields.topic, topicOptionsField, isAuthoring),
    buildTextareaField(placeholderFields.message, {
      name: 'message',
      placeholder: DEFAULTS.messagePlaceholder,
      label: 'Message',
      rows: 6,
      required: true,
    }),
  );

  const actions = document.createElement('div');
  actions.className = 'general-inquiries-actions';

  const status = document.createElement('p');
  status.className = 'general-inquiries-status';
  status.hidden = true;
  status.setAttribute('aria-live', 'polite');
  actions.append(status);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'general-inquiries-submit';
  moveFieldContent(buttonTextField, submitButton, DEFAULTS.buttonText);
  actions.append(submitButton);

  form.append(actions);
  shell.append(copy, form);

  if (backgroundColorField.value) {
    block.style.setProperty(
      '--general-inquiries-surface',
      backgroundColorField.value,
    );
  }

  block.replaceChildren(shell);

  bindSubmit(block, form, submitButton, status, {
    action: formActionField.value,
    successMessage: messages.success,
    errorMessage: messages.error,
    isAuthoring,
  });
}
