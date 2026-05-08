import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkField, readTextField } from '../../scripts/block-field-utils.js';

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

  const bgColor = data.bgColor || '#008db6';
  const textColor = data.textColor || '#ffffff';
  const outlined = data.style === 'outlined';

  if (outlined) {
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('color', bgColor, 'important');
    btn.style.setProperty('border', `2px solid ${bgColor}`, 'important');
  } else {
    btn.style.setProperty('background-color', bgColor, 'important');
    btn.style.setProperty('color', textColor, 'important');
    btn.style.setProperty('border', 'none', 'important');
  }

  return btn;
}

export default function decorate(block) {
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
    const textColorField = getField(row, 'textColor', 3);
    const styleField = getField(row, 'style', 4);

    const wrapper = document.createElement('div');
    wrapper.className = 'btn-group-item';
    moveInstrumentation(row, wrapper);

    const btn = buildButton({
      textField,
      linkField,
      bgColor: bgColorField.value,
      textColor: textColorField.value,
      style: styleField.value,
    });

    wrapper.append(btn);
    container.append(wrapper);
  });

  block.replaceChildren(container);
}
