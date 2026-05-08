import { moveInstrumentation } from '../../scripts/scripts.js';
import { readImageField, readTextField } from '../../scripts/block-field-utils.js';

function getField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function getImageField(row, name, index) {
  const field = readImageField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source || field.cell, img: field.img };
}

function buildCard(data) {
  const card = document.createElement('div');
  card.className = 'icon-text-row-card';
  if (data.row) moveInstrumentation(data.row, card);

  // Icon
  if (data.iconField.img) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'icon-text-row-icon';
    const img = data.iconField.img.cloneNode(true);
    if (data.iconField.source) moveInstrumentation(data.iconField.source, img);
    const color = data.iconColor || '#008DB6';
    const imgSrc = img.src || img.currentSrc;
    if (imgSrc) {
      iconWrap.style.setProperty('background-color', color);
      iconWrap.style.setProperty('-webkit-mask-image', `url('${imgSrc}')`);
      iconWrap.style.setProperty('mask-image', `url('${imgSrc}')`);
      img.style.visibility = 'hidden';
    }
    iconWrap.append(img);
    card.append(iconWrap);
  }

  // Text
  if (data.textField.value || data.textField.source) {
    const p = document.createElement('p');
    p.className = 'icon-text-row-text';
    if (data.textField.source) {
      moveInstrumentation(data.textField.source, p);
      while (data.textField.source.firstChild) p.append(data.textField.source.firstChild);
    } else {
      p.textContent = data.textField.value;
    }
    card.append(p);
  }

  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const cards = [];
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;

    const iconField = getImageField(row, 'icon', 0);
    const textField = getField(row, 'cardText', 1);
    const iconColorField = getField(row, 'iconColor', 2);

    cards.push({
      iconField,
      textField,
      iconColor: iconColorField.value,
      row,
    });
  });

  const grid = document.createElement('div');
  grid.className = 'icon-text-row-grid';

  cards.forEach((data) => {
    const card = buildCard(data);
    grid.appendChild(card);
  });

  block.replaceChildren(grid);
}
