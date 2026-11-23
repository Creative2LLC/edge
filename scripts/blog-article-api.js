/* Shared by Blog Details (article-details) and Blog Hero (blog-hero): where a
   blog's record lives in the backend, how to ask for it, and how its tags turn
   into links back into the blog listing. */
import { getMetadata } from './aem.js';

const DEFAULT_API_BASE_URL = 'https://stunning-dust-ntqeawud3dqy.on-vapor.com';

/**
 * Which listing filter each blog-taxonomy group drives.
 *
 * The same mapping article-list uses for its card pills, and it has to stay
 * that way: both ends have to agree or the link filters the wrong facet. The
 * listing reads these from the URL via readListFilterState and forwards them to
 * the API as areas[] / topics[] / story_types[] / programs[].
 */
const LISTING_FACET_BY_TAXONOMY_GROUP = {
  primary_area: 'areas',
  topic: 'topics',
  story_type: 'storyTypes',
  program_series: 'programs',
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function pathSegments(pathname) {
  return normalizeText(pathname)
    .replace(/[?#].*$/, '')
    .replace(/\.html$/i, '')
    .split('/')
    .filter(Boolean);
}

/**
 * Where to ask for this article. Page metadata wins, then the related-articles
 * block that sits further down every blog page (its API base is already
 * authored there, so a blog imported before this change still resolves), then
 * the shared default.
 */
export function resolveArticleApiBaseUrl() {
  const fromMetadata = normalizeApiBaseUrl(getMetadata('article-api-base-url'));
  if (fromMetadata) return fromMetadata;

  const siblingCell = document.querySelector('.related-articles > div:first-child > div:first-child');
  const fromSibling = normalizeApiBaseUrl(
    siblingCell?.querySelector('a')?.getAttribute('href') || siblingCell?.textContent,
  );
  if (/^https?:\/\//i.test(fromSibling)) return fromSibling;

  return DEFAULT_API_BASE_URL;
}

export function getArticleSlug(pathname = window.location.pathname) {
  const segments = pathSegments(pathname);
  const slug = segments[segments.length - 1] || '';

  try {
    return decodeURIComponent(slug);
  } catch (e) {
    return slug;
  }
}

/** True when the path has the shape of a blog: <listing>/<year>/<slug>. */
export function looksLikeBlogPath(pathname = window.location.pathname) {
  const segments = pathSegments(pathname);
  const yearIndex = segments.findIndex((segment) => /^\d{4}$/.test(segment));
  return yearIndex > 0 && yearIndex === segments.length - 2;
}

/**
 * The blog listing this article belongs to.
 *
 * Derived from the path rather than authored, because the block has no listing
 * field and adding one would mean re-authoring 397 pages. A blog lives at
 * <listing>/<year>/<slug>, so everything before the year segment is the
 * listing — which also keeps a localised path (/es/blog/...) pointing at its
 * own listing instead of the English one.
 */
export function getBlogListingPath(pathname = window.location.pathname) {
  const segments = pathSegments(pathname);
  const yearIndex = segments.findIndex((segment) => /^\d{4}$/.test(segment));
  const listing = yearIndex > 0 ? segments.slice(0, yearIndex) : segments.slice(0, -1);

  return listing.length ? `/${listing.join('/')}` : '/about/ncmec-news';
}

/** The article's backend record, or null when there is none (or no answer). */
export async function fetchArticle(slug = getArticleSlug()) {
  if (!slug) return null;

  try {
    const response = await fetch(`${resolveArticleApiBaseUrl()}/api/articles/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    return payload?.data || null;
  } catch (e) {
    return null;
  }
}

/**
 * The article's own tags, falling back to its blog taxonomy so a blog that was
 * only categorised (and never tagged) still shows something.
 *
 * Each entry carries the facet and value it filters by, not just a label — a
 * tag in the hero is a way back into the listing, so the value has to survive
 * the trip.
 */
export function articleTagEntries(article, max) {
  if (!article) return [];

  const tags = (article.tags || [])
    .map((tag) => ({
      label: normalizeText(tag?.name),
      facet: 'tags',
      value: normalizeText(tag?.slug || tag?.name),
    }))
    .filter((tag) => tag.label && tag.value);
  if (tags.length) return tags.slice(0, max);

  return (article.blog_taxonomy || [])
    .map((entry) => ({
      label: normalizeText(entry?.name),
      facet: LISTING_FACET_BY_TAXONOMY_GROUP[normalizeText(entry?.group)],
      value: normalizeText(entry?.slug),
    }))
    .filter((entry) => entry.label && entry.facet && entry.value)
    .slice(0, max);
}
