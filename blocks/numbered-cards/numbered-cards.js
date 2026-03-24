import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const match = [...block.querySelectorAll(':scope > div')]
    .filter((row) => row.children.length >= 2)
    .find((row) => {
      const key = row.children[0].textContent.trim().toLowerCase().replace(/[\s_-]+/g, '');
      return key === name.toLowerCase();
    });

  if (match) {
    return { source: match.children[1], value: match.children[1].textContent.trim(), row: match };
  }
  return { source: null, value: '' };
}

function getFieldRich(row, propName) {
  const byProp = row.querySelector(`[data-aue-prop="${propName}"]`);
  if (byProp) return byProp;
  const cols = [...row.children];
  return cols.length > 0 ? cols[0] : null;
}

function updateDots(dots, activeIndex) {
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === activeIndex);
  });
}

export default function decorate(block) {
  // Read block-level fields
  const titleField = getField(block, 'title');
  const subtitleField = getField(block, 'subtitle');
  const alignField = getField(block, 'textAlign');
  const blockBgField = getField(block, 'blockBackgroundColor');
  const layoutField = getField(block, 'layout');
  const cardsPerRowField = getField(block, 'cardsPerRow');
  const cardBgField = getField(block, 'cardBackgroundColor');

  const alignment = alignField.value || 'left';
  const layout = layoutField.value || 'grid';
  const cardsPerRow = parseInt(cardsPerRowField.value, 10) || 4;
  const cardBg = cardBgField.value || '#00264D';
  const blockBg = blockBgField.value || '';

  // Remove config rows
  [alignField, blockBgField, layoutField, cardsPerRowField, cardBgField].forEach((f) => {
    if (f.row) f.row.remove();
  });

  // Apply block background
  if (blockBg) {
    block.style.backgroundColor = blockBg;
  }

  // Add layout class
  block.classList.add(`numbered-cards--${layout}`);

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
      titleField.source.remove();
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
      subtitleField.source.remove();
    } else {
      subtitleEl.textContent = subtitleField.value;
    }
    headerDiv.append(subtitleEl);
  }

  wrapper.append(headerDiv);

  // Parse card rows
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 1) return;

    const cardTitleEl = getFieldRich(row, 'cardTitle');
    const cardBodyEl = row.querySelector('[data-aue-prop="cardBody"]') || (cols.length > 1 ? cols[1] : null);
    const numberColor = (row.querySelector('[data-aue-prop="numberColor"]')?.textContent.trim())
      || (cols.length > 2 ? cols[2]?.textContent.trim() : '');
    const titleColor = (row.querySelector('[data-aue-prop="titleColor"]')?.textContent.trim())
      || (cols.length > 3 ? cols[3]?.textContent.trim() : '');
    const bodyColor = (row.querySelector('[data-aue-prop="bodyColor"]')?.textContent.trim())
      || (cols.length > 4 ? cols[4]?.textContent.trim() : '');

    cards.push({
      row,
      cardTitleEl,
      cardBodyEl,
      numberColor,
      titleColor,
      bodyColor,
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
    card.style.backgroundColor = cardBg;
    if (data.row) moveInstrumentation(data.row, card);

    // Number index
    const numberWrap = document.createElement('div');
    numberWrap.className = 'numbered-cards-number';

    const numColor = data.numberColor || (layout === 'grid' ? '#92D6E3' : '#FFFFFF');

    if (layout === 'grid') {
      // Grid: number with bordered box
      const numberBox = document.createElement('div');
      numberBox.className = 'numbered-cards-number-box';
      numberBox.textContent = index + 1;
      numberBox.style.color = numColor;
      numberBox.style.borderColor = numColor;
      numberWrap.append(numberBox);
    } else {
      // Carousel: just the number, no box
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
      const tColor = data.titleColor || '#FFFFFF';
      cardTitleWrap.style.color = tColor;
      moveInstrumentation(data.cardTitleEl, cardTitleWrap);
      while (data.cardTitleEl.firstChild) cardTitleWrap.append(data.cardTitleEl.firstChild);
      card.append(cardTitleWrap);
    }

    // Card body
    if (data.cardBodyEl) {
      const cardBodyWrap = document.createElement('div');
      cardBodyWrap.className = 'numbered-cards-card-body';
      const bColor = data.bodyColor || '#FFFFFF';
      cardBodyWrap.style.color = bColor;
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

    // Sync dots on manual scroll
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
}
