import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  getBlockRows,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
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
    return `${value.href || value.path || value.url || value.reference || value.html || ''}`.trim();
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

function getTextField(block, name, fallback = '') {
  const namedValue = normalizeText(
    readLinkField(block, name).value || readTextField(block, name).value,
  );
  if (namedValue) return namedValue;

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
  if (richField.source) return richField.html;

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return '';

  const value = getRows(block)
    .map((row) => readRichTextField(row, name, { fallbackCell: row.children[columnIndex] }).html)
    .find(Boolean);
  return value || '';
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

function getImageField(block, name, resourceData = {}) {
  const fallbackAlt = getTextField(block, 'pageTitle', 'Article image');
  const namedImage = readImageField(block, name);
  const propImage = imageFromNode(namedImage.cell, fallbackAlt);
  if (namedImage.source && propImage) return propImage;

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

function buildHero(fields) {
  const image = fields.headerImage || fields.thumbnail;

  const section = document.createElement('section');
  section.className = 'article-details-hero';

  if (image?.src) {
    const media = document.createElement('div');
    media.className = 'article-details-hero-media';
    media.append(
      createOptimizedPicture(
        image.src,
        image.alt || fields.pageTitle || 'Article image',
        false,
        [{ width: '750' }, { width: '1600' }],
      ),
    );
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

  if (rawBody && (!richTextBody || (rawBody.includes('<img') && !richTextBody.includes('<img')))) {
    return rawBody;
  }

  return richTextBody;
}

function buildBody(fields) {
  if (!fields.articleBody) return null;

  const section = document.createElement('article');
  section.className = 'article-details-content';

  const inner = document.createElement('div');
  inner.className = 'article-details-prose';

  const body = document.createElement('div');
  body.className = 'article-details-body';
  body.innerHTML = fields.articleBody;
  inner.append(body);

  section.append(inner);
  return section;
}

export default async function decorate(block) {
  const resourceData = await getResourceData(block);

  const fields = {
    pageTitle: getTextField(block, 'pageTitle', normalizeJsonFieldValue(resourceData.pageTitle)),
    description: getTextField(block, 'jcr:description'),
    authorName: getTextField(block, 'authorName'),
    articleDate: getTextField(block, 'articleDate'),
    thumbnail: getImageField(block, 'thumbnail', resourceData),
    headerImage: getImageField(block, 'headerImage', resourceData),
    articleBody: chooseArticleBody(block, resourceData),
  };

  if (!fields.pageTitle && !fields.articleBody) {
    block.replaceChildren(buildMessage('Article Details', 'Add article fields to this block in Universal Editor. These values can also be synced into the backend article record.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.append(buildHero(fields));

  const body = buildBody(fields);
  if (body) fragment.append(body);

  block.replaceChildren(fragment);
}
