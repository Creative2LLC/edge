import {
  loadHeader,
  loadFooter,
  loadGetHelp,
  loadCookieConsent,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks() {
  try {
    // TODO: add auto block, if needed
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

function isPdfHref(href) {
  if (!href) return false;

  try {
    return new URL(href, window.location.href).pathname.toLowerCase().endsWith('.pdf');
  } catch (error) {
    return /\.pdf(?:[?#].*)?$/i.test(href);
  }
}

export function decoratePdfLinks(scope) {
  // Never auto-download anything — strip the attribute globally
  scope.querySelectorAll('a[download]').forEach((link) => link.removeAttribute('download'));

  scope.querySelectorAll('a[href]').forEach((link) => {
    if (!isPdfHref(link.getAttribute('href'))) return;

    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (link.classList.contains('button')) {
      link.classList.add('pdf');
    }
  });
}

const AEM_HEX_HREF = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const AEM_CONFIG_VALUE = /^(?:left|right|center|justify|top|middle|bottom|default|none|small|medium|large|solid|outlined|inverted|yes|no|circle|underline|[1-9]00|\d+(?:\.\d+)?(?:px|em|rem|vh|vw|vmin|vmax|%)|(?:all|vertical|horizontal|top|bottom)-(?:sm|md|lg))$/i;

function isHexArtifactParagraph(el) {
  if (el.tagName !== 'P' || !el.classList.contains('button-container')) return false;
  const a = el.querySelector('a.button[href]');
  return a && AEM_HEX_HREF.test(a.getAttribute('href'));
}

function isConfigValueParagraph(el) {
  if (el.tagName !== 'P') return false;
  if (el.classList.contains('button-container')) return isHexArtifactParagraph(el);
  if (el.querySelector('a, picture, img, strong, em, code')) return false;
  return AEM_CONFIG_VALUE.test(el.textContent.trim());
}

/**
 * Removes AEM field artifacts that appear as raw paragraphs on delivery when nested blocks
 * (colored-text, colored-button, etc.) inside columns are flattened by the AEM serializer.
 * Hex color field values become anchor links (#xxxxxx) which EDS decorates as buttons.
 * This runs only on delivery — never in the Universal Editor (author) context.
 */
function removeAemBlockFieldArtifacts(scope) {
  if (document.querySelector('[data-aue-resource]')) return;

  const removed = new Set();
  scope.querySelectorAll('p.button-container > a.button[href]').forEach((a) => {
    if (!AEM_HEX_HREF.test(a.getAttribute('href'))) return;
    const p = a.closest('p');
    if (!p || removed.has(p)) return;

    const toRemove = [p];
    let next = p.nextElementSibling;
    while (next && isConfigValueParagraph(next)) {
      toRemove.push(next);
      next = next.nextElementSibling;
    }

    toRemove.forEach((el) => {
      removed.add(el);
      el.remove();
    });
  });
}

function cleanupFieldNode(node) {
  const row = node?.parentElement;
  if (row && row.children?.length === 2 && row.children[1] === node) {
    row.remove();
  } else if (node) {
    node.remove();
  }
}

function getResourceRoot(scope, resource) {
  if (!resource) return null;
  const selector = `[data-aue-resource="${resource}"]`;
  return scope.querySelector(selector) || document.querySelector(selector);
}

function normalizeFieldLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getLabeledFieldValue(scope, labels) {
  if (!scope) return { node: null, value: '' };

  const acceptedLabels = new Set(labels.map(normalizeFieldLabel));
  const row = [...scope.querySelectorAll(':scope > div, :scope > div > div')]
    .filter((candidate) => !candidate.closest('.block'))
    .find((candidate) => (
      candidate.children?.length === 2
        && acceptedLabels.has(normalizeFieldLabel(candidate.children[0].textContent))
    ));

  if (!row) return { node: null, value: '' };
  const valueNode = row.children[1];
  const anchor = valueNode.querySelector('a');
  return {
    node: valueNode,
    row,
    value: anchor?.getAttribute('href') || valueNode.textContent.trim(),
  };
}

function getFieldValue(scope, name, resource) {
  const propSelector = `[data-aue-prop="${name}"]`;
  const resourceRoot = getResourceRoot(scope, resource);
  const node = (resourceRoot?.matches(propSelector) ? resourceRoot : null)
    || resourceRoot?.querySelector(propSelector)
    || (resource && document.querySelector(`[data-aue-resource="${resource}"]${propSelector}`))
    || (!resource ? scope.querySelector(propSelector) : null);
  if (!node) return { node: null, value: '', resource };
  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  const value = anchor?.getAttribute('href') || node.textContent.trim();
  const resolvedResource = resource || node.getAttribute('data-aue-resource') || resourceRoot?.getAttribute('data-aue-resource');
  return { node, value: value || '', resource: resolvedResource };
}

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?]+)/);
  return match ? match[1] : '';
}

function normalizeLinkValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.href || value.path || value.url || '').trim();
  }
  return '';
}

function normalizeConfigValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return String(
      value.value
        || value.name
        || value.label
        || value.text
        || '',
    ).trim();
  }
  return String(value).trim();
}

function normalizeTextAlignment(value) {
  const normalizedValue = normalizeConfigValue(value)
    .toLowerCase()
    .replace(/[^a-z]+/g, '-');

  return ['left', 'center', 'right', 'justify']
    .find((alignment) => normalizedValue.includes(alignment)) || '';
}

function normalizeTextColor(value) {
  const normalizedValue = normalizeConfigValue(value);
  if (!normalizedValue) return '';

  const hexMatch = normalizedValue.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalizedValue) && hexMatch) return hexMatch[0];

  return normalizedValue;
}

function normalizeFontSizeValue(value) {
  const normalizedValue = normalizeConfigValue(value);
  if (!normalizedValue) return '';

  const functionMatch = normalizedValue.match(/(?:clamp|calc|min|max)\([^)]+\)/i);
  if (functionMatch) return functionMatch[0];

  const lengthMatch = normalizedValue.match(/\b\d+(\.\d+)?(px|rem|em|%|vw|vh|vmin|vmax|ch|ex)\b/i);
  if (lengthMatch) return lengthMatch[0];

  if (/^\d+(\.\d+)?$/.test(normalizedValue)) return `${normalizedValue}px`;

  const normalizedToken = normalizedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const tokenSizes = {
    small: '0.875rem',
    base: '1rem',
    medium: '1.125rem',
    large: '1.25rem',
    xlarge: '1.5rem',
    'x-large': '1.5rem',
    xxlarge: '2rem',
    'xx-large': '2rem',
    '2x-large': '2rem',
  };
  if (tokenSizes[normalizedToken]) return tokenSizes[normalizedToken];

  return normalizedValue;
}

function inferDefaultContentModel(node) {
  if (!node) return '';
  if (node.dataset.aueModel) return node.dataset.aueModel;

  const propNames = new Set(
    [...node.querySelectorAll('[data-aue-prop]')]
      .map((element) => element.getAttribute('data-aue-prop'))
      .filter(Boolean),
  );

  if (propNames.has('text') || node.querySelector('[data-richtext-prop="text"]')) return 'text';
  if (propNames.has('title')) return 'title';
  if (propNames.has('image')) return 'image';
  if (propNames.has('link') || propNames.has('linkText') || propNames.has('linkTitle')) return 'button';

  return '';
}

function getDefaultContentComponentRoots(main) {
  return [...main.querySelectorAll('.default-content-wrapper [data-aue-resource]')]
    .filter((node) => !node.closest('.block'))
    .filter((node) => !node.parentElement?.closest('[data-aue-resource]'));
}

function instrumentDefaultContentComponents(main) {
  getDefaultContentComponentRoots(main).forEach((node) => {
    const model = inferDefaultContentModel(node);
    if (!model) return;

    node.dataset.aueType = 'component';
    node.dataset.aueModel = model;
  });
}

function getAuthorableTextRoots(main, propName) {
  const propNodes = [...main.querySelectorAll(`[data-aue-prop="${propName}"][data-aue-resource]`)];
  const modelNodes = [...main.querySelectorAll(`[data-aue-model="${propName}"][data-aue-resource]`)];
  const directDefaultNodes = [...main.querySelectorAll('.default-content-wrapper [data-aue-resource]')];
  const roots = [];
  const seenResources = new Set();

  [...propNodes, ...modelNodes, ...directDefaultNodes].forEach((node) => {
    const resource = node.getAttribute('data-aue-resource');
    if (!resource || seenResources.has(resource)) return;
    seenResources.add(resource);
    roots.push(node);
  });

  return roots;
}

