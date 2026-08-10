import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import injectColorPickers from '../../scripts/block-color-picker.js';
import {
  applyColoredFieldLayoutOptions,
  syncColoredFieldLayoutOptions,
} from '../../scripts/colored-field-options.js';

const DEFAULT_BUTTON_BACKGROUND = '#f7941d1a';
const DEFAULT_BUTTON_TEXT = '#3c4654';
const DEFAULT_BUTTON_BORDER = '#f7941d';
const DEFAULT_BUTTON_ICON_NAME = 'download';

function directRowOf(block, element) {
  let rowEl = element;
  while (rowEl && rowEl.parentElement !== block) {
    rowEl = rowEl.parentElement;
  }
  return rowEl && rowEl.parentElement === block ? rowEl : null;
}

function fieldCell(row) {
  if (!row) return null;
  return row.children.length > 1 ? row.children[1] : row.children[0] || row;
}

// Fields with no authored value frequently don't get their own row in the exported
// markup at all, so a positional fallback can silently grab a completely different
// field's row. In the editor, named data-aue-prop lookup is reliable whenever a field
// actually has content, so a failed name lookup there means the field is genuinely
// empty — never fall back to a position guess in that case. Positional fallback is
// only meaningful on true published pages (see cards.js / colored-icon-text.js for
// the same pattern).
//
// In editor context, hides the row instead of removing it so the data-aue-prop
// source element stays in the DOM. It gets moved into a hidden archive inside
// inner before replaceChildren, then a MutationObserver keeps the CSS variable
// in sync when UE writes a new value to that element via the Properties panel.
// Permanently removing an aue-tracked node desyncs UE's resource tree from the DOM,
// which breaks live-edit syncing for that field on the NEXT decoration pass.
function readField(block, name, labels = [], fallbackCell = null, isEditor = false) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell: isEditor ? null : fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (isEditor && field.source) row.hidden = true;
    else row.remove();
  }
  return field;
}

// Hex-color "select" fields (regex-validated) render in the editor as a bare
// <a href="#hex">#hex</a> with NO data-aue-prop at all — confirmed from live markup —
// unlike every other field type, which does get real instrumentation whenever it has
// content. Name-based lookup can never succeed for these, so unlike readField below,
// positional fallback must stay enabled in the editor too, or these fields always read
// empty (this caused a live regression: color pickers falling back to defaults because
// the field could never be read in the editor).
function readColorField(block, name, labels = [], isEditor = false, fallbackCell = null) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (isEditor && field.source) row.hidden = true;
    else row.remove();
  }
  return field;
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : '';
}

function applyBlockBackground(block, value) {
  const color = normalizeColorValue(value);
  if (!color) {
    block.classList.remove('has-block-background');
    block.style.removeProperty('--colored-button-block-bg');
    return;
  }

  block.classList.add('has-block-background');
  block.style.setProperty('--colored-button-block-bg', color);
}

function watchColorField(source, cssVar, block) {
  if (!source) return;
  new MutationObserver(() => {
    const color = normalizeColorValue(source.textContent.trim());
    if (color) block.style.setProperty(cssVar, color);
  }).observe(source, { childList: true, characterData: true, subtree: true });
}

function watchBlockBackgroundField(source, block) {
  if (!source) return;
  new MutationObserver(() => {
    applyBlockBackground(block, source.textContent);
  }).observe(source, { childList: true, characterData: true, subtree: true });
}

function syncResourceColorFields(resourcePath, block) {
  readAueResourceFields(resourcePath, ['backgroundColor', 'textColor', 'borderColor', 'blockBackgroundColor'])
    .then((fields) => {
      const backgroundColor = normalizeColorValue(fields.backgroundColor);
      const textColor = normalizeColorValue(fields.textColor);
      const borderColor = normalizeColorValue(fields.borderColor);

      if (backgroundColor) block.style.setProperty('--colored-button-bg', backgroundColor);
      if (textColor) block.style.setProperty('--colored-button-text', textColor);
      if (borderColor) block.style.setProperty('--colored-button-border', borderColor);
      else if (backgroundColor) block.style.setProperty('--colored-button-border', backgroundColor);
      if (Object.prototype.hasOwnProperty.call(fields, 'blockBackgroundColor')) {
        applyBlockBackground(block, fields.blockBackgroundColor);
      }
    });
}

function readLink(block, name, labels = [], fallbackCell = null, isEditor = false) {
  const field = readLinkField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell: isEditor ? null : fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (isEditor && field.source) row.hidden = true;
    else row.remove();
  }
  return field;
}

