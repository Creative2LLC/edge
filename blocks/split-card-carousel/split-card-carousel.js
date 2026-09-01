import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import attachDragScroll, { getCarouselItemIndex, scrollToCarouselItem } from '../../scripts/carousel-utils.js';
import focusScrollableRegion from '../../scripts/a11y-utils.js';

function getField(row, name, index) {
  const field = readTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getRichField(row, name, index) {
  const field = readRichTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.html, text: field.text };
}

function getLinkField(row, name, index) {
  const field = readLinkField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getImageField(row, index) {
  const { picture, img } = readImageField(row, 'image', { fallbackCell: row.children[index] });
  return { picture, img };
}

// EDS auto-links any text starting with `#` (hex colors included) into an
// anchor whose resolved href is a full URL. textContent of the cell can come
// back as that URL - which CSS rejects as a color, silently breaking the
// outlined border + text color. Walk the cell to recover the hex itself.
function extractHexColor(cell) {
  if (!cell) return '';
  const hexRe = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/i;
  const anchor = cell.querySelector?.('a');
  if (anchor) {
    const href = anchor.getAttribute('href') || '';
    const hrefMatch = href.match(hexRe);
    if (hrefMatch) return hrefMatch[0];
    const anchorText = anchor.textContent?.trim() || '';
    const anchorMatch = anchorText.match(hexRe);
    if (anchorMatch) return anchorMatch[0];
  }
  const text = cell.textContent?.trim() || '';
  const textMatch = text.match(hexRe);
  return textMatch ? textMatch[0] : '';
}

function getColorField(row, name, index) {
  const field = readTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: extractHexColor(field.cell) };
}

function emptyField() {
  return { source: null, value: '', text: '' };
}

function textAt(row, index) {
  return row.children[index]?.textContent?.trim() || '';
}

function normalizeVariant(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['default', 'variant-2', 'variant-3'].includes(normalized) ? normalized : '';
}

function isLikelyBodyText(value) {
  return String(value || '').trim().length > 90;
}

function getSlideFieldMap(row) {
  const hasNamedHeading = Boolean(row.querySelector('[data-aue-prop="heading"]'));
  const hasPicture = Boolean(row.querySelector('picture, img'));
  const columnCount = row.children.length;

  if (!hasNamedHeading && hasPicture && columnCount <= 8) {
    const firstTextCellIsBody = isLikelyBodyText(textAt(row, 1))
      && !isLikelyBodyText(textAt(row, 2));

    if (firstTextCellIsBody) {
      return {
        image: 0,
        imageAlt: -1,
        heading: -1,
        subheading: 1,
        buttonText: 2,
        buttonLink: 3,
        buttonColor: 4,
        buttonStyle: 5,
        button2Text: 6,
        button2Link: 7,
        button2Color: -1,
        button2Style: -1,
        backgroundColor: -1,
        contentAlign: -1,
      };
    }

    return {
      image: 0,
      imageAlt: -1,
      heading: 1,
      subheading: 2,
      buttonText: 3,
      buttonLink: 4,
      buttonColor: 5,
      buttonStyle: 6,
      button2Text: -1,
      button2Link: -1,
      button2Color: -1,
      button2Style: -1,
      backgroundColor: -1,
      contentAlign: 7,
    };
  }

  return {
    image: 0,
    imageAlt: 1,
    heading: 2,
    subheading: 3,
    buttonText: 4,
    buttonLink: 5,
    buttonColor: 6,
    buttonStyle: 7,
    button2Text: 8,
    button2Link: 9,
    button2Color: 10,
    button2Style: 11,
    backgroundColor: 12,
    contentAlign: 13,
  };
}

function normalizeButtonStyle(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v.includes('outline') || v.includes('border')) return 'outlined';
  return 'default';
}

function applyButtonStyle(button, backgroundColor, style) {
  const normalized = normalizeButtonStyle(style);
  const accent = backgroundColor || '#008db6';
  button.style.setProperty('--btn-accent', accent);

  if (normalized === 'outlined') {
    button.classList.add('is-outlined');
    button.style.setProperty('background-color', 'transparent', 'important');
    button.style.setProperty('color', accent, 'important');
    button.style.setProperty('border', `1px solid ${accent}`, 'important');
    return;
  }

  if (backgroundColor) {
    button.style.setProperty('background-color', backgroundColor, 'important');
  }
}

function buildButton(text, href, backgroundColor, style) {
  if (!text && !href) return null;
  const btn = document.createElement(href ? 'a' : 'span');
  btn.className = 'split-card-carousel-button';
  if (href) btn.href = href;
  btn.textContent = text || 'Learn More';
  applyButtonStyle(btn, backgroundColor, style);
  return btn;
}

