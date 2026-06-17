import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readAueResourceFields,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const POSITION_VALUES = ['align-left', 'align-center', 'align-right'];
const STYLE_VALUES = ['full-width'];
const CAPTION_ALIGNMENT_VALUES = ['left', 'center', 'right'];

function normalizeOption(value, allowed) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
  return allowed.includes(normalized) ? normalized : null;
}

function hasCaptionContent(field, fallbackValue) {
  return Boolean(
    field?.text
      || field?.html
      || field?.source?.textContent?.trim()
      || String(fallbackValue || '').trim(),
  );
}

function appendCaptionContent(field, caption, fallbackValue) {
  if (field?.source) {
    moveInstrumentation(field.source, caption);
    while (field.source.firstChild) caption.append(field.source.firstChild);
    return;
  }

  const value = field?.html || fallbackValue || field?.text || '';
  if (/<[^>]+>/u.test(value)) caption.innerHTML = value;
  else caption.textContent = value;
}

export default async function decorate(block) {
  const imageField = readImageField(block, 'image', {
    fallbackCell: block.querySelector('picture')?.closest('div'),
  });
  const altField = readTextField(block, 'imageAlt');
  const linkField = readLinkField(block, 'imageLink');
  const targetField = readTextField(block, 'imageTarget');
  const styleField = readTextField(block, 'imageStyle');
  const positionField = readTextField(block, 'imagePosition');
  const captionField = readRichTextField(block, 'captionText');
  const captionAlignmentField = readTextField(block, 'captionAlignment');
  const resourceFields = (
    !styleField.value
      || !positionField.value
      || !captionField.text
      || !captionAlignmentField.value
  )
    ? await readAueResourceFields(getAueResourcePath(block), [
      'imageStyle',
      'imagePosition',
      'captionText',
      'captionAlignment',
    ])
    : {};

  const styleClass = normalizeOption(styleField.value || resourceFields.imageStyle, STYLE_VALUES);
  const positionClass = normalizeOption(
    positionField.value || resourceFields.imagePosition,
    POSITION_VALUES,
  );
  const captionAlignment = normalizeOption(
    captionAlignmentField.value || resourceFields.captionAlignment,
    CAPTION_ALIGNMENT_VALUES,
  );

  if (styleClass) block.classList.add(styleClass);
  if (positionClass) block.classList.add(positionClass);
  if (captionAlignment) block.classList.add(`caption-align-${captionAlignment}`);

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

  const figure = document.createElement('figure');
  figure.className = 'image-figure';

  const mediaWrapper = document.createElement('div');
  mediaWrapper.className = 'image-media';
  mediaWrapper.append(media);
  figure.append(mediaWrapper);

  if (hasCaptionContent(captionField, resourceFields.captionText)) {
    const caption = document.createElement('figcaption');
    caption.className = 'image-caption';
    appendCaptionContent(captionField, caption, resourceFields.captionText);
    if (caption.textContent.trim() || caption.children.length) figure.append(caption);
  }

  block.replaceChildren(figure);
}
