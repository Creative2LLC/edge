export const PHONE_PATTERN = '^[+]?[0-9().\\\\s-]{7,25}$';

export const DEFAULT_FORM_ENDPOINTS = {
  'general-inquiries': 'https://stunning-dust-ntqeawud3dqy.on-vapor.com/api/general-inquiries',
  newsletter: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com/api/newsletter-subscriptions',
};

function countPhoneDigits(value) {
  return String(value || '').replace(/\D/g, '').length;
}

function createHoneypot(name) {
  const honeypot = document.createElement('input');
  honeypot.type = 'text';
  honeypot.name = name;
  honeypot.autocomplete = 'off';
  honeypot.tabIndex = -1;
  honeypot.setAttribute('aria-hidden', 'true');
  honeypot.className = 'form-honeypot';
  honeypot.style.position = 'absolute';
  honeypot.style.left = '-10000px';
  honeypot.style.width = '1px';
  honeypot.style.height = '1px';
  honeypot.style.opacity = '0';
  return honeypot;
}

function isLocalDevelopmentHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

export function createFormSession(form, formId) {
  const honeypots = [
    createHoneypot('company'),
    createHoneypot('website'),
  ];
  form.append(...honeypots);

  return {
    formId,
    startedAt: Date.now(),
    reset() {
      this.startedAt = Date.now();
      honeypots.forEach((honeypot) => {
        honeypot.value = '';
      });
    },
  };
}

export function appendFormMetadata(formData, formSession) {
  formData.set('formId', formSession.formId);
  formData.set('submittedAt', String(formSession.startedAt));

  if (window.location?.href) formData.set('pageUrl', window.location.href);
  if (window.location?.pathname) formData.set('pagePath', window.location.pathname);
}

export async function extractApiMessage(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return '';

  try {
    const data = await response.json();
    const validationMessage = Object.values(data?.errors || {})
      .flat()
      .find((entry) => typeof entry === 'string' && entry.trim());

    if (validationMessage) return validationMessage.trim();
    return typeof data?.message === 'string' ? data.message.trim() : '';
  } catch {
    return '';
  }
}

export function updateFormStatus(status, message, tone = 'info') {
  if (!status) return;

  status.textContent = message;
  status.hidden = !message;
  status.classList.remove('is-info', 'is-success', 'is-error');
  if (message) status.classList.add(`is-${tone}`);
}

export function isFormValid(form) {
  if (!form) return false;
  if (typeof form.reportValidity === 'function') return form.reportValidity();
  return form.checkValidity();
}

export function applyPhoneValidation(input) {
  if (!input) return;

  input.pattern = PHONE_PATTERN;
  input.title = 'Enter a valid phone number.';

  const validate = () => {
    const value = input.value.trim();
    if (!value) {
      input.setCustomValidity('');
      return;
    }

    const digitCount = countPhoneDigits(value);
    const isValid = new RegExp(PHONE_PATTERN).test(value) && digitCount >= 7 && digitCount <= 15;
    input.setCustomValidity(isValid ? '' : 'Enter a valid phone number.');
  };

  input.addEventListener('input', validate);
  input.addEventListener('blur', validate);
  validate();
}

export function normalizeFormAction(action) {
  const raw = String(action || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (
      window.location.protocol === 'https:'
      && url.protocol !== 'https:'
      && !isLocalDevelopmentHost(url.hostname)
    ) return '';

    return raw.startsWith('/') && !raw.startsWith('//')
      ? `${url.pathname}${url.search}${url.hash}`
      : url.href;
  } catch {
    return '';
  }
}

export function resolveFormAction(formId, authoredAction = '') {
  const action = String(authoredAction || '').trim();
  return normalizeFormAction(action || DEFAULT_FORM_ENDPOINTS[formId] || '');
}
