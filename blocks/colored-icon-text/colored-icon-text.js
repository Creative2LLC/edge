import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import injectColorPickers from '../../scripts/block-color-picker.js';
import {
  applyColoredFieldLayoutOptions,
  syncColoredFieldLayoutOptions,
} from '../../scripts/colored-field-options.js';
import { decorateButtonText } from '../../scripts/button-utils.js';

const DEFAULT_TEXT_COLOR = '#00264D';
const DEFAULT_BACKGROUND_COLOR = '#E9F7FA';
const DEFAULT_TEXT2_COLOR = '#404041';

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
// markup at all (confirmed empirically: a 29-field model rendered only 13 rows total
// for a partially-filled instance). A `cellAt()` offset guess still returns SOME row
// in that case — just the wrong one, belonging to whichever field happens to occupy
// that position for THIS particular instance's row count. In the editor, named
// `data-aue-prop` lookup is reliable whenever a field actually has content (confirmed:
// every populated field in the same sample carried its own aue-prop binding), so a
// failed name lookup there means the field is genuinely empty — never fall back to a
// position guess in that case. Positional fallback is only meaningful on true published
// pages (no instrumentation to name-match against at all), so it's kept there.
//
// In the editor, hide (don't remove) rows that carry Universal Editor instrumentation —
// permanently removing an aue-tracked node desyncs UE's resource tree from the DOM,
// which shifts every later imageMode-relative offset read on the NEXT decoration pass
// (see readColorField below, which already had this fix; the other read* helpers hadn't).
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
// content. Name-based lookup can never succeed for these, so unlike readField/readRichField/
// readImage/readLink below, positional fallback must stay enabled in the editor too, or
// these fields always read empty (this caused a live regression: color pickers falling
// back to defaults because the field could never be read in the editor).
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

