import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  if (rows[index]) return { source: null, value: rows[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  if (rows[index]) {
    const anchor = rows[index].querySelector('a');
    return { source: null, value: anchor?.href || rows[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getImageField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return { source, img };
  }
  if (rows[index]) {
    const img = rows[index].querySelector('img');
    return { source: null, img: img || null };
  }
  return { source: null, img: null };
}

function hexToRgba(hex, opacity) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const iconField = getImageField(block, rows, 'icon', 0);
  const titleField = getField(block, rows, 'title', 1);
  const subtitleField = getField(block, rows, 'subtitle', 2);
  const bgColorField = getField(block, rows, 'backgroundColor', 3);
  const buttonTextField = getField(block, rows, 'buttonText', 4);
  const buttonLinkField = getLinkField(block, rows, 'buttonLink', 5);
  const buttonColorField = getField(block, rows, 'buttonColor', 6);
  const buttonTextColorField = getField(block, rows, 'buttonTextColor', 7);

  // Apply background color at 32% opacity
  const bgHex = bgColorField.value || '#000000';
  block.style.setProperty('background-color', hexToRgba(bgHex, 0.32), 'important');

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

  const btnColor = buttonColorField.value;
  const btnTextColor = buttonTextColorField.value;
  if (btnColor) btn.style.setProperty('background-color', btnColor, 'important');
  if (btnTextColor) btn.style.setProperty('color', btnTextColor, 'important');
  right.append(btn);

  block.replaceChildren(left, right);
}
