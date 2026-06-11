import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { readImageField, readLinkField, readTextField } from '../../scripts/block-field-utils.js';

const POSITION_VALUES = ['align-left', 'align-center', 'align-right'];
const STYLE_VALUES = ['full-width'];

function normalizeOption(value, allowed) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
  return allowed.includes(normalized) ? normalized : null;
}

export default function decorate(block) {
  const imageField = readImageField(block, 'image', { fallbackCell: block.querySelector('picture')?.closest('div') });
  const altField = readTextField(block, 'imageAlt');
  const linkField = readLinkField(block, 'imageLink');
  const targetField = readTextField(block, 'imageTarget');
  const styleField = readTextField(block, 'imageStyle');
  const positionField = readTextField(block, 'imagePosition');

  const styleClass = normalizeOption(styleField.value, STYLE_VALUES);
  const positionClass = normalizeOption(positionField.value, POSITION_VALUES);

  if (styleClass) block.classList.add(styleClass);
  if (positionClass) block.classList.add(positionClass);

  const picture = imageField.picture || block.querySelector('picture');
  if (!picture) return;

  const img = picture.querySelector('img') || imageField.img;
  if (!img) return;

  const alt = altField.value || img.alt || '';
  const widths = styleClass === 'full-width'
    ? [{ media: '(min-width: 900px)', width: '2000' }, { media: '(min-width: 600px)', width: '1200' }, { width: '900' }]
    : [{ media: '(min-width: 900px)', width: '1200' }, { width: '750' }];

  const optimized = createOptimizedPicture(img.src, alt, false, widths);
  const optimizedImg = optimized.querySelector('img');
  if (optimizedImg && alt) optimizedImg.alt = alt;

  if (imageField.source && imageField.source !== picture && imageField.source !== img) {
    moveInstrumentation(imageField.source, optimized);
  }
  if (imageField.picture) moveInstrumentation(imageField.picture, optimized);
  if (imageField.img && optimizedImg) moveInstrumentation(imageField.img, optimizedImg);

  let media = optimized;
  const href = linkField.value;
  if (href) {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = targetField.value || '_self';
    if (anchor.target === '_blank') anchor.rel = 'noopener noreferrer';
    if (linkField.source) moveInstrumentation(linkField.source, anchor);
    anchor.append(optimized);
    media = anchor;
  }

  picture.replaceWith(media);

  // Remove leftover empty rows from field reading
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (!row.querySelector('picture, img, a[href]') && !row.querySelector('[data-aue-prop], [data-richtext-prop]')) {
      row.remove();
    }
  });
}
