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

export default function decorate(block) {
  const imageField = getField(block, 'image');
  const headingField = getField(block, 'heading');
  const logoField = getField(block, 'logo');
  const subheadingField = getField(block, 'subheading');

  /* background image */
  const bgWrap = document.createElement('div');
  bgWrap.className = 'footer-banner-bg';

  const picture = imageField.source?.querySelector('picture') || block.querySelector('picture');
  if (picture) {
    const img = picture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '1800' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      bgWrap.append(optimized);
    } else {
      bgWrap.append(picture);
    }
    if (imageField.source) imageField.source.remove();
  }

  /* color overlay (fades at bottom) */
  const overlay = document.createElement('div');
  overlay.className = 'footer-banner-overlay';

  /* content */
  const content = document.createElement('div');
  content.className = 'footer-banner-content';

  const heading = buildText('h2', 'footer-banner-heading', headingField);
  if (heading) content.append(heading);

  /* logo / small image */
  if (logoField.source) {
    const logoPicture = logoField.source.querySelector('picture');
    const logoImg = logoPicture?.querySelector('img') || logoField.source.querySelector('img');
    const logoSrc = logoImg?.src || logoField.source.textContent?.trim();
    if (logoSrc) {
      const logoWrap = document.createElement('div');
      logoWrap.className = 'footer-banner-logo';
      const optimizedLogo = createOptimizedPicture(logoSrc, logoImg?.alt || '', false, [{ width: '400' }]);
      moveInstrumentation(logoImg || logoField.source, optimizedLogo.querySelector('img') || optimizedLogo);
      logoWrap.append(optimizedLogo);
      moveInstrumentation(logoField.source, logoWrap);
      logoField.source.remove();
      content.append(logoWrap);
    } else {
      logoField.source.remove();
    }
  }

  const subheading = buildText('p', 'footer-banner-subheading', subheadingField);
  if (subheading) content.append(subheading);

  block.replaceChildren(bgWrap, overlay, content);
}
