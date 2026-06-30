import { moveAttributes, decorateInlineColors } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { applyAnimatedMarkers } from '../../scripts/animated-marker.js';

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?(#.*)?$/i;
const IMAGE_EXT_RE = /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?(#.*)?$/i;
const AEM_PUBLISH_ASSET_ORIGIN = 'https://publish-p171653-e1855116.adobeaemcloud.com';
const HERO_RESOURCE_FIELD_NAMES = [
  'content_text',
  'text',
  'content_textColor',
  'text_color',
  'content_textHtml',
  'text_html',
  'content_textHtmlClass',
  'textHtmlClass',
  'markerTerms',
  'markerColor',
  'markerStyle',
];
const resourceDataCache = new Map();

const HERO_FIELD_INDEX = {
  variant: 0,
  media_image: 1,
  media_imageAlt: 2,
  media_featuredImage: 3,
  media_featuredImageAlt: 4,
  media_video: 5,
  media_overlayOpacity: 6,
  media_gradientOverlay: 7,
  content_height: 8,
  content_position: 9,
  content_showBreadcrumbs: 10,
  content_breadcrumbs: 11,
  content_text: 12,
  content_textColor: 13,
  content_textHtml: 14,
  content_textHtmlClass: 15,
  action_1Text: 16,
  action_1Link: 17,
  action_1Style: 18,
  action_2Text: 19,
  action_2Link: 20,
  action_2Style: 21,
  action_3Text: 22,
  action_3Link: 23,
  action_3Style: 24,
  panel_title: 25,
  panel_text: 26,
  panel_primaryText: 27,
  panel_primaryLink: 28,
  panel_secondaryText: 29,
  panel_secondaryLink: 30,
  panel_footerText: 31,
  markerTerms: 32,
  markerColor: 33,
  markerStyle: 34,
};

function isVideoUrl(value) {
  if (!value || typeof value !== 'string') return false;
  return VIDEO_EXT_RE.test(value.trim());
}

function isDamAssetUrl(value) {
  return typeof value === 'string' && /\/content\/dam\//i.test(value.trim());
}

function isPossibleVideoUrl(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return false;
  if (isVideoUrl(trimmed)) return true;
  if (isDamAssetUrl(trimmed) && !IMAGE_EXT_RE.test(trimmed)) return true;
  return false;
}

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

function getBlockResourcePath(block) {
  const resource = block.getAttribute('data-aue-resource')
    || block.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';
  return resourcePathFromUrn(resource);
}

function getParentResourcePath(resourcePath) {
  if (!resourcePath) return '';
  const segments = resourcePath.replace(/\/+$/g, '').split('/');
  if (segments.length <= 1) return '';
  segments.pop();
  return segments.join('/');
}

function getCandidateResourcePaths(block) {
  const pagePath = window.location.pathname
    .replace(/\.html$/i, '')
    .replace(/\/+$/g, '');
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

  if (pagePath.startsWith('/content/')) {
    paths.push(pagePath);
  }

  return [...new Set(paths.map((path) => path.replace(/\.html$/i, '')))];
}

async function fetchResourceData(resourcePath) {
  if (!resourcePath || !resourcePath.startsWith('/content/')) return {};
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

function findResourceFieldValue(data, names, depth = 0) {
  if (!data || typeof data !== 'object' || depth > 4) return '';

  const fieldNames = Array.isArray(names) ? names : [names];
  for (let i = 0; i < fieldNames.length; i += 1) {
    const direct = normalizeResourceValue(data[fieldNames[i]]);
    if (direct) return direct;
  }

  const containers = [
    data.properties,
    data.fields,
    data.model,
    data.data,
    data.elements,
  ];

  for (let i = 0; i < containers.length; i += 1) {
    for (let j = 0; j < fieldNames.length; j += 1) {
      const value = normalizeResourceValue(containers[i]?.[fieldNames[j]]);
      if (value) return value;
    }
  }

  const entries = Object.values(data);
  for (let i = 0; i < entries.length; i += 1) {
    const value = findResourceFieldValue(entries[i], fieldNames, depth + 1);
    if (value) return value;
  }

  return '';
}

function dataHasHeroFields(data) {
  return HERO_RESOURCE_FIELD_NAMES.some((fieldName) => findResourceFieldValue(data, fieldName));
}

async function getHeroResourceData(block) {
  const resourcePaths = getCandidateResourcePaths(block);
  let fallbackData = null;

  for (let i = 0; i < resourcePaths.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const data = await fetchResourceData(resourcePaths[i]);
    if (!fallbackData && data) fallbackData = data;
    if (dataHasHeroFields(data)) return data;
  }

  return fallbackData || {};
}

function normalizeVideoFieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => normalizeVideoFieldValue(item)).find(Boolean) || '';
  }
  if (typeof value === 'object') {
    const aemPath = value[['_path'].join('')];
    const direct = value.href
      || value.path
      || value.url
      || value.src
      || value.fileReference
      || aemPath
      || '';
    if (direct) return normalizeVideoFieldValue(direct);
    return Object.values(value)
      .map((item) => normalizeVideoFieldValue(item))
      .find(Boolean)
      || '';
  }
  return '';
}

async function getVideoUrlFromResourceJson(block) {
  const resourcePath = getBlockResourcePath(block);
  if (!resourcePath) return '';

  try {
    const response = await fetch(`${resourcePath}.json`);
    if (!response.ok) return '';
    const data = await response.json();
    return normalizeVideoFieldValue(data.media_video || data.video);
  } catch (error) {
    return '';
  }
}

function isAemPageHost(hostname = window.location.hostname) {
  return hostname.endsWith('.aem.page') || hostname.endsWith('.aem.live');
}

function isAemAuthorHost(hostname = window.location.hostname) {
  return hostname.includes('adobeaemcloud.com');
}

// True inside Universal Editor. Unlike isAemAuthorHost(), this doesn't depend on
// the hostname — in UE the page is rendered from the Edge Delivery origin, not
// adobeaemcloud.com, so the only reliable signal is the UE instrumentation.
function isUniversalEditor() {
  return Boolean(document.querySelector('[data-aue-resource]'));
}

