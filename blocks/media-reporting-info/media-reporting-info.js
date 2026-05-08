import { moveInstrumentation } from '../../scripts/scripts.js';
import { readTextField } from '../../scripts/block-field-utils.js';

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

function getField(block, name) {
  const field = readTextField(block, name, {
    rowIndex: 0,
    columnIndex: FIELD_INDEX[name],
  });
  return {
    source: field.source || field.cell,
    value: field.value,
  };
}

function appendField(parent, field, tagName, className) {
  if (!field.source && !field.value) return null;

  const element = document.createElement(tagName);
  element.className = className;
  if (field.source) {
    moveInstrumentation(field.source, element);
    while (field.source.firstChild) element.append(field.source.firstChild);
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
    buildItem(getField(block, 'itemOneHeading'), getField(block, 'itemOneCopy')),
    buildItem(getField(block, 'itemTwoHeading'), getField(block, 'itemTwoCopy')),
    buildItem(getField(block, 'itemThreeHeading'), getField(block, 'itemThreeCopy')),
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
