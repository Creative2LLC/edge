import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

// Block-level field order: heading(0), subheading(1), backgroundColor(2),
// button(3), buttonLink(4)
const BLOCK_PROPS = ['heading', 'subheading', 'backgroundColor', 'button', 'buttonLink'];

function extractConfigRow(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  // Prefer the row that contains a block-level data-aue-prop
  let configRow = rows.find((row) => BLOCK_PROPS.some((p) => row.querySelector(`[data-aue-prop="${p}"]`)));

  // Fallback: first row that does NOT look like a resource item (no image/icon prop)
  if (!configRow && rows.length > 0) {
    configRow = rows.find((row) => !row.querySelector('[data-aue-prop="title"]')
      && !row.querySelector('[data-aue-prop="image"]')
      && !row.querySelector('picture'));
    // Last resort: first row
    if (!configRow) [configRow] = rows;
  }

  return configRow;
}

function readConfigField(configRow, name, colIndex) {
  if (!configRow) return '';
  const source = configRow.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source.textContent.trim();
  const cols = [...configRow.children];
  if (cols[colIndex]) return cols[colIndex].textContent.trim();
  return '';
}

function readConfigLinkField(configRow, name, colIndex) {
  if (!configRow) return '';
  const source = configRow.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return anchor?.href || source.textContent.trim();
  }
  const cols = [...configRow.children];
  if (cols[colIndex]) {
    const anchor = cols[colIndex].querySelector('a');
    return anchor?.href || cols[colIndex].textContent.trim();
  }
  return '';
}

function parseResourceRow(row) {
  const cols = [...row.children];

  // Extract picture + img from a column container
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

  // Extract link URL and text from a column (or merged link)
  function getLinkData(col, nextCol) {
    if (!col) return { url: '', text: '' };
    const a = col.querySelector('a');
    if (a && a.href) {
      // EDS may merge link URL + text into one <a>
      const aText = a.textContent.trim();
      const isUrlText = aText === a.href
        || aText === a.getAttribute('href')
        || aText.replace(/\/$/, '') === a.href.replace(/\/$/, '');
      return {
        url: a.href,
        text: isUrlText
          ? (nextCol?.textContent.trim() || '')
          : aText,
      };
    }
    return {
      url: col.textContent.trim(),
      text: nextCol?.textContent.trim() || '',
    };
  }

  // Try to get a field value by data-aue-prop, then column index
  function getFieldText(colIndex, propName) {
    const byProp = row.querySelector(
      `[data-aue-prop="${propName}"]`,
    );
    if (byProp) return byProp.textContent.trim();
    if (cols[colIndex]) return cols[colIndex].textContent.trim();
    return '';
  }

  // 7-column layout:
  // image | icon | iconColor | title | subtitle | link | linkText
  if (cols.length >= 6) {
    const imageData = getImageData(cols[0]);
    const iconData = getImageData(cols[1]);

    // Try data-aue-prop first for link text (editor)
    const linkTextProp = row.querySelector(
      '[data-aue-prop="linkText"]',
    );
    const linkProp = row.querySelector(
      '[data-aue-prop="link"]',
    );

    let linkUrl;
    let linkText;

    if (linkProp) {
      const a = linkProp.querySelector('a');
      linkUrl = a?.href || linkProp.textContent.trim();
      linkText = linkTextProp?.textContent.trim() || '';
    } else {
      // Column-index fallback (published pages)
      const ld = getLinkData(cols[5], cols[6]);
      linkUrl = ld.url;
      linkText = ld.text;
    }

    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: iconData.picture,
      iconSrc: iconData.src,
      iconColor: getFieldText(2, 'iconColor'),
      title: getFieldText(3, 'title'),
      subtitle: getFieldText(4, 'subtitle'),
      linkUrl,
      linkText,
    };
  }

  // Minimal fallback: 2 columns (image | text)
  if (cols.length >= 2) {
    const imageData = getImageData(cols[0]);
    const link = cols[1].querySelector('a');
    const paragraphs = cols[1].querySelectorAll('p');
    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: null,
      iconSrc: '',
      iconColor: '',
      title: paragraphs[0]?.textContent.trim() || '',
      subtitle: paragraphs[1]?.textContent.trim() || '',
      linkUrl: link?.href || '',
      linkText: getFieldText(-1, 'linkText'),
    };
  }

  return null;
}

