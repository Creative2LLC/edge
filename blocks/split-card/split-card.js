import { createOptimizedPicture } from '../../scripts/aem.js';

// Model field order:
// 0:image, 1:imageAlt, 2:heading, 3:subheading,
// 4:buttonText, 5:buttonLink, 6:buttonColor,
// 7:button2Text, 8:button2Link, 9:button2Color,
// 10:backgroundColor, 11:textColor, 12:contentAlign

function readField(row, name, colIndex) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source.textContent.trim();
  const cols = [...row.children];
  if (cols[colIndex]) return cols[colIndex].textContent.trim();
  return '';
}

function readLinkField(row, name, colIndex) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const a = source.tagName === 'A'
      ? source : source.querySelector('a');
    return a?.href || source.textContent.trim();
  }
  const cols = [...row.children];
  if (cols[colIndex]) {
    const a = cols[colIndex].querySelector('a');
    return a?.href || cols[colIndex].textContent.trim();
  }
  return '';
}

function getImage(row) {
  const source = row.querySelector('[data-aue-prop="image"]');
  const picture = source?.querySelector('picture')
    || row.querySelector('picture');
  if (!picture) return null;
  const img = picture.querySelector('img');
  if (!img) return picture;
  const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
  picture.replaceWith(optimized);
  return optimized;
}

export default function decorate(block) {
  // The block is a single-model block — all fields in one row
  const row = block.querySelector(':scope > div');
  if (!row) return;

  const picture = getImage(row);
  const imageAlt = readField(row, 'imageAlt', 1);
  const heading = readField(row, 'heading', 2);
  const subheading = readField(row, 'subheading', 3);
  const buttonText = readField(row, 'buttonText', 4);
  const buttonLink = readLinkField(row, 'buttonLink', 5);
  const buttonColor = readField(row, 'buttonColor', 6);
  const button2Text = readField(row, 'button2Text', 7);
  const button2Link = readLinkField(row, 'button2Link', 8);
  const button2Color = readField(row, 'button2Color', 9);
  const backgroundColor = readField(row, 'backgroundColor', 10);
  const textColor = readField(row, 'textColor', 11);
  const contentAlign = readField(row, 'contentAlign', 12) || 'left';

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
