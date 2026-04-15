import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  appendFormMetadata,
  createFormSession,
  extractApiMessage,
  isFormValid,
  resolveFormAction,
  updateFormStatus,
} from '../../scripts/form-utils.js';
import { moveAttributes } from '../../scripts/scripts.js';

const LEGACY_LABELS = {
  heading: ['heading', 'title'],
  subheading: ['subheading', 'subtitle', 'description'],
  placeholder: ['placeholder', 'select placeholder'],
  options: ['options', 'newsletter options'],
  buttonText: ['button text', 'button', 'cta text', 'cta label'],
  formAction: ['form action', 'submit endpoint url', 'submit url', 'action'],
  statusMessages: ['status messages'],
  successMessage: ['success message'],
  errorMessage: ['error message'],
  target: ['target', 'open links in'],
};

const MESSAGE_KEYS = ['success', 'error'];

const DEFAULTS = {
  placeholder: 'Enter your email',
  buttonText: 'Join',
  successMessage: 'Thank you. You have been added to the newsletter list.',
  errorMessage: 'We couldn\'t add your email. Please try again.',
  missingEndpointMessage: 'This form is not connected yet.',
  missingEndpointAuthorMessage: 'Add a submit endpoint URL to enable this form.',
};

function collectLegacyFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(LEGACY_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      map[name] = { source: valueEl, value: valueEl.textContent.trim() };
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getField(block, legacyMap, nameOrNames) {
  const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const source = block.querySelector(`[data-aue-prop="${name}"]`);
    if (source) {
      return { source, value: source.textContent.trim() };
    }
  }
  const legacyName = names.find((name) => legacyMap[name]);
  return legacyName ? legacyMap[legacyName] : { source: null, value: '' };
}

function moveFieldBinding(from, to) {
  if (!from || !to) return;
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-prop')
        || attr.startsWith('data-richtext-prop')
        || attr === 'data-aue-label'
        || attr.startsWith('data-richtext-')),
  );
}

function buildTextElement(tag, className, field) {
  if (!field?.value && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveFieldBinding(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else {
    el.textContent = field.value;
  }
  return el;
}

function parseOptions(value) {
  if (!value) return [];
  const normalized = value.replace(/\r/g, '');
  const delimiter = normalized.includes('\n') ? /\n+/ : /;+/;
  const lines = normalized.split(delimiter).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const [labelPart, urlPart] = line.includes('|')
      ? line.split('|', 2).map((part) => part.trim())
      : [line, line];
    return {
      label: labelPart || urlPart || '',
      url: urlPart || labelPart || '',
    };
  }).filter((option) => option.url);
}

function navigateTo(url, target) {
  if (!url) return;
  if (target === '_blank') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.assign(url);
}

