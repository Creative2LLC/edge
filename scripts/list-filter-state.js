function parseCsvList(value = '') {
  return `${value || ''}`
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index);
}

function readFacetState(params, names) {
  const present = names.some((name) => params.has(name));
  if (!present) {
    return { present: false, values: [] };
  }

  const rawValues = names.flatMap((name) => params.getAll(name));
  return {
    present: true,
    values: parseCsvList(rawValues.join(',')),
  };
}

function writeFacetState(searchParams, primaryName, fallbackNames, values) {
  [primaryName, ...fallbackNames].forEach((name) => searchParams.delete(name));

  const normalized = [...new Set(
    (values || [])
      .map((entry) => `${entry || ''}`.trim().toLowerCase())
      .filter(Boolean),
  )];

  if (normalized.length) {
    searchParams.set(primaryName, normalized.join(','));
  }
}

export function readListFilterState(search = window.location.search) {
  const params = new URLSearchParams(search);
  const view = `${params.get('view') || ''}`.trim().toLowerCase();

  return {
    query: (params.get('search') || params.get('q') || '').trim(),
    hasQuery: params.has('search') || params.has('q'),
    audiences: readFacetState(params, ['audiences', 'audiences[]', 'audience']),
    issues: readFacetState(params, ['issues', 'issues[]', 'issue']),
    types: readFacetState(params, ['types', 'types[]', 'type']),
    tags: readFacetState(params, ['tags', 'tags[]', 'tag']),
    view: view === 'list' ? 'list' : 'grid',
  };
}

export function writeListFilterState({
  query = '',
  audiences = [],
  issues = [],
  types = [],
  tags = [],
  view = '',
}, replace = true) {
  const url = new URL(window.location.href);
  const normalizedQuery = `${query || ''}`.trim();
  const normalizedView = `${view || ''}`.trim().toLowerCase();

  if (normalizedQuery) url.searchParams.set('search', normalizedQuery);
  else url.searchParams.delete('search');

  url.searchParams.delete('q');
  writeFacetState(url.searchParams, 'audiences', ['audiences[]', 'audience'], audiences);
  writeFacetState(url.searchParams, 'issues', ['issues[]', 'issue'], issues);
  writeFacetState(url.searchParams, 'types', ['types[]', 'type'], types);
  writeFacetState(url.searchParams, 'tags', ['tags[]', 'tag'], tags);
  if (normalizedView === 'list') url.searchParams.set('view', 'list');
  else if (normalizedView === 'grid') url.searchParams.set('view', 'grid');
  else url.searchParams.delete('view');

  if (replace) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
}

export function buildListFilterHref(basePath, {
  query = '',
  audiences = [],
  issues = [],
  types = [],
  tags = [],
  view = '',
} = {}) {
  const url = new URL(basePath, window.location.origin);
  const normalizedQuery = `${query || ''}`.trim();
  const normalizedView = `${view || ''}`.trim().toLowerCase();

  if (normalizedQuery) url.searchParams.set('search', normalizedQuery);
  writeFacetState(url.searchParams, 'audiences', ['audiences[]', 'audience'], audiences);
  writeFacetState(url.searchParams, 'issues', ['issues[]', 'issue'], issues);
  writeFacetState(url.searchParams, 'types', ['types[]', 'type'], types);
  writeFacetState(url.searchParams, 'tags', ['tags[]', 'tag'], tags);
  if (normalizedView === 'list') url.searchParams.set('view', 'list');
  else if (normalizedView === 'grid') url.searchParams.set('view', 'grid');

  return `${url.pathname}${url.search}${url.hash}`;
}
