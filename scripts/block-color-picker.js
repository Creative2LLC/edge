let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .color-picker-bar {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
      padding: 6px 8px;
      margin-bottom: 6px;
      background: rgba(0 0 0 / 75%);
      border-radius: 4px;
      font: 11px/1 system-ui, sans-serif;
    }
    .color-picker-swatch {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      color: #fff;
      white-space: nowrap;
    }
    .color-picker-swatch input[type="color"] {
      width: 22px;
      height: 22px;
      padding: 1px;
      border: 1px solid rgba(255 255 255 / 40%);
      border-radius: 3px;
      cursor: pointer;
      background: none;
    }
    .color-picker-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1d1d1d;
      color: #fff;
      font: 12px/1.4 system-ui, sans-serif;
      padding: 6px 14px;
      border-radius: 4px;
      z-index: 9999;
      pointer-events: none;
      animation: cptoast-in 0.15s ease;
    }
    @keyframes cptoast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(6px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.append(style);
}

function to6DigitHex(value) {
  const hex = String(value || '').trim();
  const m3 = hex.match(/^#([0-9a-f]{3})$/i);
  if (m3) {
    const [r, g, b] = m3[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : '#000000';
}

function showToast(message) {
  document.querySelector('.color-picker-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'color-picker-toast';
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2500);
}

/**
 * @param {HTMLElement} block
 * @param {Array<Object>} props - each entry: label, cssVar, value, prop name
 * @returns {void}
 */
export default function injectColorPickers(block, props) {
  // Never runs on the live site — data-aue-resource only exists inside Universal Editor
  if (!document.querySelector('[data-aue-resource]')) return;

  injectStyles();

  const bar = document.createElement('div');
  bar.className = 'color-picker-bar';

  props.forEach(({
    label, cssVar, value, className,
  }) => {
    const swatch = document.createElement('label');
    swatch.className = 'color-picker-swatch';
    swatch.title = label;

    const input = document.createElement('input');
    input.type = 'color';
    input.value = to6DigitHex(value);

    const span = document.createElement('span');
    span.textContent = label;

    // Live preview while dragging
    input.addEventListener('input', () => {
      block.style.setProperty(cssVar, input.value);
      if (className) block.classList.add(className);
    });

    // On commit — copy hex to clipboard and guide author to paste into the panel field
    input.addEventListener('change', () => {
      const hex = input.value;
      block.style.setProperty(cssVar, hex);
      if (className) block.classList.add(className);
      navigator.clipboard?.writeText(hex).catch(() => {});
      showToast(`${hex} copied — paste into the ${label} field`);
    });

    swatch.append(input, span);
    bar.append(swatch);
  });

  block.prepend(bar);
}
