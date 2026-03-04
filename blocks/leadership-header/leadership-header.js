import { moveInstrumentation } from '../../scripts/scripts.js';

export default function decorate(block) {
  const instrHeading = block.querySelector('[data-aue-prop="heading"]');
  const instrSubheading = block.querySelector('[data-aue-prop="subheading"]');

  const inner = document.createElement('div');
  inner.className = 'leadership-header-inner';

  // Heading
  const h1 = document.createElement('h1');
  h1.className = 'leadership-header-heading';
  if (instrHeading) {
    h1.textContent = instrHeading.textContent.trim();
    moveInstrumentation(instrHeading, h1);
  } else {
    const firstRow = block.querySelector(':scope > div');
    if (firstRow) h1.textContent = firstRow.textContent.trim();
  }
  inner.appendChild(h1);

  // Subheading
  const sub = document.createElement('p');
  sub.className = 'leadership-header-subheading';
  if (instrSubheading) {
    sub.textContent = instrSubheading.textContent.trim();
    moveInstrumentation(instrSubheading, sub);
  } else {
    const rows = block.querySelectorAll(':scope > div');
    if (rows.length > 1) sub.textContent = rows[1].textContent.trim();
  }
  inner.appendChild(sub);

  block.replaceChildren(inner);
}
