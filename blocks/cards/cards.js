import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { applyAnimatedMarkers } from '../../scripts/animated-marker.js';

const SETTING_NAMES = [
  'textAlignment',
  'defaultCardBackgroundColor',
  'defaultCardTextColor',
  'defaultHighlightTextColor',
  'buttonDisplay',
  'imageDisplay',
  'cardBorderRadius',
  'cardShadow',
  'defaultCardTextSize',
  'cardGap',
  'markerTerms',
  'markerColor',
  'markerStyle',
];

const CARD_FIELD_NAMES = [
  'image',
  'text',
  'highlightText',
  'cardBackgroundColor',
  'cardTextColor',
  'highlightTextColor',
  'cardAlignment',
  'cardTextSize',
];

const DEFAULT_SETTINGS = {
  textAlignment: 'left',
  defaultCardBackgroundColor: '',
  defaultCardTextColor: '',
  defaultHighlightTextColor: '',
  buttonDisplay: 'show',
  imageDisplay: 'auto',
  cardBorderRadius: 'none',
  cardShadow: 'none',
  defaultCardTextSize: '',
  cardGap: '',
};

function directRowOf(block, element) {
  let row = element;
  while (row && row.parentElement !== block) {
    row = row.parentElement;
  }
  return row && row.parentElement === block ? row : null;
}

function fieldCell(row) {
  if (!row) return null;
  return row.children.length > 1 ? row.children[1] : row.children[0] || row;
}

function normalizeOption(value, allowedValues, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return allowedValues.includes(normalized) ? normalized : fallback;
}

function normalizeButtonDisplay(value) {
  const normalized = normalizeOption(
    value,
    ['show', 'hide', 'hidden', 'no', 'false', 'off'],
    'show',
  );
  return normalized === 'show' ? 'show' : 'hide';
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

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

function isExplicitCssLength(value) {
  const normalized = String(value || '').trim();
  return /^-?\d+(\.\d+)?(?:px|em|rem|ch|ex|vh|vw|vmin|vmax|%)$/iu.test(normalized)
    || /^(?:calc|min|max|clamp)\(.+\)$/iu.test(normalized);
}

function rowText(row) {
  return fieldCell(row)?.textContent?.trim() || '';
}

function hasOptionText(row, allowedValues) {
  return Boolean(normalizeOption(rowText(row), allowedValues, ''));
}

function isConfigOnlyText(value) {
  const text = String(value || '').trim();
  if (!text) return true;

  return Boolean(
    normalizeColorValue(text)
      || isExplicitCssLength(text)
      || normalizeOption(text, [
        'left',
        'center',
        'right',
        'justify',
        'show',
        'hide',
        'hidden',
        'no',
        'false',
        'off',
        'auto',
        'cover',
        'contain',
        'logo',
        'none',
        'small',
        'medium',
        'large',
      ], ''),
  );
}

function getLegacySettingCells(rows) {
  const scanRows = rows.slice(0, Math.min(rows.length, 14));
  const textAlignmentIndex = scanRows.findIndex((row) => (
    hasOptionText(row, ['left', 'center', 'right', 'justify'])
  ));

  if (textAlignmentIndex < 0) return {};

  const buttonDisplayIndex = scanRows.findIndex((row, index) => (
    index > textAlignmentIndex && hasOptionText(row, ['show', 'hide'])
  ));
  const imageDisplayIndex = scanRows.findIndex((row, index) => (
    index > textAlignmentIndex && hasOptionText(row, ['auto', 'cover', 'contain', 'logo'])
  ));
  const radiusShadowRows = scanRows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => index > Math.max(textAlignmentIndex, imageDisplayIndex))
    .filter(({ row }) => hasOptionText(row, ['none', 'small', 'medium', 'large']));
  const colorEndIndex = [
    buttonDisplayIndex,
    imageDisplayIndex,
    ...radiusShadowRows.map(({ index }) => index),
    scanRows.length,
  ].filter((index) => index > textAlignmentIndex).sort((a, b) => a - b)[0];
  const colorRows = scanRows
    .slice(textAlignmentIndex + 1, colorEndIndex)
    .filter((row) => normalizeColorValue(rowText(row)));
  const defaultCardTextSizeRow = scanRows.find((row, index) => (
    index > textAlignmentIndex && isExplicitCssLength(rowText(row))
  ));

  return {
    textAlignment: fieldCell(scanRows[textAlignmentIndex]),
    defaultCardBackgroundColor: fieldCell(colorRows[0]),
    defaultCardTextColor: colorRows.length >= 3 ? fieldCell(colorRows[1]) : null,
    defaultHighlightTextColor: colorRows.length >= 2
      ? fieldCell(colorRows[colorRows.length - 1])
      : null,
    buttonDisplay: fieldCell(scanRows[buttonDisplayIndex]),
    imageDisplay: fieldCell(scanRows[imageDisplayIndex]),
    cardBorderRadius: fieldCell(radiusShadowRows[0]?.row),
    cardShadow: fieldCell(radiusShadowRows[1]?.row),
    defaultCardTextSize: fieldCell(defaultCardTextSizeRow),
  };
}

