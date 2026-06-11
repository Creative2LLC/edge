import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const SETTING_NAMES = ['textAlignment', 'buttonDisplay'];

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

  block.classList.remove(
    'cards-text-align-left',
    'cards-text-align-center',
    'cards-text-align-right',
    'cards-text-align-justify',
    'cards-hide-buttons',
  );
  block.classList.add(`cards-text-align-${textAlignment}`);
  if (buttonDisplay === 'hide') block.classList.add('cards-hide-buttons');
}

function syncResourceSettings(resourcePath, block) {
  readAueResourceFields(resourcePath, SETTING_NAMES)
    .then((fields) => {
      if (Object.keys(fields).length) applySettings(block, fields);
    });
}

export default function decorate(block) {
  const resourcePath = getAueResourcePath(block);
  applySettings(block, {
    textAlignment: readSetting(block, 'textAlignment', ['text alignment', 'alignment']),
    buttonDisplay: readSetting(block, 'buttonDisplay', ['card buttons', 'buttons']),
  });

  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    if (isSettingRow(row)) {
      row.remove();
      return;
    }

    const li = document.createElement('li');
    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
  block.replaceChildren(ul);
  syncResourceSettings(resourcePath, block);
}
