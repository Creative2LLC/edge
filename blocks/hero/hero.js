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
    const { source: classSource, value: classValue } = getFieldValue(block, 'text_html_class');
    const { source: styleSource, value: styleValue } = getFieldValue(block, 'text_html_style');
    if (classValue) {
      const classes = classValue.split(/\s+/).filter(Boolean);
      if (classes.length) htmlWrapper.classList.add(...classes);
    }
    if (styleValue) {
      htmlWrapper.style.cssText = styleValue;
    }
    if (classSource) classSource.remove();
    if (styleSource) styleSource.remove();
  }
  const height = readHeight(block);
  if (height) {
    block.style.setProperty('--hero-height', height);
  }
}
