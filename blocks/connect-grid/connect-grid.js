import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';

// Hex-color select fields never get data-aue-prop instrumentation in the editor, so their
// positional fallback is only as reliable as the fixed index it's given — which breaks
// whenever an EARLIER field on the same card (even a non-color one) has no row of its own
// and everything after it shifts. A per-card fetch of the resource's own JSON, keyed by
// field name, sidesteps row position entirely and is the authoritative correction. Matches
// the pattern already proven in cards.js / info-cards-grid.js.
const CARD_COLOR_FIELD_NAMES = [
  'iconColor',
  'cardBackgroundColor',
  'cardHoverBackgroundColor',
  'cardTextColor',
  'titleColor',
  'descriptionColor',
  'contactLabelColor',
  'contactValueColor',
];

const CARD_STYLE_FIELD_NAMES = [
  ...CARD_COLOR_FIELD_NAMES,
  'titleFontSize',
  'descriptionFontSize',
  'contactLabelFontSize',
  'contactValueFontSize',
  'iconSize',
  'cardItemSpacing',
  'contactMethodSpacing',
];

function isValidHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '').trim());
}

const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  columns: 2,
};

// Offsets below match _connect-grid.json's ACTUAL current field order for the
// connect-grid-item model (fields were regrouped under UI tabs by a later commit —
// tabs don't consume a row, but the reorder itself invalidated the old fixed indices
// here). Order: title, description, icon, image, contactMethod1Label/Text/Link,
// contactMethod2Label/Text/Link, contactMethod3Label/Text/Link,
// contactMethod4Label/Text/Link, contactMethods (legacy), iconColor,
// cardBackgroundColor, cardHoverBackgroundColor, showDivider, imageAlt.
const ITEM_COLUMN_INDEX = {
  title: 0,
  description: 1,
  icon: 2,
  image: 3,
  contactMethod1Label: 4,
  contactMethod1Text: 5,
  contactMethod1Link: 6,
  contactMethod2Label: 7,
  contactMethod2Text: 8,
  contactMethod2Link: 9,
  contactMethod3Label: 10,
  contactMethod3Text: 11,
  contactMethod3Link: 12,
  contactMethod4Label: 13,
  contactMethod4Text: 14,
  contactMethod4Link: 15,
  contactMethods: 16,
  iconColor: 17,
  cardBackgroundColor: 18,
  cardHoverBackgroundColor: 19,
  showDivider: 20,
  imageAlt: 21,
};

const LEGACY_ITEM_COLUMN_INDEX = {
  icon: 0,
  image: 1,
  iconColor: 2,
  title: 3,
  description: 4,
  contactMethod1Label: 5,
  contactMethod1Text: 6,
  contactMethod1Link: 7,
  contactMethod2Label: 8,
  contactMethod2Text: 9,
  contactMethod2Link: 10,
  contactMethod3Label: 11,
  contactMethod3Text: 12,
  contactMethod3Link: 13,
  contactMethod4Label: 14,
  contactMethod4Text: 15,
  contactMethod4Link: 16,
  contactMethods: 17,
  cardBackgroundColor: 18,
  showDivider: 19,
  cardHoverBackgroundColor: 20,
  imageAlt: 21,
};

[
  'cardTextColor',
  'titleColor',
  'descriptionColor',
  'contactLabelColor',
  'contactValueColor',
  'titleFontSize',
  'descriptionFontSize',
  'contactLabelFontSize',
  'contactValueFontSize',
  'iconSize',
  'cardItemSpacing',
  'contactMethodSpacing',
].forEach((name, offset) => {
  ITEM_COLUMN_INDEX[name] = 22 + offset;
  LEGACY_ITEM_COLUMN_INDEX[name] = 22 + offset;
});

