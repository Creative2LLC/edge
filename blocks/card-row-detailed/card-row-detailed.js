import { moveInstrumentation } from '../../scripts/scripts.js';

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
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return { source, img };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const img = cols[index].querySelector('img');
    return { source: null, img: img || null };
  }
  return { source: null, img: null };
}

function getRichTextField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.innerHTML.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].innerHTML.trim() };
  return { source: null, value: '' };
}

function buildButton(label, href, color, textColor, sourceEl) {
  const btn = document.createElement(href ? 'a' : 'button');
  btn.className = 'card-row-detailed-button';
  btn.textContent = label;
  if (href) btn.href = href;
  if (!href) btn.type = 'button';
  if (sourceEl) moveInstrumentation(sourceEl, btn);
  if (color) {
    btn.style.setProperty('background-color', color, 'important');
    btn.style.setProperty('border', `2px solid ${color}`, 'important');
  }
  if (textColor) btn.style.setProperty('color', textColor, 'important');
  return btn;
}

function buildCard(data) {
  const card = document.createElement('div');
  card.className = 'card-row-detailed-card';
  if (data.row) moveInstrumentation(data.row, card);

  const content = document.createElement('div');
  content.className = 'card-row-detailed-content';

  // Icon (optional, 96x96, left aligned, colorable via CSS mask)
  if (data.iconField.img) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'card-row-detailed-icon';
    const { iconColor } = data;
    if (iconColor) {
      const iconSrc = data.iconField.img.src;
      iconWrap.style.maskImage = `url(${iconSrc})`;
      iconWrap.style.webkitMaskImage = `url(${iconSrc})`;
      iconWrap.style.maskSize = 'contain';
      iconWrap.style.webkitMaskSize = 'contain';
      iconWrap.style.maskRepeat = 'no-repeat';
      iconWrap.style.webkitMaskRepeat = 'no-repeat';
      iconWrap.style.backgroundColor = iconColor;
    } else {
      const img = data.iconField.img.cloneNode(true);
      iconWrap.append(img);
    }
    if (data.iconField.source) moveInstrumentation(data.iconField.source, iconWrap);
    content.append(iconWrap);
  }

  // Heading (32px, 700, #404041, left aligned)
  if (data.headingField.value || data.headingField.source) {
    const h3 = document.createElement('h3');
    h3.className = 'card-row-detailed-heading';
    if (data.headingField.source) {
      moveInstrumentation(data.headingField.source, h3);
      while (data.headingField.source.firstChild) h3.append(data.headingField.source.firstChild);
    } else {
      h3.textContent = data.headingField.value;
    }
    content.append(h3);
  }

  // Subheading (17px, 500, #404041, left aligned)
  if (data.subheadingField.value || data.subheadingField.source) {
    const sub = document.createElement('p');
    sub.className = 'card-row-detailed-subheading';
    if (data.subheadingField.source) {
      moveInstrumentation(data.subheadingField.source, sub);
      while (data.subheadingField.source.firstChild) {
        sub.append(data.subheadingField.source.firstChild);
      }
    } else {
      sub.textContent = data.subheadingField.value;
    }
    content.append(sub);
  }

  // Bullet list (richtext, 17px, 400, #404041)
  if (data.bulletListField.value) {
    const listWrap = document.createElement('div');
    listWrap.className = 'card-row-detailed-list';
    if (data.bulletListField.source) {
      moveInstrumentation(data.bulletListField.source, listWrap);
      while (data.bulletListField.source.firstChild) {
        listWrap.append(data.bulletListField.source.firstChild);
      }
    } else {
      listWrap.innerHTML = data.bulletListField.value;
    }
    content.append(listWrap);
  }

  // Primary button
  const btnLabel = data.buttonTextField.value;
  const btnHref = data.buttonLinkField.value;
  if (btnLabel) {
    const btn = buildButton(
      btnLabel,
      btnHref,
      data.buttonColor,
      data.buttonTextColor,
      data.buttonTextField.source,
    );
    content.append(btn);
  }

  // Additional text (optional, same style as subheading)
  if (data.additionalTextField.value || data.additionalTextField.source) {
    const addText = document.createElement('p');
    addText.className = 'card-row-detailed-additional-text';
    if (data.additionalTextField.source) {
      moveInstrumentation(data.additionalTextField.source, addText);
      while (data.additionalTextField.source.firstChild) {
        addText.append(data.additionalTextField.source.firstChild);
      }
    } else {
      addText.textContent = data.additionalTextField.value;
    }
    content.append(addText);
  }

  // Secondary button (optional)
  const btn2Label = data.button2TextField.value;
  const btn2Href = data.button2LinkField.value;
  if (btn2Label) {
    const btn2 = buildButton(
      btn2Label,
      btn2Href,
      data.button2Color,
      data.button2TextColor,
      data.button2TextField.source,
    );
    content.append(btn2);
  }

  card.append(content);
  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const columnsEl = block.querySelector('[data-aue-prop="columns"]');
  const columns = parseInt(columnsEl?.textContent.trim(), 10) || 3;

  const cards = [];
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;

    const iconField = getImageField(row, 'icon', 0);
    const iconColorField = getField(row, 'iconColor', 1);
    const headingField = getField(row, 'heading', 2);
    const subheadingField = getField(row, 'subheading', 3);
    const bulletListField = getRichTextField(row, 'bulletList', 4);
    const buttonTextField = getField(row, 'buttonText', 5);
    const buttonLinkField = getLinkField(row, 'buttonLink', 6);
    const buttonColorField = getField(row, 'buttonColor', 7);
    const buttonTextColorField = getField(row, 'buttonTextColor', 8);
    const additionalTextField = getField(row, 'additionalText', 9);
    const button2TextField = getField(row, 'button2Text', 10);
    const button2LinkField = getLinkField(row, 'button2Link', 11);
    const button2ColorField = getField(row, 'button2Color', 12);
    const button2TextColorField = getField(row, 'button2TextColor', 13);

    cards.push({
      iconField,
      iconColor: iconColorField.value,
      headingField,
      subheadingField,
      bulletListField,
      buttonTextField,
      buttonLinkField,
      buttonColor: buttonColorField.value,
      buttonTextColor: buttonTextColorField.value,
      additionalTextField,
      button2TextField,
      button2LinkField,
      button2Color: button2ColorField.value,
      button2TextColor: button2TextColorField.value,
      row,
    });
  });

  const grid = document.createElement('div');
  grid.className = 'card-row-detailed-grid';
  grid.style.setProperty('--grid-columns', columns);

  cards.forEach((data) => {
    const card = buildCard(data);
    grid.appendChild(card);
  });

  block.replaceChildren(grid);
}
