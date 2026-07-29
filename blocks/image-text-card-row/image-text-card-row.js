import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField, readLinkField, readTextField, setItemLabel,
} from '../../scripts/block-field-utils.js';

function getFieldText(row, colIndex, propName) {
  return readTextField(row, propName, { fallbackCell: row.children[colIndex] }).value;
}

function getImageData(row, propName, colIndex) {
  const { picture, img } = readImageField(row, propName, {
    fallbackCell: row.children[colIndex],
  });
  return {
    picture,
    src: img?.src || '',
    alt: img?.alt || '',
  };
}

function getLinkUrl(row, propName, colIndex) {
  return readLinkField(row, propName, { fallbackCell: row.children[colIndex] }).value;
}

const IMAGE_STYLE_VALUES = new Set(['default', 'small']);
const IMAGE_ALIGN_VALUES = new Set(['left', 'center', 'right']);

function readSingleCellValue(row) {
  if (!row || row.children.length !== 1) return '';
  return row.children[0].textContent.trim().toLowerCase();
}

function readPublishedSettings(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const firstCardIndex = rows.findIndex((row) => row.children.length >= 6);
  const settingsRows = firstCardIndex >= 0 ? rows.slice(0, firstCardIndex) : rows;
  const settings = {};
  const consumedRows = [];

  settingsRows.forEach((row) => {
    if (row.querySelector('[data-aue-prop]')) return;

    const value = readSingleCellValue(row);
    if (!value) return;

    if (!settings.columns && /^[1-3]$/.test(value)) {
      settings.columns = Number(value);
      consumedRows.push(row);
      return;
    }

    if (!settings.imageStyle && IMAGE_STYLE_VALUES.has(value)) {
      settings.imageStyle = value;
      consumedRows.push(row);
      return;
    }

    if (!settings.imageAlign && IMAGE_ALIGN_VALUES.has(value)) {
      settings.imageAlign = value;
      consumedRows.push(row);
    }
  });

  return { settings, consumedRows };
}

function parseCardRow(row) {
  const cols = [...row.children];

  // 8-column layout: image | icon | iconColor | title | subtitle | bodyText | linkText | linkUrl
  if (cols.length >= 6) {
    const imageData = getImageData(row, 'image', 0);
    const iconData = getImageData(row, 'icon', 1);
    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: iconData.picture,
      iconSrc: iconData.src,
      iconColor: getFieldText(row, 2, 'iconColor'),
      title: getFieldText(row, 3, 'title'),
      subtitle: getFieldText(row, 4, 'subtitle'),
      bodyText: getFieldText(row, 5, 'bodyText'),
      linkText: getFieldText(row, 6, 'linkText'),
      linkUrl: getLinkUrl(row, 'linkUrl', 7),
      cardContentBg: getFieldText(row, 8, 'cardContentBg'),
      // Author-facing image ALT: read by name with positional fallback at last cell (index 9)
      imageAltText: getFieldText(row, 9, 'imageAlt'),
    };
  }

  // Minimal fallback: 2 columns (image | text)
  if (cols.length >= 2) {
    const imageData = getImageData(row, 'image', 0);
    const paragraphs = cols[1].querySelectorAll('p');
    const link = cols[1].querySelector('a');
    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: null,
      iconSrc: '',
      iconColor: '',
      title: paragraphs[0]?.textContent.trim() || '',
      subtitle: paragraphs[1]?.textContent.trim() || '',
      bodyText: paragraphs[2]?.textContent.trim() || '',
      linkUrl: link?.href || '',
      linkText: '',
      cardContentBg: '',
    };
  }

  return null;
}

