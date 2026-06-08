const DEFAULT_POSTER_PAGE_PATH = '/missing-children-posters';

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function posterPageUrl(posterPagePath = DEFAULT_POSTER_PAGE_PATH) {
  const value = normalizeText(posterPagePath) || DEFAULT_POSTER_PAGE_PATH;
  return new URL(value, window.location.origin);
}

function sameOriginHref(url) {
  if (url.origin !== window.location.origin) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildPosterDetailHref({
  provider,
  caseNumber,
  sequenceNumber = '1',
  posterPagePath = DEFAULT_POSTER_PAGE_PATH,
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
} = {}) {
  const normalizedCaseNumber = normalizeText(caseNumber);
  if (!normalizedCaseNumber) return '';

  const url = posterPageUrl(posterPagePath);
  url.searchParams.set('amber_case', normalizedCaseNumber);
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