function getDefaultContentStyleTarget(node, propName) {
  if (!node) return null;

  if (propName === 'title') {
    if (node.matches('h1, h2, h3, h4, h5, h6')) return node;
    const heading = node.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) return heading;
    if (node.matches('[data-aue-prop="title"]')) return node;
    const titleProp = node.querySelector('[data-aue-prop="title"]');
    if (titleProp) return titleProp;
    return node.closest('h1, h2, h3, h4, h5, h6') || node;
  }

  const preferredSelector = '[data-aue-prop="text"], p, div, ul, ol, blockquote, pre';

  if (node.matches(preferredSelector)) return node;

  const preferredChild = node.querySelector(preferredSelector);
  if (preferredChild) return preferredChild;

  return node.closest('h1, h2, h3, h4, h5, h6, p, div, ul, ol, blockquote, pre') || node;
}

function applyDefaultContentStyle(target, styles) {
  if (!target || !styles) return;
  if (styles.alignment) target.style.textAlign = styles.alignment;
  if (styles.color) target.style.setProperty('color', styles.color, 'important');
  if (styles.fontSize) target.style.fontSize = normalizeFontSizeValue(styles.fontSize);
}

const defaultContentStyleCache = new Map();

async function getDefaultContentStylesFromResource(resource) {
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return { alignment: '', color: '', fontSize: '' };
  if (defaultContentStyleCache.has(resourcePath)) return defaultContentStyleCache.get(resourcePath);

  const pendingStyles = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return { alignment: '', color: '', fontSize: '' };
      const data = await response.json();
      return {
        alignment: normalizeTextAlignment(data.alignment),
        color: normalizeTextColor(data.textColor),
        fontSize: normalizeFontSizeValue(data.fontSize),
      };
    })
    .catch(() => ({ alignment: '', color: '', fontSize: '' }));

  defaultContentStyleCache.set(resourcePath, pendingStyles);
  return pendingStyles;
}

function applyDefaultContentStyles(main, propName) {
  getAuthorableTextRoots(main, propName).forEach((node) => {
    const resource = node.getAttribute('data-aue-resource') || '';
    const fallbackScope = node.closest('.default-content-wrapper') || node.parentElement || main;
    const alignmentField = getFieldValue(main, 'alignment', resource);
    const colorField = getFieldValue(main, 'textColor', resource);
    const fontSizeField = getFieldValue(main, 'fontSize', resource);
    const fallbackAlignment = alignmentField.value ? { node: null, value: '' } : getLabeledFieldValue(
      fallbackScope,
      ['alignment', 'text alignment'],
    );
    const fallbackColor = colorField.value ? { node: null, value: '' } : getLabeledFieldValue(
      fallbackScope,
      ['text color', 'text colour', 'color', 'colour'],
    );
    const fallbackFontSize = fontSizeField.value ? { node: null, value: '' } : getLabeledFieldValue(
      fallbackScope,
      ['font size', 'fontsize', 'text size'],
    );
    const target = getDefaultContentStyleTarget(node, propName);
    const styles = {
      alignment: normalizeTextAlignment(alignmentField.value || fallbackAlignment.value),
      color: normalizeTextColor(colorField.value || fallbackColor.value),
      fontSize: normalizeFontSizeValue(fontSizeField.value || fallbackFontSize.value),
    };

    applyDefaultContentStyle(target, styles);
    cleanupFieldNode(alignmentField.node || fallbackAlignment.node);
    cleanupFieldNode(colorField.node || fallbackColor.node);
    cleanupFieldNode(fontSizeField.node || fallbackFontSize.node);

    if ((styles.alignment && styles.color && styles.fontSize) || !resource) return;

    getDefaultContentStylesFromResource(resource).then((resourceStyles) => {
      applyDefaultContentStyle(target, {
        alignment: styles.alignment || resourceStyles.alignment,
        color: styles.color || resourceStyles.color,
        fontSize: styles.fontSize || resourceStyles.fontSize,
      });
    });
  });
}

function normalizeButtonType(value) {
  const normalizedValue = normalizeConfigValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (['primary', 'secondary'].includes(normalizedValue)) return normalizedValue;
  if (['download', 'pdf', 'download-pdf', 'pdf-download'].includes(normalizedValue)) return 'download';
  return '';
}

function applyButtonType(button, type) {
  const normalizedType = normalizeButtonType(type);
  if (!button || !normalizedType) return;

  button.classList.remove('primary', 'secondary', 'download', 'pdf');
  button.classList.add(normalizedType);
}

