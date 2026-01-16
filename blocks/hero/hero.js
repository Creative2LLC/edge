import { moveInstrumentation } from '../../scripts/scripts.js';

function normalizeHeight(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^[0-9]*\.?[0-9]+$/.test(trimmed)) return `${trimmed}rem`;
  if (/^[0-9]*\.?[0-9]+rem$/.test(trimmed)) return trimmed;
  return null;
}

function renderHtmlText(block) {
  const source = block.querySelector('[data-aue-prop="text_html"]');
  if (!source) return;
  const html = source.textContent.trim();
  if (!html) {
    source.remove();
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'hero-text-html';
  wrapper.innerHTML = html;
  moveInstrumentation(source, wrapper);
  source.replaceWith(wrapper);
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
  renderHtmlText(block);
  const height = readHeight(block);
  if (height) {
    block.style.setProperty('--hero-height', height);
  }
}
