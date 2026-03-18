import { createOptimizedPicture } from '../../scripts/aem.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  body: ['body', 'body text', 'description'],
  imageAlt: ['image alt', 'imagealt', 'alt text'],
};

function collectLegacyFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(LEGACY_BLOCK_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      map[name] = valueEl.textContent.trim();
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getField(block, legacyMap, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const value = source.textContent.trim();
    source.remove();
    return value;
  }
  return legacyMap[name] || '';
}

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

export default function decorate(block) {
  const legacyMap = collectLegacyFields(block);

  const picture = getImage(block);
  const heading = getField(block, legacyMap, 'heading');
  const body = getField(block, legacyMap, 'body');
  const imageAlt = getField(block, legacyMap, 'imageAlt');

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAlt) img.alt = imageAlt;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'text-left-image-right-inner';

  // Left: text content
  const contentSide = document.createElement('div');
  contentSide.className = 'text-left-image-right-content';

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'text-left-image-right-heading';
    h2.textContent = heading;
    contentSide.append(h2);
  }

  if (body) {
    const p = document.createElement('p');
    p.className = 'text-left-image-right-body';
    p.textContent = body;
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
