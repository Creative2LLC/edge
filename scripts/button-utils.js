/**
 * Button utilities for the approved button standard.
 * The look lives in the BUTTONS section of styles/styles.css; these helpers only decide
 * which style a button gets and keep its label clean.
 *
 * Arrows are never typed into a label any more. Text link is the only style that shows
 * one, and CSS draws it (`.button.text-link::after`). Everything here strips arrows.
 */

/* The old authoring opt-out. Still stripped, so content written for it renders cleanly. */
const NO_ARROW_SUFFIX = /\s*\[no arrow\]\s*$/i;

/* A trailing arrow, including the mojibake form some legacy content carries. */
const TRAILING_ARROW = /\s*(?:→|â†’)\s*$/;

/** The styles an author can pick. `icon` is set by blocks, never chosen. */
export const BUTTON_STYLES = ['primary', 'secondary', 'soft', 'text-link', 'amber', 'emergency', 'giving'];

const STYLE_CLASSES = [...BUTTON_STYLES, 'default', 'download', 'pdf'];

/* Style words used by block models before the standard. '' means "the block's default". */
const STYLE_WORDS = {
  primary: 'primary',
  solid: 'primary',
  filled: 'primary',
  fill: 'primary',
  inverted: 'primary', // the dark form now comes from the surface, not the author
  download: 'primary', // the Download style was retired
  pdf: 'primary',
  default: '',
  secondary: 'secondary',
  outlined: 'secondary',
  outline: 'secondary',
  border: 'secondary',
  bordered: 'secondary',
  ghost: 'secondary',
  soft: 'soft',
  link: 'text-link',
  text: 'text-link',
  plain: 'text-link',
  'text-link': 'text-link',
  amber: 'amber',
  accent: 'amber',
  emergency: 'emergency',
  giving: 'giving',
};

/* The old 18-swatch button colour picker, mapped to the nearest approved style. */
const SWATCH_STYLES = {
  '#FFFFFF': 'primary',
  '#00264D': 'primary',
  '#007294': 'primary',
  '#008EB7': 'primary',
  '#008DB6': 'primary',
  '#0D273B': 'primary',
  '#404041': 'secondary',
  '#A1A1A1': 'secondary',
  '#92D6E3': 'soft',
  '#F6F6F6': 'soft',
  '#E7E4E1': 'soft',
  '#DDD5CC': 'soft',
  '#E07E27': 'amber',
  '#FAAB60': 'amber',
  '#FCBC7E': 'amber',
  '#E38B22': 'amber',
  '#E13E30': 'emergency',
  '#F58A80': 'emergency',
  '#7BC581': 'giving',
};

/**
 * Removes a trailing arrow and a "[no arrow]" suffix from a label.
 * @param {string} text Authored label
 * @param {string} [defaultText] Used when the label is empty
 * @returns {string}
 */
export function cleanButtonLabel(text, defaultText = '') {
  return (String(text ?? '').trim() || defaultText)
    .replace(NO_ARROW_SUFFIX, '')
    .replace(TRAILING_ARROW, '')
    .trim();
}

/**
 * Kept for existing callers. It used to append an arrow; it now only cleans the label.
 * @param {string} text Authored label
 * @param {{ defaultText?: string }} [options]
 * @returns {string}
 */
export function decorateButtonText(text, options = {}) {
  const { defaultText = 'Learn More' } = options;
  return cleanButtonLabel(text, defaultText);
}

/**
 * Maps whatever a block model stored — a style word or an old picker colour — to an
 * approved style. Old pages carry both, so this is the single translation table.
 * @param {string} value Stored field value
 * @param {string} [fallback] The block's default style
 * @returns {string} One of BUTTON_STYLES, or the fallback
 */
export function resolveButtonStyle(value, fallback = 'primary') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  let hex = raw.toUpperCase();
  if (/^#[0-9A-F]{3}$/.test(hex)) hex = `#${[...hex.slice(1)].map((c) => c + c).join('')}`;
  if (/^#[0-9A-F]{6}$/.test(hex)) return SWATCH_STYLES[hex] || fallback;

  const word = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (Object.prototype.hasOwnProperty.call(STYLE_WORDS, word)) return STYLE_WORDS[word] || fallback;
  return fallback;
}

function stripLabelArrow(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let last = null;
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.trim()) last = walker.currentNode;
  }
  if (!last) return;
  const cleaned = last.textContent.replace(NO_ARROW_SUFFIX, '').replace(TRAILING_ARROW, '');
  if (cleaned !== last.textContent) last.textContent = cleaned;
}

/**
 * Puts an element on the standard: `.button` plus one style class, label arrow removed.
 * Replaces every inline colour/border write a block used to make.
 * @param {HTMLElement} element Link or button
 * @param {string} [style] A style, a legacy style word, or an old picker colour
 * @param {{ fallback?: string }} [options] fallback = the block's default style
 * @returns {HTMLElement}
 */
