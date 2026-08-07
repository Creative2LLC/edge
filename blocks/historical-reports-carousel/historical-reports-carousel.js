import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import attachDragScroll, { scrollToCarouselItem } from '../../scripts/carousel-utils.js';

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

function isReportSlideRow(row) {
  const cols = [...row.children];
  return Boolean(
    row.querySelector('[data-aue-prop="year"]')
      || row.querySelector('[data-aue-prop="reportCount"]')
      || row.querySelector('[data-aue-prop="coverImage"]')
      || row.querySelector('picture, img')
      || cols.length >= 5,
  );
}

function isLikelyYear(value) {
  return /^\d{4}$/.test(String(value || '').trim());
}

function getItemColumns(row) {
  const cols = [...row.children];
  const secondValue = cols[1]?.textContent?.trim() || '';

  if (cols.length < 6 && isLikelyYear(secondValue)) {
    return {
      coverImage: 0,
      coverImageAlt: null,
      year: 1,
      reportCount: 2,
      linkText: 3,
      linkUrl: 4,
    };
  }

  return ITEM_COLUMN_INDEX;
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isReportSlideRow(row));
}

function getParentFallbackCell(scope, rowIndex) {
  if (!scope?.classList?.contains('historical-reports-carousel')) return null;
  const row = getParentRows(scope)[rowIndex];
  return row?.children?.[0] || row || null;
}

function getField(scope, name, rowIndexMap, columnIndex = 0) {
  const rowIndex = rowIndexMap?.[name];
  const fallbackCell = rowIndexMap === ITEM_COLUMN_INDEX
    ? scope.children[columnIndex]
    : getParentFallbackCell(scope, rowIndex);
  const linkField = readLinkField(scope, name, { rowIndex, columnIndex, fallbackCell });
  const textField = readTextField(scope, name, { rowIndex, columnIndex, fallbackCell });
  return {
    source: linkField.source || textField.source || linkField.cell || textField.cell,
    value: linkField.value || textField.value,
    html: (linkField.cell || textField.cell)?.innerHTML || '',
  };
}

function getItemTextField(row, name, columnIndex = 0) {
  const fallbackCell = columnIndex === null ? null : row.children[columnIndex];
  const field = readTextField(row, name, { fallbackCell });
  return {
    source: field.source || field.cell,
    value: field.value,
    html: field.cell?.innerHTML || '',
  };
}

function getItemLinkField(row, name, columnIndex = 0) {
  const fallbackCell = columnIndex === null ? null : row.children[columnIndex];
  const field = readLinkField(row, name, { fallbackCell });
  return {
    source: field.source || field.cell,
    value: field.value,
    html: field.cell?.innerHTML || '',
  };
}

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

const IMAGE_SOURCE_PATTERN = /\.(avif|bmp|gif|jfif|jpe?g|png|svg|webp)(\?.*)?$/i;

function normalizeReferenceValue(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return resourcePathFromUrn(trimmed) || trimmed;
  }

  if (Array.isArray(value)) {
    return value.reduce((result, item) => result || normalizeReferenceValue(item), '');
  }

  if (typeof value === 'object') {
    const preferredKeys = [
      'path',
      'url',
      'href',
      'src',
      'fileReference',
      'reference',
      'destination',
      'value',
      '_path',
      'repo:path',
      'asset',
    ];
    const preferredValue = preferredKeys
      .reduce((result, key) => result || normalizeReferenceValue(value[key]), '');

    if (preferredValue) return preferredValue;

    return Object.values(value)
      .reduce((result, item) => result || normalizeReferenceValue(item), '');
  }

  return '';
}

async function getFieldValueFromResourceJson(scope, name) {
  const resource = scope?.getAttribute('data-aue-resource')
    || scope?.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return '';

  try {
    const response = await fetch(`${resourcePath}.json`);
    if (!response.ok) return '';
    const data = await response.json();
    return normalizeReferenceValue(data?.[name]);
  } catch (error) {
    return '';
  }
}

function normalizeImageSource(value) {
  const normalized = normalizeReferenceValue(value);
  if (!normalized) return '';

  const trimmed = normalized.trim();
  if (!trimmed) return '';

  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (IMAGE_SOURCE_PATTERN.test(trimmed)) return trimmed;

  const isUrlLike = /^(https?:)?\/\//i.test(trimmed)
    || trimmed.startsWith('/')
    || trimmed.startsWith('./')
    || trimmed.startsWith('../');

  if (isUrlLike && trimmed.includes('/content/dam/')) return trimmed;

  return '';
}

function normalizeLinkValue(value) {
  const normalized = normalizeReferenceValue(value).trim();
  if (!normalized || /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized)) {
    return '';
  }

  if (/^(https?:)?\/\//i.test(normalized)) return normalized;
  if (/^(mailto:|tel:)/i.test(normalized)) return normalized;
  if (normalized.startsWith('/') || normalized.startsWith('./') || normalized.startsWith('../')) {
    return normalized;
  }

  return '';
}

