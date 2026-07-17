import { createOptimizedPicture } from '../../scripts/aem.js';
import { decorateInlineColors, moveAttributes } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  getBlockRows,
  readAueResourceFields,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { applyAnimatedMarkers } from '../../scripts/animated-marker.js';
import { bindGatedLink } from '../../scripts/resource-gate.js';

const AEM_PUBLISH_ASSET_ORIGIN = 'https://publish-p171653-e1855116.adobeaemcloud.com';

const FIELD_INDEX = {
  variant: 0,
  content_height: 1,
  content_position: 2,
  media_image: 3,
  media_imageAlt: 4,
  media_overlayOpacity: 5,
  media_gradientOverlay: 6,
  content_showBreadcrumbs: 7,
  content_breadcrumbs: 8,
  pageTitle: 9,
  'jcr:description': 10,
  resourceBody: 11,
  content_textColor: 12,
  watchLabel: 13,
  videoFile: 14,
  videoFilePath: 15,
  videoUrl: 16,
  downloadLabel: 17,
  downloadFile: 18,
  downloadFilePath: 19,
  downloadUrl: 20,
  gated: 21,
  authorName: 22,
  articleDate: 23,
  thumbnail: 24,
  audience: 25,
  issue: 26,
  resourceType: 27,
  language: 28,
  programs: 29,
  gradeAges: 30,
  length: 31,
  tags: 32,
  markerTerms: 33,
  markerColor: 34,
  markerStyle: 35,
};

const RESOURCE_FIELD_NAMES = Object.keys(FIELD_INDEX);

const TAXONOMY_LABELS = {
  audience: {
    families: 'Families',
    'law-enforcement': 'Law Enforcement',
    educators: 'Educators',
    'child-welfare-professionals': 'Child Welfare Professionals',
    'mental-health-professionals': 'Mental Health Professionals',
    'legal-professionals': 'Legal Professionals',
    'electronic-service-providers': 'Electronic Service Providers',
    policymakers: 'Policymakers',
    media: 'Media',
    'native-indigenous-tribal': 'Native, Indigenous & Tribal',
    'teens-13-plus': 'Teens (13+)',
    'children-up-to-12': 'Children (up to 12)',
  },
  issue: {
    'missing-children': 'Missing Children',
    'autism-wandering': 'Autism & Wandering',
    'children-missing-from-care': 'Children Missing from Care',
    'infant-abductions': 'Infant Abductions',
    'long-term-missing-children': 'Long-Term Missing Children',
    'family-abduction': 'Family Abduction',
    'help-id-me': 'Help ID Me',
    csam: 'CSAM',
    'child-sex-trafficking': 'Child Sex Trafficking',
    'online-enticement': 'Online Enticement',
    sextortion: 'Sextortion',
    'generative-ai': 'Generative AI',
    'end-to-end-encryption': 'End-to-End Encryption',
    'disaster-response': 'Disaster Response',
    'ncmec-data': 'NCMEC Data',
    'ncmec-analysis': 'NCMEC Analysis',
    'child-safety-advocacy': 'Child Safety Advocacy',
  },
  resourceType: {
    'tip-sheet': 'Tip Sheet',
    'educator-kit-curriculum': 'Educator Kit / Curriculum',
    'discussion-guide': 'Discussion Guide',
    'professional-guide': 'Professional Guide',
    'data-report': 'Data Report',
    video: 'Video',
    presentation: 'Presentation',
    'activity-sheet': 'Activity Sheet',
    ebook: 'eBook',
    'blog-post': 'Blog Post',
  },
  language: {
    en: 'English',
    es: 'Spanish',
  },
  programs: {
    kidsmartz: 'KidSmartz',
    netsmartz: 'NetSmartz',
  },
  gradeAges: {
    'k-2': 'K-2',
    '3-5': '3-5',
    'middle-school': 'Middle School',
    'high-school': 'High School',
  },
  length: {
    5: '5 minutes or less',
    10: '10 minutes or less',
    15: '15 minutes or less',
    30: '30 minutes or less',
    45: '45 minutes or less',
    60: '60 minutes or less',
  },
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isUniversalEditor() {
  return Boolean(document.querySelector('[data-aue-resource]'));
}

function getRowCells(block) {
  return getBlockRows(block)
    .map((row) => row.children[0] || row)
    .filter(Boolean);
}

function getFieldCell(block, name) {
  if (isUniversalEditor()) return null;
  const index = FIELD_INDEX[name];
  return Number.isInteger(index) ? getRowCells(block)[index] || null : null;
}

function normalizeFieldValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFieldValue(entry)).filter(Boolean).join(',');
  }
  if (typeof value === 'object') {
    const aemPath = value[['_path'].join('')];
    const direct = value.value
      || value.html
      || value.text
      || value.href
      || value.path
      || value.url
      || value.src
      || value.fileReference
      || aemPath
      || value['repo:path'];
    if (direct) return normalizeFieldValue(direct);

    return Object.values(value)
      .map((entry) => normalizeFieldValue(entry))
      .filter(Boolean)
      .join(',');
  }

  return String(value).trim();
}

