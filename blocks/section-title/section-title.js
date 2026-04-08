import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  // legacy table fallback
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

function getLinkField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return {
      source,
      value: anchor?.getAttribute('href') || source.textContent.trim(),
    };
  }
  return { source: null, value: '' };
}

/**
 * Color text fields can be auto-linked by EDS — pull a hex back out of an
 * https:// href if needed (mirrors split-card-info.js).
 */
function normalizeColorValue(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hexMatch = trimmed.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(trimmed) && hexMatch) {
    return hexMatch[0];
  }
  return trimmed;
}

function buildButton(block) {
  const buttonTextField = getField(block, 'buttonText');
  if (!buttonTextField.value) return null;

  const buttonLinkField = getLinkField(block, 'buttonLink');
  const buttonStyleField = getField(block, 'buttonStyle');
  const buttonColorField = getField(block, 'buttonColor');
  const buttonTextColorField = getField(block, 'buttonTextColor');

  const style = (buttonStyleField.value || 'solid').toLowerCase();
  const bgColor = normalizeColorValue(buttonColorField.value) || '#008db6';
  const textColor = normalizeColorValue(buttonTextColorField.value)
    || (style === 'outlined' ? bgColor : '#ffffff');

  const href = buttonLinkField.value;
  const btn = document.createElement(href ? 'a' : 'span');
  btn.className = `section-title-button section-title-button-${style}`;
  if (href) btn.href = href;
  btn.textContent = buttonTextField.value;
  if (buttonTextField.source) {
    moveInstrumentation(buttonTextField.source, btn);
  }

  if (style === 'outlined') {
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('border', `1.5px solid ${bgColor}`, 'important');
    btn.style.setProperty('color', textColor, 'important');
  } else {
    btn.style.setProperty('background-color', bgColor, 'important');
    btn.style.setProperty('border', `1.5px solid ${bgColor}`, 'important');
    btn.style.setProperty('color', textColor, 'important');
  }

  return btn;
}

export default function decorate(block) {
  const titleField = getField(block, 'title');
  const subtitleField = getField(block, 'subtitle');
  const alignField = getField(block, 'textAlign');

  const alignment = alignField.value || 'left';
  if (alignField.row) alignField.row.remove();

  // Build the button BEFORE we touch anything else, so its source rows are
  // still in place when we extract them.
  const buttonEl = buildButton(block);

  const wrapper = document.createElement('div');
  wrapper.className = 'section-title-inner';
  if (['left', 'center', 'right'].includes(alignment)) {
    wrapper.classList.add(`section-title-align-${alignment}`);
  }

  const textWrap = document.createElement('div');
  textWrap.className = 'section-title-text';
  if (['left', 'center', 'right'].includes(alignment)) {
    textWrap.style.textAlign = alignment;
  }

  // title
  if (titleField.value || titleField.source) {
    const titleEl = document.createElement('h2');
    titleEl.className = 'section-title-heading';
    if (titleField.source) {
      moveInstrumentation(titleField.source, titleEl);
      while (titleField.source.firstChild) titleEl.append(titleField.source.firstChild);
      titleField.source.remove();
    } else {
      titleEl.textContent = titleField.value;
    }
    textWrap.append(titleEl);
  }

  // subtitle (richtext)
  if (subtitleField.value || subtitleField.source) {
    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'section-title-subtitle';
    if (subtitleField.source) {
      moveInstrumentation(subtitleField.source, subtitleEl);
      while (subtitleField.source.firstChild) subtitleEl.append(subtitleField.source.firstChild);
      subtitleField.source.remove();
    } else {
      subtitleEl.textContent = subtitleField.value;
    }
    textWrap.append(subtitleEl);
  }

  wrapper.append(textWrap);
  if (buttonEl) wrapper.append(buttonEl);

  block.replaceChildren(wrapper);
}
