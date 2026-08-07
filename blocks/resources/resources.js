import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import {
  getFieldSelector,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import attachDragScroll, { getCarouselItemIndex, scrollToCarouselItem } from '../../scripts/carousel-utils.js';
import focusScrollableRegion from '../../scripts/a11y-utils.js';
import { bindGatedLink } from '../../scripts/resource-gate.js';

const BLOCK_PROPS = [
  'heading',
  'subheading',
  'headerMaxWidth',
  'button',
  'buttonLink',
  'settings',
  'backgroundColor',
  'apiBaseUrl',
  'selected',
  'limit',
  'audiencePreset',
  'issuePreset',
  'typePreset',
  'tagPreset',
  'languagePreset',
  'programPreset',
  'gradeAgePreset',
];

const RESOURCE_ACTION_LABELS = {
  en: {
    learnMore: 'Learn More',
    downloadPdf: 'Download PDF',
    viewResource: 'View Resource',
  },
  es: {
    learnMore: 'Mas informacion',
    downloadPdf: 'Descargar PDF',
    viewResource: 'Ver recurso',
  },
};

const DEFAULT_HEADER_BUTTON_TEXT = 'Find other resources';
const CONFIG_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  headerMaxWidth: 2,
  button: 3,
  buttonLink: 4,
  settings: 5,
  apiBaseUrl: 6,
  selected: 7,
  limit: 8,
};
const CONFIG_FIELD_LABELS = {
  heading: ['heading'],
  subheading: ['subheading'],
  headerMaxWidth: ['header max width', 'header max width px'],
  button: ['button', 'button text'],
  buttonLink: ['button link'],
  settings: ['settings'],
  apiBaseUrl: ['api base url'],
  selected: ['selected', 'selected resource slugs or ids'],
  limit: ['limit', 'resource limit'],
};

function resourceActionLabels() {
  return RESOURCE_ACTION_LABELS[currentSiteLocale()] || RESOURCE_ACTION_LABELS.en;
}

function normalizeConfigLabel(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isLabeledConfigRow(row) {
  if (!row || row.children.length < 2) return false;
  const label = normalizeConfigLabel(row.children[0].textContent);
  return Object.values(CONFIG_FIELD_LABELS).some((labels) => labels.includes(label));
}

function isResourceItemRow(row) {
  if (!row) return false;
  if (row.querySelector('picture')) return true;
  if (row.querySelector(getFieldSelector('title'))) return true;
  if (row.querySelector(getFieldSelector('image'))) return true;
  return row.children.length >= 6 && !isLabeledConfigRow(row);
}

function extractConfigRows(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const configRows = rows.filter((row) => BLOCK_PROPS.some(
    (prop) => row.querySelector(getFieldSelector(prop)),
  ));

  if (configRows.length) return configRows;
  if (!rows.length) return [];

  if (rows[0].children.length > 1 && !isLabeledConfigRow(rows[0])) {
    const compactRows = [rows[0]];
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (isResourceItemRow(row)) break;
      if (row.textContent.trim()) compactRows.push(row);
      if (compactRows.length >= Object.keys(CONFIG_ROW_INDEX).length) break;
    }
    return compactRows;
  }

  const publishedRows = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (publishedRows.length && isResourceItemRow(row)) break;
    publishedRows.push(row);
    if (publishedRows.length >= Object.keys(CONFIG_ROW_INDEX).length) break;
  }

  return publishedRows.length ? publishedRows : [rows[0]];
}

function findPropElement(configRows, name) {
  return configRows
    .map((row) => row.querySelector(getFieldSelector(name)))
    .find(Boolean) || null;
}

function configRowCell(row) {
  if (!row) return null;
  return row.children.length === 2 ? row.children[1] : row.children[0] || row;
}

function findLabeledConfigCell(configRows, name) {
  const labels = CONFIG_FIELD_LABELS[name] || [];
  if (!labels.length) return null;

  const row = configRows.find((candidate) => {
    if (candidate.children.length < 2) return false;
    return labels.includes(normalizeConfigLabel(candidate.children[0].textContent));
  });

  return configRowCell(row);
}

function readSeparateConfigCell(configRows, name) {
  if (!configRows || configRows.length <= 1) return null;
  const labeledCell = findLabeledConfigCell(configRows, name);
  if (labeledCell) return labeledCell;

  const index = CONFIG_ROW_INDEX[name];
  return Number.isInteger(index) ? configRowCell(configRows[index]) : null;
}

function textFromCell(cell) {
  return cell?.textContent?.trim() || '';
}

