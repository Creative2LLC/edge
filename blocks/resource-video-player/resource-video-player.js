import { createOptimizedPicture } from '../../scripts/aem.js';
import { currentSiteLocale } from '../../scripts/link-utils.js';
import { fetchSignedUrl, isRegistered, openRegistrationModal } from '../../scripts/resource-gate.js';
import {
  getBlockRows,
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const PUBLISH_BASE_URL = 'https://publish-p171653-e1855116.adobeaemcloud.com';
const DEFAULT_VIDEO_POSTER_PATH = '/blocks/header/ncmec-brand-mark.svg';

const FIELD_COLUMN_INDEX = {
  apiBaseUrl: 0,
  slug: 1,
  videoUrl: 2,
  posterImage: 3,
  imageAlt: 4,
  title: 5,
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function codeAssetPath(path) {
  return `${window.hlx?.codeBasePath || ''}${path}`;
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
      if (name === 'apiBaseUrl' || name === 'videoUrl') {
        return findUrlLikeValue(cell.textContent) || normalizeText(cell.textContent);
      }
      return normalizeText(cell.textContent);
    })
    .find(Boolean);

  return value || fallback;
}

function getFieldValue(block, name, fallback = '') {
  const rows = getRows(block);
  return getPropValue(block, name) || readConfigValue(rows, name) || fallback;
}

