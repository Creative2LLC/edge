import resolveSiteHref from '../../scripts/link-utils.js';
import attachDragScroll, { getCarouselItemIndex, scrollToCarouselItem } from '../../scripts/carousel-utils.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { bindGatedLink } from '../../scripts/resource-gate.js';

const PUBLISH_BASE_URL = 'https://publish-p171653-e1855116.adobeaemcloud.com';

// A /content/dam/ asset only resolves on the publish tier, never the site
// domain — point any DAM path (bare or site-absolute) at the publish host.
function resolveDownloadUrl(url) {
  const value = `${url || ''}`.trim();
  if (!value) return '';
  const match = value.match(/\/content\/dam\/[^?#"'\s]+/);
  if (match) return `${PUBLISH_BASE_URL}${match[0]}`;
  return value;
}

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

  const actions = document.createElement('div');
  actions.className = 'related-articles-card-actions';

  if (href) {
    const link = document.createElement('a');
    link.className = 'related-articles-card-link';
    link.href = href;
    link.textContent = 'Learn More';
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

function buildNavButton(direction) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `related-articles-nav-btn related-articles-nav-${direction}`;
  btn.setAttribute('aria-label', direction === 'prev' ? 'Previous resources' : 'Next resources');
  btn.innerHTML = direction === 'prev'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  return btn;
}

/**
 * Wire the track to its dots and arrows.
 *
 * Slides come from `[...track.children]` rather than a stored list, and the
 * current index from getCarouselItemIndex() — both deliberate. Deriving the
 * index from scrollLeft / (width + gap) drifts once a slide is a different
 * width or the gap changes, which is what left nav clicks doing nothing in the
 * other carousels.
 */
function wireCarousel(track, dots, prevBtn, nextBtn) {
  attachDragScroll(track);

  const sync = () => {
    const slides = [...track.children];
    const index = getCarouselItemIndex(track, slides);
    dots.forEach((dot, i) => {
      const current = i === index;
      dot.classList.toggle('is-active', current);
      dot.setAttribute('aria-current', current ? 'true' : 'false');
    });

    // A track that fits its content has nothing to scroll to, so neither the
    // arrows nor the dots mean anything — three dots that can never change are
    // worse than no dots. Recomputed on resize rather than at build time,
    // because whether it scrolls depends on the viewport.
    const scrollable = track.scrollWidth - track.clientWidth > 1;
    [prevBtn, nextBtn].forEach((btn) => btn.classList.toggle('is-hidden', !scrollable));
    dots[0]?.parentElement?.classList.toggle('is-hidden', !scrollable);
  };

  const goTo = (target) => {
    const slides = [...track.children];
    const clamped = Math.max(0, Math.min(target, slides.length - 1));
    if (slides[clamped]) scrollToCarouselItem(track, slides[clamped]);
  };

  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  prevBtn.addEventListener('click', () => goTo(getCarouselItemIndex(track, [...track.children]) - 1));
  nextBtn.addEventListener('click', () => goTo(getCarouselItemIndex(track, [...track.children]) + 1));
  track.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);

  sync();
}

function buildView(items, config) {
  const fragment = document.createDocumentFragment();

  const head = document.createElement('div');
  head.className = 'related-articles-head';

  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'related-articles-heading';
    heading.textContent = config.heading;
    head.append(heading);
  }

  const prevBtn = buildNavButton('prev');
  const nextBtn = buildNavButton('next');
  const nav = document.createElement('div');
  nav.className = 'related-articles-nav';
  nav.append(prevBtn, nextBtn);
  head.append(nav);
  fragment.append(head);

  // A horizontal track, not a grid. Keeps the class name `-grid` off the
  // element so the old three-column rules cannot apply to it by accident.
  const track = document.createElement('div');
  track.className = 'related-articles-track';
  items.forEach((item) => {
    const card = buildCard(item, config);
    card.classList.add('related-articles-slide');
    track.append(card);
  });
  fragment.append(track);

  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'related-articles-dots';
  dotsWrap.setAttribute('role', 'tablist');
  dotsWrap.setAttribute('aria-label', 'Related resources');
  const dots = items.map((item, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'related-articles-dot';
    dot.setAttribute('aria-label', `Go to resource ${i + 1}`);
    dotsWrap.append(dot);
    return dot;
  });
  if (dots.length > 1) fragment.append(dotsWrap);

  // Wiring has to wait until the track is measurable — scrollWidth is 0 while
  // the fragment is still detached, so every dot would look active and the
  // arrows would hide themselves.
  requestAnimationFrame(() => wireCarousel(track, dots, prevBtn, nextBtn));

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
