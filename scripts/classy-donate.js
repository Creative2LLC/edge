/*
 * Classy / GoFundMe Pro "Embedded Giving" checkout.
 *
 * How the vendor SDK works: on init it runs `document.querySelectorAll('a[href*=campaign]')`
 * once, pulls the campaign id out of each href, and attaches a click listener that
 * preventDefault()s and opens the checkout modal. It installs no MutationObserver, and a
 * second init() is refused with ALREADY_INITIALIZED.
 *
 * That single scan is why the AEM markup can get away with a bare `<a href="?campaign=...">`
 * but we cannot: on an EDS page the header arrives from a fragment fetch long after
 * DOMContentLoaded, so the SDK's automatic init would always scan a DOM with no donate link
 * in it and bind nothing. So we load the SDK with `manual-init=true` (the vendor's own
 * opt-out, read off document.currentScript.src) and init from here instead.
 *
 * The SDK is only fetched once someone actually asks to donate. It is ~330 KB of third-party
 * JS and it writes a `pgdid` tracking cookie the moment it runs, so loading it on every page
 * view would put a third-party identifier on visitors who never go near the donate button,
 * and would do it before the cookie banner has been answered. Clicking Donate is the consent,
 * so the load hangs off the click, with a preconnect on hover/focus to hide the latency.
 */

import resolveSiteHref from './link-utils.js';

// analytics.js (and the config it imports) arrives with delayed.js. A static import here
// fetched both while the header was still loading, in front of the page's hero image.
// trackEvent only queues until initAnalytics() runs, so loading it on first use changes nothing.
const trackEvent = (name, params) => import('./analytics.js')
  .then((analytics) => analytics.trackEvent(name, params))
  .catch(() => {});

// NCMEC's Classy organization. Same id the AEM site loads.
const ORG_ID = '28352';

// Embedded-Giving campaign behind the header Donate button, matching the AEM header's
// `<a href="?campaign=743271">`. It is embed-only — giving.gofundme.com/?campaign=743271 and
// give.missingkids.org/campaign/743271/donate are both 404 — so the modal is the only way to
// give against it, and FALLBACK_HREF is where we send people if the SDK never loads.
const DEFAULT_CAMPAIGN_ID = '743271';
const FALLBACK_HREF = '/get-involved/ways-to-give';

// `manual-init` suppresses the SDK's own DOMContentLoaded init. The giving.classy.org path
// 301s to giving.gofundme.com with the query preserved; it is the URL the live site uses, so
// keep it rather than hard-coding the redirect target.
const SDK_ORIGIN = 'https://giving.classy.org';
const SDK_SRC = `${SDK_ORIGIN}/embedded/api/sdk/js/${ORG_ID}?manual-init=true`;

// A wedged third party must not leave the button spinning; past this we send people to the
// ways-to-give page instead.
const SDK_TIMEOUT_MS = 8000;

// Hosts where a link is a donation checkout, not a page worth navigating to.
const GIVING_HOSTS = [
  'give.missingkids.org',
  'giving.classy.org',
  'giving.gofundme.com',
];

// Params the SDK forwards into the checkout. Anything else on an authored href is dropped
// rather than handed to the vendor.
const PASS_THROUGH = /^(?:amount|recurring|frequency|preset[1-4]|currency|designation|dedication|dedicationType|recurringEndDate|c_src|c_src2|utm_[a-z_]+)$/i;

let sdkPromise = null;
let sdkReady = false;
let preconnected = false;

/**
 * Pull a campaign id out of an authored href — either `?campaign=743271` or a hosted checkout
 * URL like https://give.missingkids.org/campaign/756510/donate.
 * @param {string} href
 * @returns {{ id: string, params: URLSearchParams } | null}
 */
function readCampaign(href) {
  const raw = `${href || ''}`.trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw, window.location.href);
  } catch (e) {
    return null;
  }

  const fromQuery = url.searchParams.get('campaign');
  if (/^\d+$/.test(fromQuery || '')) return { id: fromQuery, params: url.searchParams };

  if (!GIVING_HOSTS.includes(url.hostname)) return null;

  const fromPath = url.pathname.match(/\/campaign\/(\d+)(?:\/|$)/);
  return fromPath ? { id: fromPath[1], params: url.searchParams } : null;
}

