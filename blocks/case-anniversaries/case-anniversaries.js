import { createOptimizedPicture } from '../../scripts/aem.js';
import resolveSiteHref from '../../scripts/link-utils.js';

const DEFAULTS = {
  findHeading: 'Find Cases',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  endpointPath: '/api/case-anniversaries',
  posterPagePath: '/missing-children-posters.html',
  timeframe: 'thisWeek',
  pageSize: 8,
  searchPlaceholder: 'Search',
  loadMoreText: 'Load More',
  emptyMessage: 'No case anniversaries match your current filters.',
};

const EXTERNAL_LINK_ICON = new URL('./link-off-logo.svg', import.meta.url).href;

const FIELD_LABELS = {
  findHeading: ['find heading', 'results heading'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  endpointPath: ['endpoint path', 'endpoint'],
  posterPagePath: ['poster page path', 'poster page url', 'poster url'],
  timeframe: ['timeframe', 'term'],
  pageSize: ['page size', 'items per page', 'limit'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
  emptyMessage: ['empty message'],
};

const FIELD_COLUMN_INDEX = {
  findHeading: 0,
  apiBaseUrl: 1,
  endpointPath: 2,
  posterPagePath: 3,
  timeframe: 4,
  pageSize: 5,
  searchPlaceholder: 6,
  loadMoreText: 7,
  emptyMessage: 8,
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeToken(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function findUrlLikeValue(value) {
  return normalizeText(value).match(/https?:\/\/[^\s<>"']+/i)?.[0] || '';
}

function parseIntSafe(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function normalizeTimeframe(value) {
  return normalizeText(value) === 'today' ? 'today' : 'thisWeek';
}

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getReferenceValue(source) {
  if (!source) return '';
  const anchor = source.tagName === 'A' ? source : source.querySelector('a[href]');
  const image = source.tagName === 'IMG' ? source : source.querySelector('img');

  return normalizeText(
    anchor?.getAttribute('href')
      || image?.getAttribute('src')
      || source.getAttribute('href')
      || source.getAttribute('src')
      || source.textContent,
  );
}

function getPropValue(block, name) {
  return getReferenceValue(block.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`));
}

function getLegacyValue(block, name) {
  const labels = FIELD_LABELS[name] || [];
  const labeledRow = getRows(block).find((row) => {
    if (row.children.length !== 2) return false;
    const label = normalizeToken(row.children[0].textContent);
    return labels.some((entry) => label === entry || label.includes(entry));
  });

  if (labeledRow) return getReferenceValue(labeledRow.children[1]);

  const columnIndex = FIELD_COLUMN_INDEX[name];
  const configRow = getRows(block)[0];
  const fallbackValue = columnIndex === undefined ? '' : getReferenceValue(configRow?.children[columnIndex]);

  if (name === 'apiBaseUrl') {
    return fallbackValue || getRows(block)
      .map((row) => row.querySelector('a')?.href || findUrlLikeValue(row.textContent))
      .find(Boolean) || '';
  }

  return fallbackValue;
}

function getFieldValue(block, name, fallback = '') {
  return getPropValue(block, name) || getLegacyValue(block, name) || fallback;
}

function setStatus(node, message, type = '') {
  node.className = `case-anniversaries-status${type ? ` is-${type}` : ''}`;
  node.textContent = message;
  node.hidden = !message;
}

function posterParts(item) {
  const posterUrl = normalizeText(item.poster_url || item.posterUrl);
  const match = posterUrl.match(/\/poster\/([^/]+)\/([^/\s?#]+)(?:\/([^/\s?#]+))?/i);

  return {
    orgPrefix: normalizeText(item.org_prefix || item.orgPrefix || match?.[1] || 'NCMC'),
    caseNumber: normalizeText(item.case_number || item.caseNumber || match?.[2]),
    sequenceNumber: normalizeText(item.sequence_number || item.seqNumber || item.seqNum || match?.[3] || '1'),
  };
}

function posterHref(item, config) {
  const parts = posterParts(item);
  if (!parts.caseNumber) return '';

  const url = new URL(resolveSiteHref(config.posterPagePath), window.location.origin);
  url.searchParams.set('poster', `${parts.orgPrefix}/${parts.caseNumber}/${parts.sequenceNumber}`);

  return `${url.pathname}${url.search}`;
}

function isExternalUrl(src) {
  try {
    return new URL(src, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function createCaseImage(src, alt) {
  if (!src) return null;

  if (!isExternalUrl(src)) {
    return createOptimizedPicture(src, alt, false, [{ width: '500' }]);
  }

  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';

  const picture = document.createElement('picture');
  picture.append(img);
  return picture;
}

function createSelect(label, className = '') {
  const select = document.createElement('select');
  select.className = `case-anniversaries-filter ${className}`.trim();
  select.setAttribute('aria-label', label);
  return select;
}

function createViewIcon(view) {
  const icon = document.createElement('span');
  icon.className = `case-anniversaries-view-icon case-anniversaries-view-icon-${view}`;
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = view === 'list'
    ? '<svg viewBox="0 0 20 20" fill="none"><path d="M4 5.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 10H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 14.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 20 20" fill="none"><rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>';
  return icon;
}

function createViewToggleButton(label, view, activeView) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'case-anniversaries-view-button';
  button.dataset.view = view;
  button.setAttribute('aria-label', `${label} view`);
  button.setAttribute('aria-pressed', String(view === activeView));
  button.title = label;
  button.append(createViewIcon(view));
  if (view === activeView) button.classList.add('is-active');
  return button;
}

function applyResultView(cardsContainer, buttons, view) {
  cardsContainer.dataset.view = view;
  buttons.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function createTimeframeButton(label, timeframe, activeTimeframe) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'case-anniversaries-timeframe-button';
  button.dataset.timeframe = timeframe;
  button.textContent = label;
  button.setAttribute('aria-pressed', String(timeframe === activeTimeframe));
  if (timeframe === activeTimeframe) button.classList.add('is-active');
  return button;
}

function applyTimeframe(buttons, timeframe) {
  buttons.forEach((button) => {
    const active = button.dataset.timeframe === timeframe;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setOptions(select, label, options = []) {
  const current = select.value;
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

  select.value = [...select.options].some((option) => option.value === current) ? current : '';
  select.disabled = options.length === 0;
}

function createChip(label, onRemove) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'case-anniversaries-chip';
  chip.textContent = label;

  const close = document.createElement('span');
  close.textContent = 'x';
  close.setAttribute('aria-hidden', 'true');
  chip.append(close);

  chip.addEventListener('click', onRemove);
  return chip;
}

function buildCard(item, config) {
  const card = document.createElement('article');
  card.className = 'case-anniversaries-card';

  const imageUrl = normalizeText(item.image_url || item.thumbnail_url);
  const name = normalizeText(item.name || item.fullName) || 'Missing Child';
  const href = posterHref(item, config);

  const media = document.createElement('div');
  media.className = 'case-anniversaries-card-media';
  if (imageUrl) {
    media.append(createCaseImage(imageUrl, name));
  } else {
    media.classList.add('is-placeholder');
  }
  card.append(media);

  const body = document.createElement('div');
  body.className = 'case-anniversaries-card-body';

  const title = document.createElement('h3');
  title.textContent = name;
  body.append(title);

  const highlight = document.createElement('p');
  highlight.className = 'case-anniversaries-card-highlight';
  const location = normalizeText(item.missing_location);
  const ageNow = normalizeText(item.age_now || item.age || item.ageNow);
  highlight.textContent = [
    location ? `Missing from: ${location}` : '',
    ageNow ? `Age now: ${ageNow} years old` : '',
  ].filter(Boolean).join('\n');
  body.append(highlight);

  const date = document.createElement('p');
  date.className = 'case-anniversaries-card-date';
  date.textContent = [
    item.anniversary_date_label || item.missing_date_label || item.missing_date,
    item.years_missing_label,
  ].map(normalizeText).filter(Boolean).join('\n');
  body.append(date);

  const actions = document.createElement('div');
  actions.className = 'case-anniversaries-card-actions';

  const link = document.createElement(href ? 'a' : 'span');
  link.className = 'case-anniversaries-card-link';
  link.textContent = 'View Case ->';
  if (href) {
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  actions.append(link);

  const external = document.createElement(href ? 'a' : 'span');
  external.className = 'case-anniversaries-card-external';
  const externalIcon = document.createElement('img');
  externalIcon.src = EXTERNAL_LINK_ICON;
  externalIcon.alt = '';
  external.append(externalIcon);
  if (href) {
    external.href = href;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    external.setAttribute('aria-label', `View case for ${name}`);
  } else {
    external.setAttribute('aria-hidden', 'true');
  }
  actions.append(external);
  body.append(actions);

  card.append(body);
  return card;
}

function buildShell(config) {
  const inner = document.createElement('div');
  inner.className = 'case-anniversaries-inner';

  const header = document.createElement('div');
  header.className = 'case-anniversaries-header';
  const headerTop = document.createElement('div');
  headerTop.className = 'case-anniversaries-header-top';
  const findHeading = document.createElement('h2');
  findHeading.className = 'case-anniversaries-heading';
  findHeading.textContent = config.findHeading;
  headerTop.append(findHeading);

  const viewToggle = document.createElement('div');
  viewToggle.className = 'case-anniversaries-view-toggle';
  const gridButton = createViewToggleButton('Grid', 'grid', 'grid');
  const listButton = createViewToggleButton('List', 'list', 'grid');
  viewToggle.append(gridButton, listButton);
  headerTop.append(viewToggle);
  header.append(headerTop);

  const controls = document.createElement('div');
  controls.className = 'case-anniversaries-controls';

  const form = document.createElement('form');
  form.className = 'case-anniversaries-form';
  const primaryRow = document.createElement('div');
  primaryRow.className = 'case-anniversaries-primary-row';
  const searchWrap = document.createElement('label');
  searchWrap.className = 'case-anniversaries-search-wrap';
  const search = document.createElement('input');
  search.className = 'case-anniversaries-search';
  search.type = 'search';
  search.placeholder = config.searchPlaceholder;
  search.setAttribute('aria-label', config.searchPlaceholder);
  searchWrap.append(search);
  primaryRow.append(searchWrap);

  const timeframe = document.createElement('div');
  timeframe.className = 'case-anniversaries-timeframe';
  const timeframeLabel = document.createElement('span');
  timeframeLabel.className = 'case-anniversaries-timeframe-label';
  timeframeLabel.textContent = 'View anniversaries for:';
  const timeframeToggle = document.createElement('div');
  timeframeToggle.className = 'case-anniversaries-timeframe-toggle';
  const weekButton = createTimeframeButton('This Week', 'thisWeek', config.timeframe);
  const dayButton = createTimeframeButton('This Day', 'today', config.timeframe);
  timeframeToggle.append(weekButton, dayButton);
  timeframe.append(timeframeLabel, timeframeToggle);
  primaryRow.append(timeframe);
  form.append(primaryRow);

  const filterRow = document.createElement('div');
  filterRow.className = 'case-anniversaries-filter-row';
  const stateSelect = createSelect('State');
  const typeSelect = createSelect('Case Type');
  const yearsSelect = createSelect('Years Missing');
  filterRow.append(stateSelect, typeSelect, yearsSelect);
  form.append(filterRow);
  controls.append(form);
  header.append(controls);
  inner.append(header);

  const listing = document.createElement('section');
  listing.className = 'case-anniversaries-listing';

  const meta = document.createElement('div');
  meta.className = 'case-anniversaries-meta';
  const activeFilters = document.createElement('div');
  activeFilters.className = 'case-anniversaries-active-filters';
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.className = 'case-anniversaries-clear';
  clearAll.textContent = 'Clear All';
  clearAll.hidden = true;
  const count = document.createElement('p');
  count.className = 'case-anniversaries-count';
  meta.append(activeFilters, clearAll, count);
  listing.append(meta);

  const status = document.createElement('p');
  status.hidden = true;
  const grid = document.createElement('div');
  grid.className = 'case-anniversaries-grid';
  const empty = document.createElement('p');
  empty.className = 'case-anniversaries-empty';
  empty.textContent = config.emptyMessage;
  empty.hidden = true;

  const footer = document.createElement('div');
  footer.className = 'case-anniversaries-footer';
  const loadMore = document.createElement('button');
  loadMore.type = 'button';
  loadMore.className = 'case-anniversaries-load-more';
  loadMore.textContent = config.loadMoreText;
  footer.append(loadMore);
  listing.append(status, grid, empty, footer);
  inner.append(listing);

  return {
    inner,
    form,
    search,
    stateSelect,
    typeSelect,
    yearsSelect,
    viewButtons: [gridButton, listButton],
    timeframeButtons: [weekButton, dayButton],
    activeFilters,
    clearAll,
    count,
    status,
    grid,
    empty,
    loadMore,
  };
}

function debounce(callback, wait = 300) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

export default async function decorate(block) {
  const config = {
    findHeading: getFieldValue(block, 'findHeading', DEFAULTS.findHeading),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', DEFAULTS.apiBaseUrl)),
    endpointPath: getFieldValue(block, 'endpointPath', DEFAULTS.endpointPath),
    posterPagePath: getFieldValue(block, 'posterPagePath', DEFAULTS.posterPagePath),
    timeframe: normalizeTimeframe(getFieldValue(block, 'timeframe', DEFAULTS.timeframe)),
    pageSize: parseIntSafe(getFieldValue(block, 'pageSize', DEFAULTS.pageSize), DEFAULTS.pageSize),
    searchPlaceholder: getFieldValue(block, 'searchPlaceholder', DEFAULTS.searchPlaceholder),
    loadMoreText: getFieldValue(block, 'loadMoreText', DEFAULTS.loadMoreText),
    emptyMessage: getFieldValue(block, 'emptyMessage', DEFAULTS.emptyMessage),
  };

  const layout = buildShell(config);
  const state = {
    page: 0,
    lastPage: 1,
    total: 0,
    loading: false,
    view: 'grid',
    timeframe: config.timeframe,
    filters: {
      search: '',
      state: '',
      caseType: '',
      yearsMissing: '',
    },
  };
  let loadCases = () => {};

  const updateActiveFilters = () => {
    layout.activeFilters.replaceChildren();
    const chips = [
      state.filters.search ? ['Search: '.concat(state.filters.search), () => {
        state.filters.search = '';
        layout.search.value = '';
      }] : null,
      state.filters.state ? [state.filters.state, () => {
        state.filters.state = '';
        layout.stateSelect.value = '';
      }] : null,
      state.filters.caseType ? [state.filters.caseType, () => {
        state.filters.caseType = '';
        layout.typeSelect.value = '';
      }] : null,
      state.filters.yearsMissing ? [state.filters.yearsMissing, () => {
        state.filters.yearsMissing = '';
        layout.yearsSelect.value = '';
      }] : null,
    ].filter(Boolean);

    chips.forEach(([label, reset]) => {
      layout.activeFilters.append(createChip(label, () => {
        reset();
        loadCases(true);
      }));
    });

    layout.clearAll.hidden = chips.length === 0;
  };

  const updateFilterOptions = (filters = {}) => {
    setOptions(layout.stateSelect, 'State', filters.states || []);
    setOptions(layout.typeSelect, 'Case Type', filters.case_types || []);
    setOptions(layout.yearsSelect, 'Years Missing', filters.years_missing || []);
  };

  applyResultView(layout.grid, layout.viewButtons, state.view);
  applyTimeframe(layout.timeframeButtons, state.timeframe);

  loadCases = async (reset = false) => {
    if (state.loading || !config.apiBaseUrl) return;
    if (reset) {
      state.page = 0;
      state.lastPage = 1;
      layout.grid.replaceChildren();
      layout.empty.hidden = true;
    }

    state.loading = true;
    layout.loadMore.disabled = true;
    setStatus(layout.status, 'Loading case anniversaries...', 'loading');

    try {
      const url = new URL(config.endpointPath, `${config.apiBaseUrl}/`);
      url.searchParams.set('timeframe', state.timeframe);
      url.searchParams.set('per_page', String(config.pageSize));
      url.searchParams.set('page', String(reset ? 1 : state.page + 1));
      if (state.filters.search) url.searchParams.set('search', state.filters.search);
      if (state.filters.state) url.searchParams.set('state', state.filters.state);
      if (state.filters.caseType) url.searchParams.set('case_type', state.filters.caseType);
      if (state.filters.yearsMissing) url.searchParams.set('years_missing', state.filters.yearsMissing);

      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();

      (payload.data || []).forEach((item) => layout.grid.append(buildCard(item, config)));
      state.page = payload.meta?.current_page || 1;
      state.lastPage = payload.meta?.last_page || 1;
      state.total = payload.meta?.total ?? payload.total_records ?? layout.grid.children.length;
      updateFilterOptions(payload.filters || {});
      updateActiveFilters();

      const shown = layout.grid.children.length;
      layout.count.textContent = state.total
        ? `Showing ${shown} of ${state.total} resources`
        : 'Showing 0 resources';
      layout.empty.hidden = shown > 0;
      layout.loadMore.hidden = state.page >= state.lastPage || state.total === 0;
      setStatus(layout.status, '', '');
    } catch (error) {
      setStatus(layout.status, 'Case anniversaries are unavailable.', 'error');
    } finally {
      state.loading = false;
      layout.loadMore.disabled = false;
    }
  };

  layout.search.addEventListener('input', debounce(() => {
    state.filters.search = normalizeText(layout.search.value);
    loadCases(true);
  }));
  layout.stateSelect.addEventListener('change', () => {
    state.filters.state = layout.stateSelect.value;
    loadCases(true);
  });
  layout.typeSelect.addEventListener('change', () => {
    state.filters.caseType = layout.typeSelect.value;
    loadCases(true);
  });
  layout.yearsSelect.addEventListener('change', () => {
    state.filters.yearsMissing = layout.yearsSelect.value;
    loadCases(true);
  });
  layout.form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters.search = normalizeText(layout.search.value);
    loadCases(true);
  });
  layout.clearAll.addEventListener('click', () => {
    state.filters = {
      search: '',
      state: '',
      caseType: '',
      yearsMissing: '',
    };
    layout.search.value = '';
    layout.stateSelect.value = '';
    layout.typeSelect.value = '';
    layout.yearsSelect.value = '';
    loadCases(true);
  });
  layout.loadMore.addEventListener('click', () => loadCases(false));
  layout.viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.view === 'list' ? 'list' : 'grid';
      if (state.view === nextView) return;
      state.view = nextView;
      applyResultView(layout.grid, layout.viewButtons, state.view);
    });
  });
  layout.timeframeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextTimeframe = normalizeTimeframe(button.dataset.timeframe);
      if (state.timeframe === nextTimeframe) return;
      state.timeframe = nextTimeframe;
      applyTimeframe(layout.timeframeButtons, state.timeframe);
      loadCases(true);
    });
  });

  block.replaceChildren(layout.inner);

  if (!config.apiBaseUrl) {
    setStatus(layout.status, 'Add an API Base URL to load case anniversaries.', 'error');
    return;
  }

  await loadCases(true);
}
