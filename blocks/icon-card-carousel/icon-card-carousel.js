import { moveInstrumentation } from '../../scripts/scripts.js';

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

  const iconData = getFieldImage(row, 0);
  return {
    iconPicture: iconData.picture,
    iconSrc: iconData.src,
    iconAlt: iconData.alt,
    iconColor: getFieldText(row, 1, 'iconColor'),
    heading: getFieldText(row, 2, 'heading'),
    body: getFieldText(row, 3, 'body'),
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

  const card = document.createElement('div');
  card.className = 'icon-card-carousel-card';

  if (data.backgroundColor) {
    card.style.backgroundColor = data.backgroundColor;
  }

  // Icon
  const iconWrap = document.createElement('div');
  iconWrap.className = 'icon-card-carousel-icon';

  if (data.iconPicture) {
    iconWrap.append(data.iconPicture);
  } else if (data.iconSrc) {
    const img = document.createElement('img');
    img.src = data.iconSrc;
    img.alt = data.iconAlt || '';
    img.loading = 'lazy';
    iconWrap.append(img);
  }

  if (data.iconColor) {
    iconWrap.style.color = data.iconColor;
  }

  card.append(iconWrap);

  // Title
  if (data.heading) {
    const h3 = document.createElement('h3');
    h3.className = 'icon-card-carousel-heading';
    h3.textContent = data.heading;
    if (data.textColor) {
      h3.style.color = data.textColor;
    }
    card.append(h3);
  }

  // Body
  if (data.body) {
    const p = document.createElement('p');
    p.className = 'icon-card-carousel-body';
    p.textContent = data.body;
    if (data.textColor) {
      p.style.color = data.textColor;
    }
    card.append(p);
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
  // Extract section heading
  const headingProp = block.querySelector('[data-aue-prop="heading"]');
  let sectionTitle = '';
  if (headingProp) {
    sectionTitle = headingProp.textContent.trim();
    headingProp.closest(':scope > div')?.remove();
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

  // Track
  const track = document.createElement('div');
  track.className = 'icon-card-carousel-track';

  slides.forEach(({ data, row }) => {
    track.append(buildSlide(data, row));
  });

  wrapper.append(track);

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
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'icon-card-carousel-nav-btn';
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
