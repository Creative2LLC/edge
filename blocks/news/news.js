import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import createRemoteSafePicture from '../../scripts/remote-picture.js';
import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import { buildListFilterHref } from '../../scripts/list-filter-state.js';
import { showSkeleton } from '../../scripts/skeleton.js';
import {
  getFieldSelector,
  readImageField,
  readLinkField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import {
  applyButtonStyle,
  decorateButtonText,
  readAppendedStyles,
  restyleAppendedButtons,
  takeAppendedStyleCells,
} from '../../scripts/button-utils.js';

const DEFAULT_HEADING = 'NCMEC News';
const DEFAULT_API_BASE_URL = 'https://stunning-dust-ntqeawud3dqy.on-vapor.com';
const BLOG_REQUEST_TIMEOUT = 8000;
const MAX_BLOG_TAGS = 3;

const TAG_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  subheading: ['subheading', 'subtitle'],
  headerButtonText: ['header button text', 'headerbuttontext', 'header button'],
  headerButtonLink: ['header button link', 'headerbuttonlink'],
  featuredMode: ['featured mode', 'featuredmode', 'featured article'],
  button: ['button text', 'buttontext', 'button label', 'button'],
};

// The block's own fields, in model order. A published page carries no field names, so
// these are read by position among the single-cell rows that open the block.
const HEADER_FIELD_ORDER = [
  'heading',
  'subheading',
  'headerButtonText',
  'headerButtonLink',
  'featuredMode',
  'button',
];
const FEATURED_MODE_INDEX = HEADER_FIELD_ORDER.indexOf('featuredMode');
const FEATURED_MODE_VALUES = ['featured', 'none'];

// The blog selects appended to the block model. Their values are namespaced so a published
// page, which has no field names, can find them by value wherever their rows land.
const BLOG_FEED_RE = /^news-blogs-(\d+)$/;
const BLOG_FILTER_RE = /^news-filter-(areas|topics|story-types|programs)-([a-z0-9-]+)$/;
const BLOG_FILTER_PARAM = {
  areas: 'areas[]',
  topics: 'topics[]',
  'story-types': 'story_types[]',
  programs: 'programs[]',
};

// "Pull From Blog" is the last field of an article: image, title, subtitle, link, tags,
// imageAlt, linkStyle, blog.
const ITEM_BLOG_CELL_INDEX = 7;

