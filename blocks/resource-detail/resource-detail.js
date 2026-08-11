import { createOptimizedPicture } from '../../scripts/aem.js';
import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import { buildListFilterHref } from '../../scripts/list-filter-state.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { bindGatedLink } from '../../scripts/resource-gate.js';

const FIELD_LABELS = {
  apiBaseUrl: ['api base url', 'api url', 'resource api base url', 'resource api url'],
  slug: ['slug', 'resource slug', 'preview slug', 'preview resource slug'],
  listingPath: ['listing path', 'back link', 'back link url', 'back url'],
  listingLabel: ['listing label', 'back link label', 'back label'],
  ctaLabel: ['cta label', 'resource cta label', 'button label', 'primary cta label'],
  gated: ['gated', 'gate downloads', 'gated download'],
};

const FIELD_COLUMN_INDEX = {
  apiBaseUrl: 0,
  slug: 1,
  listingPath: 2,
  listingLabel: 3,
  ctaLabel: 4,
  gated: 5,
};

const DEFAULT_RESOURCE_LISTING_PATH = '/content/edge/resources.html';

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function getPropValue(scope, name) {
  return normalizeText(readLinkField(scope, name).value || readTextField(scope, name).value);
}

function getRows(block) {
  return getBlockRows(block);
}

function readConfigValue(rows, name, fallback = '') {
  const propValue = rows
    .map((row) => readLinkField(row, name).value || readTextField(row, name).value)
    .find(Boolean);

  if (propValue) {
    return normalizeText(propValue) || fallback;
  }

  const columnIndex = FIELD_COLUMN_INDEX[name];
  if (columnIndex !== undefined) {
    const value = rows
      .map((row) => {
        const cols = [...row.children];
        const cell = cols[columnIndex];
        if (!cell) return '';
        const anchor = cell.querySelector('a');
        if (anchor) return normalizeText(anchor.getAttribute('href') || anchor.textContent);
        if (name === 'apiBaseUrl') return findUrlLikeValue(cell.textContent) || normalizeText(cell.textContent);
        return normalizeText(cell.textContent);
      })
      .find(Boolean);

    if (value) return value;
  }

  if (name === 'apiBaseUrl') {
    const url = rows
      .map((row) => row.querySelector('a')?.href || findUrlLikeValue(row.textContent))
      .find(Boolean);
    if (url) return normalizeText(url);
  }

  return fallback;
}

function getLegacyValue(block, name) {
  const labels = FIELD_LABELS[name] || [];
  const rows = getRows(block);
  const row = rows.find((entry) => {
    if (entry.children.length !== 2) return false;
    const key = normalizeText(entry.children[0].textContent).toLowerCase();
    return labels.some((label) => key === label || key.includes(label));
  });

  if (!row) return '';

  const valueCell = row.children[1];
  const anchor = valueCell.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || valueCell.textContent);
}

