import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const CARD_PROPS = [
  'cardNumber',
  'cardTitle',
  'cardBody',
  'numberColor',
  'titleColor',
  'bodyColor',
  'cardBackgroundColor',
];

const DEFAULTS = {
  blockBackgroundColor: '#efebe8',
  cardBackgroundColor: '#00264d',
  activeCardBackgroundColor: '#1598bf',
  activeNumberColor: '#ffffff',
  gridNumberColor: '#92d6e3',
  carouselNumberColor: '#12a0ca',
};

const resourceDataCache = new Map();

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

function normalizeJsonFieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.href || value.path || value.url || '').trim();
  }
  return '';
}

function normalizeColorValue(value) {
  const normalized = normalizeJsonFieldValue(value);
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalized) && hexMatch) {
    return hexMatch[0];
  }

  return normalized;
}

async function getResourceData(scope) {
  const resource = scope?.getAttribute('data-aue-resource')
    || scope?.querySelector?.('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || scope?.closest?.('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return {};

  if (resourceDataCache.has(resourcePath)) {
    return resourceDataCache.get(resourcePath);
  }

  const pendingData = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return {};
      return response.json();
    })
    .catch(() => ({}));

  resourceDataCache.set(resourcePath, pendingData);
  return pendingData;
}

function getFieldSelector(name) {
  return `[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`;
}

function getBlockField(block, name) {
  const source = block.querySelector(getFieldSelector(name));
  return {
    source,
    value: source?.textContent.trim() || '',
  };
}

function getRowTextField(row, name, index) {
  const source = row.querySelector(getFieldSelector(name));
  if (source) return source.textContent.trim();
  const cols = [...row.children];
  return cols[index]?.textContent.trim() || '';
}

function getRichField(row, name, index) {
  const source = row.querySelector(getFieldSelector(name));
  if (source) return source;
  const cols = [...row.children];
  return cols[index] || null;
}

function getImageField(scope, name) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  const container = source?.parentElement || source;
  const picture = source?.querySelector('picture')
    || container?.querySelector('picture')
    || scope.querySelector('picture')
    || null;
  const img = source?.querySelector('img')
    || container?.querySelector('img')
    || picture?.querySelector('img')
    || scope.querySelector('img')
    || null;
  return { source, picture, img };
}

function moveFieldContent(source, target, fallbackValue = '') {
  if (!source || !target) return;
  moveInstrumentation(source, target);
  if (source.firstChild) {
    while (source.firstChild) {
      target.append(source.firstChild);
    }
    return;
  }
  if (fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function buildOptimizedPicture(imageField, altText, width) {
  if (!imageField.img) return null;

  const optimized = createOptimizedPicture(
    imageField.img.src,
    altText || imageField.img.alt || '',
    false,
    [{ width: `${width}` }],
  );
  const optimizedImg = optimized.querySelector('img');

  if (optimizedImg && altText) {
    optimizedImg.alt = altText;
  }

  if (
    imageField.source
    && imageField.source !== imageField.picture
    && imageField.source !== imageField.img
  ) {
    moveInstrumentation(imageField.source, optimized);
  }

  if (imageField.picture && imageField.picture !== imageField.source) {
    moveInstrumentation(imageField.picture, optimized);
  }

  if (imageField.img && optimizedImg) {
    moveInstrumentation(imageField.img, optimizedImg);
  }

  return optimized;
}

function updateDots(dots, activeIndex) {
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === activeIndex);
  });
}

function applyCarouselState(cardRefs, activeIndex, activeCardBg, activeNumberColor) {
  cardRefs.forEach((cardRef, index) => {
    const isActive = index === activeIndex;
    cardRef.card.classList.toggle('is-active', isActive);
    cardRef.card.setAttribute('aria-current', isActive ? 'true' : 'false');
    cardRef.card.style.backgroundColor = isActive
      ? cardRef.activeCardBackground || activeCardBg
      : cardRef.normalCardBackground;

    const numberColor = isActive ? activeNumberColor : cardRef.normalNumberColor;
    cardRef.numberElement.style.color = numberColor;

    if (cardRef.numberBox) {
      cardRef.numberBox.style.borderColor = numberColor;
    }
  });
}