function buildBackground(block) {
  const imageField = block.querySelector('[data-aue-prop="media_image"]')
    || block.querySelector('[data-aue-prop="image"]');
  const imageAltField = block.querySelector('[data-aue-prop="media_imageAlt"]')
    || block.querySelector('[data-aue-prop="imageAlt"]');
  const picture = imageField?.querySelector('picture') || block.querySelector('picture');
  const img = picture?.querySelector('img');
  if (!img) return null;
  const alt = imageAltField?.textContent?.trim() || img.alt || '';
  const optimized = createOptimizedPicture(img.src, alt, false, [
    { media: '(min-width: 900px)', width: '1800' },
    { media: '(min-width: 600px)', width: '1200' },
    { width: '900' },
  ]);
  const target = optimized.querySelector('img') || optimized;
  moveFieldBinding(imageField, target);
  moveFieldBinding(imageAltField, target);
  imageField?.remove();
  imageAltField?.remove();
  return optimized;
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function normalizeEntryKey(rawKey, fallbackKey = '') {
  const normalized = String(rawKey || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (normalized === 'success') return 'success';
  if (normalized === 'error' || normalized === 'failure') return 'error';
  return fallbackKey;
}

function parseNamedEntries(value, orderedKeys) {
  if (!value) return {};

  const normalized = value.replace(/\r/g, '');
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.reduce((entries, line, index) => {
    let key = orderedKeys[index] || '';
    let text = line;

    if (line.includes('|')) {
      const [rawKey, rawValue] = line.split('|', 2).map((part) => part.trim());
      key = normalizeEntryKey(rawKey, key);
      text = rawValue;
    }

    if (key && text) entries[key] = text;
    return entries;
  }, {});
}

function buildStatusMessages(statusField, legacyMap) {
  const combinedValues = parseNamedEntries(statusField.value, MESSAGE_KEYS);
  if (statusField.source || statusField.value) {
    return {
      success: combinedValues.success || DEFAULTS.successMessage,
      error: combinedValues.error || DEFAULTS.errorMessage,
    };
  }

  return {
    success: legacyMap.successMessage?.value || DEFAULTS.successMessage,
    error: legacyMap.errorMessage?.value || DEFAULTS.errorMessage,
  };
}

function bindInputSubmit(block, form, submitButton, status, config) {
  const formSession = createFormSession(form, 'newsletter');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!isFormValid(form)) return;

    const formData = new FormData(form);
    appendFormMetadata(formData, formSession);

    block.dispatchEvent(
      new CustomEvent('newsletter:submit', {
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
  const legacyMap = collectLegacyFields(block);
  const isAuthoring = hasAuthoringContext(block);
  const headingField = getField(block, legacyMap, ['content_heading', 'heading']);
  const subheadingField = getField(block, legacyMap, ['content_subheading', 'subheading']);
  const formTypeField = getField(block, legacyMap, ['form_type']);
  const placeholderField = getField(block, legacyMap, ['form_placeholder', 'placeholder']);
  const optionsField = getField(block, legacyMap, ['form_options', 'options']);
  const buttonTextField = getField(block, legacyMap, ['form_buttonText', 'buttonText']);
  const formActionField = getField(block, legacyMap, ['formAction', 'form_action']);
  const statusMessagesField = getField(block, legacyMap, ['statusMessages', 'status_messages']);
  const targetField = getField(block, legacyMap, ['form_target', 'target']);
  const background = buildBackground(block);

  const messages = buildStatusMessages(statusMessagesField, legacyMap);
  const formType = formTypeField.value || 'dropdown';
  if (formTypeField.source) formTypeField.source.remove();
  const target = targetField.value === '_blank' ? '_blank' : '_self';
  if (targetField.source) targetField.source.remove();
  if (formActionField.source) formActionField.source.remove();
  if (statusMessagesField.source) statusMessagesField.source.remove();
  if (legacyMap.successMessage?.source) legacyMap.successMessage.source.remove();
  if (legacyMap.errorMessage?.source) legacyMap.errorMessage.source.remove();

  const content = document.createElement('div');
  content.className = 'newsletter-content';

  const heading = buildTextElement('h2', 'newsletter-heading', headingField);
  if (heading) content.append(heading);

  const subheading = buildTextElement('p', 'newsletter-subheading', subheadingField);
  if (subheading) content.append(subheading);

  const options = parseOptions(optionsField.value);
  if (optionsField.source) optionsField.source.remove();
  const placeholder = placeholderField.value
    || (formType === 'input' ? DEFAULTS.placeholder : 'Select a Newsletter');
  if (placeholderField.source) placeholderField.source.remove();
  const buttonText = buttonTextField.value || DEFAULTS.buttonText;

  if (formType === 'input') {
    const form = document.createElement('form');
    form.className = 'newsletter-form';

    const inputWrap = document.createElement('div');
    inputWrap.className = 'newsletter-input-wrap';

    const input = document.createElement('input');
    input.type = 'email';
    input.name = 'email';
    input.required = true;
    input.autocomplete = 'email';
    input.inputMode = 'email';
    input.className = 'newsletter-input';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'newsletter-send-icon';
    submit.setAttribute('aria-label', buttonText || 'Send');

    const sendImg = document.createElement('img');
    sendImg.src = `${window.hlx.codeBasePath}/icons/send.svg`;
    sendImg.alt = '';
    sendImg.className = 'newsletter-send-img';
    sendImg.setAttribute('aria-hidden', 'true');
    submit.append(sendImg);

    moveFieldBinding(buttonTextField.source, submit);
    if (buttonTextField.source) buttonTextField.source.remove();

    inputWrap.append(input, submit);
    form.append(inputWrap);

    const status = document.createElement('p');
    status.className = 'newsletter-status';
    status.hidden = true;
    status.setAttribute('aria-live', 'polite');
    form.append(status);

    bindInputSubmit(block, form, submit, status, {
      action: resolveFormAction('newsletter', formActionField.value),
      successMessage: messages.success,
      errorMessage: messages.error,
      isAuthoring,
    });

    content.append(form);
  } else if (options.length) {
    const form = document.createElement('form');
    form.className = 'newsletter-form';

    const selectWrap = document.createElement('div');
    selectWrap.className = 'newsletter-select-wrap';

    const select = document.createElement('select');
    select.className = 'newsletter-select';
    select.setAttribute('aria-label', placeholder);

    const defaultOption = document.createElement('option');
    defaultOption.textContent = placeholder;
    defaultOption.value = '';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.append(defaultOption);

    options.forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.textContent = option.label;
      optionEl.value = option.url;
      select.append(optionEl);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      navigateTo(select.value, target);
    });

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'newsletter-submit';
    submit.textContent = buttonText;
    moveFieldBinding(buttonTextField.source, submit);
    if (buttonTextField.source) buttonTextField.source.remove();

    selectWrap.append(select);
    form.append(selectWrap, submit);
    content.append(form);
  } else if (buttonTextField.source) {
    buttonTextField.source.remove();
  }

  const children = [];
  if (background) {
    const media = document.createElement('div');
    media.className = 'newsletter-media';
    media.append(background);
    children.push(media);
  }
  children.push(content);

  block.replaceChildren(...children);
}
