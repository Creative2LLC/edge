import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import attachDragScroll from '../../scripts/carousel-utils.js';
import focusScrollableRegion from '../../scripts/a11y-utils.js';

function getFieldText(row, colIndex, propName) {
  return readTextField(row, propName, { fallbackCell: row.children[colIndex] }).value;
}

function getFieldRich(row, colIndex, propName) {
  const field = readRichTextField(row, propName, { fallbackCell: row.children[colIndex] });
  return { html: field.html, text: field.text };
}

function getFieldLink(row, colIndex, propName) {
  return readLinkField(row, propName, { fallbackCell: row.children[colIndex] }).value;
}

function getFieldImage(row, colIndex) {
  const { picture, img } = readImageField(row, 'icon', { fallbackCell: row.children[colIndex] });
  return { picture, src: img?.src || '', alt: img?.alt || '' };
}

const BLOCK_FIELD_ORDER = ['heading', 'subtitle', 'blockBackgroundColor', 'styleVariant'];

function isSlideRow(row) {
  return row.matches?.('[data-aue-model="icon-card-carousel-item"]')
    || row.querySelector('[data-aue-model="icon-card-carousel-item"]')
    || row.querySelector('[data-aue-prop="icon"], [data-aue-prop="body"], [data-aue-prop="buttonText"]')
    || row.children.length >= 4;
}

function normalizeBlockFieldName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getBlockFieldRowValue(row) {
  return row.children.length === 2
    ? row.children[1].textContent.trim()
    : row.textContent.trim();
}

function collectBlockConfig(block) {
  const config = {};
  const rowsToRemove = new Set();
  const rows = [...block.querySelectorAll(':scope > div')];
  const configRows = rows.filter((row) => !isSlideRow(row));

  configRows.forEach((row) => {
    BLOCK_FIELD_ORDER.forEach((name) => {
      if (config[name]) return;
      const source = row.querySelector(`[data-aue-prop="${name}"]`);
      if (!source) return;
      config[name] = source.textContent.trim();
      rowsToRemove.add(row);
    });

    if (row.children.length !== 2) return;
    const label = normalizeBlockFieldName(row.children[0].textContent);
    const name = BLOCK_FIELD_ORDER.find(
      (fieldName) => normalizeBlockFieldName(fieldName) === label,
    );
    if (!name || config[name]) return;
    config[name] = row.children[1].textContent.trim();
    rowsToRemove.add(row);
  });

  configRows
    .filter((row) => !rowsToRemove.has(row) && row.textContent.trim())
    .forEach((row) => {
      const name = BLOCK_FIELD_ORDER.find((fieldName) => !config[fieldName]);
      if (!name) return;
      config[name] = getBlockFieldRowValue(row);
      rowsToRemove.add(row);
    });

  rowsToRemove.forEach((row) => row.remove());
  return config;
}

function parseSlide(row) {
  const cols = [...row.children];
  if (cols.length < 2) return null;

  const iconData = getFieldImage(row, 0);
  return {
    iconPicture: iconData.picture,
    iconSrc: iconData.src,
    iconAlt: iconData.alt,
    iconColor: getFieldText(row, 1, 'iconColor'),
    heading: getFieldRich(row, 2, 'heading'),
    body: getFieldRich(row, 3, 'body'),
    buttonText: getFieldText(row, 4, 'buttonText'),
    buttonLink: getFieldLink(row, 5, 'buttonLink'),
    buttonColor: getFieldText(row, 6, 'buttonColor'),
    buttonTextColor: getFieldText(row, 7, 'buttonTextColor'),
    textColor: getFieldText(row, 8, 'textColor'),
    backgroundColor: getFieldText(row, 9, 'backgroundColor'),
  };
}

function buildSlide(data, row) {
  const slide = document.createElement('div');
  slide.className = 'icon-card-carousel-slide';
  if (row) moveInstrumentation(row, slide);
  setItemLabel(slide, [data.heading?.text, data.body?.text]);

  const card = document.createElement('div');
  card.className = 'icon-card-carousel-card';

  if (data.backgroundColor) {
    card.style.backgroundColor = data.backgroundColor;
  }

  // Icon
  const iconImg = data.iconPicture
    ? data.iconPicture.querySelector('img')
    : null;
  const iconSrc = iconImg?.src || data.iconSrc;
  const hasIcon = Boolean(iconSrc || data.iconPicture);

  if (hasIcon) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'icon-card-carousel-icon';

    if (data.iconColor && iconSrc) {
      iconWrap.style.maskImage = `url(${iconSrc})`;
      iconWrap.style.webkitMaskImage = `url(${iconSrc})`;
      iconWrap.style.backgroundColor = data.iconColor;
    } else if (data.iconPicture) {
      iconWrap.append(data.iconPicture);
    } else if (data.iconSrc) {
      const img = document.createElement('img');
      img.src = data.iconSrc;
      img.alt = data.iconAlt || '';
      img.loading = 'lazy';
      iconWrap.append(img);
    }

    card.append(iconWrap);
  } else {
    card.classList.add('no-icon');
  }

  // Title
  if (data.heading?.text) {
    const h3 = document.createElement('h3');
    h3.className = 'icon-card-carousel-heading';
    h3.innerHTML = data.heading.html;
    if (data.textColor) {
      h3.style.color = data.textColor;
    }
    card.append(h3);
  }

  // Body
  if (data.body?.text) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'icon-card-carousel-body';
    bodyEl.innerHTML = data.body.html;
    if (data.textColor) {
      bodyEl.style.color = data.textColor;
    }
    card.append(bodyEl);
  }

  // Spacer to push button to bottom
  const spacer = document.createElement('div');
  spacer.className = 'icon-card-carousel-spacer';
  card.append(spacer);

  // Button
  if (data.buttonText && data.buttonLink) {
    const btn = document.createElement('a');
    btn.className = 'icon-card-carousel-button';
    btn.href = data.buttonLink;
    btn.textContent = data.buttonText;
    if (data.buttonColor) {
      btn.style.backgroundColor = data.buttonColor;
    }
    if (data.buttonTextColor) {
      btn.style.color = data.buttonTextColor;
    }
    card.append(btn);
  }

  slide.append(card);
  return slide;
}

