import { createOptimizedPicture } from '../../scripts/aem.js';

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  subheading: ['subheading', 'sub heading'],
  buttonText: ['button text', 'buttontext', 'button label', 'button'],
  buttonLink: ['button link', 'button url', 'button href'],
  buttonColor: ['button color', 'buttoncolor', 'button background color'],
  button2Text: ['second button text', 'button2text', 'button 2 text'],
  button2Link: ['second button link', 'button2link', 'button 2 link'],
  button2Color: ['second button color', 'button2color', 'button 2 color'],
  backgroundColor: ['background color', 'backgroundcolor', 'bg color', 'content background color'],
  textColor: ['text color', 'textcolor', 'heading text color', 'heading / subheading text color'],
  contentAlign: ['content align', 'contentalign', 'alignment', 'text align', 'content alignment'],
  imageAlt: ['image alt', 'imagealt', 'alt text', 'image alt text'],
};

function collectLabeledFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(FIELD_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      map[name] = valueEl.textContent.trim();
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getField(block, labelMap, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const value = source.textContent.trim();
    source.remove();
    return value;
  }
  return labelMap[name] || '';
}

function getLinkField(block, labelMap, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    const value = anchor?.href || source.textContent.trim();
    source.remove();
    return value;
  }
  return labelMap[name] || '';
}

function getImage(block) {
  const source = block.querySelector('[data-aue-prop="image"]');
  const picture = source?.querySelector('picture') || block.querySelector('picture');
  if (!picture) return null;
  const img = picture.querySelector('img');
  if (!img) return picture;
  const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
  picture.replaceWith(optimized);
  return optimized;
}

export default function decorate(block) {
  const labelMap = collectLabeledFields(block);

  const picture = getImage(block);

  const heading = getField(block, labelMap, 'heading');
  const subheading = getField(block, labelMap, 'subheading');
  const buttonText = getField(block, labelMap, 'buttonText');
  const buttonLink = getLinkField(block, labelMap, 'buttonLink');
  const buttonColor = getField(block, labelMap, 'buttonColor');
  const button2Text = getField(block, labelMap, 'button2Text');
  const button2Link = getLinkField(block, labelMap, 'button2Link');
  const button2Color = getField(block, labelMap, 'button2Color');
  const backgroundColor = getField(block, labelMap, 'backgroundColor');
  const textColor = getField(block, labelMap, 'textColor');
  const contentAlign = getField(block, labelMap, 'contentAlign') || 'left';
  const imageAlt = getField(block, labelMap, 'imageAlt');

  // Scan any remaining rows for data-aue-prop values not yet extracted
  const remaining = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    row.querySelectorAll('[data-aue-prop]').forEach((el) => {
      const prop = el.getAttribute('data-aue-prop');
      if (prop && !remaining[prop]) {
        remaining[prop] = el.textContent.trim();
      }
    });
    [...row.children].forEach((col) => {
      const prop = col.getAttribute('data-aue-prop');
      if (prop && !remaining[prop]) {
        remaining[prop] = col.textContent.trim();
      }
    });
  });

  const finalButtonColor = buttonColor || remaining.buttonColor || '';
  const finalButton2Color = button2Color || remaining.button2Color || '';
  const finalBackgroundColor = backgroundColor || remaining.backgroundColor || '';
  const finalTextColor = textColor || remaining.textColor || '';
  const finalContentAlign = contentAlign !== 'left' ? contentAlign : (remaining.contentAlign || 'left');

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
  contentSide.style.textAlign = finalContentAlign;

  if (finalContentAlign === 'center') {
    contentSide.style.alignItems = 'center';
  } else if (finalContentAlign === 'right') {
    contentSide.style.alignItems = 'flex-end';
  }

  if (finalBackgroundColor) {
    contentSide.style.setProperty('background-color', finalBackgroundColor, 'important');
  }

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'split-card-heading';
    h2.textContent = heading;
    if (finalTextColor) h2.style.setProperty('color', finalTextColor, 'important');
    contentSide.append(h2);
  }

  if (subheading) {
    const p = document.createElement('p');
    p.className = 'split-card-subheading';
    p.textContent = subheading;
    if (finalTextColor) p.style.setProperty('color', finalTextColor, 'important');
    contentSide.append(p);
  }

  const hasBtn1 = buttonText && buttonLink;
  const hasBtn2 = button2Text && button2Link;

  if (hasBtn1 || hasBtn2) {
    const btnContainer = document.createElement('div');
    btnContainer.className = 'split-card-buttons';
    if (hasBtn1 && hasBtn2) btnContainer.classList.add('split-card-buttons-duo');

    if (hasBtn1) {
      const btn = document.createElement('a');
      btn.className = 'split-card-button';
      btn.href = buttonLink;
      btn.textContent = buttonText;
      if (finalButtonColor) {
        btn.style.setProperty('background-color', finalButtonColor, 'important');
      }
      btnContainer.append(btn);
    }

    if (hasBtn2) {
      const btn2 = document.createElement('a');
      btn2.className = 'split-card-button';
      btn2.href = button2Link;
      btn2.textContent = button2Text;
      if (finalButton2Color) {
        btn2.style.setProperty('background-color', finalButton2Color, 'important');
      }
      btnContainer.append(btn2);
    }

    contentSide.append(btnContainer);
  }

  card.append(contentSide);

  block.replaceChildren(card);
}