const DEFAULTS = {
  columns: '3',
  iconColor: '#ff8b7e',
  cardBackgroundColor: '#f4f0ec',
  showDivider: 'show',
};

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isConnectGridItemRow(row) {
  const cols = [...row.children];
  return Boolean(
    row.querySelector('[data-aue-prop="icon"]')
      || row.querySelector('[data-aue-prop="image"]')
      || row.querySelector('[data-aue-prop="title"]')
      || row.querySelector('[data-aue-prop="contactMethods"]')
      || row.querySelector('[data-aue-prop="contactMethod1Text"]')
      || cols.length >= 5,
  );
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isConnectGridItemRow(row));
}

function getParentFallbackCell(scope, rowIndex) {
  if (!scope?.classList?.contains('connect-grid')) return null;
  const row = getParentRows(scope)[rowIndex];
  return row?.children?.[0] || row || null;
}

function isItemIndexMap(rowIndexMap) {
  return rowIndexMap === ITEM_COLUMN_INDEX || rowIndexMap === LEGACY_ITEM_COLUMN_INDEX;
}

function getCellText(row, index) {
  return row?.children?.[index]?.textContent?.trim() || '';
}

function hasMediaCell(row, index) {
  return Boolean(row?.children?.[index]?.querySelector?.('picture, img'));
}

function isDividerValue(value) {
  return ['show', 'hide', 'hidden', 'off', 'false', 'no', 'none']
    .includes(String(value || '').trim().toLowerCase());
}

function getItemColumnIndex(row) {
  if (
    hasMediaCell(row, LEGACY_ITEM_COLUMN_INDEX.icon)
    || hasMediaCell(row, LEGACY_ITEM_COLUMN_INDEX.image)
    || isValidHexColor(getCellText(row, LEGACY_ITEM_COLUMN_INDEX.iconColor))
    || isDividerValue(getCellText(row, LEGACY_ITEM_COLUMN_INDEX.showDivider))
  ) {
    return LEGACY_ITEM_COLUMN_INDEX;
  }

  return ITEM_COLUMN_INDEX;
}

function normalizeCssSize(value) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return '';
  if (/^\d+(\.\d+)?$/.test(normalizedValue)) return `${normalizedValue}px`;
  return normalizedValue;
}

function normalizeIconSize(value) {
  const size = normalizeCssSize(value);
  return ['32px', '48px', '64px', '80px', '96px'].includes(size) ? size : '';
}

// Hex-color "select" fields (regex-validated) render in the editor as a bare
// <a href="#hex">#hex</a> with NO data-aue-prop at all — confirmed from live markup —
// unlike every other field type, which does get real instrumentation whenever it has
// content. Name-based lookup can never succeed for these, so positional fallback must
// stay enabled in the editor too for them (this caused a live regression: cards falling
// back to default colors because these fields could never be read in the editor).
const ALWAYS_POSITIONAL_FIELDS = new Set(CARD_COLOR_FIELD_NAMES);

function getFallbackCell(scope, rowIndexMap, rowIndex, columnIndex, isEditor, name) {
  if (!isItemIndexMap(rowIndexMap)) return getParentFallbackCell(scope, rowIndex);
  if (isEditor && !ALWAYS_POSITIONAL_FIELDS.has(name)) return null;
  return scope.children[columnIndex];
}

// Fields left empty by the author frequently get NO row at all in the exported/edited
// markup (confirmed repeatedly this session), so a positional `scope.children[columnIndex]`
// guess can silently grab a totally different field's value. In the editor, named
// `data-aue-prop` lookup (done first, inside readTextField/readRichTextField/readImageField)
// is reliable whenever a field genuinely has content, so a failed name lookup there means the
// field is genuinely empty — never fall back to a position guess in that case. Positional
// fallback is kept for true published pages, where there's no instrumentation to name-match
// against at all. Matches colored-icon-text.js's readField/readColorField/readRichField/
// readImage pattern. Exception: ALWAYS_POSITIONAL_FIELDS above.
function getField(scope, name, rowIndexMap, columnIndex = 0, isEditor = false) {
  const rowIndex = rowIndexMap?.[name];
  const fallbackCell = getFallbackCell(scope, rowIndexMap, rowIndex, columnIndex, isEditor, name);
  const field = readTextField(scope, name, { rowIndex, columnIndex, fallbackCell });
  return { ...field, source: field.source || field.cell };
}

