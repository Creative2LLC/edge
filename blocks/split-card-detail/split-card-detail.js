import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isItemRow(row) {
  return Boolean(
    row.querySelector('[data-aue-prop="icon"]')
      || row.querySelector('[data-aue-prop="title"]')
      || row.querySelector('[data-aue-prop="subtitle"]')
      || row.querySelector('[data-aue-prop="iconColor"]'),
  );
}

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
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

function buildIcon(content, iconField, iconColor) {
  if (!iconField.img) return;

  const color = iconColor || '#404041';
  const normalized = color.toLowerCase();
  const isWhite = normalized === '#ffffff' || normalized === '#fff' || normalized === 'white';

  if (isWhite) {
    const img = iconField.img.cloneNode(true);
    img.className = 'split-card-detail-card-icon';
    if (iconField.source) moveInstrumentation(iconField.source, img);
    img.style.setProperty('filter', 'brightness(0) invert(1)', 'important');
    content.append(img);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'split-card-detail-card-icon-wrap';
  wrap.style.setProperty('background-color', color, 'important');
  wrap.style.setProperty('-webkit-mask-image', `url(${iconField.img.src})`, 'important');
  wrap.style.setProperty('mask-image', `url(${iconField.img.src})`, 'important');
  wrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
  wrap.style.setProperty('mask-size', 'contain', 'important');
  wrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
  if (iconField.source) moveInstrumentation(iconField.source, wrap);
  content.append(wrap);
}

function moveFieldContent(field, target) {
  if (!field?.source) {
    target.textContent = field?.value || '';
    return;
  }
  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);
}

/* Border-radius per position in the 2x2 grid (TL TR BR BL) */
const RADII_4 = [
  '32px 8px 8px 8px', // top-left
  '8px 32px 8px 8px', // top-right
  '8px 8px 8px 32px', // bottom-left
  '8px 8px 32px 8px', // bottom-right
];

const RADII_3 = [
  '32px 8px 8px 8px', // top-left
  '8px 32px 8px 8px', // top-right
  '8px 8px 32px 32px', // bottom-left (alone on row)
];

const RADII_2 = [
  '32px 8px 8px 32px', // left (full left side)
  '8px 32px 32px 8px', // right (full right side)
];

const RADII_1 = ['32px'];

function getRadius(index, total) {
  if (total >= 4) return RADII_4[index] || '8px';
  if (total === 3) return RADII_3[index] || '8px';
  if (total === 2) return RADII_2[index] || '8px';
  return RADII_1[0];
}

function buildCard(data, index, total) {
  const card = document.createElement('div');
  card.className = 'split-card-detail-card';
  card.style.borderRadius = getRadius(index, total);
  if (data.row) moveInstrumentation(data.row, card);

  const hasVisibleContent = Boolean(
    data.iconField.img || data.titleField.value || data.subtitleField.value,
  );

  /* Authoring placeholder — empty item just added in the editor */
  if (!hasVisibleContent && data.isAuthoring) {
    card.classList.add('is-authoring-placeholder');
    const placeholder = document.createElement('p');
    placeholder.className = 'split-card-detail-card-placeholder';
    placeholder.textContent = 'Edit this card in the properties panel';
    card.append(placeholder);
    return card;
  }

  const content = document.createElement('div');
  content.className = 'split-card-detail-card-content';

  buildIcon(content, data.iconField, data.iconColor);

  if (data.titleField.value) {
    const h3 = document.createElement('h3');
    h3.className = 'split-card-detail-card-title';
    moveFieldContent(data.titleField, h3);
    content.append(h3);
  }

  if (data.subtitleField.value) {
    const p = document.createElement('p');
    p.className = 'split-card-detail-card-subtitle';
    moveFieldContent(data.subtitleField, p);
    content.append(p);
  }

  card.append(content);
  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  /* Block-level image */
  const imageEl = block.querySelector('[data-aue-prop="image"]');
  let picture = imageEl?.closest('picture')
    || imageEl?.querySelector('picture')
    || block.querySelector('picture');

  if (picture) {
    const img = picture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
      picture.replaceWith(optimized);
      picture = optimized;
    }
  }

  /* Collect card items — detect via AUE props OR column count */
  const cards = [];
  rows.forEach((row) => {
    const aueItem = isItemRow(row);
    const cols = [...row.children];
    const enoughCols = cols.length >= 2;

    if (!aueItem && !enoughCols) return;

    const iconField = getImageField(row, 'icon', 0);
    const titleField = getField(row, 'title', 1);
    const subtitleField = getField(row, 'subtitle', 2);
    const iconColorField = getField(row, 'iconColor', 3);

    const hasContent = iconField.img || titleField.value || subtitleField.value;
    const authoring = hasAuthoringContext(row);

    /* Keep the row if it has content OR is an authoring placeholder */
    if (!hasContent && !authoring) return;

    cards.push({
      iconField,
      titleField,
      subtitleField,
      iconColor: iconColorField.value,
      isAuthoring: authoring && !hasContent,
      row,
    });
  });

  const total = Math.min(cards.length, 4);

  /* Outer wrapper */
  const inner = document.createElement('div');
  inner.className = 'split-card-detail-inner';

  /* Left side — 2x2 card grid */
  const grid = document.createElement('div');
  grid.className = 'split-card-detail-grid';

  cards.slice(0, 4).forEach((data, i) => {
    grid.append(buildCard(data, i, total));
  });
  inner.append(grid);

  /* Right side — image */
  const media = document.createElement('div');
  media.className = 'split-card-detail-media';
  if (picture) media.append(picture);
  inner.append(media);

  block.replaceChildren(inner);
}
