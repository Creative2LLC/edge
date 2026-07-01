import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
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

function applyLabelColor(block, value) {
  const hex = LABEL_COLOR_MAP[String(value || '').trim().toLowerCase()] || '';
  if (hex) {
    block.style.setProperty('--colored-icon-text-label-color', hex);
  } else {
    block.style.removeProperty('--colored-icon-text-label-color');
  }
}

function syncResourceColorFields(resourcePath, block) {
  readAueResourceFields(resourcePath, ['textColor', 'blockBackgroundColor', 'label', 'labelColor', 'text'])
    .then((fields) => {
      const textColor = normalizeColorValue(fields.textColor);
      if (textColor) block.style.setProperty('--colored-icon-text-color', textColor);
      if (Object.prototype.hasOwnProperty.call(fields, 'blockBackgroundColor')) {
        applyBlockBackground(block, fields.blockBackgroundColor);
      }
      if (Object.prototype.hasOwnProperty.call(fields, 'labelColor')) {
        applyLabelColor(block, fields.labelColor);
      }
      // Render label authored via Properties Rail when the DOM didn't carry the richtext row
      const resourceLabel = String(fields.label || '').trim();
      if (resourceLabel) {
        let labelEl = block.querySelector('.colored-icon-text-label');
        if (!labelEl) {
          labelEl = document.createElement('div');
          labelEl.className = 'colored-icon-text-label';
          const wrapper = block.querySelector('.colored-icon-text-text-wrapper');
          const content = block.querySelector('.colored-icon-text-content');
          if (wrapper && content) wrapper.insertBefore(labelEl, content);
          else if (wrapper) wrapper.prepend(labelEl);
        }
        if (!labelEl.children.length || labelEl.classList.contains('is-authoring-placeholder')) {
          labelEl.classList.remove('is-authoring-placeholder');
          labelEl.innerHTML = resourceLabel;
          labelEl.setAttribute('data-richtext-prop', 'label');
        }
      }
      // Render text authored via Properties Rail when the DOM didn't carry the richtext row
      const resourceText = String(fields.text || '').trim();
      if (resourceText) {
        const content = block.querySelector('.colored-icon-text-content');
        if (content && (!content.children.length || content.classList.contains('is-authoring-placeholder'))) {
          content.classList.remove('is-authoring-placeholder');
          content.innerHTML = resourceText;
          content.setAttribute('data-richtext-prop', 'text');
        }
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

  const isColorCell = (cell) => /^#[0-9a-f]{3,8}$/i.test((cell?.textContent || '').trim());
  const imageModeIndex = rows.findIndex((row, index) => (
    index >= 4
      && ['circle', 'square', 'icon'].includes(
        String(fieldCell(row)?.textContent || '').trim().toLowerCase(),
      )
  ));
  const horizontalAlignIndex = imageModeIndex >= 3 ? imageModeIndex - 3 : 5;
  const preAlignmentRows = rows.slice(1, horizontalAlignIndex);
  const colorRows = preAlignmentRows.filter((row) => isColorCell(fieldCell(row)));
  const firstColorIndex = colorRows.length ? rows.indexOf(colorRows[0]) : horizontalAlignIndex;
  const contentRows = rows.slice(1, firstColorIndex).filter((row) => (
    fieldCell(row)?.textContent?.trim()
      || row.querySelector('[data-aue-prop], [data-richtext-prop]')
  ));
  const imageAltFallback = contentRows.length >= 1 ? fieldCell(contentRows[0]) : null;
  const labelFallback = contentRows.length >= 3 ? fieldCell(contentRows[1]) : null;
  const textFallback = contentRows.length >= 3
    ? fieldCell(contentRows[2])
    : contentRows.length === 2
      ? fieldCell(contentRows[1])
      : fieldCell(contentRows[0]);
  const rowAfterImageMode = (offset, fallbackIndex) => fieldCell(
    rows[imageModeIndex >= 0 ? imageModeIndex + offset : fallbackIndex],
  );

  const imageField = readImage(block, 'image', ['image', 'icon'], fieldCell(rows[0]));
  const imageAlt = readField(block, 'imageAlt', ['image alt', 'alt text'], imageAltFallback).value;
  const labelField = readRichField(block, 'label', ['eyebrow', 'label'], labelFallback);
  const textField = readRichField(block, 'text', ['body', 'copy'], textFallback);
  const txtField = readColorField(
    block,
    'textColor',
    ['text color', 'color'],
    isEditor,
    fieldCell(colorRows[0] || rows[4]),
  );
  const blockBgField = readColorField(
    block,
    'blockBackgroundColor',
    ['block background color', 'background color'],
    isEditor,
    fieldCell(colorRows[1] || rows[5]),
  );
  const labelColorField = readField(block, 'labelColor', ['label color'], null);
  const horizontalAlign = normalizeOption(
    readField(block, 'horizontalAlign', ['horizontal alignment', 'text alignment'], fieldCell(rows[horizontalAlignIndex])).value,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const verticalAlign = normalizeOption(
    readField(block, 'verticalAlign', ['vertical alignment'], fieldCell(rows[horizontalAlignIndex + 1])).value,
    ['top', 'middle', 'bottom'],
    'middle',
  );
  const imagePosition = normalizeOption(
    readField(block, 'imagePosition', ['image position', 'icon position'], fieldCell(rows[horizontalAlignIndex + 2])).value,
    ['left', 'right', 'none'],
    'left',
  );
  const imageMode = normalizeOption(
    readField(block, 'imageMode', ['image mode', 'icon mode'], fieldCell(rows[imageModeIndex])).value,
    ['circle', 'square', 'icon'],
    'circle',
  );
  const imageSize = normalizeCssLength(readField(block, 'imageSize', ['image size', 'icon size'], rowAfterImageMode(1, 11)).value, 'width');
  const gap = normalizeCssLength(readField(block, 'gap', ['content gap', 'gap'], rowAfterImageMode(2, 12)).value, 'gap');
  const fontSize = normalizeCssLength(readField(block, 'fontSize', ['font size', 'text size'], rowAfterImageMode(3, 13)).value, 'font-size');
  const fontWeight = normalizeFontWeight(readField(block, 'fontWeight', ['font weight', 'weight'], rowAfterImageMode(4, 14)).value);
  const minHeight = normalizeCssLength(readField(block, 'minHeight', ['minimum height', 'min height'], rowAfterImageMode(5, 15)).value, 'min-height');
  const minHeightMobile = normalizeCssLength(readField(block, 'minHeightMobile', ['mobile min height'], rowAfterImageMode(6, 16)).value, 'min-height');
  const paddingStyleField = readField(block, 'paddingStyle', ['padding style', 'padding'], rowAfterImageMode(7, 17));
  const marginStyleField = readField(block, 'marginStyle', ['margin style', 'margin'], rowAfterImageMode(8, 18));
  const dropShadowField = readField(block, 'dropShadow', ['drop shadow', 'shadow'], rowAfterImageMode(9, 19));

  const textColor = normalizeColorValue(txtField.value) || DEFAULT_TEXT_COLOR;
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
  applyLabelColor(block, labelColorField.value);
  if (imageSize) block.style.setProperty('--colored-icon-text-image-size', imageSize);
  if (gap) block.style.setProperty('--colored-icon-text-gap', gap);
  if (fontSize) block.style.setProperty('--colored-icon-text-size', fontSize);
  if (fontWeight) block.style.setProperty('--colored-icon-text-weight', fontWeight);
  if (minHeight) block.style.setProperty('--colored-icon-text-min-height', minHeight);
  if (minHeightMobile) block.style.setProperty('--colored-icon-text-min-height-mobile', minHeightMobile);

  const inner = document.createElement('div');
  inner.className = 'colored-icon-text-inner';

  const textWrapper = document.createElement('div');
  textWrapper.className = 'colored-icon-text-text-wrapper';

  const isAuthoring = hasAuthoringContext(block);
  const media = imagePosition === 'none' ? null : buildMedia(imageField, imageMode, imageAlt, isAuthoring);

  const hasLabelContent = labelField.text.trim() || labelField.html.trim() || labelField.source;
  if (hasLabelContent) {
    const label = document.createElement('div');
    label.className = 'colored-icon-text-label';
    appendRichText(labelField, label);
    textWrapper.append(label);
  } else if (isAuthoring) {
    const label = document.createElement('div');
    label.className = 'colored-icon-text-label is-authoring-placeholder';
    label.textContent = 'Add label / eyebrow (optional)';
    textWrapper.append(label);
  }

  const content = document.createElement('div');
  content.className = 'colored-icon-text-content';

  const hasTextContent = textField.text.trim() || textField.html.trim() || textField.source;
  if (hasTextContent) {
    appendRichText(textField, content);
  } else if (isAuthoring) {
    content.classList.add('is-authoring-placeholder');
    content.textContent = 'Add colored icon text in the editor.';
  }

  if (hasTextContent || isAuthoring) textWrapper.append(content);

  if (media && imagePosition === 'left') inner.append(media);
  if (textWrapper.children.length) inner.append(textWrapper);
  if (media && imagePosition === 'right') inner.append(media);

  if (isEditor) {
    const archive = document.createElement('span');
    archive.hidden = true;
    [...block.querySelectorAll(':scope > div[hidden]')].forEach((row) => archive.append(row));
    if (archive.children.length) inner.append(archive);
  }

  block.replaceChildren(inner);

  if (isEditor) {
    watchColorField(txtField.source, '--colored-icon-text-color', block);
    watchBlockBackgroundField(blockBgField.source, block);
    if (labelColorField.source) {
      new MutationObserver(() => {
        applyLabelColor(block, labelColorField.source.textContent.trim());
      }).observe(labelColorField.source, { childList: true, characterData: true, subtree: true });
    }
  }

  injectColorPickers(block, [
    { label: 'Text Color', cssVar: '--colored-icon-text-color', value: textColor },
    {
      label: 'Block Background',
      cssVar: '--colored-icon-text-block-bg',
      value: backgroundColor || DEFAULT_BACKGROUND_COLOR,
      className: 'has-block-background',
    },
  ]);

  syncResourceColorFields(resourcePath, block);
  syncColoredFieldLayoutOptions(resourcePath, block, 'colored-icon-text');
}