function getRichField(scope, name, rowIndexMap, columnIndex = 0, isEditor = false) {
  const rowIndex = rowIndexMap?.[name];
  const fallbackCell = getFallbackCell(scope, rowIndexMap, rowIndex, columnIndex, isEditor);
  const field = readRichTextField(scope, name, { rowIndex, columnIndex, fallbackCell });
  return field.source || field.cell;
}

function getImageField(scope, name, rowIndexMap, columnIndex = 0, isEditor = false) {
  const rowIndex = rowIndexMap?.[name];
  const fallbackCell = getFallbackCell(scope, rowIndexMap, rowIndex, columnIndex, isEditor);
  const field = readImageField(scope, name, { rowIndex, columnIndex, fallbackCell });
  return { source: field.source, picture: field.picture, img: field.img };
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!target) return;

  if (!field?.source) {
    target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function buildRichContent(source, className) {
  if (!source) return null;

  const content = document.createElement('div');
  content.className = className;
  moveInstrumentation(source, content);
  while (source.firstChild) content.append(source.firstChild);

  return content.childNodes.length ? content : null;
}

function unwrapSingleParagraph(element) {
  const meaningfulChildren = [...element.childNodes]
    .filter((node) => node.nodeType !== 3 || node.textContent.trim());

  if (meaningfulChildren.length !== 1 || meaningfulChildren[0].tagName !== 'P') return;

  const paragraph = meaningfulChildren[0];
  while (paragraph.firstChild) element.insertBefore(paragraph.firstChild, paragraph);
  paragraph.remove();
}

function parseContactMethods(value) {
  if (!value) return [];

  return value.replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());

      if (parts.length >= 3) {
        return {
          label: parts[0],
          text: parts[1],
          link: parts[2],
        };
      }

      if (parts.length === 2) {
        return {
          label: parts[0],
          text: parts[1],
          link: '',
        };
      }

      return {
        label: '',
        text: parts[0],
        link: '',
      };
    })
    .filter((method) => method.text);
}

function getStructuredContactMethods(row, isEditor, itemColumnIndex) {
  const methods = [];

  for (let index = 1; index <= 4; index += 1) {
    const labelField = getField(
      row,
      `contactMethod${index}Label`,
      itemColumnIndex,
      itemColumnIndex[`contactMethod${index}Label`],
      isEditor,
    );
    const textField = getField(
      row,
      `contactMethod${index}Text`,
      itemColumnIndex,
      itemColumnIndex[`contactMethod${index}Text`],
      isEditor,
    );
    const linkField = getField(
      row,
      `contactMethod${index}Link`,
      itemColumnIndex,
      itemColumnIndex[`contactMethod${index}Link`],
      isEditor,
    );

    const text = textField.value || linkField.value;
    if (labelField.value || text || linkField.value) {
      methods.push({
        label: labelField.value,
        text,
        link: linkField.value,
        labelField,
        textField,
        linkField,
      });
    }
  }

  return methods;
}

function shouldUseArrow(url) {
  if (!url) return false;
  return !url.startsWith('mailto:') && !url.startsWith('tel:');
}

function shouldShowDivider(value) {
  const normalizedValue = String(value || DEFAULTS.showDivider).trim().toLowerCase();
  return !['hide', 'hidden', 'off', 'false', 'no', 'none'].includes(normalizedValue);
}

