import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getRichField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.innerHTML.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].innerHTML.trim() };
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

function styleButton(btn, color, textColor, style) {
  const bgColor = color || '#008db6';

  if (style === 'link') {
    btn.classList.add('is-link');
    btn.style.setProperty('color', bgColor, 'important');
    return;
  }

  if (style === 'outlined') {
    btn.classList.add('is-outlined');
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('color', bgColor, 'important');
    btn.style.setProperty('border', `2px solid ${bgColor}`, 'important');
    return;
  }

  btn.classList.add('is-solid');
  btn.style.setProperty('background-color', bgColor, 'important');
  btn.style.setProperty('color', textColor || '#ffffff', 'important');
  btn.style.setProperty('border', 'none', 'important');
}

function buildSlide(data, row) {
  const slide = document.createElement('div');
  slide.className = 'stc-slide';
  if (row) moveInstrumentation(row, slide);

  const card = document.createElement('div');
  card.className = 'stc-card';

  /* Left: image */
  const mediaSide = document.createElement('div');
  mediaSide.className = 'stc-media';

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

  /* Right: content */
  const contentSide = document.createElement('div');
  contentSide.className = 'stc-content';

  if (data.heading) {
    const h2 = document.createElement('h2');
    h2.className = 'stc-heading';
    h2.textContent = data.heading;
    contentSide.append(h2);
  }

  if (data.subheading) {
    const body = document.createElement('div');
    body.className = 'stc-subheading';
    body.innerHTML = data.subheading;
    contentSide.append(body);
  }

  /* Button */
  if (data.buttonText || data.buttonLink) {
    const btn = document.createElement(data.buttonLink ? 'a' : 'button');
    btn.className = 'stc-button';
    btn.textContent = data.buttonText || 'Learn More';
    if (data.buttonLink) btn.href = data.buttonLink;
    if (!data.buttonLink) btn.type = 'button';
    styleButton(btn, data.buttonColor, data.buttonTextColor, data.buttonStyle);
    contentSide.append(btn);
  }

  /* Link */
  if (data.linkText || data.linkUrl) {
    const link = document.createElement(data.linkUrl ? 'a' : 'span');
    link.className = 'stc-link';
    link.textContent = data.linkText || 'Learn More';
    if (data.linkUrl) link.href = data.linkUrl;
    if (data.linkColor) {
      link.style.setProperty('color', data.linkColor, 'important');
    }
    contentSide.append(link);
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

  let sectionTitle = '';
  let sectionDescription = '';
  const slideRows = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) {
      const headingEl = row.querySelector('[data-aue-prop="heading"]');
      const descEl = row.querySelector('[data-aue-prop="description"]');
      if (headingEl) sectionTitle = headingEl.textContent.trim();
      else if (descEl) sectionDescription = descEl.textContent.trim();
      else {
        const text = row.textContent.trim();
        if (text && !sectionTitle) sectionTitle = text;
        else if (text && !sectionDescription) sectionDescription = text;
      }
    } else {
      slideRows.push(row);
    }
  });

  const slides = [];
  slideRows.forEach((row) => {
    const imageField = getImageField(row, 0);
    const imageAltField = getField(row, 'imageAlt', 1);
    const headingField = getField(row, 'heading', 2);
    const subheadingField = getRichField(row, 'subheading', 3);
    const buttonTextField = getField(row, 'buttonText', 4);
    const buttonLinkField = getLinkField(row, 'buttonLink', 5);
    const buttonColorField = getField(row, 'buttonColor', 6);
    const buttonTextColorField = getField(row, 'buttonTextColor', 7);
    const buttonStyleField = getField(row, 'buttonStyle', 8);
    const linkTextField = getField(row, 'linkText', 9);
    const linkUrlField = getLinkField(row, 'linkUrl', 10);
    const linkColorField = getField(row, 'linkColor', 11);

    slides.push({
      data: {
        imageField,
        imageAlt: imageAltField.value,
        heading: headingField.value,
        subheading: subheadingField.value,
        buttonText: buttonTextField.value,
        buttonLink: buttonLinkField.value,
        buttonColor: buttonColorField.value,
        buttonTextColor: buttonTextColorField.value,
        buttonStyle: buttonStyleField.value || 'solid',
        linkText: linkTextField.value,
        linkUrl: linkUrlField.value,
        linkColor: linkColorField.value,
      },
      row,
    });
  });

  /* Build wrapper */
  const wrapper = document.createElement('div');
  wrapper.className = 'stc-wrapper';

  if (sectionTitle) {
    const h2 = document.createElement('h2');
    h2.className = 'stc-title';
    h2.textContent = sectionTitle;
    wrapper.append(h2);
  }

  if (sectionDescription) {
    const desc = document.createElement('p');
    desc.className = 'stc-description';
    desc.textContent = sectionDescription;
    wrapper.append(desc);
  }

  /* Track */
  const track = document.createElement('div');
  track.className = 'stc-track';

  slides.forEach(({ data, row }) => {
    track.append(buildSlide(data, row));
  });

  wrapper.append(track);

  /* Controls */
  const controls = document.createElement('div');
  controls.className = 'stc-controls';

  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'stc-dots';
  const dots = [];
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'stc-dot';
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.type = 'button';
    if (i === 0) dot.classList.add('active');
    dots.push(dot);
    dotsContainer.append(dot);
  });
  controls.append(dotsContainer);

  const nav = document.createElement('div');
  nav.className = 'stc-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'stc-nav-btn';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.type = 'button';
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'stc-nav-btn';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.type = 'button';
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  nav.append(prevBtn);
  nav.append(nextBtn);
  controls.append(nav);
  wrapper.append(controls);

  /* Carousel state */
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