function buildSlide(data, row) {
  const slide = document.createElement('div');
  slide.className = 'split-card-carousel-slide';
  if (row) moveInstrumentation(row, slide);
  setItemLabel(slide, [data.headingText, data.subheadingText]);

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

  // h3, not h2. The slide heading sits UNDER the section title, which is
  // already an h2 (see split-card-carousel-title below), so h3 is the correct
  // level — and it inherits --heading-3-size instead of the much larger
  // --heading-2-size the slide was picking up purely from its tag. Sizing is
  // fixed by using the right element rather than by overriding font-size on the
  // class, which is what left 143 blocks hardcoding sizes elsewhere.
  if (data.heading) {
    const slideHeading = document.createElement('h3');
    slideHeading.className = 'split-card-carousel-heading';
    slideHeading.innerHTML = data.heading;
    contentSide.append(slideHeading);
  }

  if (data.subheading) {
    const sub = document.createElement('div');
    sub.className = 'split-card-carousel-subheading';
    sub.innerHTML = data.subheading;
    contentSide.append(sub);
  }

  const btn1 = buildButton(data.buttonText, data.buttonLink, data.buttonColor, data.buttonStyle);
  const btn2 = buildButton(
    data.button2Text,
    data.button2Link,
    data.button2Color,
    data.button2Style,
  );

  if (btn1 || btn2) {
    const buttonRow = document.createElement('div');
    buttonRow.className = 'split-card-carousel-buttons';
    if (btn1) buttonRow.append(btn1);
    if (btn2) buttonRow.append(btn2);
    contentSide.append(buttonRow);
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
  let variant = 'default';
  const slideRows = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) {
      // Single-column row - block-level config field
      const headingEl = row.querySelector('[data-aue-prop="heading"]');
      const descEl = row.querySelector('[data-aue-prop="description"]');
      const variantEl = row.querySelector('[data-aue-prop="variant"]');
      if (headingEl) sectionTitle = headingEl.textContent.trim();
      else if (descEl) sectionDescription = descEl.textContent.trim();
      else if (variantEl) variant = variantEl.textContent.trim() || 'default';
      else {
        // Fallback: first single-col row without prop = heading,
        // second = description, variant rows are config only.
        const text = row.textContent.trim();
        const variantValue = normalizeVariant(text);
        if (variantValue) variant = variantValue;
        else if (text && !sectionTitle) sectionTitle = text;
        else if (text && !sectionDescription) sectionDescription = text;
      }
    } else {
      slideRows.push(row);
    }
  });

  variant = normalizeVariant(variant) || 'default';
  const isVariant2 = variant === 'variant-2';
  if (isVariant2) block.classList.add('variant-2');
  if (variant === 'variant-3') block.classList.add('variant-3');

  // Parse slides - each slide row has fields as columns
  // Item field order: 0:image, 1:imageAlt, 2:heading, 3:subheading,
  // 4:buttonText, 5:buttonLink, 6:buttonColor, 7:buttonStyle,
  // 8:button2Text, 9:button2Link, 10:button2Color, 11:button2Style,
  // 12:backgroundColor, 13:contentAlign
  const slides = [];
  slideRows.forEach((row) => {
    const fieldMap = getSlideFieldMap(row);
    const imageField = getImageField(row, fieldMap.image);
    const imageAltField = fieldMap.imageAlt >= 0 ? getField(row, 'imageAlt', fieldMap.imageAlt) : emptyField();
    const headingField = fieldMap.heading >= 0 ? getRichField(row, 'heading', fieldMap.heading) : emptyField();
    const subheadingField = getRichField(row, 'subheading', fieldMap.subheading);
    const buttonTextField = getField(row, 'buttonText', fieldMap.buttonText);
    const buttonLinkField = getLinkField(row, 'buttonLink', fieldMap.buttonLink);
    const buttonColorField = getColorField(row, 'buttonColor', fieldMap.buttonColor);
    const buttonStyleField = getField(row, 'buttonStyle', fieldMap.buttonStyle);
    const button2TextField = getField(row, 'button2Text', fieldMap.button2Text);
    const button2LinkField = getLinkField(row, 'button2Link', fieldMap.button2Link);
    const button2ColorField = getColorField(row, 'button2Color', fieldMap.button2Color);
    const button2StyleField = getField(row, 'button2Style', fieldMap.button2Style);
    const bgColorField = getColorField(row, 'backgroundColor', fieldMap.backgroundColor);
    const contentAlignField = getField(row, 'contentAlign', fieldMap.contentAlign);

    slides.push({
      data: {
        imageField,
        imageAlt: imageAltField.value,
        heading: headingField.value,
        headingText: headingField.text,
        subheading: subheadingField.value,
        subheadingText: subheadingField.text,
        buttonText: buttonTextField.value,
        buttonLink: buttonLinkField.value,
        buttonColor: buttonColorField.value,
        buttonStyle: buttonStyleField.value,
        button2Text: button2TextField.value,
        button2Link: button2LinkField.value,
        button2Color: button2ColorField.value,
        button2Style: button2StyleField.value,
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
  focusScrollableRegion(track, 'Carousel cards');
  attachDragScroll(track);

  const controls = document.createElement('div');
  controls.className = 'split-card-carousel-controls';

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

  const goToSlide = (index) => {
    const total = slides.length;
    if (total === 0) return;
    current = ((index % total) + total) % total;
    const slideEl = track.children[current];
    if (slideEl) {
      beginProgrammaticScroll();
      scrollToCarouselItem(track, slideEl);
    }
    updateDots(dots, current);
  };

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
}
