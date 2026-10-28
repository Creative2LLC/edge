import resolveSiteHref from '../../scripts/link-utils.js';
import { applyButtonStyle } from '../../scripts/button-utils.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { bindGatedLink } from '../../scripts/resource-gate.js';
import { showSkeleton } from '../../scripts/skeleton.js';
import { resolveDamAssetUrl } from '../../scripts/remote-picture.js';

// This block used to carry its own copy of the DAM-to-publish rewrite, and
// applied it to the download URL but never to the card thumbnail — so every
// related-article image was requested from the EDS host, where /content/dam/ is
// always a 404. It went unnoticed while the assets were dead on both tiers, and
// surfaced the moment they were activated. One shared implementation now, so
// the two cannot drift apart again.
const resolveDownloadUrl = resolveDamAssetUrl;

const FIELD_LABELS = {
  apiBaseUrl: ['api base url', 'api url', 'resource api base url', 'resource api url', 'article api base url', 'article api url'],
  sourceType: ['source type', 'content type', 'mode'],
  slug: ['slug', 'resource slug', 'article slug', 'preview slug', 'preview resource slug', 'preview article slug'],
  heading: ['heading', 'title'],
  limit: ['limit', 'item limit', 'count'],
  detailBasePath: ['detail base path', 'article detail base path', 'article base path', 'blog base path'],
};

// Every blog imported before the rename has "Related Articles" authored into the
// heading cell. Re-importing 400 pages to change one string is not worth it, so
// the legacy default is treated as "unset" and replaced with the per-source
// default below. An author who wants a different heading types one and it wins.
const LEGACY_HEADINGS = ['related articles', 'related resources'];

const DEFAULT_HEADINGS = {
  articles: 'Related Blogs',
  resources: 'Related Resources',
};

// Position of each field in the published markup: one single-cell row per
// field, empty fields kept. These used to be read as COLUMNS of a row, so on
// published pages only apiBaseUrl (index 0) ever resolved and every authored
// heading, limit and source type silently fell back to its default.
const FIELD_INDEX = {
  apiBaseUrl: 0,
  sourceType: 1,
  slug: 2,
  heading: 3,
  limit: 4,
  detailBasePath: 5,
  pinned1: 6,
  pinned2: 7,
  pinned3: 8,
};

const PIN_FIELDS = ['pinned1', 'pinned2', 'pinned3'];

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

/**
 * Published xwalk markup is one single-cell row per field. A block authored as
 * one wide row (document-style) keeps the old column reading.
 */
function getPositionalCell(rows, name) {
  const index = FIELD_INDEX[name];
  if (index === undefined) return null;
  if (rows.length === 1) return rows[0].children[index] || null;
  return rows[index]?.children[0] || null;
}

function readConfigValue(rows, name, fallback = '') {
  const propValue = rows
    .map((row) => readLinkField(row, name).value || readTextField(row, name).value)
    .find(Boolean);

  if (propValue) {
    return normalizeText(propValue) || fallback;
  }

  const cell = getPositionalCell(rows, name);
  if (cell) {
    const anchor = cell.querySelector('a');
    if (anchor) return normalizeText(anchor.getAttribute('href') || anchor.textContent) || fallback;
    if (name === 'apiBaseUrl') return findUrlLikeValue(cell.textContent) || normalizeText(cell.textContent) || fallback;
    return normalizeText(cell.textContent) || fallback;
  }

  return fallback;
}

/**
 * A pinned page as the backend can match it. The link's text is the JCR path
 * with its original casing (`/content/edge/resources/Blogs/foo`); the href is
 * the lowercased public path. Either resolves, but the JCR path is an exact
 * match for the stored page_path, so it is preferred. decorateButtons rewrites
 * the link text of a lone link (label cleanup), so only the path is lifted out
 * of it, never the whole string.
 */
