import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Read a field value from data-aue-prop or from columns by index.
 * Returns { source, value }.
 */
function readField(block, cols, name, index) {
  // Universal Editor path: data-aue-prop attribute
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    return { source, value: source.textContent.trim() };
  }
  // Fallback: column by index
  if (cols[index]) {
    return { source: null, value: cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function readLinkField(block, cols, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return { source: null, value: anchor?.href || cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

export default function decorate(block) {
  // Collect columns from the EDS row structure (single row, N columns)
  const row = block.querySelector(':scope > div');
  const cols = row ? [...row.querySelectorAll(':scope > div')] : [];

  // Read all fields (data-aue-prop first, then column index fallback)
  const title = readField(block, cols, 'title', 0);
  const subtitle = readField(block, cols, 'subtitle', 1);
  const gradientLeft = readField(block, cols, 'gradientLeft', 2);
  const gradientRight = readField(block, cols, 'gradientRight', 3);
  const buttonText = readField(block, cols, 'buttonText', 4);
  const buttonLink = readLinkField(block, cols, 'buttonLink', 5);
  const buttonColor = readField(block, cols, 'buttonColor', 6);
  const buttonTextColor = readField(block, cols, 'buttonTextColor', 7);
  const belowButtonText = readField(block, cols, 'belowButtonText', 8);

  // Apply gradient background
  const leftColor = gradientLeft.value || '#ffffff';
  const rightColor = gradientRight.value || '#ffffff';
  block.style.background = `linear-gradient(to right, ${leftColor}, ${rightColor})`;

  // Build inner layout
  const inner = document.createElement('div');
  inner.className = 'cta-card-1-inner';

  // Left side: title + subtitle
  const left = document.createElement('div');
  left.className = 'cta-card-1-left';

  if (title.value) {
    const h2 = document.createElement('h2');
    h2.className = 'cta-card-1-title';
    h2.textContent = title.value;
    if (title.source) moveInstrumentation(title.source, h2);
    left.append(h2);
  }

  if (subtitle.value) {
    const p = document.createElement('p');
    p.className = 'cta-card-1-subtitle';
    p.textContent = subtitle.value;
    if (subtitle.source) moveInstrumentation(subtitle.source, p);
    left.append(p);
  }

  inner.append(left);

  // Right side: button + below-button text
  const right = document.createElement('div');
  right.className = 'cta-card-1-right';

  const btnLabel = buttonText.value || 'Learn More';
  const btnHref = buttonLink.value;
  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'cta-card-1-button';
  btn.textContent = btnLabel;
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';

  if (buttonColor.value) btn.style.backgroundColor = buttonColor.value;
  if (buttonTextColor.value) btn.style.color = buttonTextColor.value;

  right.append(btn);

  if (belowButtonText.value) {
    const p = document.createElement('p');
    p.className = 'cta-card-1-below-button';
    p.textContent = belowButtonText.value;
    if (belowButtonText.source) moveInstrumentation(belowButtonText.source, p);
    right.append(p);
  }

  inner.append(right);

  block.replaceChildren(inner);
}
