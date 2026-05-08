import { moveAttributes } from '../../scripts/scripts.js';

function normalizeHeight(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^[0-9]*\.?[0-9]+$/.test(trimmed)) return `${trimmed}rem`;
  if (/^[0-9]*\.?[0-9]+rem$/.test(trimmed)) return trimmed;
  return null;
}

function getFieldValue(block, nameOrNames) {
  const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const source = block.querySelector(`[data-aue-prop="${name}"]`)
      || block.querySelector(`[data-richtext-prop="${name}"]`);
    if (source) {
      return { source, value: source.textContent.trim() };
    }
  }
  return { source: null, value: '' };
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

function getLinkFieldValue(block, name) {
  const { source, value } = getFieldValue(block, name);
  if (!source) return { source: null, value: '', href: '' };
  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  return {
    source,
    value,
    href: anchor?.href || value,
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

function buildHtmlText(block) {
  const { source } = getFieldValue(block, ['content_textHtml', 'text_html']);
  if (!source) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'hero-text-html';
  moveFieldBinding(source, wrapper);
  while (source.firstChild) {
    wrapper.append(source.firstChild);
  }
  if (!wrapper.textContent.trim()) return null;

  const { value: classValue } = getFieldValue(block, ['content_textHtmlClass', 'textHtmlClass']);
  if (classValue) {
    const classes = classValue.split(/\s+/).filter(Boolean);
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

function readTextColor(block) {
  const rowsToRemove = [];
  let rawValue = null;

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

  rowsToRemove.forEach((row) => row.remove());
  return normalizeHexColor(rawValue);
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

function buildMainRichText(block) {
  const { source } = getFieldValue(block, ['content_text', 'text']);
  if (source) {
    const richText = document.createElement('div');
    richText.className = 'hero-richtext';
    moveFieldBinding(source, richText);
    while (source.firstChild) {
      richText.append(source.firstChild);
    }
    if (!richText.textContent.trim()) return null;
    return richText;
  }

  const fallback = document.createElement('div');
  fallback.className = 'hero-richtext';
  const ignoredTextValues = new Set([
    'default',
    'homepage',
    'show',
    'hide',
    'left',
    'center',
    'right',
  ]);
  const fallbackNodes = [
    ...block.querySelectorAll('h1, h2, h3, h4, h5, h6, p'),
  ].filter((node) => {
    if (node.hasAttribute('data-aue-prop') || node.hasAttribute('data-richtext-prop')) return false;
    if (node.closest('[data-aue-prop], [data-richtext-prop], picture, video')) return false;
    const text = node.textContent.trim();
    if (!text) return false;
    if (ignoredTextValues.has(text.toLowerCase())) return false;
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return false;
    if (/^\d+(\.\d+)?(rem|px|%)?$/.test(text)) return false;
    return true;
  });
  fallbackNodes.forEach((node) => fallback.append(node.cloneNode(true)));
  if (!fallback.textContent.trim()) return null;
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

function buildActions(block) {
  const buttonStyle = normalizeChoice(
    getFieldValue(block, ['action_style', 'ctaStyle']).value,
    ['outline', 'solid', 'inverted'],
    'outline',
  );

  const rows = [
    {
      text: getFieldValue(block, ['action_1Text', 'cta1Text']),
      link: getLinkFieldValue(block, ['action_1Link', 'cta1Link']),
    },
    {
      text: getFieldValue(block, ['action_2Text', 'cta2Text']),
      link: getLinkFieldValue(block, ['action_2Link', 'cta2Link']),
    },
    {
      text: getFieldValue(block, ['action_3Text', 'cta3Text']),
      link: getLinkFieldValue(block, ['action_3Link', 'cta3Link']),
    },
  ];

  const actions = document.createElement('div');
  actions.className = 'hero-actions';

  rows.forEach((row) => {
    const button = buildActionButton(row.text, row.link, buttonStyle);
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

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?(#.*)?$/i;

function isVideoUrl(value) {
  if (!value || typeof value !== 'string') return false;
  return VIDEO_EXT_RE.test(value.trim());
}

function findVideoInElement(el) {
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
    if (href) return href;
  }
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
  const videoAnchorMatch = anchors.find((a) => isVideoUrl(a.getAttribute('href') || ''));
  if (videoAnchorMatch) return videoAnchorMatch.getAttribute('href');
  const firstAnchor = anchors.find((a) => a.getAttribute('href'));
  if (firstAnchor) return firstAnchor.getAttribute('href');
  // 5. Plain text content that looks like a video URL/path
  const text = el.textContent?.trim() || '';
  if (text && (isVideoUrl(text) || text.startsWith('/') || text.startsWith('http'))) {
    return text;
  }
  return '';
}

function extractVideoUrl(block) {
  // 1. Try the named field first
  const named = block.querySelector('[data-aue-prop="media_video"]')
    || block.querySelector('[data-aue-prop="video"]');
  if (named) {
    const url = findVideoInElement(named);
    if (url) return { source: named, url };
  }

  // 2. Block-wide scan for any anchor whose href looks like a video file.
  //    Catches the case where EDS auto-linked the asset path and dropped the
  //    data-aue-prop marker (same trick we use for color rows elsewhere).
  const videoAnchor = [...block.querySelectorAll('a[href]')]
    .find((a) => isVideoUrl(a.getAttribute('href')));
  if (videoAnchor) {
    return { source: videoAnchor, url: videoAnchor.getAttribute('href') };
  }

  // 3. Block-wide scan for an actual <video> element
  const anyVideo = block.querySelector('video');
  if (anyVideo) {
    const src = anyVideo.getAttribute('src')
      || anyVideo.querySelector('source')?.getAttribute('src') || '';
    if (src) return { source: anyVideo, url: src };
  }

  // 4. Last resort: scan every direct row for plain-text video paths
  const rows = [...block.querySelectorAll(':scope > div')];
  const rowMatch = rows.find((row) => isVideoUrl(row.textContent.trim()));
  if (rowMatch) return { source: rowMatch, url: rowMatch.textContent.trim() };

  return { source: null, url: '' };
}

function buildVideoElement(url, posterUrl) {
  const video = document.createElement('video');
  video.className = 'hero-video';
  video.src = url;
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
  const imageField = getFieldValue(block, ['media_image', 'image']);
  let picture = pictureInSource(imageField.source, exclude);
  if (!picture) {
    picture = [...block.querySelectorAll('picture')].find((p) => !exclude.includes(p)) || null;
  }
  if (!picture) return null;

  if (imageField.source && imageField.source !== picture) {
    moveFieldBinding(imageField.source, picture);
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
  const imageField = getFieldValue(block, ['media_featuredImage', 'featuredImage']);
  if (!imageField.source) return null;

  let picture = pictureInSource(imageField.source, exclude);
  if (!picture) {
    picture = [...block.querySelectorAll('picture')].find((p) => !exclude.includes(p)) || null;
  }
  if (!picture) return null;

  if (imageField.source !== picture) {
    moveFieldBinding(imageField.source, picture);
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

  const textColor = readTextColor(block);
  const picture = extractPicture(block);
  const featuredImage = extractFeaturedPicture(block, picture ? [picture] : []);
  const { url: videoUrl, source: videoSource } = extractVideoUrl(block);
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
  const richText = buildMainRichText(block);
  if (richText) {
    applyAccentBrackets(richText);
  }
  const htmlText = buildHtmlText(block);
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
