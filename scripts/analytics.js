/*
 * Analytics layer: Google Tag Manager + Adobe Launch, both consent-gated.
 *
 * Edit scripts/analytics-config.js to switch this on — never this file. Everything
 * here is inert until that config says otherwise, so the redesign can be built and
 * previewed without a single beacon reaching a live report suite.
 *
 * WHAT THIS FILE OWNS
 *   - Google Consent Mode v2 defaults, set before any Google tag can run
 *   - loading the GTM container, and pushing a clean `window.dataLayer`
 *   - loading the right Adobe Launch environment embed, and feeding
 *     `window.adobeDataLayer` (Adobe Client Data Layer)
 *   - dropping any param not on the allowlist, so PII cannot leak into a tag
 *
 * WHAT IT DELIBERATELY DOES NOT OWN
 *   Individual tags. GA4, Google Ads and Meta Pixel are configured inside GTM by
 *   the marketing team. Adding a tag must not require a deploy.
 *
 * THE EVENT CONTRACT
 *   Blocks call trackEvent(name, params). Each event is pushed to BOTH data layers
 *   in the shape each expects:
 *     GTM     dataLayer.push({ event: 'donate_click', campaign_id: '743271' })
 *     Adobe   adobeDataLayer.push({ event: 'donate_click', eventInfo: { ... } })
 *   Give the client's GTM and Launch teams this list — these are the triggers:
 *
 *     page_view             every page, after consent
 *     donate_click          header Donate button        campaign_id
 *     resource_download     gated or open download      resource_slug, file_name,
 *                                                       file_extension, gated
 *     resource_registration gate form completed         audience, resource_slug
 *     resource_video_watch  resource video played       resource_slug, file_name
 *     site_search           header search submitted     search_term
 *     outbound_click        link to another domain      link_url, link_domain
 */

import { getMetadata } from './aem.js';
import config from './analytics-config.js';

const MAX_QUEUED_EVENTS = 50;
const DEBUG_PARAM = 'analytics-debug';

const queue = [];
let started = false;
let debug = false;
let gtmLoaded = false;
let adobeLoaded = false;

/* ------------------------------------------------------------------ helpers */

function isDebug() {
  try {
    if (new URLSearchParams(window.location.search).has(DEBUG_PARAM)) return true;
    return window.localStorage.getItem('ncmec.analyticsDebug') === '1';
  } catch (e) {
    return false;
  }
}

function log(...args) {
  if (!debug) return;
  // eslint-disable-next-line no-console
  console.info('%c[analytics]', 'color:#0a7', ...args);
}

/**
 * Config can be overridden per page via metadata, so a single page can be pointed
 * at a test container without editing the repo. Metadata wins over the config file.
 */
function setting(path, fallback) {
  const meta = getMetadata(`analytics-${path.replace(/\./g, '-')}`);
  if (meta) return meta.trim();
  return path.split('.').reduce((acc, key) => acc?.[key], config) ?? fallback;
}

function isProductionHost() {
  const host = window.location.hostname.toLowerCase();
  return (config.productionHosts || []).some((h) => host === h.toLowerCase());
}

/**
 * Which Adobe Launch environment this host maps to. Preview and author hosts get the
 * development embed so rehearsal traffic never reaches the production report suite.
 */
function adobeEnvironment() {
  if (isProductionHost()) return 'production';
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith('main--') || host.endsWith('.aem.live')) return 'staging';
  return 'development';
}

/** Reads the consent state the cookie-consent block publishes on <html>. */
function hasConsent(category) {
  if (category === 'essential') return true;
  const flag = document.documentElement.dataset[
    category === 'marketing' ? 'cookieMarketing' : 'cookieAnalytics'
  ];
  return flag === 'accepted';
}

/** Strip anything not explicitly allowed, so a stray object cannot leak PII. */
function sanitize(params) {
  const allowed = config.allowedParams || [];
  const safe = {};

  allowed.forEach((key) => {
    const value = params?.[key];
    if (value !== undefined && value !== null && value !== '') safe[key] = String(value);
  });

  const dropped = Object.keys(params || {}).filter((k) => !allowed.includes(k));
  if (dropped.length) log('dropped params (not on allowlist):', dropped.join(', '));

  if (!safe.page_location) safe.page_location = window.location.href;
  if (!safe.page_path) safe.page_path = window.location.pathname;
  return safe;
}

/* ------------------------------------------------- google consent mode v2 */

