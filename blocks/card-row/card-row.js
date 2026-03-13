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

function buildCard(data, variant) {
  const card = document.createElement('div');
  card.className = 'card-row-card';
  if (data.row) moveInstrumentation(data.row, card);

  const cardBg = data.cardBg || '#ffffff';
  card.style.setProperty('background-color', cardBg, 'important');

  const content = document.createElement('div');
  content.className = 'card-row-card-content';

  if (data.logoField.img) {
    const logoWrap = document.createElement('div');
    logoWrap.className = 'card-row-card-logo';
    const img = data.logoField.img.cloneNode(true);
    if (data.logoField.source) moveInstrumentation(data.logoField.source, img);
    logoWrap.append(img);
    content.append(logoWrap);
  }

  if (variant === 'vertical' && (data.titleField.value || data.titleField.source)) {
    const h3 = document.createElement('h3');
    h3.className = 'card-row-card-title';
    if (data.titleField.source) {
      moveInstrumentation(data.titleField.source, h3);
      while (data.titleField.source.firstChild) h3.append(data.titleField.source.firstChild);
    } else {
      h3.textContent = data.titleField.value;
    }
    content.append(h3);
  }

  if (data.bodyField.value || data.bodyField.source) {
    const p = document.createElement('p');
    p.className = 'card-row-card-body';
    if (data.bodyField.source) {
      moveInstrumentation(data.bodyField.source, p);
      while (data.bodyField.source.firstChild) p.append(data.bodyField.source.firstChild);
    } else {
      p.textContent = data.bodyField.value;
    }
    content.append(p);
  }

  card.append(content);

  const btnLabel = data.buttonTextField.value || 'Learn More';
  const btnHref = data.buttonLinkField.value;
  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'card-row-card-button';
  btn.textContent = btnLabel;
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';
  if (data.buttonTextField.source) {
    moveInstrumentation(data.buttonTextField.source, btn);
  }

  const btnColor = data.buttonColor;
  const btnTextColor = data.buttonTextColor;
  if (btnColor) {
    btn.style.setProperty('background-color', btnColor, 'important');
    btn.style.setProperty('border', `2px solid ${btnColor}`, 'important');
  }
  if (btnTextColor) btn.style.setProperty('color', btnTextColor, 'important');

  card.append(btn);

  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const variantEl = block.querySelector('[data-aue-prop="variant"]');
  const variant = variantEl?.textContent.trim() || 'horizontal';

  const columnsEl = block.querySelector('[data-aue-prop="columns"]');
  const defaultCols = variant === 'vertical' ? 4 : 3;
  const columns = parseInt(columnsEl?.textContent.trim(), 10) || defaultCols;

  const cards = [];
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;

    const logoField = getImageField(row, 'logo', 0);
    const titleField = getField(row, 'title', 1);
    const bodyField = getField(row, 'bodyText', 2);
    const buttonTextField = getField(row, 'buttonText', 3);
    const buttonLinkField = getLinkField(row, 'buttonLink', 4);
    const buttonColorField = getField(row, 'buttonColor', 5);
    const buttonTextColorField = getField(row, 'buttonTextColor', 6);
    const cardBgField = getField(row, 'cardBackgroundColor', 7);

    cards.push({
      logoField,
      titleField,
      bodyField,
      buttonTextField,
      buttonLinkField,
      buttonColor: buttonColorField.value,
      buttonTextColor: buttonTextColorField.value,
      cardBg: cardBgField.value,
      row,
    });
  });

  const grid = document.createElement('div');
  grid.className = 'card-row-grid';
  grid.style.setProperty('--grid-columns', columns);

  block.classList.add(`card-row-${variant}`);

  cards.forEach((data) => {
    const card = buildCard(data, variant);
    grid.appendChild(card);
  });

  block.replaceChildren(grid);
}