export function applyButtonStyle(element, style, { fallback = 'primary' } = {}) {
  if (!element) return element;
  const resolved = BUTTON_STYLES.includes(style) || style === 'icon'
    ? style
    : resolveButtonStyle(style, fallback);
  element.classList.remove(...STYLE_CLASSES, 'icon');
  element.classList.add('button', resolved || 'primary');
  stripLabelArrow(element);
  return element;
}

/* Accepts #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). Alpha is returned too:
   blocks store translucent tints such as #DDD5CC52 or #00264D33. */
function parseColor(value) {
  const v = String(value ?? '').trim();
  const hex = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const channels = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
    const alpha = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return { channels, alpha };
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+)(%?))?/i);
  if (!rgb) return null;
  let alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (rgb[5] === '%') alpha /= 100;
  return { channels: rgb.slice(1, 4).map(Number), alpha };
}

/**
 * True when a background colour is dark enough that buttons on it need their dark form.
 * Same threshold as isDarkColor in scripts/aem.js, so sections and blocks agree.
 * @param {string} value Hex or rgb() colour
 * @returns {boolean}
 */
export function isDarkSurface(value) {
  const color = parseColor(value);
  // A mostly transparent tint sits over this site's light sections, so it reads as light.
  if (!color || color.alpha < 0.5) return false;
  const [r, g, b] = color.channels.map((c) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.3;
}

/**
 * Marks the container a button sits on, so the stylesheet picks the light or dark form.
 * @param {HTMLElement} container The surface the button sits on
 * @param {boolean} dark
 * @returns {HTMLElement}
 */
export function markButtonSurface(container, dark) {
  if (container) container.classList.toggle('is-on-dark', Boolean(dark));
  return container;
}

/**
 * Reads a style field strictly: only one of the seven style values counts. For fields
 * that used to be a text or link colour picker, whose stored hex is not a style.
 * @param {string} value Stored field value
 * @param {string} [fallback] Returned for an empty or legacy value
 * @returns {string}
 */
export function resolveExplicitButtonStyle(value, fallback = 'primary') {
  const style = String(value ?? '').trim().toLowerCase();
  return BUTTON_STYLES.includes(style) ? style : fallback;
}

/**
 * Reads a block's style dropdown together with its old colour picker.
 * A style picked from the standard dropdown always wins: the picker beside it is locked.
 * A legacy value other than solid wins too (outlined, link, ...). A solid, default or
 * empty value falls back to the picker colour, so an older page whose author chose gold
 * or red keeps AMBER or Emergency instead of silently becoming Primary.
 * @param {string} style Stored style value
 * @param {string} color Stored button background colour
 * @param {string} [fallback] The block's default style
 * @returns {string}
 */
export function resolveAuthoredButtonStyle(style, color, fallback = 'primary') {
  const picked = resolveExplicitButtonStyle(style, '');
  if (picked) return picked;
  const fromStyle = resolveButtonStyle(style, '');
  if (fromStyle && fromStyle !== 'primary') return fromStyle;
  return resolveButtonStyle(color, fromStyle || fallback);
}

/* ---- Style dropdowns appended to a model after its pages were published ----
   Their values are namespaced ("button-amber", and "button2-amber" for a block's second
   button) so a published page, which carries no field names, can be read by value even
   when it dropped an empty field, and no other select's option reads as a style. */
const APPENDED_STYLE_RE = /^button([2-9])?-(primary|secondary|soft|text-link|amber|emergency|giving)$/;

/** Every value an appended style dropdown can store, for option vocabularies. */
export const APPENDED_STYLE_VALUES = ['button', 'button2']
  .flatMap((prefix) => BUTTON_STYLES.map((style) => `${prefix}-${style}`));

/**
 * Parses a value stored by an appended style dropdown.
 * @param {string} value Stored field value
 * @returns {{ slot: number, style: string }|null}
 */
export function parseAppendedStyle(value) {
  const match = String(value ?? '').trim().toLowerCase().match(APPENDED_STYLE_RE);
  return match ? { slot: Number(match[1] || 1), style: match[2] } : null;
}

/**
 * True for a value stored by an appended style dropdown. Blocks that tell content from
 * settings by value use it to keep these cells out of their text.
 * @param {string} value Cell text
 * @returns {boolean}
 */
export function isAppendedStyleValue(value) {
  return Boolean(parseAppendedStyle(value));
}

function appendedCellText(element) {
  const text = element?.textContent?.trim() || '';
  if (element?.children?.length === 2 && !isAppendedStyleValue(text)) {
    return element.lastElementChild.textContent.trim();
  }
  return text;
}

/**
 * Reads the style dropdowns appended to the end of a model.
 * In the editor each field is read by name. A published page has no names, so the
 * trailing cells are read by value: from the end, every appended style value (or empty
 * cell) belongs to these fields, and the first other value ends the run. A page published
 * before the fields existed has no such cell and reads as "".
 * @param {Element} scope The block, or an item row
 * @param {string[]} names Field names, first button first
 * @param {Element[]} [cells] The model's rows or cells, in published order
 * @returns {string[]} One style per name; "" keeps the block's own choice
 */
export function readAppendedStyles(scope, names, cells = []) {
  const styles = names.map(() => '');
  const taken = scope?.dataset?.appendedStyles;
  if (taken !== undefined) {
    taken.split(' ').filter(Boolean).forEach((entry) => {
      const [slot, style] = entry.split(':');
      const index = Number(slot) - 1;
      if (index < styles.length && !styles[index]) styles[index] = style;
    });
    return styles;
  }
  const inEditor = Boolean(
    scope?.matches?.('[data-aue-resource]') || scope?.querySelector?.('[data-aue-prop]'),
  );
  if (inEditor) {
    names.forEach((name, index) => {
      const field = scope.querySelector(`[data-aue-prop="${name}"]`);
      styles[index] = parseAppendedStyle(field?.textContent)?.style || '';
    });
    return styles;
  }
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const text = appendedCellText(cells[i]);
    if (text) {
      const parsed = parseAppendedStyle(text);
      if (!parsed) break;
      const index = parsed.slot - 1;
      if (index < styles.length && !styles[index]) styles[index] = parsed.style;
    }
  }
  return styles;
}

