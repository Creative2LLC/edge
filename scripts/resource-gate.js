/*
 * Shared gating layer for resource downloads.
 * Gated links render "Locked" until the visitor completes a one-time
 * registration (cached in localStorage for ~6 months), then unlock across
 * every block on the page. Each download fires a GA4 event and a backend
 * download record; registrations POST to /api/resource-registrations.
 */

import { loadCSS } from './aem.js';
import { trackEvent } from './analytics.js';
import {
  appendFormMetadata,
  createFormSession,
  extractApiMessage,
  isFormValid,
  resolveFormAction,
  updateFormStatus,
} from './form-utils.js';

const STORAGE_KEY = 'ncmec.resourceRegistration.v1';
const REGISTRATION_TTL_MS = 183 * 24 * 60 * 60 * 1000; // ~6 months
const REGISTERED_EVENT = 'ncmec:resource-gate:registered';
// Server-signed proof of registration, sent when requesting presigned URLs
// for gated S3 files. Name must match the backend ResourceGateToken::HEADER.
const GATE_TOKEN_HEADER = 'X-Resource-Gate';

// Values must match the backend ResourceAudience enum.
const AUDIENCE_OPTIONS = [
  ['families', 'Families'],
  ['law-enforcement', 'Law Enforcement'],
  ['educators', 'Educators'],
  ['child-welfare-professionals', 'Child Welfare Professionals'],
  ['mental-health-professionals', 'Mental Health Professionals'],
  ['legal-professionals', 'Legal Professionals'],
  ['electronic-service-providers', 'Electronic Service Providers'],
  ['policymakers', 'Policymakers'],
  ['media', 'Media'],
  ['native-indigenous-tribal', 'Native, Indigenous & Tribal'],
  ['teens-13-plus', 'Teens (13+)'],
  ['children-up-to-12', 'Children (up to 12)'],
];

const HONORIFIC_OPTIONS = ['Mr.', 'Mrs.', 'Ms.', 'Mx.', 'Dr.', 'Sgt.', 'Det.', 'Officer', 'Chief', 'Prof.'];

let stylesLoaded = false;
let modal = null;

function ensureStyles() {
  if (stylesLoaded) return;
  stylesLoaded = true;
  loadCSS(`${window.hlx?.codeBasePath || ''}/styles/resource-gate.css`);
}

function clearRegistration() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — storage unavailable.
  }
}

function readRegistration() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.registeredAt) return null;

    if (Date.now() - Number(data.registeredAt) > REGISTRATION_TTL_MS) {
      clearRegistration();
      return null;
    }

    // v2 records carry the server gate token; older records (or ones whose
    // token has lapsed) count as unregistered so the visitor re-registers
    // and receives a fresh token.
    if (Number(data.version) >= 2) {
      const tokenExpiry = Date.parse(data.gateTokenExpiresAt || '') || 0;
      if (!data.gateToken || tokenExpiry <= Date.now()) {
        clearRegistration();
        return null;
      }
    }

    return data;
  } catch {
    return null;
  }
}

function writeRegistration(entry) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Storage unavailable — the visitor will simply be asked again.
  }
}

export function getRegistration() {
  return readRegistration();
}

export function isRegistered() {
  return readRegistration() !== null;
}

export function getGateToken() {
  return readRegistration()?.gateToken || '';
}

/**
 * Ask the backend for the real download URL of an S3-backed file (presigned,
 * ~1 hour) via its /download-url endpoint. Returns the URL or null. A 401
 * means the stored token is no longer valid — the cached registration is
 * cleared so the next click re-opens the registration modal.
 */
export async function fetchSignedUrl(endpoint) {
  if (!endpoint) return null;

  try {
    const headers = { Accept: 'application/json' };
    const token = getGateToken();
    if (token) headers[GATE_TOKEN_HEADER] = token;

    const response = await fetch(endpoint, { headers });
    if (response.status === 401) {
      clearRegistration();
      return null;
    }
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    return payload?.data?.url || null;
  } catch {
    return null;
  }
}