function getAssetOrigin() {
  if (isAemAuthorHost()) {
    return window.location.origin;
  }
  return AEM_PUBLISH_ASSET_ORIGIN;
}

function resolveVideoPlaybackUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.origin);
    if (!url.pathname.startsWith('/content/dam/')) return raw;
    if (url.hostname.includes('adobeaemcloud.com')) return url.toString();
    if (url.origin === window.location.origin || isAemPageHost(url.hostname)) {
      return new URL(`${url.pathname}${url.search}${url.hash}`, getAssetOrigin()).toString();
    }
  } catch (error) {
    if (raw.startsWith('/content/dam/')) {
      return `${getAssetOrigin()}${raw}`;
    }
  }

  return raw;
}

function getRowCells(block) {
  return [...block.querySelectorAll(':scope > div')]
    .map((row) => row.children[0] || row)
    .filter(Boolean);
}

function getHeroFieldCell(block, name) {
  const index = HERO_FIELD_INDEX[name];
  return Number.isInteger(index) ? getRowCells(block)[index] || null : null;
}

function getCellText(cell) {
  return cell?.textContent?.trim() || '';
}

function isExactChoiceCell(cell, allowed) {
  const value = getCellText(cell).toLowerCase();
  return allowed.includes(value);
}

function getContentCell(block) {
  return getRowCells(block).find((cell) => cell.querySelector('h1, h2, h3, h4, h5, h6'))
    || null;
}

function getActionStyleCellAt(block, name) {
  const cell = getHeroFieldCell(block, name);
  if (cell && isExactChoiceCell(cell, ['outline', 'solid', 'inverted'])) return cell;
  return null;
}

function getMediaCell(block) {
  return getRowCells(block).find((cell) => (
    cell.querySelector('picture')
      || [...cell.querySelectorAll('a[href]')].some((link) => isVideoUrl(link.getAttribute('href')))
  )) || null;
}

function getChoiceFromCell(cell, allowed) {
  if (!cell) return '';
  const accepted = new Set(allowed);
  const textNodes = [...cell.querySelectorAll('p, div, span')]
    .map((node) => node.textContent.trim().toLowerCase())
    .filter(Boolean);
  return textNodes.find((value) => accepted.has(value)) || '';
}

function getNumberFromCell(cell) {
  if (!cell) return '';
  const textNodes = [...cell.querySelectorAll('p, div, span')]
    .map((node) => node.textContent.trim())
    .filter(Boolean);
  return textNodes.find((value) => /^(?:100|[1-9]?[0-9])$/.test(value)) || '';
}

function normalizeHeight(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^[0-9]*\.?[0-9]+$/.test(trimmed)) return `${trimmed}rem`;
  if (/^[0-9]*\.?[0-9]+rem$/.test(trimmed)) return trimmed;
  return null;
}

function getFieldValue(block, nameOrNames) {
  const field = readTextField(block, nameOrNames);
  if (field.source) {
    return {
      source: field.source,
      value: field.value,
    };
  }

  const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
  const hasName = (...candidates) => candidates.some((candidate) => names.includes(candidate));
  let fallbackCell = null;
  let fallbackValue = '';

  if (hasName('variant')) {
    fallbackCell = getRowCells(block).find((cell) => (
      isExactChoiceCell(cell, ['default', 'homepage'])
    ));
    fallbackValue = getCellText(fallbackCell);
  } else if (hasName('media_overlayOpacity', 'overlayOpacity')) {
    fallbackCell = getMediaCell(block);
    fallbackValue = getNumberFromCell(fallbackCell);
  } else if (hasName('media_gradientOverlay', 'gradientOverlay')) {
    fallbackCell = getMediaCell(block);
    fallbackValue = getChoiceFromCell(fallbackCell, ['show', 'hide']);
  } else if (hasName('content_position', 'contentPosition')) {
    fallbackCell = getContentCell(block);
    fallbackValue = getChoiceFromCell(fallbackCell, ['left', 'center', 'right']);
  } else if (hasName('content_showBreadcrumbs', 'showBreadcrumbs')) {
    fallbackCell = getContentCell(block);
    fallbackValue = getChoiceFromCell(fallbackCell, ['show', 'hide']);
  } else if (hasName('action_1Style', 'action_2Style', 'action_3Style')) {
    const styleName = names.find((candidate) => (
      candidate === 'action_1Style'
        || candidate === 'action_2Style'
        || candidate === 'action_3Style'
    ));
    fallbackCell = getActionStyleCellAt(block, styleName);
    fallbackValue = getChoiceFromCell(fallbackCell, ['outline', 'solid', 'inverted'])
      || fallbackCell?.textContent.trim()
      || '';
  }

  if (fallbackValue) {
    return {
      source: fallbackCell,
      value: fallbackValue,
    };
  }

  return {
    source: null,
    value: '',
  };
}

function getHeroTextFieldValue(block, nameOrNames, fallbackFieldName, fallbackValue = '') {
  const field = readTextField(block, nameOrNames, {
    fallbackCell: getHeroFieldCell(block, fallbackFieldName),
  });

  return {
    source: field.source,
    cell: field.cell,
    value: field.value || fallbackValue || '',
  };
}

function moveFieldBinding(from, to) {
  if (!from || !to) return;
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-prop')
        || attr.startsWith('data-richtext-prop')
        || attr === 'data-aue-label'
        || attr.startsWith('data-richtext-')),
  );
}

function hasRenderableContent(element) {
  if (!element) return false;
  if (element.textContent.trim()) return true;
  return Boolean(element.querySelector?.('img, picture, video, table, ul, ol, iframe, br'));
}

function hasRichFieldContent(field) {
  return Boolean(field?.html || field?.text || hasRenderableContent(field?.source || field?.cell));
}

function getFieldHtml(field) {
  return (field?.html || field?.cell?.innerHTML || field?.source?.innerHTML || '').trim();
}

