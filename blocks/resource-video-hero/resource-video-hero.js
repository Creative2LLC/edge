import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import { buildListFilterHref } from '../../scripts/list-filter-state.js';
import {
  getAueResourcePath,
  getBlockRows,
  readAueResourceFields,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { bindGatedLink } from '../../scripts/resource-gate.js';

const FIELD_COLUMN_INDEX = {
  apiBaseUrl: 0,
  slug: 1,
  listingPath: 2,
  listingLabel: 3,
  watchLabel: 4,
  downloadLabel: 5,
  watchTarget: 6,
  title: 7,
  description: 8,
  videoFile: 9,
  videoFilePath: 10,
  videoUrl: 11,
  gated: 12,
};

const DEFAULT_LISTING_PATH = '/content/edge/resources.html';
const PUBLISH_BASE_URL = 'https://publish-p171653-e1855116.adobeaemcloud.com';

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/(?:https?:\/\/[^\s<>"]+|\/content\/dam\/[^\s<>"]+)/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function getRows(block) {
  return getBlockRows(block);
}

function getPropValue(scope, name) {
  return normalizeText(readLinkField(scope, name).value || readTextField(scope, name).value);
}

function readConfigValue(rows, name, fallback = '') {
  const propValue = rows
    .map((row) => readLinkField(row, name).value || readTextField(row, name).value)
    .find(Boolean);
  if (propValue) return normalizeText(propValue) || fallback;

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return fallback;

  const value = rows
    .map((row) => {
      const cell = row.children[columnIndex];
      if (!cell) return '';
      const anchor = cell.querySelector('a');
      if (anchor) return normalizeText(anchor.getAttribute('href') || anchor.textContent);
      return findUrlLikeValue(cell.textContent) || normalizeText(cell.textContent);
    })
    .find(Boolean);

  return value || fallback;
}

function getFieldValue(block, name, fallback = '') {
  const rows = getRows(block);
  return getPropValue(block, name) || readConfigValue(rows, name) || fallback;
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeSlug(value) {
  const normalized = normalizeText(value)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
  if (!normalized) return '';
  try { return decodeURIComponent(normalized); } catch { return normalized; }
}

function getSlugFromPathname(pathname = window.location.pathname) {
  const cleanPath = normalizeText(pathname).replace(/[?#].*$/, '').replace(/\/+$/, '');
  const segments = cleanPath.split('/').filter(Boolean);
  return normalizeSlug(segments[segments.length - 1] || '');
}

// ── Video embed helpers ──────────────────────────────────────────────────────

function isDamAssetUrl(link) {
  const value = normalizeText(link);
  if (!value) return false;

  return new URL(value, window.location.href).pathname.startsWith('/content/dam/');
}

function resolveVideoUrl(link) {
  const value = normalizeText(link);
  if (!value) return '';

  const url = new URL(value, window.location.href);
  if (isDamAssetUrl(value)) {
    return `${PUBLISH_BASE_URL}${url.pathname}${url.search}${url.hash}`;
  }

  return value;
}

function videoMimeType(url) {
  const extension = new URL(url, window.location.href).pathname.split('.').pop().toLowerCase();
  if (extension === 'mov') return 'video/quicktime';
  return `video/${extension || 'mp4'}`;
}

function playNativeVideo(root) {
  const video = root.querySelector('video');
  if (video?.play) video.play().catch(() => {});
}

function getVideoSource(link) {
  const normalized = link.toLowerCase();
  if (normalized.includes('youtube.com') || normalized.includes('youtu.be')) return 'youtube';
  if (normalized.includes('vimeo.com')) return 'vimeo';
  return 'video';
}

function getYoutubeId(url) {
  if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
  if (url.searchParams.get('v')) return url.searchParams.get('v');
  const parts = url.pathname.split('/').filter(Boolean);
  const idx = parts.findIndex((p) => ['embed', 'shorts', 'live'].includes(p));
  return idx >= 0 ? parts[idx + 1] || '' : '';
}

function getVimeoId(url) {
  return url.pathname.split('/').filter(Boolean).reverse().find((p) => /^\d+$/.test(p)) || '';
}

function buildEmbed(link, title) {
  const url = new URL(resolveVideoUrl(link), window.location.href);
  const source = getVideoSource(url.href);

  if (source === 'youtube') {
    const videoId = getYoutubeId(url);
    const iframe = document.createElement('iframe');
    iframe.src = videoId
      ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&autoplay=1`
      : url.href;
    iframe.title = title || 'YouTube video';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    iframe.allowFullscreen = true;
    return iframe;
  }

  if (source === 'vimeo') {
    const videoId = getVimeoId(url);
    const iframe = document.createElement('iframe');
    iframe.src = videoId
      ? `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?autoplay=1`
      : url.href;
    iframe.title = title || 'Vimeo video';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    return iframe;
  }

  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('title', title || 'Video');
  const source2 = document.createElement('source');
  source2.src = url.href;
  source2.type = videoMimeType(url.href);
  video.append(source2);
  return video;
}

// ── Modal ────────────────────────────────────────────────────────────────────

function buildModal(title) {
  const modal = document.createElement('div');
  modal.className = 'resource-video-hero-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || 'Video');
  modal.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'resource-video-hero-modal-backdrop';
  modal.append(backdrop);

  const dialog = document.createElement('div');
  dialog.className = 'resource-video-hero-modal-dialog';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'resource-video-hero-modal-close';
  closeBtn.setAttribute('aria-label', 'Close video');
  closeBtn.innerHTML = '&times;';
  dialog.append(closeBtn);

  const frame = document.createElement('div');
  frame.className = 'resource-video-hero-modal-frame';
  dialog.append(frame);

  modal.append(dialog);
  document.body.append(modal);

  function open(videoUrl) {
    frame.replaceChildren(buildEmbed(videoUrl, title));
    playNativeVideo(frame);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    modal.hidden = true;
    document.body.style.overflow = '';
    frame.replaceChildren();
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  const onKeydown = (e) => { if (e.key === 'Escape' && !modal.hidden) close(); };
  document.addEventListener('keydown', onKeydown);

  return { open };
}

// ── Hero DOM builders ────────────────────────────────────────────────────────

function buildMessage(title, description = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'resource-video-hero-message';

  const heading = document.createElement('h2');
  heading.textContent = title;
  wrapper.append(heading);

  if (description) {
    const copy = document.createElement('p');
    copy.textContent = description;
    wrapper.append(copy);
  }

  return wrapper;
}

function buildLinkedPill(label, href) {
  const pill = document.createElement('a');
  pill.className = 'resource-video-hero-pill';
  pill.href = href;
  pill.textContent = label;
  return pill;
}

function buildTaxonomy(resource, listingPath) {
  const values = [
    ...((resource.program_labels || []).map((label, index) => ({
      label,
      href: buildListFilterHref(listingPath, {
        programs: [resource.program_values?.[index] || label],
      }),
    }))),
    ...((resource.grade_age_labels || []).map((label, index) => ({
      label,
      href: buildListFilterHref(listingPath, {
        gradeAges: [resource.grade_age_values?.[index] || label],
      }),
    }))),
    ...((resource.tags || []).map((tag) => ({
      label: tag.name,
      href: buildListFilterHref(listingPath, { tags: [tag.slug || tag.name] }),
    }))),
  ].filter((e) => normalizeText(e.label));

  if (!values.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'resource-video-hero-taxonomy';
  values.slice(0, 6).forEach((v) => wrap.append(buildLinkedPill(v.label, v.href)));
  return wrap;
}

function buildActions(resource, config, videoSource) {
  const actions = document.createElement('div');
  actions.className = 'resource-video-hero-actions';

  if (videoSource) {
    const modal = buildModal(resource.title || config.title || 'Video');
    const watchBtn = document.createElement('button');
    watchBtn.type = 'button';
    watchBtn.className = 'resource-video-hero-action is-primary';
    watchBtn.textContent = config.watchLabel || 'Watch Video';
    watchBtn.addEventListener('click', () => modal.open(videoSource));
    actions.append(watchBtn);
  }

  // Download: prefer the uploaded DAM file, then API download_url / resource_url
  const downloadUrl = config.videoFile || resource.download_url || resource.resource_url;
  if (downloadUrl) {
    const downloadHref = isDamAssetUrl(downloadUrl)
      ? resolveVideoUrl(downloadUrl)
      : resolveSiteHref(downloadUrl);
    const download = document.createElement('a');
    download.className = 'resource-video-hero-action is-secondary';
    download.href = downloadHref;
    if (isDamAssetUrl(downloadUrl)) {
      download.setAttribute('download', '');
    } else {
      download.target = '_blank';
      download.rel = 'noopener noreferrer';
    }
    download.textContent = config.downloadLabel || 'Download Resource';

    // Authored gated value overrides the API value; missing → API → open.
    let gated = Boolean(resource.gated);
    if (config.gated === 'true') gated = true;
    if (config.gated === 'false') gated = false;

    bindGatedLink(download, {
      gated,
      resourceSlug: resource.slug || config.slug || '',
      fileUrl: downloadHref,
      fileName: resource.aem_asset_name || '',
      downloadLabel: config.downloadLabel || 'Download Resource',
    });

    actions.append(download);
  }

  return actions;
}

function buildHero(resource, config) {
  const section = document.createElement('section');
  section.className = 'resource-video-hero-shell';

  // Breadcrumbs
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'resource-video-hero-breadcrumb';
  breadcrumb.setAttribute('aria-label', 'Resource breadcrumb');

  const listing = document.createElement('a');
  listing.href = resolveSiteHref(config.listingPath || DEFAULT_LISTING_PATH);
  listing.textContent = config.listingLabel || 'Resources';
  breadcrumb.append(listing);

  const [primaryProgramLabel] = resource.program_labels || [];
  if (primaryProgramLabel) {
    const current = document.createElement('span');
    current.textContent = primaryProgramLabel;
    breadcrumb.append(current);
  }

  section.append(breadcrumb);

  // Title
  const title = document.createElement('h1');
  title.className = 'resource-video-hero-title';
  title.textContent = resource.title || config.title || 'Video Resource';
  section.append(title);

  // Description
  const description = normalizeText(resource.excerpt || config.description);
  if (description) {
    const copy = document.createElement('p');
    copy.className = 'resource-video-hero-description';
    copy.textContent = description;
    section.append(copy);
  }

  // Taxonomy pills
  const taxonomy = buildTaxonomy(resource, config.listingPath || DEFAULT_LISTING_PATH);
  if (taxonomy) section.append(taxonomy);

  // videoUrl (block override) > API video_url > videoFile (DAM) as fallback player source
  const videoSource = config.videoUrl || resource.video_url || config.videoFile || '';

  section.append(buildActions(resource, config, videoSource));
  return section;
}

// ── Video file field reading ─────────────────────────────────────────────────

function getVideoFileValue(block) {
  // 1. Manual text field always wins (most reliable)
  const manual = getFieldValue(block, 'videoFilePath');
  if (manual) return manual;

  // 2. Link href from the reference picker cell, or DAM path in cell text
  const rows = getRows(block);
  const colIndex = FIELD_COLUMN_INDEX.videoFile;
  const found = rows.map((row) => {
    const cell = row.children[colIndex];
    if (!cell) return '';
    const anchor = cell.querySelector('a');
    if (anchor) {
      const href = normalizeText(anchor.getAttribute('href') || '');
      if (href) return href;
    }
    return findUrlLikeValue(cell.textContent) || '';
  }).find(Boolean);
  if (found) return found;

  // 4. Named prop (data-aue-prop="videoFile") on the block itself
  return getFieldValue(block, 'videoFile');
}

// ── API fetch ────────────────────────────────────────────────────────────────

async function fetchResource(apiBaseUrl, slug) {
  const endpoint = new URL(`/api/resources/${encodeURIComponent(slug)}`, `${apiBaseUrl}/`);
  endpoint.searchParams.set('locale', currentSiteLocale());
  const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  return payload.data || null;
}

// ── Block entry ──────────────────────────────────────────────────────────────

export default async function decorate(block) {
  // Read video-specific fields from AEM's block JSON — bypasses any HTML
  // rendering quirks for reference/text fields in the author environment.
  const blockPath = getAueResourcePath(block);
  const aemFields = blockPath
    ? await readAueResourceFields(blockPath, ['videoFilePath', 'videoFile', 'videoUrl'])
    : {};

  const config = {
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl')),
    slug: normalizeSlug(getFieldValue(block, 'slug')) || getSlugFromPathname(),
    listingPath: getFieldValue(block, 'listingPath', DEFAULT_LISTING_PATH),
    listingLabel: getFieldValue(block, 'listingLabel', 'Resources'),
    watchLabel: getFieldValue(block, 'watchLabel', 'Watch Video'),
    downloadLabel: getFieldValue(block, 'downloadLabel', 'Download Resource'),
    title: getFieldValue(block, 'title'),
    description: getFieldValue(block, 'description'),
    videoFile: aemFields.videoFilePath || aemFields.videoFile || getVideoFileValue(block),
    videoUrl: aemFields.videoUrl || getFieldValue(block, 'videoUrl'),
    gated: normalizeText(getFieldValue(block, 'gated')).toLowerCase(),
  };

  block.replaceChildren(buildMessage('Loading resource...', ''));

  if (!config.apiBaseUrl) {
    block.replaceChildren(buildHero({}, config));
    return;
  }

  if (!config.slug) {
    block.replaceChildren(buildMessage(
      'Missing resource slug',
      'Set a slug for preview or open the published resource URL.',
    ));
    return;
  }

  try {
    const resource = await fetchResource(config.apiBaseUrl, config.slug);
    if (!resource) {
      block.replaceChildren(buildMessage(
        'Resource not found',
        `No published resource was found for "${config.slug}".`,
      ));
      return;
    }

    block.replaceChildren(buildHero(resource, config));
    if (normalizeText(resource.title)) document.title = `${resource.title} | NCMEC`;
  } catch (error) {
    block.replaceChildren(buildMessage(
      'Resource unavailable',
      error?.message || 'The resource API request failed.',
    ));
  }
}
