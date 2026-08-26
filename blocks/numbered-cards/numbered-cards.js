import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField, setItemLabel } from '../../scripts/block-field-utils.js';
import focusScrollableRegion from '../../scripts/a11y-utils.js';
import attachDragScroll, { getCarouselItemIndex, scrollToCarouselItem } from '../../scripts/carousel-utils.js';

const BLOCK_PROPS = [
  'title',
  'subtitle',
  'textAlign',
  'blockBackgroundColor',
  'layout',
  'cardsPerRow',
  'cardBackgroundColor',
  'numberBorder',
];

const CONFIG_VALUE_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$|^(?:left|center|right|grid|carousel|[234]|show|hide)$/i;

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function directRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function rowText(row) {
  return normalizeText((row.children[0] || row).textContent);
}

function isConfigToken(value) {
  return CONFIG_VALUE_RE.test(normalizeText(value));
}

function findAndConsume(entries, predicate) {
  const entry = entries.find((candidate) => !candidate.consumed && predicate(candidate));
  if (entry) entry.consumed = true;
  return entry || null;
}

function parsePublishedBlockConfig(block) {
  const entries = directRows(block)
    .map((row) => ({ row, value: rowText(row), consumed: false }))
    .filter((entry) => entry.value);

  if (!entries.length) return { values: {}, rows: [] };

  const values = {};
  const contentEntries = entries.filter((entry) => !isConfigToken(entry.value));
  const titleEntry = contentEntries[0] || null;
  const subtitleEntry = contentEntries[1] || null;

  if (titleEntry) {
    values.title = titleEntry.value;
    titleEntry.consumed = true;
  }

  if (subtitleEntry) {
    values.subtitle = subtitleEntry.value;
    subtitleEntry.consumed = true;
  }

  values.textAlign = findAndConsume(entries, (entry) => /^(left|center|right)$/i.test(entry.value))?.value || '';
  values.layout = findAndConsume(entries, (entry) => /^(grid|carousel)$/i.test(entry.value))?.value || '';
  values.cardsPerRow = findAndConsume(entries, (entry) => /^[234]$/.test(entry.value))?.value || '';

  const colorEntries = entries.filter((entry) => !entry.consumed && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(entry.value));
  if (colorEntries.length > 1) {
    values.blockBackgroundColor = colorEntries[0].value;
    colorEntries[0].consumed = true;
    values.cardBackgroundColor = colorEntries[colorEntries.length - 1].value;
    colorEntries[colorEntries.length - 1].consumed = true;
  } else if (colorEntries.length === 1) {
    values.cardBackgroundColor = colorEntries[0].value;
    colorEntries[0].consumed = true;
  }

  values.numberBorder = findAndConsume(entries, (entry) => /^(show|hide)$/i.test(entry.value))?.value || '';

  return {
    values,
    rows: entries.filter((entry) => entry.consumed).map((entry) => entry.row),
  };
}

function getBlockField(block, name) {
  return readTextField(block, name);
}
function readBlockConfig(block) {
  const published = parsePublishedBlockConfig(block);
  const fallback = published.values;

  return {
    title: getBlockField(block, 'title').value || fallback.title || '',
    titleSource: getBlockField(block, 'title').source,
    subtitle: getBlockField(block, 'subtitle').value || fallback.subtitle || '',
    subtitleSource: getBlockField(block, 'subtitle').source,
    alignment: getBlockField(block, 'textAlign').value || fallback.textAlign || 'left',
    blockBg: getBlockField(block, 'blockBackgroundColor').value || fallback.blockBackgroundColor || '',
    layout: getBlockField(block, 'layout').value || fallback.layout || 'grid',
    cardsPerRow: parseInt(getBlockField(block, 'cardsPerRow').value || fallback.cardsPerRow, 10) || 4,
    cardBg: getBlockField(block, 'cardBackgroundColor').value || fallback.cardBackgroundColor || '#00264D',
    numberBorder: getBlockField(block, 'numberBorder').value || fallback.numberBorder || 'show',
    publishedRows: published.rows,
  };
}

function getRichField(row, name, index) {
  const field = readRichTextField(row, name, { fallbackCell: row.children[index] });
  return field.source || field.cell;
}

