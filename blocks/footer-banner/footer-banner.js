import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  return { source: null, value: '' };
}

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

function extractImage(source) {
  if (!source) return null;
  const picture = source.querySelector('picture');
  const img = picture?.querySelector('img') || source.querySelector('img');
  const src = img?.src || source.textContent?.trim();
  if (!src) return null;
  return { picture, img, src };
}

export default function decorate(block) {
  const imageField = getField(block, 'image');
  const headingField = getField(block, 'heading');
  const logoField = getField(block, 'logo');
  const subheadingField = getField(block, 'subheading');

  /* capture image refs before any DOM changes */
  const bgImage = extractImage(imageField.source);
  const logoImage = extractImage(logoField.source);

  /* background image */
  const bgWrap = document.createElement('div');
  bgWrap.className = 'footer-banner-bg';

  if (bgImage) {
    const optimized = createOptimizedPicture(bgImage.src, bgImage.img?.alt || '', false, [{ width: '1800' }]);
    if (bgImage.img) moveInstrumentation(bgImage.img, optimized.querySelector('img'));
    bgWrap.append(optimized);
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
  if (logoImage) {
    const logoWrap = document.createElement('div');
    logoWrap.className = 'footer-banner-logo';
    const optimizedLogo = createOptimizedPicture(logoImage.src, logoImage.img?.alt || '', false, [{ width: '400' }]);
    if (logoImage.img) moveInstrumentation(logoImage.img, optimizedLogo.querySelector('img') || optimizedLogo);
    logoWrap.append(optimizedLogo);
    if (logoField.source) moveInstrumentation(logoField.source, logoWrap);
    content.append(logoWrap);
  }
  if (logoField.source) logoField.source.remove();

  const subheading = buildText('p', 'footer-banner-subheading', subheadingField);
  if (subheading) content.append(subheading);

  block.replaceChildren(bgWrap, overlay, content);
}
