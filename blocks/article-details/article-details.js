import { createOptimizedPicture } from '../../scripts/aem.js';

const FIELD_COLUMN_INDEX = {
  pageTitle: 0,
  'jcr:description': 1,
  authorName: 2,
  articleDate: 3,
  thumbnail: 4,
  headerImage: 5,
  articleBody: 6,
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getPropNode(scope, name) {
  return scope.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
}

function getTextField(block, name, fallback = '') {
  const propNode = getPropNode(block, name);
  if (propNode) {
    const anchor = propNode.tagName === 'A' ? propNode : propNode.querySelector('a');
    return normalizeText(anchor?.getAttribute('href') || propNode.textContent) || fallback;
  }

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return fallback;

  const value = getRows(block).map((row) => {
    const cell = [...row.children][columnIndex];
    if (!cell) return '';
    const anchor = cell.querySelector('a');
    return normalizeText(anchor?.getAttribute('href') || cell.textContent);
  }).find(Boolean);

  return value || fallback;
}

function getHtmlField(block, name) {
  const propNode = getPropNode(block, name);
  if (propNode) return propNode.innerHTML.trim();

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return '';

  const value = getRows(block).map((row) => [...row.children][columnIndex]?.innerHTML?.trim() || '').find(Boolean);
  return value || '';
}

function getImageField(block, name) {
  const propNode = getPropNode(block, name);
  if (propNode) {
    const img = propNode.querySelector('img');
    if (img?.src) {
      return {
        src: img.src,
        alt: img.alt || getTextField(block, 'pageTitle', 'Article image'),
      };
    }
  }

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return null;

  const image = getRows(block).map((row) => {
    const img = [...row.children][columnIndex]?.querySelector('img');
    if (!img?.src) return null;
    return {
      src: img.src,
      alt: img.alt || getTextField(block, 'pageTitle', 'Article image'),
    };
  }).find(Boolean);

  return image || null;
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

function buildHeader(fields) {
  const section = document.createElement('section');
  section.className = 'article-details-header';

  const inner = document.createElement('div');
  inner.className = 'article-details-header-inner';

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

function buildFeatureMedia(fields) {
  const image = fields.headerImage || fields.thumbnail;
  if (!image?.src) return null;

  const section = document.createElement('section');
  section.className = 'article-details-feature-media';

  const frame = document.createElement('div');
  frame.className = 'article-details-feature-media-frame';
  frame.append(
    createOptimizedPicture(
      image.src,
      image.alt || fields.pageTitle || 'Article image',
      false,
      [{ width: '750' }, { width: '1600' }],
    ),
  );

  section.append(frame);
  return section;
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

export default function decorate(block) {
  const fields = {
    pageTitle: getTextField(block, 'pageTitle'),
    description: getTextField(block, 'jcr:description'),
    authorName: getTextField(block, 'authorName'),
    articleDate: getTextField(block, 'articleDate'),
    thumbnail: getImageField(block, 'thumbnail'),
    headerImage: getImageField(block, 'headerImage'),
    articleBody: getHtmlField(block, 'articleBody'),
  };

  if (!fields.pageTitle && !fields.articleBody) {
    block.replaceChildren(buildMessage('Article Details', 'Add article fields to this block in Universal Editor. These values can also be synced into the backend article record.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.append(buildHeader(fields));

  const media = buildFeatureMedia(fields);
  if (media) fragment.append(media);

  const body = buildBody(fields);
  if (body) fragment.append(body);

  block.replaceChildren(fragment);
}
