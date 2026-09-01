/**
 * Scrolls a carousel item into the leading edge of its scroll viewport.
 * Bounding rectangles account for breakout tracks, padding, and responsive
 * card widths, unlike a fixed pixel scroll distance.
 */
export function scrollToCarouselItem(track, item, behavior = 'smooth') {
  if (!track || !item) return;

  const trackRect = track.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  const targetLeft = Math.min(
    maxScroll,
    Math.max(0, track.scrollLeft + itemRect.left - trackRect.left),
  );

  track.scrollTo({ left: targetLeft, behavior });
}

/**
 * Returns the card that is currently aligned with the leading edge of a
 * scrollable carousel. The final card is considered active at the end stop,
 * even when it cannot align perfectly because the track has reached its end.
 */
export function getCarouselItemIndex(track, items) {
  if (!track || !items?.length) return -1;

  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);

  // `maxScroll > 0` guard matters: when the track is NOT scrollable at all —
  // few enough cards to fit, or a wide viewport — maxScroll is 0, so the
  // end-stop test `0 >= -1` passed and reported the LAST card as active while
  // the first one was plainly sitting at the leading edge. Every consumer that
  // paints a dot or a progress bar from this showed the wrong position.
  if (maxScroll > 0 && track.scrollLeft >= maxScroll - 1) return items.length - 1;

  const trackLeft = track.getBoundingClientRect().left;
  return items.reduce((closestIndex, item, index) => {
    const closestDistance = Math.abs(items[closestIndex].getBoundingClientRect().left - trackLeft);
    const distance = Math.abs(item.getBoundingClientRect().left - trackLeft);
    return distance < closestDistance ? index : closestIndex;
  }, 0);
}
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
export default function attachDragScroll(track) {
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
