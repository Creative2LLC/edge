import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
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

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute?.('data-aue-resource')
      || scope?.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
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

function getArticleBodyItems(block, pageTitle, resourceData = {}) {
  const items = [];
  const isAuthoring = hasAuthoringContext(block);

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
        body.append(text);
        return;
      }

      const figure = document.createElement('figure');
      figure.className = 'article-details-body-image';
      if (item.isPlaceholder) figure.classList.add('article-details-body-placeholder');
      if (item.source) moveInstrumentation(item.source, figure);
      if (item.image?.src) {
        figure.append(
          createOptimizedPicture(
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
    description: getTextField(block, 'jcr:description'),
    authorName: getTextField(block, 'authorName'),
    articleDate: getTextField(block, 'articleDate'),
    thumbnail: getImageField(block, 'thumbnail', resourceData),
    headerImage: getImageField(block, 'headerImage', resourceData),
    articleBody: chooseArticleBody(block, resourceData),
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
}
