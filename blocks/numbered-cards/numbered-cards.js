import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_PROPS = ['title', 'subtitle', 'textAlign', 'blockBackgroundColor', 'layout', 'cardsPerRow', 'cardBackgroundColor', 'numberBorder'];

function getBlockField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  return { source: null, value: '' };
}

function getRichField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source;
  const cols = [...row.children];
  return cols[index] || null;
}

function getTextField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source.textContent.trim();
  const cols = [...row.children];
  return cols[index]?.textContent.trim() || '';
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
function updateDots(dots, activeIndex) {
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === activeIndex);
  });
}

export default function decorate(block) {
  // Read block-level fields
  const titleField = getBlockField(block, 'title');
  const subtitleField = getBlockField(block, 'subtitle');
  const alignment = getBlockField(block, 'textAlign').value || 'left';
  const blockBg = getBlockField(block, 'blockBackgroundColor').value || '';
  const layout = getBlockField(block, 'layout').value || 'grid';
  const cardsPerRow = parseInt(getBlockField(block, 'cardsPerRow').value, 10) || 4;
  const cardBg = getBlockField(block, 'cardBackgroundColor').value || '#00264D';
  const numberBorder = getBlockField(block, 'numberBorder').value || 'show';

  // Remove config rows — any row that contains a block-level prop
  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    const hasBlockProp = BLOCK_PROPS.some((prop) => row.querySelector(`[data-aue-prop="${prop}"]`));
    if (hasBlockProp) row.remove();
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

  if (titleField.value || titleField.source) {
    const titleEl = document.createElement('h2');
    titleEl.className = 'numbered-cards-heading';
    if (titleField.source) {
      moveInstrumentation(titleField.source, titleEl);
      while (titleField.source.firstChild) titleEl.append(titleField.source.firstChild);
    } else {
      titleEl.textContent = titleField.value;
    }
    headerDiv.append(titleEl);
  }

  if (subtitleField.value || subtitleField.source) {
    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'numbered-cards-subtitle';
    if (subtitleField.source) {
      moveInstrumentation(subtitleField.source, subtitleEl);
      while (subtitleField.source.firstChild) subtitleEl.append(subtitleField.source.firstChild);
    } else {
      subtitleEl.textContent = subtitleField.value;
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

  if (layout === 'grid') {
    cardsContainer.style.setProperty('--cards-per-row', cardsPerRow);
  }

  cards.forEach((data, index) => {
    const card = document.createElement('div');
    card.className = 'numbered-cards-card';
    card.style.setProperty('--numbered-card-index', index);
    card.style.backgroundColor = data.cardBgOverride || cardBg;
    if (data.row) moveInstrumentation(data.row, card);

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

    const goToSlide = (index) => {
      const total = cards.length;
      if (total === 0) return;
      current = ((index % total) + total) % total;
      const slideEl = cardsContainer.children[current];
      if (slideEl) {
        cardsContainer.scrollTo({ left: slideEl.offsetLeft - cardsContainer.offsetLeft, behavior: 'smooth' });
      }
      updateDots(dots, current);
    };

    prevBtn.addEventListener('click', () => goToSlide(current - 1));
    nextBtn.addEventListener('click', () => goToSlide(current + 1));
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => goToSlide(i));
    });

    cardsContainer.addEventListener('scroll', () => {
      const slideWidth = cardsContainer.children[0]?.offsetWidth || 1;
      const gap = 24;
      const scrollIndex = Math.round(cardsContainer.scrollLeft / (slideWidth + gap));
      if (scrollIndex !== current && scrollIndex >= 0 && scrollIndex < cards.length) {
        current = scrollIndex;
        updateDots(dots, current);
      }
    });
  }

  block.replaceChildren(wrapper);
  observeReveal(block);
}