function findPublishedLinkField(row, startIndex = 0) {
  const cells = [...row.children].slice(Math.max(startIndex, 0));

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const anchor = cell.tagName === 'A' ? cell : cell.querySelector?.('a[href]');
    const href = normalizeLinkValue(anchor?.getAttribute?.('href') || anchor?.href || '');
    if (href) {
      return {
        source: cell,
        value: href,
        html: cell.innerHTML || '',
      };
    }

    const textHref = normalizeLinkValue(cell.textContent || '');
    if (textHref) {
      return {
        source: cell,
        value: textHref,
        html: cell.innerHTML || '',
      };
    }
  }

  return { source: null, value: '', html: '' };
}

function normalizeLinkLabel(value) {
  return String(value || '').replace(/\s*(?:→|->)\s*$/g, '').trim();
}

function getImageField(row, propName, columnIndex = 0) {
  const field = readImageField(row, propName, { fallbackCell: row.children[columnIndex] });
  const source = field.source || field.cell;
  const { picture, img } = field;
  const anchor = source?.tagName === 'A' ? source : source?.querySelector('a');
  const sourceValue = source?.getAttribute('href')
    || source?.getAttribute('src')
    || source?.getAttribute('value')
    || '';
  const textValue = source?.textContent?.trim() || '';
  const resolvedSrc = normalizeImageSource(img?.getAttribute('src') || img?.src)
    || normalizeImageSource(anchor?.getAttribute('href') || anchor?.href)
    || normalizeImageSource(sourceValue)
    || normalizeImageSource(textValue);

  return {
    source,
    picture,
    img,
    src: resolvedSrc,
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
    const picture = imageField.picture.cloneNode(true);
    const pictureImg = picture.querySelector('img');
    if (pictureImg && altText) pictureImg.alt = altText;

    if (imageField.source && imageField.source !== imageField.picture) {
      moveInstrumentation(imageField.source, picture);
    }
    moveInstrumentation(imageField.picture, picture);
    if (imageField.img && pictureImg) moveInstrumentation(imageField.img, pictureImg);

    media.append(picture);
    return media;
  }

  if (imageField.img?.src) {
    const img = imageField.img.cloneNode(true);
    if (altText) img.alt = altText;
    if (imageField.source && imageField.source !== imageField.img) {
      moveInstrumentation(imageField.source, img);
    }
    moveInstrumentation(imageField.img, img);
    media.append(img);
    return media;
  }

  if (imageField.src) {
    const img = document.createElement('img');
    img.src = imageField.src;
    img.alt = altText || '';
    if (imageField.source) moveInstrumentation(imageField.source, img);
    media.append(img);
    return media;
  }

  const placeholder = document.createElement('div');
  placeholder.className = 'historical-reports-carousel-card-media-placeholder';
  placeholder.textContent = fallbackLabel;
  media.append(placeholder);
  return media;
}

async function parseSlideRow(row) {
  const itemColumns = getItemColumns(row);
  const coverImageField = getImageField(row, 'coverImage', itemColumns.coverImage);
  coverImageField.src = normalizeImageSource(coverImageField.src);
  if (!coverImageField.src) {
    coverImageField.src = normalizeImageSource(await getFieldValueFromResourceJson(row, 'coverImage'));
  }
  const coverImageAltField = getItemTextField(row, 'coverImageAlt', itemColumns.coverImageAlt);
  const yearField = getItemTextField(row, 'year', itemColumns.year);
  const reportCountField = getItemTextField(row, 'reportCount', itemColumns.reportCount);
  const linkTextField = getItemTextField(row, 'linkText', itemColumns.linkText);
  let linkUrlField = getItemLinkField(row, 'linkUrl', itemColumns.linkUrl);
  linkUrlField.value = normalizeLinkValue(linkUrlField.value);

  if (!linkUrlField.value) {
    linkUrlField = findPublishedLinkField(row, itemColumns.linkText);
  }

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
  // Label the slide in the Universal Editor content tree by its own content so
  // authors can tell reports apart instead of seeing the generic component name.
  setItemLabel(slide, [data.yearField.value, data.linkTextField.value]);

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
    link.textContent = normalizeLinkLabel(data.linkTextField.value) || DEFAULTS.linkText;
    if (data.linkTextField.source?.matches?.('[data-aue-prop]')) {
      moveFieldContent(data.linkTextField, link, link.textContent);
      link.textContent = normalizeLinkLabel(link.textContent) || DEFAULTS.linkText;
    }
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

export default async function decorate(block) {
  const headingField = getField(block, 'heading', BLOCK_ROW_INDEX);
  const subheadingField = getField(block, 'subheading', BLOCK_ROW_INDEX);
  const blockBackgroundColorField = getField(block, 'blockBackgroundColor', BLOCK_ROW_INDEX);
  const cardBackgroundColorField = getField(block, 'cardBackgroundColor', BLOCK_ROW_INDEX);
  const rows = [...block.querySelectorAll(':scope > div')];
  const slideRows = rows.filter(isReportSlideRow);
  const slideData = (await Promise.all(
    slideRows.map(async (row) => ({ row, data: await parseSlideRow(row) })),
  )).filter(({ data }) => Boolean(data));
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
    return;
  }

  const stage = document.createElement('div');
  stage.className = 'historical-reports-carousel-stage';

  const track = document.createElement('div');
  track.className = 'historical-reports-carousel-track';
  attachDragScroll(track);

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
      scrollToCarouselItem(track, slide);
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
}
