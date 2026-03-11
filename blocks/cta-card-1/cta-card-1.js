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

function getFieldFromColumns(block, fieldNames) {
  // Fallback: read fields from the EDS column structure (row > col order matches model field order)
  const values = {};
  const rows = [...block.querySelectorAll(':scope > div')];
  if (rows.length === 1) {
    // Single row block — columns are the fields in model order
    const cols = [...rows[0].querySelectorAll(':scope > div')];
    fieldNames.forEach((name, i) => {
      if (cols[i]) {
        values[name] = cols[i].textContent.trim();
      }
    });
  }
  return values;
}

export default function decorate(block) {
  const fieldOrder = [
    'title', 'subtitle', 'gradientLeft', 'gradientRight',
    'buttonText', 'buttonLink', 'buttonColor', 'buttonTextColor', 'belowButtonText',
  ];

  // Try data-aue-prop first (Universal Editor), then fall back to column order
  const titleField = getField(block, 'title');
  const subtitleField = getField(block, 'subtitle');
  const gradientLeftField = getField(block, 'gradientLeft');
  const gradientRightField = getField(block, 'gradientRight');
  const buttonTextField = getField(block, 'buttonText');
  const buttonLinkField = getField(block, 'buttonLink');
  const buttonColorField = getField(block, 'buttonColor');
  const buttonTextColorField = getField(block, 'buttonTextColor');
  const belowButtonTextField = getField(block, 'belowButtonText');

  // Fallback: if no data-aue-prop elements found, read from column structure
  const colValues = (!titleField.source && !subtitleField.source)
    ? getFieldFromColumns(block, fieldOrder)
    : {};

  const titleVal = titleField.value || colValues.title || '';
  const subtitleVal = subtitleField.value || colValues.subtitle || '';
  const gradientLeft = gradientLeftField.value || colValues.gradientLeft || '#ffffff';
  const gradientRight = gradientRightField.value || colValues.gradientRight || '#ffffff';
  const buttonTextVal = buttonTextField.value || colValues.buttonText || 'Learn More';
  const buttonLinkVal = buttonLinkField.source?.querySelector('a')?.href
    || buttonLinkField.value || colValues.buttonLink || '';
  const btnColor = buttonColorField.value || colValues.buttonColor || '';
  const btnTextColor = buttonTextColorField.value || colValues.buttonTextColor || '';
  const belowButtonTextVal = belowButtonTextField.value || colValues.belowButtonText || '';

  // Apply gradient background
  block.style.background = `linear-gradient(to right, ${gradientLeft}, ${gradientRight})`;

  // Build inner layout
  const inner = document.createElement('div');
  inner.className = 'cta-card-1-inner';

  // Left side: title + subtitle
  const left = document.createElement('div');
  left.className = 'cta-card-1-left';

  if (titleField.source) {
    const title = buildText('h2', 'cta-card-1-title', titleField);
    if (title) left.append(title);
  } else if (titleVal) {
    const title = document.createElement('h2');
    title.className = 'cta-card-1-title';
    title.textContent = titleVal;
    left.append(title);
  }

  if (subtitleField.source) {
    const subtitle = buildText('p', 'cta-card-1-subtitle', subtitleField);
    if (subtitle) left.append(subtitle);
  } else if (subtitleVal) {
    const subtitle = document.createElement('p');
    subtitle.className = 'cta-card-1-subtitle';
    subtitle.textContent = subtitleVal;
    left.append(subtitle);
  }

  inner.append(left);

  // Right side: button + below-button text
  const right = document.createElement('div');
  right.className = 'cta-card-1-right';

  // Button
  const btn = document.createElement(buttonLinkVal ? 'a' : 'button');
  btn.className = 'cta-card-1-button';
  btn.textContent = buttonTextVal;
  if (buttonLinkVal) btn.href = buttonLinkVal;
  if (!buttonLinkVal) btn.type = 'button';

  // Apply custom button colors
  if (btnColor) btn.style.backgroundColor = btnColor;
  if (btnTextColor) btn.style.color = btnTextColor;

  right.append(btn);

  // Below-button text
  if (belowButtonTextField.source) {
    const belowText = buildText('p', 'cta-card-1-below-button', belowButtonTextField);
    if (belowText) right.append(belowText);
  } else if (belowButtonTextVal) {
    const belowText = document.createElement('p');
    belowText.className = 'cta-card-1-below-button';
    belowText.textContent = belowButtonTextVal;
    right.append(belowText);
  }

  inner.append(right);

  // Clean up remaining source elements
  [gradientLeftField, gradientRightField, buttonLinkField,
    buttonColorField, buttonTextColorField, buttonTextField].forEach((f) => {
    if (f.source) f.source.remove();
  });

  block.replaceChildren(inner);
}