const buttonTypeCache = new Map();

async function getButtonTypeFromResource(resource) {
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return '';
  if (buttonTypeCache.has(resourcePath)) return buttonTypeCache.get(resourcePath);

  const pendingType = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return '';
      const data = await response.json();
      return normalizeButtonType(data.linkType);
    })
    .catch(() => '');

  buttonTypeCache.set(resourcePath, pendingType);
  return pendingType;
}

function applyDefaultContentButtonStyles(main) {
  main.querySelectorAll('a.button').forEach((button) => {
    const resource = button.getAttribute('data-aue-resource')
      || button.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
      || '';
    const fallbackScope = button.closest('.button-container')?.parentElement
      || button.closest('.default-content-wrapper')
      || button.parentElement
      || main;
    const typeField = getFieldValue(main, 'linkType', resource);
    const fallbackType = typeField.value ? { node: null, value: '' } : getLabeledFieldValue(
      fallbackScope,
      ['type', 'link type', 'button type', 'button style'],
    );
    const type = normalizeButtonType(typeField.value || fallbackType.value);
    cleanupFieldNode(typeField.node || fallbackType.node);
    if (type) {
      applyButtonType(button, type);
      return;
    }

    if (!resource) return;
    getButtonTypeFromResource(resource).then((resourceType) => {
      applyButtonType(button, resourceType);
    });
  });
}

export function applyDefaultContentAuthorStyles(main) {
  instrumentDefaultContentComponents(main);
  applyDefaultContentStyles(main, 'title');
  applyDefaultContentStyles(main, 'text');
  applyDefaultContentButtonStyles(main);
}

function normalizeImageStyle(value) {
  const normalizedValue = normalizeConfigValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (
    normalizedValue === 'full'
      || normalizedValue.includes('full-width')
      || normalizedValue.includes('fullwidth')
      || normalizedValue === 'fit'
      || normalizedValue.includes('fit-container')
      || normalizedValue.includes('fitcontainer')
      || normalizedValue.includes('width-100')
      || normalizedValue.includes('width100')
  ) return 'full-width';

  return '';
}

const IMAGE_POSITION_CLASSES = ['align-left', 'align-center', 'align-right'];

function normalizeImagePosition(value) {
  const normalizedValue = normalizeConfigValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (IMAGE_POSITION_CLASSES.includes(normalizedValue)) return normalizedValue;

  const position = ['left', 'center', 'right']
    .find((candidate) => normalizedValue.split('-').includes(candidate));

  return position ? `align-${position}` : '';
}

function applyImageStyle(imageElement, style) {
  const normalizedStyle = normalizeImageStyle(style);
  if (!imageElement || normalizedStyle !== 'full-width') return;

  const frame = imageElement.closest('picture') || imageElement;
  frame.classList.add('image-fit-container');
  const anchor = frame.closest('a');
  if (anchor && anchor.children.length === 1) {
    anchor.classList.add('image-fit-container-link');
  }
}

function applyAnchorToImage(imageElement, href, rawTarget = '_self') {
  if (!imageElement || !href) return;
  const target = ['_self', '_blank', '_parent', '_top'].includes(rawTarget) ? rawTarget : '_self';
  const existingAnchor = imageElement.closest('a');
  const anchor = existingAnchor || document.createElement('a');
  anchor.href = href;
  anchor.target = target;
  if (target === '_blank') {
    anchor.rel = 'noopener noreferrer';
  } else {
    anchor.removeAttribute('rel');
  }

  if (!existingAnchor) {
    imageElement.replaceWith(anchor);
    anchor.append(imageElement);
  }

  if (imageElement.classList.contains('image-fit-container')) {
    anchor.classList.add('image-fit-container-link');
  }
}

function applyImagePosition(imageElement, position, root) {
  if (!imageElement) return;

  const normalizedPosition = normalizeImagePosition(position);
  const frame = imageElement.closest('picture') || imageElement;
  const anchor = frame.closest('a');
  const rootTarget = root && (root === frame || root.contains?.(frame))
    ? root
    : frame.parentElement;
  const targets = new Set([rootTarget, frame, anchor].filter(Boolean));

  targets.forEach((target) => {
    target.classList.remove('image-positioned', ...IMAGE_POSITION_CLASSES);
  });

  if (!normalizedPosition) {
    return;
  }

  targets.forEach((target) => {
    target.classList.add('image-positioned', normalizedPosition);
  });
}

