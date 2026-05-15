import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  image: 0,
  imageAlt: 1,
  title: 2,
  subtitle: 3,
  sectionHeader: 4,
  sectionText: 5,
  card1Title: 6,
  card1Text: 7,
  card2Title: 8,
  card2Text: 9,
  bottomHeader: 10,
  bottomText: 11,
  buttonText: 12,
  buttonLink: 13,
  buttonColor: 14,
  buttonTextColor: 15,
  buttonStyle: 16,
  contentBackgroundColor: 17,
};

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getFallbackCell(block, name) {
  const row = getRows(block)[FIELD_INDEX[name]];
  if (!row) return null;
  if (row.children.length === 2) return row.children[1];
  return row.children[0] || row;
}

function getTextField(block, name) {
  return readTextField(block, name, { fallbackCell: getFallbackCell(block, name) });
}

function getRichTextField(block, name) {
  return readRichTextField(block, name, { fallbackCell: getFallbackCell(block, name) });
}

function getLinkField(block, name) {
  return readLinkField(block, name, { fallbackCell: getFallbackCell(block, name) });
}

function getImageField(block, name) {
  return readImageField(block, name, { fallbackCell: getFallbackCell(block, name) });
}

function getImage(imageField) {
  const { picture } = imageField;
  if (!picture) return null;
  const img = picture.querySelector('img');
  if (!img) return picture;
  const optimized = createOptimizedPicture(img.src, img.alt, false, [
    { media: '(min-width: 900px)', width: '600' },
    { width: '400' },
  ]);
  picture.replaceWith(optimized);
  return optimized;
}

function appendRichContent(parent, source, className) {
  const cell = source?.cell || source;
  if (!cell) return;
  const div = document.createElement('div');
  div.className = className;
  if (source?.source) moveInstrumentation(source.source, div);
  while (cell.firstChild) div.append(cell.firstChild);
  if (div.childNodes.length) parent.append(div);
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function resolveHex(value, fallback) {
  const trimmed = (value || '').trim();
  return HEX_COLOR.test(trimmed) ? trimmed : fallback;
}

function styleButton(btn, color, textColor, style) {
  const bgColor = resolveHex(color, '#008db6');
  const fgColor = resolveHex(textColor, '#ffffff');
  const normalizedStyle = (style || '').trim().toLowerCase();
  if (normalizedStyle === 'outlined') {
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('color', bgColor, 'important');
    btn.style.setProperty('border', `2px solid ${bgColor}`, 'important');
  } else {
    btn.style.setProperty('background-color', bgColor, 'important');
    btn.style.setProperty('color', fgColor, 'important');
    btn.style.setProperty('border', 'none', 'important');
  }
}

export default function decorate(block) {
  const imageField = getImageField(block, 'image');
  const picture = getImage(imageField);
  const imageAlt = getTextField(block, 'imageAlt').value;

  const titleField = getTextField(block, 'title');
  const subtitleSource = getRichTextField(block, 'subtitle');
  const sectionHeaderField = getTextField(block, 'sectionHeader');
  const sectionTextSource = getRichTextField(block, 'sectionText');
  const card1TitleField = getTextField(block, 'card1Title');
  const card1TextSource = getRichTextField(block, 'card1Text');
  const card2TitleField = getTextField(block, 'card2Title');
  const card2TextSource = getRichTextField(block, 'card2Text');
  const bottomHeaderField = getTextField(block, 'bottomHeader');
  const bottomTextSource = getRichTextField(block, 'bottomText');
  const buttonTextField = getTextField(block, 'buttonText');
  const buttonLinkField = getLinkField(block, 'buttonLink');
  const buttonColorField = getTextField(block, 'buttonColor');
  const buttonTextColorField = getTextField(block, 'buttonTextColor');
  const buttonStyleField = getTextField(block, 'buttonStyle');
  const contentBgField = getTextField(block, 'contentBackgroundColor');

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAlt) img.alt = imageAlt;
  }

  /* Outer wrapper */
  const inner = document.createElement('div');
  inner.className = 'internship-program-inner';

  /* Left — image */
  const media = document.createElement('div');
  media.className = 'internship-program-media';
  if (picture) media.append(picture);
  inner.append(media);

  /* Right — content */
  const content = document.createElement('div');
  content.className = 'internship-program-content';
  const bgColor = contentBgField.value || '#DDD5CC52';
  content.style.setProperty('background-color', bgColor, 'important');

  /* Title */
  if (titleField.value) {
    const h2 = document.createElement('h2');
    h2.className = 'internship-program-title';
    h2.textContent = titleField.value;
    if (titleField.source) moveInstrumentation(titleField.source, h2);
    content.append(h2);
  }

  /* Subtitle (richtext) */
  appendRichContent(content, subtitleSource, 'internship-program-subtitle');

  /* Section header */
  if (sectionHeaderField.value) {
    const h4 = document.createElement('h4');
    h4.className = 'internship-program-section-header';
    h4.textContent = sectionHeaderField.value;
    if (sectionHeaderField.source) moveInstrumentation(sectionHeaderField.source, h4);
    content.append(h4);
  }

  /* Section text (richtext) */
  appendRichContent(content, sectionTextSource, 'internship-program-section-text');

  /* Two side-by-side cards */
  const hasCard1 = card1TitleField.value || card1TextSource.text;
  const hasCard2 = card2TitleField.value || card2TextSource.text;

  if (hasCard1 || hasCard2) {
    const cardRow = document.createElement('div');
    cardRow.className = 'internship-program-cards';

    [
      { title: card1TitleField, text: card1TextSource },
      { title: card2TitleField, text: card2TextSource },
    ].forEach((cardData) => {
      if (!cardData.title.value && !cardData.text.text) return;

      const card = document.createElement('div');
      card.className = 'internship-program-card';

      if (cardData.title.value) {
        const h3 = document.createElement('h3');
        h3.className = 'internship-program-card-title';
        h3.textContent = cardData.title.value;
        if (cardData.title.source) moveInstrumentation(cardData.title.source, h3);
        card.append(h3);
      }

      appendRichContent(card, cardData.text, 'internship-program-card-text');
      cardRow.append(card);
    });

    content.append(cardRow);
  }

  /* Bottom header */
  if (bottomHeaderField.value) {
    const h3 = document.createElement('h3');
    h3.className = 'internship-program-bottom-header';
    h3.textContent = bottomHeaderField.value;
    if (bottomHeaderField.source) moveInstrumentation(bottomHeaderField.source, h3);
    content.append(h3);
  }

  /* Bottom text (richtext) */
  appendRichContent(content, bottomTextSource, 'internship-program-bottom-text');

  /* Button */
  const btnLabel = buttonTextField.value;
  const btnHref = buttonLinkField.value;
  if (btnLabel || btnHref) {
    const btn = document.createElement(btnHref ? 'a' : 'button');
    btn.className = 'internship-program-button';
    btn.textContent = btnLabel || 'Learn More';
    if (btnHref) btn.href = btnHref;
    if (!btnHref) btn.type = 'button';
    if (buttonTextField.source) moveInstrumentation(buttonTextField.source, btn);
    styleButton(
      btn,
      buttonColorField.value,
      buttonTextColorField.value,
      buttonStyleField.value,
    );
    content.append(btn);
  }

  inner.append(content);
  block.replaceChildren(inner);
}
