import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readTextField,
} from '../../scripts/block-field-utils.js';

function buildText(tag, className, field) {
  if (!field.value && !field.source) return null;
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
  const imageField = readImageField(block, 'image', 0);
  const imageAltField = readTextField(block, 'imageAlt', 1);
  const headingField = readTextField(block, 'heading', 2);
  const logoField = readImageField(block, 'logo', 3);
  const logoAltField = readTextField(block, 'logoAlt', 4);
  const subheadingField = readTextField(block, 'subheading', 5);

  /* snapshot all pictures before any DOM changes */
  const allPictures = [...block.querySelectorAll('picture')];

  /* resolve background picture */
  const bgPicture = imageField.picture
    || allPictures[0]
    || null;

  /* resolve logo picture (exclude the one used for background) */
  const usedPictures = bgPicture ? [bgPicture] : [];
  const explicitLogoPicture = logoField.picture && !usedPictures.includes(logoField.picture)
    ? logoField.picture
    : null;
  const logoPic = explicitLogoPicture
    || allPictures.find((p) => !usedPictures.includes(p))
    || null;

  /* background image */
  const bgWrap = document.createElement('div');
  bgWrap.className = 'footer-banner-bg';

  if (bgPicture) {
    const img = bgPicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(
        img.src,
        imageAltField.value || img.alt || '',
        false,
        [{ width: '1800' }],
      );
      moveInstrumentation(img, optimized.querySelector('img'));
      bgWrap.append(optimized);
    } else {
      bgWrap.append(bgPicture);
    }
  }
  if (imageField.source) imageField.source.remove();

  /* color overlay (fades at bottom) */
  const overlay = document.createElement('div');
  overlay.className = 'footer-banner-overlay';

  /* content */
  const content = document.createElement('div');
  content.className = 'footer-banner-content';

  const heading = buildText('h2', 'footer-banner-heading', headingField);
  if (heading) content.append(heading);

  /* logo / small image */
  if (logoPic) {
    const logoWrap = document.createElement('div');
    logoWrap.className = 'footer-banner-logo';
    const logoImg = logoPic.querySelector('img');
    if (logoImg) {
      const optimizedLogo = createOptimizedPicture(
        logoImg.src,
        logoAltField.value || logoImg.alt || '',
        false,
        [{ width: '400' }],
      );
      moveInstrumentation(logoImg, optimizedLogo.querySelector('img') || optimizedLogo);
      logoWrap.append(optimizedLogo);
    } else {
      logoWrap.append(logoPic);
    }
    if (logoField.source) moveInstrumentation(logoField.source, logoWrap);
    content.append(logoWrap);
  }
  if (logoField.source) logoField.source.remove();

  const subheading = buildText('p', 'footer-banner-subheading', subheadingField);
  if (subheading) content.append(subheading);

  block.replaceChildren(bgWrap, overlay, content);
}