function appendHtmlValue(value, target) {
  const html = normalizeResourceValue(value);
  if (!html) return;
  target.innerHTML = html;
}

function moveRichField(field, target, fallbackHtml = '') {
  if (field.source) {
    moveFieldBinding(field.source, target);
    while (field.source.firstChild) {
      target.append(field.source.firstChild);
    }
    if (!hasRenderableContent(target) && fallbackHtml) {
      appendHtmlValue(fallbackHtml, target);
    }
    return;
  }

  appendHtmlValue(field.html || fallbackHtml, target);
}

function normalizeMainRichTextStructure(richText) {
  if (!richText || richText.querySelector('h1, h2, h3, h4, h5, h6')) return;

  const firstContentNode = [...richText.childNodes].find((node) => (
    node.nodeType === Node.TEXT_NODE ? node.textContent.trim() : hasRenderableContent(node)
  ));
  if (!firstContentNode) return;

  if (firstContentNode.nodeType === Node.TEXT_NODE) {
    const heading = document.createElement('h1');
    heading.textContent = firstContentNode.textContent.trim();
    firstContentNode.replaceWith(heading);
    return;
  }

  if (firstContentNode.tagName === 'P') {
    const heading = document.createElement('h1');
    [...firstContentNode.attributes].forEach((attr) => heading.setAttribute(attr.name, attr.value));
    while (firstContentNode.firstChild) heading.append(firstContentNode.firstChild);
    firstContentNode.replaceWith(heading);
  }
}

function getLinkFieldValue(block, name) {
  const textField = getFieldValue(block, name);
  const linkField = readLinkField(block, name);
  const source = linkField.source || linkField.cell || textField.source;
  if (!source && !linkField.value) return { source: null, value: '', href: '' };
  const anchor = source?.tagName === 'A' ? source : source?.querySelector('a');
  return {
    source,
    value: textField.value || linkField.value,
    href: anchor?.href || linkField.value,
  };
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !allowed.includes(normalized)) return fallback;
  return normalized;
}

function getDirectRow(block, element) {
  let current = element;
  while (current && current.parentElement && current.parentElement !== block) {
    current = current.parentElement;
  }
  if (current && current.parentElement === block) return current;
  return null;
}

function isIgnoredFallbackText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return true;

  const ignoredTextValues = new Set([
    'default',
    'homepage',
    'show',
    'hide',
    'left',
    'center',
    'right',
  ]);
  if (ignoredTextValues.has(normalized.toLowerCase())) return true;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized)) return true;
  if (/^\d+(\.\d+)?(rem|px|%)?$/.test(normalized)) return true;

  return false;
}

function getFallbackTextNodes(block) {
  const contentCell = getContentCell(block) || block;
  return [...contentCell.querySelectorAll('h1, h2, h3, h4, h5, h6, p')]
    .filter((node) => {
      if (node.hasAttribute('data-aue-prop') || node.hasAttribute('data-richtext-prop')) return false;
      if (node.closest('[data-aue-prop], [data-richtext-prop], picture, video')) return false;
      return !isIgnoredFallbackText(node.textContent);
    });
}

function isHeadingNode(node) {
  return /^H[1-6]$/i.test(node?.tagName || '');
}

function isClassArtifactNode(node, followingNodes) {
  const text = node?.textContent?.trim() || '';
  return /^h\d{2,}$/i.test(text) && followingNodes.some((candidate) => (
    candidate.tagName === 'P' && !isIgnoredFallbackText(candidate.textContent)
  ));
}

function getFallbackHtmlText(block) {
  const nodes = getFallbackTextNodes(block);
  if (!nodes.some(isHeadingNode)) return '';

  let hasSeenHeading = false;
  const bodyNodes = nodes.filter((node) => {
    if (isHeadingNode(node)) {
      hasSeenHeading = true;
      return false;
    }

    return hasSeenHeading && node.tagName === 'P';
  });

  const filteredBodyNodes = bodyNodes.filter((node, index) => (
    !isClassArtifactNode(node, bodyNodes.slice(index + 1))
  ));

  return filteredBodyNodes.map((node) => node.outerHTML).join('');
}
function buildHtmlText(block, fallbackHtml = '', fallbackClass = '') {
  const field = readRichTextField(block, ['content_textHtml', 'text_html']);
  const hasField = hasRichFieldContent(field);
  const resolvedFallbackHtml = fallbackHtml || getFallbackHtmlText(block);
  if (!hasField && !resolvedFallbackHtml) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'hero-text-html';
  if (hasField) moveRichField(field, wrapper, resolvedFallbackHtml);
  else appendHtmlValue(resolvedFallbackHtml, wrapper);
  if (!hasRenderableContent(wrapper)) return null;

  const { value: classValue } = getFieldValue(block, ['content_textHtmlClass', 'textHtmlClass']);
  const resolvedClassValue = classValue || fallbackClass;
  if (resolvedClassValue) {
    const classes = resolvedClassValue.split(/\s+/).filter(Boolean);
    if (classes.length) wrapper.classList.add(...classes);
  }
  return wrapper;
}

function normalizeHexColor(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed) || /^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function readTextColor(block, fallbackValue = '') {
  const rowsToRemove = [];
  let rawValue = fallbackValue || null;

  const textColorField = getFieldValue(block, ['content_textColor', 'text_color']);
  const instrumented = textColorField.source;
  // HEROCOLORDBG
  const dbgProps = [...block.querySelectorAll('[data-aue-prop],[data-richtext-prop]')]
    .map((n) => n.getAttribute('data-aue-prop') || n.getAttribute('data-richtext-prop'));
  // eslint-disable-next-line no-console, max-len
  console.log('[HEROCOLORDBG] readTextColor src/val/fallback/props', !!instrumented, textColorField.value, fallbackValue, dbgProps);
  if (instrumented) {
    rawValue = textColorField.value;
    const row = getDirectRow(block, instrumented);
    if (row) {
      rowsToRemove.push(row);
    } else {
      const paragraph = instrumented.closest('p');
      rowsToRemove.push(paragraph || instrumented);
    }
  } else {
    block.querySelectorAll(':scope > div').forEach((row) => {
      if (row.children.length !== 2) return;
      const key = row.children[0].textContent.trim().toLowerCase();
      if (['text color', 'text color (hex)', 'text colour', 'text colour (hex)'].includes(key)) {
        rawValue = row.children[1].textContent;
        rowsToRemove.push(row);
      }
    });
  }

  const editor = isUniversalEditor();
  rowsToRemove.forEach((row) => {
    // In the editor, keep the instrumented field node (hidden) instead of
    // removing it. That lets Universal Editor patch it in place — without it,
    // a Text Color edit can't find its target and forces a full page reload.
    if (editor) row.hidden = true;
    else row.remove();
  });
  return {
    color: normalizeHexColor(rawValue) || normalizeHexColor(fallbackValue),
    source: instrumented || null,
    rows: rowsToRemove,
  };
}

