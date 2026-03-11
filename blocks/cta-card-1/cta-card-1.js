import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return { source: null, value: '' };
  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  return { source, value: anchor?.href || source.textContent.trim() };
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
  const titleField = getField(block, 'title');
  const subtitleField = getField(block, 'subtitle');
  const gradientLeftField = getField(block, 'gradientLeft');
  const gradientRightField = getField(block, 'gradientRight');
  const buttonTextField = getField(block, 'buttonText');
  const buttonLinkField = getLinkField(block, 'buttonLink');
  const buttonColorField = getField(block, 'buttonColor');
  const buttonTextColorField = getField(block, 'buttonTextColor');
  const belowButtonTextField = getField(block, 'belowButtonText');

  // Apply gradient background
  const leftColor = gradientLeftField.value || '#ffffff';
  const rightColor = gradientRightField.value || '#ffffff';
  block.style.setProperty('background', `linear-gradient(to right, ${leftColor}, ${rightColor})`, 'important');

  // Clean up source elements for non-visible fields
  [gradientLeftField, gradientRightField, buttonColorField, buttonTextColorField].forEach((f) => {
    if (f.source) {
      const row = f.source.closest('.cta-card-1 > div');
      if (row) row.remove();
      else f.source.remove();
    }
  });

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
  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'cta-card-1-button';
  btn.textContent = btnLabel;
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';
  if (buttonTextField.source) {
    moveInstrumentation(buttonTextField.source, btn);
    buttonTextField.source.remove();
  }

  const btnColor = buttonColorField.value;
  const btnTextColor = buttonTextColorField.value;
  if (btnColor) btn.style.setProperty('background-color', btnColor, 'important');
  if (btnTextColor) btn.style.setProperty('color', btnTextColor, 'important');
  right.append(btn);

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
