import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import {
  debounce,
  fetchSiteSearch,
  normalizeApiBaseUrl,
  readSearchState,
  writeSearchState,
} from '../../scripts/search-utils.js';
import getSiteSearchConfig from '../../scripts/site-search-config.js';
import resolveSiteHref from '../../scripts/link-utils.js';

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'search api base url'],
  pageSize: ['page size', 'items per page', 'limit'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
  emptyStateHeading: ['empty state heading', 'empty heading'],
  emptyStateCopy: ['empty state copy', 'empty copy'],
};

const FIELD_COLUMN_INDEX = {
  heading: 0,
  apiBaseUrl: 1,
  pageSize: 2,
  searchPlaceholder: 3,
  loadMoreText: 4,
  emptyStateHeading: 5,
  emptyStateCopy: 6,
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeToken(value) {
  return normalizeText(value).toLowerCase();
}

function parseIntSafe(value, fallback = 12) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
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
  if (columnIndex === undefined) return fallback;

  const value = rows.map((row) => {
    const cell = [...row.children][columnIndex];
    if (!cell) return '';
    const anchor = cell.querySelector('a');
    return normalizeText(anchor?.getAttribute('href') || cell.textContent);
  }).find(Boolean);

  return value || fallback;
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

function createFilterSelect(label) {
  const select = document.createElement('select');
  select.className = 'site-search-filter';
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
}

function createChip(label, onRemove) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'site-search-chip';
  chip.textContent = label;
  chip.addEventListener('click', onRemove);
  return chip;
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value));
  } catch (e) {
    return '';
  }
}

function buildResultCard(result, index = 0) {
  const article = document.createElement('article');
  article.className = 'site-search-card';
  article.style.setProperty('--site-search-index', String(index % 12));

  if (result.image_url) {
    const media = document.createElement('div');
    media.className = 'site-search-card-media';
    media.append(
      createOptimizedPicture(
        result.image_url,
        result.title || 'Search result image',
        false,
        [{ width: '750' }, { width: '1200' }],
      ),
    );
    article.append(media);
  }

  const body = document.createElement('div');
  body.className = 'site-search-card-body';

  const meta = document.createElement('div');
  meta.className = 'site-search-card-meta';

  if (result.document_type_label) {
    const type = document.createElement('span');
    type.className = 'site-search-card-type';
    type.textContent = result.document_type_label;
    meta.append(type);
  }

  const published = formatDate(result.published_at);
  if (published) {
    const date = document.createElement('span');
    date.className = 'site-search-card-date';
    date.textContent = published;
    meta.append(date);
  }

  if (meta.children.length) body.append(meta);

  const title = document.createElement('h3');
  title.className = 'site-search-card-title';
  const titleLink = document.createElement('a');
  const href = resolveSiteHref(result.url);
  titleLink.href = href;
  if (normalizeText(result.title_html)) {
    titleLink.innerHTML = result.title_html;
  } else {
    titleLink.textContent = result.title || 'Search Result';
  }
  title.append(titleLink);
  body.append(title);

  if (normalizeText(result.summary_html || result.summary)) {
    const summary = document.createElement('p');
    summary.className = 'site-search-card-summary';
    if (normalizeText(result.summary_html)) {
      summary.innerHTML = result.summary_html;
    } else {
      summary.textContent = result.summary;
    }
    body.append(summary);
  }

  if (normalizeText(result.url)) {
    const url = document.createElement('p');
    url.className = 'site-search-card-url';
    url.textContent = result.url;
    body.append(url);
  }

  const cta = document.createElement('a');
  cta.className = 'site-search-card-link';
  cta.href = href;
  cta.textContent = 'Open Result';
  body.append(cta);

  article.append(body);
  return article;
}

function buildShell(config) {
  const inner = document.createElement('div');
  inner.className = 'site-search-inner';

  const header = document.createElement('div');
  header.className = 'site-search-header';
  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'site-search-heading';
    heading.textContent = config.heading;
    header.append(heading);
  }

  const controls = document.createElement('div');
  controls.className = 'site-search-controls';

  const searchWrap = document.createElement('label');
  searchWrap.className = 'site-search-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'site-search-search';
  searchInput.type = 'search';
  searchInput.placeholder = config.searchPlaceholder;
  searchWrap.append(searchInput);
  controls.append(searchWrap);

  const typeSelect = createFilterSelect('Type');
  controls.append(typeSelect);
  header.append(controls);
  inner.append(header);

  const meta = document.createElement('div');
  meta.className = 'site-search-meta';
  const activeFilters = document.createElement('div');
  activeFilters.className = 'site-search-active-filters';
  const clearAllButton = document.createElement('button');
  clearAllButton.className = 'site-search-clear-all';
  clearAllButton.type = 'button';
  clearAllButton.textContent = 'Clear Filters';
  clearAllButton.hidden = true;
  const count = document.createElement('p');
  count.className = 'site-search-count';
  meta.append(activeFilters, clearAllButton, count);
  inner.append(meta);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'site-search-grid';

  const message = document.createElement('div');
  message.className = 'site-search-message';
  const messageHeading = document.createElement('h3');
  messageHeading.className = 'site-search-message-title';
  const messageCopy = document.createElement('p');
  messageCopy.className = 'site-search-message-copy';
  message.append(messageHeading, messageCopy);

  const footer = document.createElement('div');
  footer.className = 'site-search-footer';
  const loadMoreButton = document.createElement('button');
  loadMoreButton.className = 'site-search-load-more';
  loadMoreButton.type = 'button';
  loadMoreButton.textContent = config.loadMoreText;
  footer.append(loadMoreButton);
  inner.append(cardsContainer, message, footer);

  return {
    inner,
    searchInput,
    typeSelect,
    activeFilters,
    clearAllButton,
    count,
    cardsContainer,
    message,
    messageHeading,
    messageCopy,
    loadMoreButton,
  };
}

