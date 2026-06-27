import { getMetadata } from '../../scripts/aem.js';

const STORAGE_KEY = 'ncmec.cookieConsent.v1';
const CONSENT_ID_KEY = 'ncmec.cookieConsentId';
const DEFAULT_CONFIG = Object.freeze({
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  endpointPath: '/api/cookie-consent',
  policyVersion: '2026-05-28',
  privacyPolicyUrl: '',
});
const DEFAULT_PRIVACY_POLICY_AUTHOR_PATH = '/content/edge/footer/privacypolicy.html';
const DEFAULT_PRIVACY_POLICY_LIVE_PATH = '/footer/privacypolicy';
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

function compactConfig(config = {}) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => `${value ?? ''}`.trim() !== ''),
  );
}

function normalizeApiBaseUrl(value = '') {
  const normalized = `${value || ''}`.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(normalized) ? normalized : '';
}

function getDefaultPrivacyPolicyUrl() {
  return window.location.pathname.startsWith('/content/edge/')
    ? DEFAULT_PRIVACY_POLICY_AUTHOR_PATH
    : DEFAULT_PRIVACY_POLICY_LIVE_PATH;
}

function readJsonStorage(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch (error) {
    return null;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage may be unavailable in private browsing modes.
  }
}

function readConsentId() {
  try {
    return window.localStorage.getItem(CONSENT_ID_KEY) || '';
  } catch (error) {
    return '';
  }
}

function writeConsentId(consentId) {
  if (!consentId) return;

  try {
    window.localStorage.setItem(CONSENT_ID_KEY, consentId);
  } catch (error) {
    // Storage may be unavailable in private browsing modes.
  }
}

function readStoredConsent() {
  const stored = readJsonStorage(STORAGE_KEY);
  if (!stored?.preferences?.essential) return null;

  return {
    ...stored,
    consentId: stored.consentId || readConsentId(),
    preferences: {
      essential: true,
      analytics: Boolean(stored.preferences.analytics),
    },
  };
}

function resolveConfig() {
  const metadataConfig = {
    apiBaseUrl: getMetadata('cookie-consent-api-base-url'),
    endpointPath: getMetadata('cookie-consent-endpoint'),
    policyVersion: getMetadata('cookie-consent-policy-version'),
    privacyPolicyUrl: getMetadata('cookie-consent-privacy-policy-url'),
  };
  const runtimeConfig = window.hlx?.cookieConsentConfig || {};
  const enabledValue = `${getMetadata('cookie-consent-enabled') || runtimeConfig.enabled || ''}`
    .trim()
    .toLowerCase();
  const merged = {
    ...DEFAULT_CONFIG,
    ...compactConfig(runtimeConfig),
    ...compactConfig(metadataConfig),
  };

  return {
    apiBaseUrl: normalizeApiBaseUrl(merged.apiBaseUrl),
    endpointPath: merged.endpointPath || DEFAULT_CONFIG.endpointPath,
    policyVersion: `${merged.policyVersion || DEFAULT_CONFIG.policyVersion}`.trim(),
    privacyPolicyUrl: `${merged.privacyPolicyUrl || getDefaultPrivacyPolicyUrl()}`.trim(),
    enabled: !DISABLED_VALUES.has(enabledValue),
  };
}

function applyConsent(consent) {
  const normalized = {
    ...consent,
    preferences: {
      essential: true,
      analytics: Boolean(consent?.preferences?.analytics),
    },
  };

  window.hlx = window.hlx || {};
  window.hlx.cookieConsent = normalized;
  document.documentElement.dataset.cookieAnalytics = normalized.preferences.analytics
    ? 'accepted'
    : 'declined';
  window.dispatchEvent(new CustomEvent('ncmec:cookie-consent', { detail: normalized }));
}

