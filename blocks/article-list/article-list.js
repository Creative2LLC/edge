import createRemoteSafePicture from '../../scripts/remote-picture.js';
import resolveSiteHref from '../../scripts/link-utils.js';
import { applyButtonStyle } from '../../scripts/button-utils.js';
import { readListFilterState, writeListFilterState } from '../../scripts/list-filter-state.js';
import { showSkeleton, clearSkeleton, setButtonLoading } from '../../scripts/skeleton.js';
import {
  DEFAULT_LIST_SORT,
  getListSortOptions,
  normalizeListSort,
} from '../../scripts/list-sort.js';
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
  apiBaseUrl: ['api base url', 'api url', 'article api base url', 'article api url'],
  selected: ['selected', 'selected ids', 'selected slugs', 'article ids', 'selected articles'],
  exclude: ['exclude', 'exclude slugs', 'excluded slugs', 'excluded articles'],
  filters: ['filters', 'preset filters'],
  pageSize: ['page size', 'items per page', 'limit', 'initial count'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
  paginationMode: ['pagination mode', 'display mode', 'results mode'],
  audiencePreset: ['audience preset', 'preset audience', 'default audience'],
  issuePreset: ['issue preset', 'preset issue', 'default issue'],
  typePreset: ['type preset', 'preset type', 'default type'],
  tagPreset: ['tag preset', 'preset tag', 'default tag'],
  detailBasePath: ['detail base path', 'article detail base path', 'article base path', 'blog base path'],
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
  paginationMode: 8,
  audiencePreset: 9,
  issuePreset: 10,
  typePreset: 11,
  tagPreset: 12,
  detailBasePath: 13,
};

function normalizeText(value) { return `${value || ''}`.trim(); }
function normalizeToken(value) { return normalizeText(value).toLowerCase(); }
function parseIntSafe(value, fallback = 9) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}
function normalizeApiBaseUrl(value) { return normalizeText(value).replace(/\/+$/, ''); }
function getRows(block) { return getBlockRows(block); }

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
    type: parseList(map.type || map.types),
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

const MAX_CARD_PILLS = 5;

// The two label systems also disagree on plurals: the story_type taxonomy says
// "Featured Case" and "Event" where the tag list says "Featured Cases" and
// "Events". Those are the only two pairs in the data, and a trailing "s" is all
// that separates them, so the dedupe key ignores one.
function pillKey(label) {
  return `${label}`.trim().toLowerCase().replace(/s$/, '');
}

let groupIdCounter = 0;
function groupId() {
  groupIdCounter += 1;
  return groupIdCounter;
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

function buildInteractivePill(label, className = '', onActivate = null) {
  if (typeof onActivate !== 'function') return buildPill(label, className);

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = `article-list-pill is-clickable ${className}`.trim();
  pill.textContent = label;
  pill.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  });
  return pill;
}

function createFilterSelect(label) {
  const select = document.createElement('select');
  select.className = 'article-list-filter';
  select.setAttribute('aria-label', label);
  return select;
}

function createSortSelect(label) {
  const select = document.createElement('select');
  select.className = 'article-list-filter article-list-sort';
  select.setAttribute('aria-label', label);
  return select;
}

function createViewIcon(view) {
  const icon = document.createElement('span');
  icon.className = `article-list-view-icon article-list-view-icon-${view}`;
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = view === 'list'
    ? '<svg viewBox="0 0 20 20" fill="none"><path d="M4 5.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 10H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 14.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 20 20" fill="none"><rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>';
  return icon;
}

function createViewToggleButton(label, view, activeView) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'article-list-view-button view-toggle-button';
  button.dataset.view = view;
  button.setAttribute('aria-label', `${label} view`);
  button.title = label;
  button.append(createViewIcon(view));
  if (view === activeView) button.classList.add('is-active');
  button.setAttribute('aria-pressed', String(view === activeView));
  return button;
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

