import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const SETTING_NAMES = [
  'textAlignment',
  'defaultCardBackgroundColor',
  'defaultCardTextColor',
  'defaultHighlightTextColor',
  'buttonDisplay',
  'cardBorderRadius',
  'cardShadow',
];

const CARD_FIELD_NAMES = [
  'image',
  'text',
  'highlightText',
  'cardBackgroundColor',
  'cardTextColor',
  'highlightTextColor',
  'cardAlignment',
];

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

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : '';
}

function readSetting(block, name, labels = []) {
  const field = readTextField(block, name, {
    labels: [name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), ...labels],
  });
  const row = field.cell ? directRowOf(block, field.cell) : null;
  if (row) row.remove();
  return field.value;
}

function isSettingRow(row) {
  return SETTING_NAMES.some((name) => row.querySelector(`[data-aue-prop="${name}"]`));
}

function applySettings(block, settings = {}) {
  const textAlignment = normalizeOption(
    settings.textAlignment,
    ['left', 'center', 'right', 'justify'],
    'left',
  );
  const buttonDisplay = normalizeOption(
    settings.buttonDisplay,
    ['show', 'hide'],
    'show',
  );
  const defaultCardBackground = normalizeColorValue(settings.defaultCardBackgroundColor);
  const defaultCardTextColor = normalizeColorValue(settings.defaultCardTextColor);
  const defaultHighlightTextColor = normalizeColorValue(settings.defaultHighlightTextColor);
  const cardBorderRadius = normalizeOption(
    settings.cardBorderRadius,
    ['none', 'small', 'medium', 'large'],
    'none',
  );
  const cardShadow = normalizeOption(
    settings.cardShadow,
    ['none', 'small', 'medium', 'large'],
    'none',
  );

  block.classList.remove(
    'cards-text-align-left',
    'cards-text-align-center',
    'cards-text-align-right',
    'cards-text-align-justify',
    'cards-hide-buttons',
    'cards-has-default-card-background',
    'cards-radius-none',
    'cards-radius-small',
    'cards-radius-medium',
    'cards-radius-large',
    'cards-shadow-none',
    'cards-shadow-small',
    'cards-shadow-medium',
    'cards-shadow-large',
  );
  block.classList.add(
    `cards-text-align-${textAlignment}`,
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

function shouldRenderCardRow(row) {
  return row.getAttribute('data-aue-model') === 'card'
    || hasCardField(row)
    || hasVisibleContent(row);
}

function hasRenderableContent(field) {
  if (!field) return false;
  if (field.text || field.html) return true;
  return Boolean(field.source?.textContent?.trim() || field.source?.querySelector?.('img, picture, a, ul, ol, li'));
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

function buildImage(imageField) {
  const sourceImg = imageField?.img;
  if (!sourceImg) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'cards-card-image';

  const optimizedPic = createOptimizedPicture(sourceImg.src, sourceImg.alt, false, [{ width: '750' }]);
  const optimizedImg = optimizedPic.querySelector('img');

  if (imageField.source && imageField.source !== sourceImg) {
    moveInstrumentation(imageField.source, optimizedPic);
  }
  if (optimizedImg) moveInstrumentation(sourceImg, optimizedImg);

  wrapper.append(optimizedPic);
  return wrapper;
}

function buildCard(row) {
  const li = document.createElement('li');
  li.className = 'cards-card';
  moveInstrumentation(row, li);

  const imageField = readImageField(row, 'image', { fallbackCell: row.children[0] });
  const textField = readRichTextField(row, 'text', { fallbackCell: row.children[1] });
  const highlightField = readRichTextField(row, 'highlightText', { fallbackCell: row.children[2] });
  const cardBackgroundField = readTextField(row, 'cardBackgroundColor', { fallbackCell: row.children[3] });
  const cardTextColorField = readTextField(row, 'cardTextColor', { fallbackCell: row.children[4] });
  const highlightTextColorField = readTextField(row, 'highlightTextColor', {
    fallbackCell: row.children[5],
  });
  const cardAlignmentField = readTextField(row, 'cardAlignment', { fallbackCell: row.children[6] });
  const cardBackground = normalizeColorValue(cardBackgroundField.value);
  const cardTextColor = normalizeColorValue(cardTextColorField.value);
  const highlightTextColor = normalizeColorValue(highlightTextColorField.value);
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
  if (cardAlignment) li.classList.add(`cards-card-align-${cardAlignment}`);

  const image = buildImage(imageField);
  if (image) li.append(image);

  const body = document.createElement('div');
  body.className = 'cards-card-body';
  appendRichText(highlightField, 'cards-card-highlight', body);
  appendRichText(textField, 'cards-card-text', body);

  if (!body.childElementCount && hasAuthoringContext(row)) {
    body.classList.add('is-authoring-placeholder');
    body.textContent = 'Add card text in the editor.';
  }

  if (body.childElementCount || body.textContent.trim()) li.append(body);
  return li;
}

export default function decorate(block) {
  const resourcePath = getAueResourcePath(block);
  applySettings(block, {
    textAlignment: readSetting(block, 'textAlignment', ['text alignment', 'alignment', 'horizontal alignment']),
    defaultCardBackgroundColor: readSetting(block, 'defaultCardBackgroundColor', [
      'default card background color',
      'card background color',
    ]),
    defaultCardTextColor: readSetting(block, 'defaultCardTextColor', [
      'default card text color',
      'card text color',
    ]),
    defaultHighlightTextColor: readSetting(block, 'defaultHighlightTextColor', [
      'default highlighted text color',
      'highlighted text color',
      'highlight text color',
    ]),
    buttonDisplay: readSetting(block, 'buttonDisplay', ['card buttons', 'buttons']),
    cardBorderRadius: readSetting(block, 'cardBorderRadius', ['card border radius', 'border radius']),
    cardShadow: readSetting(block, 'cardShadow', ['card shadow', 'drop shadow', 'shadow']),
  });

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
  syncResourceSettings(resourcePath, block);
}