async function renderSearch(block, config) {
  const layout = buildShell(config);
  const {
    inner,
    searchInput,
    typeSelect,
    activeFilters,
    clearAllButton,
    count,
    cardsContainer,
    message,
    messageHeading,
    messageCopy,
    loadMoreButton,
  } = layout;

  const initialState = readSearchState();
  const state = {
    query: initialState.query,
    selectedTypes: new Set(initialState.types),
    page: 0,
    lastPage: 1,
    total: 0,
    loading: false,
  };
  const typeLabels = new Map();
  let loadResults = async () => {};

  const updateMessage = (heading, copy = '') => {
    messageHeading.textContent = heading;
    messageCopy.textContent = copy;
    message.hidden = false;
  };

  const syncUrl = () => {
    writeSearchState({
      query: state.query,
      types: [...state.selectedTypes],
    });
  };

  const renderActiveFilters = () => {
    activeFilters.replaceChildren();
    [...state.selectedTypes].forEach((value) => {
      const label = typeLabels.get(value) || value;
      activeFilters.append(createChip(label, () => {
        state.selectedTypes.delete(value);
        syncUrl();
        loadResults(true);
      }));
    });

    clearAllButton.hidden = !state.selectedTypes.size && !state.query.trim();
  };

  const setTypeOptions = (filters = {}) => {
    const typeOptions = filters.types || [];
    setFilterOptions(typeSelect, 'Type', typeOptions);
    typeOptions.forEach((option) => typeLabels.set(normalizeToken(option.value), option.label));
  };

  loadResults = async (reset = false) => {
    if (state.loading) return;

    if (!state.query.trim()) {
      cardsContainer.replaceChildren();
      count.textContent = '';
      loadMoreButton.hidden = true;
      renderActiveFilters();
      updateMessage('Start searching', 'Enter a keyword above to search the site.');
      return;
    }

    if (reset) {
      state.page = 0;
      state.lastPage = 1;
      cardsContainer.replaceChildren();
    }

    state.loading = true;
    loadMoreButton.disabled = true;
    if (!cardsContainer.children.length) updateMessage('Searching...', '');

    try {
      const payload = await fetchSiteSearch({
        apiBaseUrl: config.apiBaseUrl,
        query: state.query,
        types: [...state.selectedTypes],
        page: reset ? 1 : state.page + 1,
        perPage: config.pageSize,
      });

      setTypeOptions(payload.filters || {});
      renderActiveFilters();

      const startIndex = cardsContainer.children.length;
      (payload.data || []).forEach((result, index) => {
        cardsContainer.append(buildResultCard(result, startIndex + index));
      });

      state.page = payload.meta?.current_page || 1;
      state.lastPage = payload.meta?.last_page || 1;
      state.total = payload.meta?.total ?? cardsContainer.children.length;
      count.textContent = state.total
        ? `Showing ${cardsContainer.children.length} of ${state.total} results`
        : 'Showing 0 results';

      if (cardsContainer.children.length) {
        message.hidden = true;
      } else {
        updateMessage(
          config.emptyStateHeading,
          config.emptyStateCopy,
        );
      }

      loadMoreButton.hidden = state.page >= state.lastPage || state.total === 0;
    } catch (error) {
      cardsContainer.replaceChildren();
      count.textContent = '';
      loadMoreButton.hidden = true;
      updateMessage('Search unavailable', error?.message || 'The search API request failed.');
    }

    loadMoreButton.disabled = false;
    state.loading = false;
  };

  searchInput.value = state.query;
  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value;
    syncUrl();
    loadResults(true);
  }));

  typeSelect.addEventListener('change', () => {
    if (!typeSelect.value) return;
    state.selectedTypes.add(normalizeToken(typeSelect.value));
    typeSelect.value = '';
    syncUrl();
    loadResults(true);
  });

  clearAllButton.addEventListener('click', () => {
    state.query = '';
    state.selectedTypes.clear();
    searchInput.value = '';
    syncUrl();
    loadResults(true);
  });

  loadMoreButton.addEventListener('click', () => {
    loadResults(false);
  });

  window.addEventListener('popstate', () => {
    const urlState = readSearchState();
    state.query = urlState.query;
    state.selectedTypes = new Set(urlState.types);
    searchInput.value = state.query;
    loadResults(true);
  });

  block.replaceChildren(inner);
  await loadResults(true);
}

export default async function decorate(block) {
  const siteSearchConfig = getSiteSearchConfig();
  const config = {
    heading: getFieldValue(block, 'heading', 'Search the Site'),
    apiBaseUrl: normalizeApiBaseUrl(
      getFieldValue(block, 'apiBaseUrl')
      || siteSearchConfig.apiBaseUrl
      || getMetadata('search-api-base-url'),
    ),
    pageSize: parseIntSafe(getFieldValue(block, 'pageSize', '12'), 12),
    searchPlaceholder: getFieldValue(
      block,
      'searchPlaceholder',
      siteSearchConfig.placeholder || getMetadata('search-placeholder') || 'Search the site',
    ) || 'Search the site',
    loadMoreText: getFieldValue(block, 'loadMoreText', 'Load More Results') || 'Load More Results',
    emptyStateHeading: getFieldValue(block, 'emptyStateHeading', 'No results found') || 'No results found',
    emptyStateCopy: getFieldValue(block, 'emptyStateCopy', 'Try a different keyword or remove a filter.') || 'Try a different keyword or remove a filter.',
  };

  await renderSearch(block, config);
}
