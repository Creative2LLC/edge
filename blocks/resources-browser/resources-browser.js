import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import { readListFilterState, writeListFilterState } from '../../scripts/list-filter-state.js';
import {
  DEFAULT_LIST_SORT,
  getListSortOptions,
  normalizeListSort,
  sortListItems,
} from '../../scripts/list-sort.js';
import {
  createPaginationControls,
  isPaginationMode,
  normalizePaginationMode,
} from '../../scripts/pagination-controls.js';
import {
  getFieldSelector,
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'resource api base url', 'resource api url'],
  selected: ['selected', 'selected ids', 'selected slugs', 'resource ids', 'selected resources'],
  pageSize: ['page size', 'items per page', 'limit', 'initial count'],
  searchPlaceholder: ['search placeholder', 'placeholder'],
  loadMoreText: ['load more text', 'load more'],
  paginationMode: ['pagination mode', 'display mode', 'results mode'],
  audiencePreset: ['audience preset', 'preset audience', 'default audience'],
  issuePreset: ['issue preset', 'preset issue', 'default issue'],
  typePreset: ['type preset', 'preset type', 'default type'],
  tagPreset: ['tag preset', 'preset tag', 'default tag'],
  languagePreset: ['language preset', 'preset language', 'default language'],
  programPreset: ['program preset', 'programs preset', 'preset program', 'default program'],
  gradeAgePreset: ['grade age preset', 'grade preset', 'grades preset', 'default grade'],
  visibleFilters: ['visible filters', 'filter visibility', 'shown filters', 'display filters'],
  filterTags: ['filter tags', 'visible tag options', 'shown tag options'],
  hiddenFilterTags: ['hidden filter tags', 'excluded tag options', 'exclude tag options'],
  lockedPrograms: ['locked programs', 'locked program', 'restrict programs', 'program lock'],
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
  'paginationMode',
  'audiencePreset',
  'issuePreset',
  'typePreset',
  'tagPreset',
  'languagePreset',
  'programPreset',
  'gradeAgePreset',
  'visibleFilters',
  'filterTags',
  'hiddenFilterTags',
  'lockedPrograms',
];

const FILTER_FACETS = [
  'audience',
  'issue',
  'type',
  'tags',
  'language',
  'programs',
  'grade_ages',
];

const DEFAULT_VISIBLE_FILTERS = [...FILTER_FACETS];

const RESOURCE_BROWSER_ACTION_LABELS = {
  en: {
    learnMore: 'Learn more ->',
    downloadPdf: 'Download PDF ->',
  },
  es: {
    learnMore: 'Mas informacion ->',
    downloadPdf: 'Descargar PDF ->',
  },
};

function resourceBrowserActionLabels() {
  return RESOURCE_BROWSER_ACTION_LABELS[currentSiteLocale()] || RESOURCE_BROWSER_ACTION_LABELS.en;
}

function extractConfigRow(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  let configRow = rows.find((row) => BLOCK_PROPS.some(
    (prop) => row.querySelector(getFieldSelector(prop)),
  ));

  if (!configRow && rows.length > 0) {
    configRow = rows.find((row) => !row.querySelector(getFieldSelector('title'))
      && !row.querySelector(getFieldSelector('image'))
      && !row.querySelector('picture'));

    if (!configRow) [configRow] = rows;
  }

  return configRow;
}

function readConfigField(configRow, name, columnIndex, fallback = '') {
  if (!configRow) return fallback;

  const field = readTextField(configRow, name);
  if (field.source) return field.value || fallback;

  const cols = [...configRow.children];
  return cols[columnIndex]?.textContent.trim() || fallback;
}

function isResourceItemRow(row) {
  const cols = [...row.children];

  if (row.querySelector(getFieldSelector('title'))) return true;
  if (row.querySelector(getFieldSelector('image'))) return true;
  if (cols.length >= 8) return true;

  return cols.length >= 2 && Boolean(cols[0].querySelector('picture, img'));
}

function extractConfigRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isResourceItemRow(row));
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function readConfigValue(rows, name, columnIndex, fallback = '') {
  const propValue = rows
    .map((row) => readLinkField(row, name).value || readTextField(row, name).value)
    .find(Boolean);
  if (propValue) {
    return propValue || fallback;
  }

  const firstRow = rows[0];
  if (firstRow) {
    const cols = [...firstRow.children];
    const col = cols[columnIndex];
    if (col) {
      const anchor = col.querySelector('a');
      const value = anchor?.href || col.textContent.trim();
      if (value) return value;
    }
  }

  if (name === 'apiBaseUrl') {
    const url = rows
      .map((row) => row.querySelector('a')?.href || findUrlLikeValue(row.textContent))
      .find(Boolean);
    if (url) return url;
  }

  const compactRow = rows[columnIndex];
  if (compactRow) {
    const compactCell = compactRow.children[0] || compactRow;
    const anchor = compactCell.querySelector?.('a');
    const compactValue = anchor?.href || compactCell.textContent.trim();
    if (compactValue) return compactValue;
  }

  return fallback;
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
  kidsmartz: { bg: '#008db6', color: '#fff' },
  netsmartz: { bg: '#f28c28', color: '#102536' },
  'k-2': { bg: '#c7e8d1', color: '#143423' },
  '3-5': { bg: '#d8ecf7', color: '#123244' },
  'middle-school': { bg: '#6b7fca', color: '#fff' },
  'high-school': { bg: '#243846', color: '#fff' },
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

function normalizeFilterFacet(value) {
  const key = normalizeToken(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases = {
    audiences: 'audience',
    issues: 'issue',
    types: 'type',
    content_type: 'type',
    contenttype: 'type',
    tag: 'tags',
    universal_tag: 'tags',
    universal_tags: 'tags',
    language: 'language',
    languages: 'language',
    program: 'programs',
    program_tags: 'programs',
    grade: 'grade_ages',
    grades: 'grade_ages',
    grade_age: 'grade_ages',
    grade_ages: 'grade_ages',
    gradeages: 'grade_ages',
  };
  const facet = aliases[key] || key;
  return FILTER_FACETS.includes(facet) ? facet : '';
}

function normalizeTagOption(value) {
  return normalizeToken(value)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseTagOptions(value) {
  return parseList(value)
    .map(normalizeTagOption)
    .filter(Boolean);
}

function parseVisibleFilters(value) {
  const filters = parseList(value)
    .map(normalizeFilterFacet)
    .filter(Boolean);
  return filters.length ? [...new Set(filters)] : DEFAULT_VISIBLE_FILTERS;
}

function isFilterVisible(config, facet) {
  if (facet === 'programs' && config.lockedPrograms?.length) return false;
  return (config.visibleFilters || DEFAULT_VISIBLE_FILTERS).includes(facet);
}

function filterGroupName(facet) {
  return {
    audience: 'audiences',
    issue: 'issues',
    type: 'types',
  }[facet] || facet;
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
    language: parseList(map.language || map.languages),
    programs: parseList(map.program || map.programs || map.programtags || map.program_tags),
    gradeAges: parseList(
      map.grade
        || map.grades
        || map.gradeage
        || map.gradeages
        || map.grade_age
        || map.grade_ages,
    ),
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
  return readTextField(row, prop).value;
}

function getPropLink(row, prop) {
  return readLinkField(row, prop).value;
}

function getPropImage(row, prop) {
  const field = readImageField(row, prop);
  return {
    picture: field.picture,
    src: field.img?.src || '',
    alt: field.img?.alt || '',
  };
}

function mapResource(resource) {
  const audience = parseList(resource.audience);
  const issue = parseList(resource.issue);
  const type = parseList(resource.type);
  const language = parseList(resource.language);
  const programs = parseList(resource.programs);
  const gradeAges = parseList(resource.gradeAges);
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
    language,
    programs,
    gradeAges,
    tags: customTags,
    tagEntries: [
      ...type.map((label) => ({ facet: 'type', value: normalizeToken(label), label })),
      ...programs.map((label) => ({ facet: 'programs', value: normalizeToken(label), label })),
      ...gradeAges.map((label) => ({ facet: 'grade_ages', value: normalizeToken(label), label })),
      ...language.map((label) => ({ facet: 'language', value: normalizeToken(label), label })),
      ...audience.map((label) => ({ facet: 'audience', value: normalizeToken(label), label })),
      ...issue.map((label) => ({ facet: 'issue', value: normalizeToken(label), label })),
      ...customTags.map((label) => ({ facet: 'tags', value: normalizeToken(label), label })),
    ],
  };
}

function mapApiResource(resource) {
  return {
    imagePicture: null,
    imgSrc: resource.thumbnail || '',
    imageAlt: resource.title || '',
    title: resource.title || '',
    subtitle: resource.excerpt || '',
    linkUrl: resource.primary_url || resource.detail_path || resource.download_url || resource.resource_url || '',
    detailUrl: resource.detail_path || '',
    downloadUrl: resource.download_url || resource.resource_url || '',
    id: resource.slug || `${resource.id || ''}`,
    audience: resource.audience_values || [],
    issue: resource.issue ? [resource.issue] : [],
    type: resource.resource_type ? [resource.resource_type] : [],
    language: resource.language ? [resource.language] : [],
    programs: resource.program_values || [],
    gradeAges: resource.grade_age_values || [],
    tags: (resource.tags || []).map((tag) => tag.name).filter(Boolean),
    tagEntries: [
      ...(resource.resource_type && resource.resource_type_label ? [{
        facet: 'type',
        value: normalizeToken(resource.resource_type),
        label: resource.resource_type_label,
      }] : []),
      ...((resource.program_labels || []).map((label, index) => ({
        facet: 'programs',
        value: normalizeToken(resource.program_values?.[index] || label),
        label,
      }))),
      ...((resource.grade_age_labels || []).map((label, index) => ({
        facet: 'grade_ages',
        value: normalizeToken(resource.grade_age_values?.[index] || label),
        label,
      }))),
      ...(resource.language && resource.language_label ? [{
        facet: 'language',
        value: normalizeToken(resource.language),
        label: resource.language_label,
      }] : []),
      ...((resource.audience_labels || []).map((label, index) => ({
        facet: 'audience',
        value: normalizeToken(resource.audience_values?.[index] || label),
        label,
      }))),
      ...(resource.issue && resource.issue_label ? [{
        facet: 'issue',
        value: normalizeToken(resource.issue),
        label: resource.issue_label,
      }] : []),
      ...((resource.tags || []).map((tag) => ({
        facet: 'tags',
        value: normalizeToken(tag.slug || tag.name),
        label: tag.name,
      }))),
    ],
    linkAction: resource.primary_action || '',
    hasDetailPage: Boolean(resource.has_detail_page),
    hasDownload: Boolean(resource.has_download),
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
      language: getPropText(row, 'language') || filters.language.join(', '),
      programs: getPropText(row, 'programs') || filters.programs.join(', '),
      gradeAges: getPropText(row, 'gradeAges') || filters.gradeAges.join(', '),
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

function buildTag(tagEntry, onActivate = null) {
  const entry = typeof tagEntry === 'string'
    ? { label: tagEntry, facet: null, value: normalizeToken(tagEntry) }
    : tagEntry;
  const pill = document.createElement(entry.facet && typeof onActivate === 'function' ? 'button' : 'span');
  if (pill.tagName === 'BUTTON') pill.type = 'button';
  pill.className = `resources-browser-tag${entry.facet && typeof onActivate === 'function' ? ' is-clickable' : ''}`;
  pill.textContent = entry.label;
  const colors = colorFromTag(entry.label);
  pill.style.backgroundColor = colors.bg;
  pill.style.color = colors.color;
  if (entry.facet && typeof onActivate === 'function') {
    pill.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onActivate(entry.facet, entry.value);
    });
  }
  return pill;
}

function buildResourceCard(resource, row = null, onFacetActivate = null) {
  const labels = resourceBrowserActionLabels();
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

  if (resource.tagEntries?.length) {
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'resources-browser-card-tags';
    resource.tagEntries
      .slice(0, 4)
      .forEach((tag) => tagsWrap.append(buildTag(tag, onFacetActivate)));
    content.append(tagsWrap);
  }

  if (resource.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'resources-browser-card-subtitle';
    subtitle.textContent = resource.subtitle;
    content.append(subtitle);
  }

  const actions = [
    resource.hasDetailPage && resource.detailUrl
      ? { href: resource.detailUrl, label: labels.learnMore, isDownload: false }
      : null,
    resource.hasDownload && resource.downloadUrl
      ? { href: resource.downloadUrl, label: labels.downloadPdf, isDownload: true }
      : null,
  ].filter(Boolean);

  if (!actions.length && resource.linkUrl) {
    actions.push({
      href: resource.linkUrl,
      label: resource.linkAction === 'download' ? labels.downloadPdf : labels.learnMore,
      isDownload: resource.linkAction === 'download',
    });
  }

  actions.forEach((action) => {
    const link = document.createElement('a');
    link.className = 'resources-browser-card-link';
    link.href = resolveSiteHref(action.href);
    if (action.isDownload) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.textContent = action.label;
    content.append(link);
  });

  card.append(content);
  return card;
}

function createFilterSelect(label) {
  const select = document.createElement('select');
  select.className = 'resources-browser-filter';
  select.setAttribute('aria-label', label);
  return select;
}

function createSortSelect(label) {
  const select = document.createElement('select');
  select.className = 'resources-browser-filter resources-browser-sort';
  select.setAttribute('aria-label', label);
  return select;
}

function createViewIcon(view) {
  const icon = document.createElement('span');
  icon.className = `resources-browser-view-icon resources-browser-view-icon-${view}`;
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = view === 'list'
    ? '<svg viewBox="0 0 20 20" fill="none"><path d="M4 5.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 10H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 14.5H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 20 20" fill="none"><rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>';
  return icon;
}

function createViewToggleButton(label, view, activeView) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'resources-browser-view-button';
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

function debounce(callback, wait = 250) {
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

function buildShell(config) {
  const { heading, searchPlaceholder, loadMoreText } = config;
  const inner = document.createElement('div');
  inner.className = 'resources-browser-inner';

  const header = document.createElement('div');
  header.className = 'resources-browser-header';
  const headerTop = document.createElement('div');
  headerTop.className = 'resources-browser-header-top';
  if (heading) {
    const headingEl = document.createElement('h2');
    headingEl.className = 'resources-browser-heading';
    headingEl.textContent = heading;
    headerTop.append(headingEl);
  }

  const viewToggle = document.createElement('div');
  viewToggle.className = 'resources-browser-view-toggle';
  const gridButton = createViewToggleButton('Grid', 'grid', 'grid');
  const listButton = createViewToggleButton('List', 'list', 'grid');
  viewToggle.append(gridButton, listButton);
  headerTop.append(viewToggle);
  header.append(headerTop);

  const controls = document.createElement('div');
  controls.className = 'resources-browser-controls';
  const primaryRow = document.createElement('div');
  primaryRow.className = 'resources-browser-primary-row';
  const searchWrap = document.createElement('label');
  searchWrap.className = 'resources-browser-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'resources-browser-search';
  searchInput.type = 'search';
  searchInput.placeholder = searchPlaceholder;
  searchWrap.append(searchInput);
  primaryRow.append(searchWrap);

  const audienceSelect = createFilterSelect('Audience');
  const issueSelect = createFilterSelect('Issue');
  const typeSelect = createFilterSelect('Type');
  const tagSelect = createFilterSelect('Tag');
  const languageSelect = createFilterSelect('Language');
  const programSelect = createFilterSelect('Program');
  const gradeAgeSelect = createFilterSelect('Grade / Age');
  const sortSelect = createSortSelect('Sort resources');
  primaryRow.append(sortSelect);
  controls.append(primaryRow);

  const filterRow = document.createElement('div');
  filterRow.className = 'resources-browser-filter-row';
  [
    ['audience', audienceSelect],
    ['issue', issueSelect],
    ['type', typeSelect],
    ['tags', tagSelect],
    ['language', languageSelect],
    ['programs', programSelect],
    ['grade_ages', gradeAgeSelect],
  ].forEach(([facet, select]) => {
    if (isFilterVisible(config, facet)) filterRow.append(select);
  });
  filterRow.hidden = filterRow.children.length === 0;
  controls.append(filterRow);
  header.append(controls);
  inner.append(header);

  const meta = document.createElement('div');
  meta.className = 'resources-browser-meta';
  const activeFilters = document.createElement('div');
  activeFilters.className = 'resources-browser-active-filters';
  const clearAllButton = document.createElement('button');
  clearAllButton.className = 'resources-browser-clear-all';
  clearAllButton.type = 'button';
  clearAllButton.textContent = 'Clear Filters';
  clearAllButton.hidden = true;
  const count = document.createElement('p');
  count.className = 'resources-browser-count';
  meta.append(activeFilters, clearAllButton, count);
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
  const pagination = createPaginationControls('resources-browser', 'Resource results pagination');
  footer.append(loadMoreButton, pagination.nav);

  inner.append(cardsContainer, emptyState, footer);

  return {
    inner,
    searchInput,
    audienceSelect,
    issueSelect,
    typeSelect,
    tagSelect,
    languageSelect,
    programSelect,
    gradeAgeSelect,
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

function renderInlineBrowser(block, config, resources, debugLines = []) {
  const layout = buildShell(config);
  const {
    inner,
    searchInput,
    audienceSelect,
    issueSelect,
    typeSelect,
    tagSelect,
    languageSelect,
    programSelect,
    gradeAgeSelect,
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

  if (debugLines.length) {
    inner.insertBefore(
      buildDebugPanel('Resources Browser Debug', debugLines),
      inner.querySelector('.resources-browser-meta'),
    );
  }

  const state = {
    query: '',
    visibleCount: config.pageSize,
    page: 1,
    selectedAudience: new Set(),
    selectedIssue: new Set(),
    selectedType: new Set(),
    selectedTags: new Set(),
    selectedLanguage: new Set(),
    selectedProgram: new Set(),
    selectedGradeAge: new Set(),
    sort: DEFAULT_LIST_SORT,
    hasExplicitSort: false,
    view: 'grid',
  };
  const defaultState = {
    query: '',
    selectedAudience: parseList(config.audiencePreset).map(normalizeToken),
    selectedIssue: parseList(config.issuePreset).map(normalizeToken),
    selectedType: parseList(config.typePreset).map(normalizeToken),
    selectedTags: parseList(config.tagPreset).map(normalizeToken),
    selectedLanguage: parseList(config.languagePreset).map(normalizeToken),
    selectedProgram: parseList(config.programPreset).map(normalizeToken),
    selectedGradeAge: parseList(config.gradeAgePreset).map(normalizeToken),
  };
  const locationState = readListFilterState();
  state.query = locationState.hasQuery ? locationState.query : defaultState.query;
  state.view = locationState.view || 'grid';
  state.hasExplicitSort = locationState.hasSort;
  state.sort = locationState.hasSort
    ? normalizeListSort(locationState.sort)
    : DEFAULT_LIST_SORT;
  state.selectedAudience = new Set(
    locationState.audiences.present
      ? locationState.audiences.values
      : defaultState.selectedAudience,
  );
  state.selectedIssue = new Set(
    locationState.issues.present
      ? locationState.issues.values
      : defaultState.selectedIssue,
  );
  state.selectedType = new Set(
    locationState.types.present
      ? locationState.types.values
      : defaultState.selectedType,
  );
  state.selectedTags = new Set(
    locationState.tags.present ? locationState.tags.values : defaultState.selectedTags,
  );
  state.selectedLanguage = new Set(
    locationState.languages.present
      ? locationState.languages.values
      : defaultState.selectedLanguage,
  );
  state.selectedProgram = new Set(
    config.lockedPrograms?.length
      ? config.lockedPrograms
      : locationState.programs.present
        ? locationState.programs.values
        : defaultState.selectedProgram,
  );
  state.selectedGradeAge = new Set(
    locationState.gradeAges.present
      ? locationState.gradeAges.values
      : defaultState.selectedGradeAge,
  );
  const syncUrlState = (replace = true) => {
    writeListFilterState({
      query: state.query,
      audiences: [...state.selectedAudience],
      issues: [...state.selectedIssue],
      types: [...state.selectedType],
      tags: [...state.selectedTags],
      languages: [...state.selectedLanguage],
      programs: [...state.selectedProgram],
      gradeAges: [...state.selectedGradeAge],
      sort: state.hasExplicitSort ? state.sort : '',
      view: state.view,
    }, replace);
  };
  const syncFilterControls = () => {
    syncSelectValue(audienceSelect, state.selectedAudience);
    syncSelectValue(issueSelect, state.selectedIssue);
    syncSelectValue(typeSelect, state.selectedType);
    syncSelectValue(tagSelect, state.selectedTags);
    syncSelectValue(languageSelect, state.selectedLanguage);
    syncSelectValue(programSelect, state.selectedProgram);
    syncSelectValue(gradeAgeSelect, state.selectedGradeAge);
  };
  const syncSortControl = () => {
    sortSelect.value = state.sort || DEFAULT_LIST_SORT;
  };

  let renderActiveFilters = () => {};
  let cards = [];
  let optionLabels = {
    audience: new Map(),
    issue: new Map(),
    type: new Map(),
    tags: new Map(),
    language: new Map(),
    programs: new Map(),
    grade_ages: new Map(),
  };

  function applyFilters() {
    const query = state.query.trim().toLowerCase();
    const filtered = cards.filter(({ data }) => {
      const searchBlob = [
        data.title,
        data.subtitle,
        (data.tagEntries || []).map((entry) => entry.label).join(' '),
      ].join(' ');
      const searchMatch = !query || searchBlob.toLowerCase().includes(query);
      if (!searchMatch) return false;

      const audienceMatch = !state.selectedAudience.size
        || data.audience.some((value) => state.selectedAudience.has(normalizeToken(value)));
      const issueMatch = !state.selectedIssue.size
        || data.issue.some((value) => state.selectedIssue.has(normalizeToken(value)));
      const typeMatch = !state.selectedType.size
        || data.type.some((value) => state.selectedType.has(normalizeToken(value)));
      const tagMatch = !state.selectedTags.size
        || data.tags.some((value) => state.selectedTags.has(normalizeToken(value)));
      const languageMatch = !state.selectedLanguage.size
        || data.language.some((value) => state.selectedLanguage.has(normalizeToken(value)));
      const programMatch = !state.selectedProgram.size
        || data.programs.some((value) => state.selectedProgram.has(normalizeToken(value)));
      const gradeAgeMatch = !state.selectedGradeAge.size
        || data.gradeAges.some((value) => state.selectedGradeAge.has(normalizeToken(value)));

      return audienceMatch && issueMatch && typeMatch && tagMatch
        && languageMatch && programMatch && gradeAgeMatch;
    });

    const sorted = sortListItems(filtered, state.sort, ({ data, originalIndex }) => ({
      title: data.title,
      articleDate: data.article_date || data.articleDate || '',
      publishedAt: data.published_at || data.publishedAt || '',
      updatedAt: data.updated_at || data.updatedAt || '',
      createdAt: data.created_at || data.createdAt || '',
      originalIndex,
    }));

    const lastPage = Math.max(1, Math.ceil(sorted.length / config.pageSize));
    if (state.page > lastPage) state.page = lastPage;
    const pageStart = usePagination ? (state.page - 1) * config.pageSize : 0;
    const shown = usePagination
      ? Math.min(config.pageSize, Math.max(0, sorted.length - pageStart))
      : Math.min(state.visibleCount, sorted.length);
    cardsContainer.replaceChildren(...sorted.map(({ card }) => card));
    sorted.forEach(({ card }) => card.classList.add('resources-browser-card-hidden'));
    sorted.slice(pageStart, pageStart + shown).forEach(({ card }) => {
      card.classList.remove('resources-browser-card-hidden');
    });

    const shownStart = sorted.length ? pageStart + 1 : 0;
    const shownEnd = usePagination ? Math.min(pageStart + shown, sorted.length) : shown;
    count.textContent = sorted.length
      ? `Showing ${shownStart}-${shownEnd} of ${sorted.length} resources`
      : 'Showing 0 resources';
    emptyState.hidden = sorted.length > 0;
    loadMoreButton.hidden = usePagination || shown >= sorted.length;
    if (usePagination) {
      pagination.update({
        page: state.page,
        lastPage,
        onPage: (page) => {
          state.page = page;
          applyFilters();
        },
      });
    } else {
      pagination.nav.hidden = true;
    }
    renderActiveFilters();
  }

  function applyFacetValue(facet, rawValue) {
    const value = normalizeToken(rawValue);
    if (!value) return;

    if (facet === 'type') state.selectedType.add(value);
    if (facet === 'audience') state.selectedAudience.add(value);
    if (facet === 'issue') state.selectedIssue.add(value);
    if (facet === 'tags') state.selectedTags.add(value);
    if (facet === 'language') state.selectedLanguage.add(value);
    if (facet === 'programs') state.selectedProgram.add(value);
    if (facet === 'grade_ages') state.selectedGradeAge.add(value);

    state.visibleCount = config.pageSize;
    state.page = 1;
    syncFilterControls();
    syncUrlState();
    applyFilters();
  }

  cards = resources.map(({ data, row }, index) => {
    const card = buildResourceCard(data, row, applyFacetValue);
    cardsContainer.append(card);
    return { data, card, originalIndex: index };
  });

  const collectOptions = (facet) => [...new Set(cards.flatMap(({ data }) => data[facet]))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((value) => ({ value, label: value }));

  const audiences = collectOptions('audience');
  const issues = collectOptions('issue');
  const types = collectOptions('type');
  const tags = collectOptions('tags');
  const languages = collectOptions('language');
  const programs = collectOptions('programs');
  const gradeAges = collectOptions('gradeAges');
  setFilterOptions(audienceSelect, 'Audience', audiences);
  setFilterOptions(issueSelect, 'Issue', issues);
  setFilterOptions(typeSelect, 'Type', types);
  setFilterOptions(tagSelect, 'Tag', tags);
  setFilterOptions(languageSelect, 'Language', languages);
  setFilterOptions(programSelect, 'Program', programs);
  setFilterOptions(gradeAgeSelect, 'Grade / Age', gradeAges);
  setFilterOptions(sortSelect, 'Sort', getListSortOptions());

  optionLabels = {
    audience: new Map(audiences.map((option) => [normalizeToken(option.value), option.label])),
    issue: new Map(issues.map((option) => [normalizeToken(option.value), option.label])),
    type: new Map(types.map((option) => [normalizeToken(option.value), option.label])),
    tags: new Map(tags.map((option) => [normalizeToken(option.value), option.label])),
    language: new Map(languages.map((option) => [normalizeToken(option.value), option.label])),
    programs: new Map(programs.map((option) => [normalizeToken(option.value), option.label])),
    grade_ages: new Map(gradeAges.map((option) => [normalizeToken(option.value), option.label])),
  };
  syncFilterControls();
  syncSortControl();

  renderActiveFilters = () => {
    activeFilters.replaceChildren();
    const visiblePrograms = config.lockedPrograms?.length
      ? []
      : [...state.selectedProgram].map((value) => ({ facet: 'programs', value }));
    const facets = [
      ...[...state.selectedType].map((value) => ({ facet: 'type', value })),
      ...[...state.selectedAudience].map((value) => ({ facet: 'audience', value })),
      ...[...state.selectedIssue].map((value) => ({ facet: 'issue', value })),
      ...[...state.selectedTags].map((value) => ({ facet: 'tags', value })),
      ...[...state.selectedLanguage].map((value) => ({ facet: 'language', value })),
      ...visiblePrograms,
      ...[...state.selectedGradeAge].map((value) => ({ facet: 'grade_ages', value })),
    ];

    facets.forEach(({ facet, value }) => {
      const label = optionLabels[facet].get(value) || value;
      activeFilters.append(createChip(label, () => {
        if (facet === 'type') state.selectedType.delete(value);
        if (facet === 'audience') state.selectedAudience.delete(value);
        if (facet === 'issue') state.selectedIssue.delete(value);
        if (facet === 'tags') state.selectedTags.delete(value);
        if (facet === 'language') state.selectedLanguage.delete(value);
        if (facet === 'programs') state.selectedProgram.delete(value);
        if (facet === 'grade_ages') state.selectedGradeAge.delete(value);
        state.visibleCount = config.pageSize;
        state.page = 1;
        syncFilterControls();
        syncUrlState();
        applyFilters();
      }));
    });
    clearAllButton.hidden = !facets.length && !state.query.trim();
  };

  const applyFacet = (select, set) => {
    if (!select.value) return;
    set.add(normalizeToken(select.value));
    state.visibleCount = config.pageSize;
    state.page = 1;
    syncFilterControls();
    syncUrlState();
    applyFilters();
  };

  searchInput.value = state.query;
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    state.visibleCount = config.pageSize;
    state.page = 1;
    syncUrlState();
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
  tagSelect.addEventListener('change', () => {
    applyFacet(tagSelect, state.selectedTags);
  });
  languageSelect.addEventListener('change', () => {
    applyFacet(languageSelect, state.selectedLanguage);
  });
  programSelect.addEventListener('change', () => {
    applyFacet(programSelect, state.selectedProgram);
  });
  gradeAgeSelect.addEventListener('change', () => {
    applyFacet(gradeAgeSelect, state.selectedGradeAge);
  });
  sortSelect.addEventListener('change', () => {
    state.sort = normalizeListSort(sortSelect.value);
    state.hasExplicitSort = true;
    state.visibleCount = config.pageSize;
    state.page = 1;
    syncUrlState();
    applyFilters();
  });
  loadMoreButton.addEventListener('click', () => {
    state.visibleCount += config.pageSize;
    applyFilters();
  });
  clearAllButton.addEventListener('click', () => {
    state.query = '';
    state.selectedAudience.clear();
    state.selectedIssue.clear();
    state.selectedType.clear();
    state.selectedTags.clear();
    state.selectedLanguage.clear();
    state.selectedProgram.clear();
    state.selectedGradeAge.clear();
    state.visibleCount = config.pageSize;
    state.page = 1;
    searchInput.value = '';
    syncFilterControls();
    syncUrlState();
    applyFilters();
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

  applyResultView(cardsContainer, viewButtons, state.view);
  applyFilters();
  block.replaceChildren(inner);
}

function renderApiBrowser(block, config) {
  const layout = buildShell(config);
  const {
    inner,
    searchInput,
    audienceSelect,
    issueSelect,
    typeSelect,
    tagSelect,
    languageSelect,
    programSelect,
    gradeAgeSelect,
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

  const apiRoot = normalizeApiBaseUrl(config.apiBaseUrl);
  const selected = splitSelectedResources(parseList(config.selectedField));
  const state = {
    query: '',
    selectedAudience: new Set(),
    selectedIssue: new Set(),
    selectedType: new Set(),
    selectedTags: new Set(),
    selectedLanguage: new Set(),
    selectedProgram: new Set(),
    selectedGradeAge: new Set(),
    sort: '',
    hasExplicitSort: false,
    view: 'grid',
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
    selectedTags: parseList(config.tagPreset).map(normalizeToken),
    selectedLanguage: parseList(config.languagePreset).map(normalizeToken),
    selectedProgram: parseList(config.programPreset).map(normalizeToken),
    selectedGradeAge: parseList(config.gradeAgePreset).map(normalizeToken),
  };
  const locationState = readListFilterState();
  state.query = locationState.hasQuery ? locationState.query : defaultState.query;
  state.view = locationState.view || 'grid';
  state.hasExplicitSort = locationState.hasSort;
  state.sort = locationState.hasSort ? normalizeListSort(locationState.sort) : '';
  state.selectedAudience = new Set(
    locationState.audiences.present
      ? locationState.audiences.values
      : defaultState.selectedAudience,
  );
  state.selectedIssue = new Set(
    locationState.issues.present
      ? locationState.issues.values
      : defaultState.selectedIssue,
  );
  state.selectedType = new Set(
    locationState.types.present
      ? locationState.types.values
      : defaultState.selectedType,
  );
  state.selectedTags = new Set(
    locationState.tags.present ? locationState.tags.values : defaultState.selectedTags,
  );
  state.selectedLanguage = new Set(
    locationState.languages.present
      ? locationState.languages.values
      : defaultState.selectedLanguage,
  );
  state.selectedProgram = new Set(
    config.lockedPrograms?.length
      ? config.lockedPrograms
      : locationState.programs.present
        ? locationState.programs.values
        : defaultState.selectedProgram,
  );
  state.selectedGradeAge = new Set(
    locationState.gradeAges.present
      ? locationState.gradeAges.values
      : defaultState.selectedGradeAge,
  );

  const optionLabels = {
    audience: new Map(),
    issue: new Map(),
    type: new Map(),
    tags: new Map(),
    language: new Map(),
    programs: new Map(),
    grade_ages: new Map(),
  };
  const syncUrlState = (replace = true) => {
    writeListFilterState({
      query: state.query,
      audiences: [...state.selectedAudience],
      issues: [...state.selectedIssue],
      types: [...state.selectedType],
      tags: [...state.selectedTags],
      languages: [...state.selectedLanguage],
      programs: [...state.selectedProgram],
      gradeAges: [...state.selectedGradeAge],
      sort: state.hasExplicitSort ? state.sort : '',
      view: state.view,
    }, replace);
  };
  const syncFilterControls = () => {
    syncSelectValue(audienceSelect, state.selectedAudience);
    syncSelectValue(issueSelect, state.selectedIssue);
    syncSelectValue(typeSelect, state.selectedType);
    syncSelectValue(tagSelect, state.selectedTags);
    syncSelectValue(languageSelect, state.selectedLanguage);
    syncSelectValue(programSelect, state.selectedProgram);
    syncSelectValue(gradeAgeSelect, state.selectedGradeAge);
  };
  const syncSortControl = () => {
    sortSelect.value = state.sort || '';
  };

  let renderActiveFilters = () => {};
  let loadResources = async () => {};
  let activeController = null;
  let requestToken = 0;
  const applyFacetValue = (facet, rawValue) => {
    const value = normalizeToken(rawValue);
    if (!value) return;

    if (facet === 'type') state.selectedType.add(value);
    if (facet === 'audience') state.selectedAudience.add(value);
    if (facet === 'issue') state.selectedIssue.add(value);
    if (facet === 'tags') state.selectedTags.add(value);
    if (facet === 'language') state.selectedLanguage.add(value);
    if (facet === 'programs') state.selectedProgram.add(value);
    if (facet === 'grade_ages') state.selectedGradeAge.add(value);

    syncFilterControls();
    syncUrlState();
    loadResources(true);
  };

  renderActiveFilters = () => {
    activeFilters.replaceChildren();
    const visiblePrograms = config.lockedPrograms?.length
      ? []
      : [...state.selectedProgram].map((value) => ({ facet: 'programs', value }));
    const facets = [
      ...[...state.selectedType].map((value) => ({ facet: 'type', value })),
      ...[...state.selectedAudience].map((value) => ({ facet: 'audience', value })),
      ...[...state.selectedIssue].map((value) => ({ facet: 'issue', value })),
      ...[...state.selectedTags].map((value) => ({ facet: 'tags', value })),
      ...[...state.selectedLanguage].map((value) => ({ facet: 'language', value })),
      ...visiblePrograms,
      ...[...state.selectedGradeAge].map((value) => ({ facet: 'grade_ages', value })),
    ];

    facets.forEach(({ facet, value }) => {
      const label = optionLabels[facet].get(value) || value;
      activeFilters.append(createChip(label, () => {
        if (facet === 'type') state.selectedType.delete(value);
        if (facet === 'audience') state.selectedAudience.delete(value);
        if (facet === 'issue') state.selectedIssue.delete(value);
        if (facet === 'tags') state.selectedTags.delete(value);
        if (facet === 'language') state.selectedLanguage.delete(value);
        if (facet === 'programs') state.selectedProgram.delete(value);
        if (facet === 'grade_ages') state.selectedGradeAge.delete(value);
        syncFilterControls();
        syncUrlState();
        loadResources(true);
      }));
    });
    clearAllButton.hidden = !facets.length && !state.query.trim();
  };

  function updateFilters(filters = {}) {
    const audiences = filters.audiences || [];
    const issues = filters.issues || [];
    const types = filters.types || [];
    const languages = filters.languages || [];
    const programs = filters.programs || [];
    const gradeAges = filters.grade_ages || [];
    const tags = (filters.tags || []).map((option) => ({
      value: option.slug,
      label: option.name,
    }));

    setFilterOptions(audienceSelect, 'Audience', audiences);
    setFilterOptions(issueSelect, 'Issue', issues);
    setFilterOptions(typeSelect, 'Type', types);
    setFilterOptions(tagSelect, 'Tag', tags);
    setFilterOptions(languageSelect, 'Language', languages);
    setFilterOptions(programSelect, 'Program', programs);
    setFilterOptions(gradeAgeSelect, 'Grade / Age', gradeAges);
    optionLabels.audience = new Map(
      audiences.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.issue = new Map(
      issues.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.type = new Map(
      types.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.tags = new Map(
      tags.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.language = new Map(
      languages.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.programs = new Map(
      programs.map((option) => [normalizeToken(option.value), option.label]),
    );
    optionLabels.grade_ages = new Map(
      gradeAges.map((option) => [normalizeToken(option.value), option.label]),
    );
    syncFilterControls();
  }

  function updateSorting(sorting = {}, appliedSort = DEFAULT_LIST_SORT) {
    const options = sorting.options || getListSortOptions();
    setFilterOptions(sortSelect, 'Sort', options);
    const fallbackSort = normalizeListSort(sorting.default || DEFAULT_LIST_SORT);
    if (!state.hasExplicitSort) {
      state.sort = normalizeListSort(appliedSort || fallbackSort, fallbackSort);
    } else {
      state.sort = normalizeListSort(state.sort, fallbackSort);
    }
    syncSortControl();
  }

  const updatePagination = () => {
    if (!usePagination) {
      pagination.nav.hidden = true;
      return;
    }
    pagination.update({
      page: state.page,
      lastPage: state.lastPage,
      onPage: (page) => loadResources(true, page),
    });
  };

  loadResources = async (reset = false, targetPage = null) => {
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
    if (!cardsContainer.children.length) {
      count.textContent = 'Loading resources...';
    }
    loadMoreButton.disabled = true;
    pagination.nav.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });

    const url = new URL('/api/resources', `${apiRoot}/`);
    url.searchParams.set('per_page', String(config.pageSize));
    url.searchParams.set('page', String(targetPage || (reset ? 1 : state.page + 1)));
    url.searchParams.set('locale', currentSiteLocale());
    if (state.query.trim()) {
      url.searchParams.set('search', state.query.trim());
    }
    if (state.hasExplicitSort && state.sort) {
      url.searchParams.set('sort', state.sort);
    }
    state.selectedAudience.forEach((value) => url.searchParams.append('audiences[]', value));
    state.selectedIssue.forEach((value) => url.searchParams.append('issues[]', value));
    state.selectedType.forEach((value) => url.searchParams.append('types[]', value));
    state.selectedTags.forEach((value) => url.searchParams.append('tags[]', value));
    state.selectedLanguage.forEach((value) => url.searchParams.append('languages[]', value));
    state.selectedProgram.forEach((value) => url.searchParams.append('programs[]', value));
    state.selectedGradeAge.forEach((value) => url.searchParams.append('grade_ages[]', value));
    config.visibleFilters.forEach((facet) => {
      url.searchParams.append('filter_groups[]', filterGroupName(facet));
    });
    parseTagOptions(config.filterTags).forEach((value) => {
      url.searchParams.append('filter_tags[]', value);
    });
    parseTagOptions(config.hiddenFilterTags).forEach((value) => {
      url.searchParams.append('exclude_filter_tags[]', value);
    });
    selected.ids.forEach((value) => url.searchParams.append('ids[]', value));
    selected.slugs.forEach((value) => url.searchParams.append('slugs[]', value));

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`API request failed with HTTP ${response.status}.`);
      }

      const payload = await response.json();
      if (currentToken !== requestToken) return;

      if (usePagination) cardsContainer.replaceChildren();
      (payload.data || []).forEach((item) => {
        cardsContainer.append(buildResourceCard(mapApiResource(item), null, applyFacetValue));
      });

      state.page = payload.meta?.current_page || 1;
      state.lastPage = payload.meta?.last_page || 1;
      state.total = payload.meta?.total
        ?? cardsContainer.children.length;
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
      count.textContent = state.total
        ? `Showing ${shownStart}-${shownEnd} of ${state.total} resources`
        : 'Showing 0 resources';
      emptyState.hidden = cardsContainer.children.length > 0;
      loadMoreButton.hidden = usePagination || state.page >= state.lastPage || state.total === 0;
      updatePagination();
    } catch (error) {
      if (error.name === 'AbortError') return;
      count.textContent = error?.message || 'Resources unavailable.';
      emptyState.hidden = cardsContainer.children.length > 0;
    } finally {
      if (currentToken === requestToken) {
        activeController = null;
        loadMoreButton.disabled = false;
        state.loading = false;
      }
    }
  };

  const applyFacet = (select, set) => {
    if (!select.value) return;
    set.add(normalizeToken(select.value));
    syncFilterControls();
    syncUrlState();
    loadResources(true);
  };

  searchInput.value = state.query;
  searchInput.addEventListener('input', debounce(() => {
    state.query = searchInput.value;
    syncUrlState();
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
  tagSelect.addEventListener('change', () => {
    applyFacet(tagSelect, state.selectedTags);
  });
  languageSelect.addEventListener('change', () => {
    applyFacet(languageSelect, state.selectedLanguage);
  });
  programSelect.addEventListener('change', () => {
    applyFacet(programSelect, state.selectedProgram);
  });
  gradeAgeSelect.addEventListener('change', () => {
    applyFacet(gradeAgeSelect, state.selectedGradeAge);
  });
  sortSelect.addEventListener('change', () => {
    state.sort = normalizeListSort(sortSelect.value);
    state.hasExplicitSort = true;
    syncUrlState();
    loadResources(true);
  });
  loadMoreButton.addEventListener('click', () => loadResources(false));
  clearAllButton.addEventListener('click', () => {
    state.query = '';
    state.selectedAudience.clear();
    state.selectedIssue.clear();
    state.selectedType.clear();
    state.selectedTags.clear();
    state.selectedLanguage.clear();
    state.selectedProgram.clear();
    state.selectedGradeAge.clear();
    searchInput.value = '';
    syncFilterControls();
    syncUrlState();
    loadResources(true);
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
    loadResources(true);
  });
}

export default function decorate(block) {
  const configRows = extractConfigRows(block);
  const configRow = configRows[0] || extractConfigRow(block);
  const legacyMap = collectLegacyBlockFields(block);
  const filterValue = getBlockField(block, legacyMap, 'filters')
    || readConfigValue(configRows, 'filters', 3)
    || readConfigField(configRow, 'filters', 3);
  const filterConfig = parseFilterLists(filterValue);
  const apiBaseUrl = normalizeApiBaseUrl(
    getBlockField(block, legacyMap, 'apiBaseUrl')
      || readConfigValue(configRows, 'apiBaseUrl', 1)
      || readConfigField(configRow, 'apiBaseUrl', 1),
  );
  const config = {
    heading: getBlockField(block, legacyMap, 'heading')
      || readConfigValue(configRows, 'heading', 0)
      || readConfigField(configRow, 'heading', 0),
    apiBaseUrl,
    selectedField: getBlockField(block, legacyMap, 'selected')
      || readConfigValue(configRows, 'selected', 2)
      || readConfigField(configRow, 'selected', 2),
    pageSize: parseIntSafe(
      getBlockField(block, legacyMap, 'pageSize', '')
        || readConfigValue(configRows, 'pageSize', 7)
        || readConfigValue(configRows, 'pageSize', 4, '8')
        || readConfigField(configRow, 'pageSize', 4, '8'),
      8,
    ),
    searchPlaceholder: getBlockField(block, legacyMap, 'searchPlaceholder', '')
      || readConfigValue(configRows, 'searchPlaceholder', 8)
      || readConfigValue(configRows, 'searchPlaceholder', 5, 'Search')
      || readConfigField(configRow, 'searchPlaceholder', 5, 'Search')
      || 'Search',
    loadMoreText: getBlockField(block, legacyMap, 'loadMoreText', 'Load More'),
    paginationMode: normalizePaginationMode(
      getBlockField(block, legacyMap, 'paginationMode', '')
        || readConfigValue(configRows, 'paginationMode', 10)
        || readConfigValue(configRows, 'paginationMode', 7, 'load-more')
        || readConfigField(configRow, 'paginationMode', 7, 'load-more'),
    ),
    audiencePreset: getBlockField(block, legacyMap, 'audiencePreset')
      || filterConfig.audience.join(', '),
    issuePreset: getBlockField(block, legacyMap, 'issuePreset')
      || filterConfig.issue.join(', '),
    typePreset: getBlockField(block, legacyMap, 'typePreset')
      || filterConfig.type.join(', '),
    tagPreset: getBlockField(block, legacyMap, 'tagPreset')
      || filterConfig.tags.join(', '),
    languagePreset: getBlockField(block, legacyMap, 'languagePreset')
      || readConfigValue(configRows, 'languagePreset', 11)
      || filterConfig.language.join(', '),
    programPreset: getBlockField(block, legacyMap, 'programPreset')
      || readConfigValue(configRows, 'programPreset', 12)
      || filterConfig.programs.join(', '),
    gradeAgePreset: getBlockField(block, legacyMap, 'gradeAgePreset')
      || readConfigValue(configRows, 'gradeAgePreset', 13)
      || filterConfig.gradeAges.join(', '),
    visibleFilters: parseVisibleFilters(
      getBlockField(block, legacyMap, 'visibleFilters')
        || readConfigValue(configRows, 'visibleFilters', 4)
        || readConfigField(configRow, 'visibleFilters', 4),
    ),
    filterTags: getBlockField(block, legacyMap, 'filterTags')
      || readConfigValue(configRows, 'filterTags', 5)
      || readConfigField(configRow, 'filterTags', 5),
    hiddenFilterTags: getBlockField(block, legacyMap, 'hiddenFilterTags')
      || readConfigValue(configRows, 'hiddenFilterTags', 6)
      || readConfigField(configRow, 'hiddenFilterTags', 6),
    lockedPrograms: parseTagOptions(
      getBlockField(block, legacyMap, 'lockedPrograms') || '',
    ),
  };

  configRows.forEach((row) => row.remove());
  if (!configRows.length && configRow) {
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
      'Could not detect apiBaseUrl in the published block markup.',
      'The block is rendering inline fallback data only.',
      'Republish the page after setting apiBaseUrl, or verify the published block includes that value.',
    ]);
    return;
  }

  ensurePreconnect(config.apiBaseUrl);
  renderApiBrowser(block, config);
}