function applyResultView(cardsContainer, buttons, view) {
  cardsContainer.dataset.view = view;
  buttons.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function syncSelectValue(select, selectedValues) {
  const values = Array.from(selectedValues || []);
  const selected = values.length ? values[values.length - 1] : '';
  if (!selected) {
    select.value = '';
    return;
  }

  const option = [...select.options].find((entry) => normalizeToken(entry.value) === selected);
  select.value = option?.value || '';
}

function debounce(callback, wait = 300) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

function ensurePreconnect(url) {
  try {
    const { origin } = new URL(url, window.location.href);
    if (origin === window.location.origin) return;

    const existing = [...document.head.querySelectorAll('link[rel="preconnect"]')]
      .some(({ href }) => href.replace(/\/$/, '') === origin);
    if (existing) return;

    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = '';
    document.head.append(link);
  } catch {
    // Ignore malformed author-provided URLs; fetch error handling will surface failures.
  }
}

function normalizeContentBasePath(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function buildArticleHref(article, config) {
  const detailBasePath = normalizeContentBasePath(config.detailBasePath);
  if (detailBasePath && normalizeText(article.slug)) {
    return resolveSiteHref(`${detailBasePath}/${article.slug}`);
  }

  return resolveSiteHref(article.primary_url || article.detail_path || article.page_path);
}

function buildCard(article, index = 0, onFacetActivate = null, config = {}) {
  const card = document.createElement('article');
  card.className = 'article-list-card';
  card.style.setProperty('--article-card-index', String(index % 12));
  const linkHref = buildArticleHref(article, config);

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
      createRemoteSafePicture(
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
  // Two label systems feed a card: the four curated blog-taxonomy groups and the
  // free tag list. Ten tag names are word-for-word duplicates of a taxonomy name
  // ("News", "Missing Children", "40th Anniversary"...), which is why most cards
  // used to print the same word twice, in two separate rows. Taxonomy wins,
  // because its pill filters the specific group rather than the flat tag list.
  const facetByGroup = {
    primary_area: 'audience',
    topic: 'issue',
    story_type: 'type',
    program_series: 'programs',
  };
  const taxonomyEntries = (article.blog_taxonomy || [])
    .map((entry) => ({
      facet: facetByGroup[entry.group],
      label: normalizeText(entry.name),
      value: normalizeText(entry.slug),
    }))
    .filter((entry) => entry.facet && entry.label && entry.value);

  const seen = new Set(taxonomyEntries.map((entry) => pillKey(entry.label)));
  const tagEntries = (article.tags || [])
    .map((tag) => ({
      facet: 'tags',
      label: normalizeText(tag.name),
      value: normalizeText(tag.slug || tag.name),
    }))
    .filter((tag) => tag.label && !seen.has(pillKey(tag.label)));

  const pillEntries = [...taxonomyEntries, ...tagEntries].slice(0, MAX_CARD_PILLS);
  if (pillEntries.length) {
    const taxonomy = document.createElement('div');
    taxonomy.className = 'article-list-taxonomy';
    pillEntries.forEach(({ facet, label, value }) => taxonomy.append(
      buildInteractivePill(label, 'is-taxonomy', () => onFacetActivate?.(facet, value)),
    ));
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

  if (linkHref) {
    const link = document.createElement('a');
    link.className = 'article-list-card-link';
    link.href = linkHref;
    link.textContent = 'Learn More';
    // The shared text-link style draws its own arrow; the block no longer does.
    applyButtonStyle(link, 'text-link');
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

  const headerTop = document.createElement('div');
  headerTop.className = 'article-list-header-top';

  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'article-list-heading';
    heading.textContent = config.heading;
    headerTop.append(heading);
  }

  const viewToggle = document.createElement('div');
  viewToggle.className = 'article-list-view-toggle view-toggle';
  const gridButton = createViewToggleButton('Grid', 'grid', config.defaultView);
  const listButton = createViewToggleButton('List', 'list', config.defaultView);
  viewToggle.append(gridButton, listButton);
  headerTop.append(viewToggle);
  header.append(headerTop);

  // Broad to narrow, each group named. The area pills used to sit BELOW the
  // dropdowns even though they are the widest cut of the library, and sort was
  // parked next to search as if it were a filter — between them you could not
  // tell which control did what.
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

  const areaGroup = document.createElement('div');
  areaGroup.className = 'article-list-group article-list-area-group';
  const areaLabel = document.createElement('p');
  areaLabel.className = 'article-list-group-label';
  areaLabel.id = `article-list-area-label-${groupId()}`;
  areaLabel.textContent = 'Browse by area';
  const areaPills = document.createElement('div');
  areaPills.className = 'article-list-area-pills';
  areaPills.setAttribute('role', 'group');
  areaPills.setAttribute('aria-labelledby', areaLabel.id);
  areaGroup.append(areaLabel, areaPills);
  controls.append(areaGroup);

  const refineGroup = document.createElement('div');
  refineGroup.className = 'article-list-group article-list-refine-group';
  const refineLabel = document.createElement('p');
  refineLabel.className = 'article-list-group-label';
  refineLabel.textContent = 'Refine';
  const issueSelect = createFilterSelect('Topic');
  const typeSelect = createFilterSelect('Story type');
  const tagSelect = createFilterSelect('Program or series');
  const sortSelect = createSortSelect('Sort articles');
  const filterRow = document.createElement('div');
  filterRow.className = 'article-list-filter-row';
  filterRow.append(issueSelect, typeSelect, tagSelect);
  const sortWrap = document.createElement('div');
  sortWrap.className = 'article-list-sort-wrap';
  const sortLabel = document.createElement('span');
  sortLabel.className = 'article-list-sort-label';
  sortLabel.textContent = 'Sort';
  sortWrap.append(sortLabel, sortSelect);
  refineGroup.append(refineLabel, filterRow, sortWrap);
  controls.append(refineGroup);
  header.append(controls);
  inner.append(header);

  // Count first, then what is switched on, then the way to switch it off —
  // "Clear Filters" used to float between the chips and the count.
  const meta = document.createElement('div');
  meta.className = 'article-list-meta';
  const count = document.createElement('p');
  count.className = 'article-list-count';
  const activeFilters = document.createElement('div');
  activeFilters.className = 'article-list-active-filters';
  const clearAllButton = document.createElement('button');
  clearAllButton.className = 'article-list-clear-all';
  clearAllButton.type = 'button';
  clearAllButton.textContent = 'Clear all';
  clearAllButton.hidden = true;
  meta.append(count, activeFilters, clearAllButton);
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
  const pagination = createPaginationControls('article-list', 'Article results pagination');
  footer.append(loadMoreButton, pagination.nav);
  inner.append(cardsContainer, emptyState, footer);

  return {
    inner,
    searchInput,
    areaPills,
    issueSelect,
    typeSelect,
    tagSelect,
    sortSelect,
    viewButtons: [gridButton, listButton],
    activeFilters,
    clearAllButton,
    count,
    cardsContainer,
    emptyState,
    loadMoreButton,
    pagination,
  };
}

function renderApiList(block, config) {
  const layout = buildShell(config);
  const {
    inner,
    searchInput,
    areaPills,
    issueSelect,
    typeSelect,
    tagSelect,
    sortSelect,
    viewButtons,
    activeFilters,
    clearAllButton,
    count,
    cardsContainer,
    emptyState,
    loadMoreButton,
    pagination,
  } = layout;
  const usePagination = isPaginationMode(config.paginationMode);
  const selected = splitSelectedArticles(parseList(config.selectedField));
  const excluded = parseList(config.excludeField);
  const state = {
    query: '',
    selectedAudience: new Set(),
    selectedIssue: new Set(),
    selectedType: new Set(),
    selectedPrograms: new Set(),
    selectedTags: new Set(),
    sort: '',
    hasExplicitSort: false,
    view: config.defaultView,
    page: 0,
    lastPage: 1,
    total: 0,
    loading: false,
  };
  const defaultState = {
    query: '',
    selectedAudience: parseList(config.audiencePreset).map(normalizeToken),
    selectedIssue: parseList(config.issuePreset).map(normalizeToken),
    selectedType: parseList(config.typePreset).map(normalizeToken),
    selectedPrograms: parseList(config.tagPreset).map(normalizeToken),
    selectedTags: [],
  };
  const locationState = readListFilterState();
  state.query = locationState.hasQuery ? locationState.query : defaultState.query;
  state.view = locationState.view || config.defaultView;
  state.hasExplicitSort = locationState.hasSort;
  state.sort = locationState.hasSort ? normalizeListSort(locationState.sort) : '';
  state.selectedAudience = new Set(
    locationState.areas.present
      ? locationState.areas.values
      : defaultState.selectedAudience,
  );
  state.selectedIssue = new Set(
    locationState.topics.present
      ? locationState.topics.values
      : defaultState.selectedIssue,
  );
  state.selectedType = new Set(
    locationState.storyTypes.present
      ? locationState.storyTypes.values
      : defaultState.selectedType,
  );
  state.selectedPrograms = new Set(
    locationState.programs.present ? locationState.programs.values : defaultState.selectedPrograms,
  );
  state.selectedTags = new Set(
    locationState.tags.present ? locationState.tags.values : defaultState.selectedTags,
  );
  const optionLabels = {
    audience: new Map(),
    issue: new Map(),
    type: new Map(),
    programs: new Map(),
    tags: new Map(),
  };
  const syncUrlState = (replace = true) => {
    writeListFilterState({
      query: state.query,
      areas: [...state.selectedAudience],
      topics: [...state.selectedIssue],
      storyTypes: [...state.selectedType],
      programs: [...state.selectedPrograms],
      tags: [...state.selectedTags],
      sort: state.hasExplicitSort ? state.sort : '',
      view: state.view,
    }, replace);
  };
  const syncFilterControls = () => {
    syncSelectValue(issueSelect, state.selectedIssue);
    syncSelectValue(typeSelect, state.selectedType);
    syncSelectValue(tagSelect, state.selectedPrograms);
  };
  const syncSortControl = () => {
    sortSelect.value = state.sort || '';
  };
  let refreshArticles = () => {};
  let loadArticles = async () => {};
  let activeController = null;
  let requestToken = 0;

  const updateFilters = (filters = {}) => {
    const audiences = filters.areas || [];
    const issues = filters.topics || [];
    const types = filters.story_types || [];
    const programs = filters.programs || [];
    setFilterOptions(issueSelect, 'Topic', issues);
    setFilterOptions(typeSelect, 'Story type', types);
    setFilterOptions(tagSelect, 'Program or series', programs);
    optionLabels.audience = new Map(
      audiences.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.issue = new Map(
      issues.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.type = new Map(
      types.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.programs = new Map(
      programs.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.tags = new Map(
      (filters.tags || []).map((option) => [normalizeToken(option.slug), option.name]),
    );
    areaPills.replaceChildren();
    const allAreas = [{ value: '', label: 'All articles' }, ...audiences];
    allAreas.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'article-list-area-pill';
      const active = option.value === ''
        ? state.selectedAudience.size === 0
        : state.selectedAudience.has(normalizeToken(option.value));
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = option.label;
      button.addEventListener('click', () => {
        state.selectedAudience.clear();
        if (option.value) state.selectedAudience.add(normalizeToken(option.value));
        syncUrlState(false);
        refreshArticles(true);
      });
      areaPills.append(button);
    });
    syncFilterControls();
  };
  const updateSorting = (sorting = {}, appliedSort = DEFAULT_LIST_SORT) => {
    const options = sorting.options || getListSortOptions();
    setFilterOptions(sortSelect, 'Sort', options);
    const fallbackSort = normalizeListSort(sorting.default || DEFAULT_LIST_SORT);
    if (!state.hasExplicitSort) {
      state.sort = normalizeListSort(appliedSort || fallbackSort, fallbackSort);
    } else {
      state.sort = normalizeListSort(state.sort, fallbackSort);
    }
    syncSortControl();
  };
  const applyFacetValue = (facet, rawValue) => {
    const value = normalizeToken(rawValue);
    if (!value) return;

    if (facet === 'audience') state.selectedAudience.add(value);
    if (facet === 'issue') state.selectedIssue.add(value);
    if (facet === 'type') state.selectedType.add(value);
    if (facet === 'programs') state.selectedPrograms.add(value);
    if (facet === 'tags') state.selectedTags.add(value);

    syncFilterControls();
    syncUrlState();
    refreshArticles(true);
  };

  const renderActiveFilters = () => {
    activeFilters.replaceChildren();
    const facets = [
      ...[...state.selectedAudience].map((value) => ({ facet: 'audience', value })),
      ...[...state.selectedIssue].map((value) => ({ facet: 'issue', value })),
      ...[...state.selectedType].map((value) => ({ facet: 'type', value })),
      ...[...state.selectedPrograms].map((value) => ({ facet: 'programs', value })),
      ...[...state.selectedTags].map((value) => ({ facet: 'tags', value })),
    ];
    facets.forEach(({ facet, value }) => {
      const label = optionLabels[facet].get(value) || value;
      activeFilters.append(createChip(label, () => {
        if (facet === 'audience') state.selectedAudience.delete(value);
        if (facet === 'issue') state.selectedIssue.delete(value);
        if (facet === 'type') state.selectedType.delete(value);
        if (facet === 'programs') state.selectedPrograms.delete(value);
        if (facet === 'tags') state.selectedTags.delete(value);
        syncFilterControls();
        syncUrlState();
        refreshArticles(true);
      }));
    });
    clearAllButton.hidden = !facets.length && !state.query.trim();
  };

  const updatePagination = () => {
    if (!usePagination) {
      pagination.nav.hidden = true;
      return;
    }
    pagination.update({
      page: state.page,
      lastPage: state.lastPage,
      onPage: (page) => loadArticles(true, page),
    });
  };

  loadArticles = async (reset = false, targetPage = null) => {
    if (state.loading && !reset && targetPage === null) return;
    if (activeController) activeController.abort();

    const currentToken = requestToken + 1;
    requestToken = currentToken;
    const controller = new AbortController();
    activeController = controller;

    if (reset) {
      state.page = 0;
      state.lastPage = 1;
      cardsContainer.replaceChildren();
      emptyState.hidden = true;
    }

    state.loading = true;
    // Placeholders only while the grid is empty; a "Load more" appends under
    // real cards, where the button's own beacon is the right signal.
    const isInitialFill = !cardsContainer.children.length;
    if (isInitialFill) {
      count.textContent = 'Loading articles...';
      showSkeleton(cardsContainer, {
        count: Math.min(config.pageSize, 6),
        item: 'article-list-card',
        media: 'article-list-card-media',
        body: 'article-list-card-body',
        lines: ['label', 'title', 'title-sm', 'text', 'text-sm'],
        label: 'Loading articles',
      });
    }
    loadMoreButton.disabled = true;
    const restoreLoadMore = isInitialFill ? null : setButtonLoading(loadMoreButton);
    pagination.nav.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });

    const url = new URL('/api/articles', `${config.apiBaseUrl}/`);
    url.searchParams.set('per_page', String(config.pageSize));
    url.searchParams.set('page', String(targetPage || (reset ? 1 : state.page + 1)));
    if (state.query.trim()) url.searchParams.set('search', state.query.trim());
    if (state.hasExplicitSort && state.sort) url.searchParams.set('sort', state.sort);
    state.selectedAudience.forEach((value) => url.searchParams.append('areas[]', value));
    state.selectedIssue.forEach((value) => url.searchParams.append('topics[]', value));
    state.selectedType.forEach((value) => url.searchParams.append('story_types[]', value));
    state.selectedPrograms.forEach((value) => url.searchParams.append('programs[]', value));
    state.selectedTags.forEach((value) => url.searchParams.append('tags[]', value));
    selected.ids.forEach((value) => url.searchParams.append('ids[]', value));
    selected.slugs.forEach((value) => url.searchParams.append('slugs[]', value));
    excluded.forEach((value) => url.searchParams.append('exclude_slugs[]', value));

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}.`);
      const payload = await response.json();
      if (currentToken !== requestToken) return;

      if (usePagination) cardsContainer.replaceChildren();
      clearSkeleton(cardsContainer);
      const startIndex = cardsContainer.children.length;
      (payload.data || []).forEach((article, index) => {
        cardsContainer.append(buildCard(article, startIndex + index, applyFacetValue, config));
      });

      state.page = payload.meta?.current_page || 1;
      state.lastPage = payload.meta?.last_page || 1;
      state.total = payload.meta?.total ?? cardsContainer.children.length;
      updateFilters(payload.filters || {});
      updateSorting(payload.sorting || {}, payload.applied_filters?.sort || DEFAULT_LIST_SORT);
      renderActiveFilters();

      let shownStart = state.total ? 1 : 0;
      if (state.total && usePagination) {
        shownStart = ((state.page - 1) * config.pageSize) + 1;
      }
      const shownEnd = usePagination
        ? Math.min(state.page * config.pageSize, state.total)
        : cardsContainer.children.length;
      count.textContent = state.total ? `Showing ${shownStart}-${shownEnd} of ${state.total} articles` : 'Showing 0 articles';
      emptyState.hidden = cardsContainer.children.length > 0;
      loadMoreButton.hidden = usePagination || state.page >= state.lastPage || state.total === 0;
      updatePagination();
    } catch (error) {
      // An abort means a newer request already owns the placeholders.
      if (error.name === 'AbortError') return;
      clearSkeleton(cardsContainer);
      count.textContent = error?.message || 'Articles unavailable.';
      emptyState.hidden = cardsContainer.children.length > 0;
    } finally {
      if (currentToken === requestToken) {
        activeController = null;
        if (restoreLoadMore) restoreLoadMore();
        loadMoreButton.disabled = false;
        state.loading = false;
      }
    }
  };

  refreshArticles = loadArticles;

  const applyFacet = (select, set) => {
    if (!select.value) return;
    set.add(normalizeToken(select.value));
    syncFilterControls();
    syncUrlState();
    loadArticles(true);
  };

  searchInput.value = state.query;
  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value;
    syncUrlState();
    loadArticles(true);
  }));
  issueSelect.addEventListener('change', () => {
    applyFacet(issueSelect, state.selectedIssue);
  });
  typeSelect.addEventListener('change', () => {
    applyFacet(typeSelect, state.selectedType);
  });
  tagSelect.addEventListener('change', () => {
    applyFacet(tagSelect, state.selectedPrograms);
  });
  sortSelect.addEventListener('change', () => {
    state.sort = normalizeListSort(sortSelect.value);
    state.hasExplicitSort = true;
    syncUrlState();
    loadArticles(true);
  });
  loadMoreButton.addEventListener('click', () => loadArticles(false));
  clearAllButton.addEventListener('click', () => {
    state.query = '';
    state.selectedAudience.clear();
    state.selectedIssue.clear();
    state.selectedType.clear();
    state.selectedPrograms.clear();
    state.selectedTags.clear();
    searchInput.value = '';
    syncFilterControls();
    syncUrlState();
    loadArticles(true);
  });
  viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.view === 'list' ? 'list' : 'grid';
      if (state.view === nextView) return;
      state.view = nextView;
      applyResultView(cardsContainer, viewButtons, state.view);
      syncUrlState();
    });
  });

  syncSortControl();
  applyResultView(cardsContainer, viewButtons, state.view);
  block.replaceChildren(inner);
  window.requestAnimationFrame(() => {
    loadArticles(true);
  });
}

export default function decorate(block) {
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
    paginationMode: normalizePaginationMode(getFieldValue(block, 'paginationMode', 'load-more')),
    defaultView: 'grid',
    audiencePreset: getFieldValue(block, 'audiencePreset') || filters.audience.join(', '),
    issuePreset: getFieldValue(block, 'issuePreset') || filters.issue.join(', '),
    typePreset: getFieldValue(block, 'typePreset') || filters.type.join(', '),
    tagPreset: getFieldValue(block, 'tagPreset') || filters.tags.join(', '),
    detailBasePath: getFieldValue(block, 'detailBasePath'),
  };
  ensurePreconnect(config.apiBaseUrl);

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

  renderApiList(block, config);
}
