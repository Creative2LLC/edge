import { moveInstrumentation } from '../../scripts/scripts.js';
import { readTextField } from '../../scripts/block-field-utils.js';

export default function decorate(block) {
  const headingField = readTextField(block, 'heading', 0);
  const subheadingField = readTextField(block, 'subheading', 1);

  const inner = document.createElement('div');
  inner.className = 'leadership-header-inner';

  // Heading
  const h1 = document.createElement('h1');
  h1.className = 'leadership-header-heading';
  h1.textContent = headingField.value;
  if (headingField.source) {
    moveInstrumentation(headingField.source, h1);
  }
  inner.appendChild(h1);

  // Subheading
  const sub = document.createElement('p');
  sub.className = 'leadership-header-subheading';
  sub.textContent = subheadingField.value;
  if (subheadingField.source) {
    moveInstrumentation(subheadingField.source, sub);
  }
  inner.appendChild(sub);

  block.replaceChildren(inner);
}
