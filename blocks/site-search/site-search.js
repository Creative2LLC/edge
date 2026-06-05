import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import {
  debounce,
  fetchSiteSearch,
  normalizeApiBaseUrl,
  readSearchState,
  writeSearchState,
} from '../../scripts/search-utils.js';
import getSiteSearchConfig from '../../scripts/site-search-config.js';
import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import {
  createPaginationControls,
  isPaginationMode,
  normalizePaginationMode,
} from '../../scripts/pagination-controls.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'search api base url'],
  pageSize: ['page size', 'items per page', 'limit'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
  paginationMode: ['pagination mode', 'display mode', 'results mode'],
  emptyStateHeading: ['empty state heading', 'empty heading'],
  emptyStateCopy: ['empty state copy', 'empty copy'],
};

const FIELD_COLUMN_INDEX = {
  heading: 0,
  apiBaseUrl: 1,
  pageSize: 2,
  searchPlaceholder: 3,
  loadMoreText: 4,
  paginationMode: 5,
  emptyStateHeading: 6,
  emptyStateCopy: 7,
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function parseIntSafe(value, fallback = 12) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function getRows(block) {
  return getBlockRows(block);
}

function getPropValue(scope, name) {
  return normalizeText(readLinkField(scope, name).value || readTextField(scope, name).value);
}

function readConfigValue(rows, name, fallback = '') {
  const propValue = rows
    .map((row) => readLinkField(row, name).value || readTextField(row, name).value)
    .find(Boolean);
  if (propValue) {
    return normalizeText(propValue) || fallback;
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

function buildFallbackMedia() {
  const media = document.createElement('div');
  media.className = 'site-search-card-media site-search-card-media-placeholder';

  const badge = document.createElement('div');
  badge.className = 'site-search-card-media-fallback';

  const brandLogo = document.querySelector('header .nav-brand img');
  const logoSrc = brandLogo?.getAttribute('src') || brandLogo?.src;

  if (logoSrc) {
    const logo = document.createElement('img');
    logo.className = 'site-search-card-media-fallback-logo';
    logo.src = logoSrc;
    logo.alt = brandLogo?.alt || 'NCMEC';
    badge.append(logo);
  } else {
    const text = document.createElement('span');
    text.className = 'site-search-card-media-fallback-text';
    text.textContent = 'NCMEC';
    badge.append(text);
  }

  media.append(badge);
  return media;
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
  } else {
    article.classList.add('site-search-card-no-image');
    article.append(buildFallbackMedia());
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

  const cta = document.createElement('a');
  cta.className = 'site-search-card-link';
  cta.href = href;
  cta.textContent = 'Open Result';
  body.append(cta);

  article.append(body);
  return article;
}

function createViewToggleButton(label, view, activeView) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-search-view-button';
  button.dataset.view = view;
  button.setAttribute('aria-label', `${label} view`);
  button.title = label;
  const icon = document.createElement('span');
  icon.className = `site-search-view-icon site-search-view-icon-${view}`;
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = view === 'list'
    ? '<svg viewBox="0 0 20 20" fill="none"><path d="M4 5.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 10H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 14.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 20 20" fill="none"><rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>';
  button.append(icon);
  if (view === activeView) button.classList.add('is-active');
  button.setAttribute('aria-pressed', String(view === activeView));
  return button;
}

function syncTypeOptions(select, options = [], selectedType = '') {
  const normalizedSelected = normalizeText(selectedType).toLowerCase();
  select.replaceChildren();

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All Types';
  select.append(defaultOption);

  options.forEach((option) => {
    const value = normalizeText(option.value).toLowerCase();
    const label = normalizeText(option.label);
    if (!value || !label) return;

    const entry = document.createElement('option');
    entry.value = value;
    entry.textContent = label;
    select.append(entry);
  });

  const hasSelected = [...select.options].some((option) => option.value === normalizedSelected);
  select.value = hasSelected ? normalizedSelected : '';
  select.disabled = options.length === 0;

  return select.value;
}

function createTypeFilter() {
  const select = document.createElement('select');
  select.className = 'site-search-type-filter';
  select.setAttribute('aria-label', 'Result type');
  syncTypeOptions(select, [], '');

  return select;
}

function applyResultView(cardsContainer, buttons, view) {
  cardsContainer.dataset.view = view;
  buttons.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function buildShell(config) {
  const inner = document.createElement('div');
  inner.className = 'site-search-inner';

  const header = document.createElement('div');
  header.className = 'site-search-header';
  const headerTop = document.createElement('div');
  headerTop.className = 'site-search-header-top';
  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'site-search-heading';
    heading.textContent = config.heading;
    headerTop.append(heading);
  }

  const headerActions = document.createElement('div');
  headerActions.className = 'site-search-header-actions';

  const typeSelect = createTypeFilter();
  headerActions.append(typeSelect);

  const viewToggle = document.createElement('div');
  viewToggle.className = 'site-search-view-toggle';
  const gridButton = createViewToggleButton('Grid', 'grid', config.defaultView);
  const listButton = createViewToggleButton('List', 'list', config.defaultView);
  viewToggle.append(gridButton, listButton);
  headerActions.append(viewToggle);
  headerTop.append(headerActions);
  header.append(headerTop);

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
  header.append(controls);
  inner.append(header);

  const meta = document.createElement('div');
  meta.className = 'site-search-meta';
  const count = document.createElement('p');
  count.className = 'site-search-count';
  meta.append(count);
  inner.append(meta);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'site-search-grid';
  cardsContainer.dataset.view = config.defaultView;

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
  const pagination = createPaginationControls('site-search', 'Search results pagination');
  footer.append(loadMoreButton, pagination.nav);
  inner.append(cardsContainer, message, footer);

  return {
    inner,
    searchInput,
    typeSelect,
    viewButtons: [gridButton, listButton],
    count,
    cardsContainer,
    message,
    messageHeading,
    messageCopy,
    loadMoreButton,
    pagination,
  };
}

async function renderSearch(block, config) {
  const layout = buildShell(config);
  const {
    inner,
    searchInput,
    typeSelect,
    viewButtons,
    count,
    cardsContainer,
    message,
    messageHeading,
    messageCopy,
    loadMoreButton,
    pagination,
  } = layout;
  const usePagination = isPaginationMode(config.paginationMode);

  const initialState = readSearchState();
  const state = {
    query: initialState.query,
    type: initialState.types[0] || '',
    view: initialState.view || config.defaultView,
    page: 0,
    lastPage: 1,
    total: 0,
    loading: false,
  };
  let loadResults = async () => {};

  const updateMessage = (heading, copy = '') => {
    messageHeading.textContent = heading;
    messageCopy.textContent = copy;
    message.hidden = false;
  };

  const syncUrl = () => {
    writeSearchState({
      query: state.query,
      types: state.type ? [state.type] : [],
      view: state.view,
    });
  };

  const updatePagination = () => {
    if (!usePagination) {
      pagination.nav.hidden = true;
      return;
    }
    pagination.update({
      page: state.page,
      lastPage: state.lastPage,
      onPage: (page) => loadResults(true, page),
    });
  };

  loadResults = async (reset = false, targetPage = null) => {
    if (state.loading) return;

    if (reset) {
      state.page = 0;
      state.lastPage = 1;
      cardsContainer.replaceChildren();
    }

    state.loading = true;
    loadMoreButton.disabled = true;
    pagination.nav.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
    if (!cardsContainer.children.length) updateMessage('Loading results...', '');

    try {
      const nextPage = targetPage || (reset ? 1 : state.page + 1);
      const payload = await fetchSiteSearch({
        apiBaseUrl: config.apiBaseUrl,
        query: state.query,
        types: state.type ? [state.type] : [],
        locale: config.locale,
        page: nextPage,
        perPage: config.pageSize,
      });

      if (usePagination) cardsContainer.replaceChildren();
      const startIndex = cardsContainer.children.length;
      (payload.data || []).forEach((result, index) => {
        cardsContainer.append(buildResultCard(result, startIndex + index));
      });

      state.page = payload.meta?.current_page || 1;
      state.lastPage = payload.meta?.last_page || 1;
      state.total = payload.meta?.total ?? cardsContainer.children.length;
      const syncedType = syncTypeOptions(typeSelect, payload.filters?.types || [], state.type);
      if (state.type !== syncedType) {
        state.type = syncedType;
        syncUrl();
      }
      let shownStart = state.total ? 1 : 0;
      if (state.total && usePagination) {
        shownStart = ((state.page - 1) * config.pageSize) + 1;
      }
      const shownEnd = usePagination
        ? Math.min(state.page * config.pageSize, state.total)
        : cardsContainer.children.length;
      count.textContent = state.total
        ? `Showing ${shownStart}-${shownEnd} of ${state.total} results`
        : 'Showing 0 results';

      if (cardsContainer.children.length) {
        message.hidden = true;
      } else {
        updateMessage(
          config.emptyStateHeading,
          config.emptyStateCopy,
        );
      }

      loadMoreButton.hidden = usePagination || state.page >= state.lastPage || state.total === 0;
      updatePagination();
    } catch (error) {
      cardsContainer.replaceChildren();
      count.textContent = '';
      loadMoreButton.hidden = true;
      pagination.nav.hidden = true;
      updateMessage('Search unavailable', error?.message || 'The search API request failed.');
    }

    loadMoreButton.disabled = false;
    state.loading = false;
    updatePagination();
  };

  searchInput.value = state.query;
  typeSelect.value = state.type;
  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value;
    syncUrl();
    loadResults(true);
  }));
  typeSelect.addEventListener('change', () => {
    state.type = typeSelect.value;
    syncUrl();
    loadResults(true);
  });

  loadMoreButton.addEventListener('click', () => {
    loadResults(false);
  });

  viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.view === 'list' ? 'list' : 'grid';
      if (state.view === nextView) return;
      state.view = nextView;
      applyResultView(cardsContainer, viewButtons, state.view);
      syncUrl();
    });
  });

  window.addEventListener('popstate', () => {
    const urlState = readSearchState();
    state.query = urlState.query;
    state.type = urlState.types[0] || '';
    state.view = urlState.view || config.defaultView;
    searchInput.value = state.query;
    typeSelect.value = state.type;
    applyResultView(cardsContainer, viewButtons, state.view);
    loadResults(true);
  });

  applyResultView(cardsContainer, viewButtons, state.view);
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
    locale: currentSiteLocale(),
    defaultView: 'grid',
    searchPlaceholder: getFieldValue(
      block,
      'searchPlaceholder',
      siteSearchConfig.placeholder || getMetadata('search-placeholder') || 'Search the site',
    ) || 'Search the site',
    loadMoreText: getFieldValue(block, 'loadMoreText', 'Load More Results') || 'Load More Results',
    paginationMode: normalizePaginationMode(getFieldValue(block, 'paginationMode', 'load-more')),
    emptyStateHeading: getFieldValue(block, 'emptyStateHeading', 'No results found') || 'No results found',
    emptyStateCopy: getFieldValue(block, 'emptyStateCopy', 'Try a different keyword or phrase.') || 'Try a different keyword or phrase.',
  };

  await renderSearch(block, config);
}
