import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import { decorateButtonText } from '../../scripts/button-utils.js';

/* ---------- Field helpers ---------- */

function getField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function getRichTextField(row, name, index) {
  const field = readRichTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.html };
}

function getLinkField(row, name, index) {
  return readLinkField(row, name, { fallbackCell: row.children[index] });
}

function getImageField(row, name, index) {
  const field = readImageField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, picture: field.picture, img: field.img };
}

/* ---------- Tinted icon (color applied via CSS mask) ---------- */

function buildTintedIcon(imageField, color) {
  const wrap = document.createElement('div');
  wrap.className = 'featured-event-detail-icon';

  const img = imageField.img || imageField.picture?.querySelector('img');
  const src = img?.src || img?.currentSrc;
  if (!src) return wrap;

  const tint = color || '#008DB6';
  wrap.style.setProperty('background-color', tint);
  wrap.style.setProperty('-webkit-mask-image', `url('${src}')`);
  wrap.style.setProperty('mask-image', `url('${src}')`);
  if (imageField.source) moveInstrumentation(imageField.source, wrap);
  return wrap;
}

/* ---------- Detail section (icon + label + value) ---------- */

function buildDetail(detail) {
  if (!detail.icon.img && !detail.name && !detail.value) return null;

  const section = document.createElement('div');
  section.className = 'featured-event-detail';

  section.append(buildTintedIcon(detail.icon, detail.iconColor));

  const text = document.createElement('div');
  text.className = 'featured-event-detail-text';

  if (detail.name) {
    const label = document.createElement('span');
    label.className = 'featured-event-detail-label';
    label.textContent = detail.name;
    text.append(label);
  }
  if (detail.value) {
    const value = document.createElement('span');
    value.className = 'featured-event-detail-value';
    value.textContent = detail.value;
    text.append(value);
  }

  section.append(text);
  return section;
}

/* ---------- Card builder ---------- */

function buildCard(data) {
  const card = document.createElement('article');
  card.className = 'featured-event-card';
  if (data.row) {
    moveInstrumentation(data.row, card);
    setItemLabel(card, [data.titleField.source?.textContent]);
  }

  // Top image
  if (data.imageField.picture) {
    const media = document.createElement('div');
    media.className = 'featured-event-card-media';
    const picture = data.imageField.picture.cloneNode(true);
    if (data.imageField.source) moveInstrumentation(data.imageField.source, picture);
    const img = picture.querySelector('img');
    if (data.imageAlt && img) img.alt = data.imageAlt;
    media.append(picture);
    card.append(media);
  }

  // Body
  const body = document.createElement('div');
  body.className = 'featured-event-card-body';

  if (data.titleField.value && data.titleField.value.trim()) {
    const title = document.createElement('h3');
    title.className = 'featured-event-card-title';
    if (data.titleField.source) moveInstrumentation(data.titleField.source, title);
    title.innerHTML = data.titleField.value;
    body.append(title);
  }

  if (data.descriptionField.value && data.descriptionField.value.trim()) {
    const desc = document.createElement('div');
    desc.className = 'featured-event-card-description';
    if (data.descriptionField.source) moveInstrumentation(data.descriptionField.source, desc);
    desc.innerHTML = data.descriptionField.value;
    body.append(desc);
  }

  // Details (only render the grid if at least one detail has content)
  const details = data.details.map(buildDetail).filter(Boolean);
  if (details.length) {
    const divider = document.createElement('hr');
    divider.className = 'featured-event-divider';
    body.append(divider);

    const grid = document.createElement('div');
    grid.className = 'featured-event-details';
    details.forEach((d) => grid.append(d));
    body.append(grid);
  }

  // CTA button
  if (data.ctaText) {
    const cta = document.createElement(data.ctaLink ? 'a' : 'span');
    cta.className = 'featured-event-cta';
    if (data.ctaLink) cta.href = data.ctaLink;
    if (data.ctaTextSource) moveInstrumentation(data.ctaTextSource, cta);
    cta.textContent = decorateButtonText(data.ctaText);
    body.append(cta);
  }

  card.append(body);
  return card;
}

/* ---------- decorate ---------- */

export default function decorate(block) {
  // Pull the block-level header out and remove its row so it isn't parsed as a card.
  // Walk up to the direct child of `block` (`:scope` in closest() won't match here).
  const directRowOf = (el) => {
    let cur = el;
    while (cur && cur.parentElement && cur.parentElement !== block) {
      cur = cur.parentElement;
    }
    return cur && cur.parentElement === block ? cur : null;
  };

  let headerHtml = '';
  let headerSource = null;
  const titleField = readRichTextField(block, 'title');
  if (titleField.source) {
    headerHtml = titleField.html;
    headerSource = titleField.source;
    directRowOf(titleField.source)?.remove();
  }

  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row) => {
    if (row.children.length < 1) return;

    const imageField = getImageField(row, 'image', 0);
    const imageAltField = getField(row, 'imageAlt', 21);
    const titleF = getRichTextField(row, 'cardTitle', 1);
    const descriptionField = getRichTextField(row, 'description', 2);

    const details = [1, 2, 3, 4].map((n, i) => {
      const base = 3 + i * 4;
      return {
        icon: getImageField(row, `detail${n}Icon`, base),
        iconColor: getField(row, `detail${n}IconColor`, base + 1).value,
        name: getField(row, `detail${n}Name`, base + 2).value,
        value: getField(row, `detail${n}Value`, base + 3).value,
      };
    });

    const ctaTextField = getField(row, 'ctaText', 19);
    const ctaLinkField = getLinkField(row, 'ctaLink', 20);

    const hasContent = imageField.picture
      || titleF.value
      || descriptionField.value
      || ctaTextField.value
      || details.some((d) => d.icon.img || d.name || d.value);

    const isAuthoring = Boolean(
      row.getAttribute('data-aue-resource')
        || row.querySelector('[data-aue-resource], [data-aue-prop]'),
    );

    if (!hasContent && !isAuthoring) return;

    cards.push({
      imageField,
      imageAlt: imageAltField.value,
      titleField: titleF,
      descriptionField,
      details,
      ctaText: ctaTextField.value,
      ctaTextSource: ctaTextField.source,
      ctaLink: ctaLinkField.value,
      row,
    });
  });

  /* ---------- Build DOM ---------- */

  const inner = document.createElement('div');
  inner.className = 'featured-event-inner';

  if (headerHtml && headerHtml.trim()) {
    const header = document.createElement('div');
    header.className = 'featured-event-header';
    if (headerSource) moveInstrumentation(headerSource, header);
    header.innerHTML = headerHtml;
    inner.append(header);
  }

  const grid = document.createElement('div');
  grid.className = 'featured-event-grid';
  cards.forEach((data) => grid.append(buildCard(data)));
  inner.append(grid);

  block.replaceChildren(inner);
}