function readMarkerConfig(block, resourceData) {
  return {
    terms: getHeroTextFieldValue(
      block,
      ['markerTerms', 'marker_terms', 'highlightText'],
      'markerTerms',
      findResourceFieldValue(resourceData, ['markerTerms', 'marker_terms', 'highlightText']),
    ).value,
    color: getHeroTextFieldValue(
      block,
      ['markerColor', 'marker_color', 'highlightMarkerColor'],
      'markerColor',
      findResourceFieldValue(resourceData, ['markerColor', 'marker_color', 'highlightMarkerColor']),
    ).value,
    style: getHeroTextFieldValue(
      block,
      ['markerStyle', 'marker_style', 'highlightMarkerStyle'],
      'markerStyle',
      findResourceFieldValue(resourceData, ['markerStyle', 'marker_style', 'highlightMarkerStyle']),
    ).value,
  };
}

function readHeight(block) {
  const rowsToRemove = [];
  let rawValue = null;

  const heightField = getFieldValue(block, ['content_height', 'height']);
  const instrumented = heightField.source;
  if (instrumented) {
    rawValue = heightField.value;
    const row = getDirectRow(block, instrumented);
    if (row) {
      rowsToRemove.push(row);
    } else {
      const paragraph = instrumented.closest('p');
      rowsToRemove.push(paragraph || instrumented);
    }
  } else {
    block.querySelectorAll(':scope > div').forEach((row) => {
      if (row.children.length !== 2) return;
      const key = row.children[0].textContent.trim().toLowerCase();
      if (['height', 'hero height', 'height (rem)', 'hero height (rem)'].includes(key)) {
        rawValue = row.children[1].textContent;
        rowsToRemove.push(row);
      }
    });
  }

  rowsToRemove.forEach((row) => row.remove());
  return normalizeHeight(rawValue);
}

function formatPathSegment(segment) {
  if (!segment) return '';
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch (e) {
    decoded = segment;
  }
  const cleaned = decoded.replace(/\.html$/i, '').replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCurrentPathSegments() {
  return window.location.pathname
    .replace(/\/$/, '')
    .split('/')
    .filter(Boolean);
}

function buildCrumbHref(pathSegments, index) {
  if (index < 0 || index >= pathSegments.length) return '';
  return `/${pathSegments.slice(0, index + 1).join('/')}`;
}

function buildPathBreadcrumbs() {
  const pathSegments = getCurrentPathSegments();
  return pathSegments
    .map((segment, index) => ({
      label: formatPathSegment(segment),
      href: index < pathSegments.length - 1 ? buildCrumbHref(pathSegments, index) : '',
    }))
    .filter((crumb) => crumb.label);
}

function parseTrailItem(item) {
  if (!item) return null;
  const [labelPart, hrefPart] = item.split('::').map((part) => part.trim());
  if (!labelPart) return null;
  return {
    label: labelPart,
    href: hrefPart || '',
  };
}

function parseBreadcrumbTrail(value) {
  if (!value) return [];
  return value
    .split(/[>|]/)
    .map((item) => parseTrailItem(item.trim()))
    .filter(Boolean);
}

function buildConfiguredBreadcrumbs(items) {
  const pathSegments = getCurrentPathSegments();
  return items.map((item, index) => {
    if (item.href) return item;
    if (index >= items.length - 1) return item;
    if (index >= pathSegments.length) return item;
    return {
      ...item,
      href: buildCrumbHref(pathSegments, index),
    };
  });
}

function normalizeBreadcrumbHref(href) {
  if (!href) return '';
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (e) {
    return '';
  }
}

const breadcrumbHrefExistsCache = new Map();

async function probeBreadcrumbUrl(url) {
  try {
    const headResponse = await fetch(url, { method: 'HEAD' });
    if (headResponse.ok) return true;
    if (headResponse.status === 405 || headResponse.status === 501) {
      const getResponse = await fetch(url, { method: 'GET' });
      return getResponse.ok;
    }
  } catch (e) {
    // Ignore network/probe failures and treat as unresolved.
  }
  return false;
}

async function doesBreadcrumbHrefExist(href) {
  const normalizedHref = normalizeBreadcrumbHref(href);
  if (!normalizedHref) return false;

  const absolute = new URL(normalizedHref, window.location.origin);
  const cacheKey = absolute.toString();
  if (breadcrumbHrefExistsCache.has(cacheKey)) {
    return breadcrumbHrefExistsCache.get(cacheKey);
  }

  const basePath = absolute.pathname.replace(/\/$/, '');
  const candidates = new Set([
    absolute.toString(),
  ]);

  if (!absolute.pathname.endsWith('/')) {
    const withSlash = new URL(`${absolute.pathname}/${absolute.search}${absolute.hash}`, absolute.origin);
    candidates.add(withSlash.toString());
  }

  if (basePath && !basePath.endsWith('.html')) {
    const withHtml = new URL(`${basePath}.html${absolute.search}${absolute.hash}`, absolute.origin);
    candidates.add(withHtml.toString());
  }

  const checks = await Promise.all(
    [...candidates].map((candidate) => probeBreadcrumbUrl(candidate)),
  );
  const exists = checks.some(Boolean);
  breadcrumbHrefExistsCache.set(cacheKey, exists);
  return exists;
}

async function buildBreadcrumbs(block) {
  const showBreadcrumbs = normalizeChoice(
    getFieldValue(block, ['content_showBreadcrumbs', 'showBreadcrumbs']).value,
    ['show', 'hide'],
    'hide',
  );
  if (showBreadcrumbs !== 'show') return null;

  const configuredTrail = getFieldValue(block, ['content_breadcrumbs', 'breadcrumbs']).value;
  const parsedItems = parseBreadcrumbTrail(configuredTrail);
  const crumbs = parsedItems.length
    ? buildConfiguredBreadcrumbs(parsedItems)
    : buildPathBreadcrumbs();
  if (!crumbs.length) return null;

  const resolvedCrumbs = crumbs.map((crumb, index) => ({
    label: crumb.label,
    href: normalizeBreadcrumbHref(crumb.href),
    isCurrent: index === crumbs.length - 1,
  }));

  const availableHrefs = await Promise.all(
    resolvedCrumbs.map((crumb) => {
      if (crumb.isCurrent || !crumb.href) return Promise.resolve(false);
      return doesBreadcrumbHrefExist(crumb.href);
    }),
  );

  const nav = document.createElement('nav');
  nav.className = 'hero-breadcrumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');

  const list = document.createElement('ol');

  resolvedCrumbs.forEach((crumb, index) => {
    const item = document.createElement('li');
    if (crumb.isCurrent) item.classList.add('is-current');

    const shouldLink = !crumb.isCurrent && availableHrefs[index] && crumb.href;
    if (shouldLink) {
      const link = document.createElement('a');
      link.href = crumb.href;
      link.textContent = crumb.label;
      item.append(link);
    } else {
      const label = document.createElement('span');
      label.textContent = crumb.label;
      item.append(label);
    }
    list.append(item);

    if (index < resolvedCrumbs.length - 1) {
      const separator = document.createElement('li');
      separator.className = 'separator';
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '>';
      list.append(separator);
    }
  });

  nav.append(list);
  return nav;
}

