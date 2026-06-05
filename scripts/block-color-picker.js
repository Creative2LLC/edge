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

function showCopiedToast(hex) {
  document.querySelector('.color-picker-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'color-picker-toast';
  toast.textContent = `${hex} copied`;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 1800);
}

/**
 * @param {HTMLElement} block
 * @param {Array<{label: string, cssVar: string, value: string}>} colorProps
 */
export function injectColorPickers(block, colorProps) {
  if (!document.querySelector('[data-aue-resource]')) return;

  injectStyles();

  const bar = document.createElement('div');
  bar.className = 'color-picker-bar';

  colorProps.forEach(({ label, cssVar, value }) => {
    const swatch = document.createElement('label');
    swatch.className = 'color-picker-swatch';
    swatch.title = label;

    const input = document.createElement('input');
    input.type = 'color';
    input.value = to6DigitHex(value);

    const span = document.createElement('span');
    span.textContent = label;

    input.addEventListener('input', () => {
      block.style.setProperty(cssVar, input.value);
    });

    input.addEventListener('change', () => {
      navigator.clipboard?.writeText(input.value).catch(() => {});
      showCopiedToast(input.value);
    });

    swatch.append(input, span);
    bar.append(swatch);
  });

  block.prepend(bar);
}