function readImage(block, name, labels = [], fallbackCell = null, isEditor = false) {
  const field = readImageField(block, name, {
    labels,
    fallbackCell: isEditor ? null : fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) {
    if (isEditor && field.source) row.hidden = true;
    else row.remove();
  }
  return field;
}

function normalizeCssLength(value, propertyName) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^-?\d+(\.\d+)?$/u.test(normalized)) return `${normalized}px`;
  if (!window.CSS?.supports || window.CSS.supports(propertyName, normalized)) return normalized;
  return '';
}

function normalizeOption(value, allowedValues, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return allowedValues.includes(normalized) ? normalized : fallback;
}

function getPublishedCellText(row) {
  return (fieldCell(row)?.textContent || row?.textContent || '').replace(/\s+/gu, ' ').trim();
}

function derivePublishedFields(rows) {
  const values = rows.map(getPublishedCellText).filter(Boolean);
  const colors = values.map((value) => normalizeColorValue(value)).filter(Boolean);
  const findOption = (allowedValues) => values.find((value) => (
    allowedValues.includes(value.trim().toLowerCase())
  )) || '';
  const verticalOptions = ['top', 'middle', 'bottom'];
  const horizontalOptions = ['left', 'center', 'right', 'stretch'];
  const iconOptions = ['left', 'right', 'none'];
  const verticalIndex = values.reduce((lastIndex, value, index) => (
    verticalOptions.includes(value.trim().toLowerCase()) ? index : lastIndex
  ), -1);
  const horizontalAlign = verticalIndex > 0
    && horizontalOptions.includes(values[verticalIndex - 1].trim().toLowerCase())
    ? values[verticalIndex - 1]
    : findOption(horizontalOptions);
  const iconPosition = [
    ...values.slice(verticalIndex + 1),
    ...values.slice(0, Math.max(0, verticalIndex - 1)).reverse(),
  ].find((value) => iconOptions.includes(value.trim().toLowerCase())) || findOption(iconOptions);

  return {
    backgroundColor: colors[0] || '',
    textColor: colors[1] || '',
    borderColor: colors[2] || '',
    blockBackgroundColor: colors[3] || '',
    appearance: findOption(['solid', 'outlined', 'inverted']),
    invertOnHover: findOption(['yes', 'no']),
    horizontalAlign,
    verticalAlign: verticalIndex >= 0 ? values[verticalIndex] : findOption(verticalOptions),
    iconPosition,
    layoutOptions: values.find((value) => (
      /(?:padding|margin)-(?:all|vertical|horizontal|top|bottom)-(?:sm|md|lg)|shadow-(?:small|medium|large|highlight-(?:blue|navy|orange|gold)|white)/iu.test(value)
    )) || '',
  };
}
function hasInsertedBlockBackgroundRow(block, rows, rowIndex) {
  if (block.querySelector('[data-aue-prop="blockBackgroundColor"]')) return true;
  const currentValue = fieldCell(rows[rowIndex])?.textContent?.trim() || '';
  const nextValue = fieldCell(rows[rowIndex + 1])?.textContent?.trim() || '';
  if (normalizeColorValue(currentValue)) return true;
  if (!currentValue && /^(?:solid|outlined|inverted)$/i.test(nextValue)) return true;
  return false;
}

function normalizeFontWeight(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const namedWeights = {
    regular: '400',
    normal: '400',
    medium: '500',
    semibold: '600',
    'semi-bold': '600',
    bold: '700',
    extrabold: '800',
    'extra-bold': '800',
  };
  if (namedWeights[normalized]) return namedWeights[normalized];
  return /^(?:[1-9]00)$/u.test(normalized) ? normalized : '';
}

function normalizeIconName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildImageIcon(imageField, altText) {
  if (!imageField?.img && !imageField?.picture) return null;

  const icon = document.createElement('span');
  icon.className = 'colored-button-icon';
  let media;

  if (imageField.picture) {
    media = imageField.picture.cloneNode(true);
  } else {
    media = imageField.img.cloneNode(true);
  }

  const img = media.tagName === 'IMG' ? media : media.querySelector('img');
  if (img) {
    img.alt = altText || '';
    img.loading = 'lazy';
    if (imageField.img) moveInstrumentation(imageField.img, img);
  }
  if (imageField.source && media) moveInstrumentation(imageField.source, media);
  icon.append(media);
  return icon;
}

