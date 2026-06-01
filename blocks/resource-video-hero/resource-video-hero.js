import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import { buildListFilterHref } from '../../scripts/list-filter-state.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

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
};

const DEFAULT_LISTING_PATH = '/content/edge/resources.html';

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/https?:\/\/[^\s<>"]+/i);
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
      if (name === 'apiBaseUrl') return findUrlLikeValue(cell.textContent) || normalizeText(cell.textContent);
      return normalizeText(cell.textContent);
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
      href: buildListFilterHref(listingPath, {
        tags: [tag.slug || tag.name],
      }),
    }))),
  ].filter((entry) => normalizeText(entry.label));

  if (!values.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'resource-video-hero-taxonomy';
  values.slice(0, 6).forEach((value) => wrap.append(buildLinkedPill(value.label, value.href)));
  return wrap;
}

function buildActions(resource, config) {
  const actions = document.createElement('div');
  actions.className = 'resource-video-hero-actions';

  const watch = document.createElement('a');
  watch.className = 'resource-video-hero-action is-primary';
  watch.href = config.watchTarget || '#resource-video-player';
  watch.textContent = config.watchLabel || 'Watch Video';
  actions.append(watch);

  const downloadUrl = resource.download_url || resource.resource_url;
  if (downloadUrl) {
    const download = document.createElement('a');
    download.className = 'resource-video-hero-action is-secondary';
    download.href = resolveSiteHref(downloadUrl);
    download.target = '_blank';
    download.rel = 'noopener noreferrer';
    download.textContent = config.downloadLabel || 'Download Resource';
    actions.append(download);
  }

  return actions;
}

function buildHero(resource, config) {
  const section = document.createElement('section');
  section.className = 'resource-video-hero-shell';

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

  const title = document.createElement('h1');
  title.className = 'resource-video-hero-title';
  title.textContent = resource.title || config.title || 'Video Resource';
  section.append(title);

  const description = normalizeText(resource.excerpt || config.description);
  if (description) {
    const copy = document.createElement('p');
    copy.className = 'resource-video-hero-description';
    copy.textContent = description;
    section.append(copy);
  }

  const taxonomy = buildTaxonomy(resource, config.listingPath || DEFAULT_LISTING_PATH);
  if (taxonomy) section.append(taxonomy);

  section.append(buildActions(resource, config));
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
  const config = {
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl')),
    slug: normalizeSlug(getFieldValue(block, 'slug')) || getSlugFromPathname(),
    listingPath: getFieldValue(block, 'listingPath', DEFAULT_LISTING_PATH),
    listingLabel: getFieldValue(block, 'listingLabel', 'Resources'),
    watchLabel: getFieldValue(block, 'watchLabel', 'Watch Video'),
    downloadLabel: getFieldValue(block, 'downloadLabel', 'Download Resource'),
    watchTarget: getFieldValue(block, 'watchTarget', '#resource-video-player'),
    title: getFieldValue(block, 'title'),
    description: getFieldValue(block, 'description'),
  };

  block.replaceChildren(buildMessage('Loading resource...', ''));

  if (!config.apiBaseUrl) {
    block.replaceChildren(buildHero({}, config));
    return;
  }

  if (!config.slug) {
    block.replaceChildren(buildMessage('Missing resource slug', 'Set a slug for preview or open the published resource URL.'));
    return;
  }

  try {
    const resource = await fetchResource(config.apiBaseUrl, config.slug);
    if (!resource) {
      block.replaceChildren(buildMessage('Resource not found', `No published resource was found for "${config.slug}".`));
      return;
    }

    block.replaceChildren(buildHero(resource, config));
    if (normalizeText(resource.title)) document.title = `${resource.title} | NCMEC`;
  } catch (error) {
    block.replaceChildren(buildMessage('Resource unavailable', error?.message || 'The resource API request failed.'));
  }
}
