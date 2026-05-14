import resolveSiteHref from '../../scripts/link-utils.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const FIELD_LABELS = {
  apiBaseUrl: ['api base url', 'api url', 'resource api base url', 'resource api url', 'article api base url', 'article api url'],
  sourceType: ['source type', 'content type', 'mode'],
  slug: ['slug', 'resource slug', 'article slug', 'preview slug', 'preview resource slug', 'preview article slug'],
  heading: ['heading', 'title'],
  limit: ['limit', 'item limit', 'count'],
  detailBasePath: ['detail base path', 'article detail base path', 'article base path', 'blog base path'],
};

const FIELD_COLUMN_INDEX = {
  apiBaseUrl: 0,
  sourceType: 1,
  slug: 2,
  heading: 3,
  limit: 4,
  detailBasePath: 5,
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeSlug(value) {
  const normalized = normalizeText(value)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');

  if (!normalized) return '';

  try {
    return decodeURIComponent(normalized);
  } catch (e) {
    return normalized;
  }
}

function normalizeSourceType(value) {
  const normalized = normalizeText(value).toLowerCase();
  return ['articles', 'resources', 'auto'].includes(normalized) ? normalized : 'auto';
}

function inferSourceType(pathname = window.location.pathname) {
  const cleanPath = normalizeText(pathname).toLowerCase();
  if (cleanPath.includes('/resources/blogs/')) return 'articles';
  if (cleanPath.includes('/resources/')) return 'resources';
  return 'articles';
}

function getSlugFromPathname(pathname = window.location.pathname) {
  const cleanPath = normalizeText(pathname)
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  const segments = cleanPath.split('/').filter(Boolean);
  return normalizeSlug(segments[segments.length - 1] || '');
}

function normalizeEdgeContentPath(value) {
  return resolveSiteHref(value);
}

function normalizeContentBasePath(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
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
  if (columnIndex !== undefined) {
    const value = rows
      .map((row) => {
        const cols = [...row.children];
        const cell = cols[columnIndex];
        if (!cell) return '';
        const anchor = cell.querySelector('a');
        if (anchor) return normalizeText(anchor.getAttribute('href') || anchor.textContent);
        if (name === 'apiBaseUrl') return findUrlLikeValue(cell.textContent) || normalizeText(cell.textContent);
        return normalizeText(cell.textContent);
      })
      .find(Boolean);

    if (value) return value;
  }

  return fallback;
}

function getLegacyValue(block, name) {
  const labels = FIELD_LABELS[name] || [];
  const rows = getRows(block);
  const row = rows.find((entry) => {
    if (entry.children.length !== 2) return false;
    const key = normalizeText(entry.children[0].textContent).toLowerCase();
    return labels.some((label) => key === label || key.includes(label));
  });

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

function parseLimit(value, fallback = 3) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function buildMessage(title, description) {
  const wrapper = document.createElement('div');
  wrapper.className = 'related-articles-message';

  const heading = document.createElement('h3');
  heading.className = 'related-articles-message-title';
  heading.textContent = title;
  wrapper.append(heading);

  if (description) {
    const text = document.createElement('p');
    text.className = 'related-articles-message-copy';
    text.textContent = description;
    wrapper.append(text);
  }

  return wrapper;
}

function buildPill(label, className = '') {
  const pill = document.createElement('span');
  pill.className = `related-articles-pill ${className}`.trim();
  pill.textContent = label;
  return pill;
}

function buildTaxonomy(item) {
  const values = [
    item.resource_type_label,
    item.audience_label,
    item.issue_label,
  ].filter(Boolean);
  if (!values.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'related-articles-taxonomy';
  values.slice(0, 2).forEach((value) => wrap.append(buildPill(value, 'is-taxonomy')));
  return wrap;
}

function buildItemHref(item, config) {
  const detailBasePath = normalizeContentBasePath(config.detailBasePath);
  if (detailBasePath && normalizeText(item.slug)) {
    return normalizeEdgeContentPath(`${detailBasePath}/${item.slug}`);
  }

  return normalizeEdgeContentPath(item.primary_url || item.detail_path || item.page_path);
}

function buildCard(item, config) {
  const card = document.createElement('article');
  card.className = 'related-articles-card';

  const href = buildItemHref(item, config);
  if (href) {
    const link = document.createElement('a');
    link.className = 'related-articles-card-link-cover';
    link.href = href;
    link.setAttribute('aria-label', item.title || 'Related article');
    card.append(link);
  }

  if (item.thumbnail) {
    const media = document.createElement('div');
    media.className = 'related-articles-card-media';
    const image = document.createElement('img');
    image.src = item.thumbnail;
    image.alt = item.title || 'Related article image';
    image.loading = 'lazy';
    media.append(image);
    card.append(media);
  }

  const body = document.createElement('div');
  body.className = 'related-articles-card-body';

  const taxonomy = buildTaxonomy(item);
  if (taxonomy) body.append(taxonomy);

  if (item.article_date_label) {
    const date = document.createElement('p');
    date.className = 'related-articles-card-date';
    date.textContent = item.article_date_label;
    body.append(date);
  }

  const title = document.createElement('h3');
  title.className = 'related-articles-card-title';
  title.textContent = item.title || 'Related article';
  body.append(title);

  if (item.excerpt) {
    const excerpt = document.createElement('p');
    excerpt.className = 'related-articles-card-excerpt';
    excerpt.textContent = item.excerpt;
    body.append(excerpt);
  }

  if (href) {
    const link = document.createElement('a');
    link.className = 'related-articles-card-link';
    link.href = href;
    link.textContent = 'Learn More';
    body.append(link);
  }

  card.append(body);
  return card;
}

function buildView(items, config) {
  const fragment = document.createDocumentFragment();

  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'related-articles-heading';
    heading.textContent = config.heading;
    fragment.append(heading);
  }

  const grid = document.createElement('div');
  grid.className = 'related-articles-grid';
  items.forEach((item) => grid.append(buildCard(item, config)));
  fragment.append(grid);
  return fragment;
}

async function fetchItem(apiBaseUrl, sourceType, slug) {
  const endpoint = new URL(`/api/${sourceType}/${encodeURIComponent(slug)}`, `${apiBaseUrl}/`);
  const response = await fetch(endpoint.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return payload.data || null;
}

export default async function decorate(block) {
  const configuredSourceType = normalizeSourceType(getFieldValue(block, 'sourceType', 'auto'));
  const sourceType = configuredSourceType === 'auto' ? inferSourceType() : configuredSourceType;

  const config = {
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl')),
    sourceType,
    slug: normalizeSlug(getFieldValue(block, 'slug')) || getSlugFromPathname(),
    heading: getFieldValue(block, 'heading', 'Related Articles') || 'Related Articles',
    limit: parseLimit(getFieldValue(block, 'limit', '3'), 3),
    detailBasePath: getFieldValue(block, 'detailBasePath'),
  };

  block.replaceChildren(buildMessage('Loading related articles...', ''));

  if (!config.apiBaseUrl) {
    block.replaceChildren(buildMessage('Missing API configuration', 'Set apiBaseUrl on this block so it can load related content.'));
    return;
  }

  if (!config.slug) {
    block.replaceChildren(buildMessage('Missing preview slug', 'Set a preview slug on the block or open the page using an article or resource detail URL.'));
    return;
  }

  try {
    const item = await fetchItem(config.apiBaseUrl, config.sourceType, config.slug);
    const related = (item?.related_articles || []).slice(0, config.limit);

    if (!related.length) {
      block.replaceChildren();
      return;
    }

    block.replaceChildren(buildView(related, config));
  } catch (error) {
    block.replaceChildren(buildMessage('Related articles unavailable', error?.message || 'The related article API request failed.'));
  }
}