function fileExtension(value) {
  const clean = String(value || '').split(/[?#]/)[0];
  const segment = clean.split('/').pop() || '';
  return segment.includes('.') ? segment.split('.').pop().toLowerCase() : '';
}

/**
 * Record a download: GA4 event (no PII) + backend event tied to the cached
 * registration email when present. Fire-and-forget.
 */
export function recordDownload({
  resourceSlug = '',
  fileUrl = '',
  fileName = '',
  gated = false,
} = {}) {
  const name = fileName || (String(fileUrl).split(/[?#]/)[0].split('/').pop() || '');

  trackEvent('resource_download', {
    resource_slug: resourceSlug,
    file_name: name,
    file_extension: fileExtension(name || fileUrl),
    gated: gated ? 'true' : 'false',
  });

  const action = resolveFormAction('resource-download');
  if (!action || !fileUrl) return;

  const formData = new FormData();
  formData.set('formId', 'resource-download');
  // No interactive form session exists for a click; use page load time so
  // the backend's minimum-age spam check passes.
  formData.set('submittedAt', String(Math.round(window.performance?.timeOrigin || (Date.now() - 5000))));
  formData.set('fileUrl', fileUrl);
  formData.set('gated', gated ? 'true' : 'false');
  if (name) formData.set('fileName', name);
  if (resourceSlug) formData.set('resourceSlug', resourceSlug);
  if (window.location?.href) formData.set('pageUrl', window.location.href);
  if (window.location?.pathname) formData.set('pagePath', window.location.pathname);

  const registration = readRegistration();
  if (registration?.email) formData.set('email', registration.email);

  try {
    fetch(action, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never block a download on analytics.
  }
}

/**
 * Kick off a file download via a synthesized anchor click, preserving the
 * original link's target/download semantics. More reliable than window.open
 * after async work, which popup blockers are quick to eat.
 */
function startDownload(link, url = '') {
  const anchor = document.createElement('a');
  anchor.href = url || link.href;
  if (link.target) anchor.target = link.target;
  if (link.hasAttribute('download')) {
    anchor.setAttribute('download', link.getAttribute('download') || '');
  }
  anchor.rel = 'noopener noreferrer';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

// Types a browser can render in-tab. Everything else is a genuine download.
const INLINE_VIEW_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

function fileExtensionOf(url) {
  const name = String(url || '').split(/[?#]/)[0].split('/').pop() || '';
  return name.includes('.') ? name.split('.').pop().toLowerCase() : '';
}

function isInlineViewable(url) {
  return INLINE_VIEW_EXTENSIONS.includes(fileExtensionOf(url));
}

/**
 * Open a file in a new tab even when the server forces a download via
 * Content-Disposition: attachment. Fetching it as a blob and viewing the
 * blob: URL sidesteps that header (the browser renders it inline). The tab
 * is opened synchronously to survive popup blockers; if blocked (e.g. after
 * an async registration), we fall back to a normal download.
 */
function openInline(url, link) {
  const win = window.open('about:blank', '_blank');
  if (!win) {
    if (link) startDownload(link);
    return;
  }
  win.opener = null;

  fetch(url)
    .then((response) => (response.ok ? response.blob() : Promise.reject(response.status)))
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      win.location.href = blobUrl;
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    })
    .catch(() => {
      // CORS/network failure — let the browser handle the raw URL.
      win.location.href = url;
    });
}

function deliverFile(url, link) {
  if (isInlineViewable(url)) openInline(url, link);
  else startDownload(link);
}

/**
 * Deliver a file whose URL arrives asynchronously (a presigned S3 URL). The
 * viewing tab must be opened synchronously inside the click gesture or popup
 * blockers eat it — so for inline types the tab opens first and navigates
 * once the URL resolves. Presigned URLs carry their own inline/attachment
 * Content-Disposition, so no blob fetch (and no CORS requirement) is needed.
 */
function deliverResolvedFile(resolveUrl, link, fileName = '') {
  if (isInlineViewable(fileName)) {
    const win = window.open('about:blank', '_blank');
    if (win) win.opener = null;
    resolveUrl().then((url) => {
      if (!url) {
        if (win) win.close();
        return;
      }
      if (win) win.location.href = url;
      else startDownload(link, url);
    });
    return;
  }

  resolveUrl().then((url) => {
    if (url) startDownload(link, url);
  });
}

function buildField({
  name, label, type = 'text', required = false, autocomplete = '', options = null, placeholder = '',
}) {
  const field = document.createElement('div');
  field.className = 'resource-gate-field';

  const id = `resource-gate-${name}`;
  const labelEl = document.createElement('label');
  labelEl.className = 'resource-gate-label';
  labelEl.htmlFor = id;
  labelEl.textContent = required ? `${label} *` : label;
  field.append(labelEl);

  let input;
  if (options) {
    input = document.createElement('select');
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = placeholder || `Select ${label.toLowerCase()}`;
    if (required) blank.disabled = true;
    blank.selected = true;
    input.append(blank);
    options.forEach((option) => {
      const [value, text] = Array.isArray(option) ? option : [option, option];
      const optionEl = document.createElement('option');
      optionEl.value = value;
      optionEl.textContent = text;
      input.append(optionEl);
    });
  } else {
    input = document.createElement('input');
    input.type = type;
    if (placeholder) input.placeholder = placeholder;
  }

  input.className = 'resource-gate-input';
  input.id = id;
  input.name = name;
  input.required = required;
  if (autocomplete) input.autocomplete = autocomplete;
  field.append(input);

  return field;
}

function buildModal() {
  const root = document.createElement('div');
  root.className = 'resource-gate-modal';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Download registration');
  root.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'resource-gate-modal-backdrop';
  root.append(backdrop);

  const dialog = document.createElement('div');
  dialog.className = 'resource-gate-modal-dialog';
  root.append(dialog);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'resource-gate-modal-close';
  closeBtn.setAttribute('aria-label', 'Close registration form');
  closeBtn.innerHTML = '&times;';
  dialog.append(closeBtn);

  const title = document.createElement('h2');
  title.className = 'resource-gate-modal-title';
  title.textContent = 'Register to unlock downloads';
  dialog.append(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'resource-gate-modal-subtitle';
  subtitle.textContent = 'Tell us a little about yourself to access this resource. You will only need to do this once.';
  dialog.append(subtitle);

  const form = document.createElement('form');
  form.className = 'resource-gate-form';
  form.noValidate = false;

  const row = document.createElement('div');
  row.className = 'resource-gate-form-row';
  row.append(
    buildField({
      name: 'honorific', label: 'Title', options: HONORIFIC_OPTIONS, placeholder: 'Select title',
    }),
    buildField({
      name: 'firstName', label: 'First name', required: true, autocomplete: 'given-name',
    }),
    buildField({
      name: 'lastName', label: 'Last name', required: true, autocomplete: 'family-name',
    }),
  );
  form.append(row);

  form.append(buildField({
    name: 'email', label: 'Email address', type: 'email', required: true, autocomplete: 'email',
  }));
  form.append(buildField({
    name: 'organization', label: 'Organization', autocomplete: 'organization',
  }));
  form.append(buildField({
    name: 'audience', label: 'Audience', required: true, options: AUDIENCE_OPTIONS, placeholder: 'Select your audience',
  }));

  const status = document.createElement('p');
  status.className = 'resource-gate-form-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  form.append(status);

  const actions = document.createElement('div');
  actions.className = 'resource-gate-form-actions';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'resource-gate-form-submit';
  submit.textContent = 'Register & Unlock';
  actions.append(submit);
  form.append(actions);

  dialog.append(form);
  document.body.append(root);

  const formSession = createFormSession(form, 'resource-registration');

  let pendingResolve = null;
  let currentSlug = '';

  function close(result) {
    root.hidden = true;
    document.body.style.overflow = '';
    if (pendingResolve) {
      pendingResolve(result || null);
      pendingResolve = null;
    }
  }

  function open(resourceSlug) {
    currentSlug = resourceSlug || '';
    updateFormStatus(status, '', 'info');
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    formSession.reset();
    const firstInput = form.querySelector('input, select');
    if (firstInput) firstInput.focus();

    return new Promise((resolve) => {
      pendingResolve = resolve;
    });
  }

  closeBtn.addEventListener('click', () => close(null));
  backdrop.addEventListener('click', () => close(null));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hidden) close(null);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled || !isFormValid(form)) return;

    const action = resolveFormAction('resource-registration');
    const formData = new FormData(form);
    appendFormMetadata(formData, formSession);
    if (currentSlug) formData.set('resourceSlug', currentSlug);

    const registration = {
      version: 1,
      registeredAt: Date.now(),
      email: String(formData.get('email') || '').trim().toLowerCase(),
      audience: String(formData.get('audience') || ''),
    };

    if (!action) {
      updateFormStatus(status, 'Registration is not connected yet. Please try again later.', 'error');
      return;
    }

    submit.disabled = true;
    root.classList.add('is-submitting');

    try {
      const response = await fetch(action, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });
      const payload = await response.clone().json().catch(() => null);
      const message = await extractApiMessage(response);
      if (!response.ok) {
        throw new Error(message || 'Something went wrong. Please try again.');
      }

      // The server-signed gate token unlocks presigned S3 downloads for the
      // next 6 months; it rides along in the stored registration record.
      if (payload?.gate_token) {
        registration.version = 2;
        registration.gateToken = payload.gate_token;
        registration.gateTokenExpiresAt = payload.gate_token_expires_at || '';
      }

      writeRegistration(registration);
      trackEvent('resource_registration', {
        audience: registration.audience,
        resource_slug: currentSlug,
      });
      window.dispatchEvent(new CustomEvent(REGISTERED_EVENT, {
        detail: { audience: registration.audience },
      }));

      form.reset();
      formSession.reset();
      updateFormStatus(status, "You're all set — your download is starting.", 'success');
      root.classList.add('is-success');

      // Resolve now so the download starts while the browser still honors
      // the visitor's click; keep the modal up briefly as confirmation.
      if (pendingResolve) {
        pendingResolve(registration);
        pendingResolve = null;
      }

      window.setTimeout(() => {
        root.classList.remove('is-success');
        close(null);
      }, 1600);
    } catch (error) {
      updateFormStatus(status, error.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      submit.disabled = false;
      root.classList.remove('is-submitting');
    }
  });

  return { open };
}

/**
 * Open the shared registration modal. Resolves with the registration entry
 * on success, or null if the visitor dismisses it.
 */
export function openRegistrationModal({ resourceSlug = '' } = {}) {
  ensureStyles();

  if (isRegistered()) {
    return Promise.resolve(readRegistration());
  }

  if (!modal) modal = buildModal();

  return modal.open(resourceSlug);
}

/**
 * Wire a download anchor through the gate. Ungated links just record the
 * download; gated links show "Locked" until registration, then relabel and
 * behave like plain downloads. All gated links on the page unlock together.
 */
export function bindGatedLink(link, {
  gated = false,
  resourceSlug = '',
  fileUrl = '',
  fileName = '',
  lockedLabel = 'Locked',
  downloadLabel = '',
  signedUrlEndpoint = '',
} = {}) {
  if (!link) return;

  // Signed-URL links carry no real href (nothing to leak in the DOM); the
  // URL is requested from the API per click and expires within the hour.
  const usesSignedUrl = Boolean(signedUrlEndpoint);
  if (usesSignedUrl && !link.getAttribute('href')) link.setAttribute('href', '#');

  const targetUrl = usesSignedUrl ? '' : (fileUrl || link.href || '');
  const track = () => recordDownload({
    resourceSlug,
    // Never log a presigned URL — the file name + slug identify the download.
    fileUrl: targetUrl || fileName || `s3:${resourceSlug}`,
    fileName,
    gated,
  });
  const deliver = () => {
    if (usesSignedUrl) {
      deliverResolvedFile(() => fetchSignedUrl(signedUrlEndpoint), link, fileName);
    } else {
      deliverFile(targetUrl, link);
    }
  };
  // Leave modifier / middle clicks to the browser's native behavior.
  const isPlainClick = (event) => event.button === 0
    && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

  if (!gated) {
    link.addEventListener('click', (event) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      track();
      deliver();
    });
    return;
  }

  ensureStyles();
  link.classList.add('resource-gate-link');

  const unlockedLabel = downloadLabel || link.textContent.trim() || 'Download';

  // The visible label stays constant; the locked state is conveyed by the
  // padlock icon (via the .is-locked CSS ::before) and, for assistive tech,
  // by the accessible name and tooltip built from lockedLabel.
  const applyState = (registered) => {
    link.classList.toggle('is-locked', !registered);
    link.textContent = unlockedLabel;
    if (registered) {
      link.removeAttribute('aria-disabled');
      link.removeAttribute('aria-label');
      link.removeAttribute('title');
    } else {
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('aria-label', `${lockedLabel}: ${unlockedLabel}`);
      link.setAttribute('title', lockedLabel);
    }
  };

  applyState(isRegistered());
  window.addEventListener(REGISTERED_EVENT, () => applyState(true));

  link.addEventListener('click', (event) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();

    if (isRegistered()) {
      track();
      deliver();
      return;
    }

    openRegistrationModal({ resourceSlug }).then((registration) => {
      if (!registration) return;
      track();
      // Deliver the file the visitor originally asked for.
      deliver();
    });
  });
}
