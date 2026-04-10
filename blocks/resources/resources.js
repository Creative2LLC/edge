import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

const BLOCK_PROPS = [
  'heading',
  'subheading',
  'backgroundColor',
  'button',
  'buttonLink',
  'apiBaseUrl',
  'selected',
  'limit',
  'audiencePreset',
  'issuePreset',
  'typePreset',
  'tagPreset',
];

function extractConfigRow(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  let configRow = rows.find((row) => BLOCK_PROPS.some((prop) => row.querySelector(`[data-aue-prop="${prop}"]`)));

  if (!configRow && rows.length > 0) {
    configRow = rows.find((row) => !row.querySelector('[data-aue-prop="title"]')
      && !row.querySelector('[data-aue-prop="image"]')
      && !row.querySelector('picture'));
    if (!configRow) [configRow] = rows;
  }

  return configRow;
}

function readConfigField(configRow, name, colIndex) {
  if (!configRow) return '';
  const source = configRow.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source.textContent.trim();
  const cols = [...configRow.children];
  return cols[colIndex]?.textContent.trim() || '';
}

function readConfigLinkField(configRow, name, colIndex) {
  if (!configRow) return '';
  const source = configRow.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return anchor?.href || source.textContent.trim();
  }
  const cols = [...configRow.children];
  const anchor = cols[colIndex]?.querySelector('a');
  return anchor?.href || cols[colIndex]?.textContent.trim() || '';
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

  function getImageData(col) {
    if (!col) return { picture: null, src: '', alt: '' };
    const picture = col.querySelector('picture');
    const img = col.querySelector('img');
    return { picture, src: img?.src || '', alt: img?.alt || '' };
  }

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
    const byProp = row.querySelector(`[data-aue-prop="${propName}"]`);
    if (byProp) return byProp.textContent.trim();
    return cols[colIndex]?.textContent.trim() || '';
  }

  if (cols.length >= 6) {
    const imageData = getImageData(cols[0]);
    const iconData = getImageData(cols[1]);
    const linkTextProp = row.querySelector('[data-aue-prop="linkText"]');
    const linkProp = row.querySelector('[data-aue-prop="link"]');

    let linkUrl;
    let linkText;

    if (linkProp) {
      const anchor = linkProp.querySelector('a');
      linkUrl = anchor?.href || linkProp.textContent.trim();
      linkText = linkTextProp?.textContent.trim() || '';
    } else {
      const linkData = getLinkData(cols[5], cols[6]);
      linkUrl = linkData.url;
      linkText = linkData.text;
    }

    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: iconData.picture,
      iconSrc: iconData.src,
      iconColor: getFieldText(2, 'iconColor'),
      title: getFieldText(3, 'title'),
      subtitle: getFieldText(4, 'subtitle'),
      linkUrl,
      linkText,
      tags: parseList(getFieldText(7, 'tags')),
    };
  }

  return null;
}

function mapApiResource(resource) {
  return {
    imagePicture: null,
    imgSrc: resource.thumbnail || '',
    imageAlt: resource.title || '',
    iconPicture: null,
    iconSrc: '',
    iconColor: '',
    title: resource.title || '',
    subtitle: resource.excerpt || '',
    linkUrl: resource.resource_url || '',
    linkText: 'Learn More',
    tags: (resource.tags || []).map((tag) => tag.name).slice(0, 4),
  };
}

function buildTag(tag) {
  const pill = document.createElement('span');
  pill.className = 'resources-card-tag';
  pill.textContent = tag;
  return pill;
}

function buildResourceCard(resource, row) {
  const card = document.createElement('div');
  card.className = 'resources-card';
  if (row) moveInstrumentation(row, card);

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
    titleEl.textContent = resource.title;
    content.append(titleEl);
  }

  if (resource.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'resources-card-subheading';
    sub.textContent = resource.subtitle;
    content.append(sub);
  }

  if (resource.linkUrl) {
    const link = document.createElement('a');
    link.className = 'resources-card-link';
    link.href = resource.linkUrl;
    link.textContent = resource.linkText || 'Learn More';
    content.append(link);
  }

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
  const requestSize = Math.max(limit, selected.ids.length + selected.slugs.length || limit);
  const url = new URL('/api/resources', `${apiRoot}/`);
  url.searchParams.set('per_page', String(requestSize));
  parseList(config.audiencePreset).forEach((value) => url.searchParams.append('audiences[]', value.toLowerCase()));
  parseList(config.issuePreset).forEach((value) => url.searchParams.append('issues[]', value.toLowerCase()));
  parseList(config.typePreset).forEach((value) => url.searchParams.append('types[]', value.toLowerCase()));
  parseList(config.tagPreset).forEach((value) => url.searchParams.append('tags[]', value.toLowerCase()));
  selected.ids.forEach((value) => url.searchParams.append('ids[]', value));
  selected.slugs.forEach((value) => url.searchParams.append('slugs[]', value));

  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  return (payload.data || []).slice(0, limit).map((item) => ({ data: mapApiResource(item), row: null }));
}

export default async function decorate(block) {
  const configRow = extractConfigRow(block);
  const config = {
    heading: readConfigField(configRow, 'heading', 0),
    subheading: readConfigField(configRow, 'subheading', 1),
    backgroundColor: readConfigField(configRow, 'backgroundColor', 2),
    buttonText: readConfigField(configRow, 'button', 3),
    buttonLink: readConfigLinkField(configRow, 'buttonLink', 4),
    apiBaseUrl: readConfigField(configRow, 'apiBaseUrl', 5),
    selected: readConfigField(configRow, 'selected', 6),
    limit: readConfigField(configRow, 'limit', 7) || '6',
    audiencePreset: readConfigField(configRow, 'audiencePreset', 8),
    issuePreset: readConfigField(configRow, 'issuePreset', 9),
    typePreset: readConfigField(configRow, 'typePreset', 10),
    tagPreset: readConfigField(configRow, 'tagPreset', 11),
  };

  if (configRow) configRow.remove();
  if (config.backgroundColor) block.style.backgroundColor = config.backgroundColor;

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

  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'resources-heading';
    heading.textContent = config.heading;
    headerLeft.append(heading);
  }

  if (config.subheading) {
    const subheading = document.createElement('p');
    subheading.className = 'resources-subheading';
    subheading.textContent = config.subheading;
    headerLeft.append(subheading);
  }

  header.append(headerLeft);

  if (config.buttonText) {
    const button = document.createElement(config.buttonLink ? 'a' : 'button');
    button.className = 'resources-button';
    button.textContent = config.buttonText;
    if (config.buttonLink) button.href = config.buttonLink;
    else button.type = 'button';
    header.append(button);
  }

  inner.append(header);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'resources-cards';
  resources.forEach(({ data, row }) => cardsContainer.append(buildResourceCard(data, row)));
  inner.append(cardsContainer);

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

  prevBtn.addEventListener('click', () => cardsContainer.scrollBy({ left: -370, behavior: 'smooth' }));
  nextBtn.addEventListener('click', () => cardsContainer.scrollBy({ left: 370, behavior: 'smooth' }));
  cardsContainer.addEventListener('scroll', () => updateScrollbar(scrollThumb, cardsContainer));
  requestAnimationFrame(() => updateScrollbar(scrollThumb, cardsContainer));

  block.replaceChildren(inner);
}
