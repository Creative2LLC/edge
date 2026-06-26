import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const VARIANT_VALUES = ['default', 'variant-2'];
const HREF_TEXT_RE = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|\.{1,2}\/|#)/i;

function textFrom(node) {
  return node?.textContent?.trim() || '';
}

function getRowCells(block) {
  return [...block.querySelectorAll(':scope > div')]
    .map((row) => (row.children.length > 1 ? row.children[1] : row.children[0] || row))
    .filter(Boolean);
}

function hasMedia(cell) {
  return Boolean(cell?.querySelector?.('picture, img'));
}

function isVariantCell(cell) {
  return VARIANT_VALUES.includes(textFrom(cell).toLowerCase());
}

function hasLinkCell(cell) {
  const anchor = cell?.tagName === 'A' ? cell : cell?.querySelector?.('a[href]');
  return Boolean(anchor?.getAttribute?.('href') || HREF_TEXT_RE.test(textFrom(cell)));
}

function getLiveFallbacks(block) {
  const rowCells = getRowCells(block);
  const textCells = rowCells.filter((cell) => textFrom(cell) && !hasMedia(cell));
  const variantCell = textCells.find(isVariantCell) || null;
  const linkCells = textCells.filter((cell) => !isVariantCell(cell) && hasLinkCell(cell));
  const contentCells = textCells.filter((cell) => (
    !isVariantCell(cell) && !hasLinkCell(cell)
  ));

  return {
    imageCell: rowCells.find(hasMedia) || null,
    headingCell: contentCells[0] || null,
    headingLargeCell: contentCells[1] || null,
    subheadingCell: contentCells[2] || null,
    btn1TextCell: contentCells[3] || null,
    btn2TextCell: contentCells[4] || null,
    btn1LinkCell: linkCells[0] || null,
    btn2LinkCell: linkCells[1] || null,
    variantCell,
  };
}

function buildRich(className, field) {
  if (!field?.source && !field?.html && !field?.text) return null;

  const el = document.createElement('div');
  el.className = className;

  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else if (field.html) {
    el.innerHTML = field.html;
  } else {
    el.textContent = field.text;
  }

  return el;
}

function buildButton(className, textField, linkField) {
  const label = textField?.value || textField?.text || textFrom(textField?.cell);
  if (!label) return null;

  const a = document.createElement('a');
  a.className = className;
  a.href = linkField?.value || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  if (textField.source) {
    moveInstrumentation(textField.source, a);
    a.textContent = label;
    textField.source.remove();
  } else {
    a.textContent = label;
  }

  if (linkField.source) linkField.source.remove();
  return a;
}

export default function decorate(block) {
  const fallback = getLiveFallbacks(block);
  const imageField = readImageField(block, 'image', { fallbackCell: fallback.imageCell });
  const imageAltField = readTextField(block, 'imageAlt');
  const headingField = readRichTextField(block, 'heading_line1', { fallbackCell: fallback.headingCell });
  const headingLargeField = readRichTextField(block, 'heading_line2', { fallbackCell: fallback.headingLargeCell });
  const headingSubtextField = readRichTextField(block, 'heading_subtext', { fallbackCell: fallback.subheadingCell });
  const btn1LinkField = readLinkField(block, 'button1', { fallbackCell: fallback.btn1LinkCell });
  const btn1TextField = readTextField(block, 'button1Text', { fallbackCell: fallback.btn1TextCell });
  const btn2LinkField = readLinkField(block, 'button2', { fallbackCell: fallback.btn2LinkCell });
  const btn2TextField = readTextField(block, 'button2Text', { fallbackCell: fallback.btn2TextCell });
  const variantField = readTextField(block, 'variant', { fallbackCell: fallback.variantCell });

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
