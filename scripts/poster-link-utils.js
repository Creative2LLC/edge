// The 2026-11-12 restructure moved the posters page under Get Help. Blocks authored before
// it still name the old path, which now 404s, so every poster link is rebuilt on the new one.
export const DEFAULT_POSTER_PAGE_PATH = '/get-help/missing-children-posters';
const MOVED_POSTER_PAGE_RE = /^(\/content\/edge)?(\/[a-z]{2})?\/missing-children-posters(\.html)?\/?$/i;

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function posterPageUrl(posterPagePath = DEFAULT_POSTER_PAGE_PATH) {
  const value = normalizeText(posterPagePath) || DEFAULT_POSTER_PAGE_PATH;
  const url = new URL(value, window.location.origin);
  url.pathname = url.pathname.replace(
    MOVED_POSTER_PAGE_RE,
    (match, author = '', locale = '', html = '') => `${author}${locale}/get-help/missing-children-posters${html}`,
  );
  return url;
}

function sameOriginHref(url) {
  if (url.origin !== window.location.origin) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

function appendOptionalParams(url, values = {}) {
  Object.entries(values).forEach(([key, value]) => {
    const normalizedValue = normalizeText(value);
    if (normalizedValue) url.searchParams.set(key, normalizedValue);
  });
}

export function buildPosterDetailHref({
  provider,
  caseNumber,
  sequenceNumber = '1',
  posterPagePath = DEFAULT_POSTER_PAGE_PATH,
  details = {},
} = {}) {
  const normalizedProvider = normalizeText(provider).toUpperCase();
  const normalizedCaseNumber = normalizeText(caseNumber);
  const normalizedSequence = normalizeText(sequenceNumber) || '1';
  if (!normalizedProvider || !normalizedCaseNumber) return '';

  const url = posterPageUrl(posterPagePath);
  url.searchParams.set('poster', [
    normalizedProvider,
    normalizedCaseNumber,
    normalizedSequence,
  ].join('/'));
  appendOptionalParams(url, details);
  return sameOriginHref(url);
}

export function buildCleanPosterPath({
  provider,
  caseNumber,
  sequenceNumber = '1',
} = {}) {
  const normalizedProvider = normalizeText(provider).toUpperCase();
  const normalizedCaseNumber = normalizeText(caseNumber);
  const normalizedSequence = normalizeText(sequenceNumber) || '1';
  if (!normalizedProvider || !normalizedCaseNumber) return '';

  return `/poster/${[
    normalizedProvider,
    normalizedCaseNumber,
    normalizedSequence,
  ].map((segment) => encodeURIComponent(segment)).join('/')}`;
}

export function buildAmberPosterDetailHref({
  caseNumber,
  sequenceNumber = '1',
  personId = '',
  name = '',
  posterPagePath = DEFAULT_POSTER_PAGE_PATH,
  preview = false,
} = {}) {
  const normalizedCaseNumber = normalizeText(caseNumber);
  if (!normalizedCaseNumber) return '';

  const url = posterPageUrl(posterPagePath);
  // A preview (the built-in sample, or an archived staging case) opens through
  // amber_preview, which the posters page reads from the preview endpoint.
  url.searchParams.set(preview ? 'amber_preview' : 'amber_case', normalizedCaseNumber);
  url.searchParams.set('seq', normalizeText(sequenceNumber) || '1');
  if (personId) url.searchParams.set('person_id', normalizeText(personId));
  if (name) url.searchParams.set('name', normalizeText(name));
  return sameOriginHref(url);
}

export function currentPosterPagePath(fallback = DEFAULT_POSTER_PAGE_PATH) {
  const pathname = window.location.pathname.replace(/\/+$/g, '') || '/';
  const normalizedPath = pathname
    .replace(/^\/content\/edge(?=\/)/, '')
    .replace(/\.html$/i, '');
  const segments = normalizedPath.split('/').filter(Boolean);
  const posterIndex = segments[0] === 'poster' || (segments[0]?.length === 2 && segments[1] === 'poster');

  return posterIndex ? fallback : pathname;
}
