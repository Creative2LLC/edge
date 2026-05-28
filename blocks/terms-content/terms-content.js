import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  title: 0,
  body: 1,
  topMargin: 2,
  topPadding: 3,
  bottomPadding: 4,
  contentWidth: 5,
};

const RESOURCE_FIELD_NAMES = [
  'title',
  'body',
  'topMargin',
  'topPadding',
  'bottomPadding',
  'contentWidth',
];
const resourceDataCache = new Map();

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getExplicitFieldProp(cell) {
  return cell?.matches?.('[data-aue-prop], [data-richtext-prop]')
    ? cell
    : cell?.querySelector?.('[data-aue-prop], [data-richtext-prop]');
}

function getIndexedFallbackCell(block, name) {
  const row = getRows(block)[FIELD_INDEX[name]];
  if (!row) return null;
  const cell = row.children.length === 2 ? row.children[1] : row.children[0] || row;
  const explicitField = getExplicitFieldProp(cell);
  const explicitName = explicitField?.getAttribute('data-aue-prop')
    || explicitField?.getAttribute('data-richtext-prop')
    || '';

  if (explicitName && explicitName !== name) return null;

  return cell;
}

function getTextField(block, name) {
  return readTextField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
}

function getRichField(block, name) {
  return readRichTextField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
}

function normalizeLengthValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?]+)/);
  return match ? match[1] : '';
}

function getParentResourcePath(resourcePath) {
  if (!resourcePath) return '';
  const segments = resourcePath.replace(/\/+$/g, '').split('/');
  if (segments.length <= 1) return '';
  segments.pop();
  return segments.join('/');
}

function getCandidateResourcePaths(block) {
  const resources = [
    block.getAttribute('data-aue-resource') || '',
    ...[...block.querySelectorAll('[data-aue-resource]')]
      .map((node) => node.getAttribute('data-aue-resource') || ''),
  ];
  const paths = resources
    .map(resourcePathFromUrn)
    .filter(Boolean)
    .flatMap((resourcePath) => [resourcePath, getParentResourcePath(resourcePath)])
    .filter(Boolean);

  return [...new Set(paths)];
}

async function fetchResourceData(resourcePath) {
  if (!resourcePath) return {};
  if (resourceDataCache.has(resourcePath)) return resourceDataCache.get(resourcePath);

  const pendingData = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return {};
      return response.json();
    })
    .catch(() => ({}));

  resourceDataCache.set(resourcePath, pendingData);
  return pendingData;
}

function normalizeResourceValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeResourceValue(entry)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    return String(
      value.html
        || value.value
        || value.text
        || value.markup
        || value.content
        || value.richText
        || '',
    ).trim();
  }
  return String(value).trim();
}

function findResourceFieldValue(data, name, depth = 0) {
  if (!data || typeof data !== 'object' || depth > 4) return '';

  const direct = normalizeResourceValue(data[name]);
  if (direct) return direct;

  const containers = [
    data.properties,
    data.fields,
    data.model,
    data.data,
    data.elements,
  ];

  for (let i = 0; i < containers.length; i += 1) {
    const value = normalizeResourceValue(containers[i]?.[name]);
    if (value) return value;
  }

  const entries = Object.values(data);
  for (let i = 0; i < entries.length; i += 1) {
    const value = findResourceFieldValue(entries[i], name, depth + 1);
    if (value) return value;
  }

  return '';
}

function dataHasTermsFields(data) {
  return RESOURCE_FIELD_NAMES.some((fieldName) => findResourceFieldValue(data, fieldName));
}

async function getResourceData(block) {
  const resourcePaths = getCandidateResourcePaths(block);
  let fallbackData = null;

  for (let i = 0; i < resourcePaths.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const data = await fetchResourceData(resourcePaths[i]);
    if (!fallbackData && data) fallbackData = data;
    if (dataHasTermsFields(data)) return data;
  }

  return fallbackData || {};
}

function hasRenderableContent(element) {
  if (!element) return false;
  if (element.textContent.trim()) return true;
  return Boolean(element.querySelector('img, picture, video, table, ul, ol, iframe, br'));
}

function hasFieldContent(field) {
  return Boolean(field?.html || field?.text || hasRenderableContent(field?.source || field?.cell));
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function moveText(field, target, fallbackText = '') {
  if (field.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    if (!hasRenderableContent(target) && fallbackText) target.textContent = fallbackText;
    return;
  }

  target.textContent = field.value || fallbackText || '';
}

function appendHtmlValue(value, target) {
  const html = normalizeResourceValue(value);
  if (!html) return;

  target.innerHTML = html;
}

function moveHtml(field, target, fallbackHtml = '') {
  if (field.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    if (!hasRenderableContent(target) && fallbackHtml) target.innerHTML = fallbackHtml;
    return;
  }

  target.innerHTML = field.html || fallbackHtml || '';
}

function applySpacing(block, resourceData = {}) {
  const topMargin = normalizeLengthValue(
    getTextField(block, 'topMargin').value || findResourceFieldValue(resourceData, 'topMargin'),
  );
  const topPadding = normalizeLengthValue(
    getTextField(block, 'topPadding').value || findResourceFieldValue(resourceData, 'topPadding'),
  );
  const bottomPadding = normalizeLengthValue(
    getTextField(block, 'bottomPadding').value || findResourceFieldValue(resourceData, 'bottomPadding'),
  );
  const contentWidth = normalizeLengthValue(
    getTextField(block, 'contentWidth').value || findResourceFieldValue(resourceData, 'contentWidth'),
  );

  if (topMargin) block.style.setProperty('--terms-content-top-margin', topMargin);
  if (topPadding) block.style.setProperty('--terms-content-top-padding', topPadding);
  if (bottomPadding) block.style.setProperty('--terms-content-bottom-padding', bottomPadding);
  if (contentWidth) block.style.setProperty('--terms-content-max-width', contentWidth);
}

function buildPlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'terms-content-placeholder';

  const heading = document.createElement('p');
  heading.className = 'terms-content-placeholder-title';
  heading.textContent = 'Add terms content';

  const body = document.createElement('p');
  body.className = 'terms-content-placeholder-body';
  body.textContent = 'Use Universal Editor to add a title and rich text body.';

  placeholder.append(heading, body);
  return placeholder;
}

export default async function decorate(block) {
  const resourceData = await getResourceData(block);
  applySpacing(block, resourceData);

  const titleField = getTextField(block, 'title');
  const bodyField = getRichField(block, 'body');
  const isAuthoring = hasAuthoringContext(block);
  const resourceTitle = findResourceFieldValue(resourceData, 'title');
  const resourceBody = findResourceFieldValue(resourceData, 'body');

  const inner = document.createElement('div');
  inner.className = 'terms-content-inner';

  if (titleField.value || titleField.source || resourceTitle) {
    const title = document.createElement('h1');
    title.className = 'terms-content-title';
    if (titleField.source || titleField.value) moveText(titleField, title, resourceTitle);
    else title.textContent = resourceTitle;
    inner.append(title);
  }

  if (hasFieldContent(bodyField) || resourceBody) {
    const body = document.createElement('div');
    body.className = 'terms-content-body';
    if (hasFieldContent(bodyField)) moveHtml(bodyField, body, resourceBody);
    else appendHtmlValue(resourceBody, body);
    if (hasRenderableContent(body)) inner.append(body);
  }

  if (!inner.childElementCount && isAuthoring) {
    inner.append(buildPlaceholder());
  }

  block.replaceChildren(inner);
}
