import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  source: ['source', 'resource source', 'resources source', 'library source'],
  selected: ['selected', 'selected ids', 'resource ids', 'selected resources'],
  pageSize: ['page size', 'items per page', 'limit', 'initial count'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
};

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
      if (!labels.includes(key)) return false;
      const anchor = valueEl.querySelector('a');
      map[name] = anchor?.getAttribute('href') || valueEl.textContent.trim();
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getBlockField(block, legacyMap, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const value = source.textContent.trim();
    source.remove();
    return value;
  }
  return legacyMap[name] || '';
}

function getBlockLinkField(block, legacyMap, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    const resourceRef = source.getAttribute('data-aue-resource')
      || source.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
      || '';
    const resourcePathMatch = resourceRef.match(/(\/content\/[^?]+)/);
    const resourcePath = resourcePathMatch ? resourcePathMatch[1] : '';
    const value = anchor?.getAttribute('href') || source.textContent.trim() || resourcePath;
    source.remove();
    return value;
  }
  return legacyMap[name] || '';
}

function normalizeToken(value) {
  return `${value || ''}`.trim().toLowerCase();
}

function toResourceId(value) {
  return normalizeToken(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function parseIntSafe(value, fallback = 8) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function normalizeResourcePath(path) {
  let value = `${path || ''}`.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch (error) {
      return '';
    }
  }
  const [withoutHash] = value.split('#');
  const [withoutQuery] = withoutHash.split('?');
  value = withoutQuery;
  value = value.replace(/^\/editor\.html/, '');
  if (value && !value.startsWith('/')) {
    const contentIndex = value.indexOf('/content/edge/');
    if (contentIndex >= 0) {
      value = value.slice(contentIndex);
    } else {
      value = `/${value}`;
    }
  }
  if (!value.startsWith('/')) return '';
  value = value.replace(/(\.plain)?\.html$/, '');
  return value.replace(/\/+$/, '');
}

function resolveResourcePathCandidates(path) {
  const normalized = normalizeResourcePath(path);
  if (!normalized) return [];

  const candidates = new Set([normalized]);

  if (normalized.startsWith('/content/edge/')) {
    const stripped = normalized.replace('/content/edge', '');
    if (stripped) candidates.add(stripped);
  }

  if (normalized.startsWith('/edge/')) {
    const stripped = normalized.replace('/edge', '');
    if (stripped) candidates.add(stripped);
  }

  return [...candidates].filter(Boolean);
}

function getImageData(col) {
  if (!col) return { picture: null, src: '', alt: '' };
  const picture = col.querySelector('picture');
  const img = col.querySelector('img');
  return {
    picture,
    src: img?.src || '',
    alt: img?.alt || '',
  };
}

function getLinkUrl(col) {
  if (!col) return '';
  const anchor = col.querySelector('a');
  if (anchor && anchor.href) return anchor.href;
  return col.textContent.trim();
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
  if (!source) return { picture: null, src: '', alt: '' };
  return getImageData(source);
}

function mapResource(resource) {
  const id = resource.id || toResourceId(resource.title);
  const audience = parseList(resource.audience);
  const issue = parseList(resource.issue);
  const type = parseList(resource.type);
  const tags = [...new Set([...type, ...audience, ...issue])];
  return {
    imagePicture: resource.imagePicture || null,
    imgSrc: resource.imgSrc || '',
    imageAlt: resource.imageAlt || '',
    title: resource.title || '',
    subtitle: resource.subtitle || '',
    linkUrl: resource.linkUrl || '',
    id,
    audience,
    issue,
    type,
    tags,
  };
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

  // Supports legacy resources item: image | icon | iconColor | title | subtitle | link
  if (cols.length >= 6) {
    const imageData = getImageData(cols[0]);
    return mapResource({
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      title: cols[3].textContent.trim(),
      subtitle: cols[4].textContent.trim(),
      linkUrl: getLinkUrl(cols[5]),
    });
  }

  const propTitle = getPropText(row, 'title');
  if (propTitle) {
    const imageData = getPropImage(row, 'image');
    return mapResource({
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      title: propTitle,
      subtitle: getPropText(row, 'subtitle'),
      linkUrl: getPropLink(row, 'link'),
      id: getPropText(row, 'id'),
      audience: getPropText(row, 'audience'),
      issue: getPropText(row, 'issue'),
      type: getPropText(row, 'type'),
    });
  }

  if (cols.length >= 2) {
    const imageData = getImageData(cols[0]);
    if (!imageData.picture && !imageData.src) return null;
    const link = cols[1].querySelector('a');
    const paragraphs = cols[1].querySelectorAll('p');
    return mapResource({
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      title: paragraphs[0]?.textContent.trim() || '',
      subtitle: paragraphs[1]?.textContent.trim() || '',
      linkUrl: link?.href || '',
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
  card.dataset.resourceId = resource.id;
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
    const picture = createOptimizedPicture(
      resource.imgSrc,
      resource.imageAlt,
      false,
      [{ width: '800' }],
    );
    imageWrap.append(picture);
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

function matchesFacet(resourceValues, selectedValues) {
  if (!selectedValues.size) return true;
  return resourceValues.some((value) => selectedValues.has(normalizeToken(value)));
}

function sortValues(values) {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function loadSourceResources(path) {
  const candidates = resolveResourcePathCandidates(path);
  if (!candidates.length) return [];

  const attempts = await Promise.all(candidates.map(async (candidate) => {
    try {
      const response = await fetch(`${candidate}.plain.html`);
      if (!response.ok) return null;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const sourceBlock = doc.querySelector('.resources-browser.block, .resources-browser')
        || doc.querySelector('.resources.block, .resources');
      if (!sourceBlock) return null;

      const sourceClone = sourceBlock.cloneNode(true);
      collectLegacyBlockFields(sourceClone);

      const rows = [...sourceClone.querySelectorAll(':scope > div')];
      const resources = [];
      rows.forEach((row) => {
        const resource = parseResourceRow(row);
        if (resource) resources.push({ data: resource, row: null });
      });
      return resources;
    } catch (error) {
      return null;
    }
  }));

  const firstResolved = attempts.find((resources) => resources !== null);
  return firstResolved || [];
}

function createFilterSelect(label, values) {
  const select = document.createElement('select');
  select.className = 'resources-browser-filter';
  select.setAttribute('aria-label', label);

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = label;
  select.append(defaultOption);

  sortValues(values).forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  });

  if (values.size === 0) {
    select.disabled = true;
  }

  return select;
}

function getSearchBlob(resource) {
  return [
    resource.title,
    resource.subtitle,
    resource.id,
    resource.audience.join(' '),
    resource.issue.join(' '),
    resource.type.join(' '),
  ].join(' ').toLowerCase();
}

function createChip(label, onRemove) {
  const colors = colorFromTag(label);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'resources-browser-active-chip';
  chip.append(buildTag(label));

  const close = document.createElement('span');
  close.className = 'resources-browser-active-chip-close';
  close.setAttribute('aria-hidden', 'true');
  close.textContent = 'x';
  close.style.backgroundColor = colors.bg;
  close.style.color = colors.color;
  chip.append(close);

  chip.setAttribute('aria-label', `Remove filter ${label}`);
  chip.addEventListener('click', onRemove);
  return chip;
}

export default async function decorate(block) {
  const legacyMap = collectLegacyBlockFields(block);
  const heading = getBlockField(block, legacyMap, 'heading');
  const sourcePath = getBlockLinkField(block, legacyMap, 'source');
  const selectedField = getBlockField(block, legacyMap, 'selected');
  const selectedIds = new Set(parseList(selectedField).map((id) => normalizeToken(id)));
  const pageSize = parseIntSafe(getBlockField(block, legacyMap, 'pageSize'), 8);
  const searchPlaceholder = getBlockField(block, legacyMap, 'searchPlaceholder') || 'Search';
  const loadMoreText = getBlockField(block, legacyMap, 'loadMoreText') || 'Load More';

  const rows = [...block.querySelectorAll(':scope > div')];
  const inlineResources = [];
  rows.forEach((row) => {
    const resource = parseResourceRow(row);
    if (resource) inlineResources.push({ data: resource, row });
  });

  const sourceResources = await loadSourceResources(sourcePath);
  const resourceRows = sourceResources.length ? sourceResources : inlineResources;
  let resources = resourceRows.map(({ data, row }) => ({ data, row }));
  if (selectedIds.size) {
    resources = resources.filter(({ data }) => selectedIds.has(normalizeToken(data.id)));
  }

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
  searchWrap.setAttribute('aria-label', 'Search resources');

  const searchInput = document.createElement('input');
  searchInput.className = 'resources-browser-search';
  searchInput.type = 'search';
  searchInput.placeholder = searchPlaceholder;
  searchWrap.append(searchInput);
  controls.append(searchWrap);

  const audienceValues = new Set();
  const issueValues = new Set();
  const typeValues = new Set();
  resources.forEach(({ data }) => {
    data.audience.forEach((value) => audienceValues.add(value));
    data.issue.forEach((value) => issueValues.add(value));
    data.type.forEach((value) => typeValues.add(value));
  });

  const audienceSelect = createFilterSelect('Audience', audienceValues);
  const issueSelect = createFilterSelect('Issue', issueValues);
  const typeSelect = createFilterSelect('Type', typeValues);
  controls.append(audienceSelect, issueSelect, typeSelect);

  header.append(controls);
  inner.append(header);

  const meta = document.createElement('div');
  meta.className = 'resources-browser-meta';

  const activeFilters = document.createElement('div');
  activeFilters.className = 'resources-browser-active-filters';
  meta.append(activeFilters);

  const count = document.createElement('p');
  count.className = 'resources-browser-count';
  meta.append(count);
  inner.append(meta);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'resources-browser-cards';
  const cards = resources.map(({ data, row }) => {
    const card = buildResourceCard(data, row);
    cardsContainer.append(card);
    return { data, card };
  });

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

  const state = {
    query: '',
    selectedAudience: new Set(),
    selectedIssue: new Set(),
    selectedType: new Set(),
    visibleCount: pageSize,
  };

  const optionLabels = {
    audience: new Map(sortValues(audienceValues).map((value) => [normalizeToken(value), value])),
    issue: new Map(sortValues(issueValues).map((value) => [normalizeToken(value), value])),
    type: new Map(sortValues(typeValues).map((value) => [normalizeToken(value), value])),
  };

  let applyFilters = () => {};

  const renderActiveFilters = () => {
    activeFilters.replaceChildren();
    const chips = [];
    state.selectedType.forEach((value) => chips.push({ facet: 'type', value }));
    state.selectedAudience.forEach((value) => chips.push({ facet: 'audience', value }));
    state.selectedIssue.forEach((value) => chips.push({ facet: 'issue', value }));
    if (!chips.length) return;

    chips.forEach(({ facet, value }) => {
      const label = optionLabels[facet].get(value) || value;
      const chip = createChip(label, () => {
        if (facet === 'audience') state.selectedAudience.delete(value);
        if (facet === 'issue') state.selectedIssue.delete(value);
        if (facet === 'type') state.selectedType.delete(value);
        state.visibleCount = pageSize;
        applyFilters();
      });
      activeFilters.append(chip);
    });

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'resources-browser-clear-all';
    clear.textContent = 'Clear All';
    clear.addEventListener('click', () => {
      state.selectedAudience.clear();
      state.selectedIssue.clear();
      state.selectedType.clear();
      state.visibleCount = pageSize;
      applyFilters();
    });
    activeFilters.append(clear);
  };

  applyFilters = () => {
    const query = state.query.trim().toLowerCase();
    const filteredCards = cards.filter(({ data }) => {
      const searchMatch = !query || getSearchBlob(data).includes(query);
      if (!searchMatch) return false;
      const audienceMatch = matchesFacet(data.audience, state.selectedAudience);
      if (!audienceMatch) return false;
      const issueMatch = matchesFacet(data.issue, state.selectedIssue);
      if (!issueMatch) return false;
      return matchesFacet(data.type, state.selectedType);
    });

    const shownCount = Math.min(state.visibleCount, filteredCards.length);
    cards.forEach(({ card }) => card.classList.add('resources-browser-card-hidden'));
    filteredCards.slice(0, shownCount).forEach(({ card }) => {
      card.classList.remove('resources-browser-card-hidden');
    });

    count.textContent = `Showing ${shownCount} of ${filteredCards.length} resources`;
    emptyState.hidden = filteredCards.length > 0;
    loadMoreButton.hidden = shownCount >= filteredCards.length;
    renderActiveFilters();
  };

  function applyFacetSelection(selectEl, selectedSet) {
    const { value } = selectEl;
    if (!value) return;
    selectedSet.add(normalizeToken(value));
    selectEl.value = '';
    state.visibleCount = pageSize;
    applyFilters();
  }

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    state.visibleCount = pageSize;
    applyFilters();
  });

  audienceSelect.addEventListener('change', () => {
    applyFacetSelection(audienceSelect, state.selectedAudience);
  });
  issueSelect.addEventListener('change', () => {
    applyFacetSelection(issueSelect, state.selectedIssue);
  });
  typeSelect.addEventListener('change', () => {
    applyFacetSelection(typeSelect, state.selectedType);
  });

  loadMoreButton.addEventListener('click', () => {
    state.visibleCount += pageSize;
    applyFilters();
  });

  applyFilters();
  block.replaceChildren(inner);
}
