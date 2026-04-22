export function normalizeApiBaseUrl(value = '') {
  return `${value || ''}`.trim().replace(/\/+$/, '');
}

export function normalizeSitePath(value = '', fallback = '/search/') {
  const normalized = `${value || ''}`.trim();
  if (!normalized) return fallback;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `/${normalized.replace(/^\/+/, '').replace(/\/?$/, '/')}`;
}

export function debounce(callback, wait = 250) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

function parseCsvList(value) {
  return `${value || ''}`
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index);
}

export function readSearchState(search = window.location.search) {
  const params = new URLSearchParams(search);
  const directTypes = params.getAll('types');
  const fallbackTypes = params.getAll('type');

  return {
    query: (params.get('q') || params.get('search') || '').trim(),
    types: parseCsvList(directTypes.join(',') || fallbackTypes.join(',')),
  };
}

export function writeSearchState({ query, types = [] }, replace = true) {
  const url = new URL(window.location.href);
  const normalizedQuery = `${query || ''}`.trim();
  const normalizedTypes = [...new Set(types.map((entry) => `${entry || ''}`.trim().toLowerCase()).filter(Boolean))];

  if (normalizedQuery) url.searchParams.set('q', normalizedQuery);
  else url.searchParams.delete('q');

  url.searchParams.delete('search');
  url.searchParams.delete('type');

  if (normalizedTypes.length) url.searchParams.set('types', normalizedTypes.join(','));
  else url.searchParams.delete('types');

  if (replace) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
}

async function fetchJson(url) {
  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}.`);
  }

  return response.json();
}

export async function fetchSiteSearch({
  apiBaseUrl,
  query,
  types = [],
  page = 1,
  perPage = 12,
}) {
  const apiRoot = normalizeApiBaseUrl(apiBaseUrl) || window.location.origin;
  const url = new URL('/api/search', `${apiRoot}/`);

  if (`${query || ''}`.trim()) url.searchParams.set('q', `${query}`.trim());
  if (types.length) url.searchParams.set('types', types.join(','));
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));

  return fetchJson(url);
}

export async function fetchSiteSearchSuggestions({
  apiBaseUrl,
  query,
  types = [],
  perPage = 6,
}) {
  const apiRoot = normalizeApiBaseUrl(apiBaseUrl) || window.location.origin;
  const url = new URL('/api/search/suggest', `${apiRoot}/`);

  if (`${query || ''}`.trim()) url.searchParams.set('q', `${query}`.trim());
  if (types.length) url.searchParams.set('types', types.join(','));
  url.searchParams.set('per_page', String(perPage));

  return fetchJson(url);
}
