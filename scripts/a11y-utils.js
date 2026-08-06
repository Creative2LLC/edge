/**
 * Let keyboard users reach a scrollable region without adding an unnecessary
 * tab stop when all of its content already fits.
 */
export default function focusScrollableRegion(element, label) {
  const update = () => {
    const hasOverflow = element.scrollWidth > element.clientWidth + 1
      || element.scrollHeight > element.clientHeight + 1;
    if (hasOverflow) {
      element.tabIndex = 0;
      element.setAttribute('aria-label', label);
    } else {
      element.removeAttribute('tabindex');
      element.removeAttribute('aria-label');
    }
  };

  const observer = new ResizeObserver(update);
  observer.observe(element);
  requestAnimationFrame(() => requestAnimationFrame(update));
  return update;
}
