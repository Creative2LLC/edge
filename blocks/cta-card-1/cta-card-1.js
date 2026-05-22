import { moveInstrumentation } from '../../scripts/scripts.js';
import { getBlockRows, readLinkField, readTextField } from '../../scripts/block-field-utils.js';

function getField(block, rows, name, index) {
  return readTextField(block, name, { fallbackCell: rows[index] });
}

function getLinkField(block, rows, name, index) {
  return readLinkField(block, name, { fallbackCell: rows[index] });
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
  const rows = getBlockRows(block);

  const titleField = getField(block, rows, 'title', 0);
  const subtitleField = getField(block, rows, 'subtitle', 1);
  const gradientLeftField = getField(block, rows, 'gradientLeft', 2);
  const gradientRightField = getField(block, rows, 'gradientRight', 3);
  const buttonTextField = getField(block, rows, 'buttonText', 4);
  const buttonLinkField = getLinkField(block, rows, 'buttonLink', 5);
  const buttonColorField = getField(block, rows, 'buttonColor', 6);
  const buttonTextColorField = getField(block, rows, 'buttonTextColor', 7);
  const buttonSubtextField = getField(block, rows, 'buttonSubtext', 8);
  const button2TextField = getField(block, rows, 'button2Text', 9);
  const button2LinkField = getLinkField(block, rows, 'button2Link', 10);
  const button2ColorField = getField(block, rows, 'button2Color', 11);
  const button2BackgroundColorField = getField(block, rows, 'button2BackgroundColor', 12);
  const button2LocationField = getField(block, rows, 'button2Location', 13);
  const belowButtonTextField = getField(block, rows, 'belowButtonText', 14);
  const styleTypeField = getField(block, rows, 'styleType', 15);
  const button2Location = button2LocationField.value.toLowerCase() === 'left' ? 'left' : 'right';
  if (button2Location === 'left') block.classList.add('cta-card-1-button2-left');
  if (button2LocationField.source) button2LocationField.source.remove();

  if (styleTypeField.value.toLowerCase() === 'variant-2') {
    block.classList.add('cta-card-1-variant-2');
  }
  if (styleTypeField.source) styleTypeField.source.remove();

  // Apply gradient background
  const leftColor = gradientLeftField.value || '#ffffff';
  const rightColor = gradientRightField.value || '#ffffff';
  block.style.setProperty('background', `linear-gradient(to right, ${leftColor}, ${rightColor})`, 'important');

  // Build inner layout
  const left = document.createElement('div');
  left.className = 'cta-card-1-left';

  const title = buildTextElement('h2', 'cta-card-1-title', titleField);
  if (title) left.append(title);

  const subtitle = buildTextElement('div', 'cta-card-1-subtitle', subtitleField);
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
    const btn2BgColor = button2BackgroundColorField.value;
    btn2.style.setProperty('background-color', btn2BgColor || 'transparent', 'important');
    if (button2Location === 'left') left.append(btn2);
    else right.append(btn2);
  }

  // Clean up button2Link source
  if (button2LinkField.source) {
    const row = button2LinkField.source.closest('.cta-card-1 > div');
    if (row) row.remove();
    else button2LinkField.source.remove();
  }

  const belowText = buildTextElement('div', 'cta-card-1-below-button', belowButtonTextField);
  if (belowText) {
    if (button2Location === 'left') {
      right.classList.add('cta-card-1-right-inline');
      right.append(belowText);
    } else {
      right.append(belowText);
    }
  }

  // Clean up buttonLink source
  if (buttonLinkField.source) {
    const row = buttonLinkField.source.closest('.cta-card-1 > div');
    if (row) row.remove();
    else buttonLinkField.source.remove();
  }

  block.replaceChildren(left, right);
}
