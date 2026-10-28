import { getMetadata } from '../../scripts/aem.js';
import createRemoteSafePicture from '../../scripts/remote-picture.js';
import resolveSiteHref from '../../scripts/link-utils.js';
import { buildListFilterHref } from '../../scripts/list-filter-state.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getBlockRows,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';

const FIELD_COLUMN_INDEX = {
  pageTitle: 0,
  'jcr:description': 1,
  authorName: 2,
  articleDate: 3,
  thumbnail: 4,
  headerImage: 5,
  articleBody: 6,
  articleBodyRaw: 7,
  articleBodyRawEncoded: 8,
};

const resourceDataCache = new Map();

// Tags live in the backend, not in the authored block — nothing in the AEM
// model carries them, and adding a field would mean re-authoring every blog.
// This is the same backend the related-articles block on these pages calls.
const DEFAULT_API_BASE_URL = 'https://stunning-dust-ntqeawud3dqy.on-vapor.com';

const MAX_HERO_TAGS = 6;

function isDebugEnabled() {
  try {
    return new URLSearchParams(window.location.search).has('articleDetailsDebug')
      || window.localStorage?.getItem('articleDetailsDebug') === 'true';
  } catch (e) {
    return false;
  }
}

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/(?:https?:\/\/[^\s<>"]+|\/content\/dam\/[^\s<>"]+|\/media_[^\s<>"]+)/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

function normalizeJsonFieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const pathKey = '_path';
    return `${value.href || value.src || value.path || value.url || value[pathKey] || value['repo:path'] || value.fileReference || value.reference || value.html || ''}`.trim();
  }
  return '';
}

function normalizeJsonHtmlValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return `${value.html || value.value || ''}`.trim();
  return '';
}

function decodeHtmlEntities(value) {
  const text = normalizeText(value);
  if (!text.includes('&')) return text;

  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value.trim();
}

function decodeBase64Utf8(value) {
  const encoded = normalizeText(value);
  if (!encoded) return '';

  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes).trim();
  } catch (e) {
    return '';
  }
}

function hasEmbeddedImage(value) {
  return /<(img|picture|source)\b/i.test(`${value || ''}`);
}

function imageSourcesFromHtml(value) {
  const html = `${value || ''}`;
  if (!html) return [];

  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.querySelectorAll('img, source')]
    .map((node) => node.getAttribute('src') || node.getAttribute('srcset') || '')
    .filter(Boolean);
}

function readTextValue(block, name) {
  const namedText = readTextField(block, name).value;
  if (namedText) return namedText;

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return '';

  return getBlockRows(block)
    .map((row) => readTextField(row, name, {
      fallbackCell: row.children[columnIndex],
    }).value)
    .find(Boolean) || '';
}

function normalizeRawHtmlField(block, resourceData) {
  const encodedBody = decodeBase64Utf8(
    normalizeJsonHtmlValue(resourceData.articleBodyRawEncoded)
      || readTextValue(block, 'articleBodyRawEncoded'),
  );
  if (encodedBody) return encodedBody;

  const jsonBody = decodeHtmlEntities(normalizeJsonHtmlValue(resourceData.articleBodyRaw));
  if (jsonBody) return jsonBody;

  return decodeHtmlEntities(readTextValue(block, 'articleBodyRaw'));
}

