import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  appendFormMetadata,
  applyPhoneValidation,
  createFormSession,
  extractApiMessage,
  isFormValid,
  resolveFormAction,
  updateFormStatus,
} from '../../scripts/form-utils.js';
import { moveAttributes } from '../../scripts/scripts.js';

const resourceDataCache = new Map();

const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  fieldPlaceholders: 2,
  topicOptions: 3,
  buttonText: 4,
  formAction: 5,
  statusMessages: 6,
  backgroundColor: 7,
  hero_style: 8,
  hero_heading: 9,
  hero_subheading: 10,
  hero_buttonText: 11,
  hero_buttonLink: 12,
  hero_backgroundImage: 13,
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
  heroStyle: 'default',
  heroHeading: 'You don\'t have to face this alone.',
  heroSubheading: 'Team HOPE is here to listen, support, and walk alongside you.',
  heroButtonText: '866-305-HOPE (4673)',
  heroButtonLink: 'tel:+18663054673',
};

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

function normalizeJsonFieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.href || value.path || value.url || value.src || '').trim();
  }
  return '';
}

async function getBlockResourceData(block) {
  const resource = block.getAttribute('data-aue-resource')
    || block.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return {};

  if (resourceDataCache.has(resourcePath)) {
    return resourceDataCache.get(resourcePath);
  }

  const pendingData = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return {};
      return response.json();
    })
    .catch(() => ({}));

  resourceDataCache.set(resourcePath, pendingData);
  return pendingData;
}

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

function getImageField(block, name, rowIndexMap) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  const rowIndex = rowIndexMap?.[name];
  const row = Number.isInteger(rowIndex) ? block.children[rowIndex] : null;
  const container = source || row;
  const picture = source?.closest('picture')
    || source?.querySelector('picture')
    || row?.querySelector('picture')
    || null;
  const img = picture?.querySelector('img') || container?.querySelector('img') || null;

  return {
    source: source || row,
    picture,
    img,
    reference: extractNodeValue(source || row),
  };
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

function moveImageContent(field, target, fallbackSrc = '') {
  if (!target) return false;

  moveFieldBinding(field?.source || field?.picture, target);

  let picture = field?.picture || null;
  if (!picture && fallbackSrc) {
    picture = createOptimizedPicture(fallbackSrc, '', false, [{ width: '1600' }]);
  }

  if (!picture) return false;

  const image = picture.querySelector('img') || field?.img;
  if (image) image.alt = '';
  target.setAttribute('aria-hidden', 'true');
  target.append(picture);
  return true;
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

function bindSubmit(block, form, submitButton, status, config, formSession) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!isFormValid(form)) return;

    const formData = new FormData(form);
    appendFormMetadata(formData, formSession);

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
      updateFormStatus(status, message, 'info');
      return;
    }

    submitButton.disabled = true;
    block.classList.add('is-submitting');
    updateFormStatus(status, '', 'info');

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

function buildSupportIntro(
  heroHeadingField,
  heroSubheadingField,
  heroButtonTextField,
  heroButtonLinkField,
) {
  const support = document.createElement('div');
  support.className = 'general-inquiries-support';

  const heading = document.createElement('p');
  heading.className = 'general-inquiries-support-heading';
  moveFieldContent(heroHeadingField, heading, DEFAULTS.heroHeading);
  support.append(heading);

  const subheading = document.createElement('p');
  subheading.className = 'general-inquiries-support-subheading';
  moveFieldContent(heroSubheadingField, subheading, DEFAULTS.heroSubheading);
  support.append(subheading);

  const ctaHref = heroButtonLinkField.value || DEFAULTS.heroButtonLink;
  const cta = document.createElement(ctaHref ? 'a' : 'div');
  cta.className = 'general-inquiries-support-cta';
  if (ctaHref) cta.href = ctaHref;
  if (heroButtonLinkField.source) moveFieldBinding(heroButtonLinkField.source, cta);

  const label = document.createElement('span');
  label.className = 'general-inquiries-support-cta-label';
  moveFieldContent(heroButtonTextField, label, DEFAULTS.heroButtonText);
  cta.append(label);

  support.append(cta);

  return support;
}

export default async function decorate(block) {
  const resourceData = await getBlockResourceData(block);
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
  const heroStyleField = getField(block, 'hero_style', BLOCK_ROW_INDEX);
  const heroHeadingField = getField(block, 'hero_heading', BLOCK_ROW_INDEX);
  const heroSubheadingField = getField(block, 'hero_subheading', BLOCK_ROW_INDEX);
  const heroButtonTextField = getField(block, 'hero_buttonText', BLOCK_ROW_INDEX);
  const heroButtonLinkField = getField(block, 'hero_buttonLink', BLOCK_ROW_INDEX);
  const heroBackgroundImageField = getImageField(block, 'hero_backgroundImage', BLOCK_ROW_INDEX);

  const heroStyle = heroStyleField.value
    || normalizeJsonFieldValue(resourceData.hero_style)
    || DEFAULTS.heroStyle;
  const heroBackgroundImageSrc = normalizeJsonFieldValue(resourceData.hero_backgroundImage)
    || heroBackgroundImageField.reference;
  const isSupportMode = heroStyle === 'support';

  block.classList.toggle('general-inquiries-support-mode', isSupportMode);

  const shell = document.createElement('div');
  shell.className = 'general-inquiries-shell';

  if (isSupportMode) {
    const backdrop = document.createElement('div');
    backdrop.className = 'general-inquiries-backdrop';
    if (moveImageContent(heroBackgroundImageField, backdrop, heroBackgroundImageSrc)) {
      shell.append(backdrop);
    }

    shell.append(
      buildSupportIntro(
        heroHeadingField,
        heroSubheadingField,
        heroButtonTextField,
        heroButtonLinkField,
      ),
    );
  }

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

  const formSession = createFormSession(form, 'general-inquiries');
  applyPhoneValidation(form.querySelector('[name="phone"]'));

  shell.append(copy, form);

  if (backgroundColorField.value) {
    block.style.setProperty(
      '--general-inquiries-surface',
      backgroundColorField.value,
    );
  }

  block.replaceChildren(shell);

  bindSubmit(block, form, submitButton, status, {
    action: resolveFormAction('general-inquiries', formActionField.value),
    successMessage: messages.success,
    errorMessage: messages.error,
    isAuthoring,
  }, formSession);
}
