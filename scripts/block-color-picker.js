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
    .color-picker-toast.is-saved {
      background: #1a6e3c;
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

function showToast(message, saved = false) {
  document.querySelector('.color-picker-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `color-picker-toast${saved ? ' is-saved' : ''}`;
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2000);
}

function saveViaUE(source, prop, hex) {
  if (!source || !prop) return false;

  // Update the hidden source element — this is UE's in-DOM field value
  source.textContent = hex;

  // Walk up to find the data-aue-resource owner
  const resource = source.getAttribute('data-aue-resource')
    || source.closest('[data-aue-resource]')?.getAttribute('data-aue-resource');

  if (!resource) return false;

  // Dispatch the UE content-patch event — the CORS bridge forwards this to the editor shell
  source.dispatchEvent(new CustomEvent('aue:content-patch', {
    bubbles: true,
    detail: {
      resource,
      prop,
      value: hex,
      type: 'text',
    },
  }));

  // Also fire native events in case UE's mutation observer is watching
  source.dispatchEvent(new Event('input', { bubbles: true }));
  source.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
}

/**
 * @param {HTMLElement} block
 * @param {Array<{label: string, cssVar: string, value: string, source?: Element, prop?: string}>} colorProps
 */
export function injectColorPickers(block, colorProps) {
  // Never runs on the live site — data-aue-resource is only present inside Universal Editor
  if (!document.querySelector('[data-aue-resource]')) return;

  injectStyles();

  const bar = document.createElement('div');
  bar.className = 'color-picker-bar';

  colorProps.forEach(({ label, cssVar, value, source, prop }) => {
    const swatch = document.createElement('label');
    swatch.className = 'color-picker-swatch';
    swatch.title = label;

    const input = document.createElement('input');
    input.type = 'color';
    input.value = to6DigitHex(value);

    const span = document.createElement('span');
    span.textContent = label;

    // Live preview while dragging the picker
    input.addEventListener('input', () => {
      block.style.setProperty(cssVar, input.value);
    });

    // On commit — attempt to save through UE, fall back to clipboard
    input.addEventListener('change', () => {
      const hex = input.value;
      block.style.setProperty(cssVar, hex);

      const saved = saveViaUE(source, prop, hex);
      if (saved) {
        showToast(`${hex} saved`, true);
      } else {
        navigator.clipboard?.writeText(hex).catch(() => {});
        showToast(`${hex} copied — paste into panel`);
      }
    });

    swatch.append(input, span);
    bar.append(swatch);
  });

  block.prepend(bar);
}