function getFieldValue(block, name, fallback = '') {
  const rows = getRows(block);
  return getPropValue(block, name)
    || readConfigValue(rows, name)
    || getLegacyValue(block, name)
    || fallback;
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeEdgeContentPath(value, fallback = '') {
  return resolveSiteHref(value || fallback);
}

function normalizeSlug(value) {
  const normalized = normalizeText(value)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');

  if (!normalized) return '';

  try {
    return decodeURIComponent(normalized);
  } catch (e) {
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

function buildLinkedPill(label, href, className = '') {
  const pill = document.createElement('a');
  pill.className = `resource-detail-pill is-linked ${className}`.trim();
  pill.href = href;
  pill.textContent = label;
  return pill;
}

function buildMessage(title, description) {
  const wrapper = document.createElement('div');
  wrapper.className = 'resource-detail-message';

  const heading = document.createElement('h2');
  heading.className = 'resource-detail-message-title';
  heading.textContent = title;
  wrapper.append(heading);

  if (description) {
    const text = document.createElement('p');
    text.className = 'resource-detail-message-copy';
    text.textContent = description;
    wrapper.append(text);
  }

  return wrapper;
}

function buildTaxonomy(resource, listingPath) {
  const values = [
    ...(resource.resource_type && resource.resource_type_label ? [{
      label: resource.resource_type_label,
      href: buildListFilterHref(listingPath, {
        types: [resource.resource_type],
      }),
    }] : []),
    ...((resource.audience_labels || []).map((label, index) => ({
      label,
      href: buildListFilterHref(listingPath, {
        audiences: [resource.audience_values?.[index] || label],
      }),
    }))),
    ...(resource.issue && resource.issue_label ? [{
      label: resource.issue_label,
      href: buildListFilterHref(listingPath, {
        issues: [resource.issue],
      }),
    }] : []),
    ...(resource.language && resource.language_label ? [{
      label: resource.language_label,
      href: buildListFilterHref(listingPath, {
        languages: [resource.language],
      }),
    }] : []),
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
  ].filter((entry) => normalizeText(entry.label));

  if (!values.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'resource-detail-taxonomy';
  values.forEach((value) => wrap.append(buildLinkedPill(value.label, value.href, 'is-taxonomy')));
  return wrap;
}

function buildTags(resource, listingPath) {
  const tags = (resource.tags || [])
    .map((tag) => ({
      label: normalizeText(tag.name),
      value: normalizeText(tag.slug || tag.name),
    }))
    .filter((tag) => tag.label);

  if (!tags.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'resource-detail-tags';
  tags.forEach((tag) => {
    wrap.append(buildLinkedPill(tag.label, buildListFilterHref(listingPath, {
      tags: [tag.value],
    })));
  });
  return wrap;
}

function buildMeta(resource) {
  const values = [resource.author, resource.article_date_label].filter(Boolean);
  if (!values.length) return null;

  const meta = document.createElement('div');
  meta.className = 'resource-detail-meta';

  values.forEach((value, index) => {
    const item = document.createElement('span');
    item.className = 'resource-detail-meta-item';
    item.textContent = value;
    meta.append(item);

    if (index < values.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'resource-detail-meta-separator';
      separator.textContent = '|';
      meta.append(separator);
    }
  });

  return meta;
}

function resolveGated(resource, config) {
  // A signed-URL file is gated in the backend, which refuses to mint the
  // presigned URL without the registration token — an authored "false" would
  // only hide the modal and leave the visitor clicking a button that 401s.
  if (resource.requires_signed_url) return true;
  // Authored block value overrides the API value; missing → API → open.
  if (config.gated === 'true') return true;
  if (config.gated === 'false') return false;
  return Boolean(resource.gated);
}

function buildActions(resource, config) {
  const downloadUrl = resource.download_url || resource.resource_url;
  const slug = resource.slug || config.slug || '';
  // S3-backed gated files expose no URL — the gate requests a presigned one
  // from the download-url endpoint per click.
  const requiresSignedUrl = Boolean(resource.requires_signed_url) && slug;
  if (!downloadUrl && !requiresSignedUrl) return null;

  const actions = document.createElement('div');
  actions.className = 'resource-detail-actions';

  const link = document.createElement('a');
  link.className = 'resource-detail-primary-action';
  link.textContent = config.ctaLabel;

  if (requiresSignedUrl) {
    link.href = '#';
    bindGatedLink(link, {
      gated: resolveGated(resource, config),
      resourceSlug: slug,
      fileName: resource.aem_asset_name || '',
      downloadLabel: config.ctaLabel,
      signedUrlEndpoint: `${config.apiBaseUrl.replace(/\/+$/, '')}/api/resources/${encodeURIComponent(slug)}/download-url`,
    });
    actions.append(link);
    return actions;
  }

  link.href = downloadUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  bindGatedLink(link, {
    gated: resolveGated(resource, config),
    resourceSlug: slug,
    fileUrl: downloadUrl,
    fileName: resource.aem_asset_name || '',
    downloadLabel: config.ctaLabel,
  });

  actions.append(link);

  return actions;
}

function buildHero(resource, config) {
  const hero = document.createElement('section');
  hero.className = 'resource-detail-hero';

  if (resource.header_image) {
    const media = document.createElement('div');
    media.className = 'resource-detail-hero-media';
    media.append(
      createOptimizedPicture(
        resource.header_image,
        resource.title || 'Resource hero image',
        false,
        [{ width: '750' }, { width: '1600' }],
      ),
    );
    hero.append(media);
  }

  const overlay = document.createElement('div');
  overlay.className = 'resource-detail-hero-overlay';
  hero.append(overlay);

  const content = document.createElement('div');
  content.className = 'resource-detail-hero-content';

  const backLink = document.createElement('a');
  backLink.className = 'resource-detail-back-link';
  backLink.href = config.listingPath;
  backLink.textContent = config.listingLabel;
  content.append(backLink);

  const taxonomy = buildTaxonomy(resource, config.listingPath);
  if (taxonomy) content.append(taxonomy);

  const title = document.createElement('h1');
  title.className = 'resource-detail-title';
  title.textContent = resource.title || 'Resource';
  content.append(title);

  const meta = buildMeta(resource);
  if (meta) content.append(meta);

  if (normalizeText(resource.excerpt)) {
    const excerpt = document.createElement('p');
    excerpt.className = 'resource-detail-excerpt';
    excerpt.textContent = resource.excerpt;
    content.append(excerpt);
  }

  const actions = buildActions(resource, config);
  if (actions) content.append(actions);

  hero.append(content);
  return hero;
}

function buildBody(resource, config) {
  const article = document.createElement('article');
  article.className = 'resource-detail-article';

  const inner = document.createElement('div');
  inner.className = 'resource-detail-prose';

  const tags = buildTags(resource, config.listingPath);
  if (tags) inner.append(tags);

  if (normalizeText(resource.body)) {
    const body = document.createElement('div');
    body.className = 'resource-detail-body';
    body.innerHTML = resource.body;
    inner.append(body);
    article.append(inner);
    return article;
  }

  if (normalizeText(resource.excerpt)) {
    const paragraph = document.createElement('p');
    paragraph.className = 'resource-detail-body';
    paragraph.textContent = resource.excerpt;
    inner.append(paragraph);
    article.append(inner);
    return article;
  }

  return null;
}

function buildResourceView(resource, config) {
  const fragment = document.createDocumentFragment();
  fragment.append(buildHero(resource, config));

  const body = buildBody(resource, config);
  if (body) fragment.append(body);

  return fragment;
}

async function fetchResource(apiBaseUrl, slug) {
  const endpoint = new URL(`/api/resources/${encodeURIComponent(slug)}`, `${apiBaseUrl}/`);
  endpoint.searchParams.set('locale', currentSiteLocale());
  const response = await fetch(endpoint.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return payload.data || null;
}

export default async function decorate(block) {
  const config = {
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl')),
    slug: normalizeSlug(getFieldValue(block, 'slug')) || getSlugFromPathname(),
    listingPath: normalizeEdgeContentPath(getFieldValue(block, 'listingPath'), DEFAULT_RESOURCE_LISTING_PATH),
    listingLabel: getFieldValue(block, 'listingLabel', 'Back to Resources') || 'Back to Resources',
    ctaLabel: getFieldValue(block, 'ctaLabel', 'Open Resource') || 'Open Resource',
    gated: normalizeText(getFieldValue(block, 'gated')).toLowerCase(),
  };

  block.replaceChildren(buildMessage('Loading resource...', ''));

  if (!config.apiBaseUrl) {
    block.replaceChildren(
      buildMessage(
        'Missing API configuration',
        'Set apiBaseUrl on this block so the resource detail page can load data.',
      ),
    );
    return;
  }

  if (!config.slug) {
    block.replaceChildren(
      buildMessage(
        'Missing resource slug',
        'Set a slug on the block for preview, or open the page using a /resources/{slug} URL.',
      ),
    );
    return;
  }

  try {
    const resource = await fetchResource(config.apiBaseUrl, config.slug);

    if (!resource) {
      block.replaceChildren(
        buildMessage(
          'Resource not found',
          `No published resource was found for the slug "${config.slug}".`,
        ),
      );
      return;
    }

    block.replaceChildren(buildResourceView(resource, config));
    if (normalizeText(resource.title)) {
      document.title = `${resource.title} | NCMEC`;
    }
  } catch (error) {
    block.replaceChildren(
      buildMessage(
        'Resource unavailable',
        error?.message || 'The resource detail API request failed.',
      ),
    );
  }
}