function buildMedia(item) {
  const imagePicture = item.imageField.picture?.cloneNode(true) || null;
  const imageImg = !imagePicture && item.imageField.img
    ? item.imageField.img.cloneNode(true)
    : null;
  const imageMedia = imagePicture || imageImg;
  if (imageMedia) {
    const altVal = item.imageAlt;
    const img = imageMedia.tagName === 'IMG' ? imageMedia : imageMedia.querySelector('img');
    if (altVal && img) img.alt = altVal;
    const media = document.createElement('div');
    media.className = 'connect-grid-card-media is-image';
    media.append(imageMedia);
    if (item.imageField.source) moveInstrumentation(item.imageField.source, media);
    return media;
  }

  const picture = item.iconField.picture?.cloneNode(true) || null;
  const image = !picture && item.iconField.img ? item.iconField.img.cloneNode(true) : null;
  const media = picture || image;
  const mediaImage = picture?.querySelector('img') || image;
  const imgSrc = mediaImage?.currentSrc
    || mediaImage?.src
    || item.iconField.img?.currentSrc
    || item.iconField.img?.src
    || '';

  if (!media && !imgSrc) return null;

  const icon = document.createElement('div');
  icon.className = 'connect-grid-card-media is-icon';

  if (imgSrc) {
    icon.style.setProperty('background-color', item.iconColor || DEFAULTS.iconColor, 'important');
    icon.style.setProperty('-webkit-mask-image', `url("${imgSrc}")`, 'important');
    icon.style.setProperty('mask-image', `url("${imgSrc}")`, 'important');
    icon.style.setProperty('-webkit-mask-size', 'contain', 'important');
    icon.style.setProperty('mask-size', 'contain', 'important');
    icon.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
    icon.style.setProperty('mask-repeat', 'no-repeat', 'important');
    icon.style.setProperty('-webkit-mask-position', 'center', 'important');
    icon.style.setProperty('mask-position', 'center', 'important');
    if (mediaImage) mediaImage.style.visibility = 'hidden';
  }

  if (media) {
    icon.append(media);
  }

  if (item.iconField.source) moveInstrumentation(item.iconField.source, icon);

  return icon;
}

function buildMethod(method) {
  const wrapper = document.createElement('div');
  wrapper.className = 'connect-grid-method';

  if (method.label || method.labelField?.source) {
    const label = document.createElement('p');
    label.className = 'connect-grid-method-label';
    moveFieldContent(method.labelField, label, method.label);
    wrapper.append(label);
  }

  const value = document.createElement(method.link ? 'a' : 'span');
  value.className = 'connect-grid-method-value';
  moveFieldContent(method.textField, value, method.text);
  unwrapSingleParagraph(value);

  if (method.link) {
    value.href = method.link;
    if (shouldUseArrow(method.link)) {
      value.classList.add('with-arrow');
    }
  }

  if (method.linkField?.source) {
    moveInstrumentation(method.linkField.source, value);
  }

  wrapper.append(value);
  return wrapper;
}

function applyCardItemSpacing(card, value) {
  const spacing = normalizeCssSize(value);
  if (!spacing) return;

  card.style.setProperty('--connect-grid-card-media-gap', spacing);
  card.style.setProperty('--connect-grid-card-title-gap', spacing);
  card.style.setProperty('--connect-grid-card-divider-top-gap', spacing);
  card.style.setProperty('--connect-grid-card-divider-bottom-gap', spacing);
  card.style.setProperty('--connect-grid-card-methods-top-gap', spacing);
}

function applyContactMethodSpacing(card, value) {
  const spacing = normalizeCssSize(value);
  if (!spacing) return;

  card.style.setProperty('--connect-grid-methods-gap', spacing);
}

