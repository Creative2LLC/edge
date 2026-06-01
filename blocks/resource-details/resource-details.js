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
  resourceBody: 6,
  language: 7,
  programs: 8,
  gradeAges: 9,
  tags: 10,
};

const resourceDataCache = new Map();
const TAXONOMY_LABELS = {
  language: {
    en: 'English',
    es: 'Spanish',
  },
  programs: {
    kidsmartz: 'KidSmartz',
    netsmartz: 'NetSmartz',
  },
  gradeAges: {
    'k-2': 'K-2',
    '3-5': '3-5',
    'middle-school': 'Middle School',
    'high-school': 'High School',
  },
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitList(value) {
  const seen = new Set();
  return normalizeText(value)
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = normalizeKey(entry);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function labelFor(group, value) {
  const key = normalizeKey(value);
  return TAXONOMY_LABELS[group]?.[key] || normalizeText(value);
}

function parseTagEntries(value) {
  return splitList(value)
    .map((entry) => entry.split('|')[0].trim())
    .filter(Boolean);
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
  if (Array.isArray(value)) {
    return value.map(normalizeJsonFieldValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return `${value.href || value.path || value.url || value.reference || ''}`.trim();
  }
  return '';
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
  const fallbackAlt = getTextField(block, 'pageTitle', 'Resource image');
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
  wrapper.className = 'resource-details-message';

  const heading = document.createElement('h2');
  heading.className = 'resource-details-message-title';
  heading.textContent = title;
  wrapper.append(heading);

  if (description) {
    const text = document.createElement('p');
    text.className = 'resource-details-message-copy';
    text.textContent = description;
    wrapper.append(text);
  }

  return wrapper;
}

function buildMeta(authorName, articleDate) {
  const values = [authorName, articleDate].filter(Boolean);
  if (!values.length) return null;

  const meta = document.createElement('div');
  meta.className = 'resource-details-meta';

  values.forEach((value, index) => {
    const item = document.createElement('span');
    item.className = 'resource-details-meta-item';
    item.textContent = value;
    meta.append(item);

    if (index < values.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'resource-details-meta-separator';
      separator.textContent = '|';
      meta.append(separator);
    }
  });

  return meta;
}

function buildPillGroup(entries, className) {
  if (!entries.length) return null;

  const wrap = document.createElement('div');
  wrap.className = className;

  entries.forEach((label) => {
    const pill = document.createElement('span');
    pill.className = 'resource-details-pill';
    pill.textContent = label;
    wrap.append(pill);
  });

  return wrap;
}

function buildTaxonomy(fields) {
  const entries = [
    fields.language ? labelFor('language', fields.language) : '',
    ...splitList(fields.programs).map((program) => labelFor('programs', program)),
    ...splitList(fields.gradeAges).map((gradeAge) => labelFor('gradeAges', gradeAge)),
  ].filter(Boolean);

  return buildPillGroup(entries, 'resource-details-taxonomy');
}

function buildTags(fields) {
  return buildPillGroup(parseTagEntries(fields.tags), 'resource-details-tags');
}

function buildHero(fields) {
  const image = fields.headerImage || fields.thumbnail;

  const section = document.createElement('section');
  section.className = 'resource-details-hero';

  if (image?.src) {
    const media = document.createElement('div');
    media.className = 'resource-details-hero-media';
    media.append(
      createOptimizedPicture(
        image.src,
        image.alt || fields.pageTitle || 'Resource image',
        false,
        [{ width: '750' }, { width: '1600' }],
      ),
    );
    section.append(media);
  } else {
    section.classList.add('is-without-image');
  }

  const overlay = document.createElement('div');
  overlay.className = 'resource-details-hero-overlay';
  section.append(overlay);

  const inner = document.createElement('div');
  inner.className = 'resource-details-hero-content';

  const taxonomy = buildTaxonomy(fields);
  if (taxonomy) inner.append(taxonomy);

  const title = document.createElement('h1');
  title.className = 'resource-details-title';
  title.textContent = fields.pageTitle;
  inner.append(title);

  const meta = buildMeta(fields.authorName, fields.articleDate);
  if (meta) inner.append(meta);

  if (fields.description) {
    const excerpt = document.createElement('p');
    excerpt.className = 'resource-details-excerpt';
    excerpt.textContent = fields.description;
    inner.append(excerpt);
  }

  const tags = buildTags(fields);
  if (tags) inner.append(tags);

  section.append(inner);
  return section;
}

function buildBody(fields) {
  if (!fields.resourceBody) return null;

  const section = document.createElement('article');
  section.className = 'resource-details-content';

  const inner = document.createElement('div');
  inner.className = 'resource-details-prose';

  const body = document.createElement('div');
  body.className = 'resource-details-body';
  body.innerHTML = fields.resourceBody;
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
    resourceBody: getHtmlField(block, 'resourceBody'),
    language: getTextField(block, 'language', normalizeJsonFieldValue(resourceData.language)),
    programs: getTextField(block, 'programs', normalizeJsonFieldValue(resourceData.programs)),
    gradeAges: getTextField(
      block,
      'gradeAges',
      normalizeJsonFieldValue(resourceData.gradeAges || resourceData.grade_ages),
    ),
    tags: getTextField(block, 'tags', normalizeJsonFieldValue(resourceData.tags)),
  };

  if (!fields.pageTitle && !fields.resourceBody) {
    block.replaceChildren(buildMessage('Resource Details', 'Add resource fields to this block in Universal Editor. These values can also be synced into the backend resource record.'));
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.append(buildHero(fields));

  const body = buildBody(fields);
  if (body) fragment.append(body);

  block.replaceChildren(fragment);
}