const imageConfigCache = new Map();

async function resolveImageConfigFromResource(resourcePath) {
  if (!resourcePath) {
    return {
      href: '', target: '_self', style: '', position: '',
    };
  }
  if (imageConfigCache.has(resourcePath)) return imageConfigCache.get(resourcePath);

  const promise = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) {
        return {
          href: '', target: '_self', style: '', position: '',
        };
      }
      const data = await response.json();
      const href = normalizeLinkValue(data.imageLink);
      const target = normalizeLinkValue(data.imageTarget) || '_self';
      const style = normalizeImageStyle(data.imageStyle);
      const position = normalizeImagePosition(data.imagePosition);
      return {
        href, target, style, position,
      };
    })
    .catch(() => ({
      href: '', target: '_self', style: '', position: '',
    }));

  imageConfigCache.set(resourcePath, promise);
  return promise;
}

function applyImageLinksFromAue(main) {
  const imageNodes = main.querySelectorAll('[data-aue-prop="image"], [data-aue-model="image"]');
  imageNodes.forEach((node) => {
    const resource = node.getAttribute('data-aue-resource')
      || node.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
      || '';
    const fallbackScope = node.closest('.default-content-wrapper') || node.parentElement || main;
    const { node: linkNode, value: href } = getFieldValue(main, 'imageLink', resource);
    const { node: targetNode, value: rawTarget } = getFieldValue(main, 'imageTarget', resource);
    const { node: styleNode, value: rawStyle } = getFieldValue(main, 'imageStyle', resource);
    const { node: positionNode, value: rawPosition } = getFieldValue(main, 'imagePosition', resource);
    const fallbackStyle = rawStyle ? { node: null, value: '' } : getLabeledFieldValue(
      fallbackScope,
      ['image style', 'image size', 'image display', 'image fit'],
    );
    const fallbackPosition = rawPosition ? { node: null, value: '' } : getLabeledFieldValue(
      fallbackScope,
      ['image position', 'image alignment', 'horizontal alignment', 'position'],
    );
    const image = node.tagName === 'IMG' ? node : node.querySelector('img');
    if (!image) return;
    const imageElement = image.closest('picture') || image;
    const imageStyle = normalizeImageStyle(rawStyle || fallbackStyle.value);
    const imagePosition = normalizeImagePosition(rawPosition || fallbackPosition.value);
    cleanupFieldNode(styleNode || fallbackStyle.node);
    cleanupFieldNode(positionNode || fallbackPosition.node);
    applyImagePosition(imageElement, imagePosition, node);
    if (imageStyle) {
      applyImageStyle(imageElement, imageStyle);
    }

    if (href) {
      cleanupFieldNode(linkNode);
      cleanupFieldNode(targetNode);
      applyAnchorToImage(imageElement, href, rawTarget);
    }

    const resourcePath = resourcePathFromUrn(resource);
    if (!resourcePath) return;
    resolveImageConfigFromResource(resourcePath).then(({
      href: resolvedHref,
      target,
      style,
      position,
    }) => {
      if (style && !imageStyle) applyImageStyle(imageElement, style);
      if (position && !imagePosition) applyImagePosition(imageElement, position, node);
      if (href || !resolvedHref) return;
      applyAnchorToImage(imageElement, resolvedHref, target);
    });
  });
}

function applyImageLinksFromRows(main) {
  main.querySelectorAll('.default-content-wrapper').forEach((wrapper) => {
    const rows = [...wrapper.querySelectorAll(':scope > div')];
    if (!rows.length) return;

    let href = '';
    let target = '_self';
    let imageStyle = '';
    let imagePosition = '';
    const rowsToRemove = [];
    rows.forEach((row) => {
      if (row.children.length !== 2) return;
      const key = row.children[0].textContent.trim().toLowerCase();
      const valueNode = row.children[1];
      const valueText = valueNode.textContent.trim();
      const linkAnchor = valueNode.querySelector('a');
      if (key === 'link (optional)' || key === 'image link') {
        href = linkAnchor?.getAttribute('href') || valueText;
        rowsToRemove.push(row);
      } else if (key === 'open link in' || key === 'image target') {
        target = valueText || '_self';
        rowsToRemove.push(row);
      } else if (['image style', 'image size', 'image display', 'image fit'].includes(key)) {
        imageStyle = normalizeImageStyle(valueText);
        rowsToRemove.push(row);
      } else if (['image position', 'image alignment', 'horizontal alignment', 'position'].includes(key)) {
        imagePosition = normalizeImagePosition(valueText);
        rowsToRemove.push(row);
      }
    });

    const image = wrapper.querySelector('img');
    if (!image) return;
    const imageElement = image.closest('picture') || image;
    if (imagePosition) applyImagePosition(imageElement, imagePosition, wrapper);
    if (imageStyle) applyImageStyle(imageElement, imageStyle);
    if (href) applyAnchorToImage(imageElement, href, target);
    rowsToRemove.forEach((row) => row.remove());
  });
}

