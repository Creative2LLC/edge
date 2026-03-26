import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return { source: null, value: anchor?.href || cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getImageField(row, index) {
  const cols = [...row.children];
  const col = cols[index];
  if (!col) return { picture: null, img: null };
  const picture = col.querySelector('picture');
  const img = col.querySelector('img');
  return { picture, img };
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

  if (data.imageField.picture) {
    const { picture } = data.imageField;
    mediaSide.append(picture);
    const img = picture.querySelector('img');
    if (img) {
      if (data.imageAlt) img.alt = data.imageAlt;
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      picture.replaceWith(optimized);
    }
  } else if (data.imageField.img) {
    const pic = createOptimizedPicture(
      data.imageField.img.src,
      data.imageAlt,
      false,
      [{ width: '800' }],
    );
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
    contentSide.style.setProperty('background-color', data.backgroundColor, 'important');
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
      btn.style.setProperty('background-color', data.buttonColor, 'important');
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
  const rows = [...block.querySelectorAll(':scope > div')];

  // Block-level fields are in single-column rows;
  // slide rows have multiple columns.
  let sectionTitle = '';
  let sectionDescription = '';
  const slideRows = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) {
      // Single-column row — block-level config field
      const headingEl = row.querySelector('[data-aue-prop="heading"]');
      const descEl = row.querySelector('[data-aue-prop="description"]');
      if (headingEl) sectionTitle = headingEl.textContent.trim();
      else if (descEl) sectionDescription = descEl.textContent.trim();
      else {
        // Fallback: first single-col row without prop = heading, second = description
        const text = row.textContent.trim();
        if (text && !sectionTitle) sectionTitle = text;
        else if (text && !sectionDescription) sectionDescription = text;
      }
    } else {
      slideRows.push(row);
    }
  });

  // Parse slides — each slide row has fields as columns
  // Item field order: 0:image, 1:imageAlt, 2:heading, 3:subheading,
  // 4:buttonText, 5:buttonLink, 6:buttonColor, 7:backgroundColor, 8:contentAlign
  const slides = [];
  slideRows.forEach((row) => {
    const imageField = getImageField(row, 0);
    const imageAltField = getField(row, 'imageAlt', 1);
    const headingField = getField(row, 'heading', 2);
    const subheadingField = getField(row, 'subheading', 3);
    const buttonTextField = getField(row, 'buttonText', 4);
    const buttonLinkField = getLinkField(row, 'buttonLink', 5);
    const buttonColorField = getField(row, 'buttonColor', 6);
    const bgColorField = getField(row, 'backgroundColor', 7);
    const contentAlignField = getField(row, 'contentAlign', 8);

    slides.push({
      data: {
        imageField,
        imageAlt: imageAltField.value,
        heading: headingField.value,
        subheading: subheadingField.value,
        buttonText: buttonTextField.value,
        buttonLink: buttonLinkField.value,
        buttonColor: buttonColorField.value,
        backgroundColor: bgColorField.value,
        contentAlign: contentAlignField.value || 'left',
      },
      row,
    });
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
