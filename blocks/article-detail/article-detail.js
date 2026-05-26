import { createOptimizedPicture } from '../../scripts/aem.js';
import resolveSiteHref from '../../scripts/link-utils.js';
import { buildListFilterHref } from '../../scripts/list-filter-state.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const FIELD_LABELS = {
  apiBaseUrl: ['api base url', 'api url', 'article api base url', 'article api url'],
  slug: ['slug', 'article slug', 'preview slug', 'preview article slug'],
  listingPath: ['listing path', 'back link', 'back link url', 'back url'],
  listingLabel: ['listing label', 'back link label', 'back label'],
};

const FIELD_COLUMN_INDEX = {
  apiBaseUrl: 0,
  slug: 1,
  listingPath: 2,
  listingLabel: 3,
};

const DEFAULT_ARTICLE_LISTING_PATH = '/content/edge/resources/Blogs.html';

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function getPropValue(scope, name) {
  return normalizeText(readLinkField(scope, name).value || readTextField(scope, name).value);
}

function getRows(block) {
  return getBlockRows(block);
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

  if (name === 'apiBaseUrl') {
    const url = rows
      .map((row) => row.querySelector('a')?.href || findUrlLikeValue(row.textContent))
      .find(Boolean);
    if (url) return normalizeText(url);
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

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeEdgeContentPath(value, fallback = '') {
  return resolveSiteHref(value || fallback);
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

function getSlugFromPathname(pathname = window.location.pathname) {
  const cleanPath = normalizeText(pathname)
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  const segments = cleanPath.split('/').filter(Boolean);
  return normalizeSlug(segments[segments.length - 1] || '');
}

function buildMessage(title, description) {
  const wrapper = document.createElement('div');
  wrapper.className = 'article-detail-message';

  const heading = document.createElement('h2');
  heading.className = 'article-detail-message-title';
  heading.textContent = title;
  wrapper.append(heading);

  if (description) {
    const text = document.createElement('p');
    text.className = 'article-detail-message-copy';
    text.textContent = description;
    wrapper.append(text);
  }

  return wrapper;
}

function buildLinkedPill(label, href, className = '') {
  const pill = document.createElement('a');
  pill.className = `article-detail-pill is-linked ${className}`.trim();
  pill.href = href;
  pill.textContent = label;
  return pill;
}

function buildTaxonomy(article, listingPath) {
  const values = [
    ...((article.audience_labels || []).map((label, index) => ({
      label,
      href: buildListFilterHref(listingPath, {
        audiences: [article.audience_values?.[index] || label],
      }),
    }))),
    ...(article.issue && article.issue_label ? [{
      label: article.issue_label,
      href: buildListFilterHref(listingPath, {
        issues: [article.issue],
      }),
    }] : []),
    ...(article.resource_type && article.resource_type_label ? [{
      label: article.resource_type_label,
      href: buildListFilterHref(listingPath, {
        types: [article.resource_type],
      }),
    }] : []),
  ].filter((entry) => normalizeText(entry.label));

  if (!values.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'article-detail-taxonomy';
  values.forEach((value) => wrap.append(buildLinkedPill(value.label, value.href, 'is-taxonomy')));
  return wrap;
}

function buildTags(article, listingPath) {
  const tags = (article.tags || [])
    .map((tag) => ({
      label: normalizeText(tag.name),
      value: normalizeText(tag.slug || tag.name),
    }))
    .filter((tag) => tag.label);
  if (!tags.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'article-detail-tags';
  tags.forEach((tag) => wrap.append(buildLinkedPill(tag.label, buildListFilterHref(listingPath, {
    tags: [tag.value],
  }))));
  return wrap;
}

function buildMeta(article) {
  const values = [article.author, article.article_date_label].filter(Boolean);
  if (!values.length) return null;

  const meta = document.createElement('div');
  meta.className = 'article-detail-meta';

  values.forEach((value, index) => {
    const item = document.createElement('span');
    item.className = 'article-detail-meta-item';
    item.textContent = value;
    meta.append(item);

    if (index < values.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'article-detail-meta-separator';
      separator.textContent = '|';
      meta.append(separator);
    }
  });

  return meta;
}

function shouldTemporarilyHideHeaderImage() {
  return typeof window !== 'undefined' && window.location.pathname.includes('/blog/');
}

function buildHero(article, config) {
  const image = shouldTemporarilyHideHeaderImage()
    ? null
    : article.header_image || article.thumbnail;

  const section = document.createElement('section');
  section.className = 'article-detail-hero';

  if (image) {
    const media = document.createElement('div');
    media.className = 'article-detail-hero-media';
    media.append(
      createOptimizedPicture(
        image,
        article.title || 'Article image',
        false,
        [{ width: '750' }, { width: '1600' }],
      ),
    );
    section.append(media);
  } else {
    section.classList.add('is-without-image');
  }

  const overlay = document.createElement('div');
  overlay.className = 'article-detail-hero-overlay';
  section.append(overlay);

  const inner = document.createElement('div');
  inner.className = 'article-detail-hero-content';

  const backLink = document.createElement('a');
  backLink.className = 'article-detail-back-link';
  backLink.href = config.listingPath;
  backLink.textContent = config.listingLabel;
  inner.append(backLink);

  const taxonomy = buildTaxonomy(article, config.listingPath);
  if (taxonomy) inner.append(taxonomy);

  const title = document.createElement('h1');
  title.className = 'article-detail-title';
  title.textContent = article.title || 'Article';
  inner.append(title);

  const meta = buildMeta(article);
  if (meta) inner.append(meta);

  if (normalizeText(article.excerpt)) {
    const excerpt = document.createElement('p');
    excerpt.className = 'article-detail-excerpt';
    excerpt.textContent = article.excerpt;
    inner.append(excerpt);
  }

  section.append(inner);
  return section;
}

function buildBody(article, config) {
  const hasBody = normalizeText(article.body);
  const tags = buildTags(article, config.listingPath);
  if (!hasBody && !tags) return null;

  const section = document.createElement('article');
  section.className = 'article-detail-content';

  const inner = document.createElement('div');
  inner.className = 'article-detail-prose';

  if (tags) inner.append(tags);

  if (hasBody) {
    const body = document.createElement('div');
    body.className = 'article-detail-body';
    body.innerHTML = article.body;
    inner.append(body);
  }

  section.append(inner);
  return section;
}

function buildArticleView(article, config) {
  const fragment = document.createDocumentFragment();
  fragment.append(buildHero(article, config));

  const body = buildBody(article, config);
  if (body) fragment.append(body);

  return fragment;
}

async function fetchArticle(apiBaseUrl, slug) {
  const endpoint = new URL(`/api/articles/${encodeURIComponent(slug)}`, `${apiBaseUrl}/`);
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
  const config = {
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl')),
    slug: normalizeSlug(getFieldValue(block, 'slug')) || getSlugFromPathname(),
    listingPath: normalizeEdgeContentPath(getFieldValue(block, 'listingPath'), DEFAULT_ARTICLE_LISTING_PATH),
    listingLabel: getFieldValue(block, 'listingLabel', 'Back to Articles') || 'Back to Articles',
  };

  block.replaceChildren(buildMessage('Loading article...', ''));

  if (!config.apiBaseUrl) {
    block.replaceChildren(buildMessage('Missing API configuration', 'Set apiBaseUrl on this block so the article page can load data.'));
    return;
  }

  if (!config.slug) {
    block.replaceChildren(buildMessage('Missing article slug', 'Set a preview slug on the block or open the page using an /articles/{slug} URL.'));
    return;
  }

  try {
    const article = await fetchArticle(config.apiBaseUrl, config.slug);

    if (!article) {
      block.replaceChildren(buildMessage('Article not found', `No published article was found for the slug "${config.slug}".`));
      return;
    }

    block.replaceChildren(buildArticleView(article, config));
    if (normalizeText(article.title)) {
      document.title = `${article.title} | NCMEC`;
    }
  } catch (error) {
    block.replaceChildren(buildMessage('Article unavailable', error?.message || 'The article API request failed.'));
  }
}
