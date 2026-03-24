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

export default function decorate(block) {
  const titleField = getField(block, 'title');
  const subtitleField = getField(block, 'subtitle');
  const alignField = getField(block, 'textAlign');

  const alignment = alignField.value || 'left';
  if (alignField.row) alignField.row.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'section-title-inner';

  if (['left', 'center', 'right'].includes(alignment)) {
    wrapper.style.textAlign = alignment;
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
    wrapper.append(titleEl);
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
    wrapper.append(subtitleEl);
  }

  block.replaceChildren(wrapper);
}