/**
 * Build the href shape the SDK's scanner recognises, carrying over the checkout params the
 * author put on the original link and nothing else.
 */
function donateHref(campaignId, params) {
  const query = new URLSearchParams({ campaign: campaignId });
  if (params) {
    [...params.entries()].forEach(([key, value]) => {
      if (key !== 'campaign' && value && PASS_THROUGH.test(key)) query.set(key, value);
    });
  }
  return `?${query.toString()}`;
}

/** Open the TLS connection on hover/focus so the click only pays for the download. */
function preconnectSdk() {
  if (preconnected || sdkPromise) return;
  preconnected = true;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = SDK_ORIGIN;
  link.crossOrigin = 'anonymous';
  document.head.append(link);
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Fetch the SDK and hand it the DOM to bind. Safe to call repeatedly; only the first call
 * does the work, and a failed attempt clears itself so the next click can retry.
 */
export function initClassyGiving() {
  if (sdkPromise) return sdkPromise;

  const loaded = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = SDK_SRC;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Classy SDK failed to load'));
    document.head.append(script);
  });

  sdkPromise = withTimeout(loaded, SDK_TIMEOUT_MS, 'Classy SDK timed out')
    // window.eg is the SDK's public surface: { init, destroy, isInitialized }.
    .then(() => {
      if (!window.eg?.init) throw new Error('Classy SDK exposed no init()');
      return window.eg.isInitialized() ? null : window.eg.init({ win: window });
    })
    .then(() => {
      sdkReady = true;
    })
    .catch((error) => {
      // Do not cache a dead promise — let the next click try again.
      sdkPromise = null;
      throw error;
    });

  return sdkPromise;
}

/**
 * Open the checkout for a link the SDK has already bound, by replaying the click it is
 * listening for. dispatchEvent() returns false when a listener called preventDefault(), which
 * is exactly how we tell "the modal took it" from "nothing is bound".
 */
function replayClick(anchor) {
  const handled = !anchor.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  }));
  if (!handled) throw new Error('Classy SDK did not bind the donate link');
}

function goToFallback(error) {
  // eslint-disable-next-line no-console
  console.warn('[classy] falling back to the ways-to-give page:', error?.message || error);
  window.location.assign(resolveSiteHref(FALLBACK_HREF));
}

/**
 * Turn an anchor into a checkout trigger: rewrite its href into the form the SDK scans for,
 * and load the SDK on the first click.
 * @param {HTMLAnchorElement} anchor
 * @param {string} [campaignId] defaults to the header campaign
 */
export function markDonateTrigger(anchor, campaignId = DEFAULT_CAMPAIGN_ID) {
  if (!anchor || anchor.dataset.classyCampaign) return;

  const authored = readCampaign(anchor.getAttribute('href'));
  const id = authored?.id || campaignId;

  anchor.dataset.classyCampaign = id;
  anchor.href = donateHref(id, authored?.params);
  anchor.setAttribute('aria-haspopup', 'dialog');

  ['pointerenter', 'focus'].forEach((type) => {
    anchor.addEventListener(type, preconnectSdk, { once: true });
  });

  anchor.addEventListener('click', (event) => {
    // Once the SDK is up it owns this click — its own listener cancels the navigation and
    // opens the modal, so stay out of the way.
    if (sdkReady) return;

    event.preventDefault();
    if (anchor.dataset.classyOpening === 'true') return;

    anchor.dataset.classyOpening = 'true';
    anchor.setAttribute('aria-busy', 'true');
    trackEvent('donate_click', { campaign_id: id });

    initClassyGiving()
      .then(() => replayClick(anchor))
      .catch(goToFallback)
      .finally(() => {
        delete anchor.dataset.classyOpening;
        anchor.removeAttribute('aria-busy');
      });
  });
}

/**
 * Bind every authored link that already points at a Classy checkout — a pasted
 * give.missingkids.org campaign URL, or anything carrying `?campaign=`. Binding is local
 * only; nothing is fetched until someone clicks.
 * @param {Element|Document} root
 */
export function decorateDonateLinks(root = document) {
  if (!root) return;

  root.querySelectorAll('a[href]').forEach((anchor) => {
    if (anchor.dataset.classyCampaign) return;
    const campaign = readCampaign(anchor.getAttribute('href'));
    if (campaign) markDonateTrigger(anchor, campaign.id);
  });
}
