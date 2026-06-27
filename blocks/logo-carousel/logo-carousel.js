import { moveInstrumentation } from '../../scripts/scripts.js';
import { readImageField, readLinkField, readTextField } from '../../scripts/block-field-utils.js';
import { attachDragScroll } from '../../scripts/carousel-utils.js';

function getField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function getLinkField(row, name, index) {
  return readLinkField(row, name, { fallbackCell: row.children[index] });
}

function getImageField(row, name, index) {
  const field = readImageField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, picture: field.picture, img: field.img };
}

function buildSlide(data) {
  const slide = document.createElement('div');
  slide.className = 'logo-carousel-slide';
  if (data.row) moveInstrumentation(data.row, slide);

  if (!data.logoField.img && !data.logoField.picture) {
    // Authoring placeholder so an empty item is still selectable in the editor.
    slide.classList.add('is-authoring-placeholder');
    const placeholder = document.createElement('span');
    placeholder.className = 'logo-carousel-placeholder';
    placeholder.textContent = 'Add a logo image';
    slide.append(placeholder);
    return slide;
  }

  const logoWrap = document.createElement(data.linkHref ? 'a' : 'div');
  logoWrap.className = 'logo-carousel-logo';
  if (data.linkHref) {
    logoWrap.href = data.linkHref;
  }

  let imgEl;
  if (data.logoField.picture) {
    const picture = data.logoField.picture.cloneNode(true);
    imgEl = picture.querySelector('img');
    logoWrap.append(picture);
  } else {
    imgEl = data.logoField.img.cloneNode(true);
    logoWrap.append(imgEl);
  }

  if (imgEl) {
    if (data.altText) imgEl.alt = data.altText;
    imgEl.loading = 'lazy';
  }

  if (data.logoField.source) {
    moveInstrumentation(data.logoField.source, imgEl || logoWrap);
  }

  slide.append(logoWrap);
  return slide;
}

function buildControls() {
  const controls = document.createElement('div');
  controls.className = 'logo-carousel-controls';

  // Slider bar (left)
  const bar = document.createElement('div');
  bar.className = 'logo-carousel-bar';
  const barTrack = document.createElement('div');
  barTrack.className = 'logo-carousel-bar-track';
  const barThumb = document.createElement('div');
  barThumb.className = 'logo-carousel-bar-thumb';
  barTrack.append(barThumb);
  bar.append(barTrack);

  // Nav buttons (right)
  const nav = document.createElement('div');
  nav.className = 'logo-carousel-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'logo-carousel-nav-btn logo-carousel-prev';
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous logos');
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'logo-carousel-nav-btn logo-carousel-next';
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next logos');
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  nav.append(prevBtn, nextBtn);
  controls.append(bar, nav);

  return {
    controls,
    barTrack,
    barThumb,
    prevBtn,
    nextBtn,
  };
}

function updateBarThumb(track, barTrack, barThumb) {
  const max = track.scrollWidth - track.clientWidth;
  if (max <= 0) {
    barThumb.style.width = '100%';
    barThumb.style.transform = 'translateX(0)';
    return;
  }
  const visibleRatio = Math.min(1, track.clientWidth / track.scrollWidth);
  const thumbWidth = Math.max(visibleRatio * barTrack.clientWidth, 24);
  const progress = track.scrollLeft / max;
  const offset = (barTrack.clientWidth - thumbWidth) * progress;
  barThumb.style.width = `${thumbWidth}px`;
  barThumb.style.transform = `translateX(${offset}px)`;
}

function getStepDistance(track) {
  // Scroll roughly one viewport at a time, but never less than one slide width.
  const firstSlide = track.querySelector('.logo-carousel-slide');
  const slideWidth = firstSlide ? firstSlide.getBoundingClientRect().width : 0;
  const gapPx = parseFloat(window.getComputedStyle(track).columnGap || '0') || 0;
  return Math.max(slideWidth + gapPx, track.clientWidth * 0.8);
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const slides = [];
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 1) return;

    const logoField = getImageField(row, 'logo', 0);
    const altField = getField(row, 'logoAlt', 1);
    const linkField = getLinkField(row, 'logoLink', 2);

    const isAuthoring = Boolean(
      row.getAttribute('data-aue-resource')
        || row.querySelector('[data-aue-resource], [data-aue-prop]'),
    );

    if (!logoField.img && !logoField.picture && !isAuthoring) return;

    slides.push({
      logoField,
      altText: altField.value,
      linkHref: linkField.value,
      row,
    });
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'logo-carousel-wrapper';

  const track = document.createElement('div');
  track.className = 'logo-carousel-track';

  slides.forEach((data) => {
    track.append(buildSlide(data));
  });

  wrapper.append(track);

  const {
    controls, barTrack, barThumb, prevBtn, nextBtn,
  } = buildControls();
  wrapper.append(controls);

  block.replaceChildren(wrapper);
  attachDragScroll(track);

  // Wire up interactions
  const refreshBar = () => updateBarThumb(track, barTrack, barThumb);

  prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -getStepDistance(track), behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: getStepDistance(track), behavior: 'smooth' });
  });

  track.addEventListener('scroll', refreshBar, { passive: true });
  window.addEventListener('resize', refreshBar);

  // Wait for images so the scrollWidth is accurate.
  const imgs = [...track.querySelectorAll('img')];
  if (imgs.length === 0) {
    refreshBar();
  } else {
    let pending = imgs.length;
    const done = () => {
      pending -= 1;
      if (pending <= 0) refreshBar();
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    });
  }
}
