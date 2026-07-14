/*
 * GA4 loader + event helper.
 * gtag.js is only loaded after the visitor accepts analytics cookies
 * (see blocks/cookie-consent). Set the real measurement ID below, or
 * override it per-page via window.hlx.ga4MeasurementId or a
 * <meta name="ga4-measurement-id"> page metadata entry.
 */

import { getMetadata } from './aem.js';

const PLACEHOLDER_MEASUREMENT_ID = 'G-XXXXXXXXXX';

// Only these keys may reach GA4 — keeps PII (names, emails, organizations) out.
const ALLOWED_PARAM_KEYS = [
  'resource_slug',
  'file_name',
  'file_extension',
  'gated',
  'audience',
  'page_location',
];

const MAX_QUEUED_EVENTS = 20;

let gtagFn = null;
const queue = [];

function resolveMeasurementId() {
  const id = String(
    window.hlx?.ga4MeasurementId
    || getMetadata('ga4-measurement-id')
    || PLACEHOLDER_MEASUREMENT_ID,
  ).trim();

  if (id === PLACEHOLDER_MEASUREMENT_ID || !/^G-[A-Z0-9]+$/i.test(id)) {
    return '';
  }

  return id;
}

function sanitizeParams(params) {
  const safe = {};

  ALLOWED_PARAM_KEYS.forEach((key) => {
    const value = params?.[key];
    if (value !== undefined && value !== null && value !== '') {
      safe[key] = String(value);
    }
  });

  if (!safe.page_location) {
    safe.page_location = window.location.href;
  }

  return safe;
}

function loadGtag(id) {
  if (gtagFn) return;

  window.dataLayer = window.dataLayer || [];
  gtagFn = function gtag() {
    // GA4 requires the Arguments object, not an array
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);

  gtagFn('js', new Date());
  gtagFn('config', id, { anonymize_ip: true });

  while (queue.length) {
    const [name, params] = queue.shift();
    gtagFn('event', name, params);
  }
}

/**
 * Push an analytics event. Safe to call before (or without) GA4 loading —
 * events queue until consent + load, and PII-bearing keys are dropped.
 */
export function trackEvent(name, params = {}) {
  const safeParams = sanitizeParams(params);

  if (!gtagFn) {
    if (queue.length < MAX_QUEUED_EVENTS) {
      queue.push([name, safeParams]);
    }
    return;
  }

  gtagFn('event', name, safeParams);
}

export function initAnalytics() {
  const id = resolveMeasurementId();
  if (!id) return;

  const apply = (accepted) => {
    if (accepted) {
      window[`ga-disable-${id}`] = false;
      loadGtag(id);
    } else {
      window[`ga-disable-${id}`] = true;
    }
  };

  apply(document.documentElement.dataset.cookieAnalytics === 'accepted');

  window.addEventListener('ncmec:cookie-consent', (event) => {
    apply(Boolean(event.detail?.preferences?.analytics));
  });
}
