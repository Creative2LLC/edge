import { moveInstrumentation } from '../../scripts/scripts.js';

function hasMeaningfulNodeContent(node) {
  if (!node) return false;
  if (node.textContent.trim()) return true;
  return Boolean(node.querySelector('img, picture, video, iframe, svg, ul, ol, li, a, button'));
}

function hasFieldContent(field) {
  return Boolean(field?.value || hasMeaningfulNodeContent(field?.source));
}

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

function getRichField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source;
  const cols = [...row.children];
  return cols[index] || null;
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

function moveFieldContent(field, target) {
  if (!field?.source) {
    target.textContent = field?.value || '';
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);
}

function buildTitle(content, data) {
  if (!hasFieldContent(data.titleField)) return;

  const h3 = document.createElement('h3');
  h3.className = 'info-cards-grid-card-title';
  if (data.textColor) h3.style.color = data.textColor;
  moveFieldContent(data.titleField, h3);
  if (!h3.textContent.trim()) return;
  content.append(h3);
}

function buildSubtitle(content, data) {
  if (!hasFieldContent(data.subtitleField)) return;

  const p = document.createElement('p');
  p.className = 'info-cards-grid-card-subtitle';
  if (data.textColor) p.style.color = data.textColor;
  moveFieldContent(data.subtitleField, p);
  if (!p.textContent.trim()) return;
  content.append(p);
}

function buildBody(content, data) {
  if (!hasMeaningfulNodeContent(data.bodySource)) return;

  const body = document.createElement('div');
  body.className = 'info-cards-grid-card-body';
  if (data.textColor) body.style.color = data.textColor;
  moveInstrumentation(data.bodySource, body);
  while (data.bodySource.firstChild) body.append(data.bodySource.firstChild);
  if (!hasMeaningfulNodeContent(body)) return;
  content.append(body);
}

function buildButton(card, data, cardBg) {
  const btnLabel = data.buttonTextField.value;
  const btnHref = data.buttonLinkField.value;
  if (!btnLabel && !btnHref) return;

  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'info-cards-grid-card-button';
  btn.textContent = btnLabel || 'Learn More';
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';
  if (data.buttonTextField.source) moveInstrumentation(data.buttonTextField.source, btn);

  if (data.buttonBg) {
    btn.style.setProperty('background-color', data.buttonBg, 'important');
    btn.style.setProperty('color', cardBg, 'important');
    btn.style.setProperty('border', 'none', 'important');
  } else {
    btn.style.setProperty('background-color', cardBg, 'important');
    btn.style.setProperty('color', '#ffffff', 'important');
    btn.style.setProperty('border', '2px solid #ffffff', 'important');
  }

  card.append(btn);
}

function buildIcon(content, data) {
  if (!data.iconField.img) return;

  const iconColor = data.iconColor || '#ffffff';
  const normalizedColor = iconColor.toLowerCase();
  const isWhite = normalizedColor === '#ffffff'
    || normalizedColor === '#fff'
    || normalizedColor === 'white';

  if (isWhite) {
    const img = data.iconField.img.cloneNode(true);
    img.className = 'info-cards-grid-card-icon';
    if (data.iconField.source) moveInstrumentation(data.iconField.source, img);
    img.style.setProperty('filter', 'brightness(0) invert(1)', 'important');
    content.append(img);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'info-cards-grid-card-icon-wrap';
  wrap.style.setProperty('background-color', iconColor, 'important');
  wrap.style.setProperty('-webkit-mask-image', `url(${data.iconField.img.src})`, 'important');
  wrap.style.setProperty('mask-image', `url(${data.iconField.img.src})`, 'important');
  wrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
  wrap.style.setProperty('mask-size', 'contain', 'important');
  wrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
  if (data.iconField.source) moveInstrumentation(data.iconField.source, wrap);
  content.append(wrap);
}

function buildCard(data, index) {
  const card = document.createElement('div');
  card.className = 'info-cards-grid-card';
  card.style.setProperty('--info-card-index', index);
  if (data.row) moveInstrumentation(data.row, card);

  const cardBg = data.cardBg || '#1a1a2e';
  card.style.setProperty('background-color', cardBg, 'important');

  if (data.overlayField?.img) {
    const overlay = document.createElement('div');
    overlay.className = 'info-cards-grid-card-overlay';
    const img = data.overlayField.img.cloneNode(true);
    if (data.overlayField.source) moveInstrumentation(data.overlayField.source, img);
    overlay.append(img);
    card.append(overlay);
  }

  const content = document.createElement('div');
  content.className = 'info-cards-grid-card-content';

  buildIcon(content, data);
  buildTitle(content, data);
  buildSubtitle(content, data);
  buildBody(content, data);

  card.append(content);
  buildButton(card, data, cardBg);

  return card;
}

function observeReveal(block) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    block.classList.add('is-visible');
    observer.disconnect();
  }, { threshold: 0.18 });

  observer.observe(block);
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const columnsEl = block.querySelector('[data-aue-prop="columns"]');
  const columnsValue = columnsEl?.textContent.trim() || '3';
  const columns = parseInt(columnsValue, 10) || 3;

  const cards = [];
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;

    const iconField = getImageField(row, 'icon', 0);
    const titleField = getField(row, 'title', 1);
    const subtitleField = getField(row, 'subtitle', 2);
    const bodySource = getRichField(row, 'bodyContent', 3);
    const buttonTextField = getField(row, 'buttonText', 4);
    const buttonLinkField = getLinkField(row, 'buttonLink', 5);
    const cardBgField = getField(row, 'cardBackgroundColor', 6);
    const buttonBgField = getField(row, 'buttonBackgroundColor', 7);
    const iconColorField = getField(row, 'iconColor', 8);
    const textColorField = getField(row, 'textColor', 9);
    const overlayField = getImageField(row, 'overlayImage', 10);

    cards.push({
      iconField,
      titleField,
      subtitleField,
      bodySource,
      buttonTextField,
      buttonLinkField,
      cardBg: cardBgField.value,
      buttonBg: buttonBgField.value,
      iconColor: iconColorField.value,
      textColor: textColorField.value,
      overlayField,
      row,
    });
  });

  const grid = document.createElement('div');
  grid.className = 'info-cards-grid-inner';
  grid.style.setProperty('--grid-columns', columns);

  cards.forEach((data, index) => {
    grid.append(buildCard(data, index));
  });

  block.replaceChildren(grid);
  observeReveal(block);
}
