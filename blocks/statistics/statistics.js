import { moveInstrumentation } from '../../scripts/scripts.js';

function buildItem(row) {
  const item = document.createElement('li');
  item.className = 'statistics-item';
  moveInstrumentation(row, item);

  const cells = [...row.children];
  const valueCell = cells[0];
  const labelCell = cells[1];

  if (valueCell) {
    const value = document.createElement('div');
    value.className = 'statistics-value';
    moveInstrumentation(valueCell, value);
    while (valueCell.firstChild) value.append(valueCell.firstChild);
    if (value.childNodes.length) item.append(value);
  }

  if (labelCell) {
    const label = document.createElement('div');
    label.className = 'statistics-label';
    moveInstrumentation(labelCell, label);
    while (labelCell.firstChild) label.append(labelCell.firstChild);
    if (label.childNodes.length) item.append(label);
  }

  return item;
}

export default function decorate(block) {
  if (document.querySelector('meta[name="urn:adobe:aue:config"]')) {
    return;
  }
  const list = document.createElement('ul');
  list.className = 'statistics-list';

  [...block.children].forEach((row) => {
    const item = buildItem(row);
    if (item.childNodes.length) list.append(item);
  });

  block.replaceChildren(list);
}
