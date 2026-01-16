import { moveInstrumentation } from '../../scripts/scripts.js';

function normalizeHeight(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^[0-9]*\.?[0-9]+$/.test(trimmed)) return `${trimmed}rem`;
  if (/^[0-9]*\.?[0-9]+rem$/.test(trimmed)) return trimmed;
  return null;
}

function getFieldValue(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return { source: null, value: '' };
  return { source, value: source.textContent.trim() };
}

function renderHtmlText(block) {
  const { source, value: html } = getFieldValue(block, 'text_html');
  if (!source) return null;
  if (!html) {
    source.remove();
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'hero-text-html';
  wrapper.innerHTML = html;
  moveInstrumentation(source, wrapper);
  source.replaceWith(wrapper);
  return wrapper;
}

function normalizeHexColor(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed) || /^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function readTextColor(block) {
  const rowsToRemove = [];
  let rawValue = null;

  const instrumented = block.querySelector('[data-aue-prop="text_color"]');
  if (instrumented) {
    rawValue = instrumented.textContent;
    const row = instrumented.closest(':scope > div');
    if (row) {
      rowsToRemove.push(row);
    } else {
      const paragraph = instrumented.closest('p');
      rowsToRemove.push(paragraph || instrumented);
    }
  } else {
    block.querySelectorAll(':scope > div').forEach((row) => {
      if (row.children.length !== 2) return;
      const key = row.children[0].textContent.trim().toLowerCase();
      if (['text color', 'text color (hex)', 'text colour', 'text colour (hex)'].includes(key)) {
        rawValue = row.children[1].textContent;
        rowsToRemove.push(row);
      }
    });
  }

  rowsToRemove.forEach((row) => row.remove());
  return normalizeHexColor(rawValue);
}

function applyRichtextColor(block) {
  const color = readTextColor(block);
  if (!color) return;
  const header = block.querySelector('h1, h2, h3, h4, h5, h6');
  if (header) {
    header.style.color = color;
    return;
  }
  const richtext = block.querySelector('[data-aue-prop="text"]')
    || block.querySelector('[data-richtext-prop="text"]');
  if (richtext) richtext.style.color = color;
}

function readHeight(block) {
  const rowsToRemove = [];
  let rawValue = null;

  const instrumented = block.querySelector('[data-aue-prop="height"]');
  if (instrumented) {
    rawValue = instrumented.textContent;
    const row = instrumented.closest(':scope > div');
    if (row) {
      rowsToRemove.push(row);
    } else {
      const paragraph = instrumented.closest('p');
      rowsToRemove.push(paragraph || instrumented);
    }
  } else {
    block.querySelectorAll(':scope > div').forEach((row) => {
      if (row.children.length !== 2) return;
      const key = row.children[0].textContent.trim().toLowerCase();
      if (['height', 'hero height', 'height (rem)', 'hero height (rem)'].includes(key)) {
        rawValue = row.children[1].textContent;
        rowsToRemove.push(row);
      }
    });
  }

  rowsToRemove.forEach((row) => row.remove());
  return normalizeHeight(rawValue);
}

export default function decorate(block) {
  const htmlWrapper = renderHtmlText(block);
  if (htmlWrapper) {
    const { source: classSource, value: classValue } = getFieldValue(block, 'textHtmlClass');
    if (classValue) {
      const classes = classValue.split(/\s+/).filter(Boolean);
      if (classes.length) htmlWrapper.classList.add(...classes);
    }
    if (classSource) classSource.remove();
  }
  const height = readHeight(block);
  if (height) {
    block.style.setProperty('--hero-height', height);
  }
  applyRichtextColor(block);
}