function buildResourceCard(resource, row) {
  const card = document.createElement('div');
  card.className = 'resources-card';
  if (row) moveInstrumentation(row, card);

  const hasIcon = resource.iconPicture || resource.iconSrc;
  const hasImage = resource.imagePicture || resource.imgSrc;

  // Add modifier class when image is present but no icon
  if (hasImage && !hasIcon) {
    card.classList.add('resources-card-no-icon');
  }

  // Add modifier class when neither image nor icon is present
  if (!hasImage && !hasIcon) {
    card.classList.add('resources-card-no-media');
  }

  // Image — preserve existing <picture> from DOM, then optimize
  if (resource.imagePicture) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'resources-card-image';
    imageWrap.append(resource.imagePicture);
    const img = resource.imagePicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '400' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      resource.imagePicture.replaceWith(optimized);
    }
    card.append(imageWrap);
  } else if (resource.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'resources-card-image';
    const pic = createOptimizedPicture(resource.imgSrc, resource.imageAlt, false, [{ width: '400' }]);
    imageWrap.append(pic);
    card.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'resources-card-content';

  // Icon — preserve existing <picture> or <img>, apply color via mask if set
  if (resource.iconPicture || resource.iconSrc) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'resources-card-icon';
    if (resource.iconColor) {
      const iconImg = resource.iconPicture?.querySelector('img');
      const src = iconImg?.src || resource.iconSrc;
      if (src) {
        iconWrap.style.maskImage = `url(${src})`;
        iconWrap.style.webkitMaskImage = `url(${src})`;
        iconWrap.style.backgroundColor = resource.iconColor;
      }
    } else if (resource.iconPicture) {
      iconWrap.append(resource.iconPicture);
    } else {
      const iconImg = document.createElement('img');
      iconImg.src = resource.iconSrc;
      iconImg.alt = '';
      iconImg.loading = 'lazy';
      iconWrap.append(iconImg);
    }
    content.append(iconWrap);
  }

  // Title
  if (resource.title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'resources-card-title';
    titleEl.textContent = resource.title;
    content.append(titleEl);
  }

  // Subheading
  if (resource.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'resources-card-subheading';
    sub.textContent = resource.subtitle;
    content.append(sub);
  }

  // Learn More link (customizable text)
  if (resource.linkUrl) {
    const link = document.createElement('a');
    link.className = 'resources-card-link';
    link.href = resource.linkUrl;
    link.textContent = resource.linkText || 'Learn More';
    content.append(link);
  }

  card.append(content);
  return card;
}

function updateScrollbar(thumb, container) {
  const { scrollLeft, scrollWidth, clientWidth } = container;
  const maxScroll = scrollWidth - clientWidth;
  if (maxScroll <= 0) {
    thumb.style.width = '100%';
    thumb.style.left = '0';
    return;
  }
  const trackWidth = 200;
  const thumbWidth = Math.max((clientWidth / scrollWidth) * trackWidth, 40);
  const thumbLeft = (scrollLeft / maxScroll) * (trackWidth - thumbWidth);
  thumb.style.width = `${thumbWidth}px`;
  thumb.style.left = `${thumbLeft}px`;
}

export default function decorate(block) {
  // Extract config row and read block-level fields by prop or column index
  const configRow = extractConfigRow(block);
  const heading = readConfigField(configRow, 'heading', 0);
  const subheading = readConfigField(configRow, 'subheading', 1);
  const backgroundColor = readConfigField(configRow, 'backgroundColor', 2);
  const buttonText = readConfigField(configRow, 'button', 3);
  const buttonLink = readConfigLinkField(configRow, 'buttonLink', 4);

  // Remove the config row so it doesn't get parsed as a resource card
  if (configRow) configRow.remove();

  // Apply optional background color
  if (backgroundColor) {
    block.style.backgroundColor = backgroundColor;
  }

  // Remaining rows are resource items
  const rows = [...block.querySelectorAll(':scope > div')];
  const resources = [];
  rows.forEach((row) => {
    const resource = parseResourceRow(row);
    if (resource) resources.push({ data: resource, row });
  });

  const inner = document.createElement('div');
  inner.className = 'resources-inner';

  // Header row: heading (left) + button (right)
  const header = document.createElement('div');
  header.className = 'resources-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'resources-header-left';

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'resources-heading';
    h2.textContent = heading;
    headerLeft.append(h2);
  }

  if (subheading) {
    const sub = document.createElement('p');
    sub.className = 'resources-subheading';
    sub.textContent = subheading;
    headerLeft.append(sub);
  }

  header.append(headerLeft);

  if (buttonText) {
    const btn = document.createElement(buttonLink ? 'a' : 'button');
    btn.className = 'resources-button';
    btn.textContent = buttonText;
    if (buttonLink) btn.href = buttonLink;
    if (!buttonLink) btn.type = 'button';
    header.append(btn);
  }

  inner.append(header);

  // Cards scrollable container
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'resources-cards';

  resources.forEach(({ data, row }) => {
    const card = buildResourceCard(data, row);
    cardsContainer.append(card);
  });

  inner.append(cardsContainer);

  // Footer row: scrollbar (left) + nav buttons (right)
  const footer = document.createElement('div');
  footer.className = 'resources-footer';

  // Scrollbar track + thumb
  const scrollbar = document.createElement('div');
  scrollbar.className = 'resources-scrollbar';
  const scrollThumb = document.createElement('div');
  scrollThumb.className = 'resources-scrollbar-thumb';
  scrollbar.append(scrollThumb);
  footer.append(scrollbar);

  // Nav buttons
  const nav = document.createElement('div');
  nav.className = 'resources-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'resources-nav-btn resources-nav-prev';
  prevBtn.setAttribute('aria-label', 'Previous');
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'resources-nav-btn resources-nav-next';
  nextBtn.setAttribute('aria-label', 'Next');
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  nav.append(prevBtn);
  nav.append(nextBtn);
  footer.append(nav);

  inner.append(footer);

  // Scroll by one card width + gap on nav click
  const scrollAmount = 370;

  prevBtn.addEventListener('click', () => {
    cardsContainer.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    cardsContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  });

  // Update scrollbar thumb position on scroll
  cardsContainer.addEventListener('scroll', () => {
    updateScrollbar(scrollThumb, cardsContainer);
  });

  // Initial scrollbar state after layout
  requestAnimationFrame(() => {
    updateScrollbar(scrollThumb, cardsContainer);
  });

  block.replaceChildren(inner);
}
