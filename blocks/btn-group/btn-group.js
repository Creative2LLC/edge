import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkField, readTextField, setItemLabel } from '../../scripts/block-field-utils.js';
import {
  applyButtonStyle,
  isOnDarkSection,
  markButtonSurface,
  resolveAuthoredButtonStyle,
} from '../../scripts/button-utils.js';

function getField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function getLinkField(row, name, index) {
  return readLinkField(row, name, { fallbackCell: row.children[index] });
}

function buildButton(data) {
  const label = data.textField.value || 'Button';
  const href = data.linkField.value;
  const btn = document.createElement(href ? 'a' : 'button');
  btn.className = 'btn-group-btn';
  btn.textContent = label;
  if (href) btn.href = href;
  if (!href) btn.type = 'button';
  if (data.textField.source) moveInstrumentation(data.textField.source, btn);

  // The look comes from the button standard. The old colour picker only chooses the
  // style now (gold -> AMBER, red -> Emergency); the text colour picker is ignored.
  applyButtonStyle(btn, resolveAuthoredButtonStyle(data.style, data.bgColor));

  return btn;
}

export default function decorate(block) {
  block.classList.add('btn-group');
  const rows = [...block.querySelectorAll(':scope > div')];

  // Read block-level layout setting
  const layoutEl = block.querySelector('[data-aue-prop="layout"]');
  const layout = layoutEl?.textContent.trim() || 'row';

  const container = document.createElement('div');
  container.className = 'btn-group-inner';
  container.classList.add(`btn-group-${layout === 'stack' ? 'stack' : 'row'}`);

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;

    const textField = getField(row, 'text', 0);
    const linkField = getLinkField(row, 'link', 1);
    const bgColorField = getField(row, 'bgColor', 2);
    const styleField = getField(row, 'style', 4);

    const wrapper = document.createElement('div');
    wrapper.className = 'btn-group-item';
    moveInstrumentation(row, wrapper);
    setItemLabel(wrapper, [textField.value]);

    const btn = buildButton({
      textField,
      linkField,
      bgColor: bgColorField.value,
      style: styleField.value,
    });

    wrapper.append(btn);
    container.append(wrapper);
  });

  // The group has no surface of its own; its buttons sit straight on the section.
  markButtonSurface(container, isOnDarkSection(block));
  block.replaceChildren(container);
}