function readSetting(block, name, labels = [], fallbackCell = null) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
    fallbackCell,
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field.value;
}

function isSettingRow(row) {
  return SETTING_NAMES.some((name) => row.querySelector(`[data-aue-prop="${name}"]`));
}

function applySettings(block, settings = {}) {
  const nextSettings = {
    ...DEFAULT_SETTINGS,
    ...(block.cardsSettings || {}),
    ...settings,
  };
  block.cardsSettings = nextSettings;

  const textAlignment = normalizeOption(
    nextSettings.textAlignment,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const buttonDisplay = normalizeButtonDisplay(nextSettings.buttonDisplay);
  const defaultCardBackground = normalizeColorValue(nextSettings.defaultCardBackgroundColor);
  const defaultCardTextColor = normalizeColorValue(nextSettings.defaultCardTextColor);
  const defaultHighlightTextColor = normalizeColorValue(nextSettings.defaultHighlightTextColor);
  const imageDisplay = normalizeOption(
    nextSettings.imageDisplay,
    ['auto', 'cover', 'contain', 'logo'],
    'auto',
  );
  const cardBorderRadius = normalizeOption(
    nextSettings.cardBorderRadius,
    ['none', 'small', 'medium', 'large'],
    'none',
  );
  const cardShadow = normalizeOption(
    nextSettings.cardShadow,
    [
      'none', 'small', 'medium', 'large',
      'highlight-blue', 'highlight-navy', 'highlight-orange', 'highlight-gold',
    ],
    'none',
  );
  const defaultCardTextSize = normalizeCssLength(
    nextSettings.defaultCardTextSize,
    'font-size',
  );
  const cardGap = normalizeCssLength(nextSettings.cardGap, 'gap');

  block.classList.remove(
    'cards-text-align-left',
    'cards-text-align-center',
    'cards-text-align-right',
    'cards-text-align-justify',
    'cards-hide-buttons',
    'cards-has-default-card-background',
    'cards-image-auto',
    'cards-image-cover',
    'cards-image-contain',
    'cards-image-logo',
    'cards-radius-none',
    'cards-radius-small',
    'cards-radius-medium',
    'cards-radius-large',
    'cards-shadow-none',
    'cards-shadow-small',
    'cards-shadow-medium',
    'cards-shadow-large',
    'cards-shadow-highlight-blue',
    'cards-shadow-highlight-navy',
    'cards-shadow-highlight-orange',
    'cards-shadow-highlight-gold',
  );
  block.classList.add(
    `cards-text-align-${textAlignment}`,
    `cards-image-${imageDisplay}`,
    `cards-radius-${cardBorderRadius}`,
    `cards-shadow-${cardShadow}`,
  );

  if (buttonDisplay === 'hide') block.classList.add('cards-hide-buttons');

  if (defaultCardBackground) {
    block.classList.add('cards-has-default-card-background');
    block.style.setProperty('--cards-card-bg-default', defaultCardBackground);
  } else {
    block.style.removeProperty('--cards-card-bg-default');
  }

  if (defaultCardTextColor) {
    block.style.setProperty('--cards-card-text-default', defaultCardTextColor);
  } else {
    block.style.removeProperty('--cards-card-text-default');
  }

  if (defaultHighlightTextColor) {
    block.style.setProperty('--cards-card-highlight-default', defaultHighlightTextColor);
  } else {
    block.style.removeProperty('--cards-card-highlight-default');
  }

  if (defaultCardTextSize) {
    block.style.setProperty('--cards-card-text-size-default', defaultCardTextSize);
  } else {
    block.style.removeProperty('--cards-card-text-size-default');
  }

  if (cardGap) {
    block.style.setProperty('--cards-gap', cardGap);
  } else {
    block.style.removeProperty('--cards-gap');
  }
}

function syncResourceSettings(resourcePath, block) {
  readAueResourceFields(resourcePath, SETTING_NAMES)
    .then((fields) => {
      if (Object.keys(fields).length) applySettings(block, fields);
    });
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope.getAttribute?.('data-aue-resource')
      || scope.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function hasCardField(row) {
  return CARD_FIELD_NAMES.some((name) => (
    row.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`)
  ));
}

function hasVisibleContent(row) {
  return Boolean(
    row.textContent.trim()
      || row.querySelector('img, picture, video, iframe, svg, ul, ol, li, a, button'),
  );
}

function isLegacyConfigOnlyRow(row) {
  if (!row?.children?.length) return true;
  if (row.querySelector('img, picture, video, iframe, svg, a[href], button')) return false;

  const values = [...row.children]
    .map((cell) => cell.textContent.trim())
    .filter(Boolean);

  return values.length > 0 && values.every(isConfigOnlyText);
}

function hasActionContent(cell) {
  if (!cell) return false;
  if (
    isConfigOnlyText(cell.textContent)
      && !cell.querySelector('button, .button-container')
  ) {
    return false;
  }

  return Boolean(cell?.querySelector?.('a[href], button, .button-container'));
}

function htmlHasRenderableContent(html) {
  if (!html) return false;

  const template = document.createElement('template');
  template.innerHTML = html;

  return Boolean(
    template.content.textContent.trim()
      || template.content.querySelector('img, picture, video, iframe, svg, ul, ol, li, a[href], button'),
  );
}

function fieldHasRenderableContent(field) {
  if (!field) return false;
  return Boolean(
    field.text?.trim()
      || htmlHasRenderableContent(field.html)
      || field.source?.textContent?.trim()
      || field.source?.querySelector?.('img, picture, video, iframe, svg, ul, ol, li, a[href], button'),
  );
}

function hasRenderableCardContent(row) {
  const imageField = readImageField(row, 'image', { fallbackCell: row.children[0] });
  const textField = readRichTextField(row, 'text', { fallbackCell: row.children[1] });
  const highlightField = readRichTextField(row, 'highlightText', { fallbackCell: row.children[2] });
  const hasLegacyAction = !hasCardField(row)
    && [...row.children].slice(2).some((cell) => hasActionContent(cell));

  return Boolean(
    imageField.img
      || fieldHasRenderableContent(textField)
      || fieldHasRenderableContent(highlightField)
      || hasLegacyAction,
  );
}

function shouldRenderCardRow(row) {
  if (row.getAttribute('data-aue-model') === 'card' || hasCardField(row)) {
    return hasAuthoringContext(row) || hasRenderableCardContent(row);
  }

  if (!hasVisibleContent(row) || isLegacyConfigOnlyRow(row)) return false;
  return hasRenderableCardContent(row);
}

function hasRenderableContent(field) {
  return fieldHasRenderableContent(field);
}

function moveRichText(field, target) {
  if (field.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    return;
  }

  if (field.html) {
    target.innerHTML = field.html;
  }
}

function appendRichText(field, className, parent) {
  if (!hasRenderableContent(field)) return;

  const element = document.createElement('div');
  element.className = className;
  moveRichText(field, element);

  if (element.textContent.trim() || element.querySelector('img, picture, a, ul, ol, li')) {
    parent.append(element);
  }
}

function fieldText(field) {
  return field?.text?.trim()
    || field?.source?.textContent?.trim()
    || '';
}

function isStatLikeCardText(value) {
  const text = String(value || '').trim();
  return text.length <= 48 && /^\s*[-+$]?\d/u.test(text);
}

function isShortIconCardLabel(value) {
  const text = String(value || '').trim();
  return Boolean(text && text.length <= 80 && !/[.!?]\s*$/u.test(text));
}

function isStatIconCard(textField, highlightField) {
  return isStatLikeCardText(fieldText(highlightField))
    && isShortIconCardLabel(fieldText(textField));
}

function isIconLikeImage(src) {
  try {
    const url = new URL(src, window.location.href);
    const path = url.pathname.toLowerCase();
    return /\.(?:svg)$/u.test(path)
      || /(?:^|[-_/])(icon|logo)(?:[-_. /]|$)/u.test(path);
  } catch {
    const path = String(src || '').toLowerCase();
    return /\.(?:svg)(?:[?#]|$)/u.test(path)
      || /(?:^|[-_/])(icon|logo)(?:[-_. /]|$)/u.test(path);
  }
}

function buildImage(imageField, forceIcon = false) {
  const sourceImg = imageField?.img;
  if (!sourceImg) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'cards-card-image';
  if (forceIcon || isIconLikeImage(sourceImg.src)) wrapper.classList.add('cards-card-image-icon');

  const optimizedPic = createOptimizedPicture(sourceImg.src, sourceImg.alt, false, [{ width: '750' }]);
  const optimizedImg = optimizedPic.querySelector('img');

  if (imageField.source && imageField.source !== sourceImg) {
    moveInstrumentation(imageField.source, optimizedPic);
  }
  if (optimizedImg) moveInstrumentation(sourceImg, optimizedImg);

  wrapper.append(optimizedPic);
  return wrapper;
}

function appendLegacyActions(row, body, startIndex) {
  if (hasCardField(row)) return;

  [...row.children].slice(startIndex).forEach((cell) => {
    if (!hasActionContent(cell)) return;

    const actions = document.createElement('div');
    actions.className = 'cards-card-actions';
    moveInstrumentation(cell, actions);
    while (cell.firstChild) actions.append(cell.firstChild);

    if (actions.textContent.trim() || actions.querySelector('a[href], button')) {
      body.append(actions);
    }
  });
}

function buildCard(row) {
  const li = document.createElement('li');
  li.className = 'cards-card';
  moveInstrumentation(row, li);

  const imageField = readImageField(row, 'image', { fallbackCell: row.children[0] });
  const textField = readRichTextField(row, 'text', { fallbackCell: row.children[1] });
  setItemLabel(li, [fieldText(textField)]);
  const legacyActionStartIndex = !hasCardField(row) && hasActionContent(row.children[2]) ? 2 : 3;
  const highlightField = legacyActionStartIndex === 2
    ? {
      source: null,
      cell: null,
      html: '',
      text: '',
    }
    : readRichTextField(row, 'highlightText', { fallbackCell: row.children[2] });
  const cardBackgroundField = readTextField(row, 'cardBackgroundColor', { fallbackCell: row.children[3] });
  const cardTextColorField = readTextField(row, 'cardTextColor', { fallbackCell: row.children[4] });
  const highlightTextColorField = readTextField(row, 'highlightTextColor', {
    fallbackCell: row.children[5],
  });
  const cardAlignmentField = readTextField(row, 'cardAlignment', { fallbackCell: row.children[6] });
  const cardTextSizeField = readTextField(row, 'cardTextSize', { fallbackCell: row.children[7] });
  const cardBackground = normalizeColorValue(cardBackgroundField.value);
  const cardTextColor = normalizeColorValue(cardTextColorField.value);
  const highlightTextColor = normalizeColorValue(highlightTextColorField.value);
  const cardTextSize = normalizeCssLength(cardTextSizeField.value, 'font-size');
  const cardAlignment = normalizeOption(
    cardAlignmentField.value,
    ['left', 'center', 'right', 'justify'],
    '',
  );

  if (cardBackground) {
    li.classList.add('cards-card-has-background');
    li.style.setProperty('--cards-card-bg', cardBackground);
  }

  if (cardTextColor) li.style.setProperty('--cards-card-text', cardTextColor);
  if (highlightTextColor) li.style.setProperty('--cards-card-highlight', highlightTextColor);
  if (cardTextSize) li.style.setProperty('--cards-card-text-size', cardTextSize);
  if (cardAlignment) li.classList.add(`cards-card-align-${cardAlignment}`);

  const image = buildImage(imageField, isStatIconCard(textField, highlightField));
  if (image) li.append(image);

  const body = document.createElement('div');
  body.className = 'cards-card-body';
  appendRichText(highlightField, 'cards-card-highlight', body);
  appendRichText(textField, 'cards-card-text', body);
  appendLegacyActions(row, body, legacyActionStartIndex);

  if (!body.childElementCount && hasAuthoringContext(row)) {
    body.classList.add('is-authoring-placeholder');
    body.textContent = 'Add card text in the editor.';
  }

  if (body.childElementCount || body.textContent.trim()) li.append(body);
  return li;
}

export default function decorate(block) {
  const resourcePath = getAueResourcePath(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const legacySettings = getLegacySettingCells(rows);
  applySettings(block, {
    textAlignment: readSetting(
      block,
      'textAlignment',
      ['text alignment', 'alignment', 'horizontal alignment'],
      legacySettings.textAlignment,
    ),
    defaultCardBackgroundColor: readSetting(block, 'defaultCardBackgroundColor', [
      'default card background color',
      'card background color',
    ], legacySettings.defaultCardBackgroundColor),
    defaultCardTextColor: readSetting(block, 'defaultCardTextColor', [
      'default card text color',
      'card text color',
    ], legacySettings.defaultCardTextColor),
    defaultHighlightTextColor: readSetting(block, 'defaultHighlightTextColor', [
      'default highlighted text color',
      'highlighted text color',
      'highlight text color',
    ], legacySettings.defaultHighlightTextColor),
    buttonDisplay: readSetting(block, 'buttonDisplay', ['card buttons', 'buttons'], legacySettings.buttonDisplay),
    imageDisplay: readSetting(
      block,
      'imageDisplay',
      ['image display', 'image display mode', 'image style'],
      legacySettings.imageDisplay,
    ),
    cardBorderRadius: readSetting(
      block,
      'cardBorderRadius',
      ['card border radius', 'border radius'],
      legacySettings.cardBorderRadius,
    ),
    cardShadow: readSetting(block, 'cardShadow', ['card shadow', 'drop shadow', 'shadow'], legacySettings.cardShadow),
    defaultCardTextSize: readSetting(
      block,
      'defaultCardTextSize',
      ['default card text size', 'card text size', 'text size'],
      legacySettings.defaultCardTextSize,
    ),
    cardGap: readSetting(block, 'cardGap', ['card gap', 'gap', 'card spacing'], null),
  });
  const markerTerms = readSetting(block, 'markerTerms', ['marker text', 'marker terms', 'highlight text'], null);
  const markerColor = readSetting(block, 'markerColor', ['marker color'], null);
  const markerStyle = readSetting(block, 'markerStyle', ['marker style'], null);

  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    if (isSettingRow(row)) {
      row.remove();
      return;
    }

    if (!shouldRenderCardRow(row)) {
      row.remove();
      return;
    }

    ul.append(buildCard(row));
  });

  block.replaceChildren(ul);
  applyAnimatedMarkers(block, {
    terms: markerTerms,
    color: markerColor,
    style: markerStyle,
  });
  syncResourceSettings(resourcePath, block);
}
