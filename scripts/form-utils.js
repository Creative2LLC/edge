/*
 * Kept in step with the phone rule in the backend's config/forms.php.
 *
 * The escaping matters: this string is assigned to an <input pattern> as well
 * as passed to new RegExp(). It previously read '\\\\s', which reaches the
 * regex as an escaped backslash plus a literal "s" — so spaces were rejected
 * (the backend accepts them) and Chrome discarded the pattern attribute as an
 * invalid expression, turning off client-side phone validation entirely.
 */
export const PHONE_PATTERN = '^[+]?[0-9().\\s-]{7,25}$';

const API_ORIGIN = 'https://stunning-dust-ntqeawud3dqy.on-vapor.com';

/*
 * These five forms predate the generic endpoint and each has its own table,
 * controller and admin screen in the backend. They keep their own paths.
 */
const DEDICATED_FORM_ENDPOINTS = {
  'general-inquiries': `${API_ORIGIN}/api/general-inquiries`,
  newsletter: `${API_ORIGIN}/api/newsletter-subscriptions`,
  'resource-registration': `${API_ORIGIN}/api/resource-registrations`,
  'resource-download': `${API_ORIGIN}/api/resource-downloads`,
  'missing-child-poster-api-registration': `${API_ORIGIN}/api/poster-api-registrations`,
};

/*
 * Everything else posts to /api/forms/<form id>, which validates against the
 * matching entry in the backend's config/forms.php. The ids here ARE those
 * config keys, so adding a form means adding it in both places.
 */
const GENERIC_FORM_IDS = [
  'apply-for-training',
  'code-adam-kit',
  'community-education-partner-reporting',
  'event-request-form',
  'faon-application',
  'host-a-fundraiser',
  'missing-child-quick-report',
  'ncmec-reprint-request',
  'prpl-application',
  'team-hope-volunteer',
];

export const DEFAULT_FORM_ENDPOINTS = {
  ...DEDICATED_FORM_ENDPOINTS,
  ...Object.fromEntries(GENERIC_FORM_IDS.map((id) => [id, `${API_ORIGIN}/api/forms/${id}`])),
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
