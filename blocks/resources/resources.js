import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  button: ['button text', 'buttontext', 'button label', 'button'],
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
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const value = source.textContent.trim();
    source.remove();
    return value;
  }
  return legacyMap[name] || '';
}

function getColText(col) {
  if (!col) return '';
  const a = col.querySelector('a');
  if (a && a.href) return a.href;
  return col.textContent.trim();
}

function parseResourceRow(row) {
  const cols = [...row.children];

  // Helper: extract picture element and img src from a column or AUE prop element
  function getImageData(el) {
    if (!el) return { picture: null, src: '', alt: '' };
    const picture = el.querySelector('picture');
    const img = el.querySelector('img');
    return {
      picture,
      src: img?.src || '',
      alt: img?.alt || '',
    };
  }

  // Helper: extract link URL from a column (checks <a> first, then textContent)
  function getLinkUrl(el) {
    if (!el) return '';
    const a = el.querySelector('a');
    if (a && a.href) return a.href;
    return el.textContent.trim();
  }

  // Try data-aue-prop (Universal Editor live context)
  const titleEl = row.querySelector('[data-aue-prop="title"]');
  if (titleEl) {
    const imageData = getImageData(row.querySelector('[data-aue-prop="image"]'));
    const iconData = getImageData(row.querySelector('[data-aue-prop="icon"]'));
    const iconColorEl = row.querySelector('[data-aue-prop="iconColor"]');
    const subtitleEl = row.querySelector('[data-aue-prop="subtitle"]');
    const linkEl = row.querySelector('[data-aue-prop="link"]');
    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: iconData.picture,
      iconSrc: iconData.src,
      iconColor: iconColorEl?.textContent.trim() || '',
      title: titleEl.textContent.trim(),
      subtitle: subtitleEl?.textContent.trim() || '',
      linkUrl: getLinkUrl(linkEl),
    };
  }

  // 6-column layout: image | icon | iconColor | title | subtitle | link
  if (cols.length >= 6) {
    const imageData = getImageData(cols[0]);
    const iconData = getImageData(cols[1]);
    return {
      imagePicture: imageData.picture,
      imgSrc: imageData.src,
      imageAlt: imageData.alt,
      iconPicture: iconData.picture,
      iconSrc: iconData.src,
      iconColor: cols[2].textContent.trim(),
      title: cols[3].textContent.trim(),
      subtitle: cols[4].textContent.trim(),
      linkUrl: getColText(cols[5]),
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
    };
  }

  return null;
}

function buildResourceCard(resource, row) {
  const card = document.createElement('div');
  card.className = 'resources-card';
  if (row) moveInstrumentation(row, card);

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
      // Use mask-image to colorize the icon
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

  // Learn More link
  if (resource.linkUrl) {
    const link = document.createElement('a');
    link.className = 'resources-card-link';
    link.href = resource.linkUrl;
    link.textContent = 'Learn More';
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
  const legacyMap = collectLegacyBlockFields(block);
  const heading = getBlockField(block, legacyMap, 'heading');
  const buttonText = getBlockField(block, legacyMap, 'button') || 'View All Resources';

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

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'resources-heading';
    h2.textContent = heading;
    header.append(h2);
  }

  const btn = document.createElement('button');
  btn.className = 'resources-button';
  btn.textContent = buttonText;
  header.append(btn);

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
