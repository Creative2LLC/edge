import { moveInstrumentation } from '../../scripts/scripts.js';
import { readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  title: 0,
  body: 1,
  topMargin: 2,
  topPadding: 3,
  bottomPadding: 4,
  contentWidth: 5,
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

function getTextField(block, name) {
  return readTextField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
}

function getRichField(block, name) {
  return readRichTextField(block, name, {
    labels: name,
    fallbackCell: getIndexedFallbackCell(block, name),
  });
}

function normalizeLengthValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function moveText(field, target) {
  if (field.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    return;
  }

  target.textContent = field.value || '';
}

function moveHtml(field, target) {
  if (field.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    return;
  }

  target.innerHTML = field.html || '';
}

function applySpacing(block) {
  const topMargin = normalizeLengthValue(getTextField(block, 'topMargin').value);
  const topPadding = normalizeLengthValue(getTextField(block, 'topPadding').value);
  const bottomPadding = normalizeLengthValue(getTextField(block, 'bottomPadding').value);
  const contentWidth = normalizeLengthValue(getTextField(block, 'contentWidth').value);

  if (topMargin) block.style.setProperty('--terms-content-top-margin', topMargin);
  if (topPadding) block.style.setProperty('--terms-content-top-padding', topPadding);
  if (bottomPadding) block.style.setProperty('--terms-content-bottom-padding', bottomPadding);
  if (contentWidth) block.style.setProperty('--terms-content-max-width', contentWidth);
}

function buildPlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'terms-content-placeholder';

  const heading = document.createElement('p');
  heading.className = 'terms-content-placeholder-title';
  heading.textContent = 'Add terms content';

  const body = document.createElement('p');
  body.className = 'terms-content-placeholder-body';
  body.textContent = 'Use Universal Editor to add a title and rich text body.';

  placeholder.append(heading, body);
  return placeholder;
}

export default function decorate(block) {
  applySpacing(block);

  const titleField = getTextField(block, 'title');
  const bodyField = getRichField(block, 'body');
  const isAuthoring = hasAuthoringContext(block);

  const inner = document.createElement('div');
  inner.className = 'terms-content-inner';

  if (titleField.value || titleField.source) {
    const title = document.createElement('h1');
    title.className = 'terms-content-title';
    moveText(titleField, title);
    inner.append(title);
  }

  if (bodyField.html || bodyField.text || bodyField.source) {
    const body = document.createElement('div');
    body.className = 'terms-content-body';
    moveHtml(bodyField, body);
    inner.append(body);
  }

  if (!inner.childElementCount && isAuthoring) {
    inner.append(buildPlaceholder());
  }

  block.replaceChildren(inner);
}
