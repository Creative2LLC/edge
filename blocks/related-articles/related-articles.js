const FIELD_LABELS = {
  apiBaseUrl: ['api base url', 'api url', 'resource api base url', 'resource api url'],
  slug: ['slug', 'resource slug', 'preview slug', 'preview resource slug'],
  heading: ['heading', 'title'],
  limit: ['limit', 'item limit', 'count'],
};

const FIELD_COLUMN_INDEX = {
  apiBaseUrl: 0,
  slug: 1,
  heading: 2,
  limit: 3,
};

const EDGE_CONTENT_PREFIX = '/content/edge';

function normalizeText(value) {
  return `${value || ''}`.trim();
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

function normalizeEdgeContentPath(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith(EDGE_CONTENT_PREFIX)) return normalized;
  if (normalized.startsWith('/')) return `${EDGE_CONTENT_PREFIX}${normalized}`;
  return `${EDGE_CONTENT_PREFIX}/${normalized.replace(/^\/+/, '')}`;
}

function findUrlLikeValue(value) {
  const match = `${value || ''}`.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getPropValue(scope, name) {
  const node = scope.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  if (!node) return '';
  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || node.getAttribute('href') || node.textContent);
}

function readConfigValue(rows, name, fallback = '') {
  const propValue = rows
    .map((row) => row.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`))
    .find(Boolean);

  if (propValue) {
    const anchor = propValue.tagName === 'A' ? propValue : propValue.querySelector('a');
    return normalizeText(anchor?.getAttribute('href') || propValue.getAttribute('href') || propValue.textContent) || fallback;
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

function parseLimit(value, fallback = 3) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function buildMessage(title, description) {
  const wrapper = document.createElement('div');
  wrapper.className = 'related-articles-message';

  const heading = document.createElement('h3');
  heading.className = 'related-articles-message-title';
  heading.textContent = title;
  wrapper.append(heading);

  if (description) {
    const text = document.createElement('p');
    text.className = 'related-articles-message-copy';
    text.textContent = description;
    wrapper.append(text);
  }

  return wrapper;
}

function buildPill(label, className = '') {
  const pill = document.createElement('span');
  pill.className = `related-articles-pill ${className}`.trim();
  pill.textContent = label;
  return pill;
}

function buildTaxonomy(resource) {
  const values = [
    resource.resource_type_label,
    resource.audience_label,
    resource.issue_label,
  ].filter(Boolean);
  if (!values.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'related-articles-taxonomy';
  values.slice(0, 2).forEach((value) => wrap.append(buildPill(value, 'is-taxonomy')));
  return wrap;
}

function buildCard(resource) {
  const card = document.createElement('article');
  card.className = 'related-articles-card';

  const href = normalizeEdgeContentPath(resource.detail_path);
  if (href) {
    const link = document.createElement('a');
    link.className = 'related-articles-card-link-cover';
    link.href = href;
    link.setAttribute('aria-label', resource.title || 'Related article');
    card.append(link);
  }

  if (resource.thumbnail) {
    const media = document.createElement('div');
    media.className = 'related-articles-card-media';
    const image = document.createElement('img');
    image.src = resource.thumbnail;
    image.alt = resource.title || 'Related article image';
    image.loading = 'lazy';
    media.append(image);
    card.append(media);
  }

  const body = document.createElement('div');
  body.className = 'related-articles-card-body';

  const taxonomy = buildTaxonomy(resource);
  if (taxonomy) body.append(taxonomy);

  if (resource.article_date_label) {
    const date = document.createElement('p');
    date.className = 'related-articles-card-date';
    date.textContent = resource.article_date_label;
    body.append(date);
  }

  const title = document.createElement('h3');
  title.className = 'related-articles-card-title';
  title.textContent = resource.title || 'Related article';
  body.append(title);

  if (resource.excerpt) {
    const excerpt = document.createElement('p');
    excerpt.className = 'related-articles-card-excerpt';
    excerpt.textContent = resource.excerpt;
    body.append(excerpt);
  }

  if (href) {
    const link = document.createElement('a');
    link.className = 'related-articles-card-link';
    link.href = href;
    link.textContent = 'Learn More';
    body.append(link);
  }

  card.append(body);
  return card;
}

function buildView(resources, config) {
  const fragment = document.createDocumentFragment();

  if (config.heading) {
    const heading = document.createElement('h2');
    heading.className = 'related-articles-heading';
    heading.textContent = config.heading;
    fragment.append(heading);
  }

  const grid = document.createElement('div');
  grid.className = 'related-articles-grid';
  resources.forEach((resource) => grid.append(buildCard(resource)));
  fragment.append(grid);
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
    heading: getFieldValue(block, 'heading', 'Related Articles') || 'Related Articles',
    limit: parseLimit(getFieldValue(block, 'limit', '3'), 3),
  };

  block.replaceChildren(buildMessage('Loading related articles...', ''));

  if (!config.apiBaseUrl) {
    block.replaceChildren(
      buildMessage(
        'Missing API configuration',
        'Set apiBaseUrl on this block so it can load related article data.',
      ),
    );
    return;
  }

  if (!config.slug) {
    block.replaceChildren(
      buildMessage(
        'Missing resource slug',
        'Set a preview slug on the block or open the page using a /resources/{slug} URL.',
      ),
    );
    return;
  }

  try {
    const resource = await fetchResource(config.apiBaseUrl, config.slug);
    const related = (resource?.related_articles || []).slice(0, config.limit);

    if (!related.length) {
      block.replaceChildren();
      return;
    }

    block.replaceChildren(buildView(related, config));
  } catch (error) {
    block.replaceChildren(buildMessage('Related articles unavailable', error?.message || 'The related article API request failed.'));
  }
}