function getRows(block) {
  return getBlockRows(block);
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute?.('data-aue-resource')
      || scope?.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

// An ISO-8601 stamp is the one parent value that identifies itself, which makes
// articleDate the only safe anchor in published markup.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T\s]|$)/;

/**
 * The hero options, in model order, with the exact vocabulary each one accepts.
 *
 * They were added after 397 blogs had already been published, so a published
 * page has either none of these rows or all five, and a positional reader has
 * to tell which WITHOUT being told. That is only safe because every one is a
 * select: the set of strings that can legitimately appear in these rows is
 * closed and defined right here, so a row either belongs to this list or it is
 * where the article body starts.
 *
 * Keep in step with _article-details.json. A value missing from a list makes
 * that row read as body copy and drags every later field back with it.
 */
const HERO_OPTION_FIELDS = [
  { name: 'heroContentPosition', values: ['left', 'center', 'right'] },
  { name: 'heroHeight', values: ['short', 'medium', 'tall'] },
  { name: 'heroOverlayOpacity', values: ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'] },
  { name: 'heroGradientOverlay', values: ['show', 'hide'] },
  { name: 'heroTextColor', values: ['#ffffff', '#00264d', '#004b76', '#006d90', '#414042', '#f1f2f2', '#ae1b1f'] },
];

/**
 * Whether this row is the Nth hero option rather than the first body item.
 *
 * An unset select still flattens to an empty row (div-cells keep empty fields),
 * so empty counts as a match.
 *
 * Note what is NOT tested: the presence of a <p>. Read the source HTML of a
 * published page and a select's cell holds a bare text node — but by the time a
 * block decorates, EDS has wrapped it, so every one of these rows really looks
 * like `<div><p>center</p></div>`. Excluding <p> rejected all five. What a
 * select can never produce is an image, a list, a heading, or more than one
 * paragraph, so those are the structural tests; the closed vocabulary does the
 * rest of the work.
 */
function isHeroOptionRow(row, index) {
  const field = HERO_OPTION_FIELDS[index];
  if (!field || !row || row.children.length !== 1) return false;
  if (row.querySelector('picture, img, ul, ol, h1, h2, h3, h4, h5, h6')) return false;
  if (row.querySelectorAll('p').length > 1) return false;

  const value = normalizeText(row.textContent).toLowerCase();
  return value === '' || field.values.includes(value);
}

function countHeroOptionRows(rows, start) {
  let count = 0;
  while (count < HERO_OPTION_FIELDS.length && isHeroOptionRow(rows[start + count], count)) {
    count += 1;
  }

  // All-or-nothing: a page is published at one model revision or the other, so a
  // partial run is a body item that happened to look like an option, not a page
  // caught halfway through the change.
  return count === HERO_OPTION_FIELDS.length ? count : 0;
}

function heroOptionRows(rows, start) {
  if (countHeroOptionRows(rows, start) === 0) return {};

  return Object.fromEntries(HERO_OPTION_FIELDS.map((field, i) => [field.name, start + i]));
}

const publishedLayoutCache = new WeakMap();

/**
 * Where each field sits on a PUBLISHED page.
 *
 * Everything else in this block reads fields through `data-aue-prop` /
 * `data-aue-model`, which exist only inside the Universal Editor, and falls
 * back to FIELD_COLUMN_INDEX — a COLUMN index, i.e. `row.children[4]`. Published
 * output has a different geometry entirely: one field per ROW, one cell per row.
 * So every lookup past index 0 read `undefined`, and only pageTitle survived,
 * by accident, because `.find(Boolean)` happens to pick the first row. Measured
 * on the first published blog (mary-theresa, 2026-09-21): title rendered, author
 * / date / hero / body all empty.
 *
 *   row 0 pageTitle | 1 authorName | 2 articleDate | 3 thumbnail | 4 headerImage
 *   row 5+          one row per article-body item
 *
 * `jcr:description` never appears as a row: it is a JCR property, which the page
 * renderer consumes as <meta name="description">, so the model's six fields
 * become five cells.
 *
 * Offsets hang off the date row rather than being hard-coded, so a field added
 * or dropped ahead of it shifts the whole map instead of silently re-pointing
 * every field after it.
 */
function computePublishedLayout(block) {
  if (hasAuthoringContext(block)) return null;

  const rows = getRows(block);
  if (rows.length < 3) return null;

  const dateIndex = rows.findIndex((row) => row.children.length === 1
    && ISO_DATE_RE.test(normalizeText(row.textContent)));
  // 2 with jcr:description absorbed into page metadata, 3 if it ever renders.
  const dateRow = dateIndex === 2 || dateIndex === 3 ? dateIndex : 2;

  return {
    rows,
    fieldRow: {
      pageTitle: 0,
      authorName: dateRow - 1,
      articleDate: dateRow,
      thumbnail: dateRow + 1,
      headerImage: dateRow + 2,
      ...heroOptionRows(rows, dateRow + 3),
    },
    bodyStart: dateRow + 3 + countHeroOptionRows(rows, dateRow + 3),
  };
}

function getPublishedLayout(block) {
  if (!publishedLayoutCache.has(block)) {
    publishedLayoutCache.set(block, computePublishedLayout(block));
  }

  return publishedLayoutCache.get(block);
}

function getPublishedCell(block, name) {
  const layout = getPublishedLayout(block);
  const index = layout?.fieldRow?.[name];
  if (index === undefined || index < 0) return null;

  return layout.rows[index]?.children?.[0] || null;
}

async function getResourceData(scope) {
  const resource = scope?.getAttribute('data-aue-resource')
    || scope?.querySelector?.('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || scope?.closest?.('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return {};

  if (resourceDataCache.has(resourcePath)) {
    return resourceDataCache.get(resourcePath);
  }

  const pendingData = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return {};
      return response.json();
    })
    .catch(() => ({}));

  resourceDataCache.set(resourcePath, pendingData);
  return pendingData;
}

function getBlockResourcePath(scope) {
  const resource = scope?.getAttribute('data-aue-resource')
    || scope?.querySelector?.('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || scope?.closest?.('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';

  return resourcePathFromUrn(resource);
}

function getTextField(block, name, fallback = '') {
  const namedValue = normalizeText(
    readLinkField(block, name).value || readTextField(block, name).value,
  );
  if (namedValue) return namedValue;

  const publishedCell = getPublishedCell(block, name);
  if (publishedCell) return normalizeText(publishedCell.textContent) || fallback;

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return fallback;

  const value = getRows(block).map((row) => {
    const cell = row.children[columnIndex];
    return normalizeText(readLinkField(row, name, { fallbackCell: cell }).value
      || readTextField(row, name, { fallbackCell: cell }).value);
  }).find(Boolean);

  return value || fallback;
}

function getHtmlField(block, name) {
  const richField = readRichTextField(block, name);
  if (richField.source) {
    return {
      html: richField.html,
      source: richField.source,
    };
  }

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) {
    return {
      html: '',
      source: null,
    };
  }

  const value = getRows(block)
    .map((row) => readRichTextField(row, name, { fallbackCell: row.children[columnIndex] }).html)
    .find(Boolean);
  return {
    html: value || '',
    source: null,
  };
}

function bodyItemModel(row) {
  return normalizeText(
    row.getAttribute?.('data-aue-model')
      || row.querySelector?.('[data-aue-prop="model"]')?.textContent
      || row.querySelector?.('[data-aue-prop="aueComponentId"]')?.textContent,
  );
}

function isBodyItemRow(row) {
  const model = bodyItemModel(row);
  if (model === 'article-body-text' || model === 'article-body-image') return true;

  const field = row.querySelector?.(
    '[data-aue-prop="bodyText"], [data-richtext-prop="bodyText"], [data-aue-prop="bodyImage"], [data-aue-prop="bodyImageCaption"], [data-richtext-prop="bodyImageCaption"]',
  );
  if (!field) return false;

  const fieldRoot = field.closest?.('[data-aue-resource]');
  return !fieldRoot || fieldRoot === row;
}

function getBodyItemRows(scope) {
  return getRows(scope).flatMap((row) => (
    isBodyItemRow(row) ? [row] : getBodyItemRows(row)
  ));
}

function resourceBodyItemModel(key, value) {
  const model = normalizeText(value.model || value.aueComponentId);
  if (model === 'article-body-text' || model === 'article-body-image') return model;

  const normalizedKey = normalizeText(key).toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (normalizedKey.includes('articlebodytext')) return 'article-body-text';
  if (normalizedKey.includes('articlebodyimage')) return 'article-body-image';
  if (Object.prototype.hasOwnProperty.call(value, 'bodyText')) return 'article-body-text';
  if (
    Object.prototype.hasOwnProperty.call(value, 'bodyImage')
    || Object.prototype.hasOwnProperty.call(value, 'bodyImageAlt')
    || Object.prototype.hasOwnProperty.call(value, 'bodyImageCaption')
  ) return 'article-body-image';

  return '';
}

function appendResourceBodyItems(data, items, pageTitle) {
  Object.entries(data || {}).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || key.startsWith(':')) return;

    const model = resourceBodyItemModel(key, value);
    if (model === 'article-body-text') {
      const html = normalizeJsonHtmlValue(value.bodyText);
      if (html) {
        items.push({
          type: 'text',
          html,
          source: null,
        });
      }
      return;
    }

    if (model === 'article-body-image') {
      const src = normalizeJsonFieldValue(value.bodyImage || value.image || value.fileReference);
      if (src) {
        items.push({
          type: 'image',
          image: {
            src,
            alt: normalizeText(value.bodyImageAlt) || pageTitle || 'Article image',
          },
          caption: normalizeJsonHtmlValue(value.bodyImageCaption),
          source: null,
        });
      }
      return;
    }

    appendResourceBodyItems(value, items, pageTitle);
  });
}

