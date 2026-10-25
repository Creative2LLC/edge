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
const TARGET_VALUES = ['_self', '_blank', '_parent', '_top'];

/**
 * A published page carries no field names, only one row per field. Every setting here
 * has its own set of values (align-center, full-width, _blank, center), so each row is
 * recognised by what it holds rather than where it sits; empty rows dropped by AEM
 * cannot shift the rest. Anything else with words in it is the caption.
 */
function readPublishedRows(block) {
  const found = {};
  [...block.children].forEach((row) => {
    const cell = row.firstElementChild || row;
    if (cell.querySelector('picture, img')) return;
    const value = (cell.textContent || '').trim();
    const option = value.toLowerCase();
    if (!value) return;
    if (!found.position && POSITION_VALUES.includes(option)) found.position = option;
    else if (!found.style && STYLE_VALUES.includes(option)) found.style = option;
    else if (!found.target && TARGET_VALUES.includes(option)) found.target = option;
    else if (!found.captionAlignment && CAPTION_ALIGNMENT_VALUES.includes(option)) {
      found.captionAlignment = option;
    } else if (!found.href && cell.querySelector('a') && !cell.querySelector('p > :not(a)')
      && cell.querySelectorAll('a').length === 1 && cell.textContent.trim() === cell.querySelector('a').textContent.trim()) {
      found.href = cell.querySelector('a').getAttribute('href');
    } else if (!found.captionCell) {
      found.captionCell = cell;
    }
  });
  return found;
}

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
  const published = readPublishedRows(block);
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

  const styleClass = normalizeOption(
    styleField.value || published.style || resourceFields.imageStyle,
    STYLE_VALUES,
  );
  const positionClass = normalizeOption(
    positionField.value || published.position || resourceFields.imagePosition,
    POSITION_VALUES,
  );
  const captionAlignment = normalizeOption(
    captionAlignmentField.value || published.captionAlignment || resourceFields.captionAlignment,
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
  const href = linkField.value || published.href;
  if (href) {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = targetField.value || published.target || '_self';
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

  // On a published page the caption arrives as an unnamed row (see readPublishedRows).
  const captionSource = hasCaptionContent(captionField, resourceFields.captionText)
    || !published.captionCell
    ? captionField
    : { source: published.captionCell };
  if (hasCaptionContent(captionSource, resourceFields.captionText)) {
    const caption = document.createElement('figcaption');
    caption.className = 'image-caption';
    appendCaptionContent(captionSource, caption, resourceFields.captionText);
    if (caption.textContent.trim() || caption.children.length) figure.append(caption);
  }

  block.replaceChildren(figure);
}
