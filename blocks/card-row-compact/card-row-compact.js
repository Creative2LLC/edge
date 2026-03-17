import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return { source: null, value: anchor?.href || cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getImageField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return { source, img };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const img = cols[index].querySelector('img');
    return { source: null, img: img || null };
  }
  return { source: null, img: null };
}

function buildCard(data) {
  const card = document.createElement('div');
  card.className = 'card-row-compact-card';
  if (data.row) moveInstrumentation(data.row, card);

  const cardBg = data.cardBg || '#ffffff';
  card.style.setProperty('background-color', cardBg, 'important');

  const content = document.createElement('div');
  content.className = 'card-row-compact-card-content';

  // Icon — use mask-image technique when iconColor is set
  if (data.iconField.img) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'card-row-compact-card-icon';
    if (data.iconColor) {
      const { src } = data.iconField.img;
      if (src) {
        iconWrap.style.maskImage = `url(${src})`;
        iconWrap.style.webkitMaskImage = `url(${src})`;
        iconWrap.style.backgroundColor = data.iconColor;
      }
    } else {
      const img = data.iconField.img.cloneNode(true);
      if (data.iconField.source) moveInstrumentation(data.iconField.source, img);
      iconWrap.append(img);
    }
    content.append(iconWrap);
  }

  // Title
  if (data.titleField.value || data.titleField.source) {
    const h3 = document.createElement('h3');
    h3.className = 'card-row-compact-card-title';
    if (data.titleField.source) {
      moveInstrumentation(data.titleField.source, h3);
      while (data.titleField.source.firstChild) h3.append(data.titleField.source.firstChild);
    } else {
      h3.textContent = data.titleField.value;
    }
    content.append(h3);
  }

  // Subheading
  if (data.subheadingField.value || data.subheadingField.source) {
    const p = document.createElement('p');
    p.className = 'card-row-compact-card-subheading';
    if (data.subheadingField.source) {
      moveInstrumentation(data.subheadingField.source, p);
      const { source } = data.subheadingField;
      while (source.firstChild) p.append(source.firstChild);
    } else {
      p.textContent = data.subheadingField.value;
    }
    content.append(p);
  }

  // Link
  const linkText = data.linkTextField.value;
  const linkHref = data.linkUrlField.value;
  if (linkText) {
    const link = document.createElement(linkHref ? 'a' : 'span');
    link.className = 'card-row-compact-card-link';
    link.textContent = linkText;
    if (linkHref) link.href = linkHref;
    if (data.linkColor) link.style.color = data.linkColor;
    if (data.linkTextField.source) moveInstrumentation(data.linkTextField.source, link);
    content.append(link);
  }

  card.append(content);
  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const columnsEl = block.querySelector('[data-aue-prop="columns"]');
  const columns = parseInt(columnsEl?.textContent.trim(), 10) || 4;

  const alignmentEl = block.querySelector('[data-aue-prop="alignment"]');
  const alignment = alignmentEl?.textContent.trim() || 'left';

  const cards = [];
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;

    const iconField = getImageField(row, 'icon', 0);
    const iconColorField = getField(row, 'iconColor', 1);
    const titleField = getField(row, 'title', 2);
    const subheadingField = getField(row, 'subheading', 3);
    const linkTextField = getField(row, 'linkText', 4);
    const linkUrlField = getLinkField(row, 'linkUrl', 5);
    const linkColorField = getField(row, 'linkColor', 6);
    const cardBgField = getField(row, 'cardBackgroundColor', 7);

    cards.push({
      iconField,
      iconColor: iconColorField.value,
      titleField,
      subheadingField,
      linkTextField,
      linkUrlField,
      linkColor: linkColorField.value,
      cardBg: cardBgField.value,
      row,
    });
  });

  const grid = document.createElement('div');
  grid.className = 'card-row-compact-grid';
  grid.style.setProperty('--grid-columns', columns);

  block.classList.add(`card-row-compact-align-${alignment}`);

  cards.forEach((data) => {
    const card = buildCard(data);
    grid.appendChild(card);
  });

  block.replaceChildren(grid);
}
