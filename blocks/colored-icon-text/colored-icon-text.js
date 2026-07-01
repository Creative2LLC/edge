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

function readField(block, name, labels = [], fallbackCell = null) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

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

function readRichField(block, name, labels = [], fallbackCell = null) {
  const field = readRichTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

function readImage(block, name, labels = [], fallbackCell = null) {
  const field = readImageField(block, name, { labels, fallbackCell });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field;
}

function readLink(block, name, labels = [], fallbackCell = null) {
  const field = readLinkField(block, name, { labels, fallbackCell });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
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

function buildButton(buttonTextField, buttonLinkField, buttonTargetField) {
  const text = buttonTextField.value.trim();
  const href = buttonLinkField.value.trim();
  if (!text && !href) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = 'colored-icon-text-button';
  button.textContent = text || 'Learn more';
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

function ensureTextWrapper(block) {
  let wrapper = block.querySelector('.colored-icon-text-text-wrapper');
  if (wrapper) return wrapper;

  const inner = block.querySelector('.colored-icon-text-inner');
  if (!inner) return null;

  wrapper = document.createElement('div');
  wrapper.className = 'colored-icon-text-text-wrapper';

  const rightMedia = block.classList.contains('colored-icon-text-media-right')
    ? inner.querySelector(':scope > .colored-icon-text-media')
    : null;
  if (rightMedia) inner.insertBefore(wrapper, rightMedia);
  else inner.append(wrapper);

  return wrapper;
}

function setResourceRichText(element, html, propName) {
  const resourceHtml = String(html || '').trim();
  if (!element || !resourceHtml) return;

  if (!element.children.length || element.classList.contains('is-authoring-placeholder')) {
    element.classList.remove('is-authoring-placeholder');
    element.innerHTML = resourceHtml;
    element.setAttribute('data-richtext-prop', propName);
  }
}

function syncResourceRichText(block, selector, className, propName, html, getParent) {
  const resourceHtml = String(html || '').trim();
  if (!resourceHtml) return null;

  let element = block.querySelector(selector);
  if (!element) {
    const parent = getParent();
    if (!parent) return null;

    element = document.createElement('div');
    element.className = className;
    parent.append(element);
  }

  setResourceRichText(element, resourceHtml, propName);
  return element;
}

function ensureLabelRow(block) {
  const wrapper = ensureTextWrapper(block);
  if (!wrapper) return null;

  let row = wrapper.querySelector(':scope > .colored-icon-text-label-row');
  if (row) return row;

  row = document.createElement('div');
  row.className = 'colored-icon-text-label-row';
  wrapper.prepend(row);
  return row;
}

function syncResourceColorFields(resourcePath, block) {
  readAueResourceFields(resourcePath, [
    'textColor',
    'blockBackgroundColor',
    'label',
    'labelColor',
    'labelPart2',
    'labelColor2',
    'labelFontSize',
    'text',
    'text2',
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

      syncResourceRichText(
        block,
        '.colored-icon-text-label',
        'colored-icon-text-label',
        'label',
        fields.label,
        () => ensureLabelRow(block),
      );
      syncResourceRichText(
        block,
        '.colored-icon-text-label-2',
        'colored-icon-text-label colored-icon-text-label-2',
        'labelPart2',
        fields.labelPart2,
        () => ensureLabelRow(block),
      );
      syncResourceRichText(
        block,
        '.colored-icon-text-content',
        'colored-icon-text-content',
        'text',
        fields.text,
        () => ensureTextWrapper(block),
      );
      syncResourceRichText(
        block,
        '.colored-icon-text-text2',
        'colored-icon-text-text2',
        'text2',
        fields.text2,
        () => ensureTextWrapper(block),
      );
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

  const imageField = readImage(block, 'image', ['image', 'icon'], cellAt(-13, 0));
  const imageAlt = readField(block, 'imageAlt', ['image alt', 'alt text'], cellAt(-12, 1)).value;
  const labelField = readRichField(block, 'label', ['eyebrow', 'label'], cellAt(-11, 2));
  const textField = readRichField(block, 'text', ['body', 'copy'], cellAt(-10, 3));
  const txtField = readColorField(block, 'textColor', ['text color', 'color'], isEditor, cellAt(-9, 4));
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color', 'background color'],
    isEditor,
    cellAt(-8, 5),
  );
  const labelColorField = readColorField(block, 'labelColor', ['label color'], isEditor, cellAt(-7, 6));
  const labelPart2Field = readRichField(block, 'labelPart2', ['label part 2', 'eyebrow part 2'], cellAt(-6, 7));
  const labelColor2Field = readColorField(block, 'labelColor2', ['label color 2'], isEditor, cellAt(-5, 8));
  const labelFontSize = normalizeCssLength(
    readField(block, 'labelFontSize', ['label font size', 'eyebrow font size'], cellAt(-4, 9)).value,
    'font-size',
  );
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment'], cellAt(-3, 10)).value,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment'], cellAt(-2, 11)).value,
    ['top', 'middle', 'bottom'],
    'middle',
  );
  const imagePosition = normalizeOption(
    readField(block, 'imagePosition', ['image position', 'icon position'], cellAt(-1, 12)).value,
    ['left', 'right', 'none'],
    'left',
  );
  const imageMode = normalizeOption(
    readField(block, 'imageMode', ['image mode', 'icon mode'], cellAt(0, 13)).value,
    ['circle', 'square', 'icon'],
    'circle',
  );
  const imageSize = normalizeCssLength(readField(block, 'imageSize', ['image size', 'icon size'], cellAt(1, 14)).value, 'width');
  const gap = normalizeCssLength(readField(block, 'gap', ['content gap', 'gap'], cellAt(2, 15)).value, 'gap');
  const fontSize = normalizeCssLength(readField(block, 'fontSize', ['font size', 'text size'], cellAt(3, 16)).value, 'font-size');
  const fontWeight = normalizeFontWeight(readField(block, 'fontWeight', ['font weight', 'weight'], cellAt(4, 17)).value);
  const minHeight = normalizeCssLength(readField(block, 'minHeight', ['minimum height', 'min height'], cellAt(5, 18)).value, 'min-height');
  const minHeightMobile = normalizeCssLength(readField(block, 'minHeightMobile', ['mobile min height'], cellAt(6, 19)).value, 'min-height');
  const paddingStyleField = readField(block, 'paddingStyle', ['padding style', 'padding'], cellAt(7, 20));
  const marginStyleField = readField(block, 'marginStyle', ['margin style', 'margin'], cellAt(8, 21));
  const dropShadowField = readField(block, 'dropShadow', ['drop shadow', 'shadow'], cellAt(9, 22));
  const text2Field = readRichField(block, 'text2', ['text 2', 'body text'], cellAt(10, 23));
  const text2ColorField = readColorField(
    block,
    'text2Color',
    ['text 2 color', 'body text color'],
    isEditor,
    cellAt(11, 24),
  );
  const text2FontSize = normalizeCssLength(readField(block, 'text2FontSize', ['text 2 font size', 'body font size'], cellAt(12, 25)).value, 'font-size');
  const buttonTextField = readField(block, 'buttonText', ['button text'], cellAt(13, 26));
  const buttonLinkField = readLink(block, 'buttonLink', ['button link'], cellAt(14, 27));
  const buttonTargetField = readField(block, 'buttonTarget', ['button target'], cellAt(15, 28));

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
