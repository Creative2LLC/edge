import {
  createOptimizedPicture, decorateButtons, loadBlock, wrapTextNodes,
} from '../../scripts/aem.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const SETTING_NAMES = ['columns', 'gap', 'borderRadius'];

const DEFAULT_SETTINGS = {
  columns: '2',
  gap: '',
  borderRadius: 'none',
};

// A gallery-grid item is either a plain background image, or an author-nested
// Statistics/Cards component filling the slot instead — this is the allow-list
// for the latter (must match the "gallery-grid-item" filter in _gallery-grid.json).
const NESTED_BLOCK_NAMES = new Set(['statistics', 'cards']);

function directRowOf(block, element) {
  let row = element;
  while (row && row.parentElement !== block) {
    row = row.parentElement;
  }
  return row && row.parentElement === block ? row : null;
}

function normalizeOption(value, allowedValues, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return allowedValues.includes(normalized) ? normalized : fallback;
}

function normalizeCssLength(value, propertyName) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^-?\d+(\.\d+)?$/u.test(normalized)) return `${normalized}px`;
  if (!window.CSS?.supports || window.CSS.supports(propertyName, normalized)) return normalized;
  return '';
}

function normalizeColumns(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(Math.max(parsed, 2), 4);
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute?.('data-aue-resource')
      || scope?.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

// In the editor, hide (don't remove) setting rows that carry Universal Editor
// instrumentation — permanently removing an aue-tracked node can desync UE's
// resource tree from the DOM and break later structural operations like adding
// a new item (see colored-grid.js's cleanupConfigRows for the same pattern).
function readSetting(block, name, labels = [], fallbackCell = null, isEditor = false) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (isEditor && hasAuthoringContext(row)) row.hidden = true;
    else row.remove();
  }
  return field.value;
}

function isSettingRow(row) {
  return SETTING_NAMES.some((name) => row.querySelector(`[data-aue-prop="${name}"]`));
}

function applySettings(block, settings = {}) {
  const nextSettings = {
    ...DEFAULT_SETTINGS,
    ...(block.galleryGridSettings || {}),
    ...settings,
  };
  block.galleryGridSettings = nextSettings;

  const columns = normalizeColumns(nextSettings.columns);
  const gap = normalizeCssLength(nextSettings.gap, 'gap');
  const borderRadius = normalizeOption(
    nextSettings.borderRadius,
    ['none', 'small', 'medium', 'large'],
    'none',
  );

  block.classList.remove(
    'gallery-grid-radius-none',
    'gallery-grid-radius-small',
    'gallery-grid-radius-medium',
    'gallery-grid-radius-large',
  );
  block.classList.add(`gallery-grid-radius-${borderRadius}`);
  block.style.setProperty('--gallery-grid-columns', columns);

  if (gap) block.style.setProperty('--gallery-grid-gap', gap);
  else block.style.removeProperty('--gallery-grid-gap');
}

function syncResourceSettings(resourcePath, block) {
  readAueResourceFields(resourcePath, SETTING_NAMES)
    .then((fields) => {
      if (Object.keys(fields).length) applySettings(block, fields);
    });
}

function getContentBlockName(element) {
  const resource = element.getAttribute('data-aue-resource') || '';
  const segments = resource.split('/').filter(Boolean);
  const fromResource = segments[segments.length - 1] || '';

  return String(element.dataset.blockName || element.getAttribute('data-aue-model') || fromResource)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-\d{4,}$/u, '')
    .replace(/^-|-$/g, '');
}

async function loadNestedBlock(element) {
  const blockName = getContentBlockName(element);
  if (!NESTED_BLOCK_NAMES.has(blockName)) return false;

  if (!element.dataset.blockStatus) {
    element.classList.add(blockName, 'block', 'no-scroll-reveal');
    element.dataset.blockName = blockName;
    element.dataset.blockStatus = 'initialized';
    wrapTextNodes(element);
    decorateButtons(element);
  }

  await loadBlock(element);
  element.classList.add('is-visible');
  return true;
}

function findNestedBlockElement(row) {
  return [...row.children].find((child) => (
    (child.getAttribute('data-aue-resource') || child.dataset.blockName)
      && NESTED_BLOCK_NAMES.has(getContentBlockName(child))
  ));
}

function prepareAuthoringItem(row) {
  row.setAttribute('data-aue-type', 'container');
  row.setAttribute('data-aue-behavior', 'component');
  row.setAttribute('data-aue-filter', 'gallery-grid-item');
  if (!row.getAttribute('data-aue-label')) row.setAttribute('data-aue-label', 'Gallery Grid Item');
  return row;
}

function hideAuthoringFieldRow(item, source) {
  const row = source ? directRowOf(item, source) : null;
  if (row) row.hidden = true;
}

