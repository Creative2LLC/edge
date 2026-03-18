import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

function getFieldText(row, colIndex, propName) {
  const byProp = row.querySelector(`[data-aue-prop="${propName}"]`);
  if (byProp) return byProp.textContent.trim();
  const cols = [...row.children];
  if (cols[colIndex]) return cols[colIndex].textContent.trim();
  return '';
}

function getImageData(col) {
  if (!col) return { picture: null, src: '', alt: '' };
  const picture = col.querySelector('picture');
  const img = col.querySelector('img');
  return {
    picture,
    src: img?.src || '',
    alt: img?.alt || '',
  };
}

function parseRow(row) {
  const cols = [...row.children];
  if (cols.length < 2) return null;

  const imageData = getImageData(cols[0]);
  return {
    imagePicture: imageData.picture,
    imgSrc: imageData.src,
    imageAlt: imageData.alt,
    title: getFieldText(row, 1, 'title'),
    description: getFieldText(row, 2, 'description'),
  };
}

function buildRow(data, row) {
  const card = document.createElement('div');
  card.className = 'product-resource-list-row';
  if (row) moveInstrumentation(row, card);

  // Image
  if (data.imagePicture || data.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'product-resource-list-image';

    if (data.imagePicture) {
      imageWrap.append(data.imagePicture);
      const img = data.imagePicture.querySelector('img');
      if (img) {
        const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '432' }]);
        moveInstrumentation(img, optimized.querySelector('img'));
        data.imagePicture.replaceWith(optimized);
      }
    } else {
      const pic = createOptimizedPicture(data.imgSrc, data.imageAlt, false, [{ width: '432' }]);
      imageWrap.append(pic);
    }

    card.append(imageWrap);
  }

  // Content card
  const content = document.createElement('div');
  content.className = 'product-resource-list-content';

  if (data.title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'product-resource-list-title';
    titleEl.textContent = data.title;
    content.append(titleEl);
  }

  if (data.description) {
    const descEl = document.createElement('p');
    descEl.className = 'product-resource-list-description';
    descEl.textContent = data.description;
    content.append(descEl);
  }

  card.append(content);
  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const container = document.createElement('div');
  container.className = 'product-resource-list-container';

  rows.forEach((row) => {
    const data = parseRow(row);
    if (data) container.append(buildRow(data, row));
  });

  block.replaceChildren(container);
}
