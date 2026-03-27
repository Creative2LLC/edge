import { moveInstrumentation } from '../../scripts/scripts.js';

export default function decorate(block) {
  /* --- Extract block-level fields and remove their rows --- */
  const iconProp = block.querySelector('[data-aue-prop="icon"]');
  let iconPicture = null;
  let iconImg = null;
  let iconSrc = '';
  if (iconProp) {
    iconPicture = iconProp.querySelector('picture');
    iconImg = iconProp.querySelector('img');
    if (!iconImg) {
      const src = iconProp.textContent.trim();
      if (src && (src.startsWith('/') || src.startsWith('http'))) {
        iconSrc = src;
      }
    }
    iconProp.closest(':scope > div')?.remove();
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
          iconPicture = cols[0].querySelector('picture');
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

  const resolvedSrc = iconImg?.src || iconSrc;
  if (iconPicture || iconImg || resolvedSrc) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'mail-address-icon';
    if (iconColor && resolvedSrc) {
      iconWrap.style.maskImage = `url(${resolvedSrc})`;
      iconWrap.style.webkitMaskImage = `url(${resolvedSrc})`;
      iconWrap.style.maskSize = 'contain';
      iconWrap.style.webkitMaskSize = 'contain';
      iconWrap.style.maskRepeat = 'no-repeat';
      iconWrap.style.webkitMaskRepeat = 'no-repeat';
      iconWrap.style.backgroundColor = iconColor;
    } else if (iconPicture) {
      iconWrap.append(iconPicture);
    } else if (iconImg) {
      iconWrap.append(iconImg);
    } else if (resolvedSrc) {
      const img = document.createElement('img');
      img.src = resolvedSrc;
      img.alt = '';
      img.loading = 'lazy';
      iconWrap.append(img);
    }
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
