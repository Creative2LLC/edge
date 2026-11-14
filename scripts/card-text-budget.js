/*
 * Shared line budget for listing cards (Resource Browser, blog Article List):
 * a card's title and description never exceed CARD_TEXT_LINE_BUDGET lines
 * together. CSS clamps the title to the full budget; this gives the description
 * whatever the title leaves, through a custom property the block's CSS reads as
 * its -webkit-line-clamp. Both clamps end in an ellipsis.
 */

/* Title + description never exceed this many lines together. */
export const CARD_TEXT_LINE_BUDGET = 5;

function lineHeightOf(element) {
  const styles = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  // line-height: normal does not resolve to a number; approximate from the font.
  const fontSize = Number.parseFloat(styles.fontSize);
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.2 : 0;
}

/**
 * Give the title as many of the shared lines as it needs, then let the
 * description have whatever is left. The title is capped at the full budget by
 * CSS, so measuring it here always returns a number within the budget.
 *
 * @param {Element} container
 * @param {{ card: string, title: string, text: string, property: string }} selectors
 */
export function applyCardTextBudget(container, {
  card, title, text, property,
}) {
  container.querySelectorAll(card).forEach((cardEl) => {
    const textEl = cardEl.querySelector(text);
    if (!textEl) return;
    const titleEl = cardEl.querySelector(title);
    let usedLines = 0;
    if (titleEl) {
      const lineHeight = lineHeightOf(titleEl);
      const titleLines = lineHeight ? Math.round(titleEl.offsetHeight / lineHeight) : 1;
      usedLines = Math.min(CARD_TEXT_LINE_BUDGET, Math.max(1, titleLines));
    }
    const remaining = Math.max(0, CARD_TEXT_LINE_BUDGET - usedLines);
    cardEl.style.setProperty(property, String(remaining));
    textEl.hidden = remaining === 0;
  });
}

/**
 * Cards arrive from several code paths (initial render, pagination, API load)
 * and the grid/list switch changes the title's font size, so rather than hook
 * every one of them, watch the container for both and re-measure.
 *
 * @param {Element} container
 * @param {{ card: string, title: string, text: string, property: string }} selectors
 */
export function observeCardTextBudget(container, selectors) {
  const run = () => window.requestAnimationFrame(() => applyCardTextBudget(container, selectors));
  new MutationObserver(run).observe(container, {
    childList: true,
    attributes: true,
    attributeFilter: ['data-view'],
  });
  let resizeTimer;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(run, 150);
  });
  run();
}