function readRichField(block, name, labels = [], fallbackCell = null, isEditor = false) {
  const field = readRichTextField(block, name, {
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

function readLink(block, name, labels = [], fallbackCell = null, isEditor = false) {
  const field = readLinkField(block, name, {
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

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.toLowerCase() === 'transparent') return 'transparent';
  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : '';
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

function applyBlockBackground(block, value) {
  const color = normalizeColorValue(value);
  if (!color) {
    block.classList.remove('has-block-background');
    block.style.removeProperty('--colored-icon-text-block-bg');
    return '';
  }

  block.classList.add('has-block-background');
  block.style.setProperty('--colored-icon-text-block-bg', color);
  return color;
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

const LABEL_COLOR_MAP = {
  teal: '#008EB7',
  orange: '#F7941D',
  navy: '#00264D',
  'dark-navy': '#092348',
  white: '#FFFFFF',
  grey: '#404041',
};

function applyLabelColor(block, value, cssVar = '--colored-icon-text-label-color') {
  const hex = LABEL_COLOR_MAP[String(value || '').trim().toLowerCase()] || '';
  if (hex) {
    block.style.setProperty(cssVar, hex);
  } else {
    block.style.removeProperty(cssVar);
  }
}

function normalizeButtonTarget(value) {
  return String(value || '').trim() === '_blank' ? '_blank' : '_self';
}

// Guards against a positional-fallback misread landing button text/link on a config-shaped
// value (a CSS length, hex color, or enum keyword) instead of genuine authored content —
// e.g. an empty Button Text field on a published page can shift the row-based fallback onto
// a neighboring size/color field. Matches the isConfigOnlyText-style guards used elsewhere
// in this codebase (cards.js, statistics.js, colored-grid.js) for the same defensive reason.
function isConfigLikeText(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /^-?\d+(\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax)$/iu.test(text)
    || /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(text)
    || /^(?:[1-9]00)$/u.test(text)
    || ['left', 'right', 'none', 'top', 'middle', 'bottom', 'circle', 'square', 'icon', 'transparent'].includes(text.toLowerCase());
}

function buildButton(buttonTextField, buttonLinkField, buttonTargetField) {
  const text = isConfigLikeText(buttonTextField.value) ? '' : buttonTextField.value.trim();
  const href = isConfigLikeText(buttonLinkField.value) ? '' : buttonLinkField.value.trim();
  if (!text && !href) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = 'colored-icon-text-button';
  button.textContent = decorateButtonText(text, { defaultText: 'Learn more' });
  if (buttonTextField.source) moveInstrumentation(buttonTextField.source, button);

  if (href) {
    button.href = href;
    const target = normalizeButtonTarget(buttonTargetField.value);
    button.target = target;
    if (target === '_blank') button.rel = 'noopener noreferrer';
  }
  if (buttonLinkField.source) moveInstrumentation(buttonLinkField.source, button);

  return button;
}

// Only style/CSS-var fields are synced from the fetched resource JSON — content fields
// (label, labelPart2, text, text2) used to be injected here too via a create-if-missing
// syncResourceRichText helper, but that trusted whatever the .json resource endpoint
// returned by field name, and on at least one confirmed occasion it returned a stale/
// duplicate value for an empty field (text2 came back identical to text, producing a
// duplicated paragraph the author never authored). The synchronous decorate() pass
// already renders content fields correctly from live DOM instrumentation, so injecting
// content again from this async fetch is redundant at best; a wrong color/size from a
// stale fetch is comparatively harmless and easy to spot, so only that risk is kept.
function syncResourceColorFields(resourcePath, block) {
  readAueResourceFields(resourcePath, [
    'textColor',
    'blockBackgroundColor',
    'labelColor',
    'labelColor2',
    'labelFontSize',
    'text2Color',
    'text2FontSize',
  ])
    .then((fields) => {
      const textColor = normalizeColorValue(fields.textColor);
      if (textColor) block.style.setProperty('--colored-icon-text-color', textColor);
      const text2Color = normalizeColorValue(fields.text2Color);
      if (text2Color) block.style.setProperty('--colored-icon-text-text2-color', text2Color);
      const text2FontSize = normalizeCssLength(fields.text2FontSize, 'font-size');
      if (text2FontSize) block.style.setProperty('--colored-icon-text-text2-size', text2FontSize);
      const labelFontSize = normalizeCssLength(fields.labelFontSize, 'font-size');
      if (labelFontSize) block.style.setProperty('--colored-icon-text-label-size', labelFontSize);
      if (Object.prototype.hasOwnProperty.call(fields, 'blockBackgroundColor')) {
        applyBlockBackground(block, fields.blockBackgroundColor);
      }
      if (Object.prototype.hasOwnProperty.call(fields, 'labelColor')) {
        applyLabelColor(block, fields.labelColor);
      }
      if (Object.prototype.hasOwnProperty.call(fields, 'labelColor2')) {
        applyLabelColor(block, fields.labelColor2, '--colored-icon-text-label-color-2');
      }
    });
}

function appendPlainText(wrapper, text) {
  const normalized = String(text || '').replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return;

  normalized.split(/\n{2,}/u).forEach((chunk) => {
    const paragraph = document.createElement('p');
    chunk.split('\n').forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement('br'));
      paragraph.append(document.createTextNode(line));
    });
    wrapper.append(paragraph);
  });
}

function appendRichText(field, element) {
  if (field.source) {
    moveInstrumentation(field.source, element);
    while (field.source.firstChild) element.append(field.source.firstChild);
    return;
  }

  if (field.html && /<[^>]+>/u.test(field.html)) {
    element.innerHTML = field.html;
    return;
  }

  appendPlainText(element, field.text);
}

function hasAuthoringContext(block) {
  return Boolean(block.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'));
}

function hasAuthoredRichText(field) {
  return Boolean(field?.text?.trim() || field?.html?.trim());
}

function hasRichTextContent(field) {
  return hasAuthoredRichText(field) || Boolean(field?.source);
}

function buildRichTextElement(className, field, placeholder, isAuthoring) {
  const element = document.createElement('div');
  element.className = className;

  if (hasRichTextContent(field)) {
    appendRichText(field, element);
    return element;
  }

  if (!isAuthoring || !placeholder) return null;

  element.classList.add('is-authoring-placeholder');
  element.textContent = placeholder;
  return element;
}

function buildMedia(imageField, imageMode, imageAlt, isAuthoring) {
  const hasImage = imageField?.picture || imageField?.img;
  if (!hasImage && !isAuthoring) return null;

  const media = document.createElement('div');
  media.className = `colored-icon-text-media colored-icon-text-image-${imageMode}`;

  if (!hasImage) {
    media.classList.add('is-authoring-placeholder');
    media.textContent = 'Add image';
    return media;
  }

  const sourceMedia = imageField.picture || imageField.img;
  const renderedMedia = sourceMedia.cloneNode(true);
  const img = renderedMedia.tagName === 'IMG' ? renderedMedia : renderedMedia.querySelector('img');

  if (img) {
    if (imageAlt) img.alt = imageAlt;
    img.loading = 'lazy';
    if (imageField.img) moveInstrumentation(imageField.img, img);
  }
  if (imageField.source) moveInstrumentation(imageField.source, renderedMedia);

  media.append(renderedMedia);
  return media;
}

export default function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const resourcePath = getAueResourcePath(block);
  const rows = [...block.querySelectorAll(':scope > div')];

  // imageMode is an exact-match, small-value-space field ('circle'/'square'/'icon'),
  // so it's a reliable anchor: locate it dynamically, then read every other field at a
  // fixed offset relative to it. This stays correct even if the exported row count for
  // earlier fields (e.g. the image reference) doesn't match the model's field count 1:1 —
  // unlike reading fields at fixed absolute indices from row 0.
  const imageModeIndex = rows.findIndex((row, index) => (
    index >= 4
      && ['circle', 'square', 'icon'].includes(
        String(fieldCell(row)?.textContent || '').trim().toLowerCase(),
      )
  ));
  const cellAt = (relativeOffset, absoluteFallback) => fieldCell(
    rows[imageModeIndex >= 0 ? imageModeIndex + relativeOffset : absoluteFallback],
  );

  // Offsets below match _colored-icon-text.json's ACTUAL current field order (fields were
  // regrouped under UI tabs by a later commit — tabs don't consume a row, but the reorder
  // itself invalidated every offset that used to be measured from the old order). Order
  // relative to the imageMode anchor: label(-7), labelPart2(-6), text(-5), text2(-4),
  // image(-3), imageAlt(-2), imagePosition(-1), imageMode(0), imageSize(+1), buttonText(+2),
  // buttonLink(+3), buttonTarget(+4), textColor(+5), labelColor(+6), labelColor2(+7),
  // labelFontSize(+8), fontSize(+9), fontWeight(+10), text2Color(+11), text2FontSize(+12),
  // blockBackgroundColor(+13), horizontalAlign(+14), verticalAlign(+15), gap(+16),
  // minHeight(+17), minHeightMobile(+18), paddingStyle(+19), marginStyle(+20),
  // dropShadow(+21). The old offsets were stale from before that reorder — e.g. buttonText
  // used to read cellAt(13, ...), which now lands on blockBackgroundColor's row instead,
  // explaining values like a literal "transparent" showing up as button text.
  const imageField = readImage(block, 'image', ['image', 'icon'], cellAt(-3, 4), isEditor);
  const imageAlt = readField(block, 'imageAlt', ['image alt', 'alt text'], null, isEditor).value;
  const labelField = readRichField(block, 'label', ['eyebrow', 'label'], cellAt(-7, 0), isEditor);
  const textField = readRichField(block, 'text', ['body', 'copy'], cellAt(-5, 2), isEditor);
  const txtField = readColorField(block, 'textColor', ['text color', 'color'], isEditor, cellAt(5, 12));
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color', 'background color'],
    isEditor,
    cellAt(13, 20),
  );
  const labelColorField = readColorField(block, 'labelColor', ['label color'], isEditor, cellAt(6, 13));
  const labelPart2Field = readRichField(block, 'labelPart2', ['label part 2', 'eyebrow part 2'], cellAt(-6, 1), isEditor);
  const labelColor2Field = readColorField(block, 'labelColor2', ['label color 2'], isEditor, cellAt(7, 14));
  const labelFontSize = normalizeCssLength(
    readField(block, 'labelFontSize', ['label font size', 'eyebrow font size'], cellAt(8, 15), isEditor).value,
    'font-size',
  );
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment'], cellAt(14, 21), isEditor).value,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment'], cellAt(15, 22), isEditor).value,
    ['top', 'middle', 'bottom'],
    'middle',
  );
  const imagePosition = normalizeOption(
    readField(block, 'imagePosition', ['image position', 'icon position'], cellAt(-1, 6), isEditor).value,
    ['left', 'right', 'none'],
    'left',
  );
  const imageMode = normalizeOption(
    readField(block, 'imageMode', ['image mode', 'icon mode'], cellAt(0, 7), isEditor).value,
    ['circle', 'square', 'icon'],
    'circle',
  );
  const imageSize = normalizeCssLength(readField(block, 'imageSize', ['image size', 'icon size'], cellAt(1, 8), isEditor).value, 'width');
  const gap = normalizeCssLength(readField(block, 'gap', ['content gap', 'gap'], cellAt(16, 23), isEditor).value, 'gap');
  const fontSize = normalizeCssLength(readField(block, 'fontSize', ['font size', 'text size'], cellAt(9, 16), isEditor).value, 'font-size');
  const fontWeight = normalizeFontWeight(readField(block, 'fontWeight', ['font weight', 'weight'], cellAt(10, 17), isEditor).value);
  const minHeight = normalizeCssLength(readField(block, 'minHeight', ['minimum height', 'min height'], cellAt(17, 24), isEditor).value, 'min-height');
  const minHeightMobile = normalizeCssLength(readField(block, 'minHeightMobile', ['mobile min height'], cellAt(18, 25), isEditor).value, 'min-height');
  const paddingStyleField = readField(block, 'paddingStyle', ['padding style', 'padding'], cellAt(19, 26), isEditor);
  const marginStyleField = readField(block, 'marginStyle', ['margin style', 'margin'], cellAt(20, 27), isEditor);
  const dropShadowField = readField(block, 'dropShadow', ['drop shadow', 'shadow'], cellAt(21, 28), isEditor);
  const text2Field = readRichField(block, 'text2', ['text 2', 'body text'], cellAt(-4, 3), isEditor);
  const text2ColorField = readColorField(
    block,
    'text2Color',
    ['text 2 color', 'body text color'],
    isEditor,
    cellAt(11, 18),
  );
  const text2FontSize = normalizeCssLength(
    readField(block, 'text2FontSize', ['text 2 font size', 'body font size'], cellAt(12, 19), isEditor).value,
    'font-size',
  );
  const buttonTextField = readField(block, 'buttonText', ['button text'], cellAt(2, 9), isEditor);
  const buttonLinkField = readLink(block, 'buttonLink', ['button link'], cellAt(3, 10), isEditor);
  const buttonTargetField = readField(block, 'buttonTarget', ['button target'], cellAt(4, 11), isEditor);

  const textColor = normalizeColorValue(txtField.value) || DEFAULT_TEXT_COLOR;
  const text2Color = normalizeColorValue(text2ColorField.value) || DEFAULT_TEXT2_COLOR;
  const backgroundColor = applyBlockBackground(
    block,
    normalizeColorValue(blockBgField.value) || DEFAULT_BACKGROUND_COLOR,
  );

  block.classList.add(
    `colored-icon-text-h-${horizontalAlign}`,
    `colored-icon-text-v-${verticalAlign}`,
    `colored-icon-text-media-${imagePosition}`,
  );
  applyColoredFieldLayoutOptions(block, 'colored-icon-text', {
    paddingStyle: paddingStyleField.value,
    marginStyle: marginStyleField.value,
    dropShadow: dropShadowField.value,
  });

  block.style.setProperty('--colored-icon-text-color', textColor);
  block.style.setProperty('--colored-icon-text-text2-color', text2Color);
  applyLabelColor(block, labelColorField.value);
  applyLabelColor(block, labelColor2Field.value, '--colored-icon-text-label-color-2');
  if (imageSize) block.style.setProperty('--colored-icon-text-image-size', imageSize);
  if (gap) block.style.setProperty('--colored-icon-text-gap', gap);
  if (fontSize) block.style.setProperty('--colored-icon-text-size', fontSize);
  if (fontWeight) block.style.setProperty('--colored-icon-text-weight', fontWeight);
  if (minHeight) block.style.setProperty('--colored-icon-text-min-height', minHeight);
  if (minHeightMobile) block.style.setProperty('--colored-icon-text-min-height-mobile', minHeightMobile);
  if (text2FontSize) block.style.setProperty('--colored-icon-text-text2-size', text2FontSize);
  if (labelFontSize) block.style.setProperty('--colored-icon-text-label-size', labelFontSize);

  const inner = document.createElement('div');
  inner.className = 'colored-icon-text-inner';

  const textWrapper = document.createElement('div');
  textWrapper.className = 'colored-icon-text-text-wrapper';

  const isAuthoring = hasAuthoringContext(block);
  const media = imagePosition === 'none' ? null : buildMedia(imageField, imageMode, imageAlt, isAuthoring);

  const labelRow = document.createElement('div');
  labelRow.className = 'colored-icon-text-label-row';
  const label = buildRichTextElement(
    'colored-icon-text-label',
    labelField,
    'Add label / eyebrow (optional)',
    isAuthoring,
  );
  const label2 = buildRichTextElement(
    'colored-icon-text-label colored-icon-text-label-2',
    labelPart2Field,
    '',
    isAuthoring,
  );
  if (label) labelRow.append(label);
  if (label2) labelRow.append(label2);
  if (labelRow.children.length) textWrapper.append(labelRow);

  const content = buildRichTextElement(
    'colored-icon-text-content',
    textField,
    'Add colored icon text in the editor.',
    isAuthoring,
  );
  if (content) textWrapper.append(content);

  const text2 = buildRichTextElement(
    'colored-icon-text-text2',
    text2Field,
    '',
    isAuthoring,
  );
  if (text2) textWrapper.append(text2);

  if (media && imagePosition === 'left') inner.append(media);
  if (textWrapper.children.length) inner.append(textWrapper);
  if (media && imagePosition === 'right') inner.append(media);

  const button = buildButton(buttonTextField, buttonLinkField, buttonTargetField);
  if (button) {
    const buttonRow = document.createElement('div');
    buttonRow.className = 'colored-icon-text-button-row';
    buttonRow.append(button);
    inner.append(buttonRow);
  }

  if (isEditor) {
    const archive = document.createElement('span');
    archive.className = 'colored-icon-text-field-archive';
    archive.hidden = true;
    [...block.querySelectorAll(':scope > div[hidden]')].forEach((row) => archive.append(row));
    if (archive.children.length) inner.append(archive);
  }

  block.replaceChildren(inner);

  if (isEditor) {
    watchColorField(txtField.source, '--colored-icon-text-color', block);
    watchBlockBackgroundField(blockBgField.source, block);
    watchColorField(text2ColorField.source, '--colored-icon-text-text2-color', block);
    [
      [labelColorField, '--colored-icon-text-label-color'],
      [labelColor2Field, '--colored-icon-text-label-color-2'],
    ].forEach(([field, cssVar]) => {
      if (!field.source) return;
      new MutationObserver(() => {
        applyLabelColor(block, field.source.textContent.trim(), cssVar);
      }).observe(field.source, { childList: true, characterData: true, subtree: true });
    });
  }

  injectColorPickers(block, [
    { label: 'Text Color', cssVar: '--colored-icon-text-color', value: textColor },
    {
      label: 'Block Background',
      cssVar: '--colored-icon-text-block-bg',
      value: backgroundColor || DEFAULT_BACKGROUND_COLOR,
      className: 'has-block-background',
    },
    { label: 'Text 2 Color', cssVar: '--colored-icon-text-text2-color', value: text2Color },
  ]);

  syncResourceColorFields(resourcePath, block);
  syncColoredFieldLayoutOptions(resourcePath, block, 'colored-icon-text');
}