function hrefFromCell(cell) {
  const anchor = cell?.tagName === 'A' ? cell : cell?.querySelector?.('a[href]');
  return anchor?.href || anchor?.getAttribute('href') || textFromCell(cell);
}

function readConfigField(configRows, name, columnIndexes = []) {
  if (!configRows || configRows.length === 0) return '';
  const source = findPropElement(configRows, name);
  if (source) return source.textContent.trim();

  const separateCell = readSeparateConfigCell(configRows, name);
  const separateValue = textFromCell(separateCell);
  if (separateValue) return separateValue;

  const cols = [...(configRows[0]?.children || [])];
  const value = columnIndexes
    .map((index) => cols[index]?.textContent.trim())
    .find(Boolean);

  return value || '';
}

function readConfigLinkField(configRows, name, columnIndexes = []) {
  if (!configRows || configRows.length === 0) return '';
  const source = findPropElement(configRows, name);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return anchor?.href || source.textContent.trim();
  }

  const separateValue = hrefFromCell(readSeparateConfigCell(configRows, name));
  if (separateValue) return separateValue;

  const cols = [...(configRows[0]?.children || [])];
  const value = columnIndexes
    .map((index) => hrefFromCell(cols[index]))
    .find(Boolean);

  return value || '';
}

function parseList(value) {
  const values = `${value || ''}`
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set();
  return values.filter((entry) => {
    const key = entry.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseKeyValueLines(value) {
  return `${value || ''}`
    .split(/[\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((map, entry) => {
      const [rawKey, ...rawValue] = entry.split(':');
      if (!rawValue.length) return map;
      map[rawKey.trim().toLowerCase()] = rawValue.join(':').trim();
      return map;
    }, {});
}

function getSettingValue(settings, keys) {
  return keys
    .map((key) => settings[key])
    .find(Boolean) || '';
}

function parseIntSafe(value, fallback = 6) {
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

function parseResourceRow(row) {
  const cols = [...row.children];

  function getLinkData(col, nextCol) {
    if (!col) return { url: '', text: '' };
    const anchor = col.querySelector('a');
    if (anchor && anchor.href) {
      const anchorText = anchor.textContent.trim();
      const isUrlText = anchorText === anchor.href
        || anchorText === anchor.getAttribute('href')
        || anchorText.replace(/\/$/, '') === anchor.href.replace(/\/$/, '');
      return {
        url: anchor.href,
        text: isUrlText ? (nextCol?.textContent.trim() || '') : anchorText,
      };
    }

    return {
      url: col.textContent.trim(),
      text: nextCol?.textContent.trim() || '',
    };
  }

  function getFieldText(colIndex, propName) {
    return readTextField(row, propName, { fallbackCell: cols[colIndex] }).value;
  }

  function getRichField(colIndex, propName) {
    return readRichTextField(row, propName, { fallbackCell: cols[colIndex] });
  }

  if (cols.length >= 6) {
    const imageField = readImageField(row, 'image', { fallbackCell: cols[0] });
    const iconField = readImageField(row, 'icon', { fallbackCell: cols[1] });
    const altVal = readTextField(row, 'imageAlt', { fallbackCell: cols[8] }).value;
    const imageData = {
      picture: imageField.picture,
      src: imageField.img?.src || '',
      alt: altVal || imageField.img?.alt || '',
    };
    const iconData = {
      picture: iconField.picture,
      src: iconField.img?.src || '',
      alt: iconField.img?.alt || '',
    };
    const linkField = readLinkField(row, 'link', { fallbackCell: cols[5] });
    const titleField = getRichField(3, 'title');
    const subtitleField = getRichField(4, 'subtitle');

    let linkUrl;
    let linkText = getFieldText(6, 'linkText');

    if (linkField.source) {
      linkUrl = linkField.value;
    } else {
      const linkData = getLinkData(cols[5], cols[6]);
      linkUrl = linkData.url;
      if (!linkText) linkText = linkData.text;
    }

    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: iconData.picture,
      iconSrc: iconData.src,
      iconColor: getFieldText(2, 'iconColor'),
      title: titleField.text,
      titleHtml: titleField.html,
      titleSource: titleField.source,
      subtitle: subtitleField.text,
      subtitleHtml: subtitleField.html,
      subtitleSource: subtitleField.source,
      linkUrl,
      linkText,
      tags: parseList(getFieldText(7, 'tags')),
    };
  }

  return null;
}

function mapApiResource(resource) {
  const labels = resourceActionLabels();

  return {
    imagePicture: null,
    imgSrc: resource.thumbnail || '',
    imageAlt: resource.title || '',
    iconPicture: null,
    iconSrc: '',
    iconColor: '',
    title: resource.title || '',
    subtitle: resource.excerpt || '',
    linkUrl: resource.primary_url || resource.detail_path || resource.download_url || resource.resource_url || '',
    detailUrl: resource.detail_path || '',
    downloadUrl: resource.download_url || resource.resource_url || '',
    linkText: resource.primary_action === 'download' ? labels.downloadPdf : labels.viewResource,
    linkAction: resource.primary_action || '',
    hasDetailPage: Boolean(resource.has_detail_page),
    hasDownload: Boolean(resource.has_download),
    gated: Boolean(resource.gated),
    slug: resource.slug || '',
    tags: [
      ...(resource.program_labels || []),
      ...(resource.grade_age_labels || []),
      ...((resource.tags || []).map((tag) => tag.name)),
    ].filter(Boolean).slice(0, 4),
  };
}

function buildTag(tag) {
  const pill = document.createElement('span');
  pill.className = 'resources-card-tag';
  pill.textContent = tag;
  return pill;
}

function applyRichText(element, source, html, text) {
  if (source) {
    moveInstrumentation(source, element);
    const hasElementChildren = [...source.childNodes]
      .some((node) => node.nodeType === Node.ELEMENT_NODE);
    if (hasElementChildren) {
      while (source.firstChild) element.append(source.firstChild);
      return;
    }
  }
  if (html && /<[^>]+>/u.test(html)) {
    element.innerHTML = html;
    return;
  }
  element.textContent = text;
}

function buildResourceCard(resource, row) {
  const labels = resourceActionLabels();
  const card = document.createElement('div');
  card.className = 'resources-card';
  if (row) {
    moveInstrumentation(row, card);
    setItemLabel(card, [resource.title, resource.subtitle]);
  }

  const hasIcon = resource.iconPicture || resource.iconSrc;
  const hasImage = resource.imagePicture || resource.imgSrc;
  if (hasImage && !hasIcon) card.classList.add('resources-card-no-icon');
  if (!hasImage && !hasIcon) card.classList.add('resources-card-no-media');

  if (resource.imagePicture) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'resources-card-image';
    imageWrap.append(resource.imagePicture);
    const img = resource.imagePicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '400' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      resource.imagePicture.replaceWith(optimized);
    }
    card.append(imageWrap);
  } else if (resource.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'resources-card-image';
    imageWrap.append(createOptimizedPicture(resource.imgSrc, resource.imageAlt, false, [{ width: '400' }]));
    card.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'resources-card-content';

  if (resource.iconPicture || resource.iconSrc) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'resources-card-icon';
    if (resource.iconColor) {
      const iconImg = resource.iconPicture?.querySelector('img');
      const src = iconImg?.src || resource.iconSrc;
      if (src) {
        iconWrap.style.maskImage = `url(${src})`;
        iconWrap.style.webkitMaskImage = `url(${src})`;
        iconWrap.style.backgroundColor = resource.iconColor;
      }
    } else if (resource.iconPicture) {
      iconWrap.append(resource.iconPicture);
    } else {
      const iconImg = document.createElement('img');
      iconImg.src = resource.iconSrc;
      iconImg.alt = '';
      iconImg.loading = 'lazy';
      iconWrap.append(iconImg);
    }
    content.append(iconWrap);
  }

  if (resource.tags?.length) {
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'resources-card-tags';
    resource.tags.forEach((tag) => tagsWrap.append(buildTag(tag)));
    content.append(tagsWrap);
  }

  if (resource.title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'resources-card-title';
    applyRichText(titleEl, resource.titleSource, resource.titleHtml, resource.title);
    content.append(titleEl);
  }

  if (resource.subtitle) {
    const sub = document.createElement('div');
    sub.className = 'resources-card-subheading';
    applyRichText(sub, resource.subtitleSource, resource.subtitleHtml, resource.subtitle);
    content.append(sub);
  }

  // Each card gets ONE button: the landing/detail page when it exists,
  // otherwise a (possibly gated) direct download.
  const actions = [];
  if (resource.hasDetailPage && resource.detailUrl) {
    actions.push({
      href: resource.detailUrl,
      label: resource.linkText || labels.viewResource,
      isDownload: false,
    });
  } else if (resource.hasDownload && resource.downloadUrl) {
    actions.push({ href: resource.downloadUrl, label: labels.downloadPdf, isDownload: true });
  }

  if (!actions.length && resource.linkUrl) {
    actions.push({
      href: resource.linkUrl,
      label: resource.linkText || labels.learnMore,
      isDownload: resource.linkAction === 'download',
    });
  }

  actions.forEach((action) => {
    const link = document.createElement('a');
    link.className = 'resources-card-link';
    link.href = resolveSiteHref(action.href);
    if (action.isDownload) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.textContent = action.label;
    if (action.isDownload) {
      bindGatedLink(link, {
        gated: resource.gated,
        resourceSlug: resource.slug,
        fileUrl: action.href,
        downloadLabel: action.label,
      });
    }
    content.append(link);
  });

  card.append(content);
  return card;
}

function updateScrollbar(thumb, container) {
  const { scrollLeft, scrollWidth, clientWidth } = container;
  const maxScroll = scrollWidth - clientWidth;
  if (maxScroll <= 0) {
    thumb.style.width = '100%';
    thumb.style.left = '0';
    return;
  }
  const trackWidth = 200;
  const thumbWidth = Math.max((clientWidth / scrollWidth) * trackWidth, 40);
  const thumbLeft = (scrollLeft / maxScroll) * (trackWidth - thumbWidth);
  thumb.style.width = `${thumbWidth}px`;
  thumb.style.left = `${thumbLeft}px`;
}

async function loadApiResources(config) {
  const apiRoot = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!apiRoot) return [];

  const selected = splitSelectedResources(parseList(config.selected));
  const limit = parseIntSafe(config.limit, 6);
  const selectionCount = selected.ids.length + selected.slugs.length;
  const requestSize = Math.max(limit, selectionCount || limit);
  const url = new URL('/api/resources', `${apiRoot}/`);
  url.searchParams.set('per_page', String(requestSize));
  url.searchParams.set('locale', currentSiteLocale());

  parseList(config.audiencePreset).forEach((value) => {
    url.searchParams.append('audiences[]', value.toLowerCase());
  });
  parseList(config.issuePreset).forEach((value) => {
    url.searchParams.append('issues[]', value.toLowerCase());
  });
  parseList(config.typePreset).forEach((value) => {
    url.searchParams.append('types[]', value.toLowerCase());
  });
  parseList(config.tagPreset).forEach((value) => {
    url.searchParams.append('tags[]', value.toLowerCase());
  });
  parseList(config.languagePreset).forEach((value) => {
    url.searchParams.append('languages[]', value.toLowerCase());
  });
  parseList(config.programPreset).forEach((value) => {
    url.searchParams.append('programs[]', value.toLowerCase());
  });
  parseList(config.gradeAgePreset).forEach((value) => {
    url.searchParams.append('grade_ages[]', value.toLowerCase());
  });
  selected.ids.forEach((value) => url.searchParams.append('ids[]', value));
  selected.slugs.forEach((value) => url.searchParams.append('slugs[]', value));

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return (payload.data || [])
    .slice(0, limit)
    .map((item) => ({ data: mapApiResource(item), row: null }));
}

export default async function decorate(block) {
  const configRows = extractConfigRows(block);
  const settings = parseKeyValueLines(readConfigField(configRows, 'settings', [5, 4]));
  const config = {
    heading: readConfigField(configRows, 'heading', [0]),
    subheading: readConfigField(configRows, 'subheading', [1]),
    headerMaxWidth: readConfigField(configRows, 'headerMaxWidth'),
    backgroundColor: readConfigField(configRows, 'backgroundColor', [2])
      || getSettingValue(settings, ['backgroundcolor', 'background-color']),
    buttonText: readConfigField(configRows, 'button', [3, 2]),
    buttonLink: readConfigLinkField(configRows, 'buttonLink', [4, 3])
      || getSettingValue(settings, ['buttonlink', 'button-link']),
    apiBaseUrl: readConfigField(configRows, 'apiBaseUrl', [6, 5])
      || getSettingValue(settings, ['apibaseurl', 'api-base-url']),
    selected: readConfigField(configRows, 'selected', [7, 6])
      || getSettingValue(settings, ['selected']),
    limit: readConfigField(configRows, 'limit', [8, 7])
      || getSettingValue(settings, ['limit'])
      || '6',
    audiencePreset: readConfigField(configRows, 'audiencePreset', [9, 8])
      || getSettingValue(settings, ['audiencepreset', 'audiences', 'audience']),
    issuePreset: readConfigField(configRows, 'issuePreset', [10, 9])
      || getSettingValue(settings, ['issuepreset', 'issues', 'issue']),
    typePreset: readConfigField(configRows, 'typePreset', [11, 10])
      || getSettingValue(settings, ['typepreset', 'types', 'type']),
    tagPreset: readConfigField(configRows, 'tagPreset', [12, 11])
      || getSettingValue(settings, ['tagpreset', 'tags', 'tag']),
    languagePreset: readConfigField(configRows, 'languagePreset', [13, 12])
      || getSettingValue(settings, ['languagepreset', 'languages', 'language']),
    programPreset: readConfigField(configRows, 'programPreset', [14, 13])
      || getSettingValue(settings, ['programpreset', 'programs', 'program']),
    gradeAgePreset: readConfigField(configRows, 'gradeAgePreset', [15, 14])
      || getSettingValue(settings, ['gradeagepreset', 'gradeages', 'grade_ages', 'grades']),
  };

  configRows.forEach((row) => row.remove());
  if (config.backgroundColor) {
    block.style.backgroundColor = config.backgroundColor;
  }

  let resources = [...block.querySelectorAll(':scope > div')]
    .map((row) => {
      const resource = parseResourceRow(row);
      return resource ? { data: resource, row } : null;
    })
    .filter(Boolean);

  if (config.apiBaseUrl) {
    try {
      resources = await loadApiResources(config);
    } catch (error) {
      // Fall back to inline-authored cards when the API is unavailable.
    }
  }

  const inner = document.createElement('div');
  inner.className = 'resources-inner';

  const header = document.createElement('div');
  header.className = 'resources-header';
  const headerLeft = document.createElement('div');
  headerLeft.className = 'resources-header-left';

  const headerMaxWidthPx = parseInt(config.headerMaxWidth, 10);
  const headerMaxWidth = Number.isFinite(headerMaxWidthPx) && headerMaxWidthPx > 0
    ? `${headerMaxWidthPx}px`
    : '';

  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'resources-heading';
    heading.textContent = config.heading;
    if (headerMaxWidth) heading.style.maxWidth = headerMaxWidth;
    headerLeft.append(heading);
  }

  if (config.subheading) {
    const subheading = document.createElement('p');
    subheading.className = 'resources-subheading';
    subheading.textContent = config.subheading;
    if (headerMaxWidth) subheading.style.maxWidth = headerMaxWidth;
    headerLeft.append(subheading);
  }

  header.append(headerLeft);

  const buttonText = config.buttonText || (resources.length ? DEFAULT_HEADER_BUTTON_TEXT : '');

  if (buttonText) {
    const button = document.createElement(config.buttonLink ? 'a' : 'button');
    button.className = 'resources-button';
    button.textContent = buttonText;
    if (config.buttonLink) button.href = config.buttonLink;
    else button.type = 'button';
    header.append(button);
  }

  inner.append(header);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'resources-cards';
  resources.forEach(({ data, row }) => {
    cardsContainer.append(buildResourceCard(data, row));
  });
  inner.append(cardsContainer);
  focusScrollableRegion(cardsContainer, 'Resource cards');

  const emptyState = document.createElement('p');
  emptyState.className = 'resources-empty';
  emptyState.textContent = 'No resources available.';
  emptyState.hidden = resources.length > 0;
  inner.append(emptyState);

  const footer = document.createElement('div');
  footer.className = 'resources-footer';
  footer.hidden = resources.length === 0;

  const scrollbar = document.createElement('div');
  scrollbar.className = 'resources-scrollbar';
  const scrollThumb = document.createElement('div');
  scrollThumb.className = 'resources-scrollbar-thumb';
  scrollbar.append(scrollThumb);
  footer.append(scrollbar);

  const nav = document.createElement('div');
  nav.className = 'resources-nav';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'resources-nav-btn resources-nav-prev';
  prevBtn.setAttribute('aria-label', 'Previous');
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'resources-nav-btn resources-nav-next';
  nextBtn.setAttribute('aria-label', 'Next');
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  nav.append(prevBtn, nextBtn);
  footer.append(nav);
  inner.append(footer);

  attachDragScroll(cardsContainer);

  const goToResourceCard = (index) => {
    const cards = [...cardsContainer.children];
    if (!cards.length) return;
    const targetIndex = ((index % cards.length) + cards.length) % cards.length;
    scrollToCarouselItem(cardsContainer, cards[targetIndex]);
  };

  prevBtn.addEventListener('click', () => {
    const cards = [...cardsContainer.children];
    goToResourceCard(getCarouselItemIndex(cardsContainer, cards) - 1);
  });
  nextBtn.addEventListener('click', () => {
    const cards = [...cardsContainer.children];
    goToResourceCard(getCarouselItemIndex(cardsContainer, cards) + 1);
  });
  cardsContainer.addEventListener('scroll', () => {
    updateScrollbar(scrollThumb, cardsContainer);
  });
  requestAnimationFrame(() => updateScrollbar(scrollThumb, cardsContainer));

  block.replaceChildren(inner);
}