function buildInstrumentedText(field, tagName, className) {
  if (!field.source && !field.value) return null;
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (field.source) {
    moveFieldBinding(field.source, element);
    if (field.source.childNodes.length) {
      while (field.source.firstChild) {
        element.append(field.source.firstChild);
      }
    } else {
      element.textContent = field.value;
    }
  } else {
    element.textContent = field.value;
  }
  return element;
}

function applyAccentBrackets(richText) {
  const original = richText.innerHTML;
  const replaced = original.replace(
    /\[([^\]<>]+)\]/g,
    '<span class="hero-accent">$1</span>',
  );
  if (replaced !== original) richText.innerHTML = replaced;
}

function buildMainRichText(block, fallbackHtml = '') {
  const field = readRichTextField(block, ['content_text', 'text']);
  const hasField = hasRichFieldContent(field);
  if (hasField || fallbackHtml) {
    const richText = document.createElement('div');
    richText.className = 'hero-richtext';
    if (hasField) moveRichField(field, richText, fallbackHtml);
    else appendHtmlValue(fallbackHtml, richText);
    normalizeMainRichTextStructure(richText);
    if (!hasRenderableContent(richText)) return null;
    return richText;
  }

  const fallback = document.createElement('div');
  fallback.className = 'hero-richtext';
  const fallbackNodes = getFallbackTextNodes(block);
  const headingNodes = fallbackNodes.filter(isHeadingNode);
  const richTextNodes = headingNodes.length ? headingNodes : fallbackNodes;
  richTextNodes.forEach((node) => fallback.append(node.cloneNode(true)));
  normalizeMainRichTextStructure(fallback);
  if (!hasRenderableContent(fallback)) return null;
  return fallback;
}

function buildActionButton(textField, linkField, style) {
  const labelValue = textField.value || linkField.value;
  const hrefValue = linkField.href || linkField.value;
  if (!labelValue && !hrefValue) return null;

  const button = document.createElement('a');
  button.className = `hero-action-btn hero-action-btn-${style}`;
  button.href = hrefValue || '#';

  const label = document.createElement('span');
  label.className = 'hero-action-label';
  label.textContent = labelValue || hrefValue || 'Learn More';
  if (textField.source) moveFieldBinding(textField.source, label);
  button.append(label);

  if (linkField.source) moveFieldBinding(linkField.source, button);
  return button;
}

function getButtonStyle(block, name) {
  return normalizeChoice(
    getFieldValue(block, [name]).value,
    ['outline', 'solid', 'inverted'],
    'solid',
  );
}

function buildActions(block) {
  const rows = [
    {
      text: getFieldValue(block, ['action_1Text', 'cta1Text']),
      link: getLinkFieldValue(block, ['action_1Link', 'cta1Link']),
      style: getButtonStyle(block, 'action_1Style'),
    },
    {
      text: getFieldValue(block, ['action_2Text', 'cta2Text']),
      link: getLinkFieldValue(block, ['action_2Link', 'cta2Link']),
      style: getButtonStyle(block, 'action_2Style'),
    },
    {
      text: getFieldValue(block, ['action_3Text', 'cta3Text']),
      link: getLinkFieldValue(block, ['action_3Link', 'cta3Link']),
      style: getButtonStyle(block, 'action_3Style'),
    },
  ];

  const actions = document.createElement('div');
  actions.className = 'hero-actions';

  rows.forEach((row) => {
    const button = buildActionButton(row.text, row.link, row.style);
    if (button) actions.append(button);
  });

  if (!actions.children.length) return null;
  return actions;
}

function buildPanelButton(textField, linkField, className) {
  const labelValue = textField.value || linkField.value;
  const hrefValue = linkField.href || linkField.value;
  if (!labelValue && !hrefValue) return null;

  const button = document.createElement('a');
  button.className = className;
  button.href = hrefValue || '#';
  button.textContent = labelValue || hrefValue || 'Learn More';
  if (textField.source) moveFieldBinding(textField.source, button);
  if (linkField.source) moveFieldBinding(linkField.source, button);
  return button;
}

