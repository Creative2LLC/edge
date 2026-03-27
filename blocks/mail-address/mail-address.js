import { moveInstrumentation } from '../../scripts/scripts.js';

export default function decorate(block) {
  /* --- Extract block-level fields and remove their rows --- */
  const iconProp = block.querySelector('[data-aue-prop="icon"]');
  let iconPicture = null;
  let iconImg = null;
  if (iconProp) {
    iconPicture = iconProp.querySelector('picture');
    iconImg = iconProp.querySelector('img');
    iconProp.closest(':scope > div')?.remove();
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

  if (iconPicture || iconImg) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'mail-address-icon';
    if (iconPicture) {
      iconWrap.append(iconPicture);
    } else if (iconImg) {
      iconWrap.append(iconImg);
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
