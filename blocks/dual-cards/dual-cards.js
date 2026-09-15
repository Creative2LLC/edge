import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField, readLinkField, readTextField, setItemLabel,
} from '../../scripts/block-field-utils.js';
import {
  applyButtonStyle,
  readAppendedStyles,
  takeAppendedStyleCells,
} from '../../scripts/button-utils.js';

function getField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function getLinkField(row, name, index) {
  return readLinkField(row, name, { fallbackCell: row.children[index] });
}

function getImageField(row, name, index) {
  const field = readImageField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, img: field.img };
}

function buildIcon(iconField, iconColor) {
  if (!iconField.img) return null;

  const color = (iconColor || '').trim();
  const normalized = color.toLowerCase();
  const isWhite = normalized === '#ffffff' || normalized === '#fff' || normalized === 'white';

  if (!color) {
    const img = iconField.img.cloneNode(true);
    img.className = 'dual-cards-icon';
    if (iconField.source) moveInstrumentation(iconField.source, img);
    return img;
  }

  if (isWhite) {
    const img = iconField.img.cloneNode(true);
    img.className = 'dual-cards-icon';
    img.style.setProperty('filter', 'brightness(0) invert(1)', 'important');
    if (iconField.source) moveInstrumentation(iconField.source, img);
    return img;
  }

  const wrap = document.createElement('div');
  wrap.className = 'dual-cards-icon dual-cards-icon-masked';
  wrap.style.setProperty('background-color', color, 'important');
  wrap.style.setProperty('-webkit-mask-image', `url(${iconField.img.src})`, 'important');
  wrap.style.setProperty('mask-image', `url(${iconField.img.src})`, 'important');
  wrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
  wrap.style.setProperty('mask-size', 'contain', 'important');
  wrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('-webkit-mask-position', 'left center', 'important');
  wrap.style.setProperty('mask-position', 'left center', 'important');
  if (iconField.source) moveInstrumentation(iconField.source, wrap);
  return wrap;
}

function buildCard(row) {
  const iconField = getImageField(row, 'icon', 0);
  const iconColorField = getField(row, 'iconColor', 1);
  const titleField = getField(row, 'title', 2);
  const buttonTextField = getField(row, 'buttonText', 3);
  const buttonLinkField = getLinkField(row, 'buttonLink', 4);

  const card = document.createElement('div');
  card.className = 'dual-cards-card';
  moveInstrumentation(row, card);
  // Label the item in the Universal Editor content tree by its own title so authors
  // can tell cards apart instead of seeing the generic component name.
  setItemLabel(card, [titleField.value]);

  const icon = buildIcon(iconField, iconColorField.value);
  if (icon) card.append(icon);

  if (titleField.value || titleField.source) {
    const h3 = document.createElement('h3');
    h3.className = 'dual-cards-title';
    if (titleField.source) {
      moveInstrumentation(titleField.source, h3);
      while (titleField.source.firstChild) h3.append(titleField.source.firstChild);
    } else {
      h3.textContent = titleField.value;
    }
    card.append(h3);
  }

  const btnLabel = buttonTextField.value;
  const btnHref = buttonLinkField.value;
  // A button with nowhere to go is not published. In the editor it still shows,
  // disabled, so the author can see the link is missing.
  const inEditor = Boolean(document.querySelector('[data-aue-resource]'));
  if (btnHref || (btnLabel && inEditor)) {
    const link = document.createElement(btnHref ? 'a' : 'span');
    link.className = 'dual-cards-link';
    link.textContent = btnLabel || 'Learn More';
    if (btnHref) {
      link.href = btnHref;
    } else {
      link.setAttribute('aria-disabled', 'true');
      link.title = 'Add a link to publish this button';
    }
    // The look comes from the button standard: Text link unless a Button Style was picked.
    const [buttonStyle] = readAppendedStyles(row, ['buttonStyle'], [...row.children]);
    applyButtonStyle(link, buttonStyle || 'text-link');
    if (buttonTextField.source) moveInstrumentation(buttonTextField.source, link);
    if (buttonLinkField.source && buttonLinkField.source !== buttonTextField.source) {
      moveInstrumentation(buttonLinkField.source, link);
    }
    card.append(link);
  }

  return card;
}

export default function decorate(block) {
  // Appended style dropdowns come out of the published markup first; see button-utils.
  takeAppendedStyleCells(block);
  const rows = [...block.querySelectorAll(':scope > div')];

  const grid = document.createElement('div');
  grid.className = 'dual-cards-grid';

  rows.forEach((row) => {
    grid.append(buildCard(row));
  });

  block.replaceChildren(grid);
}
