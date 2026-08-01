/*
 * Resource Downloads block — the download list on resource landing pages.
 * Each item is backed by a backend resource slug (preferred; pulls title,
 * file, thumbnail, video, and gating from the API) or a direct DAM file,
 * and renders in a dedicated, color-coded card per file type (PDF, Word,
 * PowerPoint, ZIP, spreadsheet), an in-page video player, the Informative
 * card (type badge + audience/time/format — also available as a stacked
 * card or a full-width banner), or a compact row — picked automatically by
 * file type or overridden per item. Consecutive "grouped"
 * items merge into a single
 * card with stacked buttons. Gated items go through the shared registration
 * modal in scripts/resource-gate.js; downloads fire GA4 + backend events.
 *
 * The backend stamps apiBaseUrl/slug/gated onto this block and seeds the
 * first item when it auto-creates a landing page for a DAM asset.
 */

import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import {
  getBlockRows,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import { bindGatedLink, isRegistered, openRegistrationModal } from '../../scripts/resource-gate.js';
import { trackEvent } from '../../scripts/analytics.js';

const LOCKED_LABEL = 'Locked';

const FILE_EXTENSION_PATTERN = /\.(pdf|docx?|pptx?|zip|xlsx?|mp4|mov)([?#]|$)/i;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg)([?#]|$)/i;
const VIDEO_EXTENSIONS = ['mp4', 'mov'];

// Single source of truth for each resource type's dedicated, color-coded
// treatment — drives both the per-type cards and the Informative card badge.
// `accent` is exposed to CSS as --rd-accent so styling is data-driven, not a
// rule-per-type.
const TYPE_THEMES = {
  pdf: {
    accent: '#d7263d',
    abbr: 'PDF',
    badgeLabel: 'PDF',
    title: 'Download PDF',
    format: 'PDF Document',
    contains: 'This download contains:',
  },
  word: {
    accent: '#2b579a',
    abbr: 'DOC',
    badgeLabel: 'Word Document',
    title: 'Download Document',
    format: 'Word Document',
    contains: 'This document contains:',
  },
  powerpoint: {
    accent: '#d24726',
    abbr: 'PPT',
    badgeLabel: 'Presentation',
    title: 'Download PowerPoint',
    format: 'Presentation (PowerPoint)',
    contains: 'This presentation contains:',
  },
  spreadsheet: {
    accent: '#217346',
    abbr: 'XLS',
    badgeLabel: 'Spreadsheet',
    title: 'Download Spreadsheet',
    format: 'Spreadsheet (Excel)',
    contains: 'This spreadsheet contains:',
  },
  bundle: {
    accent: '#5f6b7a',
    abbr: 'ZIP',
    badgeLabel: 'Bundle',
    title: 'Download Bundle',
    format: 'Download Bundle',
    contains: 'This bundle contains:',
  },
  video: {
    accent: '#008db6',
    abbr: 'PLAY',
    badgeLabel: 'Video',
    title: 'Watch Video',
    format: 'Video',
    contains: 'This video covers:',
  },
  file: {
    accent: '#00264d',
    abbr: 'FILE',
    badgeLabel: 'File',
    title: 'Download Resource',
    format: '',
    contains: 'This download contains:',
  },
};

const EXTENSION_TYPE = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  zip: 'bundle',
  mp4: 'video',
  mov: 'video',
};

// Type keys double as explicit display-style values; the older abstract
// "card"/"feature" values map to the auto type card for backward compatibility.
const TYPE_STYLE_KEYS = ['pdf', 'word', 'powerpoint', 'spreadsheet', 'bundle', 'video'];
const INFORMATIVE_STYLES = ['informative', 'informative-stacked', 'informative-banner'];
const DISPLAY_STYLES = [...TYPE_STYLE_KEYS, 'row', 'card', 'feature', 'grouped', ...INFORMATIVE_STYLES];

function typeTheme(key) {
  return TYPE_THEMES[key] || TYPE_THEMES.file;
}
const INFORMATIVE_META_FIELD_BY_INDEX = {
  10: 'informativeAudienceLabel',
  11: 'informativeAudienceText',
  12: 'informativeTimeLabel',
  13: 'informativeTimeText',
  14: 'informativeFormatLabel',
  15: 'informativeFormatText',
};
const DEFAULT_API_BASE_URL = 'https://stunning-dust-ntqeawud3dqy.on-vapor.com';
// AEM publish tier — the public host that serves DAM files. Used to turn a
// raw /content/dam/ path into a working URL when no backend resource is found.
const PUBLISH_BASE_URL = 'https://publish-p171653-e1855116.adobeaemcloud.com';
const DEFAULT_VIDEO_POSTER_PATH = '/blocks/header/ncmec-brand-mark.svg';
const INFORMATIVE_META_PREFIXES = [
  ['informativeAudienceLabel', /^audience label\s*:\s*/i],
  ['informativeAudienceText', /^(primary audience|audience)\s*:\s*/i],
  ['informativeTimeLabel', /^time label\s*:\s*/i],
  ['informativeTimeText', /^(time|length)\s*:\s*/i],
  ['informativeFormatLabel', /^format label\s*:\s*/i],
  ['informativeFormatText', /^(format|resource type)\s*:\s*/i],
];

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function codeAssetPath(path) {
  return `${window.hlx?.codeBasePath || ''}${path}`;
}

function isUrlLike(value) {
  return /^https?:\/\//i.test(normalizeText(value));
}

function isImageHref(href) {
  return IMAGE_EXTENSION_PATTERN.test(normalizeText(href));
}

function isFileHref(href) {
  const value = normalizeText(href);
  if (!value || isImageHref(value)) return false;
  return value.includes('/content/dam/') || FILE_EXTENSION_PATTERN.test(value);
}

function isSlugLike(value) {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(normalizeText(value));
}

function fileNameFrom(href) {
  return normalizeText(href).split(/[?#]/)[0].split('/').pop() || '';
}

function fileExtensionFrom(href) {
  const name = fileNameFrom(href);
  return name.includes('.') ? name.split('.').pop().toLowerCase() : '';
}

function isVideoFile(url) {
  return VIDEO_EXTENSIONS.includes(fileExtensionFrom(url));
}

function videoMimeType(url) {
  const extension = fileExtensionFrom(url);
  if (extension === 'mov') return 'video/quicktime';
  return `video/${extension || 'mp4'}`;
}

function titleFromFileName(href) {
  const name = fileNameFrom(href);
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// A /content/dam/ asset only resolves on the publish tier, never on the site
// domain. Pull the DAM path out of whatever form it arrives in — a bare path,
// or an absolute site URL the browser already resolved — and point it at the
// publish host. Non-DAM URLs (e.g. YouTube) pass through untouched.
function resolveDamUrl(href) {
  const value = normalizeText(href);
  if (!value) return '';
  const match = value.match(/\/content\/dam\/[^?#"'\s]+/);
  if (match) return `${PUBLISH_BASE_URL}${match[0]}`;
  return value;
}

function parseInformativeMetaOverride(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const match = INFORMATIVE_META_PREFIXES.find(([, pattern]) => pattern.test(text));
  if (!match) return null;

  const [name, pattern] = match;
  return { name, value: normalizeText(text.replace(pattern, '')) };
}

function slugFromPathname(pathname = window.location.pathname) {
  const cleanPath = normalizeText(pathname);
  const pathWithoutExtension = cleanPath.toLowerCase().endsWith('.html')
    ? cleanPath.slice(0, -5)
    : cleanPath;

  return pathWithoutExtension
    .split('/')
    .filter(Boolean)
    .pop() || '';
}

function isEditorContext(block) {
  return Boolean(
    block.closest('[data-aue-resource]')
    || block.querySelector('[data-aue-prop], [data-aue-resource], [data-richtext-prop]'),
  );
}

function emptyItem(row = null) {
  return {
    row,
    title: '',
    description: '',
    buttonLabel: '',
    resourceSlug: '',
    fileHref: '',
    imageEl: null,
    imageSrc: '',
    videoUrl: '',
    displayStyle: '',
    gatedOverride: '',
    informativeAudienceLabel: '',
    informativeAudienceText: '',
    informativeTimeLabel: '',
    informativeTimeText: '',
    informativeFormatLabel: '',
    informativeFormatText: '',
  };
}

// ── Config/item extraction ───────────────────────────────────────────────────

function isEditorItemRow(row) {
  const model = row.getAttribute('data-aue-model') || '';
  if (model) return model === 'resource-download-item';
  if (!row.hasAttribute('data-aue-resource')) return false;
  return Boolean(row.querySelector(
    '[data-aue-prop="itemTitle"], [data-richtext-prop="itemDescription"], [data-aue-prop="resourceSlug"], [data-aue-prop="file"], [data-aue-prop="filePath"]',
  )) || !row.querySelector('[data-aue-prop="apiBaseUrl"], [data-aue-prop="slug"]');
}

function parseEditorItem(row) {
  const item = emptyItem(row);
  const image = readImageField(row, 'image');

  item.title = normalizeText(readTextField(row, 'itemTitle').value);
  item.description = readRichTextField(row, 'itemDescription').html || '';
  item.buttonLabel = normalizeText(readTextField(row, 'buttonLabel').value);
  item.resourceSlug = normalizeText(readTextField(row, 'resourceSlug').value);
  item.fileHref = normalizeText(
    readTextField(row, 'filePath').value || readLinkField(row, 'file').value,
  );
  item.videoUrl = normalizeText(readLinkField(row, 'videoUrl').value);
  item.displayStyle = normalizeText(readTextField(row, 'displayStyle').value).toLowerCase();
  item.gatedOverride = normalizeText(readTextField(row, 'gated').value).toLowerCase();
  item.informativeAudienceLabel = normalizeText(
    readTextField(row, 'informativeAudienceLabel').value,
  );
  item.informativeAudienceText = normalizeText(
    readTextField(row, 'informativeAudienceText').value,
  );
  item.informativeTimeLabel = normalizeText(readTextField(row, 'informativeTimeLabel').value);
  item.informativeTimeText = normalizeText(readTextField(row, 'informativeTimeText').value);
  item.informativeFormatLabel = normalizeText(readTextField(row, 'informativeFormatLabel').value);
  item.informativeFormatText = normalizeText(readTextField(row, 'informativeFormatText').value);
  item.imageEl = image.picture || null;
  item.imageSrc = image.img?.src || '';

  return item;
}

function readEditorContent(block) {
  const rows = getBlockRows(block);
  const itemRows = rows.filter((row) => isEditorItemRow(row));
  const configScope = document.createElement('div');
  rows.filter((row) => !itemRows.includes(row))
    .forEach((row) => configScope.append(row.cloneNode(true)));

  return {
    config: {
      apiBaseUrl: normalizeText(readTextField(configScope, 'apiBaseUrl').value)
        || DEFAULT_API_BASE_URL,
      slug: normalizeText(readTextField(configScope, 'slug').value),
      gated: normalizeText(readTextField(configScope, 'gated').value).toLowerCase(),
      layout: normalizeText(readTextField(configScope, 'layout').value).toLowerCase(),
    },
    items: itemRows.map((row) => parseEditorItem(row)),
    rows,
  };
}

function parsePublishedItem(row) {
  const item = emptyItem(row);
  const freeCells = [];

  [...row.children].forEach((cell, cellIndex) => {
    const picture = cell.querySelector('picture');
    const img = cell.querySelector('img');
    if (picture || img) {
      const src = (img || picture?.querySelector('img'))?.src || '';
      // A video/file reference can render as an <img> — it's the file, not a
      // poster. Never treat it as an image (avoids a broken poster request).
      if (isVideoFile(src) || isFileHref(src)) {
        if (!item.fileHref) item.fileHref = src;
      } else if (!item.imageEl) {
        item.imageEl = picture || img;
        item.imageSrc = src;
      }
      return;
    }

    const anchor = cell.querySelector('a');
    const href = normalizeText(anchor?.getAttribute('href'));
    const text = normalizeText(cell.textContent);
    const indexedMetaField = INFORMATIVE_META_FIELD_BY_INDEX[cellIndex];
    if (indexedMetaField) {
      item[indexedMetaField] = text;
      return;
    }

    const prefixedMetaField = parseInformativeMetaOverride(text);
    if (prefixedMetaField) {
      item[prefixedMetaField.name] = prefixedMetaField.value;
      return;
    }

    if (href && isImageHref(href)) {
      if (!item.imageSrc) item.imageSrc = href;
      return;
    }

    if ((href && isFileHref(href)) || isFileHref(text)) {
      item.fileHref = item.fileHref || href || text;
      return;
    }

    if ((href && isUrlLike(href)) || isUrlLike(text)) {
      item.videoUrl = item.videoUrl || (isUrlLike(href) ? href : text.match(/https?:\/\/[^\s<>"]+/i)[0]);
      return;
    }

    if (/^(gated|open)$/i.test(text)) {
      item.gatedOverride = text.toLowerCase();
      return;
    }

    // Stamped select values are lowercase; case-sensitive so a title like
    // "Video" is not mistaken for a display style.
    if (!item.displayStyle && DISPLAY_STYLES.includes(text)) {
      item.displayStyle = text;
      return;
    }

    // A slug and a short lowercase title are indistinguishable here, so
    // slug-looking cells are kept as CANDIDATES and verified against the
    // API later; losers flow back into the title/description below.
    if (text) {
      freeCells.push({
        text,
        html: cell.innerHTML,
        slugCandidate: isSlugLike(text),
      });
    }
  });

  item.textEntries = freeCells;
  item.slugCandidates = freeCells.filter((entry) => entry.slugCandidate).map((entry) => entry.text);

  return item;
}

/**
 * Once the winning slug is known, distribute the remaining text cells.
 * Model order is title, description, button label; with omitted fields the
 * last short plain cell is treated as the button label.
 */
function finalizePublishedText(item) {
  const cells = (item.textEntries || [])
    .filter((entry) => !(entry.slugCandidate && entry.text === item.resourceSlug));
  if (!cells.length) return;

  item.title = cells[0].text;
  const rest = cells.slice(1);
  if (rest.length) {
    // A lone remaining cell is a description; the button label is only
    // split off when there are at least two (description + short label).
    const last = rest[rest.length - 1];
    const looksLikeLabel = rest.length >= 2
      && last.text.length <= 32 && last.text.split(' ').length <= 4
      && !/<(ul|ol|h[1-3])/i.test(last.html);
    if (looksLikeLabel) {
      item.buttonLabel = last.text;
      rest.pop();
    }
    item.description = rest
      .map((entry) => (entry.html.includes('<') ? entry.html : `<p>${entry.html}</p>`))
      .join('');
  }
}

function readPublishedContent(block) {
  const rows = getBlockRows(block);
  const config = {
    apiBaseUrl: '', slug: '', gated: '', layout: '',
  };
  const items = [];

  rows.forEach((row) => {
    const cells = [...row.children];
    if (!cells.length) return;

    if (cells.length >= 2) {
      items.push(parsePublishedItem(row));
      return;
    }

    const cell = cells[0];
    const anchor = cell.querySelector('a');
    const href = normalizeText(anchor?.getAttribute('href'));
    const text = normalizeText(cell.textContent);

    if ((href && isFileHref(href)) || cell.querySelector('picture, img')) {
      items.push(parsePublishedItem(row));
      return;
    }

    if (!config.apiBaseUrl && (isUrlLike(href) || isUrlLike(text))) {
      config.apiBaseUrl = isUrlLike(href) ? href : text.match(/https?:\/\/[^\s<>"]+/i)[0];
      return;
    }

    if (!config.gated && /^(true|false)$/i.test(text)) {
      config.gated = text.toLowerCase();
      return;
    }

    if (!config.layout && /^grid$/i.test(text)) {
      config.layout = 'grid';
      return;
    }

    if (!config.slug && isSlugLike(text)) {
      config.slug = text;
    }
  });

  config.apiBaseUrl = config.apiBaseUrl || DEFAULT_API_BASE_URL;
  config.slug = config.slug || slugFromPathname();

  return { config, items, rows };
}

// ── API access ───────────────────────────────────────────────────────────────

const resourceCache = new Map();

function fetchResource(apiBaseUrl, slug) {
  if (!apiBaseUrl || !slug) return Promise.resolve(null);

  const key = `${apiBaseUrl}|${slug}`;
  if (!resourceCache.has(key)) {
    const endpoint = new URL(`/api/resources/${encodeURIComponent(slug)}`, `${apiBaseUrl.replace(/\/+$/, '')}/`);
    endpoint.searchParams.set('locale', currentSiteLocale());

    resourceCache.set(key, fetch(endpoint.toString(), { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload?.data || null)
      .catch(() => null));
  }

  return resourceCache.get(key);
}

const assetCache = new Map();

/**
 * Resolve a file to its backend resource by DAM path, so a file-only item
 * (no slug) still gets the public download URL and gated flag. Returns null
 * when no published resource references that file yet.
 */
function fetchResourceByAsset(apiBaseUrl, assetPath) {
  const rawPath = normalizeText(assetPath).split(/[?#]/)[0];
  const damMatch = rawPath.match(/\/content\/dam\/[^\s?#]+/);
  const path = damMatch ? damMatch[0] : rawPath;
  if (!apiBaseUrl || !path.startsWith('/content/dam/')) return Promise.resolve(null);

  const key = `${apiBaseUrl}|${path}`;
  if (!assetCache.has(key)) {
    const endpoint = new URL('/api/resources/lookup', `${apiBaseUrl.replace(/\/+$/, '')}/`);
    endpoint.searchParams.set('asset_path', path);
    endpoint.searchParams.set('locale', currentSiteLocale());

    assetCache.set(key, fetch(endpoint.toString(), { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload?.data || null)
      .catch(() => null));
  }

  return assetCache.get(key);
}

/**
 * Try each slug-looking cell against the API in DOM order; the first that
 * resolves is this item's resource. fetchResource caching makes re-lookups
 * free later in the render pass.
 */
function resolveSlugCandidates(item, apiBaseUrl) {
  return (item.slugCandidates || []).reduce((chain, candidate) => chain.then((found) => {
    if (found) return found;
    return fetchResource(apiBaseUrl, candidate)
      .then((resource) => (resource ? { slug: candidate, resource } : null));
  }), Promise.resolve(null));
}

// ── Video modal ──────────────────────────────────────────────────────────────

let videoModal = null;

function buildVideoEmbed(url, title) {
  const youtube = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (youtube) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${youtube[1]}?autoplay=1&rel=0`;
    iframe.title = title || 'Video';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    return iframe;
  }

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
    iframe.title = title || 'Video';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    return iframe;
  }

  const videoUrl = resolveDamUrl(url);
  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('title', title || 'Video');
  const source = document.createElement('source');
  source.src = videoUrl;
  source.type = videoMimeType(videoUrl);
  video.append(source);
  return video;
}

function playNativeVideo(root) {
  const video = root.querySelector('video');
  if (video?.play) video.play().catch(() => {});
}

function getVideoModal() {
  if (videoModal) return videoModal;

  const modal = document.createElement('div');
  modal.className = 'resource-downloads-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'resource-downloads-modal-backdrop';
  modal.append(backdrop);

  const dialog = document.createElement('div');
  dialog.className = 'resource-downloads-modal-dialog';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'resource-downloads-modal-close';
  closeBtn.setAttribute('aria-label', 'Close video');
  closeBtn.innerHTML = '&times;';
  dialog.append(closeBtn);

  const frame = document.createElement('div');
  frame.className = 'resource-downloads-modal-frame';
  dialog.append(frame);

  modal.append(dialog);
  document.body.append(modal);

  function close() {
    modal.hidden = true;
    document.body.style.overflow = '';
    frame.replaceChildren();
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });

  videoModal = {
    open(url, title) {
      modal.setAttribute('aria-label', title || 'Video');
      frame.replaceChildren(buildVideoEmbed(url, title));
      playNativeVideo(frame);
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    },
  };

  return videoModal;
}

// ── Entry resolution ─────────────────────────────────────────────────────────

function normalizeGatedValue(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;

  const normalized = normalizeText(value).toLowerCase();
  if (['true', 'gated', '1', 'yes'].includes(normalized)) return true;
  if (['false', 'open', '0', 'no'].includes(normalized)) return false;
  return null;
}

function resourceMatchesFile(resource, fileHref) {
  const file = normalizeText(fileHref).split(/[?#]/)[0];
  if (!resource || !file) return false;

  const resourceValues = [
    resource.aem_asset_path,
    resource.download_url,
    resource.resource_url,
  ];
  const fileValues = Array.isArray(resource.files)
    ? resource.files.flatMap((item) => [
      item.aem_asset_path,
      item.download_url,
      item.file_url,
    ])
    : [];

  return [...resourceValues, ...fileValues].some((value) => {
    const normalized = normalizeText(value).split(/[?#]/)[0];
    return normalized && (
      normalized === file
      || normalized.endsWith(file)
      || file.endsWith(normalized)
    );
  });
}

function resourceFileMatches(fileEntry, fileHref) {
  const file = normalizeText(fileHref).split(/[?#]/)[0];
  if (!fileEntry || !file) return false;

  return [
    fileEntry.aem_asset_path,
    fileEntry.download_url,
    fileEntry.file_url,
  ].some((value) => {
    const normalized = normalizeText(value).split(/[?#]/)[0];
    return normalized && (
      normalized === file
      || normalized.endsWith(file)
      || file.endsWith(normalized)
    );
  });
}

function primaryResourceFile(resource) {
  const files = Array.isArray(resource?.files) ? resource.files : [];
  return files.find((file) => file?.is_primary) || files[0] || null;
}

function resolveResourceFile(resource, fileHref) {
  const files = Array.isArray(resource?.files) ? resource.files : [];
  if (!files.length) return null;
  if (fileHref) return files.find((file) => resourceFileMatches(file, fileHref)) || null;
  return primaryResourceFile(resource);
}

function resolveGated(item, itemResource, config, primaryResource, itemFile = null) {
  const itemOverride = normalizeGatedValue(item.gatedOverride);
  if (itemOverride !== null) return itemOverride;

  const fileGated = normalizeGatedValue(itemFile?.gated);
  if (fileGated !== null) return fileGated;

  const resourceGated = normalizeGatedValue(itemResource?.gated);
  if (resourceGated !== null) return resourceGated;

  const configGated = normalizeGatedValue(config.gated);
  if (configGated !== null) return configGated;

  const primaryGated = normalizeGatedValue(primaryResource?.gated);
  return primaryGated !== null ? primaryGated : false;
}

function resolveEntry(item, resource, config, primaryResource) {
  const matchedPrimaryResource = resource
    || (item.resourceSlug === config.slug ? primaryResource : null)
    || (resourceMatchesFile(primaryResource, item.fileHref) ? primaryResource : null);
  const matchedFile = resolveResourceFile(matchedPrimaryResource, item.fileHref);
  const downloadUrl = matchedFile?.download_url
    || matchedFile?.file_url
    || matchedPrimaryResource?.download_url
    || matchedPrimaryResource?.resource_url
    || resolveDamUrl(item.fileHref)
    || '';
  const videoUrl = resolveDamUrl(item.videoUrl
    || matchedPrimaryResource?.video_url
    || (VIDEO_EXTENSIONS.includes(fileExtensionFrom(downloadUrl)) ? downloadUrl : ''));
  const extension = fileExtensionFrom(downloadUrl)
    || fileExtensionFrom(matchedFile?.file_name || '')
    || fileExtensionFrom(matchedPrimaryResource?.aem_asset_name || '');

  // The resource type (drives color/icon theming) is resolved independently of
  // the layout style. Video links always get the player; every other type gets
  // its dedicated color-coded card unless the author picked row/grouped.
  const resourceTypeLower = normalizeText(matchedPrimaryResource?.resource_type_label)
    .toLowerCase();
  let autoType = videoUrl ? 'video' : (EXTENSION_TYPE[extension] || '');
  if (!autoType) {
    if (resourceTypeLower.includes('video')) autoType = 'video';
    else if (/presentation|powerpoint/.test(resourceTypeLower)) autoType = 'powerpoint';
    else if (resourceTypeLower.includes('pdf')) autoType = 'pdf';
    else if (/spreadsheet|excel/.test(resourceTypeLower)) autoType = 'spreadsheet';
    else if (/bundle|zip/.test(resourceTypeLower)) autoType = 'bundle';
    else autoType = 'file';
  }
  let typeKey = autoType;
  let style;
  if (TYPE_STYLE_KEYS.includes(item.displayStyle)) {
    typeKey = item.displayStyle;
    style = typeKey === 'video' ? 'video' : 'type';
  } else if ([...INFORMATIVE_STYLES, 'row', 'grouped'].includes(item.displayStyle)) {
    style = item.displayStyle;
  } else {
    style = autoType === 'video' ? 'video' : 'type';
  }

  return {
    item,
    resource: matchedPrimaryResource,
    style,
    typeKey,
    theme: typeTheme(typeKey),
    downloadUrl,
    videoUrl,
    extension: extension || (videoUrl ? 'video' : 'file'),
    gated: resolveGated(item, matchedPrimaryResource, config, primaryResource, matchedFile),
    title: item.title || matchedFile?.title || matchedPrimaryResource?.title
      || titleFromFileName(downloadUrl) || 'Download',
    description: item.description || matchedFile?.description || '',
    fallbackDescription: normalizeText(matchedPrimaryResource?.excerpt),
    imageSrc: item.imageSrc || matchedPrimaryResource?.thumbnail || '',
    imageEl: item.imageEl,
    slug: item.resourceSlug || matchedPrimaryResource?.slug || '',
    fileName: fileNameFrom(downloadUrl)
      || matchedFile?.file_name
      || matchedPrimaryResource?.aem_asset_name
      || '',
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function defaultButtonLabel(entry) {
  if (entry.style === 'video' && !entry.downloadUrl) return 'Watch Video';
  // On a video, the download button (if any) sits next to a Watch button.
  if (entry.typeKey === 'video') return 'Download';
  return entry.theme?.title || 'Download';
}

function buildDefaultVideoPoster(title = 'NCMEC video') {
  const poster = document.createElement('div');
  poster.className = 'resource-downloads-default-video-poster';

  const image = document.createElement('img');
  image.src = codeAssetPath(DEFAULT_VIDEO_POSTER_PATH);
  image.alt = title;
  image.loading = 'lazy';
  poster.append(image);

  return poster;
}

function buildImage(entry, width = 400) {
  if (entry.imageEl?.tagName === 'PICTURE') {
    const img = entry.imageEl.querySelector('img');
    if (img?.src && !isVideoFile(img.src) && !isFileHref(img.src)) {
      const optimized = createOptimizedPicture(img.src, entry.title, false, [{ width: `${width}` }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      return optimized;
    }
  }

  if (entry.imageSrc && !isVideoFile(entry.imageSrc) && !isFileHref(entry.imageSrc)) {
    return createOptimizedPicture(entry.imageSrc, entry.title, false, [{ width: `${width}` }]);
  }

  return null;
}

function buildDownloadButton(entry) {
  const link = document.createElement('a');
  link.className = 'resource-downloads-item-button';
  link.href = isUrlLike(entry.downloadUrl)
    ? entry.downloadUrl
    : resolveSiteHref(entry.downloadUrl);
  link.textContent = entry.item.buttonLabel || defaultButtonLabel(entry);
  if (entry.downloadUrl.includes('/content/dam/')) {
    link.setAttribute('download', '');
  } else {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  bindGatedLink(link, {
    gated: entry.gated,
    resourceSlug: entry.slug,
    fileUrl: entry.downloadUrl,
    fileName: entry.fileName,
    lockedLabel: LOCKED_LABEL,
    downloadLabel: entry.item.buttonLabel || defaultButtonLabel(entry),
  });

  return link;
}

function buildWatchButton(entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'resource-downloads-item-button resource-downloads-watch-button';
  button.textContent = entry.item.buttonLabel || 'Watch Video';

  const play = () => {
    trackEvent('resource_video_watch', {
      resource_slug: entry.slug,
      file_name: entry.fileName || fileNameFrom(entry.videoUrl),
    });
    getVideoModal().open(entry.videoUrl, entry.title);
  };

  button.addEventListener('click', () => {
    if (!entry.gated || isRegistered()) {
      play();
      return;
    }
    openRegistrationModal({ resourceSlug: entry.slug }).then((registration) => {
      if (registration) play();
    });
  });

  return button;
}

function buildDescription(entry) {
  const html = entry.description;
  const text = html || entry.fallbackDescription;
  if (!text) return null;

  const description = document.createElement('div');
  description.className = 'resource-downloads-item-description';
  if (html) {
    description.innerHTML = html;
  } else {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    description.append(paragraph);
  }
  return description;
}

function buildEmptyNotice(entry) {
  const notice = document.createElement('p');
  notice.className = 'resource-downloads-item-notice';
  if (entry.resource && !entry.downloadUrl) {
    notice.textContent = `The resource "${entry.item.resourceSlug}" has no file yet — pick or upload one in a Download Item's File field, or set its Download URL in Filament.`;
  } else if (entry.item.resourceSlug) {
    notice.textContent = `Couldn't load resource "${entry.item.resourceSlug}" in the editor — check the slug is a published resource. The live page fetches it directly.`;
  } else {
    notice.textContent = 'Pick or upload a File (it becomes a tracked resource automatically), or set a Resource Slug or Video URL.';
  }
  return notice;
}

function buildTitleEl(entry, tag = 'h3') {
  const title = document.createElement(tag);
  title.className = 'resource-downloads-item-title';
  title.textContent = entry.title;
  return title;
}

// Color-coded type tile (PDF/DOC/PPT/ZIP/XLS/FILE) — accent comes from
// --rd-accent set on the card, so one element themes every type.
function buildTypeTile(theme) {
  const tile = document.createElement('span');
  tile.className = 'resource-downloads-type-tile';
  tile.textContent = theme.abbr;
  return tile;
}

function buildTypeIcon(entry) {
  const icon = buildTypeTile(entry.theme);
  icon.classList.add('resource-downloads-item-icon');
  icon.dataset.type = entry.typeKey;
  return icon;
}

function informativeFormatValue(entry) {
  const override = normalizeText(entry.item.informativeFormatText);
  if (override) return override;

  const resourceType = normalizeText(entry.resource?.resource_type_label);
  const { typeKey, theme } = entry;
  if (!resourceType) return theme.format;

  if (typeKey === 'pdf' && !/pdf/i.test(resourceType)) return `${resourceType} (PDF)`;
  if (typeKey === 'video' && !/video/i.test(resourceType)) return `${resourceType} (Video)`;
  if (typeKey === 'powerpoint' && !/(presentation|powerpoint)/i.test(resourceType)) {
    return `${resourceType} (PowerPoint)`;
  }
  if (typeKey === 'word' && !/(word|doc)/i.test(resourceType)) return `${resourceType} (Word)`;

  return resourceType;
}

function labelListText(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean).join(', ');
  return normalizeText(value);
}

function usesInformativeWatchAction(entry) {
  return INFORMATIVE_STYLES.includes(entry.style) && entry.typeKey === 'video';
}

function buildActions(entry, isEditor) {
  const actions = document.createElement('div');
  actions.className = 'resource-downloads-item-actions';
  const useWatchAction = entry.videoUrl && (entry.style === 'video' || usesInformativeWatchAction(entry));

  if (useWatchAction) actions.append(buildWatchButton(entry));
  if (entry.downloadUrl && !usesInformativeWatchAction(entry)) {
    actions.append(buildDownloadButton(entry));
  }
  if (!actions.children.length && isEditor) actions.append(buildEmptyNotice(entry));

  return actions.children.length ? actions : null;
}

function buildRowEntry(entry, isEditor) {
  const card = document.createElement('article');
  card.className = 'resource-downloads-item is-row';
  card.append(buildTypeIcon(entry));

  const body = document.createElement('div');
  body.className = 'resource-downloads-item-body';
  body.append(buildTitleEl(entry));
  const description = buildDescription(entry);
  if (description) body.append(description);
  card.append(body);

  const actions = buildActions(entry, isEditor);
  if (actions) card.append(actions);

  return card;
}

// Decorative line-art per file type, filling the right side of a type card
// when no thumbnail is authored. Strokes inherit currentColor, so the card's
// --rd-accent tints every type from a single set of CSS rules.
const TYPE_ART = {
  pdf: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M38 12h34l18 18v62H38z" opacity=".3"/><path d="M30 24h34l18 18v66H30z" fill="#fff"/><path d="M64 24v18h18"/><path d="M42 62h28M42 74h28M42 86h16"/></svg>',
  word: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M38 12h34l18 18v62H38z" opacity=".3"/><path d="M30 24h34l18 18v66H30z" fill="#fff"/><path d="M64 24v18h18"/><path d="M42 58h40M42 70h40M42 82h40M42 94h22"/></svg>',
  powerpoint: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="22" width="80" height="56" rx="6" fill="#fff"/><path d="M34 64V50M50 64V40M66 64V56M82 64V34"/><path d="M60 78v16M44 102l16-8 16 8"/></svg>',
  spreadsheet: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="22" y="22" width="76" height="76" rx="6" fill="#fff"/><path d="M22 44h76M22 62h76M22 80h76M47 44v54M72 44v54"/></svg>',
  bundle: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M24 42 60 22l36 20v38l-36 20-36-20z" fill="#fff"/><path d="M24 42l36 18 36-18M60 60v40"/><path d="M42 32l36 18" opacity=".4"/></svg>',
  file: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M32 16h36l20 20v68H32z" fill="#fff"/><path d="M68 16v20h20"/><path d="M44 58h32M44 70h32M44 82h20"/></svg>',
};

function buildTypeArt(entry) {
  const art = document.createElement('div');
  art.className = 'resource-downloads-type-art';
  art.setAttribute('aria-hidden', 'true');

  const watermark = document.createElement('span');
  watermark.className = 'resource-downloads-type-art-watermark';
  watermark.textContent = entry.theme.abbr;

  const glyph = document.createElement('span');
  glyph.className = 'resource-downloads-type-art-glyph';
  glyph.innerHTML = TYPE_ART[entry.typeKey] || TYPE_ART.file;

  art.append(watermark, glyph);
  return art;
}

// Dedicated, color-coded card for every non-video file type (PDF, Word,
// PowerPoint, ZIP, spreadsheet, generic file). One builder themed by --rd-accent.
function buildTypeCard(entry, isEditor) {
  const { theme } = entry;
  const card = document.createElement('article');
  card.className = 'resource-downloads-item is-type';
  card.dataset.type = entry.typeKey;

  const image = buildImage(entry);
  if (image) {
    const media = document.createElement('div');
    media.className = 'resource-downloads-item-media';
    media.append(image);
    card.append(media);
  }

  const body = document.createElement('div');
  body.className = 'resource-downloads-item-body';

  const head = document.createElement('div');
  head.className = 'resource-downloads-type-head';
  head.append(buildTypeIcon(entry));

  const heading = document.createElement('div');
  heading.className = 'resource-downloads-type-heading';
  heading.append(buildTitleEl(entry));
  const format = document.createElement('span');
  format.className = 'resource-downloads-type-format';
  format.textContent = theme.badgeLabel;
  heading.append(format);
  head.append(heading);
  body.append(head);

  const description = buildDescription(entry);
  if (description) body.append(description);

  const actions = buildActions(entry, isEditor);
  if (actions) body.append(actions);
  card.append(body);

  // No authored thumbnail: fill the open side with the type's decorative art
  // instead of leaving the card half empty.
  if (!image) card.append(buildTypeArt(entry));

  return card;
}

function buildVideoEntry(entry, isEditor) {
  const card = document.createElement('article');
  card.className = 'resource-downloads-item is-video';

  const media = document.createElement('div');
  media.className = 'resource-downloads-item-media';
  const image = buildImage(entry, 800);
  media.append(image || buildDefaultVideoPoster(entry.title));

  const chip = document.createElement('span');
  chip.className = 'resource-downloads-video-chip';
  chip.textContent = entry.theme.badgeLabel;
  media.append(chip);

  if (entry.videoUrl) {
    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'resource-downloads-play';
    playButton.setAttribute('aria-label', `Play ${entry.title}`);
    playButton.addEventListener('click', () => {
      const watch = buildWatchButton(entry);
      watch.click();
    });
    media.append(playButton);
  }

  card.append(media);

  // Footer action bar: title + description on the left, buttons on the right.
  const body = document.createElement('div');
  body.className = 'resource-downloads-item-body';
  const text = document.createElement('div');
  text.className = 'resource-downloads-video-text';
  text.append(buildTitleEl(entry));
  const description = buildDescription(entry);
  if (description) text.append(description);
  body.append(text);
  const actions = buildActions(entry, isEditor);
  if (actions) body.append(actions);
  card.append(body);

  return card;
}

function buildGroupEntry(entries, isEditor) {
  const lead = entries[0];
  const card = document.createElement('article');
  card.className = 'resource-downloads-item is-group';

  const image = buildImage(lead);
  if (image) {
    const media = document.createElement('div');
    media.className = 'resource-downloads-item-media';
    media.append(image);
    card.append(media);
  }

  const body = document.createElement('div');
  body.className = 'resource-downloads-item-body';
  body.append(buildTitleEl(lead));
  const description = buildDescription(lead);
  if (description) body.append(description);

  const actions = document.createElement('div');
  actions.className = 'resource-downloads-item-actions is-stacked';

  entries.forEach((entry, index) => {
    let button = null;
    if (entry.videoUrl) {
      button = buildWatchButton(entry);
    } else if (entry.downloadUrl) {
      button = buildDownloadButton(entry);
      if (!entry.item.buttonLabel && entry.title && index > 0) {
        button.textContent = entry.title;
      }
    } else if (isEditor) {
      actions.append(buildEmptyNotice(entry));
    }

    if (button) {
      if (index > 0 && entry.item.row && isEditor) {
        moveInstrumentation(entry.item.row, button);
        setItemLabel(button, [entry.item.buttonLabel, entry.title]);
      }
      actions.append(button);
    }
  });

  if (actions.children.length) body.append(actions);
  card.append(body);

  return card;
}

const META_ICONS = {
  audience: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 19v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  time: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>',
  format: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18"/><path d="M4 4v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4"/><path d="M12 15v5"/><path d="M9 20h6"/></svg>',
};

function buildMetaRow(iconKey, label, value) {
  const row = document.createElement('div');
  row.className = 'resource-downloads-meta-row';
  row.dataset.meta = iconKey;

  const icon = document.createElement('span');
  icon.className = 'resource-downloads-meta-icon';
  icon.innerHTML = META_ICONS[iconKey];
  row.append(icon);

  const text = document.createElement('div');
  text.className = 'resource-downloads-meta-text';
  const labelEl = document.createElement('span');
  labelEl.className = 'resource-downloads-meta-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'resource-downloads-meta-value';
  valueEl.textContent = value;
  text.append(labelEl, valueEl);
  row.append(text);

  return row;
}

function buildInformativeTypeBadge(theme) {
  const badge = document.createElement('div');
  badge.className = 'resource-downloads-informative-type';

  const icon = document.createElement('span');
  icon.className = 'resource-downloads-informative-type-icon';
  icon.textContent = theme.abbr;

  const label = document.createElement('span');
  label.className = 'resource-downloads-informative-type-label';
  label.textContent = theme.badgeLabel;

  badge.append(icon, label);
  return badge;
}

function informativeMetaRows(entry) {
  const { resource } = entry;
  const audience = normalizeText(entry.item.informativeAudienceText)
    || labelListText(resource?.audience_labels);
  const time = normalizeText(entry.item.informativeTimeText)
    || normalizeText(resource?.duration_label);
  const format = informativeFormatValue(entry);

  return [
    audience ? buildMetaRow(
      'audience',
      normalizeText(entry.item.informativeAudienceLabel) || 'Primary Audience',
      audience,
    ) : null,
    time ? buildMetaRow('time', normalizeText(entry.item.informativeTimeLabel) || 'Time', time) : null,
    format ? buildMetaRow(
      'format',
      normalizeText(entry.item.informativeFormatLabel) || 'Format',
      format,
    ) : null,
  ].filter(Boolean);
}

function buildInformativeEntry(entry, isEditor) {
  const { theme } = entry;
  const card = document.createElement('article');
  card.className = 'resource-downloads-item is-informative';

  const panel = document.createElement('div');
  panel.className = 'resource-downloads-informative-card';
  panel.dataset.resourceType = entry.typeKey;
  panel.append(buildInformativeTypeBadge(theme));

  const title = document.createElement('h3');
  title.className = 'resource-downloads-item-title';
  title.textContent = entry.item.title || theme.title;
  panel.append(title);

  const description = buildDescription(entry);
  if (description) {
    const containsLabel = document.createElement('p');
    containsLabel.className = 'resource-downloads-contains-label';
    containsLabel.textContent = theme.contains;
    panel.append(containsLabel);
    description.classList.add('resource-downloads-item-contents');
    panel.append(description);
  }

  const actions = buildActions(entry, isEditor);
  if (actions) panel.append(actions);
  card.append(panel);

  const metaRows = informativeMetaRows(entry);
  if (metaRows.length) {
    const meta = document.createElement('div');
    meta.className = 'resource-downloads-meta-panel';
    meta.append(...metaRows);
    card.append(meta);
  }

  return card;
}

// Informative data in a single-column card: type head, contents, meta rows
// inline, actions. Works standalone and as a tile in the Grid layout.
function buildInformativeStackedEntry(entry, isEditor) {
  const { theme } = entry;
  const card = document.createElement('article');
  card.className = 'resource-downloads-item is-informative-stacked';
  card.dataset.type = entry.typeKey;

  const head = document.createElement('div');
  head.className = 'resource-downloads-type-head';
  head.append(buildTypeIcon(entry));
  const heading = document.createElement('div');
  heading.className = 'resource-downloads-type-heading';
  const title = buildTitleEl(entry);
  title.textContent = entry.item.title || entry.title || theme.title;
  heading.append(title);
  const format = document.createElement('span');
  format.className = 'resource-downloads-type-format';
  format.textContent = theme.badgeLabel;
  heading.append(format);
  head.append(heading);
  card.append(head);

  const description = buildDescription(entry);
  if (description) {
    const containsLabel = document.createElement('p');
    containsLabel.className = 'resource-downloads-contains-label';
    containsLabel.textContent = theme.contains;
    card.append(containsLabel);
    description.classList.add('resource-downloads-item-contents');
    card.append(description);
  }

  const metaRows = informativeMetaRows(entry);
  if (metaRows.length) {
    const meta = document.createElement('div');
    meta.className = 'resource-downloads-meta-panel is-inline';
    meta.append(...metaRows);
    card.append(meta);
  }

  const actions = buildActions(entry, isEditor);
  if (actions) card.append(actions);

  return card;
}

// Informative data as a full-width horizontal band: badge pill, title +
// description, compact meta chips, and the action on the far right.
function buildInformativeBannerEntry(entry, isEditor) {
  const card = document.createElement('article');
  card.className = 'resource-downloads-item is-informative-banner';
  card.dataset.type = entry.typeKey;
  card.append(buildInformativeTypeBadge(entry.theme));

  const body = document.createElement('div');
  body.className = 'resource-downloads-item-body';
  body.append(buildTitleEl(entry));
  const description = buildDescription(entry);
  if (description) body.append(description);
  card.append(body);

  const metaRows = informativeMetaRows(entry);
  if (metaRows.length) {
    const meta = document.createElement('div');
    meta.className = 'resource-downloads-meta-panel is-chips';
    meta.append(...metaRows);
    card.append(meta);
  }

  const actions = buildActions(entry, isEditor);
  if (actions) card.append(actions);

  return card;
}

const ENTRY_BUILDERS = {
  type: buildTypeCard,
  video: buildVideoEntry,
  informative: buildInformativeEntry,
  'informative-stacked': buildInformativeStackedEntry,
  'informative-banner': buildInformativeBannerEntry,
  row: buildRowEntry,
};

export default async function decorate(block) {
  const isEditor = isEditorContext(block);
  const { config, items, rows } = isEditor
    ? readEditorContent(block)
    : readPublishedContent(block);

  // Published rows can't name their fields, so slug-looking cells were kept
  // as candidates — settle them against the API before anything else. Skip
  // this when the item already has a file (the file is authoritative), which
  // also avoids probing a plain title like "test" as if it were a slug.
  await Promise.all(items.map(async (item) => {
    if (!item.textEntries) return;
    if (!item.fileHref && !item.videoUrl) {
      const resolved = await resolveSlugCandidates(item, config.apiBaseUrl);
      if (resolved) item.resourceSlug = resolved.slug;
    }
    finalizePublishedText(item);
  }));

  // If no download items are authored, fall back to the page resource's
  // primary file. If authors added items, those items are the source of truth;
  // adding the primary again would duplicate the same file on the frontend.
  const workingItems = [...items];
  if (config.slug && workingItems.length === 0) {
    workingItems.unshift({ ...emptyItem(), resourceSlug: config.slug });
  }

  const primaryResource = await fetchResource(config.apiBaseUrl, config.slug);
  const entries = (await Promise.all(workingItems.map(async (item) => {
    // Prefer a slug link; otherwise resolve the picked file to its resource
    // so file-only items still get the public URL + gated flag.
    let resource = item.resourceSlug
      ? await fetchResource(config.apiBaseUrl, item.resourceSlug)
      : null;
    if (!resource && item.fileHref && !resourceMatchesFile(primaryResource, item.fileHref)) {
      resource = await fetchResourceByAsset(config.apiBaseUrl, item.fileHref);
    }
    return resolveEntry(item, resource, config, primaryResource);
  }))).filter((entry) => entry.downloadUrl || entry.videoUrl || isEditor);

  const list = document.createElement('div');
  list.className = 'resource-downloads-list';
  if (config.layout === 'grid') list.classList.add('is-grid');

  // Merge consecutive "grouped" entries into a single stacked-button card.
  let index = 0;
  while (index < entries.length) {
    const entry = entries[index];

    if (entry.style === 'grouped') {
      const group = [entry];
      while (entries[index + 1]?.style === 'grouped') {
        index += 1;
        group.push(entries[index]);
      }
      const groupCard = buildGroupEntry(group, isEditor);
      groupCard.style.setProperty('--rd-accent', group[0].theme.accent);
      if (group[0].item.row && isEditor) {
        moveInstrumentation(group[0].item.row, groupCard);
      }
      setItemLabel(groupCard, [group[0].title]);
      list.append(groupCard);
      index += 1;
    } else {
      const builder = ENTRY_BUILDERS[entry.style] || buildRowEntry;
      const card = builder(entry, isEditor);
      // One custom property themes the whole card (tile, button, accents).
      card.style.setProperty('--rd-accent', entry.theme.accent);
      if (entry.item.row && isEditor) {
        moveInstrumentation(entry.item.row, card);
      }
      setItemLabel(card, [entry.title, entry.fileName]);
      list.append(card);
      index += 1;
    }
  }

  if (!list.children.length && isEditor) {
    const empty = document.createElement('p');
    empty.className = 'resource-downloads-empty';
    empty.textContent = 'Add download items to this block, or set the Primary Resource Slug.';
    list.append(empty);
  }

  const children = [list];

  if (isEditor) {
    // Preserve remaining instrumented rows for Universal Editor tracking
    // (hide-not-remove; item rows already handed their identity to cards).
    const archive = document.createElement('div');
    archive.className = 'resource-downloads-archive';
    archive.hidden = true;
    rows.forEach((row) => {
      if (row.parentElement === block) {
        row.hidden = true;
        archive.append(row);
      }
    });
    children.push(archive);
  }

  block.replaceChildren(...children);

  // Reveal cards with a soft staggered rise as they enter the viewport. The
  // CSS only hides cards under prefers-reduced-motion: no-preference, so the
  // editor, reduced-motion users, and no-IO browsers just render in place.
  const cards = [...list.children];
  if (isEditor || !('IntersectionObserver' in window)) {
    cards.forEach((card) => card.classList.add('is-revealed'));
    return;
  }
  const observer = new IntersectionObserver((observations) => {
    observations.forEach((observation) => {
      if (!observation.isIntersecting) return;
      observation.target.classList.add('is-revealed');
      observer.unobserve(observation.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  cards.forEach((card, cardIndex) => {
    card.style.setProperty('--rd-reveal-delay', `${(cardIndex % 6) * 70}ms`);
    observer.observe(card);
  });
}
