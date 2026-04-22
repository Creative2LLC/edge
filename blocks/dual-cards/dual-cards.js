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

function buildIcon(iconField, iconColor) {
  if (!iconField.img) return null;

  const color = (iconColor || '').trim();
  const normalized = color.toLowerCase();
  const isWhite = normalized === '#ffffff' || normalized === '#fff' || normalized === 'white';

  if (!color) {
    const img = iconField.img.cloneNode(true);
    img.className = 'dual-cards-icon';
    if (iconField.source) moveInstrumentation(iconField.source, img);
    return img;
  }

  if (isWhite) {
    const img = iconField.img.cloneNode(true);
    img.className = 'dual-cards-icon';
    img.style.setProperty('filter', 'brightness(0) invert(1)', 'important');
    if (iconField.source) moveInstrumentation(iconField.source, img);
    return img;
  }

  const wrap = document.createElement('div');
  wrap.className = 'dual-cards-icon dual-cards-icon-masked';
  wrap.style.setProperty('background-color', color, 'important');
  wrap.style.setProperty('-webkit-mask-image', `url(${iconField.img.src})`, 'important');
  wrap.style.setProperty('mask-image', `url(${iconField.img.src})`, 'important');
  wrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
  wrap.style.setProperty('mask-size', 'contain', 'important');
  wrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('-webkit-mask-position', 'left center', 'important');
  wrap.style.setProperty('mask-position', 'left center', 'important');
  if (iconField.source) moveInstrumentation(iconField.source, wrap);
  return wrap;
}

function buildCard(row) {
  const iconField = getImageField(row, 'icon', 0);
  const iconColorField = getField(row, 'iconColor', 1);
  const titleField = getField(row, 'title', 2);
  const buttonTextField = getField(row, 'buttonText', 3);
  const buttonLinkField = getLinkField(row, 'buttonLink', 4);

  const card = document.createElement('div');
  card.className = 'dual-cards-card';
  moveInstrumentation(row, card);

  const icon = buildIcon(iconField, iconColorField.value);
  if (icon) card.append(icon);

  if (titleField.value || titleField.source) {
    const h3 = document.createElement('h3');
    h3.className = 'dual-cards-title';
    if (titleField.source) {
      moveInstrumentation(titleField.source, h3);
      while (titleField.source.firstChild) h3.append(titleField.source.firstChild);
    } else {
      h3.textContent = titleField.value;
    }
    card.append(h3);
  }

  const btnLabel = buttonTextField.value;
  const btnHref = buttonLinkField.value;
  if (btnLabel || btnHref) {
    const link = document.createElement(btnHref ? 'a' : 'button');
    link.className = 'dual-cards-link';
    link.textContent = btnLabel || 'Learn More';
    if (btnHref) link.href = btnHref;
    if (!btnHref) link.type = 'button';
    if (buttonTextField.source) moveInstrumentation(buttonTextField.source, link);
    if (buttonLinkField.source && buttonLinkField.source !== buttonTextField.source) {
      moveInstrumentation(buttonLinkField.source, link);
    }
    card.append(link);
  }

  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const grid = document.createElement('div');
  grid.className = 'dual-cards-grid';

  rows.forEach((row) => {
    grid.append(buildCard(row));
  });

  block.replaceChildren(grid);
}