function readPinnedPath(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  const cell = source || getPositionalCell(getRows(block), name);
  if (!cell) return '';

  const anchor = cell.tagName === 'A' ? cell : cell.querySelector('a');
  const text = normalizeText(anchor?.textContent || cell.textContent);
  const jcrPath = text.match(/\/content\/[^\s?#]+/)?.[0];
  if (jcrPath) return jcrPath;
  return normalizeText(anchor?.getAttribute('href')) || (text.startsWith('/') ? text : '');
}

function readPinnedPaths(block) {
  return [...new Set(PIN_FIELDS.map((name) => readPinnedPath(block, name)).filter(Boolean))];
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

function resolveHeading(value, sourceType) {
  const heading = normalizeText(value);
  const fallback = DEFAULT_HEADINGS[sourceType] || DEFAULT_HEADINGS.articles;
  if (!heading || LEGACY_HEADINGS.includes(heading.toLowerCase())) return fallback;
  return heading;
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

/**
 * The item's own tags, which is what the blog and resource libraries filter on.
 * The taxonomy labels are the fallback only: every blog carries the same
 * resource_type_label ("Blog Post"), so on a blog page that pill said nothing.
 */
function taxonomyLabels(item) {
  const tagNames = (item.tags || [])
    .map((tag) => normalizeText(tag?.name || tag))
    .filter(Boolean);
  if (tagNames.length) return tagNames;

  return [
    item.resource_type_label,
    item.audience_label,
    item.issue_label,
  ].map(normalizeText).filter(Boolean);
}

function buildTaxonomy(item) {
  const values = taxonomyLabels(item);
  if (!values.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'related-articles-taxonomy';
  values.slice(0, 3).forEach((value) => wrap.append(buildPill(value, 'is-taxonomy')));
  return wrap;
}

function buildItemHref(item, config) {
  const sourceUrl = item.primary_url || item.detail_path || item.page_path;
  const canonicalHref = normalizeEdgeContentPath(sourceUrl);
  if (canonicalHref) return canonicalHref;

  const detailBasePath = normalizeContentBasePath(config.detailBasePath);
  if (detailBasePath && normalizeText(item.slug)) {
    return normalizeEdgeContentPath(`${detailBasePath}/${item.slug}`);
  }

  return '';
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
    image.src = resolveDamAssetUrl(item.thumbnail);
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

  const actions = document.createElement('div');
  actions.className = 'related-articles-card-actions';

  if (href) {
    const link = document.createElement('a');
    link.className = 'related-articles-card-link';
    link.href = href;
    link.textContent = 'Learn More';
    // The shared text-link style draws its own arrow; the block no longer does.
    applyButtonStyle(link, 'text-link');
    actions.append(link);
  }

  // When the related resource is itself downloadable, offer a gated download
  // straight from the card (in addition to Learn More).
  const downloadUrl = resolveDownloadUrl(item.download_url || item.resource_url);
  if (item.has_download && downloadUrl) {
    const download = document.createElement('a');
    download.className = 'related-articles-card-download';
    download.href = downloadUrl;
    download.target = '_blank';
    download.rel = 'noopener noreferrer';
    download.textContent = 'Download';
    bindGatedLink(download, {
      gated: Boolean(item.gated),
      resourceSlug: item.slug || '',
      fileUrl: downloadUrl,
      fileName: item.aem_asset_name || '',
      downloadLabel: 'Download',
    });
    actions.append(download);
  }

  if (actions.children.length) body.append(actions);

  card.append(body);
  return card;
}

/**
 * The grid's own shape while the related-content request is in flight, so the
 * row does not jump when the articles arrive.
 */
function buildSkeletonView(config) {
  const fragment = document.createDocumentFragment();

  if (config.heading) {
    const head = document.createElement('div');
    head.className = 'related-articles-head';
    const heading = document.createElement('h2');
    heading.className = 'related-articles-heading';
    heading.textContent = config.heading;
    head.append(heading);
    fragment.append(head);
  }

  const grid = document.createElement('div');
  grid.className = 'related-articles-grid';
  fragment.append(grid);
  showSkeleton(grid, {
    count: config.limit,
    item: 'related-articles-card',
    media: 'related-articles-card-media',
    body: 'related-articles-card-body',
    lines: ['label', 'title', 'text', 'text-sm'],
    label: 'Loading related articles',
  });

  return fragment;
}

function buildView(items, config) {
  const fragment = document.createDocumentFragment();

  if (config.heading) {
    const head = document.createElement('div');
    head.className = 'related-articles-head';
    const heading = document.createElement('h2');
    heading.className = 'related-articles-heading';
    heading.textContent = config.heading;
    head.append(heading);
    fragment.append(head);
  }

  const grid = document.createElement('div');
  grid.className = 'related-articles-grid';
  items.forEach((item) => grid.append(buildCard(item, config)));
  fragment.append(grid);

  return fragment;
}

async function fetchItem(apiBaseUrl, sourceType, slug, relatedLimit, pins = []) {
  const endpoint = new URL(`/api/${sourceType}/${encodeURIComponent(slug)}`, `${apiBaseUrl}/`);
  endpoint.searchParams.set('related_limit', String(relatedLimit));
  // Author-pinned pages lead, in order; the backend drops any that no longer
  // resolve and fills the remaining slots from tags.
  pins.forEach((pin) => endpoint.searchParams.append('related_pins[]', pin));
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
    heading: resolveHeading(getFieldValue(block, 'heading'), sourceType),
    limit: parseLimit(getFieldValue(block, 'limit', '3'), 3),
    detailBasePath: getFieldValue(block, 'detailBasePath'),
    pins: readPinnedPaths(block),
  };

  block.replaceChildren(buildSkeletonView(config));

  if (!config.apiBaseUrl) {
    block.replaceChildren(buildMessage('Missing API configuration', 'Set apiBaseUrl on this block so it can load related content.'));
    return;
  }

  if (!config.slug) {
    block.replaceChildren(buildMessage('Missing preview slug', 'Set a preview slug on the block or open the page using an article or resource detail URL.'));
    return;
  }

  try {
    const item = await fetchItem(
      config.apiBaseUrl,
      config.sourceType,
      config.slug,
      config.limit,
      config.pins,
    );
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
