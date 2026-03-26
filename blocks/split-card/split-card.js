import { createOptimizedPicture } from '../../scripts/aem.js';

// Model field order:
// 0:image, 1:imageAlt, 2:heading, 3:subheading,
// 4:buttonText, 5:buttonLink, 6:buttonColor,
// 7:button2Text, 8:button2Link, 9:button2Color,
// 10:backgroundColor, 11:textColor, 12:contentAlign

function getField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  if (rows[index]) return { source: null, value: rows[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  if (rows[index]) {
    const anchor = rows[index].querySelector('a');
    return { source: null, value: anchor?.href || rows[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getImage(block) {
  const source = block.querySelector('[data-aue-prop="image"]');
  const picture = source?.querySelector('picture')
    || block.querySelector('picture');
  if (!picture) return null;
  const img = picture.querySelector('img');
  if (!img) return picture;
  const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
  picture.replaceWith(optimized);
  return optimized;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const picture = getImage(block);

  const imageAltField = getField(block, rows, 'imageAlt', 1);
  const headingField = getField(block, rows, 'heading', 2);
  const subheadingField = getField(block, rows, 'subheading', 3);
  const buttonTextField = getField(block, rows, 'buttonText', 4);
  const buttonLinkField = getLinkField(block, rows, 'buttonLink', 5);
  const buttonColorField = getField(block, rows, 'buttonColor', 6);
  const button2TextField = getField(block, rows, 'button2Text', 7);
  const button2LinkField = getLinkField(block, rows, 'button2Link', 8);
  const button2ColorField = getField(block, rows, 'button2Color', 9);
  const backgroundColorField = getField(block, rows, 'backgroundColor', 10);
  const textColorField = getField(block, rows, 'textColor', 11);
  const contentAlignField = getField(block, rows, 'contentAlign', 12);

  const imageAlt = imageAltField.value;
  const heading = headingField.value;
  const subheading = subheadingField.value;
  const buttonText = buttonTextField.value;
  const buttonLink = buttonLinkField.value;
  const buttonColor = buttonColorField.value;
  const button2Text = button2TextField.value;
  const button2Link = button2LinkField.value;
  const button2Color = button2ColorField.value;
  const backgroundColor = backgroundColorField.value;
  const textColor = textColorField.value;
  const contentAlign = contentAlignField.value || 'left';

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
