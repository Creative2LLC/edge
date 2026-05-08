import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getBlockRows,
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  icon: 0,
  iconColor: 1,
  title: 2,
  subtitle: 3,
  buttonText: 4,
  buttonLink: 5,
};

function getTextField(block, rows, name, index) {
  const field = readTextField(block, name, {
    fallbackCell: rows[index]?.children[0] || rows[index],
  });
  return { ...field, source: field.source || field.cell };
}

function getLinkField(block, rows, name, index) {
  const field = readLinkField(block, name, {
    fallbackCell: rows[index]?.children[0] || rows[index],
  });
  return { ...field, source: field.source || field.cell };
}

function getImageField(block, rows, name, index) {
  const field = readImageField(block, name, {
    fallbackCell: rows[index]?.children[0] || rows[index],
  });
  return { source: field.source || field.cell, img: field.img };
}

function moveText(field, target) {
  if (!field?.source) {
    target.textContent = field?.value || '';
    return;
  }
  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);
}

function buildIcon(iconField, iconColor) {
  if (!iconField.img) return null;

  const color = (iconColor || '').trim();
  const normalized = color.toLowerCase();
  const isWhite = normalized === '#ffffff' || normalized === '#fff' || normalized === 'white';

  if (!color) {
    const img = iconField.img.cloneNode(true);
    img.className = 'cta-banner-icon';
    if (iconField.source) moveInstrumentation(iconField.source, img);
    return img;
  }

  if (isWhite) {
    const img = iconField.img.cloneNode(true);
    img.className = 'cta-banner-icon';
    img.style.setProperty('filter', 'brightness(0) invert(1)', 'important');
    if (iconField.source) moveInstrumentation(iconField.source, img);
    return img;
  }

  const wrap = document.createElement('div');
  wrap.className = 'cta-banner-icon cta-banner-icon-masked';
  wrap.style.setProperty('background-color', color, 'important');
  wrap.style.setProperty('-webkit-mask-image', `url(${iconField.img.src})`, 'important');
  wrap.style.setProperty('mask-image', `url(${iconField.img.src})`, 'important');
  wrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
  wrap.style.setProperty('mask-size', 'contain', 'important');
  wrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('-webkit-mask-position', 'center', 'important');
  wrap.style.setProperty('mask-position', 'center', 'important');
  if (iconField.source) moveInstrumentation(iconField.source, wrap);
  return wrap;
}

export default function decorate(block) {
  const rows = getBlockRows(block);

  const iconField = getImageField(block, rows, 'icon', FIELD_INDEX.icon);
  const iconColorField = getTextField(block, rows, 'iconColor', FIELD_INDEX.iconColor);
  const titleField = getTextField(block, rows, 'title', FIELD_INDEX.title);
  const subtitleField = getTextField(block, rows, 'subtitle', FIELD_INDEX.subtitle);
  const buttonTextField = getTextField(block, rows, 'buttonText', FIELD_INDEX.buttonText);
  const buttonLinkField = getLinkField(block, rows, 'buttonLink', FIELD_INDEX.buttonLink);

  const card = document.createElement('div');
  card.className = 'cta-banner-card';

  const content = document.createElement('div');
  content.className = 'cta-banner-content';

  const icon = buildIcon(iconField, iconColorField.value);
  if (icon) content.append(icon);

  const titleEl = document.createElement('h3');
  titleEl.className = 'cta-banner-title';
  moveText(titleField, titleEl);
  if (titleEl.textContent.trim() || titleField.source) content.append(titleEl);

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'cta-banner-subtitle';
  moveText(subtitleField, subtitleEl);
  if (subtitleEl.textContent.trim() || subtitleField.source) content.append(subtitleEl);

  card.append(content);

  const btnLabel = buttonTextField.value;
  const btnHref = buttonLinkField.value;
  if (btnLabel || btnHref) {
    const btn = document.createElement(btnHref ? 'a' : 'button');
    btn.className = 'cta-banner-button';
    btn.textContent = btnLabel || 'Learn More';
    if (btnHref) btn.href = btnHref;
    if (!btnHref) btn.type = 'button';
    if (buttonTextField.source) moveInstrumentation(buttonTextField.source, btn);
    if (buttonLinkField.source && buttonLinkField.source !== buttonTextField.source) {
      moveInstrumentation(buttonLinkField.source, btn);
    }
    card.append(btn);
  }

  block.replaceChildren(card);
}
