/**
 * Let keyboard users reach a scrollable region without adding an unnecessary
 * tab stop when all of its content already fits.
 */
export default function focusScrollableRegion(element, label) {
  const update = () => {
    const hasOverflow = element.scrollWidth > element.clientWidth + 1
      || element.scrollHeight > element.clientHeight + 1;
    // A focusable scroll area needs a name, and a plain div can only carry one with a role
    // (aria-label on a role-less div is prohibited and ignored). Lists keep their own role.
    const needsRole = !element.hasAttribute('role') || element.dataset.scrollRegionRole === 'true';
    if (hasOverflow) {
      element.tabIndex = 0;
      element.setAttribute('aria-label', label);
      if (needsRole && !['UL', 'OL'].includes(element.tagName)) {
        element.setAttribute('role', 'region');
        element.dataset.scrollRegionRole = 'true';
      }
    } else {
      element.removeAttribute('tabindex');
      element.removeAttribute('aria-label');
      if (element.dataset.scrollRegionRole === 'true') {
        element.removeAttribute('role');
        delete element.dataset.scrollRegionRole;
      }
    }
  };

  const observer = new ResizeObserver(update);
  observer.observe(element);
  requestAnimationFrame(() => requestAnimationFrame(update));
  return update;
}
