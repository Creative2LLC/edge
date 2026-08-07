/**
 * Centralized button text decoration utility
 * Automatically adds right arrow (→) to button text unless [no arrow] suffix is present
 */

/**
 * Processes button text to add or remove arrow decoration
 * @param {string} text - The button text to process
 * @param {Object} options - Configuration options
 * @param {string} options.defaultText - Default text if input is empty
 * @param {string} options.arrowChar - Arrow character to append (default: ' →')
 * @param {boolean} options.forceAddArrow - Force arrow addition even if [no arrow] present
 * @returns {string} Processed button text with or without arrow
 */
export function decorateButtonText(text, options = {}) {
  const {
    defaultText = 'Learn More',
    arrowChar = ' \u2192',
    forceAddArrow = false,
  } = options;

  // Use provided text or fall back to default
  let processedText = (text?.trim() || defaultText).trim();

  // Check for [no arrow] suffix (case-insensitive)
  const noArrowPattern = /\s*\[no arrow\]\s*$/i;
  const hasNoArrowSuffix = noArrowPattern.test(processedText);

  // Remove [no arrow] suffix if present
  if (hasNoArrowSuffix) {
    processedText = processedText.replace(noArrowPattern, '').trim();
  }

  // Don't add arrow if:
  // 1. [no arrow] suffix was present (unless forced)
  // 2. Arrow already exists in the text
  if (!forceAddArrow && hasNoArrowSuffix) {
    return processedText;
  }

  // Authoring occasionally includes its own arrow. Strip both the standard
  // character and the legacy mojibake version, then add one consistent icon.
  const trailingArrowPattern = /\s*(?:\u2192|\u00e2\u2020\u2019)\s*$/;
  processedText = processedText.replace(trailingArrowPattern, '').trim();
  return `${processedText}${arrowChar}`;
}

/**
 * Creates a button element with standardized arrow decoration
 * @param {Object} options - Button configuration
 * @param {string} options.label - Button text label
 * @param {string} options.href - Link URL (creates <a> if provided, <button> otherwise)
 * @param {boolean} options.addArrow - Whether to add arrow (default: true)
 * @param {HTMLElement} options.source - Source element for AEM instrumentation
 * @param {string} options.defaultText - Default text if label is empty
 * @returns {HTMLElement} Button or anchor element
 */
export function createButton(options = {}) {
  const {
    label = '',
    href = '',
    addArrow = true,
    source = null,
    defaultText = 'Learn More',
  } = options;

  // Create button or link element
  const element = document.createElement(href ? 'a' : 'button');

  // Process and set text content
  if (addArrow) {
    element.textContent = decorateButtonText(label, { defaultText });
  } else {
    element.textContent = label?.trim() || defaultText;
  }

  // Set href for links
  if (href) {
    element.href = href;
  }

  // Preserve AEM authoring instrumentation if source provided
  if (source && typeof window.moveInstrumentation === 'function') {
    window.moveInstrumentation(source, element);
  }

  return element;
}