function buildSidePanel(block) {
  const titleField = getFieldValue(block, ['panel_title', 'sidePanelTitle']);
  const textField = getFieldValue(block, ['panel_text', 'sidePanelText']);
  const primaryTextField = getFieldValue(block, ['panel_primaryText', 'sidePanelPrimaryText']);
  const primaryLinkField = getLinkFieldValue(block, ['panel_primaryLink', 'sidePanelPrimaryLink']);
  const secondaryTextField = getFieldValue(block, ['panel_secondaryText', 'sidePanelSecondaryText']);
  const secondaryLinkField = getLinkFieldValue(block, ['panel_secondaryLink', 'sidePanelSecondaryLink']);
  const footerTextField = getFieldValue(block, ['panel_footerText', 'sidePanelFooterText']);

  const hasPanelContent = [
    titleField.value,
    textField.value,
    primaryTextField.value,
    primaryLinkField.value,
    secondaryTextField.value,
    secondaryLinkField.value,
    footerTextField.value,
  ].some(Boolean);

  if (!hasPanelContent) return null;

  const panel = document.createElement('aside');
  panel.className = 'hero-side-panel';

  const title = buildInstrumentedText(titleField, 'h3', 'hero-side-panel-title');
  if (title) panel.append(title);

  const body = buildInstrumentedText(textField, 'div', 'hero-side-panel-text');
  if (body) panel.append(body);

  const actions = document.createElement('div');
  actions.className = 'hero-side-panel-actions';

  const primaryButton = buildPanelButton(
    primaryTextField,
    primaryLinkField,
    'hero-side-panel-btn hero-side-panel-btn-primary',
  );
  if (primaryButton) actions.append(primaryButton);

  const secondaryButton = buildPanelButton(
    secondaryTextField,
    secondaryLinkField,
    'hero-side-panel-btn hero-side-panel-btn-secondary',
  );
  if (secondaryButton) actions.append(secondaryButton);

  if (actions.children.length) panel.append(actions);

  const footer = buildInstrumentedText(footerTextField, 'div', 'hero-side-panel-footer');
  if (footer) panel.append(footer);

  return panel;
}

