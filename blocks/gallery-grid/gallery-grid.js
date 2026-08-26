import {
  createOptimizedPicture, decorateButtons, loadBlock, wrapTextNodes,
} from '../../scripts/aem.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import {
  isFlattenedStatisticsItem,
  looksFlattenedComponent,
} from '../../scripts/flattened-item-utils.js';
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

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : '';
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

/**
 * Settings on a PUBLISHED page.
 *
 * isSettingRow() below can only recognise a setting by its data-aue-prop, which no
 * published page carries — so every setting fell through to its default: a gallery
 * authored with borderRadius "medium" rendered square, and `columns` only looked
 * right because 2 happens to be the default too.
 *
 * The settings are the model's leading single-cell rows, in field order
 * (columns, gap, borderRadius). Each candidate is validated against what that field
 * can actually hold, and scanning stops at the first row that doesn't fit — an item
 * row is never a lone cell holding "medium", so this cannot swallow content.
 */
function readPublishedSettings(block) {
  const validators = [
    ['columns', (v) => /^[1-6]$/.test(v)],
    ['gap', (v) => /^-?d+(.d+)?(px|rem|em|%)$/i.test(v)],
    ['borderRadius', (v) => ['none', 'small', 'medium', 'large'].includes(v.toLowerCase())],
  ];

  const settings = {};
  const consumed = [];
  let cursor = 0;

  validators.forEach(([name, isValid]) => {
    const row = block.children[cursor];
    if (!row || row.children.length !== 1) return;
    const value = (row.textContent || '').trim();
    // An empty cell is a real, unset setting — consume it and move on.
    if (value && !isValid(value)) return;
    if (value) settings[name] = value;
    consumed.push(row);
    cursor += 1;
  });

  consumed.forEach((row) => row.remove());
  return settings;
}

function isSettingRow(row) {
  const isContentBlock = [...NESTED_BLOCK_NAMES].some((name) => (
    row.classList.contains(name)
      || row.dataset.blockName === name
      || row.getAttribute('data-aue-model') === name
  ));
  if (isContentBlock) return false;
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

  const name = String(element.dataset.blockName || element.getAttribute('data-aue-model') || fromResource)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-\d{4,}$/u, '')
    .replace(/^-|-$/g, '');

  // Published pages carry none of the three sources above, so an authored
  // Statistics item arrives as an anonymous row of flattened field cells. Without
  // this the row fell through to the plain-item path and rendered its
  // verticalAlignment cell as a text card — the stat never appeared on live at all.
  if (name) return name;
  return isFlattenedStatisticsItem(element) ? 'statistics' : '';
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
  row.setAttribute('data-aue-type', 'component');
  row.setAttribute('data-aue-behavior', 'component');
  row.removeAttribute('data-aue-filter');
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
    ':scope > .gallery-grid-image, :scope > .gallery-grid-text, :scope > .gallery-grid-item-placeholder',
  ).forEach((element) => element.remove());
  item.classList.remove('gallery-grid-item-content', 'is-authoring-placeholder');
}

async function buildItem(row, isEditor) {
  if (NESTED_BLOCK_NAMES.has(getContentBlockName(row))) {
    const item = document.createElement('div');
    item.className = 'gallery-grid-item gallery-grid-item-content';
    if (await loadNestedBlock(row)) {
      item.append(row);
      return item;
    }
  }

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

  // gallery-grid-item gained `imageAlt` after some pages were published, so a row from
  // before that carries four cells (image, text, backgroundColor, textColor) rather than
  // five. Reading `text` at the current index then lands on backgroundColor, which is
  // empty — and an item with no image and no text is dropped, so the whole tile silently
  // vanished from the grid rather than merely looking wrong.
  const cellCount = row.children.length;
  const hasImageAltCell = cellCount >= 5;
  const at = (name) => {
    const index = {
      image: 0,
      imageAlt: hasImageAltCell ? 1 : -1,
      text: hasImageAltCell ? 2 : 1,
      backgroundColor: hasImageAltCell ? 3 : 2,
      textColor: hasImageAltCell ? 4 : 3,
    }[name];
    return index >= 0 ? row.children[index] : null;
  };

  const imageField = readImageField(row, 'image', { fallbackCell: at('image') });
  const imageAltField = readTextField(row, 'imageAlt', { fallbackCell: at('imageAlt') });

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

  // An unrecognised flattened component must not fall through to the text-card
  // path below: its cells are config, not authored copy.
  if (!isAuthoringItem && looksFlattenedComponent(row)) return null;

  const textField = readRichTextField(row, 'text', { fallbackCell: at('text') });
  const backgroundColorField = readTextField(row, 'backgroundColor', { fallbackCell: at('backgroundColor') });
  const textColorField = readTextField(row, 'textColor', { fallbackCell: at('textColor') });

  if (textField.text || textField.source) {
    const textCard = document.createElement('div');
    textCard.className = 'gallery-grid-text';

    const backgroundColor = normalizeColorValue(backgroundColorField.value);
    const textColor = normalizeColorValue(textColorField.value);
    if (backgroundColor) textCard.style.setProperty('--gallery-grid-text-bg', backgroundColor);
    if (textColor) textCard.style.setProperty('--gallery-grid-text-color', textColor);

    if (textField.source) {
      moveInstrumentation(textField.source, textCard);
      while (textField.source.firstChild) textCard.append(textField.source.firstChild);
    } else {
      textCard.innerHTML = textField.html;
    }

    item.append(textCard);
    if (isAuthoringItem) {
      hideAuthoringFieldRow(item, imageField.source);
      hideAuthoringFieldRow(item, imageAltField.source);
      hideAuthoringFieldRow(item, backgroundColorField.source);
      hideAuthoringFieldRow(item, textColorField.source);
    }
    return item;
  }

  if (isAuthoringItem) {
    hideAuthoringFieldRow(item, findOwnItemField(row, 'image'));
    hideAuthoringFieldRow(item, findOwnItemField(row, 'imageAlt'));
    hideAuthoringFieldRow(item, findOwnItemField(row, 'text'));
    hideAuthoringFieldRow(item, findOwnItemField(row, 'backgroundColor'));
    hideAuthoringFieldRow(item, findOwnItemField(row, 'textColor'));
    const placeholder = document.createElement('div');
    placeholder.className = 'gallery-grid-item-placeholder is-authoring-placeholder';
    placeholder.textContent = 'Add a background image or text content here. Add Cards or Statistics directly to the Gallery Grid.';
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

  applySettings(block, isEditor ? {
    columns: readSetting(block, 'columns', ['columns'], null, isEditor),
    gap: readSetting(block, 'gap', ['gap', 'grid gap'], null, isEditor),
    borderRadius: readSetting(block, 'borderRadius', ['item border radius', 'border radius'], null, isEditor),
  } : readPublishedSettings(block));

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
