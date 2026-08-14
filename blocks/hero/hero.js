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
  'panel_image',
  'panel_imageAlt',
];
const resourceDataCache = new Map();

// Indices below match _hero.json's ACTUAL current field order (fields were regrouped
// under UI tabs by a later commit
// content_position, was placed BEFORE the Media tab, not after it as this table used
// to assume; "tab" model entries are UI-only and consume no row).
const HERO_FIELD_INDEX = {
  variant: 0,
  content_height: 1,
  content_position: 2,
  media_image: 3,
  media_imageAlt: 4,
  media_featuredImage: 5,
  media_featuredImageAlt: 6,
  media_video: 7,
  media_overlayOpacity: 8,
  media_gradientOverlay: 9,
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
  panel_image: 32,
  panel_imageAlt: 33,
  markerTerms: 34,
  markerColor: 35,
  markerStyle: 36,
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
// the hostname
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

// Fields with no authored value frequently don't get their own row in the exported
// markup at all, so a positional fallback can silently grab a completely different
// field's value. In the editor, named data-aue-prop lookup is reliable whenever a
// field actually has content, so a failed name lookup there means the field is
// genuinely empty
// fallback is only meaningful on true published pages (see cards.js /
// colored-icon-text.js for the same pattern).
function getHeroFieldCell(block, name) {
  if (isUniversalEditor()) return null;
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

function getFeaturedImageCell(block, exclude = []) {
  const indexedCell = getHeroFieldCell(block, 'media_featuredImage');
  if (indexedCell?.querySelector?.('picture')) return indexedCell;

  return getRowCells(block).find((cell) => {
    const picture = cell.querySelector?.('picture');
    return picture && !exclude.includes(picture);
  }) || null;
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

function getStandaloneNumberNode(cell) {
  if (!cell) return null;
  return [...cell.querySelectorAll('p, span')]
    .find((node) => /^(?:100|[1-9]?[0-9])$/.test(node.textContent.trim())) || null;
}

function getPublishedOverlayCell(block) {
  const contentCell = getContentCell(block);
  return getRowCells(block).find((cell) => (
    cell !== contentCell
      && getStandaloneNumberNode(cell)
      && getChoiceFromCell(cell, ['show', 'hide'])
  )) || null;
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
  } else if (hasName('content_height', 'height')) {
    fallbackCell = getStandaloneNumberNode(getContentCell(block));
    fallbackValue = getCellText(fallbackCell);
  } else if (hasName('media_overlayOpacity', 'overlayOpacity')) {
    fallbackCell = getStandaloneNumberNode(getPublishedOverlayCell(block)) || getMediaCell(block);
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
    'outline',
    'solid',
    'inverted',
    'circle',
    'underline',
  ]);
  const normalizedLower = normalized.toLowerCase();
  if (ignoredTextValues.has(normalizedLower)) return true;

  const tokens = normalizedLower.split(/\s+/).filter(Boolean);
  if (
    tokens.length > 1
    && tokens.every((token) => ['outline', 'solid', 'inverted'].includes(token))
  ) {
    return true;
  }
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized)) return true;
  if (/^\d+(\.\d+)?(rem|px|%)?$/.test(normalized)) return true;
  if (/^h\d{2,}$/i.test(normalized)) return true;

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

function getFallbackMainTextNodes(block) {
  const nodes = getFallbackTextNodes(block);
  const firstHeadingIndex = nodes.findIndex(isHeadingNode);
  if (firstHeadingIndex < 0) return nodes;

  let endIndex = firstHeadingIndex + 1;
  while (endIndex < nodes.length && isHeadingNode(nodes[endIndex])) endIndex += 1;
  return nodes.slice(0, endIndex);
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
  wrapper.className = 'hero-text-html richtext-preserve-spaces';
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

  // Hide (don't remove) rows that still carry live Universal Editor instrumentation
  // permanently removing an aue-tracked node desyncs UE's resource tree from the DOM
  // and breaks live-patching of that field on the next decoration pass. Rows found via
  // the legacy label-matching branch above never had instrumentation to begin with, so
  // they're always safe to remove outright.
  const isEditor = isUniversalEditor();
  rowsToRemove.forEach((row) => {
    if (isEditor && row.querySelector('[data-aue-prop], [data-richtext-prop]')) {
      row.hidden = true;
    } else {
      row.remove();
    }
  });
  return normalizeHexColor(rawValue) || normalizeHexColor(fallbackValue);
}