function findOwnItemField(item, name) {
  return [...item.querySelectorAll(
    '[data-aue-prop], [data-richtext-prop]',
  )].find((source) => {
    const fieldName = source.getAttribute('data-aue-prop')
      || source.getAttribute('data-richtext-prop');
    const row = directRowOf(item, source);
    return fieldName === name
      && row
      && !NESTED_BLOCK_NAMES.has(getContentBlockName(row));
  }) || null;
}

function removeGeneratedItemContent(item) {
  item.querySelectorAll(
    ':scope > .gallery-grid-image, :scope > .gallery-grid-item-placeholder',
  ).forEach((element) => element.remove());
  item.classList.remove('gallery-grid-item-content', 'is-authoring-placeholder');
}

async function buildItem(row, isEditor) {
  const isAuthoringItem = isEditor && hasAuthoringContext(row);
  const item = isAuthoringItem ? prepareAuthoringItem(row) : document.createElement('div');
  item.className = 'gallery-grid-item';
  if (!isAuthoringItem) moveInstrumentation(row, item);
  else removeGeneratedItemContent(item);

  const nestedSource = findNestedBlockElement(row);
  if (nestedSource && await loadNestedBlock(nestedSource)) {
    item.classList.add('gallery-grid-item-content');
    hideAuthoringFieldRow(item, findOwnItemField(row, 'image'));
    hideAuthoringFieldRow(item, findOwnItemField(row, 'imageAlt'));
    if (nestedSource.parentElement !== item) item.append(nestedSource);
    return item;
  }

  const imageField = readImageField(row, 'image', { fallbackCell: row.children[0] });
  const imageAltField = readTextField(row, 'imageAlt', { fallbackCell: row.children[1] });

  if (imageField.img) {
    const wrapper = document.createElement('div');
    wrapper.className = 'gallery-grid-image';

    const picture = createOptimizedPicture(
      imageField.img.src,
      imageAltField.value || imageField.img.alt || '',
      false,
      [{ width: '750' }],
    );
    const img = picture.querySelector('img');
    if (imageField.source && imageField.source !== imageField.img) {
      moveInstrumentation(imageField.source, picture);
    }
    if (img) moveInstrumentation(imageField.img, img);

    wrapper.append(picture);
    item.append(wrapper);
    if (isAuthoringItem) {
      hideAuthoringFieldRow(item, imageField.source);
      hideAuthoringFieldRow(item, imageAltField.source);
    }
    return item;
  }

  if (isAuthoringItem) {
    hideAuthoringFieldRow(item, findOwnItemField(row, 'image'));
    hideAuthoringFieldRow(item, findOwnItemField(row, 'imageAlt'));
    const placeholder = document.createElement('div');
    placeholder.className = 'gallery-grid-item-placeholder is-authoring-placeholder';
    placeholder.textContent = 'Add a background image, or add a Statistics/Cards component inside this item.';
    item.append(placeholder);
    return item;
  }

  return null;
}

// Preserves aue-tracked setting rows as hidden descendants of `inner` (instead of
// detaching them from the block entirely) so Universal Editor doesn't lose track of
// them when block.replaceChildren(inner) swaps out the block's original children —
// mirrors colored-grid.js's archiveHiddenFieldRows.
function archiveHiddenRows(block, inner, isEditor) {
  if (!isEditor) return;

  const archive = document.createElement('span');
  archive.className = 'gallery-grid-field-archive';
  archive.hidden = true;

  [...block.querySelectorAll(':scope > div[hidden]')].forEach((row) => archive.append(row));

  if (archive.children.length) inner.append(archive);
}

export default async function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const resourcePath = getAueResourcePath(block);

  applySettings(block, {
    columns: readSetting(block, 'columns', ['columns'], null, isEditor),
    gap: readSetting(block, 'gap', ['gap', 'grid gap'], null, isEditor),
    borderRadius: readSetting(block, 'borderRadius', ['item border radius', 'border radius'], null, isEditor),
  });

  const itemRows = [...block.children].filter((row) => {
    if (isSettingRow(row)) {
      if (isEditor && hasAuthoringContext(row)) row.hidden = true;
      else row.remove();
      return false;
    }
    return true;
  });

  const inner = document.createElement('div');
  inner.className = 'gallery-grid-inner';

  const items = await Promise.all(itemRows.map((row) => buildItem(row, isEditor)));
  items.filter(Boolean).forEach((item) => inner.append(item));

  // With zero items the block would otherwise render as an empty, zero-height div —
  // giving Universal Editor's canvas nothing visible to hover/click to add the first
  // item. Colored Grid uses the same empty-state-placeholder pattern for this reason.
  if (!inner.children.length && isEditor && hasAuthoringContext(block)) {
    const placeholder = document.createElement('div');
    placeholder.className = 'gallery-grid-empty';
    placeholder.textContent = 'Add a Gallery Grid Item.';
    inner.append(placeholder);
  }

  archiveHiddenRows(block, inner, isEditor);

  block.replaceChildren(inner);
  syncResourceSettings(resourcePath, block);
}
