import { createOptimizedPicture } from '../../scripts/aem.js';

const FIELD_LABELS = {
  apiBaseUrl: ['api base url', 'api url'],
  slug: ['slug', 'resource slug', 'preview slug'],
  listingPath: ['listing path', 'back link', 'back link url', 'back url'],
  listingLabel: ['listing label', 'back link label', 'back label'],
  ctaLabel: ['cta label', 'resource cta label', 'button label'],
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function getPropValue(block, name) {
  const node = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!node) return '';
  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || node.textContent);
}

function getLegacyValue(block, name) {
  const labels = FIELD_LABELS[name] || [];
  const rows = [...block.querySelectorAll(':scope > div')];
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
  return getPropValue(block, name) || getLegacyValue(block, name) || fallback;
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

function buildPill(label, className = '') {
  const pill = document.createElement('span');
  pill.className = `resource-detail-pill ${className}`.trim();
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

function buildHeaderMedia(resource) {
  if (!resource.header_image) return null;

  const media = document.createElement('div');
  media.className = 'resource-detail-media';
  media.append(
    createOptimizedPicture(
      resource.header_image,
      resource.title || 'Resource header image',
      false,
      [{ width: '750' }, { width: '1400' }],
    ),
  );

  return media;
}

function buildTaxonomy(resource) {
  const values = [
    resource.resource_type_label,
    resource.audience_label,
    resource.issue_label,
  ].filter(Boolean);

  if (!values.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'resource-detail-taxonomy';
  values.forEach((value) => wrap.append(buildPill(value, 'is-taxonomy')));
  return wrap;
}

function buildTags(resource) {
  const tags = (resource.tags || [])
    .map((tag) => normalizeText(tag.name))
    .filter(Boolean);

  if (!tags.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'resource-detail-tags';
  tags.forEach((tag) => wrap.append(buildPill(tag)));
  return wrap;
}

function buildActions(resource, ctaLabel) {
  if (!resource.resource_url) return null;

  const actions = document.createElement('div');
  actions.className = 'resource-detail-actions';

  const link = document.createElement('a');
  link.className = 'resource-detail-primary-action';
  link.href = resource.resource_url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = ctaLabel;
  actions.append(link);

  return actions;
}

function buildBody(resource) {
  const body = document.createElement('div');
  body.className = 'resource-detail-body';

  if (normalizeText(resource.body)) {
    body.innerHTML = resource.body;
    return body;
  }

  if (normalizeText(resource.excerpt)) {
    const paragraph = document.createElement('p');
    paragraph.textContent = resource.excerpt;
    body.append(paragraph);
    return body;
  }

  return null;
}

function buildResourceView(resource, config) {
  const fragment = document.createDocumentFragment();

  const backLink = document.createElement('a');
  backLink.className = 'resource-detail-back-link';
  backLink.href = config.listingPath;
  backLink.textContent = config.listingLabel;
  fragment.append(backLink);

  const hero = document.createElement('section');
  hero.className = 'resource-detail-hero';

  const media = buildHeaderMedia(resource);
  if (media) hero.append(media);

  const summary = document.createElement('div');
  summary.className = 'resource-detail-summary';

  const taxonomy = buildTaxonomy(resource);
  if (taxonomy) summary.append(taxonomy);

  const title = document.createElement('h1');
  title.className = 'resource-detail-title';
  title.textContent = resource.title || 'Resource';
  summary.append(title);

  if (normalizeText(resource.excerpt)) {
    const excerpt = document.createElement('p');
    excerpt.className = 'resource-detail-excerpt';
    excerpt.textContent = resource.excerpt;
    summary.append(excerpt);
  }

  const tags = buildTags(resource);
  if (tags) summary.append(tags);

  const actions = buildActions(resource, config.ctaLabel);
  if (actions) summary.append(actions);

  hero.append(summary);
  fragment.append(hero);

  const body = buildBody(resource);
  if (body) fragment.append(body);

  return fragment;
}

async function fetchResource(apiBaseUrl, slug) {
  const endpoint = new URL(`/api/resources/${encodeURIComponent(slug)}`, `${apiBaseUrl}/`);
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
    listingPath: getFieldValue(block, 'listingPath', '/resources') || '/resources',
    listingLabel: getFieldValue(block, 'listingLabel', 'Back to Resources') || 'Back to Resources',
    ctaLabel: getFieldValue(block, 'ctaLabel', 'Open Resource') || 'Open Resource',
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
