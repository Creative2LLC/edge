import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return { source: null, value: '' };
  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  const href = anchor?.href || source.textContent.trim();
  return { source, value: href };
}

function observeReveal(block) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    block.classList.add('is-visible');
    observer.disconnect();
  }, { threshold: 0.18 });

  observer.observe(block);
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

function buildButton(className, textField, linkField) {
  if (!linkField.value && !textField.value) return null;
  const a = document.createElement('a');
  a.className = className;
  a.href = linkField.value || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (textField.source) {
    moveInstrumentation(textField.source, a);
    a.textContent = textField.value;
    textField.source.remove();
  } else {
    a.textContent = textField.value;
  }
  if (linkField.source) linkField.source.remove();
  return a;
}

export default function decorate(block) {
  const imageField = getField(block, 'image');
  const headingField = getField(block, 'heading_line1');
  const headingLargeField = getField(block, 'heading_line2');
  const headingSubtextField = getField(block, 'heading_subtext');
  const btn1TextField = getField(block, 'button1Text');
  const btn1LinkField = getLinkField(block, 'button1');
  const btn2TextField = getField(block, 'button2Text');
  const btn2LinkField = getLinkField(block, 'button2');

  /* background image */
  const bgWrap = document.createElement('div');
  bgWrap.className = 'hero-footer-bg';

  const picture = imageField.source?.querySelector('picture') || block.querySelector('picture');
  if (picture) {
    const img = picture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '810' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      bgWrap.append(optimized);
    } else {
      bgWrap.append(picture);
    }
    if (imageField.source) imageField.source.remove();
  }

  /* content overlay */
  const content = document.createElement('div');
  content.className = 'hero-footer-content';

  const h1 = buildText('h2', 'hero-footer-heading-1', headingField);
  if (h1) content.append(h1);

  const h2 = buildText('h2', 'hero-footer-heading-2', headingLargeField);
  if (h2) content.append(h2);

  const sub = buildText('p', 'hero-footer-subheading', headingSubtextField);
  if (sub) content.append(sub);

  /* buttons */
  const btnWrap = document.createElement('div');
  btnWrap.className = 'hero-footer-buttons';

  const btn1 = buildButton('hero-footer-btn hero-footer-btn-primary', btn1TextField, btn1LinkField);
  if (btn1) btnWrap.append(btn1);

  const btn2 = buildButton('hero-footer-btn hero-footer-btn-secondary', btn2TextField, btn2LinkField);
  if (btn2) btnWrap.append(btn2);

  if (btnWrap.children.length) content.append(btnWrap);

  block.replaceChildren(bgWrap, content);
  observeReveal(block);
}
