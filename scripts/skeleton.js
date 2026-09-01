/**
 * Shared loading states: skeleton placeholders and the beacon spinner.
 *
 * Two rules are what make this read as one system rather than as N block-local
 * shimmers that happen to be grey:
 *
 *  1. A skeleton BORROWS the block's own classes. `item`, `media` and `body`
 *     name the real card / media / content classes the block already styles, so
 *     the placeholder inherits that block's exact grid, radius, aspect-ratio and
 *     padding. No block geometry is restated in this file or in styles.css,
 *     which is what let the one hand-built skeleton on the site (poster-results)
 *     drift out of sync with the card it stands in for.
 *
 *  2. The shimmer CASCADES. Each item carries its position as --skeleton-index,
 *     which styles.css turns into a NEGATIVE animation-delay. Negative is the
 *     whole point: the sweep starts mid-cycle, so the wave is already travelling
 *     across the grid on the first painted frame instead of every tile pulsing
 *     in lockstep after a dead beat.
 *
 * Flash protection is CSS, not JS: items fade in on a 120ms delay, so a request
 * that resolves faster than that removes the skeleton before it was ever
 * visible. Call sites stay synchronous.
 *
 * Usage:
 *   showSkeleton(cardsContainer, {
 *     count: 8,
 *     item: 'resources-browser-card',
 *     media: 'resources-browser-card-image',
 *     body: 'resources-browser-card-content',
 *     lines: ['pill', 'title', 'title-sm', 'text', 'text-sm'],
 *     label: 'Loading resources',
 *   });
 *   ...
 *   clearSkeleton(cardsContainer);
 */

/** Bones repeat their delay after this many items so a 60-card grid still lights
 *  up promptly instead of taking five seconds to reach the last row. */
const CASCADE_WRAP = 14;

/** Kinds a `lines` entry may name. Anything else is treated as 'text'. */
const BONE_KINDS = new Set([
  'title', 'title-sm', 'text', 'text-sm', 'label', 'pill', 'button', 'avatar', 'media', 'block',
]);

const SKELETON_ITEM_ATTR = 'data-skeleton-item';
const STATUS_ATTR = 'data-skeleton-status';

/** Spacing used only where the borrowed class supplies none of its own. */
const BONE_GAP = '12px';

/**
 * Space the bones inside a borrowed body wrapper.
 *
 * Borrowing a block's body class gets its padding and, usually, its gap — but
 * only usually. amber-alerts' card body is a flex column with NO gap (its real
 * children carry margins instead), so inherited spacing is zero and the bones
 * fuse into one grey slab. The gap cannot be a CSS fallback: `gap` is not
 * inherited and there is no selector for "declared nothing", so a blanket
 * default would override the blocks that do set one.
 *
 * Measuring is the honest version of that test — the block's own gap wins
 * wherever it exists, and this only fills the hole. One forced style recalc per
 * skeleton render, on a path that is already waiting on the network.
 */
function applyBoneSpacing(host) {
  // A single bone has nothing to be spaced from.
  if (host.children.length < 2) return;
  const { display, rowGap } = getComputedStyle(host);
  if (!display.includes('flex') && !display.includes('grid')) {
    // A plain block: `gap` would be inert, so give it a track to work on. Safe
    // because this wrapper only ever holds bones.
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.rowGap = BONE_GAP;
    return;
  }
  if (rowGap === 'normal' || Number.parseFloat(rowGap) === 0) host.style.rowGap = BONE_GAP;
}

function toClassList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value).split(/\s+/).filter(Boolean);
}

/**
 * Build one bone. `spec` is a kind, optionally with a width percentage after a
 * colon — 'text:70' is a text bone 70% wide. The width override exists so a
 * block can break up the mechanical look of five identical bars without needing
 * a new named kind for every ragged edge.
 */
export function createBone(spec = 'text') {
  const [rawKind, rawWidth] = String(spec).split(':');
  const kind = BONE_KINDS.has(rawKind) ? rawKind : 'text';
  const bone = document.createElement('span');
  bone.className = `skeleton-bone is-${kind}`;
  const width = Number.parseFloat(rawWidth);
  if (Number.isFinite(width)) bone.style.width = `${width}%`;
  return bone;
}

