import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getBlockRows,
  readImageField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

function getField(block, rows, name, index) {
  return readTextField(block, name, { fallbackCell: rows[index] });
}

function getImageField(block, rows, name, index) {
  const field = readImageField(block, name, { fallbackCell: rows[index] });
  return { source: field.source, picture: field.picture, img: field.img };
}

function getRichField(block, rows, name, index) {
  const field = readRichTextField(block, name, { fallbackCell: rows[index] });
  return { source: field.source, html: field.html };
}

export default function decorate(block) {
  const rows = getBlockRows(block);

  /* Fields match model order: icon=0, iconColor=1, heading=2, address=3 */
  const iconField = getImageField(block, rows, 'icon', 0);
  const iconColorField = getField(block, rows, 'iconColor', 1);
  const headingField = getField(block, rows, 'heading', 2);
  const addressField = getRichField(block, rows, 'address', 3);

  const iconColor = iconColorField.value;
  const heading = headingField.value;

  /* --- Build card --- */
  const card = document.createElement('div');
  card.className = 'mail-address-card';

  /* Left section: icon + heading */
  const left = document.createElement('div');
  left.className = 'mail-address-left';

  if (iconField.img || iconField.picture) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'mail-address-icon';
    const imgSrc = iconField.img?.src || iconField.img?.currentSrc;

    if (iconColor && imgSrc) {
      iconWrap.style.setProperty('background-color', iconColor, 'important');
      iconWrap.style.setProperty('-webkit-mask-image', `url('${imgSrc}')`, 'important');
      iconWrap.style.setProperty('mask-image', `url('${imgSrc}')`, 'important');
      iconWrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
      iconWrap.style.setProperty('mask-size', 'contain', 'important');
      iconWrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
      iconWrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
    } else if (iconField.picture) {
      iconWrap.append(iconField.picture);
    } else if (iconField.img) {
      const img = iconField.img.cloneNode(true);
      iconWrap.append(img);
    }

    if (iconField.source) moveInstrumentation(iconField.source, iconWrap);
    left.append(iconWrap);
  }

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'mail-address-heading';
    h2.textContent = heading;
    left.append(h2);
  }

  card.append(left);

  /* Right section: address */
  const right = document.createElement('div');
  right.className = 'mail-address-right';

  if (addressField.html) {
    const addr = document.createElement('div');
    addr.className = 'mail-address-content';
    addr.innerHTML = addressField.html;
    if (addressField.source) moveInstrumentation(addressField.source, addr);
    right.append(addr);
  }

  card.append(right);

  block.replaceChildren(card);
}
