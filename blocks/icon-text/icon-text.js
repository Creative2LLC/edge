import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import { readImageField, readTextField } from '../../scripts/block-field-utils.js';

const LEGACY_LABELS = {
  heading: ['heading', 'title'],
  icon: ['icon', 'image'],
  redText: ['red text', 'redtext', 'red'],
  blueText: ['blue text', 'bluetext', 'blue'],
};

function collectLegacyFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(LEGACY_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      map[name] = { source: valueEl, value: valueEl.textContent.trim() };
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getRowCells(block) {
  return [...block.querySelectorAll(':scope > div')]
    .map((row) => row.children[0] || row)
    .filter(Boolean);
}

function getFallbackCell(block, index) {
  return getRowCells(block)[index] || null;
}

function hasMedia(cell) {
  return Boolean(cell?.querySelector?.('picture, img'));
}

function getTextFallbackCell(block, index) {
  const cell = getFallbackCell(block, index);
  return cell && !hasMedia(cell) ? cell : null;
}

function getField(block, legacyMap, name, fallbackCell = null) {
  const field = readTextField(block, name, { fallbackCell });
  if (field.source || field.cell) return field;
  return legacyMap[name] || { source: null, value: '' };
}

function getImageField(block, legacyMap, name, fallbackCell = null) {
  const field = readImageField(block, name, { fallbackCell });
  if (field.img || field.picture || field.source) return field;
  const legacyField = legacyMap[name] || { source: null };
  const picture = legacyField.source?.querySelector('picture')
    || fallbackCell?.querySelector?.('picture')
    || block.querySelector('picture');
  const img = legacyField.source?.querySelector('img')
    || fallbackCell?.querySelector?.('img')
    || picture?.querySelector('img')
    || null;
  return {
    source: legacyField.source || fallbackCell,
    cell: legacyField.source || fallbackCell,
    picture,
    img,
  };
}

function buildTextElement(tag, className, field) {
  if (!field?.value && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else {
    el.textContent = field.value;
  }
  return el;
}

export default function decorate(block) {
  const legacyMap = collectLegacyFields(block);

  const headingField = getField(block, legacyMap, 'heading', getTextFallbackCell(block, 0));
  const iconField = getImageField(block, legacyMap, 'icon', getFallbackCell(block, 1));
  const redTextField = getField(block, legacyMap, 'redText', getTextFallbackCell(block, 2));
  const blueTextField = getField(block, legacyMap, 'blueText', getTextFallbackCell(block, 3));

  const wrapper = document.createElement('div');
  wrapper.className = 'icon-text-inner';

  const heading = buildTextElement('h2', 'icon-text-heading', headingField);
  if (heading) wrapper.append(heading);

  const content = document.createElement('div');
  content.className = 'icon-text-content';

  /* icon */
  const iconSource = iconField.source;
  const picture = iconField.picture || block.querySelector('picture');
  const iconWrap = document.createElement('div');
  iconWrap.className = 'icon-text-icon';

  if (picture) {
    const img = picture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '204' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      picture.replaceWith(optimized);
      iconWrap.append(optimized);
    } else {
      iconWrap.append(picture);
    }
    if (iconSource) iconSource.remove();
    content.append(iconWrap);
  } else if (iconSource) {
    moveInstrumentation(iconSource, iconWrap);
    while (iconSource.firstChild) iconWrap.append(iconSource.firstChild);
    iconSource.remove();
    content.append(iconWrap);
  }

  /* inline text */
  const textLine = document.createElement('p');
  textLine.className = 'icon-text-line';

  const redSpan = buildTextElement('span', 'icon-text-red', redTextField);
  const blueSpan = buildTextElement('span', 'icon-text-blue', blueTextField);

  if (redSpan) textLine.append(redSpan);
  if (redSpan && blueSpan) textLine.append(' ');
  if (blueSpan) textLine.append(blueSpan);

  if (textLine.childNodes.length) content.append(textLine);

  wrapper.append(content);
  block.replaceChildren(wrapper);
}
