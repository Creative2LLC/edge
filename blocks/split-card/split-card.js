import { createOptimizedPicture } from '../../scripts/aem.js';

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return { source: null, value: anchor?.href || cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getImageField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const picture = source.querySelector('picture');
    const img = source.querySelector('img');
    return { source, picture, img };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const picture = cols[index].querySelector('picture');
    const img = cols[index].querySelector('img');
    return { source: null, picture, img };
  }
  return { source: null, picture: null, img: null };
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  if (!rows.length) return;
  const row = rows[0];

  // Field index mapping:
  // 0: image, 1: imageAlt, 2: heading, 3: subheading,
  // 4: buttonText, 5: buttonLink, 6: buttonColor,
  // 7: button2Text, 8: button2Link, 9: button2Color,
  // 10: backgroundColor, 11: textColor, 12: contentAlign
  const imageField = getImageField(row, 'image', 0);
  const imageAlt = getField(row, 'imageAlt', 1).value;
  const heading = getField(row, 'heading', 2).value;
  const subheading = getField(row, 'subheading', 3).value;
  const buttonText = getField(row, 'buttonText', 4).value;
  const buttonLink = getLinkField(row, 'buttonLink', 5).value;
  const buttonColor = getField(row, 'buttonColor', 6).value;
  const button2Text = getField(row, 'button2Text', 7).value;
  const button2Link = getLinkField(row, 'button2Link', 8).value;
  const button2Color = getField(row, 'button2Color', 9).value;
  const backgroundColor = getField(row, 'backgroundColor', 10).value;
  const textColor = getField(row, 'textColor', 11).value;
  const contentAlign = getField(row, 'contentAlign', 12).value || 'left';

  // Optimized picture
  let picture = imageField.picture || null;
  if (picture) {
    const img = picture.querySelector('img');
    if (img) {
      if (imageAlt) img.alt = imageAlt;
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
      picture.replaceWith(optimized);
      picture = optimized;
    }
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
    if (textColor) h2.style.color = textColor;
    contentSide.append(h2);
  }

  if (subheading) {
    const p = document.createElement('p');
    p.className = 'split-card-subheading';
    p.textContent = subheading;
    if (textColor) p.style.color = textColor;
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
