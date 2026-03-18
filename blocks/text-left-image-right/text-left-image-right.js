import { createOptimizedPicture } from '../../scripts/aem.js';

function getImage(block) {
  const source = block.querySelector('[data-aue-prop="image"]');
  const picture = source?.querySelector('picture') || block.querySelector('picture');
  if (!picture) return null;
  const img = picture.querySelector('img');
  if (!img) return picture;
  const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
  picture.replaceWith(optimized);
  return optimized;
}

function getFieldText(block, propName) {
  const el = block.querySelector(`[data-aue-prop="${propName}"]`);
  if (el) return el.textContent.trim();
  return '';
}

export default function decorate(block) {
  const picture = getImage(block);
  const heading = getFieldText(block, 'heading');
  const bodyText = getFieldText(block, 'bodyText');
  const imageAlt = getFieldText(block, 'imageAlt');

  if (picture && imageAlt) {
    const img = picture.querySelector('img');
    if (img) img.alt = imageAlt;
  }

  const inner = document.createElement('div');
  inner.className = 'text-left-image-right-inner';

  // Left: text content
  const contentSide = document.createElement('div');
  contentSide.className = 'text-left-image-right-content';

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'text-left-image-right-heading';
    h2.textContent = heading;
    contentSide.append(h2);
  }

  if (bodyText) {
    const p = document.createElement('p');
    p.className = 'text-left-image-right-body';
    p.textContent = bodyText;
    contentSide.append(p);
  }

  inner.append(contentSide);

  // Right: image
  const mediaSide = document.createElement('div');
  mediaSide.className = 'text-left-image-right-media';
  if (picture) mediaSide.append(picture);
  inner.append(mediaSide);

  block.replaceChildren(inner);
}
