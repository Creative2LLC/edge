import {
  loadHeader,
  loadFooter,
  loadGetHelp,
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

function decoratePdfLinks(scope) {
  scope.querySelectorAll('a[href]').forEach((link) => {
    if (!isPdfHref(link.getAttribute('href'))) return;

    link.removeAttribute('download');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
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

function getFieldValue(scope, name, resource) {
  const propSelector = `[data-aue-prop="${name}"]`;
  const resourceRoot = getResourceRoot(scope, resource);
  const node = (resourceRoot?.matches(propSelector) ? resourceRoot : null)
    || resourceRoot?.querySelector(propSelector)
    || (resource && document.querySelector(`[data-aue-resource="${resource}"]${propSelector}`))
    || scope.querySelector(propSelector);
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

function normalizeTextAlignment(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  return ['left', 'center', 'right', 'justify'].includes(normalizedValue) ? normalizedValue : '';
}

function normalizeTextColor(value) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return '';

  const hexMatch = normalizedValue.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalizedValue) && hexMatch) return hexMatch[0];

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
}

const defaultContentStyleCache = new Map();

async function getDefaultContentStylesFromResource(resource) {
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return { alignment: '', color: '' };
  if (defaultContentStyleCache.has(resourcePath)) return defaultContentStyleCache.get(resourcePath);

  const pendingStyles = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return { alignment: '', color: '' };
      const data = await response.json();
      return {
        alignment: normalizeTextAlignment(data.alignment),
        color: normalizeTextColor(data.textColor),
      };
    })
    .catch(() => ({ alignment: '', color: '' }));

  defaultContentStyleCache.set(resourcePath, pendingStyles);
  return pendingStyles;
}

function applyDefaultContentStyles(main, propName) {
  getAuthorableTextRoots(main, propName).forEach((node) => {
    const resource = node.getAttribute('data-aue-resource') || '';
    const { node: alignmentNode, value: rawAlignment } = getFieldValue(main, 'alignment', resource);
    const { node: colorNode, value: rawColor } = getFieldValue(main, 'textColor', resource);
    const target = getDefaultContentStyleTarget(node, propName);
    const styles = {
      alignment: normalizeTextAlignment(rawAlignment),
      color: normalizeTextColor(rawColor),
    };

    applyDefaultContentStyle(target, styles);
    cleanupFieldNode(alignmentNode);
    cleanupFieldNode(colorNode);

    if ((styles.alignment && styles.color) || !resource) return;

    getDefaultContentStylesFromResource(resource).then((resourceStyles) => {
      applyDefaultContentStyle(target, {
        alignment: styles.alignment || resourceStyles.alignment,
        color: styles.color || resourceStyles.color,
      });
    });
  });
}

export function applyDefaultContentAuthorStyles(main) {
  instrumentDefaultContentComponents(main);
  applyDefaultContentStyles(main, 'title');
  applyDefaultContentStyles(main, 'text');
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
}

const imageLinkCache = new Map();

async function resolveImageLinkFromResource(resourcePath) {
  if (!resourcePath) return { href: '', target: '_self' };
  if (imageLinkCache.has(resourcePath)) return imageLinkCache.get(resourcePath);

  const promise = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return { href: '', target: '_self' };
      const data = await response.json();
      const href = normalizeLinkValue(data.imageLink);
      const target = normalizeLinkValue(data.imageTarget) || '_self';
      return { href, target };
    })
    .catch(() => ({ href: '', target: '_self' }));

  imageLinkCache.set(resourcePath, promise);
  return promise;
}

function applyImageLinksFromAue(main) {
  const imageNodes = main.querySelectorAll('[data-aue-prop="image"], [data-aue-model="image"]');
  imageNodes.forEach((node) => {
    const resource = node.getAttribute('data-aue-resource')
      || node.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
      || '';
    const { node: linkNode, value: href } = getFieldValue(main, 'imageLink', resource);
    const { node: targetNode, value: rawTarget } = getFieldValue(main, 'imageTarget', resource);
    const image = node.tagName === 'IMG' ? node : node.querySelector('img');
    if (!image) return;
    const imageElement = image.closest('picture') || image;
    if (href) {
      cleanupFieldNode(linkNode);
      cleanupFieldNode(targetNode);
      applyAnchorToImage(imageElement, href, rawTarget);
      return;
    }

    const resourcePath = resourcePathFromUrn(resource);
    if (!resourcePath) return;
    resolveImageLinkFromResource(resourcePath).then(({ href: resolvedHref, target }) => {
      if (!resolvedHref) return;
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
      }
    });

    if (!href) return;
    const image = wrapper.querySelector('img');
    if (!image) return;
    const imageElement = image.closest('picture') || image;
    applyAnchorToImage(imageElement, href, target);
    rowsToRemove.forEach((row) => row.remove());
  });
}

function applyImageLinks(main) {
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

function applySectionSpacing(main) {
  main.querySelectorAll(':scope > div').forEach((section) => {
    SPACING_FIELDS.forEach(({ name, cssProp }) => {
      const node = section.querySelector(`[data-aue-prop="${name}"]`);
      if (!node) return;
      const value = normalizeSpacingValue(node.textContent);
      cleanupFieldNode(node);
      if (value) section.style.setProperty(cssProp, value, 'important');
    });
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
  applySectionSpacing(main);
  decorateSections(main);
  decorateBlocks(main);
  applyDefaultContentAuthorStyles(main);
  applyImageLinks(main);
  decoratePdfLinks(main);
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
  }

  await loadSections(main);
  if (main) decoratePdfLinks(main);

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
