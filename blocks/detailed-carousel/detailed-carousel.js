import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readLinkField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import attachDragScroll from '../../scripts/carousel-utils.js';

function getField(row, name, index) {
  const field = readTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getLinkField(row, name, index) {
  const field = readLinkField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getImageField(row, index) {
  const { picture, img } = readImageField(row, 'image', { fallbackCell: row.children[index] });
  return { picture, img };
}

function buildSlide(data, row) {
  const slide = document.createElement('div');
  slide.className = 'detailed-carousel-slide';
  if (row) {
    moveInstrumentation(row, slide);
    // Label the slide in the Universal Editor content tree by its own content so
    // authors can tell slides apart instead of seeing the generic component name.
    setItemLabel(slide, [data.stat1Title, data.imageAlt]);
  }

  const card = document.createElement('div');
  card.className = 'detailed-carousel-card';

  // Top: image
  const media = document.createElement('div');
  media.className = 'detailed-carousel-media';

  if (data.imageField.picture) {
    const { picture } = data.imageField;
    media.append(picture);
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
    media.append(pic);
  }

  card.append(media);

  // Bottom: content area
  const content = document.createElement('div');
  content.className = 'detailed-carousel-content';

  // Stat columns - only render if they have content
  const stats = document.createElement('div');
  stats.className = 'detailed-carousel-stats';

  const statFields = [
    { title: data.stat1Title, body: data.stat1Body },
    { title: data.stat2Title, body: data.stat2Body },
    { title: data.stat3Title, body: data.stat3Body },
  ];

  // Only render stats that have at least a title or body
  statFields.forEach((stat) => {
    if (!stat.title && !stat.body) return;

    const col = document.createElement('div');
    col.className = 'detailed-carousel-stat';

    if (stat.title) {
      const h4 = document.createElement('h4');
      h4.className = 'detailed-carousel-stat-title';
      h4.textContent = stat.title;
      col.append(h4);
    }

    if (stat.body) {
      const p = document.createElement('p');
      p.className = 'detailed-carousel-stat-body';
      p.textContent = stat.body;
      col.append(p);
    }

    stats.append(col);
  });

  content.append(stats);

  // Button
  if (data.buttonText && data.buttonLink) {
    const btn = document.createElement('a');
    btn.className = 'detailed-carousel-button';
    btn.href = data.buttonLink;
    btn.textContent = data.buttonText;
    if (data.buttonColor) {
      btn.style.setProperty('background-color', data.buttonColor, 'important');
    }
    content.append(btn);
  }

  card.append(content);
  slide.append(card);
  return slide;
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

    // Read button fields first to identify them
    const buttonTextField = getField(row, 'buttonText', 8);
    const buttonLinkField = getLinkField(row, 'buttonLink', 9);
    const buttonColorField = getField(row, 'buttonColor', 10);

    // Read stat fields, but skip if they come from button field sources
    const stat1TitleField = getField(row, 'stat1Title', 2);
    const stat1BodyField = getField(row, 'stat1Body', 3);
    const stat2TitleField = getField(row, 'stat2Title', 4);
    const stat2BodyField = getField(row, 'stat2Body', 5);
    const stat3TitleField = getField(row, 'stat3Title', 6);
    const stat3BodyField = getField(row, 'stat3Body', 7);

    // If stat3Title's source is the same as buttonText's source, clear stat3Title
    const stat3Title = (stat3TitleField.source === buttonTextField.source && buttonTextField.source)
      ? '' : stat3TitleField.value;
    const stat3Body = (stat3BodyField.source === buttonLinkField.source && buttonLinkField.source)
      ? '' : stat3BodyField.value;

    slides.push({
      data: {
        imageField,
        imageAlt: imageAltField.value,
        stat1Title: stat1TitleField.value,
        stat1Body: stat1BodyField.value,
        stat2Title: stat2TitleField.value,
        stat2Body: stat2BodyField.value,
        stat3Title,
        stat3Body,
        buttonText: buttonTextField.value,
        buttonLink: buttonLinkField.value,
        buttonColor: buttonColorField.value,
      },
      row,
    });
  });

  // Build wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'detailed-carousel-wrapper';

  if (sectionTitle) {
    const h2 = document.createElement('h2');
    h2.className = 'detailed-carousel-title';
    h2.textContent = sectionTitle;
    wrapper.append(h2);
  }

  if (sectionDescription) {
    const desc = document.createElement('p');
    desc.className = 'detailed-carousel-description';
    desc.textContent = sectionDescription;
    wrapper.append(desc);
  }

  // Track
  const track = document.createElement('div');
  track.className = 'detailed-carousel-track';

  slides.forEach(({ data, row }) => {
    track.append(buildSlide(data, row));
  });

  wrapper.append(track);
  attachDragScroll(track);

  if (slides.length > 1) {
    const controls = document.createElement('div');
    controls.className = 'detailed-carousel-controls';

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'detailed-carousel-dots';
    const dots = slides.map((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'detailed-carousel-dot';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.type = 'button';
      if (i === 0) dot.classList.add('active');
      dotsContainer.append(dot);
      return dot;
    });
    controls.append(dotsContainer);

    const nav = document.createElement('div');
    nav.className = 'detailed-carousel-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'detailed-carousel-nav-btn';
    prevBtn.setAttribute('aria-label', 'Previous slide');
    prevBtn.type = 'button';
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'detailed-carousel-nav-btn';
    nextBtn.setAttribute('aria-label', 'Next slide');
    nextBtn.type = 'button';
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

    nav.append(prevBtn, nextBtn);
    controls.append(nav);
    wrapper.append(controls);

    let current = 0;

    const goToSlide = (index) => {
      const total = slides.length;
      if (total === 0) return;
      current = ((index % total) + total) % total;
      const slideEl = track.children[current];
      if (slideEl) {
        track.scrollTo({ left: slideEl.offsetLeft - track.offsetLeft, behavior: 'smooth' });
      }
      dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
    };

    prevBtn.addEventListener('click', () => goToSlide(current - 1));
    nextBtn.addEventListener('click', () => goToSlide(current + 1));
    dots.forEach((dot, i) => dot.addEventListener('click', () => goToSlide(i)));

    track.addEventListener('scroll', () => {
      const slideWidth = track.children[0]?.offsetWidth || 1;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 24;
      const scrollIndex = Math.round(track.scrollLeft / (slideWidth + gap));
      if (scrollIndex !== current && scrollIndex >= 0 && scrollIndex < slides.length) {
        current = scrollIndex;
        dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
      }
    }, { passive: true });
  }

  block.replaceChildren(wrapper);
}