export default async function decorate(block) {
  const blockData = await getResourceData(block);
  const titleField = getBlockField(block, 'title');
  const subtitleField = getBlockField(block, 'subtitle');
  const headerImageField = getImageField(block, 'headerImage');
  const titleValue = titleField.value || normalizeJsonFieldValue(blockData.title);
  const subtitleValue = subtitleField.value || normalizeJsonFieldValue(blockData.subtitle);
  const alignment = getBlockField(block, 'textAlign').value
    || normalizeJsonFieldValue(blockData.textAlign)
    || 'center';
  const blockBg = normalizeColorValue(
    getBlockField(block, 'blockBackgroundColor').value || blockData.blockBackgroundColor,
  ) || DEFAULTS.blockBackgroundColor;
  const layout = getBlockField(block, 'layout').value
    || normalizeJsonFieldValue(blockData.layout)
    || 'carousel';
  const cardsPerRow = Number.parseInt(
    getBlockField(block, 'cardsPerRow').value || normalizeJsonFieldValue(blockData.cardsPerRow),
    10,
  ) || 4;
  const cardBg = normalizeColorValue(
    getBlockField(block, 'cardBackgroundColor').value || blockData.cardBackgroundColor,
  ) || DEFAULTS.cardBackgroundColor;
  const {
    activeCardBackgroundColor: activeCardBg,
    activeNumberColor,
  } = DEFAULTS;

  block.style.backgroundColor = blockBg;
  block.classList.add(`numbered-cards-custom-${layout}-layout`);

  const wrapper = document.createElement('div');
  wrapper.className = 'numbered-cards-custom-wrapper';

  const header = document.createElement('div');
  header.className = 'numbered-cards-custom-header';
  if (['left', 'center', 'right'].includes(alignment)) {
    header.style.textAlign = alignment;
  }

  const headerImage = buildOptimizedPicture(headerImageField, '', 240);
  if (headerImage) {
    const headerMedia = document.createElement('div');
    headerMedia.className = 'numbered-cards-custom-header-media';
    headerMedia.append(headerImage);
    header.append(headerMedia);
  }

  if (titleValue || titleField.source) {
    const title = document.createElement('h2');
    title.className = 'numbered-cards-custom-heading';
    if (titleField.source) {
      moveFieldContent(titleField.source, title, titleValue);
    } else {
      title.textContent = titleValue;
    }
    header.append(title);
  }

  if (subtitleValue || subtitleField.source) {
    const subtitle = document.createElement('p');
    subtitle.className = 'numbered-cards-custom-subtitle';
    if (subtitleField.source) {
      moveFieldContent(subtitleField.source, subtitle, subtitleValue);
    } else {
      subtitle.textContent = subtitleValue;
    }
    header.append(subtitle);
  }

  wrapper.append(header);

  const rows = [...block.querySelectorAll(':scope > div')];
  const cardPromises = rows.map(async (row) => {
    const cols = [...row.children];
    const hasCardProp = CARD_PROPS.some((prop) => row.querySelector(getFieldSelector(prop)));
    if (!hasCardProp && cols.length < 2) return null;

    const cardTitleEl = getRichField(row, 'cardTitle', 1);
    const cardBodyEl = getRichField(row, 'cardBody', 2);
    const rowData = await getResourceData(row);
    const cardNumber = getRowTextField(row, 'cardNumber', 0)
      || normalizeJsonFieldValue(rowData.cardNumber);
    if (!cardTitleEl && !cardBodyEl && !cardNumber) return null;

    return {
      row,
      cardNumber,
      cardTitleEl,
      cardBodyEl,
      numberColor: normalizeColorValue(
        getRowTextField(row, 'numberColor', 3) || rowData.numberColor,
      ),
      titleColor: normalizeColorValue(
        getRowTextField(row, 'titleColor', 4) || rowData.titleColor,
      ),
      bodyColor: normalizeColorValue(
        getRowTextField(row, 'bodyColor', 5) || rowData.bodyColor,
      ),
      cardBackgroundColor: normalizeColorValue(
        getRowTextField(row, 'cardBackgroundColor', 6) || rowData.cardBackgroundColor,
      ),
    };
  });

  const cards = (await Promise.all(cardPromises)).filter(Boolean);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'numbered-cards-custom-grid';

  if (layout === 'grid') {
    cardsContainer.style.setProperty('--cards-per-row', cardsPerRow);
  }

  const cardRefs = [];

  cards.forEach((data, index) => {
    const card = document.createElement('div');
    card.className = 'numbered-cards-custom-card';
    card.tabIndex = layout === 'carousel' ? 0 : -1;
    if (data.row) moveInstrumentation(data.row, card);

    const numberWrap = document.createElement('div');
    numberWrap.className = 'numbered-cards-custom-number';

    const defaultNumberColor = layout === 'grid'
      ? DEFAULTS.gridNumberColor
      : DEFAULTS.carouselNumberColor;
    const normalNumberColor = data.numberColor || defaultNumberColor;
    const displayedNumber = data.cardNumber || `${index + 1}`;
    let numberElement;
    let numberBox = null;

    if (layout === 'grid') {
      numberBox = document.createElement('div');
      numberBox.className = 'numbered-cards-custom-number-box';
      numberBox.textContent = displayedNumber;
      numberBox.style.color = normalNumberColor;
      numberBox.style.borderColor = normalNumberColor;
      numberWrap.append(numberBox);
      numberElement = numberBox;
    } else {
      numberElement = document.createElement('span');
      numberElement.className = 'numbered-cards-custom-number-text';
      numberElement.textContent = displayedNumber;
      numberElement.style.color = normalNumberColor;
      numberWrap.append(numberElement);
    }

    card.append(numberWrap);

    if (data.cardTitleEl) {
      const title = document.createElement('div');
      title.className = 'numbered-cards-custom-card-title';
      title.style.color = data.titleColor || '#ffffff';
      moveFieldContent(data.cardTitleEl, title);
      card.append(title);
    }

    if (data.cardBodyEl) {
      const body = document.createElement('div');
      body.className = 'numbered-cards-custom-card-body';
      body.style.color = data.bodyColor || '#ffffff';
      moveFieldContent(data.cardBodyEl, body);
      card.append(body);
    }

    const normalCardBackground = data.cardBackgroundColor || cardBg;
    const activeCardBackground = data.cardBackgroundColor || '';
    card.style.backgroundColor = normalCardBackground;
    cardsContainer.append(card);

    cardRefs.push({
      card,
      numberElement,
      numberBox,
      normalCardBackground,
      activeCardBackground,
      normalNumberColor,
    });
  });

  wrapper.append(cardsContainer);

  if (layout === 'carousel' && cardRefs.length) {
    const controls = document.createElement('div');
    controls.className = 'numbered-cards-custom-controls';

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'numbered-cards-custom-dots';
    const dots = cardRefs.map((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'numbered-cards-custom-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Go to card ${index + 1}`);
      dotsContainer.append(dot);
      return dot;
    });
    controls.append(dotsContainer);

    const nav = document.createElement('div');
    nav.className = 'numbered-cards-custom-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'numbered-cards-custom-nav-btn';
    prevBtn.type = 'button';
    prevBtn.setAttribute('aria-label', 'Previous card');
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'numbered-cards-custom-nav-btn';
    nextBtn.type = 'button';
    nextBtn.setAttribute('aria-label', 'Next card');
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

    nav.append(prevBtn, nextBtn);
    controls.append(nav);
    wrapper.append(controls);

    let current = 0;

    const setActiveCard = (index, shouldScroll = false) => {
      const total = cardRefs.length;
      if (!total) return;
      current = ((index % total) + total) % total;

      if (shouldScroll) {
        const targetCard = cardRefs[current].card;
        cardsContainer.scrollTo({
          left: targetCard.offsetLeft - cardsContainer.offsetLeft,
          behavior: 'smooth',
        });
      }

      updateDots(dots, current);
      applyCarouselState(cardRefs, current, activeCardBg, activeNumberColor);
    };

    prevBtn.addEventListener('click', () => setActiveCard(current - 1, true));
    nextBtn.addEventListener('click', () => setActiveCard(current + 1, true));
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => setActiveCard(index, true));
    });

    cardRefs.forEach(({ card }, index) => {
      card.addEventListener('focus', () => setActiveCard(index));
      card.addEventListener('click', () => setActiveCard(index, true));
    });

    cardsContainer.addEventListener('scroll', () => {
      const firstCard = cardRefs[0]?.card;
      if (!firstCard) return;

      const styles = window.getComputedStyle(cardsContainer);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '0');
      const step = firstCard.offsetWidth + gap;
      if (!step) return;

      const scrollIndex = Math.round(cardsContainer.scrollLeft / step);
      if (scrollIndex !== current && scrollIndex >= 0 && scrollIndex < cardRefs.length) {
        current = scrollIndex;
        updateDots(dots, current);
        applyCarouselState(cardRefs, current, activeCardBg, activeNumberColor);
      }
    });

    setActiveCard(0);
  }

  block.replaceChildren(wrapper);
}