// Corrects style fields using the resource's own JSON (keyed by field name, so it's
// immune to the row-position drift that breaks positional fallback — see
// CARD_STYLE_FIELD_NAMES above). Fires after the card already rendered with its best
// synchronous guess; invalid color values are ignored, so a malformed/unexpected API
// response can't corrupt an already-correct card.
function syncCardStyles(resourcePath, card) {
  readAueResourceFields(resourcePath, CARD_STYLE_FIELD_NAMES)
    .then((fields) => {
      Object.keys(fields).forEach((key) => {
        if (CARD_COLOR_FIELD_NAMES.includes(key) && !isValidHexColor(fields[key])) {
          delete fields[key];
        }
      });
      if (!Object.keys(fields).length) return;

      if (fields.cardBackgroundColor) {
        card.style.setProperty('--connect-grid-card-bg', fields.cardBackgroundColor);
      }
      if (fields.cardHoverBackgroundColor) {
        card.classList.add('has-hover-bg');
        card.style.setProperty('--connect-grid-card-hover-bg', fields.cardHoverBackgroundColor);
      }
      if (fields.iconColor) {
        const icon = card.querySelector(':scope > .connect-grid-card-media.is-icon');
        if (icon) icon.style.setProperty('background-color', fields.iconColor, 'important');
      }
      if (fields.cardTextColor) {
        card.style.setProperty('--connect-grid-title-color', fields.cardTextColor);
        card.style.setProperty('--connect-grid-description-color', fields.cardTextColor);
        card.style.setProperty('--connect-grid-method-label-color', fields.cardTextColor);
        card.style.setProperty('--connect-grid-method-value-color', fields.cardTextColor);
      }
      if (fields.titleColor) card.style.setProperty('--connect-grid-title-color', fields.titleColor);
      if (fields.descriptionColor) {
        card.style.setProperty('--connect-grid-description-color', fields.descriptionColor);
      }
      if (fields.contactLabelColor) {
        card.style.setProperty('--connect-grid-method-label-color', fields.contactLabelColor);
      }
      if (fields.contactValueColor) {
        card.style.setProperty('--connect-grid-method-value-color', fields.contactValueColor);
      }
      if (fields.titleFontSize) {
        card.style.setProperty('--connect-grid-title-size', normalizeCssSize(fields.titleFontSize));
      }
      if (fields.descriptionFontSize) {
        card.style.setProperty(
          '--connect-grid-description-size',
          normalizeCssSize(fields.descriptionFontSize),
        );
      }
      if (fields.contactLabelFontSize) {
        card.style.setProperty(
          '--connect-grid-method-label-size',
          normalizeCssSize(fields.contactLabelFontSize),
        );
      }
      if (fields.contactValueFontSize) {
        card.style.setProperty(
          '--connect-grid-method-value-size',
          normalizeCssSize(fields.contactValueFontSize),
        );
      }
      const iconSize = normalizeIconSize(fields.iconSize);
      if (iconSize) {
        card.style.setProperty('--connect-grid-card-icon-size', iconSize);
      }
      applyCardItemSpacing(card, fields.cardItemSpacing);
      applyContactMethodSpacing(card, fields.contactMethodSpacing);
    });
}

function applyCardStyles(card, item) {
  if (item.cardTextColor) {
    card.style.setProperty('--connect-grid-title-color', item.cardTextColor);
    card.style.setProperty('--connect-grid-description-color', item.cardTextColor);
    card.style.setProperty('--connect-grid-method-label-color', item.cardTextColor);
    card.style.setProperty('--connect-grid-method-value-color', item.cardTextColor);
  }

  if (item.titleColor) card.style.setProperty('--connect-grid-title-color', item.titleColor);
  if (item.descriptionColor) {
    card.style.setProperty('--connect-grid-description-color', item.descriptionColor);
  }
  if (item.contactLabelColor) {
    card.style.setProperty('--connect-grid-method-label-color', item.contactLabelColor);
  }
  if (item.contactValueColor) {
    card.style.setProperty('--connect-grid-method-value-color', item.contactValueColor);
  }

  if (item.titleFontSize) {
    card.style.setProperty('--connect-grid-title-size', normalizeCssSize(item.titleFontSize));
  }
  if (item.descriptionFontSize) {
    card.style.setProperty(
      '--connect-grid-description-size',
      normalizeCssSize(item.descriptionFontSize),
    );
  }
  if (item.contactLabelFontSize) {
    card.style.setProperty(
      '--connect-grid-method-label-size',
      normalizeCssSize(item.contactLabelFontSize),
    );
  }
  if (item.contactValueFontSize) {
    card.style.setProperty(
      '--connect-grid-method-value-size',
      normalizeCssSize(item.contactValueFontSize),
    );
  }
  const iconSize = normalizeIconSize(item.iconSize);
  if (iconSize) {
    card.style.setProperty('--connect-grid-card-icon-size', iconSize);
  }

  if (item.cardItemSpacing) {
    applyCardItemSpacing(card, item.cardItemSpacing);
  }

  if (item.contactMethodSpacing) {
    applyContactMethodSpacing(card, item.contactMethodSpacing);
  }
}

