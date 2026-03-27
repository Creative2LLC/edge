import { moveInstrumentation } from '../../scripts/scripts.js';

function getFieldProp(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  return { source: null, value: '' };
}

function getImageProp(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const picture = source.closest('picture')
      || source.querySelector('picture');
    const img = source.tagName === 'IMG'
      ? source
      : source.querySelector('img');
    return { source, picture, img };
  }
  /* Fallback: grab any picture in the block */
  const picture = block.querySelector('picture');
  if (picture) {
    return { source: null, picture, img: picture.querySelector('img') };
  }
  return { source: null, picture: null, img: null };
}

export default function decorate(block) {
  /* --- Extract all fields before any DOM changes --- */
  const iconData = getImageProp(block, 'icon');
  const iconColorField = getFieldProp(block, 'iconColor');
  const headingField = getFieldProp(block, 'heading');
  const addressField = getFieldProp(block, 'address');

  const iconColor = iconColorField.value;
  const heading = headingField.value;
  const addressHTML = addressField.source
    ? addressField.source.innerHTML.trim()
    : '';

  /* --- Fallback: parse from rows if no data-aue-prop found --- */
  let fallbackImg = null;
  let fallbackPicture = null;
  let fallbackHeading = '';
  let fallbackAddress = '';
  if (!heading && !addressHTML) {
    [...block.querySelectorAll(':scope > div')].forEach((row) => {
      const cols = [...row.children];
      if (cols.length < 2) return;
      if (!fallbackImg) {
        fallbackImg = cols[0].querySelector('img');
        fallbackPicture = cols[0].querySelector('picture');
      }
      if (!fallbackHeading && cols[1]) {
        fallbackHeading = cols[1].textContent.trim();
      }
      if (!fallbackAddress && cols[2]) {
        fallbackAddress = cols[2].innerHTML.trim();
      }
    });
  }

  const finalImg = iconData.img || fallbackImg;
  const finalPicture = iconData.picture || fallbackPicture;
  const finalHeading = heading || fallbackHeading;
  const finalAddress = addressHTML || fallbackAddress;

  /* --- Build card --- */
  const card = document.createElement('div');
  card.className = 'mail-address-card';

  /* Left section: icon + heading */
  const left = document.createElement('div');
  left.className = 'mail-address-left';

  if (finalPicture || finalImg) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'mail-address-icon';
    const imgSrc = finalImg?.src || finalImg?.currentSrc;
    if (iconColor && imgSrc) {
      iconWrap.style.setProperty('background-color', iconColor, 'important');
      iconWrap.style.setProperty('-webkit-mask-image', `url('${imgSrc}')`, 'important');
      iconWrap.style.setProperty('mask-image', `url('${imgSrc}')`, 'important');
      iconWrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
      iconWrap.style.setProperty('mask-size', 'contain', 'important');
      iconWrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
      iconWrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
    } else if (finalPicture) {
      iconWrap.append(finalPicture);
    } else if (finalImg) {
      iconWrap.append(finalImg);
    }
    if (iconData.source) moveInstrumentation(iconData.source, iconWrap);
    left.append(iconWrap);
  }

  if (finalHeading) {
    const h2 = document.createElement('h2');
    h2.className = 'mail-address-heading';
    h2.textContent = finalHeading;
    left.append(h2);
  }

  card.append(left);

  /* Right section: address */
  const right = document.createElement('div');
  right.className = 'mail-address-right';

  if (finalAddress) {
    const addr = document.createElement('div');
    addr.className = 'mail-address-content';
    addr.innerHTML = finalAddress;
    if (addressField.source) moveInstrumentation(addressField.source, addr);
    right.append(addr);
  }

  card.append(right);

  block.replaceChildren(card);
}