function getConsentPayload(consent) {
  const payload = {
    preferences: {
      essential: true,
      analytics: Boolean(consent.preferences.analytics),
    },
    policyVersion: consent.policyVersion,
    action: consent.action || 'custom',
    pageUrl: window.location.href,
    pagePath: window.location.pathname,
  };

  if (consent.consentId) payload.consentId = consent.consentId;
  return payload;
}

async function syncConsent(consent, config) {
  if (!config.apiBaseUrl) return consent;

  const url = new URL(config.endpointPath, `${config.apiBaseUrl}/`);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(getConsentPayload(consent)),
  });

  if (!response.ok) {
    throw new Error(`Cookie consent API request failed with HTTP ${response.status}.`);
  }

  const data = await response.json();
  return {
    ...consent,
    consentId: data.consentId || consent.consentId,
    preferences: {
      essential: true,
      analytics: Boolean(data.preferences?.analytics ?? consent.preferences.analytics),
    },
    policyVersion: data.policyVersion || consent.policyVersion,
    action: data.action || consent.action,
    syncStatus: 'synced',
  };
}

function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createButton(text, className, onClick) {
  const button = createElement('button', className, text);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function buildPolicyText(config) {
  const text = createElement('p', 'cookie-consent-text');
  text.append('We use essential cookies to keep the site working. With your permission, analytics cookies help us understand traffic and improve the experience. Learn more in our ');

  const link = createElement('a', '', 'Privacy Policy');
  link.href = config.privacyPolicyUrl;
  if (/^https?:\/\//i.test(config.privacyPolicyUrl)) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  text.append(link, '.');

  return text;
}

function buildToggle({
  id,
  label,
  description,
  checked,
  disabled,
}) {
  const row = createElement('label', 'cookie-consent-choice');
  const copy = createElement('span', 'cookie-consent-choice-copy');
  const title = createElement('span', 'cookie-consent-choice-title', label);
  const body = createElement('span', 'cookie-consent-choice-description', description);
  const control = createElement('span', 'cookie-consent-switch');
  const input = document.createElement('input');
  const visual = createElement('span', 'cookie-consent-switch-ui');

  input.id = id;
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = disabled;
  control.append(input, visual);
  copy.append(title, body);
  row.append(copy, control);

  return {
    row,
    input,
  };
}

function removeConsentUi(block) {
  block.replaceChildren();
}

function saveLocalConsent(consent) {
  writeJsonStorage(STORAGE_KEY, consent);
  writeConsentId(consent.consentId);
  applyConsent(consent);
}

function persistConsent(block, consent, config) {
  const pendingConsent = {
    ...consent,
    syncStatus: config.apiBaseUrl ? 'pending' : 'local',
  };

  saveLocalConsent(pendingConsent);
  removeConsentUi(block);

  syncConsent(pendingConsent, config)
    .then((syncedConsent) => {
      saveLocalConsent(syncedConsent);
    })
    .catch(() => {
      saveLocalConsent(pendingConsent);
    });
}

function createConsent(action, analytics, config, existingConsent = null) {
  return {
    consentId: existingConsent?.consentId || readConsentId(),
    preferences: {
      essential: true,
      analytics: Boolean(analytics),
    },
    policyVersion: config.policyVersion,
    action,
    savedAt: new Date().toISOString(),
  };
}

function renderConsentBanner(block, config, existingConsent = null, forceDetails = false) {
  removeConsentUi(block);

  const initialAnalytics = Boolean(existingConsent?.preferences?.analytics);
  const shell = createElement('div', 'cookie-consent-shell');
  const panel = createElement('section', 'cookie-consent-panel');
  const header = createElement('div', 'cookie-consent-header');
  const heading = createElement('h2', 'cookie-consent-heading', 'Cookie Preferences');
  const policyText = buildPolicyText(config);
  const details = createElement('div', 'cookie-consent-details');
  const actions = createElement('div', 'cookie-consent-actions');
  const { row: essentialRow } = buildToggle({
    id: 'cookie-consent-essential',
    label: 'Essential Cookies',
    description: 'Required for core site features and cannot be turned off.',
    checked: true,
    disabled: true,
  });
  const { row: analyticsRow, input: analyticsInput } = buildToggle({
    id: 'cookie-consent-analytics',
    label: 'Analytics',
    description: 'Helps us understand site usage so we can improve content and navigation.',
    checked: initialAnalytics,
    disabled: false,
  });

  heading.id = 'cookie-consent-heading';
  policyText.id = 'cookie-consent-description';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', heading.id);
  panel.setAttribute('aria-describedby', policyText.id);
  details.hidden = !forceDetails;

  const customizeButton = createButton('Customize', 'cookie-consent-button secondary', () => {
    details.hidden = false;
    analyticsInput.focus();
  });
  const acceptAllButton = createButton('Accept All', 'cookie-consent-button primary', () => {
    persistConsent(block, createConsent('accept_all', true, config, existingConsent), config);
  });
  const okButton = createButton('OK', 'cookie-consent-button ghost', () => {
    persistConsent(block, createConsent('essential_only', false, config, existingConsent), config);
  });
  okButton.setAttribute('aria-label', 'Keep essential cookies only');

  const saveButton = createButton('Save Preferences', 'cookie-consent-button primary', () => {
    persistConsent(
      block,
      createConsent('custom', analyticsInput.checked, config, existingConsent),
      config,
    );
  });
  const detailAcceptAllButton = createButton('Accept All', 'cookie-consent-button secondary', () => {
    analyticsInput.checked = true;
    persistConsent(block, createConsent('accept_all', true, config, existingConsent), config);
  });

  header.append(heading);
  details.append(essentialRow, analyticsRow);
  actions.append(customizeButton, acceptAllButton, okButton);
  const detailActions = createElement('div', 'cookie-consent-detail-actions');
  detailActions.append(saveButton, detailAcceptAllButton);

  details.append(detailActions);
  panel.append(header, policyText, details, actions);
  shell.append(panel);
  block.append(shell);

  if (forceDetails) analyticsInput.focus();
}

function addFooterPreferenceLink(block, config) {
  if (document.querySelector('.cookie-consent-footer-link')) return true;

  const footer = document.querySelector('footer .footer');
  if (!footer) return false;

  const target = footer.querySelector('.footer-legal-links');
  if (!target) return false;

  const wrapper = createElement(target.matches('ul, ol') ? 'li' : 'span', 'cookie-consent-footer-link');
  const button = createButton('Cookie Preferences', 'cookie-consent-footer-button', () => {
    renderConsentBanner(block, config, readStoredConsent(), true);
  });

  wrapper.append(button);
  target.append(wrapper);
  return true;
}

function retryFooterPreferenceLink(block, config) {
  document.addEventListener(
    'ncmec:footer-ready',
    () => addFooterPreferenceLink(block, config),
    { once: true },
  );

  if (addFooterPreferenceLink(block, config)) return;

  window.setTimeout(() => addFooterPreferenceLink(block, config), 1000);
}

function shouldShowBanner(storedConsent, config) {
  if (!storedConsent) return true;
  return storedConsent.policyVersion !== config.policyVersion;
}

function retryPendingSync(storedConsent, config) {
  if (!storedConsent || storedConsent.syncStatus !== 'pending') return;

  syncConsent(storedConsent, config)
    .then((syncedConsent) => {
      saveLocalConsent(syncedConsent);
    })
    .catch(() => {});
}

export default async function decorate(block) {
  const config = resolveConfig();
  if (!config.enabled) {
    block.remove();
    return;
  }

  retryFooterPreferenceLink(block, config);

  const storedConsent = readStoredConsent();
  if (storedConsent) applyConsent(storedConsent);
  retryPendingSync(storedConsent, config);

  if (shouldShowBanner(storedConsent, config)) {
    renderConsentBanner(block, config, storedConsent);
  }
}