function buildCard(item, index, isEditor) {
  const card = document.createElement('article');
  const resourcePath = item.row ? getAueResourcePath(item.row) : '';
  card.className = 'connect-grid-card connect-grid-reveal';
  card.style.setProperty('--stagger-index', index);
  card.style.setProperty(
    '--connect-grid-card-bg',
    item.cardBackgroundColor || DEFAULTS.cardBackgroundColor,
  );
  if (item.cardHoverBackgroundColor) {
    card.classList.add('has-hover-bg');
    card.style.setProperty('--connect-grid-card-hover-bg', item.cardHoverBackgroundColor);
  }
  applyCardStyles(card, item);
  if (item.row) {
    moveInstrumentation(item.row, card);
    setItemLabel(card, [
      item.titleSource?.textContent || '',
      item.descriptionSource?.textContent || '',
    ]);
  }

  if (item.isAuthoringPlaceholder) {
    card.classList.add('is-authoring-placeholder');

    const title = document.createElement('div');
    title.className = 'connect-grid-card-title';
    title.textContent = 'New connect card';

    const body = document.createElement('p');
    body.className = 'connect-grid-card-description';
    body.textContent = 'Add an icon, description, and contact methods in Universal Editor.';

    card.append(title, body);
    return card;
  }

  const media = buildMedia(item);
  if (media) card.append(media);

  const title = buildRichContent(item.titleSource, 'connect-grid-card-title');
  if (title) card.append(title);

  const description = buildRichContent(item.descriptionSource, 'connect-grid-card-description');
  if (description) card.append(description);

  if (item.contactMethods.length) {
    card.classList.toggle('has-divider', item.showDivider);

    if (item.showDivider) {
      const divider = document.createElement('div');
      divider.className = 'connect-grid-card-divider';
      card.append(divider);
    }

    const methods = document.createElement('div');
    methods.className = 'connect-grid-methods';
    if (item.contactMethodsField.source) {
      moveInstrumentation(item.contactMethodsField.source, methods);
    }

    item.contactMethods.forEach((method) => {
      methods.append(buildMethod(method));
    });

    card.append(methods);
  }

  // `item.row` itself is discarded after this point (only `card` gets attached to the DOM),
  // but its per-card style/config fields (iconColor, cardBackgroundColor, showDivider,
  // cardHoverBackgroundColor, imageAlt) were only ever read by value above — their aue-tracked
  // elements were never relocated into `card`. Fully dropping `row` desyncs Universal Editor's
  // tracking of those fields, so a live edit to e.g. Card Background Color patches a DOM node
  // that no longer exists on the page (visible only after a hard refresh). moveInstrumentation
  // (item.row, card) above already stripped row's OWN aue-resource identity, so re-attaching it
  // hidden inside `card` can't create a duplicate/competing resource — only its still-
  // instrumented field descendants remain live. Matches cards.js's buildCard() fix.
  if (item.row && hasAuthoringContext(item.row)) {
    item.row.hidden = true;
    card.append(item.row);
  }

  if (isEditor && resourcePath) {
    syncCardStyles(resourcePath, card);
  }

  return card;
}