function findVideoInElement(el, options = {}) {
  const { allowGenericAssetLink = false } = options;
  if (!el) return '';
  // 1. Element itself is a video
  if (el.tagName === 'VIDEO') {
    return el.getAttribute('src')
      || el.querySelector('source')?.getAttribute('src')
      || '';
  }
  // 2. Element itself is an anchor with a video href
  if (el.tagName === 'A') {
    const href = el.getAttribute('href') || '';
    if (href && (allowGenericAssetLink || isPossibleVideoUrl(href))) return href;
  }
  const ownAttributeUrl = [
    'href',
    'src',
    'data-src',
    'data-href',
    'data-aue-resource',
    'content',
    'value',
  ]
    .map((attr) => el.getAttribute?.(attr) || '')
    .find((value) => isPossibleVideoUrl(value));
  if (ownAttributeUrl) return resourcePathFromUrn(ownAttributeUrl) || ownAttributeUrl;

  // 3. Any descendant <video>
  const innerVideo = el.querySelector?.('video');
  if (innerVideo) {
    const src = innerVideo.getAttribute('src')
      || innerVideo.querySelector('source')?.getAttribute('src') || '';
    if (src) return src;
  }
  // 4. Any descendant anchor — prefer one whose href looks like a video,
  //    otherwise fall back to the first anchor we see (the asset reference
  //    may be linked even if the URL doesn't carry an extension).
  const anchors = [...(el.querySelectorAll?.('a[href]') || [])];
  const videoAnchorMatch = anchors.find((a) => isPossibleVideoUrl(a.getAttribute('href') || ''));
  if (videoAnchorMatch) return videoAnchorMatch.getAttribute('href');
  const firstAnchor = allowGenericAssetLink
    ? anchors.find((a) => a.getAttribute('href'))
    : null;
  if (firstAnchor) return firstAnchor.getAttribute('href');
  // 5. Plain text content that looks like a video URL/path
  const text = el.textContent?.trim() || '';
  const textMatch = text.match(/(?:https?:\/\/\S+|\/content\/dam\/\S+|\/\S+\.(?:mp4|webm|mov|m4v|ogv)(?:[?#]\S*)?)/i);
  if (textMatch && isPossibleVideoUrl(textMatch[0])) {
    return textMatch[0];
  }
  if (text && isPossibleVideoUrl(text)) {
    return text;
  }
  return '';
}

async function extractVideoUrl(block) {
  const videoField = readLinkField(block, ['media_video', 'video'], {
    fallbackCell: getHeroFieldCell(block, 'media_video'),
  });
  const videoSource = videoField.source || videoField.cell;
  if (videoSource || videoField.value) {
    const url = findVideoInElement(videoSource, {
      allowGenericAssetLink: Boolean(videoField.source),
    }) || (isPossibleVideoUrl(videoField.value) ? videoField.value : '');
    if (url) return { source: videoSource, url };
  }

  // 1. Try the named field first
  const named = block.querySelector('[data-aue-prop="media_video"]')
    || block.querySelector('[data-aue-prop="video"]');
  if (named) {
    const url = findVideoInElement(named, { allowGenericAssetLink: true });
    if (url) return { source: named, url };
  }

  // 2. Block-wide scan for any anchor whose href looks like a video file.
  //    Catches the case where EDS auto-linked the asset path and dropped the
  //    data-aue-prop marker (same trick we use for color rows elsewhere).
  const videoAnchor = [...block.querySelectorAll('a[href]')]
    .find((a) => isPossibleVideoUrl(a.getAttribute('href')));
  if (videoAnchor) {
    return { source: videoAnchor, url: videoAnchor.getAttribute('href') };
  }

  const videoCell = getHeroFieldCell(block, 'media_video');
  const fallbackUrl = findVideoInElement(videoCell);
  if (fallbackUrl) return { source: videoCell, url: fallbackUrl };

  // 3. Block-wide scan for an actual <video> element
  const anyVideo = block.querySelector('video');
  if (anyVideo) {
    const src = anyVideo.getAttribute('src')
      || anyVideo.querySelector('source')?.getAttribute('src') || '';
    if (src) return { source: anyVideo, url: src };
  }

  // 4. Last resort: scan every direct row for plain-text video paths
  const rows = [...block.querySelectorAll(':scope > div')];
  const rowMatch = rows
    .map((row) => ({ row, url: findVideoInElement(row) }))
    .find(({ url }) => url);
  if (rowMatch) return { source: rowMatch.row, url: rowMatch.url };

  const resourceUrl = await getVideoUrlFromResourceJson(block);
  if (resourceUrl) return { source: null, url: resourceUrl };

  return { source: null, url: '' };
}

function buildVideoElement(url, posterUrl) {
  const video = document.createElement('video');
  video.className = 'hero-video';
  video.src = resolveVideoPlaybackUrl(url);
  if (posterUrl) video.poster = posterUrl;
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('autoplay', '');
  video.setAttribute('loop', '');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('preload', 'auto');
  // Some browsers (Safari iOS) require .play() after the element exists.
  const tryPlay = () => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => { /* autoplay blocked — leave poster visible */ });
    }
  };
  if (video.readyState >= 2) tryPlay();
  else video.addEventListener('loadeddata', tryPlay, { once: true });
  video.addEventListener('error', () => {
    video.remove();
  }, { once: true });
  return video;
}

function pictureInSource(source, exclude) {
  if (!source) return null;
  if (source.tagName === 'PICTURE' && !exclude.includes(source)) return source;
  return [...source.querySelectorAll('picture')].find((p) => !exclude.includes(p)) || null;
}

function extractPicture(block, exclude = []) {
  const imageField = readImageField(block, ['media_image', 'image'], {
    fallbackCell: getMediaCell(block),
  });
  const imageSource = imageField.source || imageField.cell;
  let picture = imageField.picture && !exclude.includes(imageField.picture)
    ? imageField.picture
    : null;
  picture = picture || pictureInSource(imageSource, exclude);
  if (!picture) {
    picture = [...block.querySelectorAll('picture')].find((p) => !exclude.includes(p)) || null;
  }
  if (!picture) return null;

  if (imageSource && imageSource !== picture) {
    moveFieldBinding(imageSource, picture);
  }

  const altField = getFieldValue(block, ['media_imageAlt', 'imageAlt']);
  const img = picture.querySelector('img');
  if (img) {
    if (altField.value) img.alt = altField.value;
    if (altField.source) moveFieldBinding(altField.source, img);
  }

  return picture;
}

function extractFeaturedPicture(block, exclude = []) {
  const imageField = readImageField(
    block,
    ['media_featuredImage', 'featuredImage'],
  );
  const imageSource = imageField.source || imageField.cell;
  if (!imageSource && !imageField.picture) return null;

  let picture = imageField.picture && !exclude.includes(imageField.picture)
    ? imageField.picture
    : null;
  picture = picture || pictureInSource(imageSource, exclude);
  if (!picture) {
    picture = [...block.querySelectorAll('picture')].find((p) => !exclude.includes(p)) || null;
  }
  if (!picture) return null;

  if (imageSource !== picture) {
    moveFieldBinding(imageSource, picture);
  }

  const altField = getFieldValue(block, ['media_featuredImageAlt', 'featuredImageAlt']);
  const img = picture.querySelector('img');
  if (img) {
    if (altField.value) img.alt = altField.value;
    if (altField.source) moveFieldBinding(altField.source, img);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'hero-featured-image';
  wrapper.append(picture);
  return wrapper;
}

function applyTextColor(main, color) {
  if (!color) return;
  const heading = main.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    heading.style.color = color;
    return;
  }
  const richtext = main.querySelector('.hero-richtext, .hero-text-html');
  if (richtext) richtext.style.color = color;
}

// Editor only: re-home the (hidden) Text Color field into the rendered output so
// it survives block.replaceChildren(), then observe it so panel edits update the
// color live instead of requiring a page refresh.
function watchHeroTextColor(content, main, rows) {
  // eslint-disable-next-line no-console
  console.log('[HEROCOLORDBG] watch attach. rows=', rows?.length, rows?.[0]?.outerHTML);
  if (!rows?.length) return;
  const archive = document.createElement('span');
  archive.hidden = true;
  rows.forEach((row) => archive.append(row));
  content.append(archive);

  // Re-read the current Text Color value straight from the (hidden) field on
  // every mutation, rather than caching the source node. The editor may either
  // patch the field node's contents in place OR swap the node out entirely; by
  // watching the whole archive subtree and re-querying, we catch both cases.
  const currentColor = () => {
    const cell = archive.querySelector(
      '[data-aue-prop="content_textColor"], [data-aue-prop="text_color"]',
    ) || archive.querySelector(':scope > div > div:last-child');
    return normalizeHexColor((cell?.textContent || '').trim());
  };

  new MutationObserver((mutations) => {
    const color = currentColor();
    // eslint-disable-next-line no-console
    console.log('[HEROCOLORDBG] archive mutated. n=', mutations.length, 'color=', color, archive.innerHTML);
    if (color) applyTextColor(main, color);
  }).observe(archive, { childList: true, characterData: true, subtree: true });
}

function readOverlayOpacity(block) {
  const { value } = getFieldValue(block, ['media_overlayOpacity', 'overlayOpacity']);
  if (!value) return null;
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num < 0 || num > 100) return null;
  return `${num}%`;
}

