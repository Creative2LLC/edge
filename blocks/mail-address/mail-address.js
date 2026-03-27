import { moveInstrumentation } from '../../scripts/scripts.js';

export default function decorate(block) {
  /* --- Extract block-level fields and remove their rows --- */

  /* Icon: reference fields render as <picture> at block level */
  const iconProp = block.querySelector('[data-aue-prop="icon"]');
  let picture = null;
  let iconImg = null;
  if (iconProp) {
    picture = iconProp.closest('picture')
      || iconProp.querySelector('picture');
    if (picture) {
      iconImg = picture.querySelector('img');
    } else {
      iconImg = iconProp.tagName === 'IMG'
        ? iconProp
        : iconProp.querySelector('img');
    }
    iconProp.closest(':scope > div')?.remove();
  }
  /* Fallback: grab any picture left in the block */
  if (!picture && !iconImg) {
    picture = block.querySelector('picture');
    if (picture) {
      iconImg = picture.querySelector('img');
      picture.closest(':scope > div')?.remove();
    }
  }

  const iconColorProp = block.querySelector('[data-aue-prop="iconColor"]');
  let iconColor = '';
  if (iconColorProp) {
    iconColor = iconColorProp.textContent.trim();
    iconColorProp.closest(':scope > div')?.remove();
  }

  const headingProp = block.querySelector('[data-aue-prop="heading"]');
  let heading = '';
  if (headingProp) {
    heading = headingProp.textContent.trim();
    headingProp.closest(':scope > div')?.remove();
  }

  const addressProp = block.querySelector('[data-aue-prop="address"]');
  let addressHTML = '';
  let addressSource = null;
  if (addressProp) {
    addressHTML = addressProp.innerHTML.trim();
    addressSource = addressProp;
    addressProp.closest(':scope > div')?.remove();
  }

  /* --- Fallback: parse from columns if no data-aue-prop --- */
  if (!heading && !addressHTML) {
    const rows = [...block.querySelectorAll(':scope > div')];
    rows.forEach((row) => {
      const cols = [...row.children];
      if (cols.length < 2) return;
      if (!iconImg) {
        const img = cols[0].querySelector('img');
        if (img) {
          picture = cols[0].querySelector('picture');
          iconImg = img;
        }
      }
      if (!heading && cols[1]) {
        heading = cols[1].textContent.trim();
      }
      if (!addressHTML && cols[2]) {
        addressHTML = cols[2].innerHTML.trim();
      }
    });
  }

  /* --- Build card --- */
  const card = document.createElement('div');
  card.className = 'mail-address-card';

  /* Left section: icon + heading */
  const left = document.createElement('div');
  left.className = 'mail-address-left';

  if (picture || iconImg) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'mail-address-icon';
    const imgSrc = iconImg?.src || iconImg?.currentSrc;
    if (iconColor && imgSrc) {
      iconWrap.style.setProperty('background-color', iconColor, 'important');
      iconWrap.style.setProperty('-webkit-mask-image', `url('${imgSrc}')`, 'important');
      iconWrap.style.setProperty('mask-image', `url('${imgSrc}')`, 'important');
      iconWrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
      iconWrap.style.setProperty('mask-size', 'contain', 'important');
      iconWrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
      iconWrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
    } else if (picture) {
      iconWrap.append(picture);
    } else if (iconImg) {
      iconWrap.append(iconImg);
    }
    if (iconProp) moveInstrumentation(iconProp, iconWrap);
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

  if (addressHTML) {
    const addr = document.createElement('div');
    addr.className = 'mail-address-content';
    addr.innerHTML = addressHTML;
    if (addressSource) moveInstrumentation(addressSource, addr);
    right.append(addr);
  }

  card.append(right);

  block.replaceChildren(card);
}
