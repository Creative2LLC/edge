import { moveInstrumentation } from '../../scripts/scripts.js';

function getPropText(row, prop) {
  const el = row.querySelector(`[data-aue-prop="${prop}"]`);
  return el?.textContent.trim() || '';
}

function getPropElement(row, prop) {
  return row.querySelector(`[data-aue-prop="${prop}"]`) || null;
}

function getPropLink(row, prop) {
  const el = row.querySelector(`[data-aue-prop="${prop}"]`);
  if (!el) return '';
  const a = el.querySelector('a');
  return a?.href || el.textContent.trim();
}

function parseCardRow(row) {
  const cols = [...row.children];
  if (cols.length < 2) return null;

  // Find image column
  let imgCol = null;
  for (let i = 0; i < cols.length; i += 1) {
    if (cols[i].querySelector('picture') || cols[i].querySelector('img')) {
      imgCol = cols[i];
      break;
    }
  }

  const iconImg = imgCol?.querySelector('img') || null;
  const iconSource = getPropElement(row, 'icon') || imgCol;

  return {
    iconImg,
    iconSource,
    title: getPropText(row, 'title'),
    titleSource: getPropElement(row, 'title'),
    subtitle: getPropText(row, 'subtitle'),
    subtitleSource: getPropElement(row, 'subtitle'),
    bodySource: getPropElement(row, 'bodyContent'),
    buttonText: getPropText(row, 'buttonText'),
    buttonTextSource: getPropElement(row, 'buttonText'),
    buttonLink: getPropLink(row, 'buttonLink'),
    cardBg: getPropText(row, 'cardBackgroundColor'),
    buttonBg: getPropText(row, 'buttonBackgroundColor'),
    row,
  };
}

function buildCard(data) {
  const card = document.createElement('div');
  card.className = 'info-cards-grid-card';
  if (data.row) moveInstrumentation(data.row, card);

  const cardBg = data.cardBg || '#1a1a2e';
  card.style.setProperty('background-color', cardBg, 'important');

  // Content wrapper (everything above button)
  const content = document.createElement('div');
  content.className = 'info-cards-grid-card-content';

  // Icon
  if (data.iconImg) {
    const img = data.iconImg.cloneNode(true);
    img.className = 'info-cards-grid-card-icon';
    if (data.iconSource) moveInstrumentation(data.iconSource, img);
    content.append(img);
  }

  // Title
  if (data.title || data.titleSource) {
    const h3 = document.createElement('h3');
    h3.className = 'info-cards-grid-card-title';
    if (data.titleSource) {
      moveInstrumentation(data.titleSource, h3);
      while (data.titleSource.firstChild) h3.append(data.titleSource.firstChild);
    } else {
      h3.textContent = data.title;
    }
    content.append(h3);
  }

  // Subtitle
  if (data.subtitle || data.subtitleSource) {
    const p = document.createElement('p');
    p.className = 'info-cards-grid-card-subtitle';
    if (data.subtitleSource) {
      moveInstrumentation(data.subtitleSource, p);
      while (data.subtitleSource.firstChild) p.append(data.subtitleSource.firstChild);
    } else {
      p.textContent = data.subtitle;
    }
    content.append(p);
  }

  // Body content (richtext — could be paragraph, ul, or ol)
  if (data.bodySource) {
    const body = document.createElement('div');
    body.className = 'info-cards-grid-card-body';
    moveInstrumentation(data.bodySource, body);
    while (data.bodySource.firstChild) body.append(data.bodySource.firstChild);
    content.append(body);
  }

  card.append(content);

  // Button
  const btnLabel = data.buttonText || 'Learn More';
  const btnHref = data.buttonLink;
  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'info-cards-grid-card-button';
  btn.textContent = btnLabel;
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';
  if (data.buttonTextSource) {
    moveInstrumentation(data.buttonTextSource, btn);
  }

  if (data.buttonBg) {
    // User provided a button background color
    btn.style.setProperty('background-color', data.buttonBg, 'important');
    // Button text color = card background color
    btn.style.setProperty('color', cardBg, 'important');
    btn.style.setProperty('border', 'none', 'important');
  } else {
    // No button background — transparent with white border
    btn.style.setProperty('background-color', cardBg, 'important');
    btn.style.setProperty('color', '#ffffff', 'important');
    btn.style.setProperty('border', '2px solid #ffffff', 'important');
  }

  card.append(btn);

  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  // Get columns setting from block-level model
  const columnsEl = block.querySelector('[data-aue-prop="columns"]');
  const columnsValue = columnsEl?.textContent.trim() || '3';
  const columns = parseInt(columnsValue, 10) || 3;

  // Parse card rows
  const cards = [];
  rows.forEach((row) => {
    const card = parseCardRow(row);
    if (card) cards.push(card);
  });

  // Build grid
  const grid = document.createElement('div');
  grid.className = 'info-cards-grid-inner';
  grid.style.setProperty('--grid-columns', columns);

  cards.forEach((data) => {
    const card = buildCard(data);
    grid.appendChild(card);
  });

  block.replaceChildren(grid);
}