export default async function decorate(block) {
  block.classList.add('no-scroll-reveal', 'is-visible');
  block.classList.remove('scroll-reveal');
  if (isAemAuthorHost()) block.classList.add('hero-authoring');

  // HEROCOLORDBG — temporary diagnostics for the live Text Color update.
  /* eslint-disable no-console */
  console.log('[HEROCOLORDBG] decorate run. UE=', isUniversalEditor(), block.getAttribute('data-aue-resource'));
  if (isUniversalEditor() && !window.heroColorDbgAttached) {
    window.heroColorDbgAttached = true;
    const dbgTypes = ['aue:content-patch', 'aue:content-update', 'aue:content-add', 'aue:content-move', 'aue:content-remove', 'aue:content-copy'];
    dbgTypes.forEach((type) => document.querySelector('main')?.addEventListener(type, (e) => {
      console.log('[HEROCOLORDBG] event', type, e.detail);
    }, true));
  }
  /* eslint-enable no-console */

  const originalBlock = block.cloneNode(true);
  const originalRichText = getFieldHtml(readRichTextField(originalBlock, ['content_text', 'text']));
  const originalHtmlText = getFieldHtml(readRichTextField(originalBlock, ['content_textHtml', 'text_html']));
  // In the editor, never serve stale resource JSON: a re-decoration triggered by
  // an edit must read the freshly-saved values, not the module-level cache.
  if (isUniversalEditor()) resourceDataCache.clear();
  const resourceData = await getHeroResourceData(block);
  const resourceRichText = findResourceFieldValue(resourceData, ['content_text', 'text']) || originalRichText;
  const resourceHtmlText = findResourceFieldValue(resourceData, ['content_textHtml', 'text_html']) || originalHtmlText;
  const resourceHtmlTextClass = findResourceFieldValue(
    resourceData,
    ['content_textHtmlClass', 'textHtmlClass'],
  );

  const variant = normalizeChoice(
    getFieldValue(block, ['variant']).value,
    ['default', 'homepage'],
    'default',
  );
  block.classList.remove('hero-variant-default', 'hero-variant-homepage');
  block.classList.add(`hero-variant-${variant}`);

  const height = readHeight(block);
  if (height) {
    block.style.setProperty('--hero-height', height);
  }

  const overlayOpacity = readOverlayOpacity(block);
  if (overlayOpacity) {
    block.style.setProperty('--hero-overlay-opacity', overlayOpacity);
  }

  const gradientOverlay = normalizeChoice(
    getFieldValue(block, ['media_gradientOverlay', 'gradientOverlay']).value,
    ['show', 'hide'],
    'show',
  );
  if (gradientOverlay === 'show') {
    block.classList.add('hero-gradient');
  }

  const contentPosition = normalizeChoice(
    getFieldValue(block, ['content_position', 'contentPosition']).value,
    ['left', 'center', 'right'],
    'left',
  );
  block.classList.remove('hero-pos-left', 'hero-pos-center', 'hero-pos-right');
  block.classList.add(`hero-pos-${contentPosition}`);

  const { color: textColor, rows: textColorRows } = readTextColor(
    block,
    findResourceFieldValue(resourceData, ['content_textColor', 'text_color']),
  );
  const markerConfig = readMarkerConfig(block, resourceData);
  const picture = extractPicture(block);
  const featuredImage = extractFeaturedPicture(block, picture ? [picture] : []);
  const { url: videoUrl, source: videoSource } = await extractVideoUrl(block);
  let videoEl = null;
  if (videoUrl) {
    const posterUrl = picture?.querySelector('img')?.src || '';
    videoEl = buildVideoElement(videoUrl, posterUrl);
    if (videoSource) moveFieldBinding(videoSource, videoEl);
    // Drop the source row so its placeholder text doesn't leak into the DOM.
    const row = videoSource ? getDirectRow(block, videoSource) : null;
    if (row) row.remove();
  } else if (block.querySelector('[data-aue-prop="media_video"]')) {
    // Field exists in the DOM but we couldn't pull a URL out of it. Dump the
    // rendered HTML so it's visible in DevTools while debugging.
    // eslint-disable-next-line no-console
    console.warn(
      '[hero] media_video field present but no URL extracted. HTML:',
      block.querySelector('[data-aue-prop="media_video"]').outerHTML,
    );
  }
  const breadcrumb = await buildBreadcrumbs(block);
  const richText = buildMainRichText(block, resourceRichText);
  if (richText) {
    applyAccentBrackets(richText);
    applyAnimatedMarkers(richText, markerConfig);
    // Run last so the {#hex}…{#hex} spans aren't clobbered by the innerHTML
    // rewrites above. Hero renders after the one-time global pass in
    // decorateMain(), so it has to apply the inline-color parser itself.
    decorateInlineColors(richText);
  }
  const htmlText = buildHtmlText(block, resourceHtmlText, resourceHtmlTextClass);
  if (htmlText) {
    applyAnimatedMarkers(htmlText, markerConfig);
    decorateInlineColors(htmlText);
  }
  const actions = buildActions(block);
  const sidePanel = buildSidePanel(block);

  const main = document.createElement('div');
  main.className = 'hero-main';

  const mainBody = document.createElement('div');
  mainBody.className = 'hero-main-body';
  if (breadcrumb) mainBody.append(breadcrumb);
  if (richText) mainBody.append(richText);
  if (htmlText) mainBody.append(htmlText);
  if (actions) mainBody.append(actions);
  main.append(mainBody);

  if (featuredImage) {
    main.classList.add('has-featured-image');
    main.append(featuredImage);
  }
  applyTextColor(main, textColor);

  const layout = document.createElement('div');
  layout.className = 'hero-layout';
  if (sidePanel) layout.classList.add('has-side-panel');
  layout.append(main);
  if (sidePanel) layout.append(sidePanel);

  const content = document.createElement('div');
  content.className = 'hero-content';
  content.append(layout);

  if (isUniversalEditor()) {
    watchHeroTextColor(content, main, textColorRows);
  }

  if (videoEl) {
    if (picture) {
      block.replaceChildren(picture, videoEl, content);
    } else {
      block.replaceChildren(videoEl, content);
    }
    return;
  }
  if (picture) {
    block.replaceChildren(picture, content);
    return;
  }
  block.replaceChildren(content);
}
