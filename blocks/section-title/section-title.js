import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkField, readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  title: 0,
  subtitle: 1,
  subtitleMaxWidth: 2,
  textAlign: 3,
  buttonText: 4,
  buttonLink: 5,
  buttonStyle: 6,
  buttonColor: 7,
  buttonTextColor: 8,
  marginTop: 9,
  marginBottom: 10,
};

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getIndexedFallbackCell(block, name) {
  const row = getRows(block)[FIELD_INDEX[name]];
  if (!row) return null;
  if (row.children.length === 2) return row.children[1];
  return row.children[0] || row;
}

function getField(block, name) {
  const field = readTextField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
  return { ...field, source: field.source || field.cell };
}

function getRichField(block, name) {
  const field = readRichTextField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
  return { ...field, source: field.source || field.cell, value: field.html || field.text };
}

function getLinkField(block, name) {
  const field = readLinkField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
  return { ...field, source: field.source || field.cell };
}

/**
 * Color text fields can be auto-linked by EDS — pull a hex back out of an
 * https:// href if needed (mirrors split-card-info.js).
 */
function normalizeLengthValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

/**
 * Subtitle max width: blank keeps the CSS default, 0 means no max width,
 * any other number is treated as a pixel value (e.g. 900 -> 900px).
 */
function normalizeSubtitleMaxWidth(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (parseFloat(trimmed) === 0) return 'none';
  return normalizeLengthValue(trimmed);
}

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
  const titleField = getRichField(block, 'title');
  const subtitleField = getRichField(block, 'subtitle');
  const subtitleMaxWidth = normalizeSubtitleMaxWidth(getField(block, 'subtitleMaxWidth').value);
  const alignField = getField(block, 'textAlign');

  const alignment = alignField.value || 'left';

  const marginTopField = getField(block, 'marginTop');
  const marginBottomField = getField(block, 'marginBottom');
  const marginTopValue = normalizeLengthValue(marginTopField.value);
  const marginBottomValue = normalizeLengthValue(marginBottomField.value);
  if (marginTopValue) block.style.setProperty('margin-top', marginTopValue, 'important');
  if (marginBottomValue) block.style.setProperty('margin-bottom', marginBottomValue, 'important');

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

  // title (richtext)
  if (titleField.value || titleField.source) {
    const titleEl = document.createElement('h2');
    titleEl.className = 'section-title-heading';
    if (titleField.source) {
      moveInstrumentation(titleField.source, titleEl);
      // Flatten rich text block wrappers (p/div) into the heading, keeping each
      // authored paragraph on its own line via <br> and preserving inline formatting.
      const titleBlocks = [...titleField.source.children]
        .filter((node) => node.tagName === 'P' || node.tagName === 'DIV');
      if (titleBlocks.length) {
        titleBlocks.forEach((blockEl, index) => {
          if (index > 0) titleEl.append(document.createElement('br'));
          while (blockEl.firstChild) titleEl.append(blockEl.firstChild);
        });
      } else {
        while (titleField.source.firstChild) titleEl.append(titleField.source.firstChild);
      }
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
    if (subtitleMaxWidth) subtitleEl.style.setProperty('max-width', subtitleMaxWidth);
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