function setupMatchedHeights(block, grid) {
  if (typeof block.connectGridHeightCleanup === 'function') {
    block.connectGridHeightCleanup();
  }

  const cards = [...grid.querySelectorAll('.connect-grid-card:not(.is-authoring-placeholder)')];
  if (!cards.length) {
    block.connectGridHeightCleanup = null;
    return;
  }

  let frameId = 0;
  const syncHeights = () => {
    if (frameId) window.cancelAnimationFrame(frameId);

    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      cards.forEach((card) => card.style.removeProperty('--connect-grid-card-matched-height'));

      const columns = getComputedStyle(grid).gridTemplateColumns
        .split(' ')
        .filter(Boolean)
        .length;
      if (columns <= 1) return;

      const tallestHeight = Math.ceil(
        Math.max(0, ...cards.map((card) => card.getBoundingClientRect().height)),
      );

      cards.forEach((card) => {
        if (tallestHeight > 0) {
          card.style.setProperty('--connect-grid-card-matched-height', `${tallestHeight}px`);
        }
      });
    });
  };

  const onResize = () => syncHeights();
  window.addEventListener('resize', onResize, { passive: true });

  const mutationObserver = 'MutationObserver' in window
    ? new MutationObserver(() => syncHeights())
    : null;
  mutationObserver?.observe(grid, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => syncHeights())
    : null;
  cards.forEach((card) => resizeObserver?.observe(card));

  grid.querySelectorAll('img').forEach((img) => {
    if (img.complete) return;
    img.addEventListener('load', syncHeights, { once: true });
    img.addEventListener('error', syncHeights, { once: true });
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => syncHeights()).catch(() => {});
  }

  syncHeights();

  block.connectGridHeightCleanup = () => {
    if (frameId) window.cancelAnimationFrame(frameId);
    window.removeEventListener('resize', onResize);
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    cards.forEach((card) => card.style.removeProperty('--connect-grid-card-matched-height'));
  };
}

