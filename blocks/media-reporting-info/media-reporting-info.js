import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  heading: 0,
  intro: 1,
  itemOneHeading: 2,
  itemOneCopy: 3,
  itemTwoHeading: 4,
  itemTwoCopy: 5,
  itemThreeHeading: 6,
  itemThreeCopy: 7,
};

function rows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function fieldCell(row) {
  if (!row) return null;
  return row.children.length > 1 ? row.children[1] : row.children[0] || row;
}

function getField(block, name) {
  const field = readTextField(block, name, {
    fallbackCell: fieldCell(rows(block)[FIELD_INDEX[name]]),
  });
  return {
    source: field.source || field.cell,
    value: field.value,
  };
}

function getRichField(block, name) {
  const field = readRichTextField(block, name, {
    fallbackCell: fieldCell(rows(block)[FIELD_INDEX[name]]),
  });
  return {
    html: field.html,
    source: field.source || field.cell,
    value: field.text,
  };
}

function appendField(parent, field, tagName, className) {
  if (!field.source && !field.value && !field.html) return null;

  const element = document.createElement(tagName);
  element.className = className;
  if (field.source) {
    moveInstrumentation(field.source, element);
    while (field.source.firstChild) element.append(field.source.firstChild);
  } else if (field.html) {
    element.innerHTML = field.html;
  } else {
    element.textContent = field.value;
  }

  if (!element.textContent.trim()) return null;
  parent.append(element);
  return element;
}

function buildItem(headingField, copyField) {
  const item = document.createElement('article');
  item.className = 'media-reporting-info-item';
  appendField(item, headingField, 'h3', 'media-reporting-info-item-heading');
  appendField(item, copyField, 'div', 'media-reporting-info-item-copy');
  return item.childElementCount ? item : null;
}

export default function decorate(block) {
  const headingField = getField(block, 'heading');
  const introField = getField(block, 'intro');
  const items = [
    buildItem(getField(block, 'itemOneHeading'), getRichField(block, 'itemOneCopy')),
    buildItem(getField(block, 'itemTwoHeading'), getRichField(block, 'itemTwoCopy')),
    buildItem(getField(block, 'itemThreeHeading'), getRichField(block, 'itemThreeCopy')),
  ].filter(Boolean);

  const inner = document.createElement('div');
  inner.className = 'media-reporting-info-inner';

  const header = document.createElement('div');
  header.className = 'media-reporting-info-header';
  appendField(header, headingField, 'h2', 'media-reporting-info-heading');
  appendField(header, introField, 'p', 'media-reporting-info-intro');
  if (header.childElementCount) inner.append(header);

  if (items.length) {
    const grid = document.createElement('div');
    grid.className = 'media-reporting-info-grid';
    items.forEach((item) => grid.append(item));
    inner.append(grid);
  }

  block.replaceChildren(inner);
}
