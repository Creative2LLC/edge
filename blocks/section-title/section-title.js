import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkField, readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  title: 0,
  titleColor: 1,
  subtitle: 2,
  subtitleMaxWidth: 3,
  textAlign: 4,
  buttonText: 5,
  buttonLink: 6,
  buttonStyle: 7,
  buttonColor: 8,
  buttonTextColor: 9,
  marginTop: 10,
  marginBottom: 11,
};

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function fieldCell(row) {
  if (!row) return null;
  if (row.children.length === 2) return row.children[1];
  return row.children[0] || row;
}

function rowAt(rows, index) {
  return index >= 0 && index < rows.length ? fieldCell(rows[index]) : null;
}

function fieldText(row) {
  return fieldCell(row)?.textContent?.trim() || '';
}

function isHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
    .test(String(value || '').trim());
}

function isTextAlignValue(value) {
  return /^(?:left|center|right)$/i.test(String(value || '').trim());
}

function isButtonStyleValue(value) {
  return /^(?:solid|outlined)$/i.test(String(value || '').trim());
}

function isLengthSettingValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return /^-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?$/i.test(normalized)
    || /^(?:auto|none)$/i.test(normalized);
}

function isConfigOnlyValue(value) {
  return isHexColor(value)
    || isTextAlignValue(value)
    || isButtonStyleValue(value)
    || isLengthSettingValue(value);
}

function firstIndexFrom(values, start, predicate) {
  for (let index = Math.max(start, 0); index < values.length; index += 1) {
    if (predicate(values[index])) return index;
  }
  return -1;
}

function readPublishedFallbackCells(rows) {
  const values = rows.map(fieldText);
  const cells = {};
  let index = 0;

  cells.title = rowAt(rows, index);
  index += 1;

  if (isHexColor(values[index])) {
    cells.titleColor = rowAt(rows, index);
    index += 1;
  }

  const alignIndex = firstIndexFrom(values, index, isTextAlignValue);
  if (alignIndex >= 0) {
    const maybeWidthIndex = alignIndex - 1;
    if (maybeWidthIndex >= index && isLengthSettingValue(values[maybeWidthIndex])) {
      cells.subtitleMaxWidth = rowAt(rows, maybeWidthIndex);
    }

    if (alignIndex > index) {
      const subtitleEnd = cells.subtitleMaxWidth ? maybeWidthIndex : alignIndex;
      if (subtitleEnd > index && !isConfigOnlyValue(values[index])) {
        cells.subtitle = rowAt(rows, index);
      }
    }

    cells.textAlign = rowAt(rows, alignIndex);
    index = alignIndex + 1;
  }

  const buttonStyleIndex = firstIndexFrom(values, index, isButtonStyleValue);
  if (buttonStyleIndex >= 0) {
    if (buttonStyleIndex > index && !isConfigOnlyValue(values[index])) {
      cells.buttonText = rowAt(rows, index);
    }
    if (buttonStyleIndex > index + 1) {
      cells.buttonLink = rowAt(rows, index + 1);
    }
    cells.buttonStyle = rowAt(rows, buttonStyleIndex);
    index = buttonStyleIndex + 1;
  }

  if (isHexColor(values[index])) {
    cells.buttonColor = rowAt(rows, index);
    index += 1;
  }
  if (isHexColor(values[index])) {
    cells.buttonTextColor = rowAt(rows, index);
    index += 1;
  }
  if (isLengthSettingValue(values[index])) {
    cells.marginTop = rowAt(rows, index);
    index += 1;
  }
  if (isLengthSettingValue(values[index])) {
    cells.marginBottom = rowAt(rows, index);
  }

  return cells;
}

function getIndexedFallbackCell(block, name) {
  return fieldCell(getRows(block)[FIELD_INDEX[name]]);
}

function getFallbackCell(block, fallbackCells, name, isEditor, allowEditorFallback = false) {
  if (isEditor && !allowEditorFallback) return null;
  if (!isEditor) return fallbackCells[name] || null;
  return getIndexedFallbackCell(block, name);
}

function getField(block, fallbackCells, name, isEditor, allowEditorFallback = false) {
  const field = readTextField(block, name, {
    labels: name,
    fallbackCell: getFallbackCell(block, fallbackCells, name, isEditor, allowEditorFallback),
  });
  return { ...field, source: field.source || (!isEditor ? field.cell : null) };
}

function getRichField(block, fallbackCells, name, isEditor, allowEditorFallback = false) {
  const field = readRichTextField(block, name, {
    labels: name,
    fallbackCell: getFallbackCell(block, fallbackCells, name, isEditor, allowEditorFallback),
  });
  return {
    ...field,
    source: field.source || (!isEditor ? field.cell : null),
    value: field.html || field.text,
  };
}

function getLinkField(block, fallbackCells, name, isEditor, allowEditorFallback = false) {
  const field = readLinkField(block, name, {
    labels: name,
    fallbackCell: getFallbackCell(block, fallbackCells, name, isEditor, allowEditorFallback),
  });
  return { ...field, source: field.source || (!isEditor ? field.cell : null) };
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

function buildButton(block, fallbackCells, isEditor) {
  const buttonTextField = getField(block, fallbackCells, 'buttonText', isEditor);
  if (!buttonTextField.value || isConfigOnlyValue(buttonTextField.value)) return null;

  const buttonLinkField = getLinkField(block, fallbackCells, 'buttonLink', isEditor);
  const buttonStyleField = getField(block, fallbackCells, 'buttonStyle', isEditor, true);
  const buttonColorField = getField(block, fallbackCells, 'buttonColor', isEditor, true);
  const buttonTextColorField = getField(block, fallbackCells, 'buttonTextColor', isEditor, true);

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
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const rows = getRows(block);
  const fallbackCells = readPublishedFallbackCells(rows);
  const titleField = getRichField(block, fallbackCells, 'title', isEditor);
  const subtitleField = getRichField(block, fallbackCells, 'subtitle', isEditor);
  const subtitleMaxWidth = normalizeSubtitleMaxWidth(
    getField(block, fallbackCells, 'subtitleMaxWidth', isEditor, true).value,
  );
  const alignField = getField(block, fallbackCells, 'textAlign', isEditor, true);
  const titleColor = normalizeColorValue(
    getField(block, fallbackCells, 'titleColor', isEditor, true).value,
  );

  const alignment = alignField.value || 'left';

  const marginTopField = getField(block, fallbackCells, 'marginTop', isEditor, true);
  const marginBottomField = getField(block, fallbackCells, 'marginBottom', isEditor, true);
  const marginTopValue = normalizeLengthValue(marginTopField.value);
  const marginBottomValue = normalizeLengthValue(marginBottomField.value);
  if (marginTopValue) block.style.setProperty('margin-top', marginTopValue, 'important');
  if (marginBottomValue) block.style.setProperty('margin-bottom', marginBottomValue, 'important');

  // Build the button BEFORE we touch anything else, so its source rows are
  // still in place when we extract them.
  const buttonEl = buildButton(block, fallbackCells, isEditor);

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
    if (titleColor) titleEl.style.setProperty('color', titleColor, 'important');
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