function getTextField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] }).value;
}

function updateDots(dots, activeIndex) {
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === activeIndex);
  });
}

function updateActiveCard(cardsContainer, activeIndex) {
  [...cardsContainer.children].forEach((card, i) => {
    card.classList.toggle('active', i === activeIndex);
  });
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const {
    alignment,
    blockBg,
    layout,
    cardsPerRow,
    cardBg,
    numberBorder,
  } = config;

  // Remove config rows � author rows carry block props, live rows are flattened.
  const liveConfigRows = new Set(config.publishedRows);
  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    const hasBlockProp = BLOCK_PROPS.some((prop) => row.querySelector(`[data-aue-prop="${prop}"]`));
    if (hasBlockProp || liveConfigRows.has(row)) row.remove();
  });
  // Apply block background
  if (blockBg) {
    block.style.backgroundColor = blockBg;
  }

  // Add layout class
  block.classList.add(`numbered-cards-${layout}-layout`);
  block.classList.toggle('numbered-cards-hide-number-border', numberBorder === 'hide');

  const wrapper = document.createElement('div');
  wrapper.className = 'numbered-cards-wrapper';

  // Title area
  const headerDiv = document.createElement('div');
  headerDiv.className = 'numbered-cards-header';
  if (['left', 'center', 'right'].includes(alignment)) {
    headerDiv.style.textAlign = alignment;
  }

  if (config.title || config.titleSource) {
    const titleEl = document.createElement('h2');
    titleEl.className = 'numbered-cards-heading';
    if (config.titleSource) {
      moveInstrumentation(config.titleSource, titleEl);
      while (config.titleSource.firstChild) titleEl.append(config.titleSource.firstChild);
    } else {
      titleEl.textContent = config.title;
    }
    headerDiv.append(titleEl);
  }

  if (config.subtitle || config.subtitleSource) {
    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'numbered-cards-subtitle';
    if (config.subtitleSource) {
      moveInstrumentation(config.subtitleSource, subtitleEl);
      while (config.subtitleSource.firstChild) subtitleEl.append(config.subtitleSource.firstChild);
    } else {
      subtitleEl.textContent = config.subtitle;
    }
    headerDiv.append(subtitleEl);
  }

  wrapper.append(headerDiv);

  // Parse remaining rows as card items — skip any row that still has block-level props
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row) => {
    // Skip rows that contain block-level config fields (not card items)
    const isConfigRow = BLOCK_PROPS.some((prop) => row.querySelector(`[data-aue-prop="${prop}"]`));
    if (isConfigRow) return;

    // Only treat as a card if it has card-level content
    const hasCardProp = row.querySelector('[data-aue-prop="cardTitle"]')
      || row.querySelector('[data-aue-prop="cardBody"]');
    const cols = [...row.children];
    if (!hasCardProp && cols.length < 2) return;

    const cardTitleEl = getRichField(row, 'cardTitle', 0);
    const cardBodyEl = getRichField(row, 'cardBody', 1);
    const numberColor = getTextField(row, 'numberColor', 2);
    const titleColor = getTextField(row, 'titleColor', 3);
    const bodyColor = getTextField(row, 'bodyColor', 4);
    const cardBgOverride = getTextField(row, 'cardBackgroundColor', 5);

    cards.push({
      row,
      cardTitleEl,
      cardBodyEl,
      numberColor,
      titleColor,
      bodyColor,
      cardBgOverride,
    });
  });

  // Build cards container
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'numbered-cards-grid';
  if (layout === 'carousel') focusScrollableRegion(cardsContainer, 'Numbered cards');

  if (layout === 'grid') {
    cardsContainer.style.setProperty('--cards-per-row', cardsPerRow);
  }

  cards.forEach((data, index) => {
    const card = document.createElement('div');
    card.className = 'numbered-cards-card';
    card.style.setProperty('--numbered-card-index', index);
    card.style.backgroundColor = data.cardBgOverride || cardBg;
    if (data.row) moveInstrumentation(data.row, card);
    setItemLabel(card, [data.cardTitleEl?.textContent, data.cardBodyEl?.textContent]);

    // Number index
    const numberWrap = document.createElement('div');
    numberWrap.className = 'numbered-cards-number';

    const numColor = data.numberColor || (layout === 'grid' ? '#92D6E3' : '#FFFFFF');

    if (layout === 'grid') {
      const numberBox = document.createElement('div');
      numberBox.className = 'numbered-cards-number-box';
      numberBox.textContent = index + 1;
      numberBox.style.color = numColor;
      numberBox.style.borderColor = numColor;
      numberWrap.append(numberBox);
    } else {
      const numberText = document.createElement('span');
      numberText.className = 'numbered-cards-number-text';
      numberText.textContent = index + 1;
      numberText.style.color = numColor;
      numberWrap.append(numberText);
    }

    card.append(numberWrap);

    // Card title
    if (data.cardTitleEl) {
      const cardTitleWrap = document.createElement('div');
      cardTitleWrap.className = 'numbered-cards-card-title';
      cardTitleWrap.style.color = data.titleColor || '#FFFFFF';
      moveInstrumentation(data.cardTitleEl, cardTitleWrap);
      while (data.cardTitleEl.firstChild) cardTitleWrap.append(data.cardTitleEl.firstChild);
      card.append(cardTitleWrap);
    }

    // Card body
    if (data.cardBodyEl) {
      const cardBodyWrap = document.createElement('div');
      cardBodyWrap.className = 'numbered-cards-card-body';
      cardBodyWrap.style.color = data.bodyColor || '#FFFFFF';
      moveInstrumentation(data.cardBodyEl, cardBodyWrap);
      while (data.cardBodyEl.firstChild) cardBodyWrap.append(data.cardBodyEl.firstChild);
      card.append(cardBodyWrap);
    }

    cardsContainer.append(card);
  });

  wrapper.append(cardsContainer);

  // Carousel controls
  if (layout === 'carousel') {
    const controls = document.createElement('div');
    controls.className = 'numbered-cards-controls';

    // Dots
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'numbered-cards-dots';
    const dots = [];
    cards.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'numbered-cards-dot';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.type = 'button';
      if (i === 0) dot.classList.add('active');
      dots.push(dot);
      dotsContainer.append(dot);
    });
    controls.append(dotsContainer);

    // Nav arrows
    const nav = document.createElement('div');
    nav.className = 'numbered-cards-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'numbered-cards-nav-btn';
    prevBtn.setAttribute('aria-label', 'Previous slide');
    prevBtn.type = 'button';
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'numbered-cards-nav-btn';
    nextBtn.setAttribute('aria-label', 'Next slide');
    nextBtn.type = 'button';
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

    nav.append(prevBtn);
    nav.append(nextBtn);
    controls.append(nav);

    wrapper.append(controls);

    // Carousel logic
    let current = 0;
    updateActiveCard(cardsContainer, current);

    // The nav owns the index. At desktop widths these cards very nearly fit, so
    // ONE click reaches the end stop — where getCarouselItemIndex correctly
    // reports the LAST card, which made a single click jump the dots from 1 to 4.
    // Re-sync from scroll position only when the VISITOR scrolls (drag, wheel,
    // touch), never while our own smooth scroll is still settling.
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
      const total = cards.length;
      if (total === 0) return;
      current = ((index % total) + total) % total;
      const slideEl = cardsContainer.children[current];
      if (slideEl) {
        beginProgrammaticScroll();
        scrollToCarouselItem(cardsContainer, slideEl);
      }
      updateDots(dots, current);
      updateActiveCard(cardsContainer, current);
    };

    prevBtn.addEventListener('click', () => goToSlide(current - 1));
    nextBtn.addEventListener('click', () => goToSlide(current + 1));
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => goToSlide(i));
    });

    // This block never had drag scrolling — every other carousel on the site
    // does. Mouse users could only move it with the nav buttons.
    attachDragScroll(cardsContainer);

    cardsContainer.addEventListener('scroll', () => {
      if (programmaticScroll) return;
      const scrollIndex = getCarouselItemIndex(cardsContainer, [...cardsContainer.children]);
      if (scrollIndex !== current && scrollIndex >= 0) {
        current = scrollIndex;
        updateDots(dots, current);
        updateActiveCard(cardsContainer, current);
      }
    });
  }

  block.replaceChildren(wrapper);
}