/**
 * The beacon: a solid brand dot with rings pulsing outward from it. Used where
 * there is no content shape worth faking — a map about to draw, a form mid
 * submit, a panel whose height is unknown until the data lands.
 */
export function createBeacon({ label = 'Loading', size = null, tone = null } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'skeleton-beacon';
  if (tone === 'dark') wrap.classList.add('is-on-dark');
  if (size) wrap.style.setProperty('--beacon-size', typeof size === 'number' ? `${size}px` : size);

  // Three rings, staggered in CSS, so the pulse never fully empties.
  for (let i = 0; i < 3; i += 1) {
    const ring = document.createElement('span');
    ring.className = 'skeleton-beacon-ring';
    wrap.append(ring);
  }

  const text = document.createElement('span');
  text.className = 'u-sr-only';
  text.textContent = label;
  wrap.append(text);
  wrap.setAttribute('role', 'status');
  return wrap;
}

/** An indeterminate brand bar, for a panel that is refreshing in place. */
export function createProgressBar({ label = 'Loading' } = {}) {
  const bar = document.createElement('div');
  bar.className = 'skeleton-progress';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-label', label);
  return bar;
}

/**
 * The polite announcement that goes with a skeleton. Kept as a single reused
 * node whose text is only written when it actually changes: recreating it on
 * every debounced keystroke would re-announce "Loading resources" on each one.
 */
function syncStatus(container, label) {
  let status = container.querySelector(`:scope > [${STATUS_ATTR}]`);
  if (!label) {
    if (status && status.textContent) status.textContent = '';
    return;
  }
  if (!status) {
    status = document.createElement('span');
    status.setAttribute(STATUS_ATTR, '');
    status.className = 'u-sr-only';
    status.setAttribute('role', 'status');
    container.append(status);
  }
  const message = `${label}…`;
  if (status.textContent !== message) status.textContent = message;
}

/**
 * Build a single skeleton item.
 *
 * The block's classes go on WRAPPERS and never on a bone. That is a specificity
 * decision, not a stylistic one: a block's media class is normally written
 * `.resources-browser .resources-browser-card-image` (0,2,0) and sets its own
 * background, and block CSS loads after styles.css — so a bone wearing that
 * class would lose its shimmer to the block's flat grey. Wrapping instead lets
 * the wrapper keep the block's aspect-ratio, padding and gap while the bone
 * inside it, carrying no block class at all, keeps the sweep.
 */
function createSkeletonItem(index, options) {
  const {
    item, media, body, lines, mediaRatio,
  } = options;

  // `is-bare` means "no block class to borrow from, use the generic layout".
  // It has to be a class rather than a CSS fallback because the fallbacks would
  // otherwise apply on top of a borrowed class that simply does not declare
  // `display` — article-list's card is a plain block, and a default flex `gap`
  // there opens a 12px seam between the image and the body that the real card
  // does not have.
  const el = document.createElement('div');
  el.className = ['skeleton-item', ...(item ? toClassList(item) : ['is-bare'])].join(' ');
  el.setAttribute(SKELETON_ITEM_ATTR, '');
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--skeleton-index', String(index % CASCADE_WRAP));

  if (media) {
    const mediaEl = document.createElement('div');
    mediaEl.className = ['skeleton-media', ...toClassList(media)].join(' ');
    if (mediaRatio) mediaEl.style.aspectRatio = mediaRatio;
    mediaEl.append(createBone('media'));
    el.append(mediaEl);
  }

  let host = el;
  if (body) {
    host = document.createElement('div');
    host.className = ['skeleton-body', ...toClassList(body)].join(' ');
  } else if (media) {
    // Media but no body wrapper: the bones sit beside the media inside the
    // borrowed card, so they still need somewhere with a gap to live.
    host = document.createElement('div');
    host.className = 'skeleton-body is-bare';
  }
  lines.forEach((spec) => host.append(createBone(spec)));
  if (host !== el) el.append(host);

  return el;
}

