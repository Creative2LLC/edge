export function normalizeApiBaseUrl(value = '') {
  const normalized = `${value || ''}`.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(normalized) ? normalized : '';
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
  const view = `${params.get('view') || ''}`.trim().toLowerCase();
  const pageRaw = parseInt(params.get('page') || '', 10);

  return {
    query: (params.get('q') || params.get('search') || '').trim(),
    types: parseCsvList(directTypes.join(',') || fallbackTypes.join(',')),
    view: view === 'list' ? 'list' : 'grid',
    page: Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw,
  };
}

export function writeSearchState({ query, types = [], view = '', page = 1 }, replace = true) {
  const url = new URL(window.location.href);
  const normalizedQuery = `${query || ''}`.trim();
  const normalizedTypes = [...new Set(types.map((entry) => `${entry || ''}`.trim().toLowerCase()).filter(Boolean))];
  const normalizedView = `${view || ''}`.trim().toLowerCase();
  const normalizedPage = parseInt(page, 10);

  if (normalizedQuery) url.searchParams.set('q', normalizedQuery);
  else url.searchParams.delete('q');

  url.searchParams.delete('search');
  url.searchParams.delete('type');

  if (normalizedTypes.length) url.searchParams.set('types', normalizedTypes.join(','));
  else url.searchParams.delete('types');

  if (normalizedView === 'list') url.searchParams.set('view', 'list');
  else if (normalizedView === 'grid') url.searchParams.set('view', 'grid');
  else url.searchParams.delete('view');

  if (!Number.isNaN(normalizedPage) && normalizedPage > 1) url.searchParams.set('page', String(normalizedPage));
  else url.searchParams.delete('page');

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
  locale = '',
  page = 1,
  perPage = 12,
}) {
  const apiRoot = normalizeApiBaseUrl(apiBaseUrl);
  if (!apiRoot) {
    throw new Error('Search API is not configured.');
  }

  const url = new URL('/api/search', `${apiRoot}/`);

  if (`${query || ''}`.trim()) url.searchParams.set('q', `${query}`.trim());
  if (types.length) url.searchParams.set('types', types.join(','));
  if (`${locale || ''}`.trim()) url.searchParams.set('locale', `${locale}`.trim());
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', String(perPage));

  return fetchJson(url);
}

export async function fetchSiteSearchSuggestions({
  apiBaseUrl,
  query,
  types = [],
  locale = '',
  perPage = 6,
}) {
  const apiRoot = normalizeApiBaseUrl(apiBaseUrl);
  if (!apiRoot) {
    throw new Error('Search API is not configured.');
  }

  const url = new URL('/api/search/suggest', `${apiRoot}/`);

  if (`${query || ''}`.trim()) url.searchParams.set('q', `${query}`.trim());
  if (types.length) url.searchParams.set('types', types.join(','));
  if (`${locale || ''}`.trim()) url.searchParams.set('locale', `${locale}`.trim());
  url.searchParams.set('per_page', String(perPage));

  return fetchJson(url);
}
