import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getBlockRows,
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { applyButtonStyle, resolveButtonStyle } from '../../scripts/button-utils.js';
import { LIGHT_SURFACES } from '../../scripts/color-tokens.js';

// The light site steps are finished surface tints (the old 32% #DDD5CC arrives as Warm Gray),
// so they paint solid; any other pick keeps the block's 32% wash.
const SOLID_BACKGROUNDS = new Set(LIGHT_SURFACES.map((swatch) => swatch.hex));

function getField(block, rows, name, index) {
  return readTextField(block, name, { fallbackCell: rows[index] });
}

function getLinkField(block, rows, name, index) {
  return readLinkField(block, name, { fallbackCell: rows[index] });
}

function getImageField(block, rows, name, index) {
  const field = readImageField(block, name, { fallbackCell: rows[index] });
  return { source: field.source || field.cell, img: field.img };
}

function hexToRgba(hex, opacity) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export default function decorate(block) {
  const rows = getBlockRows(block);

  const iconField = getImageField(block, rows, 'icon', 0);
  const titleField = getField(block, rows, 'title', 1);
  const subtitleField = getField(block, rows, 'subtitle', 2);
  const bgColorField = getField(block, rows, 'backgroundColor', 3);
  const buttonTextField = getField(block, rows, 'buttonText', 4);
  const buttonLinkField = getLinkField(block, rows, 'buttonLink', 5);
  const buttonColorField = getField(block, rows, 'buttonColor', 6);

  // Apply background color at 32% opacity
  const bgHex = bgColorField.value || '#000000';
  const solidHex = bgHex.slice(0, 7).toUpperCase();
  block.style.setProperty('background-color', SOLID_BACKGROUNDS.has(solidHex) ? solidHex : hexToRgba(bgHex, 0.32), 'important');

  // Build left side — icon
  const left = document.createElement('div');
  left.className = 'cta-card-2-left';

  if (iconField.img) {
    const img = iconField.img.cloneNode(true);
    img.className = 'cta-card-2-icon';
    if (iconField.source) moveInstrumentation(iconField.source, img);
    left.append(img);
  }

  // Build right side — title, subtitle, button
  const right = document.createElement('div');
  right.className = 'cta-card-2-right';

  if (titleField.value || titleField.source) {
    const h2 = document.createElement('h2');
    h2.className = 'cta-card-2-title';
    if (titleField.source) {
      moveInstrumentation(titleField.source, h2);
      while (titleField.source.firstChild) h2.append(titleField.source.firstChild);
    } else {
      h2.textContent = titleField.value;
    }
    right.append(h2);
  }

  if (subtitleField.value || subtitleField.source) {
    const subtitle = document.createElement('div');
    subtitle.className = 'cta-card-2-subtitle';
    if (subtitleField.source) {
      moveInstrumentation(subtitleField.source, subtitle);
      while (subtitleField.source.firstChild) subtitle.append(subtitleField.source.firstChild);
    } else {
      subtitle.textContent = subtitleField.value;
    }
    right.append(subtitle);
  }

  const btnLabel = buttonTextField.value || 'Learn More';
  const btnHref = buttonLinkField.value;
  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'cta-card-2-button';
  btn.textContent = btnLabel;
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';
  if (buttonTextField.source) {
    moveInstrumentation(buttonTextField.source, btn);
    buttonTextField.source.remove();
  }

  // The look comes from the button standard; the old colour picker only chooses the style.
  applyButtonStyle(btn, resolveButtonStyle(buttonColorField.value));
  right.append(btn);

  block.replaceChildren(left, right);
}
