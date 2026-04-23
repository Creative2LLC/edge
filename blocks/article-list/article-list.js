import { createOptimizedPicture } from '../../scripts/aem.js';
import resolveSiteHref from '../../scripts/link-utils.js';

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'article api base url', 'article api url'],
  selected: ['selected', 'selected ids', 'selected slugs', 'article ids', 'selected articles'],
  exclude: ['exclude', 'exclude slugs', 'excluded slugs', 'excluded articles'],
  filters: ['filters', 'preset filters'],
  pageSize: ['page size', 'items per page', 'limit', 'initial count'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
  audiencePreset: ['audience preset', 'preset audience', 'default audience'],
  issuePreset: ['issue preset', 'preset issue', 'default issue'],
  tagPreset: ['tag preset', 'preset tag', 'default tag'],
};

const FIELD_COLUMN_INDEX = {
  heading: 0,
  apiBaseUrl: 1,
  selected: 2,
  exclude: 3,
  filters: 4,
  pageSize: 5,
  searchPlaceholder: 6,
  loadMoreText: 7,
  audiencePreset: 8,
  issuePreset: 9,
  tagPreset: 10,
};

function normalizeText(value) { return `${value || ''}`.trim(); }
function normalizeToken(value) { return normalizeText(value).toLowerCase(); }
function parseIntSafe(value, fallback = 9) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}
function normalizeApiBaseUrl(value) { return normalizeText(value).replace(/\/+$/, ''); }
function getRows(block) { return [...block.querySelectorAll(':scope > div')]; }