// The blog listing reads these facets from its URL (see list-filter-state.js); a blog tag
// links there with its own facet so the listing opens already filtered.
const LISTING_FACET_BY_TAXONOMY_GROUP = {
  primary_area: 'areas',
  topic: 'topics',
  story_type: 'storyTypes',
  program_series: 'programs',
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
      map[name] = valueEl.textContent.trim();
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getColText(col) {
  if (!col) return '';
  // Prefer the anchor href for link columns
  const a = col.querySelector('a');
  if (a && a.href) return a.href;
  return col.textContent.trim();
}

/**
 * The block's own fields on a published page. They were never read there before, so an
 * authored subheading or header button silently disappeared on live. The Featured Article
 * select anchors the read — its value is one of two known words — and the other fields sit
 * at fixed offsets from it; without it, the rows are read from the top.
 */
function readPublishedHeaderFields(block) {
  if (block.querySelector('[data-aue-prop]')) return {};
  const rows = [...block.children];
  const firstItem = rows.findIndex((row) => row.children.length > 1 || row.querySelector('picture, img'));
  const leading = firstItem < 0 ? rows : rows.slice(0, firstItem);
  if (!leading.length) return {};

  const anchor = leading.findIndex(
    (row) => FEATURED_MODE_VALUES.includes(row.textContent.trim().toLowerCase()),
  );
  const offset = anchor >= FEATURED_MODE_INDEX ? anchor - FEATURED_MODE_INDEX : 0;
  return HEADER_FIELD_ORDER.reduce((fields, name, index) => {
    const row = leading[offset + index];
    if (row) fields[name] = getColText(row.children[0] || row);
    return fields;
  }, {});
}

function getBlockField(block, fallbacks, name) {
  const field = readTextField(block, name);
  if (field.source) {
    field.source.remove();
    return field.value;
  }
  return fallbacks[name] || '';
}

function getBlockLinkField(block, fallbacks, name) {
  const field = readLinkField(block, name);
  if (field.source) {
    field.source.remove();
    return field.value;
  }
  return fallbacks[name] || '';
}

function getColImage(col) {
  if (!col) return { src: '', alt: '' };
  const img = col.querySelector('img');
  if (img) return { src: img.src, alt: img.alt || '' };
  return { src: '', alt: '' };
}

// Model fields: image, title, subtitle, link, tags, imageAlt, linkStyle, blog

function hasImage(col) {
  return Boolean(col?.querySelector?.('picture, img'));
}

function isLikelyUrl(value) {
  return /^(?:#|\/|https?:\/\/|mailto:|tel:)/i.test(String(value || '').trim());
}

function isLikelyTags(value) {
  return TAG_COLOR_RE.test(String(value || '').trim())
    || /#[0-9a-f]{3,8}/i.test(String(value || ''))
    || String(value || '').includes(':');
}

function findCompactLink(cols, startIndex = 0) {
  return cols.slice(startIndex).find((col) => {
    const anchor = col.querySelector?.('a[href]');
    return anchor?.getAttribute('href') || isLikelyUrl(col.textContent);
  }) || null;
}

function parseCompactArticleRow(row) {
  const cols = [...row.children];
  const imageIndex = cols.findIndex(hasImage);
  if (imageIndex < 0) return null;

  const textCells = cols
    .slice(imageIndex + 1)
    .filter((col) => col.textContent.trim());
  const linkCell = findCompactLink(textCells, 0);
  const titleCell = textCells.find((col) => col !== linkCell && !isLikelyTags(col.textContent));
  const subtitleCell = textCells.find((col) => (
    col !== titleCell && col !== linkCell && !isLikelyTags(col.textContent)
  ));
  const tagsCell = textCells.find((col) => col !== linkCell && isLikelyTags(col.textContent));

  const image = getColImage(cols[imageIndex]);
  const title = getColText(titleCell);
  if (!title) return null;

  return {
    imgSrc: image.src,
    imageAlt: image.alt,
    title,
    subheading: getColText(subtitleCell),
    linkUrl: getColText(linkCell),
    tags: getColText(tagsCell),
  };
}

function hasArticleContent(article) {
  return Boolean(article?.imgSrc || article?.title || article?.subheading || article?.linkUrl);
}

function parseArticleRow(row) {
  const cols = [...row.children];

  // 5 columns: image | title | subtitle | link | tags
  if (cols.length >= 5) {
    const image = getColImage(cols[0]);
    const article = {
      imgSrc: image.src,
      imageAlt: getColText(cols[5]) || image.alt,
      title: getColText(cols[1]),
      subheading: getColText(cols[2]),
      linkUrl: getColText(cols[3]),
      tags: getColText(cols[4]),
    };

    return hasArticleContent(article) ? article : null;
  }

  const compactArticle = parseCompactArticleRow(row);
  if (compactArticle) return compactArticle;

  // Try data-aue-prop (Universal Editor live context)
  const getField = (prop) => {
    const field = readTextField(row, prop);
    return field.value;
  };
  const imageField = readImageField(row, 'image');
  // Author-provided ALT: read by name (editor) with positional fallback at index N=5 (published)
  const modelImageAltField = readTextField(row, 'imageAlt');
  const modelImageAlt = modelImageAltField.value || getColText(cols[5]);
  const title = getField('title');
  if (title) {
    const article = {
      imgSrc: imageField.img?.src || '',
      imageAlt: modelImageAlt || imageField.img?.alt || '',
      title,
      subheading: getField('subtitle'),
      linkUrl: readLinkField(row, 'link').value,
      tags: getField('tags'),
    };

    return hasArticleContent(article) ? article : null;
  }

  // Minimal fallback: 2 columns (image | text)
  if (cols.length >= 2) {
    const img = cols[0].querySelector('img');
    const paragraphs = cols[1].querySelectorAll('p');
    const link = cols[1].querySelector('a');
    const article = {
      imgSrc: img?.src || '',
      imageAlt: img?.alt || '',
      title: paragraphs[0]?.textContent.trim() || '',
      subheading: paragraphs[1]?.textContent.trim() || '',
      linkUrl: link?.href || '',
      tags: '',
    };

    return hasArticleContent(article) ? article : null;
  }

  return null;
}

const FLATTENED_TAG_SEPARATOR_RE = /(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8}))\s+(?=[^:\n]+(?::#|$))/gi;

function normalizeTagLines(tagsStr) {
  return String(tagsStr || '')
    .replace(FLATTENED_TAG_SEPARATOR_RE, '$1\n')
    .split(/\r?\n|[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Authored tags may still carry the old "Name:#hex" colour. Tags now share the blog
// browser's pill, so the colour is dropped and only the name is kept.
function parseTags(tagsStr) {
  return normalizeTagLines(tagsStr).map((line) => {
    const sep = line.lastIndexOf(':');
    const color = sep > 0 ? line.slice(sep + 1).trim() : '';
    return { label: TAG_COLOR_RE.test(color) ? line.slice(0, sep).trim() : line };
  }).filter((tag) => tag.label);
}

/* ---- Blogs from the backend ---- */

function normalizeText(value) {
  return `${value ?? ''}`.trim();
}

function resolveApiBaseUrl() {
  return normalizeText(getMetadata('article-api-base-url')).replace(/\/+$/, '') || DEFAULT_API_BASE_URL;
}

/**
 * A blog's slug from its page path or URL: the last segment, as the backend stores it.
 * @param {string} value e.g. /content/edge/blog/2024/some-post or https://…/blog/2024/some-post.html
 * @returns {string}
 */
function blogSlugFromPath(value) {
  let path = normalizeText(value);
  try {
    path = new URL(path, window.location.origin).pathname;
  } catch (e) {
    return '';
  }
  const segments = path.replace(/\.html$/i, '').split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
}

// A link that points at a blog post (…/blog/<year>/<slug>), so the latest-blogs feed can
// skip a post the author already placed by hand.
function linkedBlogSlug(url) {
  const match = normalizeText(url).match(/\/blog\/\d{4}\/([^/?#.]+)/i);
  return match ? match[1] : '';
}

/**
 * The blog listing a post belongs to: everything before the year segment of its path,
 * which keeps a localised post pointing at its own listing. Same rule as the blog hero.
 */
function blogListingPath(article) {
  const segments = normalizeText(article.page_path || article.primary_url)
    .replace(/[?#].*$/, '')
    .replace(/\.html$/i, '')
    .split('/')
    .filter(Boolean);
  const yearIndex = segments.findIndex((segment) => /^\d{4}$/.test(segment));
  return yearIndex > 0 ? `/${segments.slice(0, yearIndex).join('/')}` : '/blog';
}

// The same pills the blog browser shows on a card: taxonomy first, then free tags that
// don't repeat a taxonomy name. Each links to the listing filtered by it.
function pillKey(label) {
  return `${label}`.trim().toLowerCase().replace(/s$/, '');
}

function blogTagEntries(article) {
  const listingPath = blogListingPath(article);
  const taxonomy = (article.blog_taxonomy || [])
    .map((entry) => ({
      label: normalizeText(entry.name),
      facet: LISTING_FACET_BY_TAXONOMY_GROUP[entry.group],
      value: normalizeText(entry.slug),
    }))
    .filter((entry) => entry.label && entry.facet && entry.value);
  const seen = new Set(taxonomy.map((entry) => pillKey(entry.label)));
  const tags = (article.tags || [])
    .map((tag) => ({
      label: normalizeText(tag.name),
      facet: 'tags',
      value: normalizeText(tag.slug || tag.name),
    }))
    .filter((tag) => tag.label && tag.value && !seen.has(pillKey(tag.label)));

  return [...taxonomy, ...tags].slice(0, MAX_BLOG_TAGS).map(({ label, facet, value }) => ({
    label,
    href: resolveSiteHref(buildListFilterHref(listingPath, { [facet]: [value] })),
  }));
}

async function fetchBlogs(params, signal) {
  const url = new URL('/api/articles', `${resolveApiBaseUrl()}/`);
  url.searchParams.set('locale', currentSiteLocale());
  Object.entries(params).forEach(([key, value]) => {
    (Array.isArray(value) ? value : [value])
      .filter((entry) => normalizeText(entry))
      .forEach((entry) => url.searchParams.append(key, entry));
  });
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`Blog request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  return payload.data || [];
}

/**
 * Card fields from a blog. Anything the author typed on the article wins; an empty field
 * comes from the blog. Tags come from the blog unless the author typed their own.
 */
function mergeBlog(article, blog) {
  const image = blog.thumbnail || blog.header_image || '';
  const blogHref = blog.primary_url || blog.detail_path || blog.page_path;
  const authoredImage = Boolean(article.imgSrc);
  return {
    ...article,
    imgSrc: article.imgSrc || image,
    // The card's title sits beside the image and names it, so a blog image is decorative.
    imageAlt: authoredImage ? article.imageAlt : '',
    remoteImage: !authoredImage && Boolean(image),
    title: article.title || normalizeText(blog.title),
    subheading: article.subheading || normalizeText(blog.excerpt),
    excerpt: !article.subheading && Boolean(normalizeText(blog.excerpt)),
    linkUrl: article.linkUrl || resolveSiteHref(blogHref),
    internalLink: !article.linkUrl,
    tagEntries: article.tags ? parseTags(article.tags) : blogTagEntries(blog),
  };
}

/* ---- Rendering ---- */

function buildTagsContainer(entries) {
  if (!entries?.length) return null;
  const container = document.createElement('div');
  container.className = 'news-tags';
  entries.forEach(({ label, href }) => {
    const tag = document.createElement(href ? 'a' : 'span');
    tag.className = 'news-tag';
    tag.textContent = label;
    if (href) {
      tag.href = href;
      tag.classList.add('is-linked');
      tag.setAttribute('aria-label', `See all blogs tagged ${label}`);
    }
    container.append(tag);
  });
  return container;
}

// The article's appended Link Style; "" keeps the text link.
function articleLinkStyle(row) {
  return row ? readAppendedStyles(row, ['linkStyle'], [...row.children])[0] : '';
}

function buildReadMore(article, style = '') {
  if (!article.linkUrl) return null;
  const a = document.createElement('a');
  a.className = 'news-read-more';
  a.href = article.linkUrl;
  // A blog on this site opens in place; an authored link keeps opening in a new tab.
  if (!article.internalLink) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  a.textContent = decorateButtonText('Read more');
  applyButtonStyle(a, style || 'text-link');
  return a;
}

function buildPicture(article, width) {
  if (article.remoteImage) {
    return createRemoteSafePicture(article.imgSrc, article.imageAlt, false, [{ width }]);
  }
  return createOptimizedPicture(article.imgSrc, article.imageAlt, false, [{ width }]);
}

function buildSubheading(article, className) {
  if (!article.subheading) return null;
  const sub = document.createElement('p');
  sub.className = className;
  if (article.excerpt) sub.classList.add('is-excerpt');
  sub.textContent = article.subheading;
  return sub;
}

function buildFeaturedCard(article, row) {
  const featured = document.createElement('div');
  featured.className = 'news-featured';
  if (row) moveInstrumentation(row, featured);
  setItemLabel(featured, [article.title, article.subheading]);

  const content = document.createElement('div');
  content.className = 'news-featured-content';

  const tagsEl = buildTagsContainer(article.tagEntries);
  if (tagsEl) content.append(tagsEl);

  const titleEl = document.createElement('h3');
  titleEl.className = 'news-featured-title';
  titleEl.textContent = article.title;
  content.append(titleEl);

  const sub = buildSubheading(article, 'news-featured-subheading');
  if (sub) content.append(sub);

  const readMore = buildReadMore(article, articleLinkStyle(row));
  if (readMore) content.append(readMore);

  featured.append(content);

  const pic = article.imgSrc ? buildPicture(article, '800') : null;
  if (pic) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'news-featured-image';
    imageWrap.append(pic);
    featured.append(imageWrap);
  }

  return featured;
}

function buildSmallCard(article, row, hidden) {
  const li = document.createElement('li');
  li.className = `news-card${hidden ? ' news-card-hidden' : ''}`;
  if (row) moveInstrumentation(row, li);
  setItemLabel(li, [article.title, article.subheading]);

  const pic = article.imgSrc ? buildPicture(article, '400') : null;
  if (pic) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'news-card-image';
    imageWrap.append(pic);
    li.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'news-card-content';

  const tagsEl = buildTagsContainer(article.tagEntries);
  if (tagsEl) content.append(tagsEl);

  const titleEl = document.createElement('h3');
  titleEl.className = 'news-card-title';
  titleEl.textContent = article.title;
  content.append(titleEl);

  const sub = buildSubheading(article, 'news-card-subheading');
  if (sub) content.append(sub);

  const readMore = buildReadMore(article, articleLinkStyle(row));
  if (readMore) content.append(readMore);

  li.append(content);
  return li;
}

function buildHeader(config, hasArticles) {
  const {
    heading, subheading, headerButtonText, headerButtonLink,
  } = config;
  const resolvedHeading = heading || (hasArticles ? DEFAULT_HEADING : '');
  if (!(resolvedHeading || subheading || headerButtonText || headerButtonLink)) return null;

  const header = document.createElement('div');
  header.className = 'news-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'news-header-left';

  if (resolvedHeading) {
    const h2 = document.createElement('h2');
    h2.className = 'news-heading';
    h2.textContent = resolvedHeading;
    headerLeft.append(h2);
  }

  if (subheading) {
    const sub = document.createElement('p');
    sub.className = 'news-subheading';
    sub.textContent = subheading;
    headerLeft.append(sub);
  }

  if (headerLeft.childElementCount) header.append(headerLeft);

  // A button with nowhere to go is not published. In the editor it still shows,
  // disabled, so the author can see the link is missing.
  const inEditor = Boolean(document.querySelector('[data-aue-resource]'));
  if (headerButtonLink || (headerButtonText && inEditor)) {
    const headerBtn = document.createElement(headerButtonLink ? 'a' : 'span');
    headerBtn.className = 'news-header-button';
    headerBtn.textContent = headerButtonText || 'Learn More';
    if (headerButtonLink) {
      headerBtn.href = headerButtonLink;
    } else {
      headerBtn.setAttribute('aria-disabled', 'true');
      headerBtn.title = 'Add a link to publish this button';
    }
    // The look comes from the button standard (Primary).
    header.append(applyButtonStyle(headerBtn, 'primary'));
  }

  return header;
}

/**
 * Builds the block from its articles. `loading` shows placeholder cards where blogs are
 * still on their way; the block is rendered again once they arrive.
 */
function renderNews(block, config, articles, { loading = false } = {}) {
  const finish = (inner) => {
    block.replaceChildren(inner);
    restyleAppendedButtons(block, {
      '.news-header-button': config.headerButtonStyle,
    });
  };

  const useFeatured = config.featuredMode
    ? config.featuredMode !== 'none'
    : config.hasAuthoredFeaturedLayout || articles.length > 3;

  const inner = document.createElement('div');
  inner.className = 'news-inner';

  const header = buildHeader(config, articles.length > 0 || loading);
  if (header) inner.append(header);

  if (loading) {
    const ul = document.createElement('ul');
    ul.className = 'news-cards';
    showSkeleton(ul, {
      count: 3,
      item: 'news-card',
      media: 'news-card-image',
      body: 'news-card-content',
      mediaRatio: '16 / 9',
      label: 'Loading news',
    });
    inner.append(ul);
    finish(inner);
    return;
  }

  // Featured card (first article) — only in featured mode
  if (useFeatured && articles.length > 0) {
    inner.append(buildFeaturedCard(articles[0].data, articles[0].row));
  }

  // Small cards — remaining articles (or all if no featured). First 3 visible, rest hidden.
  const startIndex = useFeatured ? 1 : 0;
  const visibleCount = 3;

  if (articles.length > startIndex) {
    const ul = document.createElement('ul');
    ul.className = 'news-cards';
    for (let i = startIndex; i < articles.length; i += 1) {
      const positionInGrid = i - startIndex;
      const hidden = positionInGrid >= visibleCount;
      ul.append(buildSmallCard(articles[i].data, articles[i].row, hidden));
    }
    inner.append(ul);

    // View More button — only if there are more small cards than visible
    const smallCardCount = articles.length - startIndex;
    if (smallCardCount > visibleCount) {
      const btnWrapper = document.createElement('div');
      btnWrapper.className = 'news-button-wrapper';
      const btn = document.createElement('button');
      btn.className = 'news-button';
      btn.textContent = config.buttonText;
      applyButtonStyle(btn, 'primary');
      btn.addEventListener('click', () => {
        const expanded = block.classList.toggle('news-expanded');
        btn.textContent = expanded ? 'Show Less' : config.buttonText;
      });
      btnWrapper.append(btn);
      inner.append(btnWrapper);
    }
  }

  finish(inner);
}

/* ---- Reading the authored block ---- */

// Reads one of the namespaced blog selects and removes its row, so no reader mistakes the
// value for content. In the editor it is found by name; published, by its value.
function takeValueField(block, name, pattern) {
  const named = block.querySelector(getFieldSelector(name));
  if (named) {
    const value = named.textContent.trim().toLowerCase();
    named.remove();
    return value.match(pattern);
  }
  const row = [...block.children].find(
    (candidate) => candidate.children.length <= 1
      && pattern.test(candidate.textContent.trim().toLowerCase()),
  );
  if (!row) return null;
  const match = row.textContent.trim().toLowerCase().match(pattern);
  row.remove();
  return match;
}

function takeBlogFeed(block) {
  const count = takeValueField(block, 'blogFeed', BLOG_FEED_RE);
  const filter = takeValueField(block, 'blogFilter', BLOG_FILTER_RE);
  return {
    count: count ? Number(count[1]) : 0,
    filter: filter ? { param: BLOG_FILTER_PARAM[filter[1]], value: filter[2] } : null,
  };
}

/**
 * Takes each article's "Pull From Blog" reference off its row and keeps it on the row.
 * Runs before the appended Link Style is read: that reader expects the style in the last
 * cell, and the blog field now sits after it.
 */
function takeItemBlogRefs(block) {
  [...block.children].forEach((row) => {
    const named = row.querySelector(getFieldSelector('blog'));
    let cell = named;
    if (!cell && !block.querySelector('[data-aue-prop]') && row.children.length > ITEM_BLOG_CELL_INDEX) {
      cell = row.children[ITEM_BLOG_CELL_INDEX];
    }
    if (!cell) return;
    const anchor = cell.matches('a[href]') ? cell : cell.querySelector('a[href]');
    const slug = blogSlugFromPath(anchor?.getAttribute('href') || cell.textContent);
    if (slug) row.dataset.newsBlog = slug;
    cell.remove();
  });
}

function readConfig(block, headerButtonStyle) {
  const hasAuthoredFeaturedLayout = Boolean(block.querySelector('.news-featured'));
  const fallbacks = {
    ...readPublishedHeaderFields(block),
    ...collectLegacyBlockFields(block),
  };
  return {
    hasAuthoredFeaturedLayout,
    headerButtonStyle,
    heading: getBlockField(block, fallbacks, 'heading'),
    subheading: getBlockField(block, fallbacks, 'subheading'),
    headerButtonText: getBlockField(block, fallbacks, 'headerButtonText'),
    headerButtonLink: getBlockLinkField(block, fallbacks, 'headerButtonLink'),
    featuredMode: getBlockField(block, fallbacks, 'featuredMode'),
    buttonText: getBlockField(block, fallbacks, 'button') || 'View More News',
  };
}

function collectArticles(block) {
  const articles = [];
  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    const blogSlug = row.dataset.newsBlog || '';
    const parsed = parseArticleRow(row);
    if (!parsed && !blogSlug) return;
    const data = parsed || {
      imgSrc: '', imageAlt: '', title: '', subheading: '', linkUrl: '', tags: '',
    };
    articles.push({ data: { ...data, tagEntries: parseTags(data.tags), blogSlug }, row });
  });
  return articles;
}

async function loadBlogs(articles, feed) {
  const picked = articles.map(({ data }) => data.blogSlug).filter(Boolean);
  const placed = articles
    .map(({ data }) => data.blogSlug || linkedBlogSlug(data.linkUrl))
    .filter(Boolean);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BLOG_REQUEST_TIMEOUT);
  const feedParams = {
    per_page: String(feed.count),
    sort: 'newest',
    'exclude_slugs[]': placed,
  };
  if (feed.filter) feedParams[feed.filter.param] = feed.filter.value;

  const [pickedResult, feedResult] = await Promise.allSettled([
    picked.length
      ? fetchBlogs({ 'slugs[]': picked, per_page: String(picked.length) }, controller.signal)
      : Promise.resolve([]),
    feed.count ? fetchBlogs(feedParams, controller.signal) : Promise.resolve([]),
  ]);
  clearTimeout(timer);

  const bySlug = new Map(
    (pickedResult.status === 'fulfilled' ? pickedResult.value : [])
      .map((blog) => [normalizeText(blog.slug).toLowerCase(), blog]),
  );
  // An article pointing at a blog the API could not return keeps whatever was typed on
  // it, and is dropped only when nothing was.
  const merged = articles
    .map(({ data, row }) => {
      const blog = data.blogSlug ? bySlug.get(data.blogSlug.toLowerCase()) : null;
      return { data: blog ? mergeBlog(data, blog) : data, row };
    })
    .filter(({ data }) => data.title);

  const feedBlogs = feedResult.status === 'fulfilled' ? feedResult.value : [];
  const empty = {
    imgSrc: '', imageAlt: '', title: '', subheading: '', linkUrl: '', tags: '',
  };
  feedBlogs.forEach((blog) => merged.push({ data: mergeBlog(empty, blog), row: null }));
  return merged;
}

// Style dropdowns appended to this block's model after its pages were published. They
// are read before the block rebuilds its markup, then applied to the finished buttons.
export default function decorate(block) {
  // The blog fields come off first: the appended-style reader below expects the style
  // dropdowns to be the last cells and rows.
  const feed = takeBlogFeed(block);
  takeItemBlogRefs(block);
  // Appended style dropdowns come out of the published markup first; see button-utils.
  takeAppendedStyleCells(block);
  const [headerButtonStyle] = readAppendedStyles(
    block,
    ['headerButtonStyle'],
    [...block.children].filter((row) => row.children.length <= 1 && !row.querySelector('picture')),
  );
  const config = readConfig(block, headerButtonStyle);
  const articles = collectArticles(block);

  const needsBlogs = feed.count > 0 || articles.some(({ data }) => data.blogSlug);
  if (!needsBlogs) {
    renderNews(block, config, articles);
    return;
  }

  // Blogs load after the block paints, so a slow API never holds up the sections below.
  renderNews(block, config, articles, { loading: true });
  loadBlogs(articles, feed)
    .catch(() => articles.filter(({ data }) => data.title))
    .then((loaded) => renderNews(block, config, loaded));
}
