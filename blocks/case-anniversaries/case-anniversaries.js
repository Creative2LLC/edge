import { createOptimizedPicture } from '../../scripts/aem.js';
import resolveSiteHref from '../../scripts/link-utils.js';

const DEFAULTS = {
  heading: 'Case Anniversaries',
  intro: 'Help bring missing children home. Media coverage around the anniversary of a child\'s disappearance can generate new leads and can keep cases in the public eye. Browse upcoming anniversaries and help us spread awareness.',
  eyebrow: 'Resources > Media > Case Anniversaries',
  findHeading: 'Find Cases',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  endpointPath: '/api/case-anniversaries',
  posterPagePath: '/missing-children-posters.html',
  timeframe: 'thisWeek',
  pageSize: 8,
  searchPlaceholder: 'Search',
  loadMoreText: 'Load More',
  emptyMessage: 'No case anniversaries match your current filters.',
  reportingHeading: 'Reporting on an Anniversary?',
  reportingCopy: 'NCMEC\'s media team can help you develop compelling anniversary coverage that may generate new leads.',
  mediaEmail: 'media@ncmec.org',
  heroImage: '',
};

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  intro: ['intro', 'copy', 'description'],
  eyebrow: ['eyebrow', 'breadcrumb', 'breadcrumbs'],
  findHeading: ['find heading', 'results heading'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  endpointPath: ['endpoint path', 'endpoint'],
  posterPagePath: ['poster page path', 'poster page url', 'poster url'],
  timeframe: ['timeframe', 'term'],
  pageSize: ['page size', 'items per page', 'limit'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
  emptyMessage: ['empty message'],
  reportingHeading: ['reporting heading'],
  reportingCopy: ['reporting copy'],
  mediaEmail: ['media email', 'email'],
  heroImage: ['hero image', 'background image'],
};

const FIELD_COLUMN_INDEX = {
  heading: 0,
  intro: 1,
  apiBaseUrl: 2,
  endpointPath: 3,
  posterPagePath: 4,
  timeframe: 5,
  pageSize: 6,
  heroImage: 7,
  mediaEmail: 8,
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

function createSelect(label, className = '') {
  const select = document.createElement('select');
  select.className = `case-anniversaries-filter ${className}`.trim();
  select.setAttribute('aria-label', label);
  return select;
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
    media.append(createOptimizedPicture(imageUrl, name, false, [{ width: '500' }]));
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

  const external = document.createElement('span');
  external.className = 'case-anniversaries-card-external';
  external.setAttribute('aria-hidden', 'true');
  actions.append(external);
  body.append(actions);

  card.append(body);
  return card;
}

function buildReportingSection(config) {
  const section = document.createElement('section');
  section.className = 'case-anniversaries-reporting';

  const heading = document.createElement('h2');
  heading.textContent = config.reportingHeading;
  const copy = document.createElement('p');
  copy.className = 'case-anniversaries-reporting-copy';
  copy.textContent = config.reportingCopy;
  section.append(heading, copy);

  const features = document.createElement('div');
  features.className = 'case-anniversaries-reporting-grid';
  [
    ['Case Information', 'Need additional details, family contact, or case background for your story? Our media team can help.'],
    ['Age-Progressed Images', 'For long-term cases, forensic artists create age-progressed images showing what the child might look like today.'],
    ['Expert Commentary', 'NCMEC staff can provide expert context on case types, trends, and the importance of public awareness.'],
  ].forEach(([titleText, copyText]) => {
    const item = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = titleText;
    const text = document.createElement('p');
    text.textContent = copyText;
    item.append(title, text);
    features.append(item);
  });
  section.append(features);

  const cta = document.createElement('div');
  cta.className = 'case-anniversaries-media-cta';
  const icon = document.createElement('span');
  icon.className = 'case-anniversaries-media-icon';
  icon.setAttribute('aria-hidden', 'true');
  const ctaBody = document.createElement('div');
  const ctaHeading = document.createElement('h3');
  ctaHeading.textContent = 'Contact Our Media Team';
  const ctaCopy = document.createElement('p');
  ctaCopy.append(
    document.createTextNode('For interview requests, B-roll, or expert commentary: '),
    Object.assign(document.createElement('a'), {
      href: `mailto:${config.mediaEmail}`,
      textContent: config.mediaEmail,
    }),
  );
  const ctaNote = document.createElement('p');
  ctaNote.className = 'case-anniversaries-media-note';
  ctaNote.textContent = 'Include the case name/number, your outlet, and deadline in your request.';
  ctaBody.append(ctaHeading, ctaCopy, ctaNote);
  cta.append(icon, ctaBody);
  section.append(cta);

  return section;
}

function buildShell(config) {
  const inner = document.createElement('div');
  inner.className = 'case-anniversaries-inner';

  const hero = document.createElement('section');
  hero.className = 'case-anniversaries-hero';
  if (config.heroImage) hero.style.setProperty('--case-anniversaries-hero-image', `url("${config.heroImage}")`);

  const heroContent = document.createElement('div');
  heroContent.className = 'case-anniversaries-hero-content';
  if (config.eyebrow) {
    const crumb = document.createElement('p');
    crumb.className = 'case-anniversaries-eyebrow';
    crumb.textContent = config.eyebrow;
    heroContent.append(crumb);
  }
  const h1 = document.createElement('h1');
  h1.textContent = config.heading;
  const intro = document.createElement('p');
  intro.className = 'case-anniversaries-intro';
  intro.textContent = config.intro;
  heroContent.append(h1, intro);
  hero.append(heroContent);
  inner.append(hero);

  const listing = document.createElement('section');
  listing.className = 'case-anniversaries-listing';

  const controls = document.createElement('div');
  controls.className = 'case-anniversaries-controls';
  const findHeading = document.createElement('h2');
  findHeading.textContent = config.findHeading;
  controls.append(findHeading);

  const form = document.createElement('form');
  form.className = 'case-anniversaries-form';
  const search = document.createElement('input');
  search.className = 'case-anniversaries-search';
  search.type = 'search';
  search.placeholder = config.searchPlaceholder;
  search.setAttribute('aria-label', config.searchPlaceholder);
  const stateSelect = createSelect('State');
  const typeSelect = createSelect('Case Type');
  const yearsSelect = createSelect('Years Missing');
  form.append(search, stateSelect, typeSelect, yearsSelect);
  controls.append(form);
  listing.append(controls);

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
  inner.append(listing, buildReportingSection(config));

  return {
    inner,
    form,
    search,
    stateSelect,
    typeSelect,
    yearsSelect,
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
    heading: getFieldValue(block, 'heading', DEFAULTS.heading),
    intro: getFieldValue(block, 'intro', DEFAULTS.intro),
    eyebrow: getFieldValue(block, 'eyebrow', DEFAULTS.eyebrow),
    findHeading: getFieldValue(block, 'findHeading', DEFAULTS.findHeading),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', DEFAULTS.apiBaseUrl)),
    endpointPath: getFieldValue(block, 'endpointPath', DEFAULTS.endpointPath),
    posterPagePath: getFieldValue(block, 'posterPagePath', DEFAULTS.posterPagePath),
    timeframe: getFieldValue(block, 'timeframe', DEFAULTS.timeframe),
    pageSize: parseIntSafe(getFieldValue(block, 'pageSize', DEFAULTS.pageSize), DEFAULTS.pageSize),
    searchPlaceholder: getFieldValue(block, 'searchPlaceholder', DEFAULTS.searchPlaceholder),
    loadMoreText: getFieldValue(block, 'loadMoreText', DEFAULTS.loadMoreText),
    emptyMessage: getFieldValue(block, 'emptyMessage', DEFAULTS.emptyMessage),
    reportingHeading: getFieldValue(block, 'reportingHeading', DEFAULTS.reportingHeading),
    reportingCopy: getFieldValue(block, 'reportingCopy', DEFAULTS.reportingCopy),
    mediaEmail: getFieldValue(block, 'mediaEmail', DEFAULTS.mediaEmail),
    heroImage: getFieldValue(block, 'heroImage', DEFAULTS.heroImage),
  };

  const layout = buildShell(config);
  const state = {
    page: 0,
    lastPage: 1,
    total: 0,
    loading: false,
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
      url.searchParams.set('timeframe', config.timeframe);
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

  block.replaceChildren(layout.inner);

  if (!config.apiBaseUrl) {
    setStatus(layout.status, 'Add an API Base URL to load case anniversaries.', 'error');
    return;
  }

  await loadCases(true);
}