function parseList(value) {
  const seen = new Set();
  return `${value || ''}`.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => {
    const key = normalizeToken(entry);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseKeyValueLines(value) {
  return `${value || ''}`.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean).reduce((map, entry) => {
    const [rawKey, ...rawValue] = entry.split(':');
    if (!rawValue.length) return map;
    map[normalizeToken(rawKey)] = rawValue.join(':').trim();
    return map;
  }, {});
}

function parseFilterLists(value) {
  const map = parseKeyValueLines(value);
  return {
    audience: parseList(map.audience || map.audiences),
    issue: parseList(map.issue || map.issues),
    tags: parseList(map.tag || map.tags),
  };
}

function splitSelectedArticles(values) {
  return values.reduce((accumulator, value) => {
    if (/^\d+$/.test(value)) accumulator.ids.push(value);
    else accumulator.slugs.push(value);
    return accumulator;
  }, { ids: [], slugs: [] });
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function getPropValue(scope, name) {
  const node = scope.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  if (!node) return '';
  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || node.getAttribute('href') || node.textContent);
}

function readConfigValue(rows, name, fallback = '') {
  const propValue = rows.map((row) => row.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`)).find(Boolean);
  if (propValue) {
    const anchor = propValue.tagName === 'A' ? propValue : propValue.querySelector('a');
    return normalizeText(anchor?.getAttribute('href') || propValue.getAttribute('href') || propValue.textContent) || fallback;
  }

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex !== undefined) {
    const value = rows.map((row) => {
      const cell = [...row.children][columnIndex];
      if (!cell) return '';
      const anchor = cell.querySelector('a');
      if (anchor) return normalizeText(anchor.getAttribute('href') || anchor.textContent);
      if (name === 'apiBaseUrl') return findUrlLikeValue(cell.textContent) || normalizeText(cell.textContent);
      return normalizeText(cell.textContent);
    }).find(Boolean);
    if (value) return value;
  }

  if (name === 'apiBaseUrl') {
    const url = rows.map((row) => row.querySelector('a')?.href || findUrlLikeValue(row.textContent)).find(Boolean);
    if (url) return normalizeText(url);
  }

  return fallback;
}

function getLegacyValue(block, name) {
  const labels = FIELD_LABELS[name] || [];
  const row = getRows(block).find((entry) => entry.children.length === 2 && labels.some((label) => {
    const key = normalizeText(entry.children[0].textContent).toLowerCase();
    return key === label || key.includes(label);
  }));
  if (!row) return '';
  const valueCell = row.children[1];
  const anchor = valueCell.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || valueCell.textContent);
}

function getFieldValue(block, name, fallback = '') {
  const rows = getRows(block);
  return getPropValue(block, name)
    || readConfigValue(rows, name)
    || getLegacyValue(block, name)
    || fallback;
}

function buildMessage(title, description) {
  const wrapper = document.createElement('div');
  wrapper.className = 'article-list-message';
  const heading = document.createElement('h2');
  heading.className = 'article-list-message-title';
  heading.textContent = title;
  wrapper.append(heading);
  if (description) {
    const text = document.createElement('p');
    text.className = 'article-list-message-copy';
    text.textContent = description;
    wrapper.append(text);
  }
  return wrapper;
}

function buildPill(label, className = '') {
  const pill = document.createElement('span');
  pill.className = `article-list-pill ${className}`.trim();
  pill.textContent = label;
  return pill;
}

function createFilterSelect(label) {
  const select = document.createElement('select');
  select.className = 'article-list-filter';
  select.setAttribute('aria-label', label);
  return select;
}

function setFilterOptions(select, label, options = []) {
  select.replaceChildren();
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = label;
  select.append(defaultOption);
  options.forEach((option) => {
    const entry = document.createElement('option');
    entry.value = option.value;
    entry.textContent = option.label;
    select.append(entry);
  });
  select.disabled = options.length === 0;
}
function createChip(label, onRemove) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'article-list-active-chip';
  chip.append(buildPill(label, 'is-active-chip'));
  const close = document.createElement('span');
  close.className = 'article-list-active-chip-close';
  close.textContent = 'x';
  chip.append(close);
  chip.addEventListener('click', onRemove);
  return chip;
}

function debounce(callback, wait = 300) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

function buildCard(article, index = 0) {
  const card = document.createElement('article');
  card.className = 'article-list-card';
  card.style.setProperty('--article-card-index', String(index % 12));
  const linkHref = resolveSiteHref(article.primary_url || article.detail_path || article.page_path);

  if (linkHref) {
    const cover = document.createElement('a');
    cover.className = 'article-list-card-link-cover';
    cover.href = linkHref;
    cover.setAttribute('aria-label', article.title || 'Open article');
    card.append(cover);
  }

  const image = article.thumbnail || article.header_image;
  if (image) {
    const media = document.createElement('div');
    media.className = 'article-list-card-media';
    media.append(
      createOptimizedPicture(
        image,
        article.title || 'Article image',
        false,
        [{ width: '750' }, { width: '1200' }],
      ),
    );
    card.append(media);
  }

  const body = document.createElement('div');
  body.className = 'article-list-card-body';
  const taxonomyValues = [article.audience_label, article.issue_label].filter(Boolean);
  if (taxonomyValues.length) {
    const taxonomy = document.createElement('div');
    taxonomy.className = 'article-list-taxonomy';
    taxonomyValues.forEach((value) => taxonomy.append(buildPill(value, 'is-taxonomy')));
    body.append(taxonomy);
  }

  if (normalizeText(article.article_date_label)) {
    const date = document.createElement('p');
    date.className = 'article-list-card-date';
    date.textContent = article.article_date_label;
    body.append(date);
  }

  const title = document.createElement('h3');
  title.className = 'article-list-card-title';
  title.textContent = article.title || 'Article';
  body.append(title);

  if (normalizeText(article.excerpt)) {
    const excerpt = document.createElement('p');
    excerpt.className = 'article-list-card-excerpt';
    excerpt.textContent = article.excerpt;
    body.append(excerpt);
  }

  const tags = (article.tags || [])
    .map((tag) => normalizeText(tag.name))
    .filter(Boolean)
    .slice(0, 3);
  if (tags.length) {
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'article-list-tags';
    tags.forEach((tag) => tagsWrap.append(buildPill(tag)));
    body.append(tagsWrap);
  }

  if (linkHref) {
    const link = document.createElement('a');
    link.className = 'article-list-card-link';
    link.href = linkHref;
    link.textContent = 'Read Article';
    body.append(link);
  }

  card.append(body);
  return card;
}

function buildShell(config) {
  const inner = document.createElement('div');
  inner.className = 'article-list-inner';
  const header = document.createElement('div');
  header.className = 'article-list-header';

  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'article-list-heading';
    heading.textContent = config.heading;
    header.append(heading);
  }

  const controls = document.createElement('div');
  controls.className = 'article-list-controls';
  const searchWrap = document.createElement('label');
  searchWrap.className = 'article-list-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'article-list-search';
  searchInput.type = 'search';
  searchInput.placeholder = config.searchPlaceholder;
  searchWrap.append(searchInput);
  controls.append(searchWrap);

  const audienceSelect = createFilterSelect('Audience');
  const issueSelect = createFilterSelect('Issue');
  const tagSelect = createFilterSelect('Tag');
  controls.append(audienceSelect, issueSelect, tagSelect);
  header.append(controls);
  inner.append(header);

  const meta = document.createElement('div');
  meta.className = 'article-list-meta';
  const activeFilters = document.createElement('div');
  activeFilters.className = 'article-list-active-filters';
  const clearAllButton = document.createElement('button');
  clearAllButton.className = 'article-list-clear-all';
  clearAllButton.type = 'button';
  clearAllButton.textContent = 'Clear Filters';
  clearAllButton.hidden = true;
  const count = document.createElement('p');
  count.className = 'article-list-count';
  meta.append(activeFilters, clearAllButton, count);
  inner.append(meta);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'article-list-grid';
  const emptyState = document.createElement('p');
  emptyState.className = 'article-list-empty';
  emptyState.hidden = true;
  emptyState.textContent = 'No articles match your current filters.';
  const footer = document.createElement('div');
  footer.className = 'article-list-footer';
  const loadMoreButton = document.createElement('button');
  loadMoreButton.className = 'article-list-load-more';
  loadMoreButton.type = 'button';
  loadMoreButton.textContent = config.loadMoreText;
  footer.append(loadMoreButton);
  inner.append(cardsContainer, emptyState, footer);

  return {
    inner,
    searchInput,
    audienceSelect,
    issueSelect,
    tagSelect,
    activeFilters,
    clearAllButton,
    count,
    cardsContainer,
    emptyState,
    loadMoreButton,
  };
}

async function renderApiList(block, config) {
  const layout = buildShell(config);
  const {
    inner,
    searchInput,
    audienceSelect,
    issueSelect,
    tagSelect,
    activeFilters,
    clearAllButton,
    count,
    cardsContainer,
    emptyState,
    loadMoreButton,
  } = layout;
  const selected = splitSelectedArticles(parseList(config.selectedField));
  const excluded = parseList(config.excludeField);
  const state = {
    query: '',
    selectedAudience: new Set(parseList(config.audiencePreset).map(normalizeToken)),
    selectedIssue: new Set(parseList(config.issuePreset).map(normalizeToken)),
    selectedTags: new Set(parseList(config.tagPreset).map(normalizeToken)),
    page: 0,
    lastPage: 1,
    total: 0,
    loading: false,
  };
  const optionLabels = {
    audience: new Map(),
    issue: new Map(),
    tags: new Map(),
  };

  const updateFilters = (filters = {}) => {
    const audiences = filters.audiences || [];
    const issues = filters.issues || [];
    const tags = (filters.tags || []).map((tag) => ({
      value: tag.slug,
      label: tag.name,
    }));
    setFilterOptions(audienceSelect, 'Audience', audiences);
    setFilterOptions(issueSelect, 'Issue', issues);
    setFilterOptions(tagSelect, 'Tag', tags);
    optionLabels.audience = new Map(
      audiences.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.issue = new Map(
      issues.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.tags = new Map(
      tags.map((option) => [normalizeToken(option.value), option.label]),
    );
  };
  let refreshArticles = () => {};

  const renderActiveFilters = () => {
    activeFilters.replaceChildren();
    const facets = [
      ...[...state.selectedAudience].map((value) => ({ facet: 'audience', value })),
      ...[...state.selectedIssue].map((value) => ({ facet: 'issue', value })),
      ...[...state.selectedTags].map((value) => ({ facet: 'tags', value })),
    ];
    facets.forEach(({ facet, value }) => {
      const label = optionLabels[facet].get(value) || value;
      activeFilters.append(createChip(label, () => {
        if (facet === 'audience') state.selectedAudience.delete(value);
        if (facet === 'issue') state.selectedIssue.delete(value);
        if (facet === 'tags') state.selectedTags.delete(value);
        refreshArticles(true);
      }));
    });
    clearAllButton.hidden = !facets.length && !state.query.trim();
  };

  async function loadArticles(reset = false) {
    if (state.loading) return;
    if (reset) {
      state.page = 0;
      state.lastPage = 1;
      cardsContainer.replaceChildren();
      emptyState.hidden = true;
    }

    state.loading = true;
    if (!cardsContainer.children.length) count.textContent = 'Loading articles...';
    loadMoreButton.disabled = true;

    const url = new URL('/api/articles', `${config.apiBaseUrl}/`);
    url.searchParams.set('per_page', String(config.pageSize));
    url.searchParams.set('page', String(reset ? 1 : state.page + 1));
    if (state.query.trim()) url.searchParams.set('search', state.query.trim());
    state.selectedAudience.forEach((value) => url.searchParams.append('audiences[]', value));
    state.selectedIssue.forEach((value) => url.searchParams.append('issues[]', value));
    state.selectedTags.forEach((value) => url.searchParams.append('tags[]', value));
    selected.ids.forEach((value) => url.searchParams.append('ids[]', value));
    selected.slugs.forEach((value) => url.searchParams.append('slugs[]', value));
    excluded.forEach((value) => url.searchParams.append('exclude_slugs[]', value));

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}.`);
    const payload = await response.json();
    const startIndex = cardsContainer.children.length;
    (payload.data || []).forEach((article, index) => {
      cardsContainer.append(buildCard(article, startIndex + index));
    });

    state.page = payload.meta?.current_page || 1;
    state.lastPage = payload.meta?.last_page || 1;
    state.total = payload.meta?.total ?? cardsContainer.children.length;
    updateFilters(payload.filters || {});
    renderActiveFilters();

    const shown = cardsContainer.children.length;
    count.textContent = state.total ? `Showing ${shown} of ${state.total} articles` : 'Showing 0 articles';
    emptyState.hidden = shown > 0;
    loadMoreButton.hidden = state.page >= state.lastPage || state.total === 0;
    loadMoreButton.disabled = false;
    state.loading = false;
  }

  refreshArticles = loadArticles;

  const applyFacet = (select, set) => {
    if (!select.value) return;
    set.add(normalizeToken(select.value));
    select.value = '';
    loadArticles(true);
  };

  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value;
    loadArticles(true);
  }));
  audienceSelect.addEventListener('change', () => {
    applyFacet(audienceSelect, state.selectedAudience);
  });
  issueSelect.addEventListener('change', () => {
    applyFacet(issueSelect, state.selectedIssue);
  });
  tagSelect.addEventListener('change', () => {
    applyFacet(tagSelect, state.selectedTags);
  });
  loadMoreButton.addEventListener('click', () => loadArticles(false));
  clearAllButton.addEventListener('click', () => {
    state.query = '';
    state.selectedAudience.clear();
    state.selectedIssue.clear();
    state.selectedTags.clear();
    searchInput.value = '';
    loadArticles(true);
  });

  block.replaceChildren(inner);
  await loadArticles(true);
}