function ensureAuthoringContainer(block) {
  if (!hasAuthoringContext(block)) return;

  block.dataset.aueType = 'container';
  if (!block.dataset.aueModel) block.dataset.aueModel = 'article-details';
  if (!block.dataset.aueFilter) block.dataset.aueFilter = 'article-details';
  if (!block.dataset.aueLabel) block.dataset.aueLabel = 'Article Details';
}

function imageFromNode(node, fallbackAlt) {
  if (!node) return null;

  const img = node.tagName === 'IMG' ? node : node.querySelector('img');
  if (img?.src) {
    return {
      src: img.src,
      alt: img.alt || fallbackAlt,
    };
  }

  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  const href = normalizeText(anchor?.getAttribute('href') || node.getAttribute?.('href') || '');
  if (href) {
    return {
      src: href,
      alt: fallbackAlt,
    };
  }

  const textUrl = findUrlLikeValue(node.textContent || '');
  if (textUrl) {
    return {
      src: textUrl,
      alt: fallbackAlt,
    };
  }

  return null;
}

function getBodyItemImage(row, fallbackAlt) {
  const namedImage = readImageField(row, 'bodyImage', { fallbackCell: row.children[0] });
  const image = imageFromNode(namedImage.cell, fallbackAlt);
  if (!image) return null;

  return {
    ...image,
    alt: readTextField(row, 'bodyImageAlt', { fallbackCell: row.children[1] }).value
      || image.alt
      || fallbackAlt,
  };
}

