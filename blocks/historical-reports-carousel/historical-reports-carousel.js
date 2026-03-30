import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  blockBackgroundColor: 2,
  cardBackgroundColor: 3,
};

const ITEM_COLUMN_INDEX = {
  coverImage: 0,
  coverImageAlt: 1,
  year: 2,
  reportCount: 3,
  linkText: 4,
  linkUrl: 5,
};

const DEFAULTS = {
  heading: 'Historical CyberTipline Reports',
  subheading: 'Access complete CyberTipline data reports from previous years.',
  cardBackgroundColor: '#f4f0ec',
  year: 'Year',
  reportCount: 'Report count',
  linkText: 'Download PDF',
};

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function extractNodeValue(node) {
  if (!node) return '';
  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  return anchor?.href || node.textContent.trim();
}

function getField(scope, name, rowIndexMap, columnIndex = 0) {
  const source = scope.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  if (source) {
    return {
      source,
      value: extractNodeValue(source),
      html: source.innerHTML,
    };
  }

  const rowIndex = rowIndexMap?.[name];
  const row = Number.isInteger(rowIndex) ? scope.children[rowIndex] : null;
  if (!row) {
    return {
      source: null,
      value: '',
      html: '',
    };
  }

  const cell = row.children[columnIndex] || row;
  return {
    source: cell,
    value: extractNodeValue(cell),
    html: cell.innerHTML,
  };
}

