import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  // legacy table fallback: rows with key-value pairs
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

function getImage(block) {
  const source = block.querySelector('[data-aue-prop="image"]');
  const picture = source?.querySelector('picture') || block.querySelector('picture');
  if (!picture) return null;
  const img = picture.querySelector('img');
  if (!img) return picture;
  const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
  if (source) {
    moveInstrumentation(source, optimized);
  }
  return optimized;
}

export default function decorate(block) {
  const picture = getImage(block);
  const headingField = getField(block, 'heading');
  const bodyField = getField(block, 'bodyText');
  const imageAltField = getField(block, 'imageAlt');

  if (picture && imageAltField.value) {
    const img = picture.querySelector('img');
    if (img) img.alt = imageAltField.value;
  }

  // Clean up legacy rows
  if (imageAltField.row) imageAltField.row.remove();

  // Build DOM
  const wrapper = document.createElement('div');
  wrapper.className = 'text-left-image-right-inner';

  // Left: text content
  const contentSide = document.createElement('div');
  contentSide.className = 'text-left-image-right-content';

  if (headingField.value || headingField.source) {
    const h2 = document.createElement('h2');
    h2.className = 'text-left-image-right-heading';
    if (headingField.source) {
      moveInstrumentation(headingField.source, h2);
      while (headingField.source.firstChild) h2.append(headingField.source.firstChild);
      headingField.source.remove();
    } else {
      h2.textContent = headingField.value;
    }
    wrapper.append(contentSide);
    contentSide.append(h2);
  }

  if (bodyField.value || bodyField.source) {
    const p = document.createElement('p');
    p.className = 'text-left-image-right-body';
    if (bodyField.source) {
      moveInstrumentation(bodyField.source, p);
      while (bodyField.source.firstChild) p.append(bodyField.source.firstChild);
      bodyField.source.remove();
    } else {
      p.textContent = bodyField.value;
    }
    contentSide.append(p);
  }

  wrapper.append(contentSide);

  // Right: image
  const mediaSide = document.createElement('div');
  mediaSide.className = 'text-left-image-right-media';
  if (picture) mediaSide.append(picture);
  wrapper.append(mediaSide);

  block.replaceChildren(wrapper);
}