export default async function decorate(block) {
  const filters = parseFilterLists(getFieldValue(block, 'filters'));
  const config = {
    heading: getFieldValue(block, 'heading'),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl')),
    selectedField: getFieldValue(block, 'selected'),
    excludeField: getFieldValue(block, 'exclude'),
    pageSize: parseIntSafe(getFieldValue(block, 'pageSize', '9'), 9),
    searchPlaceholder: getFieldValue(
      block,
      'searchPlaceholder',
      'Search articles',
    ) || 'Search articles',
    loadMoreText: getFieldValue(
      block,
      'loadMoreText',
      'Load More Articles',
    ) || 'Load More Articles',
    audiencePreset: getFieldValue(block, 'audiencePreset') || filters.audience.join(', '),
    issuePreset: getFieldValue(block, 'issuePreset') || filters.issue.join(', '),
    tagPreset: getFieldValue(block, 'tagPreset') || filters.tags.join(', '),
  };

  block.replaceChildren(buildMessage('Loading articles...', ''));
  if (!config.apiBaseUrl) {
    block.replaceChildren(
      buildMessage(
        'Missing API configuration',
        'Set apiBaseUrl on this block so the article listing can load data.',
      ),
    );
    return;
  }

  try {
    await renderApiList(block, config);
  } catch (error) {
    block.replaceChildren(
      buildMessage(
        'Articles unavailable',
        error?.message || 'The article API request failed.',
      ),
    );
  }
}
