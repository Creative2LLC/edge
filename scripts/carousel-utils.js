/**
 * Attaches pointer-drag scrolling to a carousel track element.
 *
 * Uses the Pointer Events API so a single handler covers both mouse and touch.
 * `setPointerCapture` keeps the drag alive even when the pointer leaves the
 * element, which prevents the track from "sticking" mid-swipe.
 *
 * Also disables `scroll-behavior: smooth` during the drag so the track
 * follows the pointer instantly instead of lagging behind.
 */
export function attachDragScroll(track) {
  let active = false;
  let startX = 0;
  let startLeft = 0;
  let didDrag = false;

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    active = true;
    didDrag = false;
    startX = e.clientX;
    startLeft = track.scrollLeft;
    track.setPointerCapture(e.pointerId);
    track.style.scrollBehavior = 'auto';
    track.style.cursor = 'grabbing';
  });

  track.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = startX - e.clientX;
    if (Math.abs(dx) > 5) didDrag = true;
    if (didDrag) track.scrollLeft = startLeft + dx;
  });

  const end = () => {
    if (!active) return;
    active = false;
    track.style.scrollBehavior = '';
    track.style.cursor = '';
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);

  // Swallow the click that fires immediately after a drag so links/cards
  // inside the track don't activate unintentionally.
  track.addEventListener('click', (e) => {
    if (didDrag) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
