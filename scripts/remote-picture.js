import { createOptimizedPicture } from './aem.js';

const AEM_PUBLISH_ORIGIN = 'https://publish-p171653-e1855116.adobeaemcloud.com';

/**
 * Point a /content/dam/ path at the tier that actually serves it.
 *
 * DAM assets live on the AEM publish tier and are never mirrored onto the EDS
 * host, so a site-absolute `/content/dam/...` is always a 404 on *.aem.page and
 * *.aem.live. Being site-absolute is exactly what makes it dangerous here:
 * `isSameOrigin` below calls it same-origin and hands it to the optimizer,
 * which keeps it on the wrong host. Measured on /blog 2026-09-21: all nine
 * listing cards rendered an <img> with naturalWidth 0, including assets that
 * returned 200 from the publish tier.
 *
 * On an author host the DAM path already resolves against the current origin,
 * and unpublished assets exist ONLY there, so leave it untouched.
 */
export function resolveDamAssetUrl(src) {
  const value = `${src || ''}`.trim();
  if (!value) return '';
  if (typeof window !== 'undefined' && window.location.hostname.includes('adobeaemcloud.com')) {
    return value;
  }

  const match = value.match(/\/content\/dam\/[^?#"'\s]+/);
  return match ? `${AEM_PUBLISH_ORIGIN}${match[0]}` : value;
}

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
  const value = resolveDamAssetUrl(typeof src === 'string' ? src : '');

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