export function applyImageLinks(main) {
  applyImageLinksFromAue(main);
  applyImageLinksFromRows(main);
}

const SPACING_FIELDS = [
  { name: 'topSpacing', cssProp: 'margin-top' },
  { name: 'bottomSpacing', cssProp: 'margin-bottom' },
];

function normalizeSpacingValue(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

export function applySectionSpacing(main) {
  main.querySelectorAll('.section').forEach((section) => {
    SPACING_FIELDS.forEach(({ name, cssProp }) => {
      const lowerName = name.toLowerCase();
      let raw = section.dataset[name] || section.dataset[lowerName] || '';

      if (!raw) {
        const node = section.querySelector(`[data-aue-prop="${name}"]`);
        if (node) {
          raw = node.textContent;
          cleanupFieldNode(node);
        }
      }

      delete section.dataset[name];
      delete section.dataset[lowerName];

      const value = normalizeSpacingValue(raw);
      if (value) section.style.setProperty(cssProp, value, 'important');
    });
  });
}

// Inline color syntax: {#hex}text{#hex} → <span style="color:#hex">text</span>
// Hex must be 3, 4, 6, or 8 digits. Open and close hex must match (regex backref).
const INLINE_COLOR_RE = /\{(#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3}))\}([\s\S]*?)\{\1\}/g;
const INLINE_COLOR_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE']);

export function decorateInlineColors(main) {
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (INLINE_COLOR_SKIP_TAGS.has(node.parentNode?.nodeName)) return NodeFilter.FILTER_REJECT;
      return node.nodeValue.includes('{#') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  const targets = [];
  let current = walker.nextNode();
  while (current) {
    targets.push(current);
    current = walker.nextNode();
  }

  targets.forEach((textNode) => {
    const text = textNode.nodeValue;
    const re = new RegExp(INLINE_COLOR_RE.source, 'g');
    let match = re.exec(text);
    if (!match) return;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (match) {
      const [full, color, inner] = match;
      if (match.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      const span = document.createElement('span');
      span.style.color = color;
      span.textContent = inner;
      frag.appendChild(span);
      last = match.index + full.length;
      match = re.exec(text);
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.replaceWith(frag);
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  applySectionSpacing(main);
  decorateBlocks(main);
  applyDefaultContentAuthorStyles(main);
  applyImageLinks(main);
  decoratePdfLinks(main);
  decorateInlineColors(main);
}

function startHeaderLoad(doc) {
  if (window.isErrorPage) return;

  const header = doc.querySelector('header');
  if (!header || header.dataset.headerLoading === 'true' || header.querySelector('.header')) return;

  header.dataset.headerLoading = 'true';
  header.classList.add('is-shell-loading');

  loadHeader(header)
    .catch(() => {})
    .finally(() => {
      header.classList.remove('is-shell-loading');
      header.dataset.headerLoading = 'false';
    });
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  startHeaderLoad(doc);
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
    decoratePdfLinks(main);
    removeAemBlockFieldArtifacts(main);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  startHeaderLoad(doc);

  if (!window.isErrorPage) {
    loadFooter(doc.querySelector('footer'));
    let getHelpHost = doc.querySelector('.get-help-host');
    if (!getHelpHost) {
      getHelpHost = doc.createElement('div');
      getHelpHost.className = 'get-help-host';
      doc.body.append(getHelpHost);
    }
    loadGetHelp(getHelpHost);

    let cookieConsentHost = doc.querySelector('.cookie-consent-host');
    if (!cookieConsentHost) {
      cookieConsentHost = doc.createElement('div');
      cookieConsentHost.className = 'cookie-consent-host';
      doc.body.append(cookieConsentHost);
    }
    loadCookieConsent(cookieConsentHost);
  }

  await loadSections(main);
  if (main) decoratePdfLinks(main);
  if (main) removeAemBlockFieldArtifacts(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
