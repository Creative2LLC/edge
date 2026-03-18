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

function getLinkUrl(col) {
  if (!col) return '';
  const a = col.querySelector('a');
  if (a && a.href) return a.href;
  return col.textContent.trim();
}

function parseCardRow(row) {
  const cols = [...row.children];

  // 8-column layout: image | icon | iconColor | title | subtitle | bodyText | linkText | linkUrl
  if (cols.length >= 6) {
    const imageData = getImageData(cols[0]);
    const iconData = getImageData(cols[1]);
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
      linkUrl: getLinkUrl(cols[7]),
    };
  }

  // Minimal fallback: 2 columns (image | text)
  if (cols.length >= 2) {
    const imageData = getImageData(cols[0]);
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
    };
  }

  return null;
}

function buildCard(data, row) {
  const card = document.createElement('div');
  card.className = 'image-text-card-row-card';
  if (row) moveInstrumentation(row, card);

  // Image — always covers the full top area
  if (data.imagePicture || data.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'image-text-card-row-card-image';

    if (data.imagePicture) {
      imageWrap.append(data.imagePicture);
      const img = data.imagePicture.querySelector('img');
      if (img) {
        const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '400' }]);
        moveInstrumentation(img, optimized.querySelector('img'));
        data.imagePicture.replaceWith(optimized);
      }
    } else {
      const pic = createOptimizedPicture(data.imgSrc, data.imageAlt, false, [{ width: '400' }]);
      imageWrap.append(pic);
    }

    card.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'image-text-card-row-card-content';

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

export default function decorate(block) {
  // Read columns setting
  const columnsProp = block.querySelector('[data-aue-prop="columns"]');
  let columns = 3;
  if (columnsProp) {
    const val = columnsProp.textContent.trim();
    if (val && !Number.isNaN(Number(val))) columns = Number(val);
    columnsProp.remove();
  }

  // Parse card rows
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];
  rows.forEach((row) => {
    const data = parseCardRow(row);
    if (data) cards.push({ data, row });
  });

  const grid = document.createElement('div');
  grid.className = 'image-text-card-row-grid';
  grid.style.setProperty('--grid-columns', columns);

  cards.forEach(({ data, row }) => {
    grid.append(buildCard(data, row));
  });

  block.replaceChildren(grid);
}
