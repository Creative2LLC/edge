import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

/* Only render when the field has a real tagged source (data-aue-prop /
   data-richtext-prop). Skipping the row-index fallback prevents content
   from a shifted DOM row (e.g. a populated button2Text) from leaking into
   an empty heading slot. */
function buildRich(className, field) {
  if (!field.source) return null;
  const el = document.createElement('div');
  el.className = className;
  moveInstrumentation(field.source, el);
  while (field.source.firstChild) el.append(field.source.firstChild);
  field.source.remove();
  return el;
}

function buildButton(className, textField, linkField) {
  if (!textField.source && !linkField.source) return null;
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
  const imageField = readImageField(block, 'image', 0);
  const imageAltField = readTextField(block, 'imageAlt', 1);
  const headingField = readRichTextField(block, 'heading_line1', 2);
  const headingLargeField = readRichTextField(block, 'heading_line2', 3);
  const headingSubtextField = readRichTextField(block, 'heading_subtext', 4);
  const btn1LinkField = readLinkField(block, 'button1', 5);
  const btn1TextField = readTextField(block, 'button1Text', 6);
  const btn2LinkField = readLinkField(block, 'button2', 7);
  const btn2TextField = readTextField(block, 'button2Text', 8);
  const variantField = readTextField(block, 'variant', 9);

  if (variantField.value.toLowerCase() === 'variant-2') {
    block.classList.add('hero-footer-variant-2');
  }
  if (variantField.source) variantField.source.remove();

  /* background image */
  const bgWrap = document.createElement('div');
  bgWrap.className = 'hero-footer-bg';

  const picture = imageField.picture || block.querySelector('picture');
  if (picture) {
    const img = picture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(
        img.src,
        imageAltField.value || img.alt || '',
        false,
        [{ width: '810' }],
      );
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

  const h1 = buildRich('hero-footer-heading-1', headingField);
  if (h1) content.append(h1);

  const h2 = buildRich('hero-footer-heading-2', headingLargeField);
  if (h2) content.append(h2);

  const sub = buildRich('hero-footer-subheading', headingSubtextField);
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
}