function readText(block, aemFields, name, fallback = '') {
  const field = readTextField(block, name, { fallbackCell: getFieldCell(block, name) });
  if (field.value) return field.value;

  const linkField = readLinkField(block, name, { fallbackCell: getFieldCell(block, name) });
  if (linkField.value) return linkField.value;

  return normalizeFieldValue(aemFields[name]) || fallback;
}

function readRichHtml(block, aemFields, name) {
  const field = readRichTextField(block, name, { fallbackCell: getFieldCell(block, name) });
  if (field.html) return field.html;
  return normalizeFieldValue(aemFields[name]);
}

function readReference(block, aemFields, name) {
  const aemValue = normalizeFieldValue(aemFields[name]);
  if (aemValue) return aemValue;

  const linkField = readLinkField(block, name, { fallbackCell: getFieldCell(block, name) });
  if (linkField.value) return linkField.value;

  return readText(block, aemFields, name);
}

function moveFieldBinding(from, to) {
  if (!from || !to || from === to) return;
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

function normalizeChoice(value, allowed, fallback) {
  const normalized = normalizeText(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeHeight(value) {
  const trimmed = normalizeText(value).toLowerCase();
  if (!trimmed) return '';
  if (/^[0-9]*\.?[0-9]+$/.test(trimmed)) return `${trimmed}rem`;
  if (/^[0-9]*\.?[0-9]+(rem|px|vh|vw)$/.test(trimmed)) return trimmed;
  return '';
}

function normalizeHexColor(value) {
  const trimmed = normalizeText(value);
  if (/^#[0-9a-f]{3}$/i.test(trimmed) || /^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

function splitList(value) {
  const seen = new Set();
  return normalizeText(value)
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = normalizeKey(entry);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function labelFor(group, value) {
  const key = normalizeKey(value);
  return TAXONOMY_LABELS[group]?.[key] || normalizeText(value);
}

function parseTagEntries(value) {
  return splitList(value)
    .map((entry) => entry.split('|')[0].trim())
    .filter(Boolean);
}

function isDamAssetUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return false;

  try {
    return new URL(raw, window.location.href).pathname.startsWith('/content/dam/');
  } catch {
    return raw.startsWith('/content/dam/');
  }
}

function isAemAuthorHost(hostname = window.location.hostname) {
  return hostname.includes('adobeaemcloud.com');
}

function getAssetOrigin() {
  return isAemAuthorHost() ? window.location.origin : AEM_PUBLISH_ASSET_ORIGIN;
}

function resolveAssetUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.href);
    if (!url.pathname.startsWith('/content/dam/')) return raw;
    if (url.hostname.includes('adobeaemcloud.com')) return url.toString();
    return new URL(`${url.pathname}${url.search}${url.hash}`, getAssetOrigin()).toString();
  } catch {
    if (raw.startsWith('/content/dam/')) return `${getAssetOrigin()}${raw}`;
  }

  return raw;
}

function videoMimeType(url) {
  const extension = new URL(url, window.location.href).pathname.split('.').pop().toLowerCase();
  if (extension === 'mov') return 'video/quicktime';
  return `video/${extension || 'mp4'}`;
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
  const index = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
  return index >= 0 ? parts[index + 1] || '' : '';
}

function getVimeoId(url) {
  return url.pathname.split('/').filter(Boolean).reverse().find((part) => /^\d+$/.test(part)) || '';
}

function buildEmbed(link, title) {
  const resolvedLink = resolveAssetUrl(link);
  const url = new URL(resolvedLink, window.location.href);
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

  const sourceEl = document.createElement('source');
  sourceEl.src = url.href;
  sourceEl.type = videoMimeType(url.href);
  video.append(sourceEl);
  return video;
}

function buildModal(title) {
  const modal = document.createElement('div');
  modal.className = 'resource-hero-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || 'Video');
  modal.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'resource-hero-modal-backdrop';
  modal.append(backdrop);

  const dialog = document.createElement('div');
  dialog.className = 'resource-hero-modal-dialog';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'resource-hero-modal-close';
  closeBtn.setAttribute('aria-label', 'Close video');
  closeBtn.innerHTML = '&times;';
  dialog.append(closeBtn);

  const frame = document.createElement('div');
  frame.className = 'resource-hero-modal-frame';
  dialog.append(frame);

  modal.append(dialog);
  document.body.append(modal);

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    frame.replaceChildren();
  };

  const open = (videoUrl) => {
    frame.replaceChildren(buildEmbed(videoUrl, title));
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });

  return { open };
}

