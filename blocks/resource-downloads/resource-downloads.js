/*
 * Resource Downloads block — the download list on resource landing pages.
 * Hosts one or more download links, each backed by a backend resource slug
 * (preferred; pulls title/file/gating from the API) or a direct DAM file.
 * Gated items render "Locked" and go through the shared registration modal
 * in scripts/resource-gate.js; every download fires a GA4 + backend event.
 *
 * The backend stamps apiBaseUrl/slug/gated onto this block and seeds the
 * first item when it auto-creates a landing page for a DAM asset.
 */

import { moveInstrumentation } from '../../scripts/scripts.js';
import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import {
  getBlockRows,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import { bindGatedLink } from '../../scripts/resource-gate.js';

const LOCKED_LABEL = 'Locked';
const DOWNLOAD_LABEL = 'Download';

const FILE_EXTENSION_PATTERN = /\.(pdf|docx?|pptx?|zip|xlsx?|mp4|mov)([?#]|$)/i;

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function isUrlLike(value) {
  return /^https?:\/\//i.test(normalizeText(value));
}

function isFileHref(href) {
  const value = normalizeText(href);
  if (!value) return false;
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

function titleFromFileName(href) {
  const name = fileNameFrom(href);
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isEditorContext(block) {
  return Boolean(
    block.closest('[data-aue-resource]')
    || block.querySelector('[data-aue-prop], [data-aue-resource], [data-richtext-prop]'),
  );
}

// ── Config/item extraction ───────────────────────────────────────────────────

function isEditorItemRow(row) {
  const model = row.getAttribute('data-aue-model') || '';
  if (model) return model === 'resource-download-item';
  if (!row.hasAttribute('data-aue-resource')) return false;
  return Boolean(row.querySelector(
    '[data-aue-prop="itemTitle"], [data-richtext-prop="itemDescription"], [data-aue-prop="resourceSlug"], [data-aue-prop="file"]',
  )) || !row.querySelector('[data-aue-prop="apiBaseUrl"], [data-aue-prop="slug"]');
}

function parseEditorItem(row) {
  return {
    row,
    title: normalizeText(readTextField(row, 'itemTitle').value),
    description: readRichTextField(row, 'itemDescription').html || '',
    resourceSlug: normalizeText(readTextField(row, 'resourceSlug').value),
    fileHref: normalizeText(readLinkField(row, 'file').value),
    gatedOverride: normalizeText(readTextField(row, 'gated').value).toLowerCase(),
  };
}

function readEditorContent(block) {
  const rows = getBlockRows(block);
  const itemRows = rows.filter((row) => isEditorItemRow(row));
  const configScope = document.createElement('div');
  rows.filter((row) => !itemRows.includes(row))
    .forEach((row) => configScope.append(row.cloneNode(true)));

  return {
    config: {
      apiBaseUrl: normalizeText(readTextField(configScope, 'apiBaseUrl').value),
      slug: normalizeText(readTextField(configScope, 'slug').value),
      gated: normalizeText(readTextField(configScope, 'gated').value).toLowerCase(),
    },
    items: itemRows.map((row) => parseEditorItem(row)),
    rows,
  };
}

function parsePublishedItem(row) {
  const item = {
    row,
    title: '',
    description: '',
    resourceSlug: '',
    fileHref: '',
    gatedOverride: '',
  };
  const freeCells = [];

  [...row.children].forEach((cell) => {
    const anchor = cell.querySelector('a');
    const href = normalizeText(anchor?.getAttribute('href'));
    const text = normalizeText(cell.textContent);

    if (href && (isFileHref(href) || isUrlLike(href))) {
      item.fileHref = item.fileHref || href;
      return;
    }

    if (/^(gated|open)$/i.test(text)) {
      item.gatedOverride = text.toLowerCase();
      return;
    }

    if (!item.resourceSlug && isSlugLike(text)) {
      item.resourceSlug = text;
      return;
    }

    if (text) freeCells.push(cell);
  });

  if (freeCells.length) {
    item.title = normalizeText(freeCells[0].textContent);
    item.description = freeCells.slice(1).map((cell) => cell.innerHTML).join('');
  }

  return item;
}

function readPublishedContent(block) {
  const rows = getBlockRows(block);
  const config = { apiBaseUrl: '', slug: '', gated: '' };
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

    if (href && isFileHref(href)) {
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

    if (!config.slug && isSlugLike(text)) {
      config.slug = text;
    }
  });

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

// ── Rendering ────────────────────────────────────────────────────────────────

function resolveGated(item, itemResource, config, primaryResource) {
  if (item.gatedOverride === 'gated') return true;
  if (item.gatedOverride === 'open') return false;
  if (itemResource && typeof itemResource.gated === 'boolean') return itemResource.gated;
  if (config.gated === 'true') return true;
  if (config.gated === 'false') return false;
  if (primaryResource && typeof primaryResource.gated === 'boolean') return primaryResource.gated;
  return false;
}

function buildItemCard(item, itemResource, config, primaryResource, isEditor) {
  const downloadUrl = item.fileHref
    || itemResource?.download_url
    || itemResource?.resource_url
    || '';

  if (!downloadUrl && !isEditor) return null;

  const card = document.createElement('article');
  card.className = 'resource-downloads-item';

  if (item.row && isEditor) {
    moveInstrumentation(item.row, card);
  }

  const extension = fileExtensionFrom(downloadUrl)
    || fileExtensionFrom(itemResource?.aem_asset_name || '')
    || 'file';

  const icon = document.createElement('span');
  icon.className = 'resource-downloads-item-icon';
  icon.dataset.extension = extension;
  icon.textContent = extension === 'file' ? 'FILE' : extension.toUpperCase();
  card.append(icon);

  const body = document.createElement('div');
  body.className = 'resource-downloads-item-body';

  const title = document.createElement('h3');
  title.className = 'resource-downloads-item-title';
  title.textContent = item.title
    || itemResource?.title
    || titleFromFileName(downloadUrl)
    || 'Download';
  body.append(title);

  const descriptionHtml = item.description || '';
  const descriptionText = descriptionHtml || normalizeText(itemResource?.excerpt);
  if (descriptionText) {
    const description = document.createElement('div');
    description.className = 'resource-downloads-item-description';
    if (descriptionHtml) {
      description.innerHTML = descriptionHtml;
    } else {
      const paragraph = document.createElement('p');
      paragraph.textContent = descriptionText;
      description.append(paragraph);
    }
    body.append(description);
  }

  card.append(body);

  const actions = document.createElement('div');
  actions.className = 'resource-downloads-item-actions';

  if (downloadUrl) {
    const gated = resolveGated(item, itemResource, config, primaryResource);
    const link = document.createElement('a');
    link.className = 'resource-downloads-item-button';
    link.href = resolveSiteHref(downloadUrl);
    link.textContent = DOWNLOAD_LABEL;
    if (downloadUrl.includes('/content/dam/')) {
      link.setAttribute('download', '');
    } else {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }

    bindGatedLink(link, {
      gated,
      resourceSlug: item.resourceSlug || itemResource?.slug || '',
      fileUrl: downloadUrl,
      fileName: fileNameFrom(downloadUrl) || itemResource?.aem_asset_name || '',
      lockedLabel: LOCKED_LABEL,
      downloadLabel: DOWNLOAD_LABEL,
    });

    actions.append(link);
  } else {
    const notice = document.createElement('p');
    notice.className = 'resource-downloads-item-notice';
    notice.textContent = item.resourceSlug
      ? `No download found for resource "${item.resourceSlug}".`
      : 'Add a Resource Slug or File to this download item.';
    actions.append(notice);
  }

  card.append(actions);
  setItemLabel(card, [item.title, itemResource?.title, fileNameFrom(downloadUrl)]);

  return card;
}

export default async function decorate(block) {
  const isEditor = isEditorContext(block);
  const { config, items, rows } = isEditor
    ? readEditorContent(block)
    : readPublishedContent(block);

  // The primary resource always appears as a download, even if its seeded
  // item was removed — dedupe against explicit items by slug.
  const workingItems = [...items];
  if (config.slug && !workingItems.some((item) => item.resourceSlug === config.slug)) {
    workingItems.push({
      row: null,
      title: '',
      description: '',
      resourceSlug: config.slug,
      fileHref: '',
      gatedOverride: '',
    });
  }

  const primaryResource = await fetchResource(config.apiBaseUrl, config.slug);
  const resolvedItems = await Promise.all(workingItems.map(async (item) => ({
    item,
    resource: item.resourceSlug
      ? await fetchResource(config.apiBaseUrl, item.resourceSlug)
      : null,
  })));

  const list = document.createElement('div');
  list.className = 'resource-downloads-list';

  resolvedItems.forEach(({ item, resource }) => {
    const card = buildItemCard(item, resource, config, primaryResource, isEditor);
    if (card) list.append(card);
  });

  if (!list.children.length) {
    const empty = document.createElement('p');
    empty.className = 'resource-downloads-empty';
    empty.textContent = isEditor
      ? 'Add download items to this block, or set the Primary Resource Slug.'
      : '';
    if (isEditor) list.append(empty);
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
}