/**
 * Body items on a PUBLISHED page.
 *
 * `isBodyItemRow` only ever matches on `data-aue-model` / `data-aue-prop`, so on
 * a published page it returns false for every row and `getBodyItemRows` recurses
 * down to the leaves and yields nothing — the article body simply vanished.
 * Published items are positional instead, starting at `layout.bodyStart`, and
 * tell themselves apart by shape: an image item carries a <picture>, a text item
 * carries richtext. A trailing empty field is trimmed, which is why an image row
 * usually has two cells (image, alt) rather than three.
 */
function getPublishedBodyItems(layout, pageTitle) {
  return layout.rows.slice(layout.bodyStart).map((row) => {
    const cells = [...row.children];
    if (!cells.length) return null;

    if (row.querySelector('picture, img')) {
      const alt = normalizeText(cells[1]?.textContent) || pageTitle || 'Article image';
      const image = imageFromNode(cells[0], alt);
      if (!image?.src) return null;

      return {
        type: 'image',
        image,
        caption: normalizeText(cells[2]?.innerHTML),
        source: row,
      };
    }

    const cell = cells[0];
    const html = normalizeText(cell.innerHTML);
    if (!html) return null;

    // A single unwrapped line comes through as a bare text node; the body styles
    // are written for paragraphs, so give it one.
    return {
      type: 'text',
      html: cell.firstElementChild ? html : `<p>${html}</p>`,
      source: row,
    };
  }).filter(Boolean);
}

function getArticleBodyItems(block, pageTitle, resourceData = {}) {
  const items = [];
  const isAuthoring = hasAuthoringContext(block);

  const publishedLayout = getPublishedLayout(block);
  if (publishedLayout) {
    const published = getPublishedBodyItems(publishedLayout, pageTitle);
    if (published.length) return published;
  }

  getBodyItemRows(block).forEach((row) => {
    const model = bodyItemModel(row);

    if (model === 'article-body-image') {
      const image = getBodyItemImage(row, pageTitle || 'Article image');
      if (!image?.src) {
        if (isAuthoring) {
          items.push({
            type: 'image',
            image: null,
            caption: '',
            source: row,
            isPlaceholder: true,
          });
        }
        return;
      }

      const caption = readRichTextField(row, 'bodyImageCaption', { fallbackCell: row.children[2] });
      items.push({
        type: 'image',
        image,
        caption: caption.html,
        source: row,
      });
      return;
    }

    const text = readRichTextField(row, 'bodyText', { fallbackCell: row.children[0] });
    if (text.html) {
      items.push({
        type: 'text',
        html: text.html,
        source: text.source || row,
      });
      return;
    }
    if (isAuthoring && model === 'article-body-text') {
      items.push({
        type: 'text',
        html: '<p>Article body text</p>',
        source: row,
        isPlaceholder: true,
      });
      return;
    }

    const image = getBodyItemImage(row, pageTitle || 'Article image');
    if (!image?.src) {
      if (isAuthoring && model === 'article-body-image') {
        items.push({
          type: 'image',
          image: null,
          caption: '',
          source: row,
          isPlaceholder: true,
        });
      }
      return;
    }

    const caption = readRichTextField(row, 'bodyImageCaption', { fallbackCell: row.children[2] });
    items.push({
      type: 'image',
      image,
      caption: caption.html,
      source: row,
    });
  });

  if (items.length) return items;

  appendResourceBodyItems(resourceData, items, pageTitle);

  return items;
}