function buildCard(data, row) {
  const card = document.createElement('div');
  card.className = 'image-text-card-row-card';
  if (row) {
    moveInstrumentation(row, card);
    // Label the item in the Universal Editor content tree by its content (title first,
    // then subtitle/body) so authors can identify cards without opening each one.
    setItemLabel(card, [data.title, data.subtitle, data.bodyText]);
  }

  // Image — always covers the full top area
  if (data.imagePicture || data.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'image-text-card-row-card-image';

    if (data.imagePicture) {
      imageWrap.append(data.imagePicture);
      const img = data.imagePicture.querySelector('img');
      if (img) {
        // Prefer the author-facing ALT, keep the source image alt as fallback
        const altVal = data.imageAltText || img.alt || '';
        const optimized = createOptimizedPicture(img.src, altVal, false, [{ width: '400' }]);
        moveInstrumentation(img, optimized.querySelector('img'));
        data.imagePicture.replaceWith(optimized);
      }
    } else {
      // Prefer the author-facing ALT, keep the source image alt as fallback
      const altVal = data.imageAltText || data.imageAlt || '';
      const pic = createOptimizedPicture(data.imgSrc, altVal, false, [{ width: '400' }]);
      imageWrap.append(pic);
    }

    card.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'image-text-card-row-card-content';
  content.style.backgroundColor = data.cardContentBg || '#DDD5CC52';

  // Icon (optional)
  if (data.iconPicture || data.iconSrc) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'image-text-card-row-card-icon';
    if (data.iconColor) {
      const iconImg = data.iconPicture?.querySelector('img');
      const src = iconImg?.src || data.iconSrc;
      if (src) {
        iconWrap.style.maskImage = `url(${src})`;
        iconWrap.style.webkitMaskImage = `url(${src})`;
        iconWrap.style.backgroundColor = data.iconColor;
      }
    } else if (data.iconPicture) {
      iconWrap.append(data.iconPicture);
    } else {
      const iconImg = document.createElement('img');
      iconImg.src = data.iconSrc;
      iconImg.alt = '';
      iconImg.loading = 'lazy';
      iconWrap.append(iconImg);
    }
    content.append(iconWrap);
  }

  // Title
  if (data.title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'image-text-card-row-card-title';
    titleEl.textContent = data.title;
    content.append(titleEl);
  }

  // Subtitle
  if (data.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'image-text-card-row-card-subtitle';
    sub.textContent = data.subtitle;
    content.append(sub);
  }

  // Body text
  if (data.bodyText) {
    const body = document.createElement('p');
    body.className = 'image-text-card-row-card-body';
    body.textContent = data.bodyText;
    content.append(body);
  }

  // Link / button (optional)
  if (data.linkUrl) {
    const link = document.createElement('a');
    link.className = 'image-text-card-row-card-link';
    link.href = data.linkUrl;
    link.textContent = data.linkText || 'Learn More';
    content.append(link);
  }

  card.append(content);
  return card;
}

function directRowOf(block, el) {
  let cur = el;
  while (cur && cur.parentElement && cur.parentElement !== block) {
    cur = cur.parentElement;
  }
  return cur && cur.parentElement === block ? cur : null;
}

export default function decorate(block) {
  const { settings, consumedRows } = readPublishedSettings(block);

  // Read columns setting
  const columnsProp = block.querySelector('[data-aue-prop="columns"]');
  let columns = settings.columns || 3;
  if (columnsProp) {
    const val = columnsProp.textContent.trim();
    if (val && !Number.isNaN(Number(val))) columns = Number(val);
    directRowOf(block, columnsProp)?.remove();
  }

  // Read image style setting (default = current behavior, small = 141x183 top-left)
  const imageStyleProp = block.querySelector('[data-aue-prop="imageStyle"]');
  let imageStyle = settings.imageStyle || 'default';
  if (imageStyleProp) {
    const val = imageStyleProp.textContent.trim().toLowerCase();
    if (val === 'small') imageStyle = 'small';
    directRowOf(block, imageStyleProp)?.remove();
  }

  // Read image alignment setting (left / center / right — controls object-position)
  const imageAlignProp = block.querySelector('[data-aue-prop="imageAlign"]');
  let imageAlign = settings.imageAlign || 'center';
  if (imageAlignProp) {
    const val = imageAlignProp.textContent.trim().toLowerCase();
    if (val === 'left' || val === 'right' || val === 'center') imageAlign = val;
    directRowOf(block, imageAlignProp)?.remove();
  }

  consumedRows.forEach((row) => row.remove());

  // Parse card rows
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];
  rows.forEach((row) => {
    const data = parseCardRow(row);
    if (data) cards.push({ data, row });
  });

  const grid = document.createElement('div');
  grid.className = `image-text-card-row-grid image-text-card-row-grid-${imageStyle} image-text-card-row-img-${imageAlign}`;
  grid.style.setProperty('--grid-columns', columns);

  cards.forEach(({ data, row }) => {
    grid.append(buildCard(data, row));
  });

  block.replaceChildren(grid);
}
