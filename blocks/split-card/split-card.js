import { createOptimizedPicture } from '../../scripts/aem.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source.textContent.trim();
  return '';
}

function getLinkField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return anchor?.href || source.textContent.trim();
  }
  return '';
}

function getImage(block) {
  const source = block.querySelector('[data-aue-prop="image"]');
  const picture = source?.closest('picture')
    || source?.querySelector('picture')
    || block.querySelector('picture');
  if (!picture) return null;
  const img = picture.querySelector('img');
  if (!img) return picture;
  const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
  picture.replaceWith(optimized);
  return optimized;
}

/**
 * Hex color values (e.g. #7BC581) are auto-linked by EDS into
 * <p class="button-container"><a class="button">#7BC581</a></p>.
 * These rows have no data-aue-prop. Collect them in document order
 * to map back to model field order.
 */
function collectColorValues(block) {
  const values = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.querySelector('[data-aue-prop]')) return;
    const anchor = row.querySelector('a');
    if (anchor) {
      values.push(anchor.textContent.trim());
    }
  });
  // Model order: buttonColor, button2Color, backgroundColor, textColor
  return {
    buttonColor: values[0] || '',
    button2Color: values[1] || '',
    backgroundColor: values[2] || '',
    textColor: values[3] || '',
  };
}

export default function decorate(block) {
  const picture = getImage(block);

  const heading = getField(block, 'heading');
  const subheading = getField(block, 'subheading');
  const buttonText = getField(block, 'buttonText');
  const buttonLink = getLinkField(block, 'buttonLink');
  const button2Text = getField(block, 'button2Text');
  const button2Link = getLinkField(block, 'button2Link');
  const imageAlt = getField(block, 'imageAlt');

  const colors = collectColorValues(block);
  const {
    buttonColor, button2Color, backgroundColor, textColor,
  } = colors;

  // contentAlign: last row with no link and no data-aue-prop
  const contentAlignField = getField(block, 'contentAlign');
  const contentAlign = contentAlignField || 'left';

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAlt) img.alt = imageAlt;
  }

  // Build DOM
  const card = document.createElement('div');
  card.className = 'split-card-inner';

  // Left: image
  const mediaSide = document.createElement('div');
  mediaSide.className = 'split-card-media';
  if (picture) mediaSide.append(picture);
  card.append(mediaSide);

  // Right: content
  const contentSide = document.createElement('div');
  contentSide.className = 'split-card-content';
  contentSide.style.textAlign = contentAlign;

  if (contentAlign === 'center') {
    contentSide.style.alignItems = 'center';
  } else if (contentAlign === 'right') {
    contentSide.style.alignItems = 'flex-end';
  }

  if (backgroundColor) {
    contentSide.style.setProperty('background-color', backgroundColor, 'important');
  }

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'split-card-heading';
    h2.textContent = heading;
    if (textColor) h2.style.setProperty('color', textColor, 'important');
    contentSide.append(h2);
  }

  if (subheading) {
    const p = document.createElement('p');
    p.className = 'split-card-subheading';
    p.textContent = subheading;
    if (textColor) p.style.setProperty('color', textColor, 'important');
    contentSide.append(p);
  }

  const hasBtn1 = buttonText && buttonLink;
  const hasBtn2 = button2Text && button2Link;

  if (hasBtn1 || hasBtn2) {
    const btnContainer = document.createElement('div');
    btnContainer.className = 'split-card-buttons';
    if (hasBtn1 && hasBtn2) {
      btnContainer.classList.add('split-card-buttons-duo');
    }

    if (hasBtn1) {
      const btn = document.createElement('a');
      btn.className = 'split-card-button';
      btn.href = buttonLink;
      btn.textContent = buttonText;
      if (buttonColor) {
        btn.style.setProperty('background-color', buttonColor, 'important');
      }
      btnContainer.append(btn);
    }

    if (hasBtn2) {
      const btn2 = document.createElement('a');
      btn2.className = 'split-card-button';
      btn2.href = button2Link;
      btn2.textContent = button2Text;
      if (button2Color) {
        btn2.style.setProperty('background-color', button2Color, 'important');
      }
      btnContainer.append(btn2);
    }

    contentSide.append(btnContainer);
  }

  card.append(contentSide);

  block.replaceChildren(card);
}