function getImageField(block, name, resourceData = {}) {
  const fallbackAlt = getTextField(block, 'pageTitle', 'Article image');
  const namedImage = readImageField(block, name);
  const propImage = imageFromNode(namedImage.cell, fallbackAlt);
  if (namedImage.source && propImage) return propImage;

  const publishedImage = imageFromNode(getPublishedCell(block, name), fallbackAlt);
  if (publishedImage) return publishedImage;

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return null;

  const image = getRows(block)
    .map((row) => imageFromNode(row.children[columnIndex], fallbackAlt))
    .find(Boolean);

  if (image) return image;

  const jsonValue = normalizeJsonFieldValue(resourceData?.[name]);
  if (jsonValue) {
    return {
      src: jsonValue,
      alt: fallbackAlt,
    };
  }

  return null;
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

/**
 * Where to ask for this article's tags. Page metadata wins, then the
 * related-articles block that sits further down every blog page (its API base
 * is already authored there, so a blog imported before this change still
 * resolves), then the shared default.
 */
function resolveApiBaseUrl() {
  const fromMetadata = normalizeApiBaseUrl(getMetadata('article-api-base-url'));
  if (fromMetadata) return fromMetadata;

  const siblingCell = document.querySelector('.related-articles > div:first-child > div:first-child');
  const fromSibling = normalizeApiBaseUrl(
    siblingCell?.querySelector('a')?.getAttribute('href') || siblingCell?.textContent,
  );
  if (/^https?:\/\//i.test(fromSibling)) return fromSibling;

  return DEFAULT_API_BASE_URL;
}

function getArticleSlug(pathname = window.location.pathname) {
  const segments = normalizeText(pathname)
    .replace(/[?#].*$/, '')
    .replace(/\.html$/i, '')
    .split('/')
    .filter(Boolean);
  const slug = segments[segments.length - 1] || '';

  try {
    return decodeURIComponent(slug);
  } catch (e) {
    return slug;
  }
}

/**
 * Which listing filter each blog-taxonomy group drives.
 *
 * The same mapping article-list uses for its card pills, and it has to stay
 * that way: both ends have to agree or the link filters the wrong facet. The
 * listing reads these from the URL via readListFilterState and forwards them to
 * the API as areas[] / topics[] / story_types[] / programs[].
 */
const LISTING_FACET_BY_TAXONOMY_GROUP = {
  primary_area: 'areas',
  topic: 'topics',
  story_type: 'storyTypes',
  program_series: 'programs',
};

/**
 * The blog listing this article belongs to.
 *
 * Derived from the path rather than authored, because the block has no listing
 * field and adding one would mean re-authoring 397 pages. A blog lives at
 * <listing>/<year>/<slug>, so everything before the year segment is the
 * listing — which also keeps a localised path (/es/blog/...) pointing at its
 * own listing instead of the English one.
 */
function getListingPath(pathname = window.location.pathname) {
  const segments = normalizeText(pathname)
    .replace(/[?#].*$/, '')
    .replace(/\.html$/i, '')
    .split('/')
    .filter(Boolean);

  const yearIndex = segments.findIndex((segment) => /^\d{4}$/.test(segment));
  const listing = yearIndex > 0 ? segments.slice(0, yearIndex) : segments.slice(0, -1);

  return listing.length ? `/${listing.join('/')}` : '/blog';
}

/**
 * The article's own tags, falling back to its blog taxonomy so a blog that was
 * only categorised (and never tagged) still shows something.
 *
 * Each entry carries the facet and value it filters by, not just a label — a
 * tag in the hero is a way back into the listing, so the value has to survive
 * the trip.
 */
async function fetchArticleTags() {
  const slug = getArticleSlug();
  if (!slug) return [];

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/api/articles/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];

    const payload = await response.json();
    const article = payload?.data || {};
    const tags = (article.tags || [])
      .map((tag) => ({
        label: normalizeText(tag?.name),
        facet: 'tags',
        value: normalizeText(tag?.slug || tag?.name),
      }))
      .filter((tag) => tag.label && tag.value);
    if (tags.length) return tags.slice(0, MAX_HERO_TAGS);

    return (article.blog_taxonomy || [])
      .map((entry) => ({
        label: normalizeText(entry?.name),
        facet: LISTING_FACET_BY_TAXONOMY_GROUP[normalizeText(entry?.group)],
        value: normalizeText(entry?.slug),
      }))
      .filter((entry) => entry.label && entry.facet && entry.value)
      .slice(0, MAX_HERO_TAGS);
  } catch (e) {
    return [];
  }
}

function buildTags(entries) {
  const wrap = document.createElement('div');
  wrap.className = 'article-details-tags';
  const listingPath = getListingPath();

  entries.forEach(({ label, facet, value }) => {
    // A tag with nothing to filter by stays a plain span rather than becoming a
    // link to the unfiltered listing, which would look identical and go nowhere
    // useful.
    if (!facet || !value) {
      const tag = document.createElement('span');
      tag.className = 'article-details-tag';
      tag.textContent = label;
      wrap.append(tag);
      return;
    }

    const tag = document.createElement('a');
    tag.className = 'article-details-tag is-linked';
    tag.href = resolveSiteHref(buildListFilterHref(listingPath, { [facet]: [value] }));
    tag.textContent = label;
    tag.setAttribute('aria-label', `See all blogs tagged ${label}`);
    wrap.append(tag);
  });

  return wrap;
}

/**
 * Fired without awaiting so the tag request never holds up first paint — the
 * hero renders, then the row appears under the byline when the API answers.
 */
async function appendHeroTags(block) {
  const labels = await fetchArticleTags();
  if (!labels.length) return;

  const heroContent = block.querySelector('.article-details-hero-content');
  if (!heroContent || heroContent.querySelector('.article-details-tags')) return;

  const tags = buildTags(labels);
  const meta = heroContent.querySelector('.article-details-meta');
  if (meta) meta.after(tags);
  else heroContent.querySelector('.article-details-title')?.after(tags);
}

function buildMessage(title, description) {
  const wrapper = document.createElement('div');
  wrapper.className = 'article-details-message';
  const heading = document.createElement('h2');
  heading.className = 'article-details-message-title';
  heading.textContent = title;
  wrapper.append(heading);

  if (description) {
    const text = document.createElement('p');
    text.className = 'article-details-message-copy';
    text.textContent = description;
    wrapper.append(text);
  }

  return wrapper;
}

function formatArticleDate(value) {
  const text = normalizeText(value);
  if (!text) return '';

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(text);

  if (Number.isNaN(date.getTime())) return text;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function buildMeta(authorName, articleDate) {
  const values = [authorName, articleDate].filter(Boolean);
  if (!values.length) return null;

  const meta = document.createElement('div');
  meta.className = 'article-details-meta';

  values.forEach((value, index) => {
    const item = document.createElement('span');
    item.className = 'article-details-meta-item';
    item.textContent = value;
    meta.append(item);

    if (index < values.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'article-details-meta-separator';
      separator.textContent = '|';
      meta.append(separator);
    }
  });

  return meta;
}

/**
 * Turn the authored hero selects into classes and custom properties.
 *
 * Everything is opt-in: a value the model does not offer, or the empty default,
 * leaves the hero exactly as the 397 already-published blogs render it. That is
 * the whole contract of adding these fields late — an existing page that has
 * never been re-authored must not move a pixel.
 */
function applyHeroOptions(section, fields) {
  const position = normalizeText(fields.heroContentPosition).toLowerCase();
  if (['left', 'center', 'right'].includes(position)) {
    section.classList.add(`is-content-${position}`);
  }

  const height = normalizeText(fields.heroHeight).toLowerCase();
  if (['short', 'medium', 'tall'].includes(height)) {
    section.classList.add(`is-height-${height}`);
  }

  if (normalizeText(fields.heroGradientOverlay).toLowerCase() === 'hide') {
    section.classList.add('is-without-gradient');
  }

  // A percentage, including 0 — so test for a valid number, never truthiness.
  const opacity = Number(normalizeText(fields.heroOverlayOpacity));
  if (normalizeText(fields.heroOverlayOpacity) !== '' && Number.isFinite(opacity)) {
    section.classList.add('has-overlay-opacity');
    section.style.setProperty('--article-hero-overlay-opacity', `${Math.min(Math.max(opacity, 0), 100) / 100}`);
  }

  const textColor = normalizeText(fields.heroTextColor);
  if (/^#[0-9a-f]{3,8}$/i.test(textColor)) {
    section.style.setProperty('--article-hero-text-color', textColor);
    section.classList.add('has-text-color');
  }
}

function buildHero(fields) {
  const image = fields.headerImage || fields.thumbnail;

  const section = document.createElement('section');
  section.className = 'article-details-hero';
  applyHeroOptions(section, fields);

  if (image?.src) {
    const media = document.createElement('div');
    media.className = 'article-details-hero-media';
    const picture = createRemoteSafePicture(
      image.src,
      image.alt || fields.pageTitle || 'Article image',
      true,
      [{ width: '750' }, { width: '1600' }],
    );
    // Most legacy blog heroes point at a DAM asset that was never migrated onto
    // the publish tier, and a hero that 404s leaves the overlay floating over
    // nothing. Fall back to the no-image gradient, which is a finished design.
    picture.querySelector('img')?.addEventListener('error', () => {
      media.remove();
      section.classList.add('is-without-image');
    }, { once: true });
    media.append(picture);
    section.append(media);
  } else {
    section.classList.add('is-without-image');
  }

  const overlay = document.createElement('div');
  overlay.className = 'article-details-hero-overlay';
  section.append(overlay);

  const inner = document.createElement('div');
  inner.className = 'article-details-hero-content';

  const title = document.createElement('h1');
  title.className = 'article-details-title';
  title.textContent = fields.pageTitle;
  inner.append(title);

  const meta = buildMeta(fields.authorName, fields.articleDate);
  if (meta) inner.append(meta);

  if (fields.description) {
    const excerpt = document.createElement('p');
    excerpt.className = 'article-details-excerpt';
    excerpt.textContent = fields.description;
    inner.append(excerpt);
  }

  section.append(inner);
  return section;
}

function chooseArticleBody(block, resourceData) {
  const richTextBody = getHtmlField(block, 'articleBody');
  const rawBody = normalizeRawHtmlField(block, resourceData);

  if (
    rawBody
    && (!richTextBody.html || (hasEmbeddedImage(rawBody) && !hasEmbeddedImage(richTextBody.html)))
  ) {
    return {
      html: rawBody,
      source: richTextBody.source,
    };
  }

  return richTextBody.html ? richTextBody : {
    html: rawBody,
    source: null,
  };
}

function debugArticleDetails(block, resourceData, fields) {
  if (!isDebugEnabled()) return;

  const editableBody = getHtmlField(block, 'articleBody').html
    || normalizeJsonHtmlValue(resourceData.articleBody);
  const rawBody = normalizeRawHtmlField(block, resourceData);

  // eslint-disable-next-line no-console
  console.groupCollapsed('[article-details] body debug');
  // The hero options are read by row position, so which row each one landed on
  // is the first thing worth seeing when one of them does not take effect.
  // eslint-disable-next-line no-console
  console.table({
    publishedLayout: JSON.stringify(getPublishedLayout(block)?.fieldRow || null),
    bodyStart: getPublishedLayout(block)?.bodyStart ?? null,
    heroContentPosition: fields.heroContentPosition,
    heroHeight: fields.heroHeight,
    heroOverlayOpacity: fields.heroOverlayOpacity,
    heroGradientOverlay: fields.heroGradientOverlay,
    heroTextColor: fields.heroTextColor,
  });
  // eslint-disable-next-line no-console
  console.table({
    resourcePath: getBlockResourcePath(block),
    filter: normalizeText(resourceData.filter),
    hasEditableBody: Boolean(editableBody),
    editableHasImage: hasEmbeddedImage(editableBody),
    editableLength: editableBody.length,
    rawHasImage: hasEmbeddedImage(rawBody),
    rawLength: rawBody.length,
    bodyItemCount: fields.articleBodyItems?.length || 0,
    chosenHasImage: hasEmbeddedImage(fields.articleBody?.html),
    chosenLength: fields.articleBody?.html?.length || 0,
    chosenSource: fields.articleBody?.html === rawBody ? 'raw' : 'articleBody',
  });
  // eslint-disable-next-line no-console
  console.log('articleBody image sources', imageSourcesFromHtml(editableBody));
  // eslint-disable-next-line no-console
  console.log('raw image sources', imageSourcesFromHtml(rawBody));
  // eslint-disable-next-line no-console
  console.log('AEM block JSON', resourceData);
  // eslint-disable-next-line no-console
  console.groupEnd();
}

function buildBody(fields) {
  if (
    !fields.articleBodyItems?.length
    && !fields.articleBody?.html
    && !fields.isAuthoring
  ) return null;

  const section = document.createElement('article');
  section.className = 'article-details-content';

  const inner = document.createElement('div');
  inner.className = 'article-details-prose';

  const body = document.createElement('div');
  body.className = 'article-details-body';

  if (fields.articleBodyItems?.length) {
    fields.articleBodyItems.forEach((item) => {
      if (item.type === 'text') {
        const text = document.createElement('div');
        text.className = 'article-details-body-text';
        if (item.isPlaceholder) text.classList.add('article-details-body-placeholder');
        text.innerHTML = item.html;
        if (item.source) moveInstrumentation(item.source, text);
        setItemLabel(text, [text.textContent]);
        body.append(text);
        return;
      }

      const figure = document.createElement('figure');
      figure.className = 'article-details-body-image';
      if (item.isPlaceholder) figure.classList.add('article-details-body-placeholder');
      if (item.source) moveInstrumentation(item.source, figure);
      if (item.image?.src) {
        figure.append(
          createRemoteSafePicture(
            item.image.src,
            item.image.alt || fields.pageTitle || 'Article image',
            false,
            [{ width: '750' }, { width: '1200' }],
          ),
        );
      } else {
        const imagePlaceholder = document.createElement('div');
        imagePlaceholder.className = 'article-details-body-image-placeholder';
        imagePlaceholder.textContent = 'Article body image';
        figure.append(imagePlaceholder);
      }

      if (item.caption) {
        const caption = document.createElement('figcaption');
        caption.innerHTML = item.caption;
        figure.append(caption);
      }

      body.append(figure);
    });
  } else if (fields.articleBody?.html) {
    body.innerHTML = fields.articleBody.html;
    if (fields.articleBody.source) moveInstrumentation(fields.articleBody.source, body);
  } else {
    body.classList.add('article-details-body-placeholder');
    body.textContent = 'Add article body text or image blocks';
  }

  inner.append(body);

  section.append(inner);
  return section;
}

export default async function decorate(block) {
  ensureAuthoringContainer(block);

  const resourceData = await getResourceData(block);

  const fields = {
    pageTitle: getTextField(block, 'pageTitle', normalizeJsonFieldValue(resourceData.pageTitle)),
    // Authored value only. jcr:description survives onto a published page as
    // the meta description, but it is NOT the same copy: the legacy import
    // wrote a search snippet into it, and 358 of the 397 imported blogs end in
    // a literal "..." while 304 repeat the body's opening sentence word for
    // word. Reading it back would print that sentence twice on most of the
    // blog, so the hero shows an excerpt only where someone wrote one.
    description: getTextField(block, 'jcr:description'),
    authorName: getTextField(block, 'authorName'),
    articleDate: formatArticleDate(getTextField(block, 'articleDate')),
    thumbnail: getImageField(block, 'thumbnail', resourceData),
    headerImage: getImageField(block, 'headerImage', resourceData),
    articleBody: chooseArticleBody(block, resourceData),
    heroContentPosition: getTextField(block, 'heroContentPosition'),
    heroHeight: getTextField(block, 'heroHeight'),
    heroOverlayOpacity: getTextField(block, 'heroOverlayOpacity'),
    heroGradientOverlay: getTextField(block, 'heroGradientOverlay'),
    heroTextColor: getTextField(block, 'heroTextColor'),
    isAuthoring: hasAuthoringContext(block),
  };
  fields.articleBodyItems = getArticleBodyItems(block, fields.pageTitle, resourceData);

  debugArticleDetails(block, resourceData, fields);

  if (!fields.pageTitle && !fields.articleBodyItems.length && !fields.articleBody?.html) {
    block.replaceChildren(buildMessage('Article Details', 'Add article fields to this block in Universal Editor. These values can also be synced into the backend article record.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.append(buildHero(fields));

  const body = buildBody(fields);
  if (body) fragment.append(body);

  block.replaceChildren(fragment);

  appendHeroTags(block);
}
