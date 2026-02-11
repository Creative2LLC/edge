import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

function getBlockField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const value = source.textContent.trim();
    source.remove();
    return value;
  }
  return '';
}

function getColText(col) {
  if (!col) return '';
  const a = col.querySelector('a');
  if (a && a.href) return a.href;
  return col.textContent.trim();
}

function parseResourceRow(row) {
  const cols = [...row.children];

  // Try data-aue-prop (Universal Editor live context)
  const getField = (prop) => {
    const el = row.querySelector(`[data-aue-prop="${prop}"]`);
    return el ? el.textContent.trim() : '';
  };
  const imageEl = row.querySelector('[data-aue-prop="image"]');
  const title = getField('title');
  if (title) {
    const pic = imageEl?.querySelector('img');
    const iconEl = row.querySelector('[data-aue-prop="icon"]');
    const iconPic = iconEl?.querySelector('img');
    return {
      imgSrc: pic?.src || '',
      imageAlt: pic?.alt || '',
      iconSrc: iconPic?.src || '',
      iconColor: getField('iconColor'),
      title,
      subtitle: getField('subtitle'),
      linkUrl: getField('link'),
    };
  }

  // Legacy 6-column: image | icon | iconColor | title | subtitle | link
  if (cols.length >= 6) {
    const image = cols[0].querySelector('img');
    const icon = cols[1].querySelector('img');
    return {
      imgSrc: image?.src || '',
      imageAlt: image?.alt || '',
      iconSrc: icon?.src || '',
      iconColor: cols[2].textContent.trim(),
      title: cols[3].textContent.trim(),
      subtitle: cols[4].textContent.trim(),
      linkUrl: getColText(cols[5]),
    };
  }

  // Minimal fallback: 2 columns (image | text)
  if (cols.length >= 2) {
    const img = cols[0].querySelector('img');
    const link = cols[1].querySelector('a');
    const paragraphs = cols[1].querySelectorAll('p');
    return {
      imgSrc: img?.src || '',
      imageAlt: img?.alt || '',
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

  // Image
  if (resource.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'resources-card-image';
    const pic = createOptimizedPicture(resource.imgSrc, resource.imageAlt, false, [{ width: '400' }]);
    imageWrap.append(pic);
    card.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'resources-card-content';

  // Icon (uses mask-image for coloring when iconColor is set)
  if (resource.iconSrc) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'resources-card-icon';
    if (resource.iconColor) {
      iconWrap.style.maskImage = `url(${resource.iconSrc})`;
      iconWrap.style.webkitMaskImage = `url(${resource.iconSrc})`;
      iconWrap.style.backgroundColor = resource.iconColor;
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
  const heading = getBlockField(block, 'heading');
  const buttonText = getBlockField(block, 'button') || 'View All Resources';

  // Parse resource rows
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