function gtag() {
  window.dataLayer = window.dataLayer || [];
  // Consent Mode requires the real Arguments object — pushing an array does not work.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

/**
 * Consent Mode v2 defaults. Must be pushed BEFORE the container so that no Google
 * tag inside it can write storage until the visitor has actually agreed.
 * `security_storage` stays granted — it covers fraud prevention, not tracking.
 */
function setConsentDefaults() {
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500,
  });
  log('consent mode v2 defaults set (all denied)');
}

function updateConsentState() {
  const analytics = hasConsent('analytics') ? 'granted' : 'denied';
  const marketing = hasConsent('marketing') ? 'granted' : 'denied';

  const update = {
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
    analytics_storage: analytics,
    functionality_storage: analytics,
    personalization_storage: marketing,
    security_storage: 'granted',
  };

  if (debug) {
    log('consent update (not sent, debug):', update);
    return;
  }
  gtag('consent', 'update', update);
}

/* ------------------------------------------------------- withdrawal cleanup */

/**
 * Cookies written by the tags this site loads. Matched by pattern rather than by exact
 * name because the interesting ones are per-property (`_ga_A1B2C3`, `AMCV_...@AdobeOrg`).
 *
 * Deliberately narrow: only vendor tracking cookies. The site's own state — cookie
 * consent itself, session, gate tokens — must survive a withdrawal untouched.
 */
const TRACKING_COOKIES = {
  // Measurement. Cleared when Analytics is refused.
  analytics: [
    /^_ga/, /^_gid$/, /^_gat/, // Google Analytics (incl. per-property _ga_A1B2C3)
    /^(?:s_cc|s_sq|s_vi|s_fid)$/, /^AMCVS?_/, // Adobe Analytics
  ],
  // Advertising and personalization. Cleared when Marketing is refused.
  marketing: [
    /^_gcl_/, // Google Ads conversion linker
    /^_fbp$/, /^_fbc$/, // Meta Pixel
    /^mbox$/, // Adobe Target
  ],
};

/**
 * Expire one cookie everywhere it could plausibly have been set. A tag typically writes
 * to the registrable domain with a leading dot (`.ncmec.org`), which a naive host-only
 * delete misses entirely — leaving the cookie in place and the visitor still identified.
 */
function deleteCookie(name) {
  const parts = window.location.hostname.split('.');
  const domains = [null, window.location.hostname];
  for (let i = 0; i < parts.length - 1; i += 1) domains.push(`.${parts.slice(i).join('.')}`);

  domains.forEach((domain) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ''}`;
  });
}

/**
 * Withdrawing consent has to undo what consent allowed, not merely stop adding to it.
 * Telling Google to deny storage leaves every cookie already written in place — on a
 * two-year expiry — so the visitor stays identifiable. Clear them.
 *
 * Scoped per category: refusing Marketing must not wipe the measurement cookies of a
 * visitor who is still happy to be counted.
 */
function clearTrackingCookies() {
  const patterns = Object.entries(TRACKING_COOKIES)
    .filter(([category]) => !hasConsent(category))
    .flatMap(([, group]) => group);

  if (!patterns.length) return;

  const names = document.cookie
    .split(';')
    .map((pair) => pair.split('=')[0].trim())
    .filter((name) => name && patterns.some((pattern) => pattern.test(name)));

  if (!names.length) return;

  names.forEach(deleteCookie);
  log('cleared tracking cookies after refusal:', names.join(', '));
}

/* ------------------------------------------------------------ tag loading */

function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    Object.entries(attrs).forEach(([k, v]) => script.setAttribute(k, v));
    script.onload = resolve;
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.append(script);
  });
}

/**
 * Explain, in one line, why a tag is or is not going to run. This is what makes
 * `?analytics-debug=1` useful: it names the specific gate that is closed.
 */
function gateReason(tool) {
  if (!config.enabled) return 'blocked: master config.enabled is false';
  if (!setting(`${tool}.enabled`, false)) return `blocked: ${tool}.enabled is false`;
  if (!isProductionHost() && !config.allowNonProductionHosts) {
    return `blocked: ${window.location.hostname} is not a production host`;
  }
  const category = setting(`${tool}.consentCategory`, 'analytics');
  if (!hasConsent(category)) return `waiting: ${category} consent not granted`;
  return '';
}

function loadGtm() {
  if (gtmLoaded) return;

  const containerId = setting('gtm.containerId', '');
  if (!containerId) { log('gtm: no container id configured'); return; }

  const reason = gateReason('gtm');
  const preConsent = setting('gtm.loadBeforeConsent', false);
  if (reason && !(preConsent && reason.startsWith('waiting'))) { log(`gtm: ${reason}`); return; }

  if (debug) { log(`gtm: WOULD LOAD container ${containerId} (debug, not loaded)`); gtmLoaded = true; return; }

  gtmLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`)
    .then(() => log(`gtm: loaded ${containerId}`))
    .catch(() => { gtmLoaded = false; });
}

