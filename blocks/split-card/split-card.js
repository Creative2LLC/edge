import { createOptimizedPicture } from '../../scripts/aem.js';

function readField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source.textContent.trim();
  return '';
}

function readLinkField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const a = source.tagName === 'A'
      ? source : source.querySelector('a');
    return a?.href || source.textContent.trim();
  }
  return '';
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
  const picture = getImage(block);
  const imageAlt = readField(block, 'imageAlt');
  const heading = readField(block, 'heading');
  const subheading = readField(block, 'subheading');
  const buttonText = readField(block, 'buttonText');
  const buttonLink = readLinkField(block, 'buttonLink');
  const buttonColor = readField(block, 'buttonColor');
  const button2Text = readField(block, 'button2Text');
  const button2Link = readLinkField(block, 'button2Link');
  const button2Color = readField(block, 'button2Color');
  const backgroundColor = readField(block, 'backgroundColor');
  const textColor = readField(block, 'textColor');
  const contentAlign = readField(block, 'contentAlign') || 'left';

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
    contentSide.style.backgroundColor = backgroundColor;
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
        btn.style.backgroundColor = buttonColor;
      }
      btnContainer.append(btn);
    }

    if (hasBtn2) {
      const btn2 = document.createElement('a');
      btn2.className = 'split-card-button';
      btn2.href = button2Link;
      btn2.textContent = button2Text;
      if (button2Color) {
        btn2.style.backgroundColor = button2Color;
      }
      btnContainer.append(btn2);
    }

    contentSide.append(btnContainer);
  }

  card.append(contentSide);

  block.replaceChildren(card);
}