/**
 * Remove the placeholders and drop the busy flag. Safe on a container that was
 * never given a skeleton, so error and abort paths can call it unconditionally.
 */
export function clearSkeleton(container, { keepBusy = false } = {}) {
  if (!container) return;
  container.querySelectorAll(`:scope > [${SKELETON_ITEM_ATTR}]`).forEach((el) => el.remove());
  container.classList.remove('has-skeleton');
  // keepBusy is the re-render case (showSkeleton calling itself on a debounced
  // keystroke). The status node survives that so the same "Loading resources"
  // is not announced again on every character typed.
  if (keepBusy) return;
  container.classList.remove('skeleton-on-dark');
  container.removeAttribute('aria-busy');
  // Loading is over, so the node goes rather than being blanked. Leaving it
  // behind would keep the container's child count at 1 with zero results, and
  // callers test exactly that to decide whether to show their empty state —
  // article-list and resources-browser would both stop showing "no results".
  const status = container.querySelector(`:scope > [${STATUS_ATTR}]`);
  if (status) status.remove();
}

/**
 * Fill `container` with `count` placeholders and mark it busy.
 *
 * Items are appended as DIRECT children, never inside a wrapper: the container
 * is usually a grid, and a wrapper would collapse every placeholder into one
 * cell. `clearSkeleton` finds them again by attribute.
 */
export function showSkeleton(container, options = {}) {
  if (!container) return;
  const {
    count = 6,
    item = '',
    media = '',
    body = '',
    lines = ['title', 'text', 'text-sm'],
    mediaRatio = '',
    label = 'Loading',
    tone = '',
  } = options;

  clearSkeleton(container, { keepBusy: true });

  container.classList.add('has-skeleton');
  if (tone === 'dark') container.classList.add('skeleton-on-dark');
  container.setAttribute('aria-busy', 'true');

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    frag.append(createSkeletonItem(i, {
      item, media, body, lines, mediaRatio,
    }));
  }
  container.append(frag);
  // Has to run after insertion — getComputedStyle on a detached node reports
  // nothing useful, so the borrowed gap cannot be measured before this point.
  container.querySelectorAll(`:scope > [${SKELETON_ITEM_ATTR}] > .skeleton-body`)
    .forEach(applyBoneSpacing);
  syncStatus(container, label);
}

/** True when `container` is currently showing placeholders. */
export function hasSkeleton(container) {
  return Boolean(container && container.querySelector(`:scope > [${SKELETON_ITEM_ATTR}]`));
}

/** Counterpart to `showLoader`. */
export function clearLoader(container) {
  if (!container) return;
  container.querySelectorAll(':scope > .skeleton-loader').forEach((el) => el.remove());
  if (!hasSkeleton(container)) container.removeAttribute('aria-busy');
}

/**
 * Centre a beacon in a container that has no card shape worth faking. Returns
 * the wrapper so a caller can keep a reference; `clearLoader` removes it.
 */
export function showLoader(container, { label = 'Loading', size = null, tone = '' } = {}) {
  if (!container) return null;
  clearLoader(container);
  const wrap = document.createElement('div');
  wrap.className = 'skeleton-loader';
  wrap.append(createBeacon({ label, size, tone }));
  container.setAttribute('aria-busy', 'true');
  container.append(wrap);
  return wrap;
}

/**
 * Put a button into its loading state: a small inline beacon sits beside the
 * label and the button goes disabled + aria-busy. Returns the restore function,
 * so a caller can `const done = setButtonLoading(b)` and call `done()` in a
 * `finally`.
 */
export function setButtonLoading(button, { label = null } = {}) {
  if (!button) return () => {};
  const previousLabel = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-loading');
  if (label) button.textContent = label;
  const dot = document.createElement('span');
  dot.className = 'skeleton-button-beacon';
  dot.setAttribute('aria-hidden', 'true');
  button.prepend(dot);

  return () => {
    dot.remove();
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-loading');
    if (label) button.textContent = previousLabel;
  };
}