function getImageField(row, propName, columnIndex = 0) {
  const propSource = row.querySelector(`[data-aue-prop="${propName}"]`);
  const source = propSource || row.children[columnIndex];
  const picture = source?.querySelector('picture') || null;
  const img = source?.querySelector('img') || null;
  return {
    source,
    picture,
    img,
    src: img?.src || '',
    alt: img?.alt || '',
  };
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!field?.source) {
    target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function moveRichText(field, target, fallbackValue = '') {
  if (!field?.source) {
    target.innerHTML = field?.html || fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.innerHTML = fallbackValue;
  }
}

function createCoverImage(imageField, altText, fallbackLabel) {
  const media = document.createElement('div');
  media.className = 'historical-reports-carousel-card-media';

  if (imageField.picture) {
    const img = imageField.picture.querySelector('img');
    if (img && altText) img.alt = altText;
    if (img?.src) {
      const optimized = createOptimizedPicture(img.src, altText || img.alt || '', false, [
        { width: '480' },
      ]);
      moveInstrumentation(img, optimized.querySelector('img'));
      media.append(optimized);
      return media;
    }
  }

  if (imageField.img?.src) {
    media.append(createOptimizedPicture(imageField.img.src, altText || imageField.alt || '', false, [
      { width: '480' },
    ]));
    return media;
  }

  const placeholder = document.createElement('div');
  placeholder.className = 'historical-reports-carousel-card-media-placeholder';
  placeholder.textContent = fallbackLabel;
  media.append(placeholder);
  return media;
}

function parseSlideRow(row) {
  const coverImageField = getImageField(row, 'coverImage', ITEM_COLUMN_INDEX.coverImage);
  const coverImageAltField = getField(
    row,
    'coverImageAlt',
    ITEM_COLUMN_INDEX,
    ITEM_COLUMN_INDEX.coverImageAlt,
  );
  const yearField = getField(row, 'year', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.year);
  const reportCountField = getField(
    row,
    'reportCount',
    ITEM_COLUMN_INDEX,
    ITEM_COLUMN_INDEX.reportCount,
  );
  const linkTextField = getField(row, 'linkText', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.linkText);
  const linkUrlField = getField(row, 'linkUrl', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.linkUrl);

  const hasVisibleContent = Boolean(
    coverImageField.src
      || coverImageAltField.value
      || yearField.value
      || reportCountField.value
      || linkTextField.value
      || linkUrlField.value,
  );
  const isAuthoringPlaceholder = hasAuthoringContext(row) && !hasVisibleContent;

  if (!hasVisibleContent && !isAuthoringPlaceholder) return null;

  return {
    coverImageField,
    coverImageAltField,
    yearField,
    reportCountField,
    linkTextField,
    linkUrlField,
    isAuthoringPlaceholder,
  };
}

function buildPlaceholderSlide(row) {
  const slide = document.createElement('article');
  slide.className = 'historical-reports-carousel-slide is-authoring-placeholder';
  moveInstrumentation(row, slide);

  const card = document.createElement('div');
  card.className = 'historical-reports-carousel-card';

  const media = document.createElement('div');
  media.className = 'historical-reports-carousel-card-media';

  const mediaPlaceholder = document.createElement('div');
  mediaPlaceholder.className = 'historical-reports-carousel-card-media-placeholder';
  mediaPlaceholder.textContent = 'Report cover';

  const body = document.createElement('div');
  body.className = 'historical-reports-carousel-card-body';

  const title = document.createElement('p');
  title.className = 'historical-reports-carousel-card-year';
  title.textContent = 'New report';

  const count = document.createElement('p');
  count.className = 'historical-reports-carousel-card-count';
  count.textContent = 'Add the year, report count, image, and download link.';

  media.append(mediaPlaceholder);
  body.append(title, count);
  card.append(media, body);
  slide.append(card);
  return slide;
}

function buildSlide(data, row, cardBackgroundColor) {
  if (data.isAuthoringPlaceholder) return buildPlaceholderSlide(row);

  const slide = document.createElement('article');
  slide.className = 'historical-reports-carousel-slide';
  moveInstrumentation(row, slide);

  const card = document.createElement('div');
  card.className = 'historical-reports-carousel-card';
  card.style.backgroundColor = cardBackgroundColor || DEFAULTS.cardBackgroundColor;

  const media = createCoverImage(
    data.coverImageField,
    data.coverImageAltField.value || data.coverImageField.alt,
    DEFAULTS.year,
  );

  const body = document.createElement('div');
  body.className = 'historical-reports-carousel-card-body';

  const year = document.createElement('h3');
  year.className = 'historical-reports-carousel-card-year';
  moveFieldContent(data.yearField, year, DEFAULTS.year);

  const count = document.createElement('p');
  count.className = 'historical-reports-carousel-card-count';
  moveFieldContent(data.reportCountField, count, DEFAULTS.reportCount);

  body.append(year, count);

  if (data.linkUrlField.value) {
    const link = document.createElement('a');
    link.className = 'historical-reports-carousel-card-link';
    link.href = data.linkUrlField.value;
    moveFieldContent(data.linkTextField, link, DEFAULTS.linkText);
    body.append(link);
  } else if (hasAuthoringContext(row) && data.linkTextField.value) {
    const linkPlaceholder = document.createElement('span');
    linkPlaceholder.className = 'historical-reports-carousel-card-link is-placeholder';
    moveFieldContent(data.linkTextField, linkPlaceholder, DEFAULTS.linkText);
    body.append(linkPlaceholder);
  }

  card.append(media, body);
  slide.append(card);
  return slide;
}

function buildEmptyState() {
  const emptyState = document.createElement('div');
  emptyState.className = 'historical-reports-carousel-empty-state';

  const title = document.createElement('p');
  title.className = 'historical-reports-carousel-empty-title';
  title.textContent = 'Add report cards';

  const text = document.createElement('p');
  text.className = 'historical-reports-carousel-empty-copy';
  text.textContent = 'Use Universal Editor to add historical report items under this block.';

  emptyState.append(title, text);
  return emptyState;
}

function updateDots(dots, activeIndex) {
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === activeIndex);
  });
}

function observeReveal(block) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    block.classList.add('is-visible');
    observer.disconnect();
  }, { threshold: 0.18 });

  observer.observe(block);
}

