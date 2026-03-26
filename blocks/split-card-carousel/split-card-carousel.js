import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

function getFieldText(row, colIndex, propName) {
  const byProp = row.querySelector(`[data-aue-prop="${propName}"]`);
  if (byProp) return byProp.textContent.trim();
  const cols = [...row.children];
  if (cols[colIndex]) return cols[colIndex].textContent.trim();
  return '';
}

function getFieldLink(row, colIndex, propName) {
  const byProp = row.querySelector(`[data-aue-prop="${propName}"]`);
  if (byProp) {
    const anchor = byProp.tagName === 'A' ? byProp : byProp.querySelector('a');
    return anchor?.href || byProp.textContent.trim();
  }
  const cols = [...row.children];
  if (cols[colIndex]) {
    const a = cols[colIndex].querySelector('a');
    if (a && a.href) return a.href;
    return cols[colIndex].textContent.trim();
  }
  return '';
}

function getFieldImage(row, colIndex) {
  const cols = [...row.children];
  const col = cols[colIndex];
  if (!col) return { picture: null, src: '', alt: '' };
  const picture = col.querySelector('picture');
  const img = col.querySelector('img');
  return { picture, src: img?.src || '', alt: img?.alt || '' };
}

function parseSlide(row) {
  const cols = [...row.children];
  if (cols.length < 2) return null;

  const imageData = getFieldImage(row, 0);
  return {
    imagePicture: imageData.picture,
    imgSrc: imageData.src,
    imageAlt: getFieldText(row, 1, 'imageAlt') || imageData.alt,
    heading: getFieldText(row, 2, 'heading'),
    subheading: getFieldText(row, 3, 'subheading'),
    buttonText: getFieldText(row, 4, 'buttonText'),
    buttonLink: getFieldLink(row, 5, 'buttonLink'),
    buttonColor: getFieldText(row, 6, 'buttonColor'),
    backgroundColor: getFieldText(row, 7, 'backgroundColor'),
    contentAlign: getFieldText(row, 8, 'contentAlign') || 'left',
  };
}

function buildSlide(data, row) {
  const slide = document.createElement('div');
  slide.className = 'split-card-carousel-slide';
  if (row) moveInstrumentation(row, slide);

  const card = document.createElement('div');
  card.className = 'split-card-carousel-card';

  // Left: image
  const mediaSide = document.createElement('div');
  mediaSide.className = 'split-card-carousel-media';

  if (data.imagePicture) {
    mediaSide.append(data.imagePicture);
    const img = data.imagePicture.querySelector('img');
    if (img) {
      if (data.imageAlt) img.alt = data.imageAlt;
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      data.imagePicture.replaceWith(optimized);
    }
  } else if (data.imgSrc) {
    const pic = createOptimizedPicture(data.imgSrc, data.imageAlt, false, [{ width: '800' }]);
    mediaSide.append(pic);
  }

  card.append(mediaSide);

  // Right: content
  const contentSide = document.createElement('div');
  contentSide.className = 'split-card-carousel-content';
  contentSide.style.textAlign = data.contentAlign;

  if (data.contentAlign === 'center') {
    contentSide.style.alignItems = 'center';
  } else if (data.contentAlign === 'right') {
    contentSide.style.alignItems = 'flex-end';
  }

  if (data.backgroundColor) {
    contentSide.style.backgroundColor = data.backgroundColor;
  }

  if (data.heading) {
    const h2 = document.createElement('h2');
    h2.className = 'split-card-carousel-heading';
    h2.textContent = data.heading;
    contentSide.append(h2);
  }

  if (data.subheading) {
    const p = document.createElement('p');
    p.className = 'split-card-carousel-subheading';
    p.textContent = data.subheading;
    contentSide.append(p);
  }

  if (data.buttonText && data.buttonLink) {
    const btn = document.createElement('a');
    btn.className = 'split-card-carousel-button';
    btn.href = data.buttonLink;
    btn.textContent = data.buttonText;
    if (data.buttonColor) {
      btn.style.backgroundColor = data.buttonColor;
    }
    contentSide.append(btn);
  }

  card.append(contentSide);
  slide.append(card);
  return slide;
}

function updateDots(dots, activeIndex) {
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === activeIndex);
  });
}

export default function decorate(block) {
  // Extract block-level fields
  const headingProp = block.querySelector('[data-aue-prop="heading"]');
  const descriptionProp = block.querySelector('[data-aue-prop="description"]');
  let sectionTitle = '';
  let sectionDescription = '';
  if (headingProp) {
    sectionTitle = headingProp.textContent.trim();
  }
  if (descriptionProp) {
    sectionDescription = descriptionProp.textContent.trim();
  }

  // Remove config rows containing block-level props
  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    if (row.querySelector('[data-aue-prop="heading"]')
      || row.querySelector('[data-aue-prop="description"]')) {
      row.remove();
    }
  });

  // Parse slides
  const rows = [...block.querySelectorAll(':scope > div')];
  const slides = [];
  rows.forEach((row) => {
    const data = parseSlide(row);
    if (data) slides.push({ data, row });
  });

  // Build wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'split-card-carousel-wrapper';

  // Section title
  if (sectionTitle) {
    const h2 = document.createElement('h2');
    h2.className = 'split-card-carousel-title';
    h2.textContent = sectionTitle;
    wrapper.append(h2);
  }

  // Section description
  if (sectionDescription) {
    const desc = document.createElement('p');
    desc.className = 'split-card-carousel-description';
    desc.textContent = sectionDescription;
    wrapper.append(desc);
  }

  // Track
  const track = document.createElement('div');
  track.className = 'split-card-carousel-track';

  slides.forEach(({ data, row }) => {
    track.append(buildSlide(data, row));
  });

  wrapper.append(track);

  // Controls: dots + nav arrows
  const controls = document.createElement('div');
  controls.className = 'split-card-carousel-controls';

  // Dots
  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'split-card-carousel-dots';
  const dots = [];
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'split-card-carousel-dot';
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.type = 'button';
    if (i === 0) dot.classList.add('active');
    dots.push(dot);
    dotsContainer.append(dot);
  });
  controls.append(dotsContainer);

  // Nav arrows
  const nav = document.createElement('div');
  nav.className = 'split-card-carousel-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'split-card-carousel-nav-btn';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.type = 'button';
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'split-card-carousel-nav-btn';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.type = 'button';
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  nav.append(prevBtn);
  nav.append(nextBtn);
  controls.append(nav);

  wrapper.append(controls);

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
    const gap = 24;
    const scrollIndex = Math.round(track.scrollLeft / (slideWidth + gap));
    if (scrollIndex !== current && scrollIndex >= 0 && scrollIndex < slides.length) {
      current = scrollIndex;
      updateDots(dots, current);
    }
  });

  block.replaceChildren(wrapper);
}
