import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  if (rows[index]) return { source: null, value: rows[index].textContent.trim() };
  return { source: null, value: '' };
}

function getImageFromRows(block, rows, index) {
  // Try data-aue-prop first
  const source = block.querySelector('[data-aue-prop="image"]');
  const picture = source?.querySelector('picture')
    || rows[index]?.querySelector('picture')
    || block.querySelector('picture');
  if (!picture) return null;
  const img = picture.querySelector('img');
  if (!img) return picture;
  return createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
}

function buildTextElement(tag, className, field) {
  if (!field?.value && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else {
    el.textContent = field.value;
  }
  return el;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  // Fields match the model order: heading (0), body (1), image (2), imageAlt (3)
  const headingField = getField(block, rows, 'heading', 0);
  const bodyField = getField(block, rows, 'body', 1);
  const picture = getImageFromRows(block, rows, 2);
  const imageAltField = getField(block, rows, 'imageAlt', 3);

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAltField.value) img.alt = imageAltField.value;
  }

  // Build DOM
  const wrapper = document.createElement('div');
  wrapper.className = 'text-left-image-right-inner';

  // Left: text content
  const contentSide = document.createElement('div');
  contentSide.className = 'text-left-image-right-content';

  const heading = buildTextElement('h2', 'text-left-image-right-heading', headingField);
  if (heading) contentSide.append(heading);

  const body = buildTextElement('p', 'text-left-image-right-body', bodyField);
  if (body) contentSide.append(body);

  wrapper.append(contentSide);

  // Right: image
  const mediaSide = document.createElement('div');
  mediaSide.className = 'text-left-image-right-media';
  if (picture) mediaSide.append(picture);
  wrapper.append(mediaSide);

  block.replaceChildren(wrapper);
}