/**
 * Takes the appended style cells out of a published block before it decorates, so every
 * reader sees the markup shape it was written for. What was found stays on the block (and
 * on each item row) as data-appended-styles, which readAppendedStyles reads first. A
 * single-cell row holding a style value is a block field; trailing style cells in a longer
 * row belong to that item. The editor's markup is left alone: its fields bind by name.
 * @param {Element} block The block, before decoration
 */
export function takeAppendedStyleCells(block) {
  if (!block || block.dataset.appendedStyles !== undefined) return;
  if (block.matches('[data-aue-resource]') || block.querySelector('[data-aue-prop]')) return;
  const entry = (parsed) => `${parsed.slot}:${parsed.style}`;
  const blockStyles = [];
  [...block.children].forEach((row) => {
    if (row.children.length <= 1) {
      const parsed = parseAppendedStyle(appendedCellText(row));
      if (parsed) {
        blockStyles.push(entry(parsed));
        row.remove();
      }
      return;
    }
    const found = [];
    while (row.children.length > 1) {
      const last = row.lastElementChild;
      const parsed = parseAppendedStyle(last.textContent);
      if (!parsed) break;
      found.unshift(entry(parsed));
      last.remove();
    }
    if (found.length) row.dataset.appendedStyles = found.join(' ');
  });
  block.dataset.appendedStyles = blockStyles.join(' ');
}

/**
 * Applies appended styles to finished buttons, found by selector. An empty style keeps
 * the style the block already gave the button.
 * @param {Element} root The decorated block
 * @param {Object<string, string>} styles Selector to style
 */
export function restyleAppendedButtons(root, styles) {
  Object.entries(styles).forEach(([selector, style]) => {
    if (!style) return;
    root.querySelectorAll(selector).forEach((element) => applyButtonStyle(element, style));
  });
}

/**
 * True when the section around an element has a dark authored background. For blocks
 * with no surface of their own, whose buttons sit straight on the section.
 * @param {HTMLElement} element Usually the block
 * @returns {boolean}
 */
export function isOnDarkSection(element) {
  const section = element?.closest?.('.section');
  return isDarkSurface(section?.getAttribute('data-background-color') || '');
}

/**
 * Creates a link (with href) or a button (without).
 * Pass `style` to put it on the standard; without one it gets no button classes.
 * @param {Object} options
 * @param {string} options.label Button text
 * @param {string} [options.href] Link URL
 * @param {string} [options.style] Approved style, legacy style word, or old picker colour
 * @param {HTMLElement} [options.source] Source element for AEM instrumentation
 * @param {string} [options.defaultText] Used when the label is empty
 * @returns {HTMLElement}
 */
export function createButton(options = {}) {
  const {
    label = '',
    href = '',
    style = '',
    source = null,
    defaultText = 'Learn More',
  } = options;

  const element = document.createElement(href ? 'a' : 'button');
  element.textContent = cleanButtonLabel(label, defaultText);
  if (href) element.href = href;
  if (style) applyButtonStyle(element, style);

  if (source && typeof window.moveInstrumentation === 'function') {
    window.moveInstrumentation(source, element);
  }

  return element;
}
