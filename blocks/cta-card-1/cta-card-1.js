import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  return { source: null, value: '' };
}

function buildText(tag, className, field) {
  if (!field.value && !field.source) return null;
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
  const buttonLinkField = getField(block, 'buttonLink');
  const buttonColorField = getField(block, 'buttonColor');
  const buttonTextColorField = getField(block, 'buttonTextColor');
  const belowButtonTextField = getField(block, 'belowButtonText');

  // Apply gradient background
  const gradientLeft = gradientLeftField.value || '#ffffff';
  const gradientRight = gradientRightField.value || '#ffffff';
  block.style.background = `linear-gradient(to right, ${gradientLeft}, ${gradientRight})`;

  // Build inner layout
  const inner = document.createElement('div');
  inner.className = 'cta-card-1-inner';

  // Left side: title + subtitle
  const left = document.createElement('div');
  left.className = 'cta-card-1-left';

  const title = buildText('h2', 'cta-card-1-title', titleField);
  if (title) left.append(title);

  const subtitle = buildText('p', 'cta-card-1-subtitle', subtitleField);
  if (subtitle) left.append(subtitle);

  inner.append(left);

  // Right side: button + below-button text
  const right = document.createElement('div');
  right.className = 'cta-card-1-right';

  // Button
  const buttonLink = buttonLinkField.source?.querySelector('a')?.href
    || buttonLinkField.value;
  const buttonText = buttonTextField.value || 'Learn More';
  const btn = document.createElement(buttonLink ? 'a' : 'button');
  btn.className = 'cta-card-1-button';
  btn.textContent = buttonText;
  if (buttonLink) btn.href = buttonLink;
  if (!buttonLink) btn.type = 'button';

  // Apply custom button colors
  const btnColor = buttonColorField.value;
  const btnTextColor = buttonTextColorField.value;
  if (btnColor) btn.style.backgroundColor = btnColor;
  if (btnTextColor) btn.style.color = btnTextColor;

  right.append(btn);

  // Below-button text
  const belowText = buildText('p', 'cta-card-1-below-button', belowButtonTextField);
  if (belowText) right.append(belowText);

  inner.append(right);

  // Clean up remaining source elements
  [gradientLeftField, gradientRightField, buttonLinkField,
    buttonColorField, buttonTextColorField].forEach((f) => {
    if (f.source) f.source.remove();
  });

  block.replaceChildren(inner);
}
