import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import attachDragScroll, {
  createCarouselArrow,
  getCarouselItemIndex,
  scrollToCarouselItem,
  setCurrentCarouselDot,
} from '../../scripts/carousel-utils.js';
import {
  BUTTON_STYLES,
  applyButtonStyle,
  isDarkSurface,
  markButtonSurface,
  resolveAuthoredButtonStyle,
} from '../../scripts/button-utils.js';

function extractHexColor(el) {
  if (!el) return '';
  const anchor = el.querySelector('a');
  if (anchor) {
    const href = anchor.getAttribute('href') || '';
    const hexMatch = href.match(/#(?:[0-9a-f]{3,8})\b/i);
    if (hexMatch) return hexMatch[0];
    const text = anchor.textContent.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(text)) return text;
  }
  return '';
}

function getField(row, name, index) {
  const field = readTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getColorField(row, name, index) {
  const field = readTextField(row, name, { fallbackCell: row.children[index] });
  const hex = extractHexColor(field.cell);
  if (hex) return { source: field.source, value: hex };
  if (/^#[0-9a-f]{3,8}$/i.test(field.value)) return { source: field.source, value: field.value };
  return { source: field.source, value: '' };
}

function getRichField(row, name, index) {
  const field = readRichTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.html };
}

function getLinkField(row, name, index) {
  const field = readLinkField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getImageField(row, index) {
  const { picture, img } = readImageField(row, 'image', { fallbackCell: row.children[index] });
  return { picture, img };
}

function hasAuthoringContext(row) {
  return Boolean(
    row?.getAttribute?.('data-aue-resource')
      || row?.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function cellText(cell) {
  return cell?.textContent?.trim() || '';
}

function cellHtml(cell) {
  return cell?.innerHTML?.trim() || '';
}

function hasMedia(cell) {
  return Boolean(cell?.matches?.('picture, img') || cell?.querySelector?.('picture, img'));
}

function nonEmptyCells(row) {
  return [...(row?.children || [])].filter((cell) => hasMedia(cell) || cellText(cell));
}

function getCellLink(cell) {
  const anchor = cell?.tagName === 'A' ? cell : cell?.querySelector?.('a');
  return anchor?.getAttribute('href') || cell?.getAttribute?.('href') || cellText(cell);
}

function getCellColor(cell) {
  const hex = extractHexColor(cell);
  if (hex) return hex;

  const text = cellText(cell);
  const match = text.match(/#(?:[0-9a-f]{3,8})\b/i);
  return match ? match[0] : '';
}

function isButtonStyle(value) {
  // Legacy values plus the seven the style dropdown now stores.
  const style = String(value || '').trim().toLowerCase();
  return ['solid', 'outlined', 'link', ...BUTTON_STYLES].includes(style);
}

function readAuthoredSlideData(row) {
  const imageField = getImageField(row, 0);
  const imageAltField = getField(row, 'imageAlt', 1);
  const headingField = getField(row, 'heading', 2);
  const subheadingField = getRichField(row, 'subheading', 3);
  const buttonTextField = getField(row, 'buttonText', 4);
  const buttonLinkField = getLinkField(row, 'buttonLink', 5);
  const buttonColorField = getColorField(row, 'buttonColor', 6);
  const buttonTextColorField = getColorField(row, 'buttonTextColor', 7);
  const buttonStyleField = getField(row, 'buttonStyle', 8);
  const linkTextField = getField(row, 'linkText', 9);
  const linkUrlField = getLinkField(row, 'linkUrl', 10);
  const linkColorField = getColorField(row, 'linkColor', 11);
  const contentBgField = getColorField(row, 'contentBackgroundColor', 12);

  return {
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
    contentBackgroundColor: contentBgField.value,
  };
}

function readLiveSlideData(row) {
  const imageField = getImageField(row, 0);
  const cells = nonEmptyCells(row);
  let index = hasMedia(cells[0]) ? 1 : 0;

  const takeText = () => {
    const value = cellText(cells[index]);
    index += 1;
    return value;
  };
  const takeHtml = () => {
    const value = cellHtml(cells[index]);
    index += 1;
    return value;
  };
  const takeColor = () => {
    const color = getCellColor(cells[index]);
    if (color) index += 1;
    return color;
  };
  const takeStyle = () => {
    const value = cellText(cells[index]).toLowerCase();
    if (!isButtonStyle(value)) return '';
    index += 1;
    return value;
  };
  const takeLink = () => {
    const cell = cells[index];
    if (!cell || getCellColor(cell) || isButtonStyle(cellText(cell))) return '';
    index += 1;
    return getCellLink(cell);
  };

  const heading = takeText();
  const subheading = takeHtml();
  const buttonText = takeText();
  const buttonLink = takeLink();
  const buttonColor = takeColor();
  const buttonTextColor = takeColor();
  const buttonStyle = takeStyle() || 'solid';
  const linkText = takeText();
  const linkUrl = takeLink();
  const linkColor = takeColor();
  const contentBackgroundColor = takeColor();

  return {
    imageField,
    imageAlt: imageField.img?.alt || heading,
    heading,
    subheading,
    buttonText,
    buttonLink,
    buttonColor,
    buttonTextColor,
    buttonStyle,
    linkText,
    linkUrl,
    linkColor,
    contentBackgroundColor,
  };
}

function readSlideData(row) {
  return hasAuthoringContext(row) ? readAuthoredSlideData(row) : readLiveSlideData(row);
}

// The look comes from the button standard. The old colour picker only chooses the style
// now (gold -> AMBER, red -> Emergency); the text colour picker is ignored.
function styleButton(btn, color, style) {
  applyButtonStyle(btn, resolveAuthoredButtonStyle(style, color));
}

function buildSlide(data, row) {
  const slide = document.createElement('div');
  slide.className = 'stc-slide';
  if (row) moveInstrumentation(row, slide);
  setItemLabel(slide, [data.heading]);

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

  if (data.contentBackgroundColor) {
    contentSide.style.setProperty('background-color', data.contentBackgroundColor, 'important');
  }
  markButtonSurface(contentSide, isDarkSurface(data.contentBackgroundColor));

  if (data.heading) {
    // h3: the slide heading sits under the section title (.stc-title), which is
    // the h2. Same fix as split-card-carousel — the slide was only picking up
    // --heading-2-size from its tag, and icon-card-carousel / resources-carousel
    // already use this h2-section / h3-slide pairing.
    const slideHeading = document.createElement('h3');
    slideHeading.className = 'stc-heading';
    slideHeading.textContent = data.heading;
    contentSide.append(slideHeading);
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
    styleButton(btn, data.buttonColor, data.buttonStyle);
    contentSide.append(btn);
  }

  /* Link — the Text link style. One with nowhere to go is not published; in the
     editor it still shows, disabled, so the author can see the URL is missing. */
  if ((data.linkText || data.linkUrl) && (data.linkUrl || hasAuthoringContext(row))) {
    const link = document.createElement(data.linkUrl ? 'a' : 'span');
    link.className = 'stc-link';
    link.textContent = data.linkText || 'Learn More';
    if (data.linkUrl) {
      link.href = data.linkUrl;
    } else {
      link.setAttribute('aria-disabled', 'true');
      link.title = 'Add a URL to publish this link';
    }
    applyButtonStyle(link, 'text-link');
    contentSide.append(link);
  }

  card.append(contentSide);
  slide.append(card);
  return slide;
}

function updateDots(dots, activeIndex) {
  setCurrentCarouselDot(dots, activeIndex);
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
    slides.push({
      data: readSlideData(row),
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
  attachDragScroll(track);

  /* Controls */
  const controls = document.createElement('div');
  controls.className = 'stc-controls';

  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'stc-dots carousel-dots';
  const dots = [];
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'stc-dot carousel-dot';
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.type = 'button';
    if (i === 0) dot.setAttribute('aria-current', 'true');
    dots.push(dot);
    dotsContainer.append(dot);
  });
  controls.append(dotsContainer);

  const nav = document.createElement('div');
  nav.className = 'stc-nav';

  const prevBtn = createCarouselArrow('prev', {
    className: 'stc-nav-btn',
    label: 'Previous slide',
  });

  const nextBtn = createCarouselArrow('next', { className: 'stc-nav-btn', label: 'Next slide' });

  nav.append(prevBtn);
  nav.append(nextBtn);
  controls.append(nav);
  wrapper.append(controls);

  /* Carousel state */
  let current = 0;

  // The nav owns the index. Where the slides nearly fit, ONE click reaches the
  // end stop — and getCarouselItemIndex correctly reports the LAST slide there,
  // which makes a single click jump the dots to the end. Re-sync from scroll
  // position only when the VISITOR scrolls, not while our smooth scroll settles.
  let programmaticScroll = false;
  let scrollSettleTimer;
  const beginProgrammaticScroll = () => {
    programmaticScroll = true;
    window.clearTimeout(scrollSettleTimer);
    scrollSettleTimer = window.setTimeout(() => {
      programmaticScroll = false;
    }, 500);
  };

  function goToSlide(index) {
    const total = slides.length;
    if (total === 0) return;
    current = ((index % total) + total) % total;
    const slideEl = track.children[current];
    if (slideEl) {
      beginProgrammaticScroll();
      scrollToCarouselItem(track, slideEl);
    }
    updateDots(dots, current);
  }

  prevBtn.addEventListener('click', () => goToSlide(current - 1));
  nextBtn.addEventListener('click', () => goToSlide(current + 1));
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => goToSlide(i));
  });

  track.addEventListener('scroll', () => {
    if (programmaticScroll) return;
    const scrollIndex = getCarouselItemIndex(track, [...track.children]);
    if (scrollIndex !== current && scrollIndex >= 0) {
      current = scrollIndex;
      updateDots(dots, current);
    }
  });

  block.replaceChildren(wrapper);

  /* Match card heights to the tallest card */
  const cards = [...track.querySelectorAll('.stc-card')];
  function syncCardHeights() {
    cards.forEach((c) => c.style.removeProperty('min-height'));
    const tallest = Math.ceil(
      Math.max(0, ...cards.map((c) => c.getBoundingClientRect().height)),
    );
    if (tallest > 0) {
      cards.forEach((c) => { c.style.minHeight = `${tallest}px`; });
    }
  }

  syncCardHeights();
  window.addEventListener('resize', syncCardHeights, { passive: true });
  track.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', syncCardHeights, { once: true });
  });
}
