import { moveInstrumentation } from '../../scripts/scripts.js';

/* ---------- Field helpers (mirror card-row-detailed.js) ---------- */

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getRichTextField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.innerHTML };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].innerHTML };
  return { source: null, value: '' };
}

function getLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return { source: null, value: anchor?.href || cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getImageField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const picture = source.tagName === 'PICTURE'
      ? source
      : source.closest('picture') || source.querySelector('picture');
    const img = source.tagName === 'IMG'
      ? source
      : (picture?.querySelector('img') || source.querySelector('img'));
    return { source, picture, img };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const picture = cols[index].querySelector('picture');
    const img = cols[index].querySelector('img');
    return { source: null, picture, img };
  }
  return { source: null, picture: null, img: null };
}

/* ---------- Icon builder (white-tinted via CSS mask) ---------- */

function buildWhiteIcon(picture, size, className) {
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.style.setProperty('width', `${size}px`, 'important');
  wrap.style.setProperty('height', `${size}px`, 'important');
  wrap.style.setProperty('flex', `0 0 ${size}px`, 'important');

  const img = picture?.querySelector('img');
  if (!img) return wrap;

  wrap.style.setProperty('background-color', '#ffffff', 'important');
  wrap.style.setProperty('-webkit-mask-image', `url(${img.src})`, 'important');
  wrap.style.setProperty('mask-image', `url(${img.src})`, 'important');
  wrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
  wrap.style.setProperty('mask-size', 'contain', 'important');
  wrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('-webkit-mask-position', 'left center', 'important');
  wrap.style.setProperty('mask-position', 'left center', 'important');

  return wrap;
}

/* ---------- Card builder ---------- */

function buildCard(data) {
  const card = document.createElement('div');
  card.className = 'dark-feature-cards-card';
  if (data.row) moveInstrumentation(data.row, card);

  const bg = data.cardBackgroundColor || '#0f3357';
  card.style.setProperty('background-color', bg, 'important');

  // Top image (optional, full-width, max-height 178px)
  if (data.imageField.picture) {
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'dark-feature-cards-card-media';
    const picture = data.imageField.picture.cloneNode(true);
    if (data.imageField.source) {
      moveInstrumentation(data.imageField.source, picture);
    }
    mediaWrap.append(picture);
    card.append(mediaWrap);
  }

  // Card body
  const body = document.createElement('div');
  body.className = 'dark-feature-cards-card-body';

  // Icon (64x64, white)
  const iconEl = buildWhiteIcon(data.iconField.picture, 64, 'dark-feature-cards-card-icon');
  if (data.iconField.source) moveInstrumentation(data.iconField.source, iconEl);
  body.append(iconEl);

  // Title
  if (data.cardTitleField.value) {
    const h3 = document.createElement('h3');
    h3.className = 'dark-feature-cards-card-title';
    if (data.cardTitleField.source) {
      moveInstrumentation(data.cardTitleField.source, h3);
    }
    h3.textContent = data.cardTitleField.value;
    body.append(h3);
  }

  // Subtitle (rich text)
  if (data.cardSubtitleField.value && data.cardSubtitleField.value.trim()) {
    const sub = document.createElement('div');
    sub.className = 'dark-feature-cards-card-subtitle';
    if (data.cardSubtitleField.source) {
      moveInstrumentation(data.cardSubtitleField.source, sub);
    }
    sub.innerHTML = data.cardSubtitleField.value;
    body.append(sub);
  }

  // Optional button
  if (data.buttonText) {
    const btn = document.createElement(data.buttonLink ? 'a' : 'span');
    const styleClass = data.buttonStyle === 'solid'
      ? 'dark-feature-cards-card-btn-solid'
      : 'dark-feature-cards-card-btn-outlined';
    btn.className = `dark-feature-cards-card-btn ${styleClass}`;
    if (data.buttonLink) btn.href = data.buttonLink;
    btn.textContent = data.buttonText;
    if (data.buttonTextSource) {
      moveInstrumentation(data.buttonTextSource, btn);
    }
    body.append(btn);
  }

  card.append(body);
  return card;
}

/* ---------- decorate ---------- */

export default function decorate(block) {
  // Pull out block-level fields and remove their rows so they're not parsed
  // as item rows. Mirrors the icon-card-carousel pattern.
  let sectionTitle = '';
  const titleProp = block.querySelector('[data-aue-prop="title"]');
  if (titleProp) {
    sectionTitle = titleProp.textContent.trim();
    titleProp.closest(':scope > div')?.remove();
  }

  let sectionSubtitle = '';
  const subtitleProp = block.querySelector('[data-aue-prop="subtitle"]');
  if (subtitleProp) {
    sectionSubtitle = subtitleProp.textContent.trim();
    subtitleProp.closest(':scope > div')?.remove();
  }

  // Iterate remaining rows as cards
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 1) return;

    const imageField = getImageField(row, 'image', 0);
    const iconField = getImageField(row, 'icon', 1);
    const cardTitleField = getField(row, 'cardTitle', 2);
    const cardSubtitleField = getRichTextField(row, 'cardSubtitle', 3);
    const buttonTextField = getField(row, 'buttonText', 4);
    const buttonLinkField = getLinkField(row, 'buttonLink', 5);
    const buttonStyleField = getField(row, 'buttonStyle', 6);
    const cardBgField = getField(row, 'cardBackgroundColor', 7);

    const hasContent = imageField.picture
      || iconField.picture
      || cardTitleField.value
      || cardSubtitleField.value
      || buttonTextField.value;

    const isAuthoring = Boolean(
      row.getAttribute('data-aue-resource')
        || row.querySelector('[data-aue-resource], [data-aue-prop]'),
    );

    if (!hasContent && !isAuthoring) return;

    cards.push({
      imageField,
      iconField,
      cardTitleField,
      cardSubtitleField,
      buttonText: buttonTextField.value,
      buttonTextSource: buttonTextField.source,
      buttonLink: buttonLinkField.value,
      buttonStyle: (buttonStyleField.value || 'outlined').toLowerCase(),
      cardBackgroundColor: cardBgField.value || '#0f3357',
      row,
    });
  });

  /* ---------- Build the new DOM ---------- */

  const inner = document.createElement('div');
  inner.className = 'dark-feature-cards-inner';

  // Header (title + subtitle)
  if (sectionTitle || sectionSubtitle) {
    const header = document.createElement('div');
    header.className = 'dark-feature-cards-header';

    if (sectionTitle) {
      const h2 = document.createElement('h2');
      h2.className = 'dark-feature-cards-title';
      h2.textContent = sectionTitle;
      header.append(h2);
    }

    if (sectionSubtitle) {
      const p = document.createElement('p');
      p.className = 'dark-feature-cards-subtitle';
      p.textContent = sectionSubtitle;
      header.append(p);
    }

    inner.append(header);
  }

  // Cards row (cap at 4)
  const grid = document.createElement('div');
  grid.className = 'dark-feature-cards-grid';
  grid.style.setProperty('--card-count', String(Math.min(cards.length, 4)));

  cards.slice(0, 4).forEach((data) => {
    grid.append(buildCard(data));
  });

  inner.append(grid);

  block.replaceChildren(inner);
}
