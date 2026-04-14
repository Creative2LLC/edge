import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'resource api base url', 'resource api url'],
  selected: ['selected', 'selected ids', 'selected slugs', 'resource ids', 'selected resources'],
  pageSize: ['page size', 'items per page', 'limit', 'initial count'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
  audiencePreset: ['audience preset', 'preset audience', 'default audience'],
  issuePreset: ['issue preset', 'preset issue', 'default issue'],
  typePreset: ['type preset', 'preset type', 'default type'],
  tagPreset: ['tag preset', 'preset tag', 'default tag'],
  filters: ['filters', 'preset filters'],
};

const BLOCK_PROPS = [
  'heading',
  'apiBaseUrl',
  'selected',
  'filters',
  'pageSize',
  'searchPlaceholder',
  'loadMoreText',
  'audiencePreset',
  'issuePreset',
  'typePreset',
  'tagPreset',
];

function extractConfigRow(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  let configRow = rows.find((row) => BLOCK_PROPS.some(
    (prop) => row.querySelector(`[data-aue-prop="${prop}"]`),
  ));

  if (!configRow && rows.length > 0) {
    configRow = rows.find((row) => !row.querySelector('[data-aue-prop="title"]')
      && !row.querySelector('[data-aue-prop="image"]')
      && !row.querySelector('picture'));

    if (!configRow) [configRow] = rows;
  }

  return configRow;
}

function readConfigField(configRow, name, columnIndex, fallback = '') {
  if (!configRow) return fallback;

  const source = configRow.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source.textContent.trim() || fallback;

  const cols = [...configRow.children];
  return cols[columnIndex]?.textContent.trim() || fallback;
}

const TAG_COLORS = {
  video: { bg: '#1f9bd1', color: '#fff' },
  families: { bg: '#ef4444', color: '#fff' },
  guide: { bg: '#f4c21d', color: '#3a3a3a' },
  professionals: { bg: '#73bf75', color: '#fff' },
  tool: { bg: '#ef6b2f', color: '#fff' },
  infographic: { bg: '#bf2ac3', color: '#fff' },
  policymakers: { bg: '#9ca3af', color: '#fff' },
  training: { bg: '#b15b21', color: '#fff' },
  'fact-sheet': { bg: '#2eb6d8', color: '#fff' },
};

function collectLegacyBlockFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(LEGACY_BLOCK_LABELS).some(([name, labels]) => {
      const matched = labels.some((label) => key === label || key.includes(label));
      if (!matched) return false;
      const anchor = valueEl.querySelector('a');
      map[name] = anchor?.getAttribute('href') || valueEl.textContent.trim();
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getBlockField(block, legacyMap, name, fallback = '') {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const value = source.textContent.trim();
    source.remove();
    return value || fallback;
  }
  return legacyMap[name] || fallback;
}

function normalizeToken(value) {
  return `${value || ''}`.trim().toLowerCase();
}

function parseList(value) {
  const values = `${value || ''}`
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set();
  return values.filter((entry) => {
    const key = normalizeToken(entry);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseKeyValueLines(value) {
  return `${value || ''}`
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((map, entry) => {
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

function parseIntSafe(value, fallback = 8) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function normalizeApiBaseUrl(value) {
  return `${value || ''}`.trim().replace(/\/+$/, '');
}

function splitSelectedResources(values) {
  return values.reduce((accumulator, value) => {
    if (/^\d+$/.test(value)) accumulator.ids.push(value);
    else accumulator.slugs.push(value);
    return accumulator;
  }, { ids: [], slugs: [] });
}

function getImageData(col) {
  if (!col) return { picture: null, src: '', alt: '' };
  const picture = col.querySelector('picture');
  const img = col.querySelector('img');
  return { picture, src: img?.src || '', alt: img?.alt || '' };
}

function getLinkUrl(col) {
  if (!col) return '';
  const anchor = col.querySelector('a');
  return anchor?.href || col.textContent.trim();
}

function getPropText(row, prop) {
  const source = row.querySelector(`[data-aue-prop="${prop}"]`);
  return source ? source.textContent.trim() : '';
}

function getPropLink(row, prop) {
  const source = row.querySelector(`[data-aue-prop="${prop}"]`);
  if (!source) return '';
  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  return anchor?.href || source.textContent.trim();
}

function getPropImage(row, prop) {
  const source = row.querySelector(`[data-aue-prop="${prop}"]`);
  return source ? getImageData(source) : { picture: null, src: '', alt: '' };
}

function mapResource(resource) {
  const audience = parseList(resource.audience);
  const issue = parseList(resource.issue);
  const type = parseList(resource.type);
  const customTags = parseList(resource.tags);
  return {
    imagePicture: resource.imagePicture || null,
    imgSrc: resource.imgSrc || '',
    imageAlt: resource.imageAlt || '',
    title: resource.title || '',
    subtitle: resource.subtitle || '',
    linkUrl: resource.linkUrl || '',
    id: resource.id || resource.title || '',
    audience,
    issue,
    type,
    tags: [...new Set([...customTags, ...type, ...audience, ...issue])],
  };
}

function mapApiResource(resource) {
  return mapResource({
    imgSrc: resource.thumbnail || '',
    imageAlt: resource.title || '',
    title: resource.title || '',
    subtitle: resource.excerpt || '',
    linkUrl: resource.resource_url || '',
    id: resource.slug || `${resource.id || ''}`,
    audience: resource.audience_label || '',
    issue: resource.issue_label || '',
    type: resource.resource_type_label || '',
    tags: (resource.tags || []).map((tag) => tag.name),
  });
}

function parseResourceRow(row) {
  const cols = [...row.children];

  if (cols.length >= 8) {
    const imageData = getImageData(cols[0]);
    return mapResource({
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      title: cols[1].textContent.trim(),
      subtitle: cols[2].textContent.trim(),
      linkUrl: getLinkUrl(cols[3]),
      id: cols[4].textContent.trim(),
      audience: cols[5].textContent.trim(),
      issue: cols[6].textContent.trim(),
      type: cols[7].textContent.trim(),
    });
  }

  const propTitle = getPropText(row, 'title');
  if (propTitle) {
    const imageData = getPropImage(row, 'image');
    const filters = parseFilterLists(getPropText(row, 'filters'));
    return mapResource({
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      title: propTitle,
      subtitle: getPropText(row, 'subtitle'),
      linkUrl: getPropLink(row, 'link'),
      id: getPropText(row, 'id'),
      audience: getPropText(row, 'audience') || filters.audience.join(', '),
      issue: getPropText(row, 'issue') || filters.issue.join(', '),
      type: getPropText(row, 'type') || filters.type.join(', '),
      tags: getPropText(row, 'tags') || filters.tags.join(', '),
    });
  }

  return null;
}

function colorFromTag(tag) {
  const key = normalizeToken(tag).replace(/\s+/g, '-');
  const mapped = TAG_COLORS[key];
  if (mapped) return mapped;

  let hash = 0;
  key.split('').forEach((char, index) => {
    hash = ((hash * 33) + char.charCodeAt(0) + index) % 3600;
  });
  const hue = Math.abs(Math.round(hash)) % 360;
  return { bg: `hsl(${hue}deg 65% 45%)`, color: '#fff' };
}

function buildTag(tag) {
  const pill = document.createElement('span');
  pill.className = 'resources-browser-tag';
  pill.textContent = tag;
  const colors = colorFromTag(tag);
  pill.style.backgroundColor = colors.bg;
  pill.style.color = colors.color;
  return pill;
}

function buildResourceCard(resource, row = null) {
  const card = document.createElement('article');
  card.className = 'resources-browser-card';
  if (row) moveInstrumentation(row, card);

  if (resource.imagePicture) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'resources-browser-card-image';
    imageWrap.append(resource.imagePicture);
    const img = resource.imagePicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      resource.imagePicture.replaceWith(optimized);
    }
    card.append(imageWrap);
  } else if (resource.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'resources-browser-card-image';
    imageWrap.append(createOptimizedPicture(resource.imgSrc, resource.imageAlt, false, [{ width: '800' }]));
    card.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'resources-browser-card-content';

  if (resource.title) {
    const title = document.createElement('h3');
    title.className = 'resources-browser-card-title';
    title.textContent = resource.title;
    content.append(title);
  }

  if (resource.tags.length) {
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'resources-browser-card-tags';
    resource.tags.slice(0, 4).forEach((tag) => tagsWrap.append(buildTag(tag)));
    content.append(tagsWrap);
  }

  if (resource.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'resources-browser-card-subtitle';
    subtitle.textContent = resource.subtitle;
    content.append(subtitle);
  }

  if (resource.linkUrl) {
    const link = document.createElement('a');
    link.className = 'resources-browser-card-link';
    link.href = resource.linkUrl;
    link.textContent = 'Learn more ->';
    content.append(link);
  }

  card.append(content);
  return card;
}

function createFilterSelect(label) {
  const select = document.createElement('select');
  select.className = 'resources-browser-filter';
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
  const colors = colorFromTag(label);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'resources-browser-active-chip';
  chip.append(buildTag(label));

  const close = document.createElement('span');
  close.className = 'resources-browser-active-chip-close';
  close.textContent = 'x';
  close.style.backgroundColor = colors.bg;
  close.style.color = colors.color;
  chip.append(close);
  chip.addEventListener('click', onRemove);
  return chip;
}

function debounce(callback, wait = 250) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

function buildDebugPanel(title, lines = []) {
  const details = document.createElement('details');
  details.className = 'resources-browser-source-debug';
  details.open = true;

  const summary = document.createElement('summary');
  summary.textContent = title;
  details.append(summary);

  lines.filter(Boolean).forEach((line) => {
    const paragraph = document.createElement('p');
    paragraph.className = 'resources-browser-source-debug-text';
    paragraph.textContent = line;
    details.append(paragraph);
  });

  return details;
}

function buildShell({ heading, searchPlaceholder, loadMoreText }) {
  const inner = document.createElement('div');
  inner.className = 'resources-browser-inner';

  const header = document.createElement('div');
  header.className = 'resources-browser-header';
  if (heading) {
    const headingEl = document.createElement('h2');
    headingEl.className = 'resources-browser-heading';
    headingEl.textContent = heading;
    header.append(headingEl);
  }

  const controls = document.createElement('div');
  controls.className = 'resources-browser-controls';
  const searchWrap = document.createElement('label');
  searchWrap.className = 'resources-browser-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'resources-browser-search';
  searchInput.type = 'search';
  searchInput.placeholder = searchPlaceholder;
  searchWrap.append(searchInput);
  controls.append(searchWrap);

  const audienceSelect = createFilterSelect('Audience');
  const issueSelect = createFilterSelect('Issue');
  const typeSelect = createFilterSelect('Type');
  controls.append(audienceSelect, issueSelect, typeSelect);
  header.append(controls);
  inner.append(header);

  const meta = document.createElement('div');
  meta.className = 'resources-browser-meta';
  const activeFilters = document.createElement('div');
  activeFilters.className = 'resources-browser-active-filters';
  const count = document.createElement('p');
  count.className = 'resources-browser-count';
  meta.append(activeFilters, count);
  inner.append(meta);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'resources-browser-cards';
  const emptyState = document.createElement('p');
  emptyState.className = 'resources-browser-empty';
  emptyState.hidden = true;
  emptyState.textContent = 'No resources match your current filters.';

  const footer = document.createElement('div');
  footer.className = 'resources-browser-footer';
  const loadMoreButton = document.createElement('button');
  loadMoreButton.className = 'resources-browser-load-more';
  loadMoreButton.type = 'button';
  loadMoreButton.textContent = loadMoreText;
  footer.append(loadMoreButton);

  inner.append(cardsContainer, emptyState, footer);

  return {
    inner,
    searchInput,
    audienceSelect,
    issueSelect,
    typeSelect,
    activeFilters,
    count,
    cardsContainer,
    emptyState,
    loadMoreButton,
  };
}

function renderInlineBrowser(block, config, resources, debugLines = []) {
  const layout = buildShell(config);
  const {
    inner,
    searchInput,
    audienceSelect,
    issueSelect,
    typeSelect,
    activeFilters,
    count,
    cardsContainer,
    emptyState,
    loadMoreButton,
  } = layout;

  if (debugLines.length) {
    inner.insertBefore(
      buildDebugPanel('Resources Browser Debug', debugLines),
      inner.querySelector('.resources-browser-meta'),
    );
  }

  const cards = resources.map(({ data, row }) => {
    const card = buildResourceCard(data, row);
    cardsContainer.append(card);
    return { data, card };
  });

  const collectOptions = (facet) => [...new Set(cards.flatMap(({ data }) => data[facet]))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((value) => ({ value, label: value }));

  const audiences = collectOptions('audience');
  const issues = collectOptions('issue');
  const types = collectOptions('type');
  setFilterOptions(audienceSelect, 'Audience', audiences);
  setFilterOptions(issueSelect, 'Issue', issues);
  setFilterOptions(typeSelect, 'Type', types);

  const optionLabels = {
    audience: new Map(audiences.map((option) => [normalizeToken(option.value), option.label])),
    issue: new Map(issues.map((option) => [normalizeToken(option.value), option.label])),
    type: new Map(types.map((option) => [normalizeToken(option.value), option.label])),
  };

  const state = {
    query: '',
    visibleCount: config.pageSize,
    selectedAudience: new Set(),
    selectedIssue: new Set(),
    selectedType: new Set(),
  };

  let renderActiveFilters = () => {};

  function applyFilters() {
    const query = state.query.trim().toLowerCase();
    const filtered = cards.filter(({ data }) => {
      const searchBlob = [data.title, data.subtitle, data.tags.join(' ')].join(' ');
      const searchMatch = !query || searchBlob.toLowerCase().includes(query);
      if (!searchMatch) return false;

      const audienceMatch = !state.selectedAudience.size
        || data.audience.some((value) => state.selectedAudience.has(normalizeToken(value)));
      const issueMatch = !state.selectedIssue.size
        || data.issue.some((value) => state.selectedIssue.has(normalizeToken(value)));
      const typeMatch = !state.selectedType.size
        || data.type.some((value) => state.selectedType.has(normalizeToken(value)));

      return audienceMatch && issueMatch && typeMatch;
    });

    const shown = Math.min(state.visibleCount, filtered.length);
    cards.forEach(({ card }) => card.classList.add('resources-browser-card-hidden'));
    filtered.slice(0, shown).forEach(({ card }) => {
      card.classList.remove('resources-browser-card-hidden');
    });

    count.textContent = filtered.length
      ? `Showing ${shown} of ${filtered.length} resources`
      : 'Showing 0 resources';
    emptyState.hidden = filtered.length > 0;
    loadMoreButton.hidden = shown >= filtered.length;
    renderActiveFilters();
  }

  renderActiveFilters = () => {
    activeFilters.replaceChildren();
    const facets = [
      ...[...state.selectedType].map((value) => ({ facet: 'type', value })),
      ...[...state.selectedAudience].map((value) => ({ facet: 'audience', value })),
      ...[...state.selectedIssue].map((value) => ({ facet: 'issue', value })),
    ];

    facets.forEach(({ facet, value }) => {
      const label = optionLabels[facet].get(value) || value;
      activeFilters.append(createChip(label, () => {
        if (facet === 'type') state.selectedType.delete(value);
        if (facet === 'audience') state.selectedAudience.delete(value);
        if (facet === 'issue') state.selectedIssue.delete(value);
        state.visibleCount = config.pageSize;
        applyFilters();
      }));
    });
  };

  const applyFacet = (select, set) => {
    if (!select.value) return;
    set.add(normalizeToken(select.value));
    select.value = '';
    state.visibleCount = config.pageSize;
    applyFilters();
  };

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    state.visibleCount = config.pageSize;
    applyFilters();
  });
  audienceSelect.addEventListener('change', () => {
    applyFacet(audienceSelect, state.selectedAudience);
  });
  issueSelect.addEventListener('change', () => {
    applyFacet(issueSelect, state.selectedIssue);
  });
  typeSelect.addEventListener('change', () => {
    applyFacet(typeSelect, state.selectedType);
  });
  loadMoreButton.addEventListener('click', () => {
    state.visibleCount += config.pageSize;
    applyFilters();
  });

  applyFilters();
  block.replaceChildren(inner);
}

async function renderApiBrowser(block, config) {
  const layout = buildShell(config);
  const {
    inner,
    searchInput,
    audienceSelect,
    issueSelect,
    typeSelect,
    activeFilters,
    count,
    cardsContainer,
    emptyState,
    loadMoreButton,
  } = layout;

  const apiRoot = normalizeApiBaseUrl(config.apiBaseUrl);
  const selected = splitSelectedResources(parseList(config.selectedField));
  const presetTags = parseList(config.tagPreset).map((value) => normalizeToken(value));
  const state = {
    query: '',
    selectedAudience: new Set(parseList(config.audiencePreset).map(normalizeToken)),
    selectedIssue: new Set(parseList(config.issuePreset).map(normalizeToken)),
    selectedType: new Set(parseList(config.typePreset).map(normalizeToken)),
    page: 0,
    lastPage: 1,
    total: 0,
    loading: false,
  };

  const optionLabels = {
    audience: new Map(),
    issue: new Map(),
    type: new Map(),
  };

  let renderActiveFilters = () => {};
  let loadResources = async () => {};

  renderActiveFilters = () => {
    activeFilters.replaceChildren();
    const facets = [
      ...[...state.selectedType].map((value) => ({ facet: 'type', value })),
      ...[...state.selectedAudience].map((value) => ({ facet: 'audience', value })),
      ...[...state.selectedIssue].map((value) => ({ facet: 'issue', value })),
    ];

    facets.forEach(({ facet, value }) => {
      const label = optionLabels[facet].get(value) || value;
      activeFilters.append(createChip(label, () => {
        if (facet === 'type') state.selectedType.delete(value);
        if (facet === 'audience') state.selectedAudience.delete(value);
        if (facet === 'issue') state.selectedIssue.delete(value);
        loadResources(true);
      }));
    });
  };

  function updateFilters(filters = {}) {
    const audiences = filters.audiences || [];
    const issues = filters.issues || [];
    const types = filters.types || [];

    setFilterOptions(audienceSelect, 'Audience', audiences);
    setFilterOptions(issueSelect, 'Issue', issues);
    setFilterOptions(typeSelect, 'Type', types);
    optionLabels.audience = new Map(
      audiences.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.issue = new Map(
      issues.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.type = new Map(
      types.map((option) => [normalizeToken(option.value), option.label]),
    );
  }

  loadResources = async (reset = false) => {
    if (state.loading) return;

    if (reset) {
      state.page = 0;
      state.lastPage = 1;
      cardsContainer.replaceChildren();
      emptyState.hidden = true;
    }

    state.loading = true;
    if (!cardsContainer.children.length) {
      count.textContent = 'Loading resources...';
    }
    loadMoreButton.disabled = true;

    const url = new URL('/api/resources', `${apiRoot}/`);
    url.searchParams.set('per_page', String(config.pageSize));
    url.searchParams.set('page', String(reset ? 1 : state.page + 1));
    if (state.query.trim()) {
      url.searchParams.set('search', state.query.trim());
    }
    state.selectedAudience.forEach((value) => url.searchParams.append('audiences[]', value));
    state.selectedIssue.forEach((value) => url.searchParams.append('issues[]', value));
    state.selectedType.forEach((value) => url.searchParams.append('types[]', value));
    presetTags.forEach((value) => url.searchParams.append('tags[]', value));
    selected.ids.forEach((value) => url.searchParams.append('ids[]', value));
    selected.slugs.forEach((value) => url.searchParams.append('slugs[]', value));

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`API request failed with HTTP ${response.status}.`);
    }

    const payload = await response.json();
    (payload.data || []).forEach((item) => {
      cardsContainer.append(buildResourceCard(mapApiResource(item)));
    });

    state.page = payload.meta?.current_page || 1;
    state.lastPage = payload.meta?.last_page || 1;
    state.total = payload.meta?.total
      ?? cardsContainer.children.length;
    updateFilters(payload.filters || {});
    renderActiveFilters();

    const total = cardsContainer.children.length;
    count.textContent = state.total
      ? `Showing ${total} of ${state.total} resources`
      : 'Showing 0 resources';
    emptyState.hidden = cardsContainer.children.length > 0;
    loadMoreButton.hidden = state.page >= state.lastPage || state.total === 0;
    loadMoreButton.disabled = false;
    state.loading = false;
  };

  const applyFacet = (select, set) => {
    if (!select.value) return;
    set.add(normalizeToken(select.value));
    select.value = '';
    loadResources(true);
  };

  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value;
    loadResources(true);
  }, 300));
  audienceSelect.addEventListener('change', () => {
    applyFacet(audienceSelect, state.selectedAudience);
  });
  issueSelect.addEventListener('change', () => {
    applyFacet(issueSelect, state.selectedIssue);
  });
  typeSelect.addEventListener('change', () => {
    applyFacet(typeSelect, state.selectedType);
  });
  loadMoreButton.addEventListener('click', () => loadResources(false));

  block.replaceChildren(inner);
  await loadResources(true);
}

export default async function decorate(block) {
  const configRow = extractConfigRow(block);
  const legacyMap = collectLegacyBlockFields(block);
  const filterValue = getBlockField(block, legacyMap, 'filters')
    || readConfigField(configRow, 'filters', 3);
  const filterConfig = parseFilterLists(filterValue);
  const config = {
    heading: getBlockField(block, legacyMap, 'heading')
      || readConfigField(configRow, 'heading', 0),
    apiBaseUrl: normalizeApiBaseUrl(
      getBlockField(block, legacyMap, 'apiBaseUrl')
        || readConfigField(configRow, 'apiBaseUrl', 1),
    ),
    selectedField: getBlockField(block, legacyMap, 'selected')
      || readConfigField(configRow, 'selected', 2),
    pageSize: parseIntSafe(
      getBlockField(block, legacyMap, 'pageSize', '')
        || readConfigField(configRow, 'pageSize', 4, '8'),
      8,
    ),
    searchPlaceholder: getBlockField(block, legacyMap, 'searchPlaceholder', '')
      || readConfigField(configRow, 'searchPlaceholder', 5, 'Search')
      || 'Search',
    loadMoreText: getBlockField(block, legacyMap, 'loadMoreText', 'Load More'),
    audiencePreset: getBlockField(block, legacyMap, 'audiencePreset')
      || filterConfig.audience.join(', '),
    issuePreset: getBlockField(block, legacyMap, 'issuePreset')
      || filterConfig.issue.join(', '),
    typePreset: getBlockField(block, legacyMap, 'typePreset')
      || filterConfig.type.join(', '),
    tagPreset: getBlockField(block, legacyMap, 'tagPreset')
      || filterConfig.tags.join(', '),
  };

  if (configRow) {
    configRow.remove();
  }

  const inlineResources = [...block.querySelectorAll(':scope > div')]
    .map((row) => {
      const resource = parseResourceRow(row);
      return resource ? { data: resource, row } : null;
    })
    .filter(Boolean);

  if (!config.apiBaseUrl) {
    renderInlineBrowser(block, config, inlineResources, [
      'Missing API Base URL. The block is rendering inline fallback data only.',
      'Set the published block field apiBaseUrl to the API origin, not /api/resources.',
    ]);
    return;
  }

  try {
    await renderApiBrowser(block, config);
  } catch (error) {
    renderInlineBrowser(block, config, inlineResources, [
      `API request failed for ${config.apiBaseUrl}.`,
      error?.message || 'Unknown API error.',
      'The block fell back to inline data.',
    ]);
  }
}
