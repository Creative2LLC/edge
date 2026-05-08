import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

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

function styleButton(btn, color, textColor, style) {
  const bgColor = color || '#008db6';
  if (style === 'outlined') {
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('color', bgColor, 'important');
    btn.style.setProperty('border', `2px solid ${bgColor}`, 'important');
  } else {
    btn.style.setProperty('background-color', bgColor, 'important');
    btn.style.setProperty('color', textColor || '#ffffff', 'important');
    btn.style.setProperty('border', 'none', 'important');
  }
}

export default function decorate(block) {
  const imageField = readImageField(block, 'image', 0);
  const picture = getImage(imageField);
  const imageAlt = readTextField(block, 'imageAlt', 1).value;

  const titleField = readTextField(block, 'title', 2);
  const subtitleSource = readRichTextField(block, 'subtitle', 3);
  const sectionHeaderField = readTextField(block, 'sectionHeader', 4);
  const sectionTextSource = readRichTextField(block, 'sectionText', 5);
  const card1TitleField = readTextField(block, 'card1Title', 6);
  const card1TextSource = readRichTextField(block, 'card1Text', 7);
  const card2TitleField = readTextField(block, 'card2Title', 8);
  const card2TextSource = readRichTextField(block, 'card2Text', 9);
  const bottomHeaderField = readTextField(block, 'bottomHeader', 10);
  const bottomTextSource = readRichTextField(block, 'bottomText', 11);
  const buttonTextField = readTextField(block, 'buttonText', 12);
  const buttonLinkField = readLinkField(block, 'buttonLink', 13);
  const buttonColorField = readTextField(block, 'buttonColor', 14);
  const buttonTextColorField = readTextField(block, 'buttonTextColor', 15);
  const buttonStyleField = readTextField(block, 'buttonStyle', 16);
  const contentBgField = readTextField(block, 'contentBackgroundColor', 17);

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