function buildNamedIcon(iconName, altText) {
  const normalizedName = normalizeIconName(iconName);
  if (!normalizedName) return null;

  const icon = document.createElement('span');
  icon.className = 'colored-button-icon';
  const iconUrl = `${window.hlx?.codeBasePath || ''}/icons/${normalizedName}.svg`;

  if (normalizedName === DEFAULT_BUTTON_ICON_NAME) {
    icon.classList.add('colored-button-icon-mask');
    icon.style.setProperty('--colored-button-icon-url', `url("${iconUrl}")`);
    if (altText) {
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', altText);
    } else {
      icon.setAttribute('aria-hidden', 'true');
    }
    return icon;
  }

  const img = document.createElement('img');
  img.src = iconUrl;
  img.alt = altText || '';
  img.loading = 'lazy';
  img.width = 20;
  img.height = 20;
  icon.append(img);

  return icon;
}

function appendLabel(labelField, label, fallbackLabel) {
  if (labelField.source) {
    moveInstrumentation(labelField.source, label);
    while (labelField.source.firstChild) label.append(labelField.source.firstChild);
  }

  if (!label.textContent.trim()) {
    label.textContent = fallbackLabel;
  }
}

export default function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const resourcePath = getAueResourcePath(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const publishedFields = isEditor ? {} : derivePublishedFields(rows);
  const rowOffset = hasInsertedBlockBackgroundRow(block, rows, 5) ? 1 : 0;

  const labelField = readField(block, 'label', ['button text', 'text', 'label'], fieldCell(rows[0]), isEditor);
  const linkField = readLink(block, 'link', ['button link', 'url', 'href'], fieldCell(rows[1]), isEditor);
  const bgField = readColorField(
    block,
    'backgroundColor',
    ['background color', 'button color'],
    isEditor,
    fieldCell(rows[2]),
  );
  const authoredBackgroundColor = normalizeColorValue(
    isEditor ? bgField.value : (publishedFields.backgroundColor || bgField.value),
  );
  const backgroundColor = authoredBackgroundColor || DEFAULT_BUTTON_BACKGROUND;
  const txtField = readColorField(block, 'textColor', ['text color'], isEditor, fieldCell(rows[3]));
  const textColor = normalizeColorValue(
    isEditor ? txtField.value : (publishedFields.textColor || txtField.value),
  ) || DEFAULT_BUTTON_TEXT;
  const bdrField = readColorField(block, 'borderColor', ['border color'], isEditor, fieldCell(rows[4]));
  const borderColor = normalizeColorValue(
    isEditor ? bdrField.value : (publishedFields.borderColor || bdrField.value),
  )
    || authoredBackgroundColor
    || DEFAULT_BUTTON_BORDER;
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color'],
    isEditor,
    rowOffset ? fieldCell(rows[5]) : null,
  );
  const blockBackgroundColor = normalizeColorValue(
    isEditor ? blockBgField.value : (publishedFields.blockBackgroundColor || blockBgField.value),
  );
  const appearance = normalizeOption(
    publishedFields.appearance
      || readField(block, 'appearance', ['style', 'button style'], fieldCell(rows[5 + rowOffset]), isEditor).value,
    ['solid', 'outlined', 'inverted'],
    'solid',
  );
  const invertOnHover = normalizeOption(
    publishedFields.invertOnHover
      || readField(block, 'invertOnHover', ['invert on hover'], fieldCell(rows[6 + rowOffset]), isEditor).value,
    ['yes', 'no'],
    'no',
  );
  // Offsets below match _colored-button.json's ACTUAL current field order (fields were
  // regrouped under UI tabs by a later commit, which changed this order without the
  // fixed-index reads here being updated). Order after invertOnHover: fontSize(7),
  // fontWeight(8), icon(9), iconName(10), iconAlt(11), iconPosition(12), then
  // horizontalAlign(13), verticalAlign(14), minHeight(15), layoutOptions(16) — the Icon tab
  // fields and fontSize/fontWeight come BEFORE the Layout & Spacing fields, not after.
  const fontSize = normalizeCssLength(readField(block, 'fontSize', ['font size', 'text size'], fieldCell(rows[7 + rowOffset]), isEditor).value, 'font-size');
  const fontWeight = normalizeFontWeight(readField(block, 'fontWeight', ['font weight', 'weight'], fieldCell(rows[8 + rowOffset]), isEditor).value);
  const iconField = readImage(block, 'icon', ['icon', 'icon image'], fieldCell(rows[9 + rowOffset]), isEditor);
  const iconName = readField(block, 'iconName', ['icon name'], fieldCell(rows[10 + rowOffset]), isEditor).value;
  const iconAlt = readField(block, 'iconAlt', ['icon alt', 'icon alt text'], fieldCell(rows[11 + rowOffset]), isEditor).value;
  const iconPosition = normalizeOption(
    publishedFields.iconPosition
      || readField(block, 'iconPosition', ['icon position'], fieldCell(rows[12 + rowOffset]), isEditor).value,
    ['left', 'right', 'none'],
    'right',
  );
  const horizontalAlign = normalizeOption(
    publishedFields.horizontalAlign
      || readField(block, 'horizontalAlign', ['horizontal alignment', 'button alignment'], fieldCell(rows[13 + rowOffset]), isEditor).value,
    ['left', 'center', 'right', 'stretch'],
    'left',
  );
  const verticalAlign = normalizeOption(
    publishedFields.verticalAlign
      || readField(block, 'verticalAlign', ['vertical alignment'], fieldCell(rows[14 + rowOffset]), isEditor).value,
    ['top', 'middle', 'bottom'],
    'top',
  );
  const iconSize = normalizeCssLength(readField(block, 'iconSize', ['icon size']).value, 'width');
  const minHeight = normalizeCssLength(readField(block, 'minHeight', ['minimum height', 'min height'], fieldCell(rows[15 + rowOffset]), isEditor).value, 'min-height');
  const layoutOptionsField = readField(
    block,
    'layoutOptions',
    ['layout options', 'spacing and shadow'],
    fieldCell(rows[16 + rowOffset]),
    isEditor,
  );

  block.classList.add(
    `colored-button-h-${horizontalAlign}`,
    `colored-button-v-${verticalAlign}`,
    `colored-button-appearance-${appearance}`,
  );
  applyColoredFieldLayoutOptions(block, 'colored-button', {
    layoutOptions: publishedFields.layoutOptions || layoutOptionsField.value,
  });
  if (invertOnHover === 'yes') block.classList.add('colored-button-invert-hover');
  if (fontSize) block.style.setProperty('--colored-button-font-size', fontSize);
  if (fontWeight) block.style.setProperty('--colored-button-font-weight', fontWeight);
  if (iconSize) block.style.setProperty('--colored-button-icon-size', iconSize);
  if (minHeight) block.style.setProperty('--colored-button-min-height', minHeight);
  block.style.setProperty('--colored-button-bg', backgroundColor);
  block.style.setProperty('--colored-button-text', textColor);
  block.style.setProperty('--colored-button-border', borderColor);
  applyBlockBackground(block, blockBackgroundColor);

  const inner = document.createElement('div');
  inner.className = 'colored-button-inner';

  const href = linkField.value;
  const button = document.createElement(href ? 'a' : 'button');
  button.className = 'colored-button-link';
  if (href) button.href = href;
  if (!href) button.type = 'button';
  if (linkField.source) moveInstrumentation(linkField.source, button);

  const label = document.createElement('span');
  label.className = 'colored-button-label';
  appendLabel(labelField, label, labelField.value || 'Button');

  const icon = iconPosition === 'none'
    ? null
    : buildImageIcon(iconField, iconAlt)
      || buildNamedIcon(iconName || DEFAULT_BUTTON_ICON_NAME, iconAlt);

  if (icon && iconPosition === 'left') button.append(icon);
  button.append(label);
  if (icon && iconPosition === 'right') button.append(icon);

  inner.append(button);

  if (isEditor) {
    const archive = document.createElement('span');
    archive.hidden = true;
    [...block.querySelectorAll(':scope > div[hidden]')].forEach((row) => archive.append(row));
    if (archive.children.length) inner.append(archive);
  }

  block.replaceChildren(inner);

  if (isEditor) {
    watchColorField(bgField.source, '--colored-button-bg', block);
    watchColorField(txtField.source, '--colored-button-text', block);
    watchColorField(bdrField.source, '--colored-button-border', block);
    watchBlockBackgroundField(blockBgField.source, block);
  }

  injectColorPickers(block, [
    { label: 'Button Background', cssVar: '--colored-button-bg', value: backgroundColor },
    { label: 'Text', cssVar: '--colored-button-text', value: textColor },
    { label: 'Border', cssVar: '--colored-button-border', value: borderColor },
    {
      label: 'Block Background',
      cssVar: '--colored-button-block-bg',
      value: blockBackgroundColor || '#ffffff',
      className: 'has-block-background',
    },
  ]);

  syncResourceColorFields(resourcePath, block);
  syncColoredFieldLayoutOptions(resourcePath, block, 'colored-button');
}