function formatPathSegment(segment) {
  const decoded = (() => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  })();
  return decoded
    .replace(/\.html$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCurrentPathSegments() {
  return window.location.pathname.replace(/\/$/, '').split('/').filter(Boolean);
}

function buildCrumbHref(pathSegments, index) {
  return `/${pathSegments.slice(0, index + 1).join('/')}`;
}

function parseTrailItem(item) {
  const [labelPart, hrefPart] = item.split('::').map((part) => part.trim());
  if (!labelPart) return null;
  return { label: labelPart, href: hrefPart || '' };
}

function parseBreadcrumbTrail(value) {
  return normalizeText(value)
    .split(/[>|]/)
    .map((item) => parseTrailItem(item.trim()))
    .filter(Boolean);
}

function buildPathBreadcrumbs() {
  const segments = getCurrentPathSegments();
  return segments
    .map((segment, index) => ({
      label: formatPathSegment(segment),
      href: index < segments.length - 1 ? buildCrumbHref(segments, index) : '',
    }))
    .filter((crumb) => crumb.label);
}

function normalizeHref(href) {
  if (!href) return '';
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
}

function buildBreadcrumbs(fields) {
  if (fields.showBreadcrumbs !== 'show') return null;

  const parsed = parseBreadcrumbTrail(fields.breadcrumbs);
  const crumbs = parsed.length ? parsed : buildPathBreadcrumbs();
  if (!crumbs.length) return null;

  const nav = document.createElement('nav');
  nav.className = 'resource-hero-breadcrumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');

  const list = document.createElement('ol');
  crumbs.forEach((crumb, index) => {
    const isCurrent = index === crumbs.length - 1;
    const item = document.createElement('li');
    if (isCurrent) item.classList.add('is-current');

    const href = normalizeHref(crumb.href);
    if (!isCurrent && href) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = crumb.label;
      item.append(link);
    } else {
      const label = document.createElement('span');
      label.textContent = crumb.label;
      item.append(label);
    }

    list.append(item);
    if (index < crumbs.length - 1) {
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

function buildInstrumentedText(field, tagName, className, fallback = '') {
  if (!field.source && !field.value && !fallback) return null;

  const element = document.createElement(tagName);
  element.className = className;

  if (field.source) {
    moveFieldBinding(field.source, element);
    if (field.source.childNodes.length) {
      while (field.source.firstChild) element.append(field.source.firstChild);
    } else {
      element.textContent = field.value || fallback;
    }
  } else {
    element.textContent = field.value || fallback;
  }

  return element;
}

function buildRichText(field, className, fallbackHtml = '') {
  if (!field.source && !field.html && !fallbackHtml) return null;

  const wrapper = document.createElement('div');
  wrapper.className = className;

  if (field.source) {
    moveFieldBinding(field.source, wrapper);
    while (field.source.firstChild) wrapper.append(field.source.firstChild);
    if (!wrapper.textContent.trim() && fallbackHtml) wrapper.innerHTML = fallbackHtml;
  } else {
    wrapper.innerHTML = field.html || fallbackHtml;
  }

  return wrapper.textContent.trim() || wrapper.querySelector('img, picture, video, table, ul, ol')
    ? wrapper
    : null;
}

function buildTaxonomy(fields) {
  const entries = [
    ...splitList(fields.resourceType).map((value) => labelFor('resourceType', value)),
    ...splitList(fields.audience).map((value) => labelFor('audience', value)),
    ...splitList(fields.issue).map((value) => labelFor('issue', value)),
    fields.language ? labelFor('language', fields.language) : '',
    ...splitList(fields.programs).map((value) => labelFor('programs', value)),
    ...splitList(fields.gradeAges).map((value) => labelFor('gradeAges', value)),
    fields.length ? labelFor('length', fields.length) : '',
    ...parseTagEntries(fields.tags),
  ].filter(Boolean);

  if (!entries.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'resource-hero-taxonomy';

  entries.slice(0, 8).forEach((label) => {
    const pill = document.createElement('span');
    pill.className = 'resource-hero-pill';
    pill.textContent = label;
    wrap.append(pill);
  });

  return wrap;
}

function fileNameFromUrl(url) {
  return String(url || '').split(/[?#]/)[0].split('/').pop() || '';
}

function getSlugFromPathname() {
  const segments = window.location.pathname
    .replace(/\.html$/i, '')
    .replace(/\/+$/g, '')
    .split('/')
    .filter(Boolean);
  return segments[segments.length - 1] || '';
}

function buildActions(fields) {
  const videoSource = fields.videoUrl || fields.videoFilePath || fields.videoFile;
  const downloadSource = fields.downloadUrl || fields.downloadFilePath || fields.downloadFile;

  if (!videoSource && !downloadSource) return null;

  const actions = document.createElement('div');
  actions.className = 'resource-hero-actions';

  if (videoSource) {
    const modal = buildModal(fields.title || 'Video');
    const watch = document.createElement('button');
    watch.type = 'button';
    watch.className = 'resource-hero-action is-watch';
    watch.textContent = fields.watchLabel || 'Watch Video';
    watch.addEventListener('click', () => modal.open(videoSource));
    actions.append(watch);
  }

  if (downloadSource) {
    const download = document.createElement('a');
    const href = resolveAssetUrl(downloadSource);
    const label = fields.downloadLabel || 'Download Resource';

    download.className = 'resource-hero-action is-download';
    download.href = href;
    download.textContent = label;
    if (isDamAssetUrl(downloadSource)) download.setAttribute('download', '');
    else {
      download.target = '_blank';
      download.rel = 'noopener noreferrer';
    }

    bindGatedLink(download, {
      gated: fields.gated === 'true',
      resourceSlug: getSlugFromPathname(),
      fileUrl: href,
      fileName: fileNameFromUrl(href),
      downloadLabel: label,
    });
    actions.append(download);
  }

  return actions;
}

function getPicture(block, aemFields, alt) {
  const imageField = readImageField(block, 'media_image', {
    fallbackCell: getFieldCell(block, 'media_image'),
  });

  if (imageField.picture) {
    if (imageField.source && imageField.source !== imageField.picture) {
      moveFieldBinding(imageField.source, imageField.picture);
    }
    const img = imageField.picture.querySelector('img');
    if (img && alt) img.alt = alt;
    return imageField.picture;
  }

  const imagePath = normalizeFieldValue(aemFields.media_image);
  if (!imagePath) return null;

  return createOptimizedPicture(
    resolveAssetUrl(imagePath),
    alt || 'Resource hero image',
    false,
    [{ width: '750' }, { width: '2000' }],
  );
}

function buildHiddenArchive(block) {
  const rows = getBlockRows(block)
    .filter((row) => row.querySelector('[data-aue-prop], [data-richtext-prop]'));
  if (!rows.length) return null;

  const archive = document.createElement('span');
  archive.hidden = true;
  rows.forEach((row) => archive.append(row));
  return archive;
}

function readFields(block, aemFields) {
  const titleField = readTextField(block, 'pageTitle', {
    fallbackCell: getFieldCell(block, 'pageTitle'),
  });
  const introField = readTextField(block, 'jcr:description', {
    fallbackCell: getFieldCell(block, 'jcr:description'),
  });
  const bodyField = readRichTextField(block, 'resourceBody', {
    fallbackCell: getFieldCell(block, 'resourceBody'),
  });

  return {
    variant: normalizeChoice(readText(block, aemFields, 'variant'), ['default', 'compact'], 'default'),
    height: normalizeHeight(readText(block, aemFields, 'content_height')),
    position: normalizeChoice(
      readText(block, aemFields, 'content_position'),
      ['left', 'center', 'right'],
      'left',
    ),
    overlayOpacity: readText(block, aemFields, 'media_overlayOpacity', '50'),
    gradientOverlay: normalizeChoice(
      readText(block, aemFields, 'media_gradientOverlay'),
      ['show', 'hide'],
      'show',
    ),
    showBreadcrumbs: normalizeChoice(
      readText(block, aemFields, 'content_showBreadcrumbs'),
      ['show', 'hide'],
      'show',
    ),
    breadcrumbs: readText(block, aemFields, 'content_breadcrumbs'),
    title: titleField.value || normalizeFieldValue(aemFields.pageTitle),
    titleField,
    intro: introField.value || normalizeFieldValue(aemFields['jcr:description']),
    introField,
    bodyHtml: bodyField.html || readRichHtml(block, aemFields, 'resourceBody'),
    bodyField,
    textColor: normalizeHexColor(readText(block, aemFields, 'content_textColor')),
    watchLabel: readText(block, aemFields, 'watchLabel', 'Watch Video'),
    videoFile: readReference(block, aemFields, 'videoFile'),
    videoFilePath: readText(block, aemFields, 'videoFilePath'),
    videoUrl: readText(block, aemFields, 'videoUrl'),
    downloadLabel: readText(block, aemFields, 'downloadLabel', 'Download Resource'),
    downloadFile: readReference(block, aemFields, 'downloadFile'),
    downloadFilePath: readText(block, aemFields, 'downloadFilePath'),
    downloadUrl: readText(block, aemFields, 'downloadUrl'),
    gated: normalizeText(readText(block, aemFields, 'gated')).toLowerCase(),
    authorName: readText(block, aemFields, 'authorName'),
    articleDate: readText(block, aemFields, 'articleDate'),
    thumbnail: readReference(block, aemFields, 'thumbnail'),
    audience: readText(block, aemFields, 'audience'),
    issue: readText(block, aemFields, 'issue'),
    resourceType: readText(block, aemFields, 'resourceType'),
    language: readText(block, aemFields, 'language'),
    programs: readText(block, aemFields, 'programs'),
    gradeAges: readText(block, aemFields, 'gradeAges'),
    length: readText(block, aemFields, 'length'),
    tags: readText(block, aemFields, 'tags'),
    markerTerms: readText(block, aemFields, 'markerTerms'),
    markerColor: normalizeHexColor(readText(block, aemFields, 'markerColor')),
    markerStyle: normalizeChoice(readText(block, aemFields, 'markerStyle'), ['circle', 'underline'], 'circle'),
  };
}

function applyBlockSettings(block, fields) {
  block.classList.add(
    `resource-hero-variant-${fields.variant}`,
    `resource-hero-pos-${fields.position}`,
  );
  if (fields.gradientOverlay === 'show') block.classList.add('resource-hero-gradient');
  if (fields.height) block.style.setProperty('--resource-hero-min-height', fields.height);

  const opacity = parseInt(fields.overlayOpacity, 10);
  if (!Number.isNaN(opacity) && opacity >= 0 && opacity <= 100) {
    block.style.setProperty('--resource-hero-overlay-opacity', String(opacity / 100));
  }
}

export default async function decorate(block) {
  block.classList.add('no-scroll-reveal', 'is-visible');
  block.classList.remove('scroll-reveal');

  const blockPath = getAueResourcePath(block);
  const aemFields = blockPath
    ? await readAueResourceFields(blockPath, RESOURCE_FIELD_NAMES)
    : {};
  const fields = readFields(block, aemFields);
  const archive = buildHiddenArchive(block);

  applyBlockSettings(block, fields);

  const picture = getPicture(block, aemFields, readText(block, aemFields, 'media_imageAlt'));
  const content = document.createElement('div');
  content.className = 'resource-hero-content';

  const layout = document.createElement('div');
  layout.className = 'resource-hero-layout';

  const main = document.createElement('div');
  main.className = 'resource-hero-main';

  const breadcrumbs = buildBreadcrumbs(fields);
  if (breadcrumbs) main.append(breadcrumbs);

  const taxonomy = buildTaxonomy(fields);
  if (taxonomy) main.append(taxonomy);

  const title = buildInstrumentedText(
    fields.titleField,
    'h1',
    'resource-hero-title',
    fields.title || 'Resource title',
  );
  if (title) main.append(title);

  const intro = buildInstrumentedText(
    fields.introField,
    'p',
    'resource-hero-intro',
    fields.intro,
  );
  if (intro) main.append(intro);

  const body = buildRichText(fields.bodyField, 'resource-hero-body richtext-preserve-spaces', fields.bodyHtml);
  if (body) main.append(body);

  const actions = buildActions(fields);
  if (actions) main.append(actions);

  [title, intro, body].filter(Boolean).forEach((target) => {
    applyAnimatedMarkers(target, {
      terms: fields.markerTerms,
      color: fields.markerColor,
      style: fields.markerStyle,
    });
    decorateInlineColors(target);
    if (fields.textColor) target.style.color = fields.textColor;
  });

  layout.append(main);
  content.append(layout);

  const children = [];
  if (picture) children.push(picture);
  children.push(content);
  if (archive) children.push(archive);

  block.replaceChildren(...children);
}
