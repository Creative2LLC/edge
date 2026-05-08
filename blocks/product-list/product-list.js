import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

function getFieldText(row, colIndex, propName) {
  return readTextField(row, propName, { fallbackCell: row.children[colIndex] }).value;
}

function getFieldHtml(row, colIndex, propName) {
  return readRichTextField(row, propName, { fallbackCell: row.children[colIndex] }).html;
}

function getImageData(row, colIndex) {
  const { picture, img } = readImageField(row, 'image', { fallbackCell: row.children[colIndex] });
  return {
    picture,
    src: img?.src || '',
    alt: img?.alt || '',
  };
}

function parseRow(row) {
  const cols = [...row.children];
  if (cols.length < 2) return null;

  const imageData = getImageData(row, 0);
  return {
    imagePicture: imageData.picture,
    imgSrc: imageData.src,
    imageAlt: imageData.alt,
    title: getFieldText(row, 1, 'title'),
    description: getFieldHtml(row, 2, 'description'),
  };
}

function buildCard(data, row) {
  const card = document.createElement('div');
  card.className = 'product-list-card';
  if (row) moveInstrumentation(row, card);

  // Image side
  if (data.imagePicture || data.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'product-list-card-image';

    if (data.imagePicture) {
      imageWrap.append(data.imagePicture);
      const img = data.imagePicture.querySelector('img');
      if (img) {
        const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '500' }]);
        moveInstrumentation(img, optimized.querySelector('img'));
        data.imagePicture.replaceWith(optimized);
      }
    } else {
      const pic = createOptimizedPicture(data.imgSrc, data.imageAlt, false, [{ width: '500' }]);
      imageWrap.append(pic);
    }

    card.append(imageWrap);
  }

  // Text side
  const content = document.createElement('div');
  content.className = 'product-list-card-content';

  if (data.title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'product-list-card-title';
    titleEl.textContent = data.title;
    content.append(titleEl);
  }

  if (data.description) {
    const descEl = document.createElement('div');
    descEl.className = 'product-list-card-description';
    descEl.innerHTML = data.description;
    content.append(descEl);
  }

  card.append(content);
  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const container = document.createElement('div');
  container.className = 'product-list-inner';

  rows.forEach((row) => {
    const data = parseRow(row);
    if (data) container.append(buildCard(data, row));
  });

  block.replaceChildren(container);
}
