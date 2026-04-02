import { moveInstrumentation } from '../../scripts/scripts.js';

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

function buildTextElement(tag, className, field) {
  if (!field?.value && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else {
    el.textContent = field.value;
  }
  return el;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const titleField = getField(block, rows, 'title', 0);
  const subtitleField = getField(block, rows, 'subtitle', 1);
  const gradientLeftField = getField(block, rows, 'gradientLeft', 2);
  const gradientRightField = getField(block, rows, 'gradientRight', 3);
  const buttonTextField = getField(block, rows, 'buttonText', 4);
  const buttonLinkField = getLinkField(block, rows, 'buttonLink', 5);
  const buttonColorField = getField(block, rows, 'buttonColor', 6);
  const buttonTextColorField = getField(block, rows, 'buttonTextColor', 7);
  const buttonSubtextSource = block.querySelector('[data-aue-prop="buttonSubtext"]');
  const buttonSubtextField = {
    source: buttonSubtextSource,
    value: buttonSubtextSource?.textContent.trim() || '',
  };
  const button2TextField = getField(block, rows, 'button2Text', 8);
  const button2LinkField = getLinkField(block, rows, 'button2Link', 9);
  const button2ColorField = getField(block, rows, 'button2Color', 10);
  const belowButtonTextField = getField(block, rows, 'belowButtonText', 11);

  // Apply gradient background
  const leftColor = gradientLeftField.value || '#ffffff';
  const rightColor = gradientRightField.value || '#ffffff';
  block.style.setProperty('background', `linear-gradient(to right, ${leftColor}, ${rightColor})`, 'important');

  // Build inner layout
  const left = document.createElement('div');
  left.className = 'cta-card-1-left';

  const title = buildTextElement('h2', 'cta-card-1-title', titleField);
  if (title) left.append(title);

  const subtitle = buildTextElement('p', 'cta-card-1-subtitle', subtitleField);
  if (subtitle) left.append(subtitle);

  // Right side
  const right = document.createElement('div');
  right.className = 'cta-card-1-right';

  const btnLabel = buttonTextField.value || 'Learn More';
  const btnHref = buttonLinkField.value;
  const btnSubtext = buttonSubtextField.value;
  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'cta-card-1-button';
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';
  if (buttonTextField.source) {
    moveInstrumentation(buttonTextField.source, btn);
    buttonTextField.source.remove();
  }

  if (btnSubtext) {
    btn.classList.add('has-subtext');
    const mainSpan = document.createElement('span');
    mainSpan.className = 'cta-card-1-button-main';
    mainSpan.textContent = btnLabel;
    const subSpan = document.createElement('span');
    subSpan.className = 'cta-card-1-button-subtext';
    subSpan.textContent = btnSubtext;
    if (buttonSubtextField.source) {
      moveInstrumentation(buttonSubtextField.source, subSpan);
      buttonSubtextField.source.remove();
    }
    btn.append(mainSpan, subSpan);
  } else {
    btn.textContent = btnLabel;
  }

  const btnColor = buttonColorField.value;
  const btnTextColor = buttonTextColorField.value;
  if (btnColor) btn.style.setProperty('background-color', btnColor, 'important');
  if (btnTextColor) btn.style.setProperty('color', btnTextColor, 'important');
  right.append(btn);

  // Second button (optional — outline style)
  const btn2Label = button2TextField.value;
  const btn2Href = button2LinkField.value;
  if (btn2Label) {
    const btn2 = document.createElement(btn2Href ? 'a' : 'button');
    btn2.className = 'cta-card-1-button cta-card-1-button-secondary';
    btn2.textContent = btn2Label;
    if (btn2Href) btn2.href = btn2Href;
    if (!btn2Href) btn2.type = 'button';
    if (button2TextField.source) {
      moveInstrumentation(button2TextField.source, btn2);
      button2TextField.source.remove();
    }

    const btn2Color = button2ColorField.value;
    if (btn2Color) {
      btn2.style.setProperty('border', `1px solid ${btn2Color}`, 'important');
      btn2.style.setProperty('color', btn2Color, 'important');
    }
    btn2.style.setProperty('background-color', '#ffffff', 'important');
    right.append(btn2);
  }

  // Clean up button2Link source
  if (button2LinkField.source) {
    const row = button2LinkField.source.closest('.cta-card-1 > div');
    if (row) row.remove();
    else button2LinkField.source.remove();
  }

  const belowText = buildTextElement('p', 'cta-card-1-below-button', belowButtonTextField);
  if (belowText) right.append(belowText);

  // Clean up buttonLink source
  if (buttonLinkField.source) {
    const row = buttonLinkField.source.closest('.cta-card-1 > div');
    if (row) row.remove();
    else buttonLinkField.source.remove();
  }

  block.replaceChildren(left, right);
}
