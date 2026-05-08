import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import { readImageField, readTextField } from '../../scripts/block-field-utils.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
};

function collectLegacyBlockFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(LEGACY_BLOCK_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      map[name] = valueEl.textContent.trim();
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getBlockField(block, legacyMap, name) {
  const field = readTextField(block, name);
  const { source } = field;
  if (source) {
    const { value } = field;
    source.remove();
    return value;
  }
  return legacyMap[name] || '';
}

function parseItemRow(row) {
  const cols = [...row.children];

  function getImageData(field) {
    const { picture, img } = field;
    return {
      picture,
      src: img?.src || '',
      alt: img?.alt || '',
    };
  }

  const hasItemProps = row.querySelector('[data-aue-prop="image"], [data-aue-prop="icon"], [data-aue-prop="title"]');

  // 5-column layout: image | icon | iconColor | title | description
  if (hasItemProps || cols.length >= 5) {
    const imageData = getImageData(readImageField(row, 'image', { fallbackCell: cols[0] }));
    const iconData = getImageData(readImageField(row, 'icon', { fallbackCell: cols[1] }));
    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: iconData.picture,
      iconSrc: iconData.src,
      iconColor: readTextField(row, 'iconColor', { fallbackCell: cols[2] }).value,
      title: readTextField(row, 'title', { fallbackCell: cols[3] }).value,
      description: readTextField(row, 'description', { fallbackCell: cols[4] }).value,
    };
  }

  // Minimal fallback: 2 columns (image | text)
  if (cols.length >= 2) {
    const imageData = getImageData(readImageField(row, 'image', { fallbackCell: cols[0] }));
    const paragraphs = cols[1].querySelectorAll('p');
    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: null,
      iconSrc: '',
      iconColor: '',
      title: paragraphs[0]?.textContent.trim() || '',
      description: paragraphs[1]?.textContent.trim() || '',
    };
  }

  return null;
}

function buildItemCard(item, row, index) {
  const card = document.createElement('div');
  card.className = 'impact-chain-item';
  card.dataset.index = index;
  if (row) moveInstrumentation(row, card);

  // Image
  if (item.imagePicture) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'impact-chain-item-image';
    imageWrap.append(item.imagePicture);
    const img = item.imagePicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '400' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      item.imagePicture.replaceWith(optimized);
    }
    card.append(imageWrap);
  } else if (item.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'impact-chain-item-image';
    const pic = createOptimizedPicture(item.imgSrc, item.imageAlt, false, [{ width: '400' }]);
    imageWrap.append(pic);
    card.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'impact-chain-item-content';

  // Icon with mask-image coloring
  if (item.iconPicture || item.iconSrc) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'impact-chain-item-icon';
    if (item.iconColor) {
      const iconImg = item.iconPicture?.querySelector('img');
      const src = iconImg?.src || item.iconSrc;
      if (src) {
        iconWrap.style.maskImage = `url(${src})`;
        iconWrap.style.webkitMaskImage = `url(${src})`;
        iconWrap.style.backgroundColor = item.iconColor;
      }
    } else if (item.iconPicture) {
      iconWrap.append(item.iconPicture);
    } else {
      const iconImg = document.createElement('img');
      iconImg.src = item.iconSrc;
      iconImg.alt = '';
      iconImg.loading = 'lazy';
      iconWrap.append(iconImg);
    }
    content.append(iconWrap);
  }

  // Title
  if (item.title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'impact-chain-item-title';
    titleEl.textContent = item.title;
    content.append(titleEl);
  }

  // Description
  if (item.description) {
    const desc = document.createElement('p');
    desc.className = 'impact-chain-item-description';
    desc.textContent = item.description;
    content.append(desc);
  }

  card.append(content);
  return card;
}

export default function decorate(block) {
  const legacyMap = collectLegacyBlockFields(block);
  const heading = getBlockField(block, legacyMap, 'heading');

  // Remaining rows are chain items
  const rows = [...block.querySelectorAll(':scope > div')];
  const items = [];
  rows.forEach((row) => {
    const item = parseItemRow(row);
    if (item) items.push({ data: item, row });
  });

  const inner = document.createElement('div');
  inner.className = 'impact-chain-inner';

  // Heading
  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'impact-chain-heading';
    h2.textContent = heading;
    inner.append(h2);
  }

  // Items container
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'impact-chain-items';

  items.forEach(({ data, row }, index) => {
    const card = buildItemCard(data, row, index);
    itemsContainer.append(card);
  });

  inner.append(itemsContainer);
  block.replaceChildren(inner);
}