function getFlattenedMarkerConfig(block) {
  const cells = getRowCells(block);
  let styleIndex = -1;

  for (let index = cells.length - 1; index >= 0; index -= 1) {
    if (isExactChoiceCell(cells[index], ['circle', 'underline'])) {
      styleIndex = index;
      break;
    }
  }

  if (styleIndex < 1) return { terms: '', color: '', style: '' };

  const precedingValue = getCellText(cells[styleIndex - 1]);
  const color = normalizeHexColor(precedingValue) || '';
  const hasColorSlot = !precedingValue || Boolean(color);
  const termsIndex = hasColorSlot ? styleIndex - 2 : styleIndex - 1;

  return {
    terms: termsIndex >= 0 ? getCellText(cells[termsIndex]) : '',
    color,
    style: getCellText(cells[styleIndex]).toLowerCase(),
  };
}

function readMarkerConfig(block, resourceData) {
  const flattened = getFlattenedMarkerConfig(block);
  return {
    terms: getHeroTextFieldValue(
      block,
      ['markerTerms', 'marker_terms', 'highlightText'],
      'markerTerms',
      findResourceFieldValue(resourceData, ['markerTerms', 'marker_terms', 'highlightText'])
        || flattened.terms,
    ).value,
    color: getHeroTextFieldValue(
      block,
      ['markerColor', 'marker_color', 'highlightMarkerColor'],
      'markerColor',
      findResourceFieldValue(resourceData, ['markerColor', 'marker_color', 'highlightMarkerColor'])
        || flattened.color,
    ).value,
    style: getHeroTextFieldValue(
      block,
      ['markerStyle', 'marker_style', 'highlightMarkerStyle'],
      'markerStyle',
      findResourceFieldValue(resourceData, ['markerStyle', 'marker_style', 'highlightMarkerStyle'])
        || flattened.style,
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

  // Same hide-not-remove rationale as readTextColor above.
  const isEditor = isUniversalEditor();
  const contentCell = getContentCell(block);
  rowsToRemove.forEach((row) => {
    // Published delivery groups this height value with the rich-text field.
    // The Hero content parser still needs that original cell, so leave the
    // standalone number in place; it is ignored by the rich-text renderer.
    if (!isEditor && row?.contains(contentCell)) {
      return;
    }
    if (isEditor && row.querySelector('[data-aue-prop], [data-richtext-prop]')) {
      row.hidden = true;
    } else {
      row.remove();
    }
  });
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

  const nav = document.createElement('nav');
  nav.className = 'hero-breadcrumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');

  const list = document.createElement('ol');

  resolvedCrumbs.forEach((crumb, index) => {
    const item = document.createElement('li');
    if (crumb.isCurrent) item.classList.add('is-current');

    const shouldLink = !crumb.isCurrent && crumb.href;
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

function normalizeBreadcrumbText(value) {
  return String(value || '')
    .replace(/&gt;/gi, '>')
    .replace(/\s*>\s*/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isBreadcrumbTextNode(node) {
  const text = normalizeBreadcrumbText(node?.textContent || '');
  if (!text || !text.includes('>')) return false;
  if (text.length > 160) return false;
  return /^[a-z0-9 &'/().,-]+(?:>[a-z0-9 &'/().,-]+)+$/i.test(text);
}

function removeLeadingBreadcrumbText(richText) {
  let node = richText.firstElementChild;
  while (node && node.textContent.trim() === '') {
    const empty = node;
    node = node.nextElementSibling;
    empty.remove();
  }

  while (node && !isHeadingNode(node) && isBreadcrumbTextNode(node)) {
    const next = node.nextElementSibling;
    node.remove();
    node = next;
  }
}

function removeConfigArtifactText(richText) {
  if (!richText) return;

  [...richText.querySelectorAll('p, div, span')].forEach((node) => {
    if (node.children.length) return;
    if (!isIgnoredFallbackText(node.textContent)) return;
    node.remove();
  });
}

function buildMainRichText(block, fallbackHtml = '', hasBreadcrumb = false) {
  const field = readRichTextField(block, ['content_text', 'text']);
  const hasField = hasRichFieldContent(field);
  if (hasField || fallbackHtml) {
    const richText = document.createElement('div');
    richText.className = 'hero-richtext richtext-preserve-spaces';
    if (hasField) moveRichField(field, richText, fallbackHtml);
    else appendHtmlValue(fallbackHtml, richText);
    removeConfigArtifactText(richText);
    if (hasBreadcrumb) removeLeadingBreadcrumbText(richText);
    normalizeMainRichTextStructure(richText);
    if (!hasRenderableContent(richText)) return null;
    return richText;
  }

  const fallback = document.createElement('div');
  fallback.className = 'hero-richtext richtext-preserve-spaces';
  const fallbackNodes = getFallbackMainTextNodes(block);
  fallbackNodes.forEach((node) => fallback.append(node.cloneNode(true)));
  removeConfigArtifactText(fallback);
  if (hasBreadcrumb) removeLeadingBreadcrumbText(fallback);
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

function getCellHrefValue(cell) {
  if (!cell) return '';
  const anchor = cell.tagName === 'A' ? cell : cell.querySelector?.('a[href]');
  return anchor?.getAttribute('href') || cell.getAttribute?.('href') || getCellText(cell);
}

function isActionStyleValue(value) {
  return ['outline', 'solid', 'inverted'].includes(String(value || '').trim().toLowerCase());
}

function hasNonActionFieldContent(cell) {
  if (!cell) return true;
  if (cell.querySelector('picture, img, video')) return true;
  return false;
}

function isLikelyLinkValue(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^(?:#|\/|https?:\/\/|mailto:|tel:)/i.test(text)
    || /\.(?:html?|pdf|docx?|pptx?|zip)(?:[?#].*)?$/i.test(text);
}

function isLikelyBodyValue(value) {
  const text = String(value || '').trim();
  return text.length > 72 || /[.!?;?]/.test(text);
}

function getContentCellIndex(cells) {
  return cells.findIndex((cell) => cell.querySelector('h1, h2, h3, h4, h5, h6'));
}

function resolveFlattenedAction(candidates, isFirstGroup, style) {
  let group = candidates;
  if (isFirstGroup && group.length > 1 && isLikelyBodyValue(group[0].value)) {
    group = group.slice(1);
  }
  if (!group.length) return null;

  const lastCandidate = group[group.length - 1];
  const lastHasHref = Boolean(lastCandidate.cell.querySelector?.('a[href]'))
    || isLikelyLinkValue(lastCandidate.href);
  const linkCandidate = group.length > 1 && lastHasHref ? lastCandidate : null;
  const textCandidate = linkCandidate ? group[group.length - 2] : lastCandidate;

  return {
    text: {
      source: null,
      value: textCandidate.value,
    },
    link: {
      source: null,
      value: linkCandidate?.value || '',
      href: linkCandidate?.href || '',
    },
    style,
  };
}

function shouldSkipFlattenedActionText(cell, value) {
  if (!value) return true;
  if (hasNonActionFieldContent(cell)) return true;
  if (isHeadingNode(cell)) return true;
  if (cell.querySelector?.('h1, h2, h3, h4, h5, h6')) return true;
  if (isIgnoredFallbackText(value)) return true;
  if (isActionStyleValue(value)) return true;
  if (isLikelyBodyValue(value)) return true;
  return false;
}

function getUnstyledFlattenedActionGroups(cells, contentIndex) {
  const groups = [];
  let pending = null;

  cells.slice(contentIndex + 1).forEach((cell) => {
    if (groups.length >= 3) return;

    const value = getCellText(cell);
    if (shouldSkipFlattenedActionText(cell, value)) return;

    if (isLikelyLinkValue(value)) {
      if (pending && !pending.link.href) {
        pending.link = { source: null, value, href: getCellHrefValue(cell) };
        groups.push(pending);
        pending = null;
      }
      return;
    }

    if (pending) groups.push(pending);
    pending = {
      text: { source: null, value },
      link: { source: null, value: '', href: '' },
      style: 'outline',
    };
  });

  if (groups.length < 3 && pending) groups.push(pending);
  return groups.slice(0, 3);
}

function getInlineFlattenedElements(root) {
  if (!root) return [];
  const direct = [...root.children]
    .filter((element) => !element.matches('picture, video, source, img'))
    .filter((element) => getCellText(element) || element.querySelector('h1, h2, h3, h4, h5, h6'));

  if (direct.length > 1) return direct;

  return [...root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, a, span')]
    .filter((element) => !element.closest('picture, video'))
    .filter((element) => getCellText(element));
}

function getInlineFlattenedActionGroups(block) {
  const contentCell = getContentCell(block);
  const elements = getInlineFlattenedElements(contentCell || block);
  const headingIndex = elements.findIndex((element) => isHeadingNode(element));
  if (headingIndex < 0) return [];

  return getUnstyledFlattenedActionGroups(elements, headingIndex);
}

// Core grouping: given an ordered list of "cells" (either row cells, or the
// flattened sibling elements of a single actions cell) and the index to start
// after, split them into up to three actions delimited by their style value
// (outline/solid/inverted). Each action's text/link precede its style.
function buildStyledActionGroups(cells, startIndex) {
  const styleIndexes = cells
    .map((cell, index) => ({ cell, index, value: getCellText(cell).toLowerCase() }))
    .filter(({ index, value }) => index > startIndex && isActionStyleValue(value))
    .slice(0, 3);

  if (!styleIndexes.length) return [];

  let previousStyleIndex = startIndex;
  return styleIndexes
    .map(({ cell, index, value }) => {
      const isFirstGroup = previousStyleIndex === startIndex;
      const candidates = cells
        .slice(previousStyleIndex + 1, index)
        .filter((candidate) => !hasNonActionFieldContent(candidate))
        .map((candidate) => ({
          cell: candidate,
          value: getCellText(candidate),
          href: getCellHrefValue(candidate),
        }))
        .filter(({ value: candidateValue }) => (
          candidateValue && !isIgnoredFallbackText(candidateValue)
        ));
      previousStyleIndex = index;

      return resolveFlattenedAction(
        candidates,
        isFirstGroup,
        value || getCellText(cell).toLowerCase(),
      );
    })
    .filter(Boolean);
}

// Some published exports flatten every action field (text/link/style x N) into a
// SINGLE cell as sibling elements, instead of one cell per field. Detect that
// cell
// children the same way we group row cells.
function getGroupedActionCellGroups(cells, contentIndex) {
  const actionsCell = cells
    .slice(contentIndex + 1)
    .find((cell) => [...cell.children]
      .some((child) => isActionStyleValue(getCellText(child))));
  if (!actionsCell) return [];

  const items = [...actionsCell.children]
    .filter((child) => getCellText(child) || child.querySelector?.('a[href]'));

  return buildStyledActionGroups(items, -1);
}

function getCellTextLines(cell) {
  return String(cell?.textContent || '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function buildLineActionGroups(lines) {
  const groups = [];
  let currentStyle = 'outline';
  let pendingText = '';

  lines.forEach((line) => {
    if (groups.length >= 3) return;
    const value = line.trim();
    const lower = value.toLowerCase();

    if (isActionStyleValue(lower)) {
      currentStyle = lower;
      return;
    }

    if (isIgnoredFallbackText(value) || isLikelyBodyValue(value)) return;

    if (isLikelyLinkValue(value)) {
      if (pendingText) {
        groups.push({
          text: { source: null, value: pendingText },
          link: { source: null, value, href: value },
          style: currentStyle,
        });
        pendingText = '';
      }
      return;
    }

    if (pendingText) {
      groups.push({
        text: { source: null, value: pendingText },
        link: { source: null, value: '', href: '' },
        style: currentStyle,
      });
    }

    pendingText = value;
  });

  if (groups.length < 3 && pendingText) {
    groups.push({
      text: { source: null, value: pendingText },
      link: { source: null, value: '', href: '' },
      style: currentStyle,
    });
  }

  return groups.slice(0, 3);
}

function getMultilineActionCellGroups(cells, contentIndex) {
  return cells
    .slice(contentIndex + 1)
    .map((cell) => buildLineActionGroups(getCellTextLines(cell)))
    .find((groups) => groups.length > 1) || [];
}

function getFlattenedActionGroups(block) {
  if (isUniversalEditor()) return [];

  const cells = getRowCells(block);
  const contentIndex = getContentCellIndex(cells);
  if (contentIndex < 0) return getInlineFlattenedActionGroups(block);

  const styledGroups = buildStyledActionGroups(cells, contentIndex);
  if (styledGroups.length) return styledGroups;

  const groupedCellGroups = getGroupedActionCellGroups(cells, contentIndex);
  if (groupedCellGroups.length) return groupedCellGroups;

  const multilineGroups = getMultilineActionCellGroups(cells, contentIndex);
  if (multilineGroups.length) return multilineGroups;

  // Published Hero exports omit empty fields, so generic text after the content can
  // be layout values (for example, overlay opacity and gradient state). Only use an
  // unstyled fallback when it contains an actual authored link.
  const unstyledGroups = getUnstyledFlattenedActionGroups(cells, contentIndex)
    .filter((group) => Boolean(group.link?.href));
  if (unstyledGroups.length) return unstyledGroups;

  return getInlineFlattenedActionGroups(block)
    .filter((group) => Boolean(group.link?.href));
}

function getButtonStyle(block, name) {
  return normalizeChoice(
    getFieldValue(block, [name]).value,
    ['outline', 'solid', 'inverted'],
    'solid',
  );
}

function buildActions(block) {
  const flattenedActions = getFlattenedActionGroups(block);
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
  ].map((row, index) => {
    const fallback = flattenedActions[index];
    if (!fallback) return row;

    return {
      text: row.text.value ? row.text : fallback.text,
      link: row.link.value || row.link.href ? row.link : fallback.link,
      style: row.style === 'solid' && fallback.style ? fallback.style : row.style,
    };
  });

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

function buildSidePanel(block, panelImage = null) {
  const titleField = getFieldValue(block, ['panel_title', 'sidePanelTitle']);
  const textField = getFieldValue(block, ['panel_text', 'sidePanelText']);
  const primaryTextField = getFieldValue(block, ['panel_primaryText', 'sidePanelPrimaryText']);
  const primaryLinkField = getLinkFieldValue(block, ['panel_primaryLink', 'sidePanelPrimaryLink']);
  const secondaryTextField = getFieldValue(block, ['panel_secondaryText', 'sidePanelSecondaryText']);
  const secondaryLinkField = getLinkFieldValue(block, ['panel_secondaryLink', 'sidePanelSecondaryLink']);
  const footerTextField = getFieldValue(block, ['panel_footerText', 'sidePanelFooterText']);

  const hasPanelTextContent = [
    titleField.value,
    textField.value,
    primaryTextField.value,
    primaryLinkField.value,
    secondaryTextField.value,
    secondaryLinkField.value,
    footerTextField.value,
  ].some(Boolean);

  if (!hasPanelTextContent && !panelImage) return null;

  const panel = document.createElement('aside');
  panel.className = 'hero-side-panel';
  if (panelImage) {
    panel.classList.add('has-panel-image');
    if (!hasPanelTextContent) panel.classList.add('is-image-only');
    panel.append(panelImage);
  }

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

function extractPanelPicture(block, pictureCandidates = []) {
  const imageField = readImageField(block, ['panel_image', 'sidePanelImage']);
  const imageSource = imageField.source || imageField.cell;
  let picture = imageField.picture || null;
  picture = picture || [...(imageSource?.querySelectorAll('picture') || [])][0] || null;

  // Published markup omits empty fields. The Side Panel fields come after the
  // action-style fields, whereas background/featured media comes before them. This
  // lets us distinguish a panel-only Hero (one picture) from a background-only Hero
  // without relying on a fixed row number.
  if (!picture && !isUniversalEditor()) {
    const cells = getRowCells(block);
    const actionStyleIndex = cells.findIndex((cell) => (
      Boolean(getChoiceFromCell(cell, ['outline', 'solid', 'inverted']))
    ));
    const panelPictures = cells
      .slice(actionStyleIndex + 1)
      .flatMap((cell) => [...cell.querySelectorAll('picture')]);
    picture = panelPictures[panelPictures.length - 1]
      || (pictureCandidates.length > 1 ? pictureCandidates[pictureCandidates.length - 1] : null);
  }

  if (!picture) return null;

  if (imageSource && imageSource !== picture) {
    moveFieldBinding(imageSource, picture);
  }

  const altField = getFieldValue(block, ['panel_imageAlt', 'sidePanelImageAlt']);
  const img = picture.querySelector('img');
  if (img) {
    if (altField.value) img.alt = altField.value;
    if (altField.source) moveFieldBinding(altField.source, img);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'hero-side-panel-image';
  wrapper.append(picture);
  return wrapper;
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
  // 4. Any descendant anchor; otherwise fall back to the first anchor we see
  //    (the asset reference
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
      playPromise.catch(() => { /* autoplay blocked; leave poster visible */ });
    }
  };
  if (video.readyState >= 2) tryPlay();
  else video.addEventListener('loadeddata', tryPlay, { once: true });
  video.addEventListener('error', () => {
    video.remove();
  }, { once: true });
  return video;
}

function extractPicture(block, exclude = []) {
  const imageField = readImageField(block, ['media_image', 'image'], {
    fallbackCell: getMediaCell(block),
  });
  const imageSource = imageField.source || imageField.cell;
  let picture = imageField.picture && !exclude.includes(imageField.picture)
    ? imageField.picture
    : null;
  picture = picture || [...(imageSource?.querySelectorAll('picture') || [])]
    .find((candidate) => !exclude.includes(candidate)) || null;
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

function extractFeaturedPicture(block, exclude = [], pictureCandidates = null) {
  const candidates = pictureCandidates || [...block.querySelectorAll('picture')];
  const namedSource = block.querySelector(
    '[data-aue-prop="media_featuredImage"], [data-aue-prop="featuredImage"]',
  );
  const publishedCandidate = !namedSource
    ? candidates.find((p) => !exclude.includes(p)) || null
    : null;

  const imageField = readImageField(
    block,
    ['media_featuredImage', 'featuredImage'],
    { fallbackCell: publishedCandidate ? null : getFeaturedImageCell(block, exclude) },
  );
  const imageSource = imageField.source || imageField.cell;
  if (!publishedCandidate && !imageSource && !imageField.picture) return null;

  let picture = publishedCandidate;
  picture = picture || (imageField.picture && !exclude.includes(imageField.picture)
    ? imageField.picture
    : null);
  picture = picture || [...(imageSource?.querySelectorAll('picture') || [])]
    .find((candidate) => !exclude.includes(candidate)) || null;
  if (!picture) {
    picture = candidates.find((p) => p.isConnected && !exclude.includes(p))
      || candidates.find((p) => !exclude.includes(p))
      || null;
  }
  if (!picture) return null;

  if (imageSource && imageSource !== picture) {
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

  const originalBlock = block.cloneNode(true);
  const originalRichText = getFieldHtml(readRichTextField(originalBlock, ['content_text', 'text']));
  const originalHtmlText = getFieldHtml(readRichTextField(originalBlock, ['content_textHtml', 'text_html']));
  // In the editor, never serve stale resource JSON: a re-decoration triggered by
  // an edit must read the freshly-saved values, not the module-level cache.
  if (isUniversalEditor()) resourceDataCache.clear();
  const resourceData = await getHeroResourceData(block);
  const originalPictures = [...block.querySelectorAll('picture')];
  const resourceRichText = findResourceFieldValue(resourceData, ['content_text', 'text']) || originalRichText;
  const resourceHtmlText = findResourceFieldValue(resourceData, ['content_textHtml', 'text_html']) || originalHtmlText;
  const resourceHtmlTextClass = findResourceFieldValue(
    resourceData,
    ['content_textHtmlClass', 'textHtmlClass'],
  );

  const actions = buildActions(block);
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

  const textColor = readTextColor(
    block,
    findResourceFieldValue(resourceData, ['content_textColor', 'text_color']),
  );
  const markerConfig = readMarkerConfig(block, resourceData);
  const panelImage = extractPanelPicture(block, originalPictures);
  const excludedPictures = panelImage ? [panelImage.querySelector('picture')] : [];
  const picture = extractPicture(block, excludedPictures);
  if (picture) excludedPictures.push(picture);
  const featuredImage = extractFeaturedPicture(block, excludedPictures, originalPictures);
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
  const richText = buildMainRichText(block, resourceRichText, Boolean(breadcrumb));
  if (richText) {
    applyAccentBrackets(richText);
    applyAnimatedMarkers(richText, markerConfig);
    // Run last so the {#hex}
    // rewrites above. Hero renders after the one-time global pass in
    // decorateMain(), so it has to apply the inline-color parser itself.
    decorateInlineColors(richText);
  }
  const htmlText = buildHtmlText(block, resourceHtmlText, resourceHtmlTextClass);
  if (htmlText) {
    applyAnimatedMarkers(htmlText, markerConfig);
    decorateInlineColors(htmlText);
  }
  const sidePanel = buildSidePanel(block, panelImage);

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

  // Rows hidden above (readTextColor/readHeight) instead of removed need to survive
  // this replaceChildren call to stay live-trackable by Universal Editor
  // into a hidden archive appended alongside the real content, matching the pattern used
  // in cards.js / colored-icon-text.js / colored-grid.js.
  const hiddenRows = [...block.querySelectorAll(':scope > div[hidden]')];
  const archive = hiddenRows.length ? document.createElement('span') : null;
  if (archive) {
    archive.hidden = true;
    hiddenRows.forEach((row) => archive.append(row));
  }
  const archiveNodes = archive ? [archive] : [];

  if (videoEl) {
    if (picture) {
      block.replaceChildren(picture, videoEl, content, ...archiveNodes);
    } else {
      block.replaceChildren(videoEl, content, ...archiveNodes);
    }
    return;
  }
  if (picture) {
    block.replaceChildren(picture, content, ...archiveNodes);
    return;
  }
  block.replaceChildren(content, ...archiveNodes);
}
