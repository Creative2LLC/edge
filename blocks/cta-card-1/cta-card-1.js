export default function decorate(block) {
  // Read values from the EDS column structure (single row, 9 columns in model field order)
  const row = block.querySelector(':scope > div');
  const cols = row ? [...row.querySelectorAll(':scope > div')] : [];

  // Helper: get text from a column by index, checking both data-aue-prop and raw text
  function val(index) {
    const col = cols[index];
    if (!col) return '';
    return col.textContent.trim();
  }

  // Helper: get link href from a column
  function linkVal(index) {
    const col = cols[index];
    if (!col) return '';
    const a = col.querySelector('a');
    return a ? a.href : col.textContent.trim();
  }

  const titleText = val(0);
  const subtitleText = val(1);
  const gradientLeft = val(2) || '#ffffff';
  const gradientRight = val(3) || '#ffffff';
  const buttonText = val(4) || 'Learn More';
  const buttonHref = linkVal(5);
  const buttonColor = val(6);
  const buttonTextColor = val(7);
  const belowButtonText = val(8);

  // Clear block and rebuild
  block.textContent = '';

  // Apply gradient directly on block
  block.style.setProperty('background', `linear-gradient(to right, ${gradientLeft}, ${gradientRight})`, 'important');

  // Left side
  const left = document.createElement('div');
  left.className = 'cta-card-1-left';

  if (titleText) {
    const h2 = document.createElement('h2');
    h2.className = 'cta-card-1-title';
    h2.textContent = titleText;
    left.append(h2);
  }

  if (subtitleText) {
    const p = document.createElement('p');
    p.className = 'cta-card-1-subtitle';
    p.textContent = subtitleText;
    left.append(p);
  }

  // Right side
  const right = document.createElement('div');
  right.className = 'cta-card-1-right';

  const btn = document.createElement(buttonHref ? 'a' : 'button');
  btn.className = 'cta-card-1-button';
  btn.textContent = buttonText;
  if (buttonHref) btn.href = buttonHref;
  if (!buttonHref) btn.type = 'button';
  if (buttonColor) btn.style.setProperty('background-color', buttonColor, 'important');
  if (buttonTextColor) btn.style.setProperty('color', buttonTextColor, 'important');
  right.append(btn);

  if (belowButtonText) {
    const p = document.createElement('p');
    p.className = 'cta-card-1-below-button';
    p.textContent = belowButtonText;
    right.append(p);
  }

  block.append(left, right);
}
