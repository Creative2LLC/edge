import { createOptimizedPicture } from '../../scripts/aem.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  subheading: ['subheading', 'sub heading'],
  buttonText: ['button text', 'buttontext', 'button label', 'button'],
  buttonLink: ['button link', 'button url', 'button href'],
  buttonColor: ['button color', 'buttoncolor', 'button background color'],
  backgroundColor: ['background color', 'backgroundcolor', 'bg color'],
  contentAlign: ['content align', 'contentalign', 'alignment', 'text align'],
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

function getLinkField(block, legacyMap, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    const value = anchor?.href || source.textContent.trim();
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

  // Extract image before removing other fields
  const picture = getImage(block);

  const heading = getField(block, legacyMap, 'heading');
  const subheading = getField(block, legacyMap, 'subheading');
  const buttonText = getField(block, legacyMap, 'buttonText');
  const buttonLink = getLinkField(block, legacyMap, 'buttonLink');
  const buttonColor = getField(block, legacyMap, 'buttonColor');
  const backgroundColor = getField(block, legacyMap, 'backgroundColor');
  const contentAlign = getField(block, legacyMap, 'contentAlign') || 'left';
  const imageAlt = getField(block, legacyMap, 'imageAlt');

  // Also scan remaining rows for any field values not yet extracted
  const remainingFields = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    row.querySelectorAll('[data-aue-prop]').forEach((el) => {
      const prop = el.getAttribute('data-aue-prop');
      if (prop && !remainingFields[prop]) {
        remainingFields[prop] = el.textContent.trim();
      }
    });
    // Also check columns by index for single-row block rendering
    const cols = [...row.children];
    cols.forEach((col) => {
      const prop = col.getAttribute('data-aue-prop');
      if (prop && !remainingFields[prop]) {
        remainingFields[prop] = col.textContent.trim();
      }
    });
  });

  const finalButtonColor = buttonColor || remainingFields.buttonColor || '';
  const finalBackgroundColor = backgroundColor || remainingFields.backgroundColor || '';
  const finalContentAlign = contentAlign !== 'left' ? contentAlign : (remainingFields.contentAlign || 'left');

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAlt) img.alt = imageAlt;
  }

  // Build DOM
  const card = document.createElement('div');
  card.className = 'split-card-inner';

  // Left: image
  const mediaSide = document.createElement('div');
  mediaSide.className = 'split-card-media';
  if (picture) mediaSide.append(picture);
  card.append(mediaSide);

  // Right: content
  const contentSide = document.createElement('div');
  contentSide.className = 'split-card-content';
  contentSide.style.textAlign = finalContentAlign;

  if (finalContentAlign === 'center') {
    contentSide.style.alignItems = 'center';
  } else if (finalContentAlign === 'right') {
    contentSide.style.alignItems = 'flex-end';
  }

  if (finalBackgroundColor) {
    contentSide.style.backgroundColor = finalBackgroundColor;
  }

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'split-card-heading';
    h2.textContent = heading;
    contentSide.append(h2);
  }

  if (subheading) {
    const p = document.createElement('p');
    p.className = 'split-card-subheading';
    p.textContent = subheading;
    contentSide.append(p);
  }

  if (buttonText && buttonLink) {
    const btn = document.createElement('a');
    btn.className = 'split-card-button';
    btn.href = buttonLink;
    btn.textContent = buttonText;
    if (finalButtonColor) {
      btn.style.backgroundColor = finalButtonColor;
    }
    contentSide.append(btn);
  }

  card.append(contentSide);

  block.replaceChildren(card);
}
