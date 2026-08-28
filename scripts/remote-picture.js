import { createOptimizedPicture } from './aem.js';

/**
 * createOptimizedPicture(), but safe for images hosted somewhere else.
 *
 * `createOptimizedPicture` builds its srcset from `new URL(src).pathname` and
 * DISCARDS the origin (aem.js:487), because EDS's image optimizer only serves
 * assets from the site's own domain. Hand it a cross-origin URL and it silently
 * produces a same-origin path: a thumbnail at
 *
 *   https://publish-p171653-e1855116.adobeaemcloud.com/content/dam/.../x.jpg
 *
 * is requested as
 *
 *   /content/dam/.../x.jpg?width=800&format=webp
 *
 * on the EDS host, where nothing of the sort exists — so it 404s and the card
 * renders empty. Measured on the live site 2026-08-28: every resource thumbnail
 * was published, resolving, and returning 200 from the publish tier, while the
 * page requested it from the wrong origin entirely.
 *
 * Every backend-produced thumbnail lives on the AEM publish tier, so this is
 * not an edge case for resources — it is the normal case. `related-articles`
 * happens to work only because it assigns a plain `img.src` and never involves
 * the optimizer.
 *
 * Same-origin images keep the full optimizer treatment (webp, breakpoints);
 * cross-origin ones get a plain, correct <img>. Losing optimization on a
 * handful of thumbnails is obviously better than losing the images.
 */
/**
 * Whether the optimizer can actually serve this. A relative path is same-origin
 * by definition; an unparseable value is treated as remote so it is passed
 * through untouched rather than mangled into a broken path.
 */
export function isSameOrigin(src) {
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function createRemoteSafePicture(src, alt = '', eager = false, breakpoints = undefined) {
  const value = typeof src === 'string' ? src.trim() : '';

  if (!value) return null;

  if (isSameOrigin(value)) {
    return breakpoints
      ? createOptimizedPicture(value, alt, eager, breakpoints)
      : createOptimizedPicture(value, alt, eager);
  }

  const picture = document.createElement('picture');
  const img = document.createElement('img');
  img.src = value;
  img.alt = alt;
  img.loading = eager ? 'eager' : 'lazy';
  picture.append(img);

  return picture;
}