function getImageValue(block, name, fallbackAlt) {
  const image = readImageField(block, name);
  const img = image.img || image.cell?.querySelector?.('img');
  if (img?.src) {
    return {
      src: img.src,
      alt: img.alt || fallbackAlt,
    };
  }

  const rows = getRows(block);
  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex === undefined) return null;

  return rows
    .map((row) => {
      const cell = row.children[columnIndex];
      const cellImg = cell?.querySelector?.('img');
      if (cellImg?.src) {
        return {
          src: cellImg.src,
          alt: cellImg.alt || fallbackAlt,
        };
      }

      const anchor = cell?.querySelector?.('a');
      const url = normalizeText(anchor?.getAttribute('href') || findUrlLikeValue(cell?.textContent));
      return url ? { src: url, alt: fallbackAlt } : null;
    })
    .find(Boolean) || null;
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeSlug(value) {
  const normalized = normalizeText(value)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');

  if (!normalized) return '';

  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function getSlugFromPathname(pathname = window.location.pathname) {
  const cleanPath = normalizeText(pathname)
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  const segments = cleanPath.split('/').filter(Boolean);
  return normalizeSlug(segments[segments.length - 1] || '');
}

function getYoutubeId(url) {
  if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
  if (url.searchParams.get('v')) return url.searchParams.get('v');

  const parts = url.pathname.split('/').filter(Boolean);
  const markerIndex = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
  return markerIndex >= 0 ? parts[markerIndex + 1] || '' : '';
}

function getVimeoId(url) {
  return url.pathname
    .split('/')
    .filter(Boolean)
    .reverse()
    .find((part) => /^\d+$/.test(part)) || '';
}

function resolveVideoUrl(link) {
  const value = normalizeText(link);
  if (!value) return '';

  const url = new URL(value, window.location.href);
  if (url.pathname.startsWith('/content/dam/')) {
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

function embedYoutube(url, title) {
  const videoId = getYoutubeId(url);
  const src = videoId
    ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&autoplay=1`
    : url.href;

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = title || 'YouTube video';
  iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope';
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';
  return iframe;
}

function embedVimeo(url, title) {
  const videoId = getVimeoId(url);
  const iframe = document.createElement('iframe');
  iframe.src = videoId
    ? `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?autoplay=1`
    : url.href;
  iframe.title = title || 'Vimeo video';
  iframe.allow = 'autoplay; fullscreen; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';
  return iframe;
}

function embedVideo(url, title) {
  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('title', title || 'Video');

  const source = document.createElement('source');
  source.src = url.href;
  source.type = videoMimeType(url.href);
  video.append(source);
  return video;
}

function buildEmbed(link, title) {
  const url = new URL(resolveVideoUrl(link), window.location.href);
  const source = getVideoSource(url.href);

  if (source === 'youtube') return embedYoutube(url, title);
  if (source === 'vimeo') return embedVimeo(url, title);
  return embedVideo(url, title);
}

function buildMessage(title, description = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'resource-video-player-message';

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

function buildPlaceholder(video) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'resource-video-player-placeholder';
  button.setAttribute('aria-label', `Play ${video.title || 'video'}`);

  if (video.posterImage?.src) {
    button.append(createOptimizedPicture(
      video.posterImage.src,
      video.posterImage.alt || video.title || 'Video',
      false,
      [{ width: '750' }, { width: '1400' }],
    ));
  } else {
    button.classList.add('is-empty');

    const fallback = document.createElement('div');
    fallback.className = 'resource-video-player-default-poster';
    const image = document.createElement('img');
    image.src = codeAssetPath(DEFAULT_VIDEO_POSTER_PATH);
    image.alt = video.title || 'NCMEC video';
    fallback.append(image);
    button.append(fallback);
  }

  const play = document.createElement('span');
  play.className = 'resource-video-player-play';
  play.setAttribute('aria-hidden', 'true');
  button.append(play);

  return button;
}

function buildPlayer(video) {
  const section = document.createElement('section');
  section.id = 'resource-video-player';
  section.className = 'resource-video-player-shell';

  const frame = document.createElement('div');
  frame.className = 'resource-video-player-frame';

  const embed = (url) => {
    frame.replaceChildren(buildEmbed(url, video.title));
    playNativeVideo(frame);
    frame.classList.add('is-loaded');
  };

  const loadEmbed = () => {
    if (video.videoUrl) {
      embed(video.videoUrl);
      return;
    }

    // S3-hosted video: mint a presigned URL per play (after the registration
    // gate when the resource is gated).
    const start = () => fetchSignedUrl(video.signedUrlEndpoint).then((url) => {
      if (url) embed(url);
    });
    if (!video.gated || isRegistered()) {
      start();
      return;
    }
    openRegistrationModal({ resourceSlug: video.resourceSlug }).then((registration) => {
      if (registration) start();
    });
  };

  const placeholder = buildPlaceholder(video);
  placeholder.addEventListener('click', loadEmbed);
  frame.append(placeholder);
  section.append(frame);

  return section;
}

async function fetchResource(apiBaseUrl, slug) {
  const endpoint = new URL(`/api/resources/${encodeURIComponent(slug)}`, `${apiBaseUrl}/`);
  endpoint.searchParams.set('locale', currentSiteLocale());
  const response = await fetch(endpoint.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}.`);

  const payload = await response.json();
  return payload.data || null;
}

export default async function decorate(block) {
  const title = getFieldValue(block, 'title');
  const config = {
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl')),
    slug: normalizeSlug(getFieldValue(block, 'slug')) || getSlugFromPathname(),
    videoUrl: getFieldValue(block, 'videoUrl'),
    title,
    imageAlt: getFieldValue(block, 'imageAlt'),
  };
  const authoredPoster = getImageValue(block, 'posterImage', config.imageAlt || title || 'Video');

  block.replaceChildren(buildMessage('Loading video...', ''));

  try {
    let resource = null;
    if (config.apiBaseUrl && config.slug) {
      resource = await fetchResource(config.apiBaseUrl, config.slug);
    }

    const slug = resource?.slug || config.slug || '';
    const requiresSignedUrl = Boolean(resource?.requires_signed_url) && slug && config.apiBaseUrl;
    const video = {
      videoUrl: config.videoUrl || resource?.video_url || '',
      gated: Boolean(resource?.gated),
      resourceSlug: slug,
      signedUrlEndpoint: requiresSignedUrl
        ? `${config.apiBaseUrl.replace(/\/+$/, '')}/api/resources/${encodeURIComponent(slug)}/download-url`
        : '',
      title: config.title || resource?.title || '',
      posterImage: authoredPoster || (resource?.header_image || resource?.thumbnail ? {
        src: resource.header_image || resource.thumbnail,
        alt: config.imageAlt || resource.title || 'Video',
      } : null),
    };

    if (!video.videoUrl && !video.signedUrlEndpoint) {
      block.replaceChildren(buildMessage('Missing video URL', 'Add a videoUrl or set a video URL on the resource record.'));
      return;
    }

    block.replaceChildren(buildPlayer(video));
  } catch (error) {
    block.replaceChildren(buildMessage('Video unavailable', error?.message || 'The video could not be loaded.'));
  }
}