export default function decorate(block) {
  const headingField = getField(block, 'heading', BLOCK_ROW_INDEX);
  const subheadingField = getField(block, 'subheading', BLOCK_ROW_INDEX);
  const blockBackgroundColorField = getField(block, 'blockBackgroundColor', BLOCK_ROW_INDEX);
  const cardBackgroundColorField = getField(block, 'cardBackgroundColor', BLOCK_ROW_INDEX);
  const rows = [...block.querySelectorAll(':scope > div')];
  const slideRows = rows.filter((row) => {
    const cols = [...row.children];
    return row.querySelector('[data-aue-prop="year"]')
      || row.querySelector('[data-aue-prop="reportCount"]')
      || row.querySelector('[data-aue-prop="coverImage"]')
      || cols.length >= 6;
  });
  const slideData = slideRows
    .map((row) => ({ row, data: parseSlideRow(row) }))
    .filter(({ data }) => Boolean(data));
  const isAuthoring = hasAuthoringContext(block);

  const wrapper = document.createElement('div');
  wrapper.className = 'historical-reports-carousel-wrapper';

  if (blockBackgroundColorField.value) {
    block.style.backgroundColor = blockBackgroundColorField.value;
  }

  if (headingField.value) {
    const heading = document.createElement('h2');
    heading.className = 'historical-reports-carousel-heading';
    moveFieldContent(headingField, heading, DEFAULTS.heading);
    wrapper.append(heading);
  }

  if (subheadingField.value) {
    const subheading = document.createElement('div');
    subheading.className = 'historical-reports-carousel-subheading';
    moveRichText(subheadingField, subheading, DEFAULTS.subheading);
    wrapper.append(subheading);
  }

  if (!slideData.length && isAuthoring) {
    wrapper.append(buildEmptyState());
    block.replaceChildren(wrapper);
    observeReveal(block);
    return;
  }

  const stage = document.createElement('div');
  stage.className = 'historical-reports-carousel-stage';

  const track = document.createElement('div');
  track.className = 'historical-reports-carousel-track';

  const slides = slideData.map(({ row, data }, index) => {
    const slide = buildSlide(data, row, cardBackgroundColorField.value);
    slide.style.setProperty('--historical-slide-index', index);
    track.append(slide);
    return slide;
  });

  stage.append(track);

  wrapper.append(stage);

  if (slides.length > 1) {
    const prevButton = document.createElement('button');
    prevButton.className = 'historical-reports-carousel-nav historical-reports-carousel-nav-prev';
    prevButton.type = 'button';
    prevButton.setAttribute('aria-label', 'Previous report');
    prevButton.innerHTML = '<span aria-hidden="true">&#8249;</span>';

    const nextButton = document.createElement('button');
    nextButton.className = 'historical-reports-carousel-nav historical-reports-carousel-nav-next';
    nextButton.type = 'button';
    nextButton.setAttribute('aria-label', 'Next report');
    nextButton.innerHTML = '<span aria-hidden="true">&#8250;</span>';

    stage.append(prevButton, nextButton);

    const dots = slides.map((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'historical-reports-carousel-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Go to report ${index + 1}`);
      return dot;
    });
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'historical-reports-carousel-dots';
    dots.forEach((dot) => dotsContainer.append(dot));

    let currentIndex = 0;

    const goToSlide = (targetIndex) => {
      if (!slides.length) return;
      currentIndex = ((targetIndex % slides.length) + slides.length) % slides.length;
      const slide = slides[currentIndex];
      track.scrollTo({
        left: slide.offsetLeft - track.offsetLeft,
        behavior: 'smooth',
      });
      updateDots(dots, currentIndex);
    };

    prevButton.addEventListener('click', () => goToSlide(currentIndex - 1));
    nextButton.addEventListener('click', () => goToSlide(currentIndex + 1));
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => goToSlide(index));
    });
    updateDots(dots, currentIndex);

    track.addEventListener('scroll', () => {
      const slideWidth = slides[0]?.offsetWidth || 1;
      const styles = getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '0');
      const scrollIndex = Math.round(track.scrollLeft / (slideWidth + gap));
      if (scrollIndex >= 0 && scrollIndex < slides.length && scrollIndex !== currentIndex) {
        currentIndex = scrollIndex;
        updateDots(dots, currentIndex);
      }
    }, { passive: true });

    wrapper.append(dotsContainer);
  }

  if (!headingField.value && !subheadingField.value) {
    block.classList.add('historical-reports-carousel-no-header');
  }

  block.replaceChildren(wrapper);
  observeReveal(block);
}
