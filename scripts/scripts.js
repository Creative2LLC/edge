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

function cleanupFieldNode(node) {
  const row = node?.parentElement;
  if (row && row.children?.length === 2 && row.children[1] === node) {
    row.remove();
  } else if (node) {
    node.remove();
  }
}

function getFieldValue(scope, name, resource) {
  const resourceSelector = resource
    ? `[data-aue-resource="${resource}"][data-aue-prop="${name}"]`
    : null;
  const node = (resourceSelector && document.querySelector(resourceSelector))
    || scope.querySelector(`[data-aue-prop="${name}"]`);
  if (!node) return { node: null, value: '', resource };
  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  const value = anchor?.getAttribute('href') || node.textContent.trim();
  const resolvedResource = resource || node.getAttribute('data-aue-resource');
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
  decorateBlocks(main);
  applyImageLinks(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
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
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));
  let getHelpHost = doc.querySelector('.get-help-host');
  if (!getHelpHost) {
    getHelpHost = doc.createElement('div');
    getHelpHost.className = 'get-help-host';
    doc.body.append(getHelpHost);
  }
  loadGetHelp(getHelpHost);

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