export default function decorate(block) {
  const isEditor = hasAuthoringContext(block);
  const headingField = getField(block, 'heading', BLOCK_ROW_INDEX);
  const subheadingSource = getRichField(block, 'subheading', BLOCK_ROW_INDEX);
  const columnsField = getField(block, 'columns', BLOCK_ROW_INDEX);
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row, index) => {
    const isItemRow = isConnectGridItemRow(row);

    if (!isItemRow) return;

    const itemColumnIndex = getItemColumnIndex(row);

    const iconField = getImageField(
      row,
      'icon',
      itemColumnIndex,
      itemColumnIndex.icon,
      isEditor,
    );
    const imageField = getImageField(
      row,
      'image',
      itemColumnIndex,
      itemColumnIndex.image,
      isEditor,
    );
    const imageAltField = getField(
      row,
      'imageAlt',
      itemColumnIndex,
      itemColumnIndex.imageAlt,
      isEditor,
    );
    const iconColorField = getField(
      row,
      'iconColor',
      itemColumnIndex,
      itemColumnIndex.iconColor,
      isEditor,
    );
    const titleSource = getRichField(
      row,
      'title',
      itemColumnIndex,
      itemColumnIndex.title,
      isEditor,
    );
    const descriptionSource = getRichField(
      row,
      'description',
      itemColumnIndex,
      itemColumnIndex.description,
      isEditor,
    );
    const contactMethodsField = getField(
      row,
      'contactMethods',
      itemColumnIndex,
      itemColumnIndex.contactMethods,
      isEditor,
    );
    const structuredContactMethods = getStructuredContactMethods(row, isEditor, itemColumnIndex);
    const cardBackgroundColorField = getField(
      row,
      'cardBackgroundColor',
      itemColumnIndex,
      itemColumnIndex.cardBackgroundColor,
      isEditor,
    );
    const showDividerField = getField(
      row,
      'showDivider',
      itemColumnIndex,
      itemColumnIndex.showDivider,
      isEditor,
    );
    const cardHoverBackgroundColorField = getField(
      row,
      'cardHoverBackgroundColor',
      itemColumnIndex,
      itemColumnIndex.cardHoverBackgroundColor,
      isEditor,
    );
    const cardTextColorField = getField(
      row,
      'cardTextColor',
      itemColumnIndex,
      itemColumnIndex.cardTextColor,
      isEditor,
    );
    const titleColorField = getField(
      row,
      'titleColor',
      itemColumnIndex,
      itemColumnIndex.titleColor,
      isEditor,
    );
    const descriptionColorField = getField(
      row,
      'descriptionColor',
      itemColumnIndex,
      itemColumnIndex.descriptionColor,
      isEditor,
    );
    const contactLabelColorField = getField(
      row,
      'contactLabelColor',
      itemColumnIndex,
      itemColumnIndex.contactLabelColor,
      isEditor,
    );
    const contactValueColorField = getField(
      row,
      'contactValueColor',
      itemColumnIndex,
      itemColumnIndex.contactValueColor,
      isEditor,
    );
    const titleFontSizeField = getField(
      row,
      'titleFontSize',
      itemColumnIndex,
      itemColumnIndex.titleFontSize,
      isEditor,
    );
    const descriptionFontSizeField = getField(
      row,
      'descriptionFontSize',
      itemColumnIndex,
      itemColumnIndex.descriptionFontSize,
      isEditor,
    );
    const contactLabelFontSizeField = getField(
      row,
      'contactLabelFontSize',
      itemColumnIndex,
      itemColumnIndex.contactLabelFontSize,
      isEditor,
    );
    const contactValueFontSizeField = getField(
      row,
      'contactValueFontSize',
      itemColumnIndex,
      itemColumnIndex.contactValueFontSize,
      isEditor,
    );
    const iconSizeField = getField(
      row,
      'iconSize',
      itemColumnIndex,
      itemColumnIndex.iconSize,
      isEditor,
    );
    const cardItemSpacingField = getField(
      row,
      'cardItemSpacing',
      itemColumnIndex,
      itemColumnIndex.cardItemSpacing,
      isEditor,
    );
    const contactMethodSpacingField = getField(
      row,
      'contactMethodSpacing',
      itemColumnIndex,
      itemColumnIndex.contactMethodSpacing,
      isEditor,
    );

    if (
      !titleSource?.textContent?.trim()
      && !descriptionSource
      && !contactMethodsField.value
      && !structuredContactMethods.length
    ) {
      return;
    }

    cards.push({
      iconField,
      imageField,
      imageAlt: imageAltField.value,
      iconColor: iconColorField.value,
      titleSource,
      descriptionSource,
      contactMethodsField,
      contactMethods: structuredContactMethods.length
        ? structuredContactMethods
        : parseContactMethods(contactMethodsField.value),
      cardBackgroundColor: cardBackgroundColorField.value,
      showDivider: shouldShowDivider(showDividerField.value),
      cardHoverBackgroundColor: cardHoverBackgroundColorField.value,
      cardTextColor: cardTextColorField.value,
      titleColor: titleColorField.value,
      descriptionColor: descriptionColorField.value,
      contactLabelColor: contactLabelColorField.value,
      contactValueColor: contactValueColorField.value,
      titleFontSize: titleFontSizeField.value,
      descriptionFontSize: descriptionFontSizeField.value,
      contactLabelFontSize: contactLabelFontSizeField.value,
      contactValueFontSize: contactValueFontSizeField.value,
      iconSize: iconSizeField.value,
      cardItemSpacing: cardItemSpacingField.value,
      contactMethodSpacing: contactMethodSpacingField.value,
      row,
      order: index,
    });
  });

  if (!cards.length && isEditor) {
    cards.push({ isAuthoringPlaceholder: true });
  }

  const inner = document.createElement('div');
  inner.className = 'connect-grid-inner';

  const header = document.createElement('div');
  header.className = 'connect-grid-header connect-grid-reveal';

  if (headingField.value || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'connect-grid-heading';
    moveFieldContent(headingField, heading, headingField.value);
    header.append(heading);
  }

  const subheading = buildRichContent(subheadingSource, 'connect-grid-subheading');
  if (subheading) header.append(subheading);

  if (header.childElementCount) inner.append(header);

  const grid = document.createElement('div');
  grid.className = 'connect-grid-cards';
  grid.style.setProperty('--connect-grid-columns', columnsField.value || DEFAULTS.columns);

  cards.forEach((card, index) => {
    grid.append(buildCard(card, index, isEditor));
  });

  inner.append(grid);
  block.replaceChildren(inner);
  setupMatchedHeights(block, grid);
}