function updateDots(dots, activeIndex) {
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === activeIndex);
  });
}

export default function decorate(block) {
  const blockConfig = collectBlockConfig(block);
  const sectionTitle = blockConfig.heading || '';
  const sectionSubtitle = blockConfig.subtitle || '';
  const blockBgColor = blockConfig.blockBackgroundColor || '';
  const styleVariant = blockConfig.styleVariant || '';
  if (styleVariant === 'thinner') {
    block.classList.add('icon-card-carousel-thinner');
  } else if (styleVariant === 'thinner-dynamic') {
    // Thinner Dynamic builds on the Thinner Cards sizing, then adds its own
    // centering/padding tweaks via the extra class.
    block.classList.add('icon-card-carousel-thinner');
    block.classList.add('icon-card-carousel-thinner-dynamic');
  }

  // Parse slides
  const rows = [...block.querySelectorAll(':scope > div')];
  const slides = [];
  rows.forEach((row) => {
    const data = parseSlide(row);
    if (data) slides.push({ data, row });
  });

  // Build wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'icon-card-carousel-wrapper';

  // Section title
  if (sectionTitle) {
    const h2 = document.createElement('h2');
    h2.className = 'icon-card-carousel-title';
    h2.textContent = sectionTitle;
    wrapper.append(h2);
  }

  // Section subtitle
  if (sectionSubtitle) {
    const p = document.createElement('p');
    p.className = 'icon-card-carousel-subtitle';
    p.textContent = sectionSubtitle;
    wrapper.append(p);
  }

  // Track
  const track = document.createElement('div');
  track.className = 'icon-card-carousel-track';

  slides.forEach(({ data, row }) => {
    track.append(buildSlide(data, row));
  });

  wrapper.append(track);
  focusScrollableRegion(track, 'Carousel cards');
  attachDragScroll(track);

  // Controls: dots + nav arrows
  const controls = document.createElement('div');
  controls.className = 'icon-card-carousel-controls';

  // Dots
  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'icon-card-carousel-dots';
  const dots = [];
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'icon-card-carousel-dot';
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.type = 'button';
    if (i === 0) dot.classList.add('active');
    dots.push(dot);
    dotsContainer.append(dot);
  });
  controls.append(dotsContainer);

  // Nav arrows
  const nav = document.createElement('div');
  nav.className = 'icon-card-carousel-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'icon-card-carousel-nav-btn';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.type = 'button';
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'icon-card-carousel-nav-btn';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.type = 'button';
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  nav.append(prevBtn);
  nav.append(nextBtn);
  controls.append(nav);

  wrapper.append(controls);

  // Apply block background color
  if (blockBgColor) {
    block.style.backgroundColor = blockBgColor;
  }

  // Carousel state
  let current = 0;

  function goToSlide(index) {
    const total = slides.length;
    if (total === 0) return;
    current = ((index % total) + total) % total;
    const slideEl = track.children[current];
    if (slideEl) {
      track.scrollTo({ left: slideEl.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }
    updateDots(dots, current);
  }

  prevBtn.addEventListener('click', () => goToSlide(current - 1));
  nextBtn.addEventListener('click', () => goToSlide(current + 1));
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => goToSlide(i));
  });

  // Sync dots on manual scroll
  track.addEventListener('scroll', () => {
    const slideWidth = track.children[0]?.offsetWidth || 1;
    const trackStyles = getComputedStyle(track);
    const gap = parseFloat(trackStyles.columnGap || trackStyles.gap) || 48;
    const scrollIndex = Math.round(track.scrollLeft / (slideWidth + gap));
    if (scrollIndex !== current && scrollIndex >= 0 && scrollIndex < slides.length) {
      current = scrollIndex;
      updateDots(dots, current);
    }
  });

  block.replaceChildren(wrapper);
}
