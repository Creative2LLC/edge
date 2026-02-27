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

function findPicture(source, block, exclude) {
  if (!source) return null;
  /* check inside the data-aue-prop element */
  let picture = source.querySelector('picture');
  if (picture && !exclude.includes(picture)) return picture;
  /* check parent row (EDS puts each field in its own row <div>) */
  let parent = source.parentElement;
  while (parent && parent !== block) {
    picture = parent.querySelector('picture');
    if (picture && !exclude.includes(picture)) return picture;
    parent = parent.parentElement;
  }
  return null;
}

export default function decorate(block) {
  const imageField = getField(block, 'image');
  const headingField = getField(block, 'heading');
  const logoField = getField(block, 'logo');
  const subheadingField = getField(block, 'subheading');

  /* snapshot all pictures before any DOM changes */
  const allPictures = [...block.querySelectorAll('picture')];

  /* resolve background picture */
  const bgPicture = findPicture(imageField.source, block, [])
    || allPictures[0]
    || null;

  /* resolve logo picture (exclude the one used for background) */
  const usedPictures = bgPicture ? [bgPicture] : [];
  const logoPic = findPicture(logoField.source, block, usedPictures)
    || allPictures.find((p) => !usedPictures.includes(p))
    || null;

  /* background image */
  const bgWrap = document.createElement('div');
  bgWrap.className = 'footer-banner-bg';

  if (bgPicture) {
    const img = bgPicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '1800' }]);
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
      const optimizedLogo = createOptimizedPicture(logoImg.src, logoImg.alt || '', false, [{ width: '400' }]);
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