function loadAdobe() {
  if (adobeLoaded) return;

  const env = adobeEnvironment();
  const embed = setting(`adobe.embeds.${env}`, '');
  if (!embed) { log(`adobe: no ${env} embed configured`); return; }

  const reason = gateReason('adobe');
  if (reason) { log(`adobe: ${reason}`); return; }

  const src = embed.startsWith('//') ? `https:${embed}` : embed;
  if (debug) { log(`adobe: WOULD LOAD ${env} embed (debug, not loaded)`, src); adobeLoaded = true; return; }

  adobeLoaded = true;
  window.adobeDataLayer = window.adobeDataLayer || [];
  loadScript(src)
    .then(() => log(`adobe: loaded ${env} embed`))
    .catch(() => { adobeLoaded = false; });
}

/* ----------------------------------------------------------------- events */

function push(name, params) {
  if (debug) {
    log(`event "${name}"`, params);
    return;
  }

  // Consent is re-checked on every event, not just at load. A visitor can withdraw
  // after a tag is already running, and a loaded container cannot be unloaded — so
  // the site stops feeding it instead. Without this, withdrawal silently kept
  // delivering events to tags that were still listening.
  if (gtmLoaded && hasConsent(setting('gtm.consentCategory', 'analytics'))) {
    // GTM: flat, one key per param, `event` drives the trigger.
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });
  }

  // Adobe matters more here than Google: Launch has no Consent Mode equivalent, so a
  // rule that sees an event will send its beacon regardless of what we told Google.
  if (adobeLoaded && hasConsent(setting('adobe.consentCategory', 'analytics'))) {
    // Adobe Client Data Layer: nested under eventInfo, which is what Launch reads.
    window.adobeDataLayer = window.adobeDataLayer || [];
    window.adobeDataLayer.push({ event: name, eventInfo: params });
  }
}

function flushQueue() {
  while (queue.length) {
    const [name, params] = queue.shift();
    push(name, params);
  }
}

function anyToolReady() {
  return gtmLoaded || adobeLoaded || debug;
}

/**
 * Record an event. Safe to call from anywhere, at any time, whether or not analytics
 * is switched on: params are sanitized immediately, and events queue until a tag is
 * actually loaded. Nothing is ever sent without consent.
 *
 * @param {string} name one of the documented events at the top of this file
 * @param {Object} [params] keys must appear in config.allowedParams or they are dropped
 */
export function trackEvent(name, params = {}) {
  const safe = sanitize(params);

  if (!anyToolReady()) {
    if (queue.length < MAX_QUEUED_EVENTS) queue.push([name, safe]);
    return;
  }

  push(name, safe);
}

/** Convenience wrapper for the standard page_view event. */
export function trackPageView(extra = {}) {
  trackEvent('page_view', { page_title: document.title, ...extra });
}

/**
 * Wire the automatic events every site wants: outbound link clicks, and the initial
 * page view. Everything else is raised explicitly by the block that owns it.
 */
function bindAutomaticEvents() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;

    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (e) {
      return;
    }
    if (url.hostname === window.location.hostname || !/^https?:$/.test(url.protocol)) return;

    trackEvent('outbound_click', { link_url: url.href, link_domain: url.hostname });
  }, { capture: true, passive: true });
}

/**
 * Bring up whatever the config allows, and re-evaluate whenever consent changes so
 * that agreeing on the banner takes effect immediately, with no reload.
 */
export function initAnalytics() {
  if (started) return;
  started = true;
  debug = isDebug();

  if (debug) {
    log('DEBUG MODE — nothing will be loaded or sent.');
    log('config:', {
      enabled: config.enabled,
      host: window.location.hostname,
      productionHost: isProductionHost(),
      adobeEnvironment: adobeEnvironment(),
      gtm: gateReason('gtm') || 'would load',
      adobe: gateReason('adobe') || 'would load',
    });
  }

  if (!config.enabled && !debug) return;

  setConsentDefaults();
  bindAutomaticEvents();

  const apply = () => {
    updateConsentState();

    // Runs on every consent state, not only on the transition, so a visitor who has
    // refused gets any stray tracking cookie swept on each page rather than only at the
    // moment they clicked. Deleting a cookie that is not there costs nothing.
    if (!hasConsent('analytics') || !hasConsent('marketing')) clearTrackingCookies();

    loadGtm();
    loadAdobe();
    if (anyToolReady()) flushQueue();
  };

  apply();
  window.addEventListener('ncmec:cookie-consent', apply);

  if (anyToolReady()) trackPageView();
}
