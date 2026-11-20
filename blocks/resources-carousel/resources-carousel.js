import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import attachDragScroll, {
  createCarouselArrow,
  getCarouselItemIndex,
  scrollToCarouselItem,
} from '../../scripts/carousel-utils.js';
import {
  applyButtonStyle,
  decorateButtonText,
  readAppendedStyles,
  takeAppendedStyleCells,
} from '../../scripts/button-utils.js';

// Row index for each field in the published AEM delivery
// (each field is one row with a single cell when data-aue-prop is stripped).
const FIELD_COLUMN_INDEX = {
  heading: 0,
  apiBaseUrl: 1,
  sourceType: 2,
  slug: 3,
  findAllLabel: 4,
  findAllHref: 5,
  learnMoreLabel: 6,
  limit: 7,
  programs: 8,
};

// Author-pinned pages, appended at the END of the model so no earlier row moves.
const PIN_FIELDS = ['pinned1', 'pinned2', 'pinned3', 'pinned4', 'pinned5', 'pinned6'];

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeSlug(value) {
  const normalized = normalizeText(value)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
  if (!normalized) return '';
  try { return decodeURIComponent(normalized); } catch { return normalized; }
}

function normalizeSourceType(value) {
  const v = normalizeText(value).toLowerCase();
  return ['articles', 'resources'].includes(v) ? v : 'resources';
}

// The library API names a resource's page `primary_url` / `detail_path`; `page_path` is
// the old name, kept for an older API. Reading only `page_path` sent every card to "#".
function resourceHref(resource) {
  return resolveSiteHref(resource.primary_url || resource.detail_path || resource.page_path
    || resource.download_url || resource.resource_url || '');
}

function getSlugFromPathname() {
  const clean = window.location.pathname.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  return normalizeSlug(parts[parts.length - 1] || '');
}

/**
 * A pinned page as the backend can match it (see ResolvesPinnedRelated). The
 * link's text is the JCR path with its original casing, which matches the
 * stored page_path exactly; the href is the lowercased public path, which also
 * resolves. Only the path is lifted out of the text, because decorateButtons
 * may have added to a lone link's label. Same reading as related-articles.
 */
function readPinnedPath(cell) {
  if (!cell) return '';
  const anchor = cell.tagName === 'A' ? cell : cell.querySelector('a');
  const text = normalizeText(anchor?.textContent || cell.textContent);
  const jcrPath = text.match(/\/content\/[^\s?#]+/)?.[0];
  if (jcrPath) return jcrPath;
  return normalizeText(anchor?.getAttribute('href')) || (text.startsWith('/') ? text : '');
}

/**
 * In the editor each pin binds by name. On a published page the pins are found
 * BY VALUE among the rows after `programs`, not by a fixed index: by now
 * takeAppendedStyleCells has removed whichever of the two style rows held a
 * value, so how far the pins sit from `programs` depends on the styles chosen.
 * The only other rows that can be left there are those styles' empty rows, and
 * an empty row reads as no pin.
 */
function readPins(block, rows) {
  const inEditor = Boolean(block.querySelector('[data-aue-prop]'));
  const cells = inEditor
    ? PIN_FIELDS.map((name) => block.querySelector(`[data-aue-prop="${name}"]`))
    : rows.slice(FIELD_COLUMN_INDEX.programs + 1).map((row) => row.children[0]);
  return [...new Set(cells.map(readPinnedPath).filter(Boolean))];
}

function readConfig(block) {
  const rows = getBlockRows(block);

  // Read a plain text field — checks data-aue-prop first, then falls back to
  // a specific row index (single-column row per field in published delivery).
  function textFieldValue(name) {
    const textVal = readTextField(block, name).value;
    if (textVal) return textVal;
    const rowIndex = FIELD_COLUMN_INDEX[name];
    if (rowIndex === undefined) return '';
    const row = rows[rowIndex];
    const cell = row?.children[0];
    return normalizeText(cell?.textContent) || '';
  }

  // Read a link field (aem-content) — must resolve href, not the link label.
  function linkFieldValue(name) {
    const linked = readLinkField(block, name);
    if (linked.source) return linked.value; // href if anchor, else text
    // Published fallback: find anchor in the row at this field's index
    const rowIndex = FIELD_COLUMN_INDEX[name];
    if (rowIndex === undefined) return '';
    const row = rows[rowIndex];
    const cell = row?.children[0];
    const anchor = cell?.querySelector('a');
    return anchor?.getAttribute('href') || normalizeText(cell?.textContent) || '';
  }

  const [findAllStyle, learnMoreStyle] = readAppendedStyles(
    block,
    ['findAllStyle', 'learnMoreStyle'],
    rows,
  );

  return {
    heading: textFieldValue('heading') || 'Related Resources',
    apiBaseUrl: normalizeApiBaseUrl(textFieldValue('apiBaseUrl')),
    sourceType: normalizeSourceType(textFieldValue('sourceType')),
    slug: normalizeSlug(textFieldValue('slug')) || getSlugFromPathname(),
    findAllLabel: textFieldValue('findAllLabel') || 'Find other resources',
    findAllHref: linkFieldValue('findAllHref'),
    learnMoreLabel: textFieldValue('learnMoreLabel') || 'Learn more',
    limit: Math.max(1, Math.min(20, parseInt(textFieldValue('limit'), 10) || 8)),
    programs: textFieldValue('programs'),
    pins: readPins(block, rows),
    findAllStyle,
    learnMoreStyle,
  };
}

// ── Fetch ────────────────────────────────────────────────────────────────────

function splitPrograms(programs) {
  return `${programs || ''}`.split(',').map((p) => p.trim()).filter(Boolean);
}

function toArticleCard(article) {
  return {
    title: article.title,
    subtitle: article.excerpt || article.description || '',
    href: resolveSiteHref(article.page_path || article.primary_url || article.slug || ''),
  };
}

function toResourceCard(resource) {
  return {
    title: resource.title,
    subtitle: resource.excerpt || resource.description || '',
    href: resourceHref(resource),
  };
}

/**
 * The page's own record, which carries its related items (`related_articles`
 * for both types): author pins first, in order, then automatic picks. This is
 * the endpoint the Related Blogs block uses. The block used to call
 * `/api/{type}/{slug}/related`, which does not exist, so Resources always fell
 * through to the newest resources and Articles always came back empty.
 * Null when the page has no record of this type (e.g. a hub page).
 */
async function fetchRelated(config, type, locale) {
  const {
    apiBaseUrl, slug, limit, programs, pins,
  } = config;
  if (!slug) return null;
  const url = new URL(`/api/${type}/${encodeURIComponent(slug)}`, `${apiBaseUrl}/`);
  url.searchParams.set('related_limit', String(limit));
  url.searchParams.set('locale', locale);
  pins.forEach((pin) => url.searchParams.append('related_pins[]', pin));
  // Narrows the automatic picks only; a pinned page always shows.
  if (type === 'resources') {
    splitPrograms(programs).forEach((p) => url.searchParams.append('related_programs[]', p));
  }
  const resp = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!resp.ok) return null;
  const payload = await resp.json();
  return payload.data?.related_articles || [];
}

// Newest items of the type (program-filtered for resources). One extra, because
// the page's own item can be in the list and is dropped.
async function fetchLatest(config, type, locale) {
  const {
    apiBaseUrl, slug, limit, programs,
  } = config;
  const url = new URL(`/api/${type}`, `${apiBaseUrl}/`);
  url.searchParams.set('per_page', String(limit + 1));
  url.searchParams.set('locale', locale);
  if (type === 'resources') {
    splitPrograms(programs).forEach((p) => url.searchParams.append('programs[]', p));
  }
  const resp = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!resp.ok) return [];
  const payload = await resp.json();
  return (payload.data || []).filter((item) => item.slug !== slug).slice(0, limit);
}

async function fetchItems(config) {
  const type = config.sourceType === 'articles' ? 'articles' : 'resources';
  const locale = currentSiteLocale();
  const items = await fetchRelated(config, type, locale)
    ?? await fetchLatest(config, type, locale);
  return items.map(type === 'articles' ? toArticleCard : toResourceCard);
}

// ── DOM builders ─────────────────────────────────────────────────────────────

function buildCard(item, learnMoreLabel, learnMoreStyle = '') {
  const slide = document.createElement('div');
  slide.className = 'resources-carousel-slide';

  const card = document.createElement('div');
  card.className = 'resources-carousel-card';

  const titleEl = document.createElement('h3');
  // Shared listing-card title size (24px), same as the blog and resource browsers.
  titleEl.className = 'resources-carousel-card-title u-card-title';
  titleEl.textContent = item.title;
  card.append(titleEl);

  if (item.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'resources-carousel-card-subtitle';
    sub.textContent = item.subtitle;
    card.append(sub);
  }

  const spacer = document.createElement('div');
  spacer.className = 'resources-carousel-spacer';
  card.append(spacer);

  const link = document.createElement('a');
  link.className = 'resources-carousel-card-link';
  link.href = item.href || '#';
  link.textContent = decorateButtonText(learnMoreLabel);
  applyButtonStyle(link, learnMoreStyle || 'text-link');
  card.append(link);

  // Cover link for full-card clickability
  const cover = document.createElement('a');
  cover.className = 'resources-carousel-card-cover';
  cover.href = item.href || '#';
  cover.setAttribute('aria-hidden', 'true');
  cover.tabIndex = -1;
  card.append(cover);

  slide.append(card);
  return slide;
}

function buildNavArrow(direction) {
  return createCarouselArrow(direction, {
    className: `resources-carousel-nav-btn resources-carousel-nav-${direction}`,
    label: direction === 'prev' ? 'Previous' : 'Next',
  });
}

function wireCarousel(track, prevBtn, nextBtn, progressBar) {
  attachDragScroll(track);

  const updateProgress = () => {
    const max = track.scrollWidth - track.clientWidth;
    const pct = max > 0 ? (track.scrollLeft / max) * 100 : 0;
    if (progressBar) progressBar.style.width = `${Math.min(100, pct)}%`;
  };

  const goToSlide = (index) => {
    const slides = [...track.children];
    if (!slides.length) return;
    const targetIndex = ((index % slides.length) + slides.length) % slides.length;
    scrollToCarouselItem(track, slides[targetIndex]);
  };

  prevBtn?.addEventListener('click', () => {
    const slides = [...track.children];
    goToSlide(getCarouselItemIndex(track, slides) - 1);
  });

  nextBtn?.addEventListener('click', () => {
    const slides = [...track.children];
    goToSlide(getCarouselItemIndex(track, slides) + 1);
  });

  track.addEventListener('scroll', updateProgress, { passive: true });
  // Defer initial state update until browser has finished layout.
  window.requestAnimationFrame(updateProgress);
}

// ── Block entry ───────────────────────────────────────────────────────────────

export default async function decorate(block) {
  // Appended style dropdowns come out of the published markup first; see button-utils.
  takeAppendedStyleCells(block);
  const config = readConfig(block);
  block.replaceChildren();

  // Header row: heading left, find-all button right
  const header = document.createElement('div');
  header.className = 'resources-carousel-header';

  const headingEl = document.createElement('h2');
  headingEl.className = 'resources-carousel-heading';
  headingEl.textContent = config.heading;
  header.append(headingEl);

  if (config.findAllHref && config.findAllLabel) {
    const findAll = document.createElement('a');
    findAll.className = 'resources-carousel-find-all';
    findAll.href = resolveSiteHref(config.findAllHref);
    findAll.textContent = config.findAllLabel;
    // The look comes from the button standard (Primary).
    header.append(applyButtonStyle(findAll, config.findAllStyle || 'primary'));
  }

  block.append(header);

  // Track
  const track = document.createElement('div');
  track.className = 'resources-carousel-track';
  block.append(track);

  // Controls: progress bar + nav arrows
  const controls = document.createElement('div');
  controls.className = 'resources-carousel-controls';

  const progressWrap = document.createElement('div');
  progressWrap.className = 'resources-carousel-progress';
  const progressBar = document.createElement('div');
  progressBar.className = 'resources-carousel-progress-bar';
  progressWrap.append(progressBar);
  controls.append(progressWrap);

  const nav = document.createElement('div');
  nav.className = 'resources-carousel-nav';
  const prevBtn = buildNavArrow('prev');
  const nextBtn = buildNavArrow('next');
  nav.append(prevBtn, nextBtn);
  controls.append(nav);

  block.append(controls);

  if (!config.apiBaseUrl) {
    track.append((() => {
      const msg = document.createElement('p');
      msg.className = 'resources-carousel-message';
      msg.textContent = 'Set an API Base URL to load resources.';
      return msg;
    })());
    return;
  }

  try {
    const items = await fetchItems(config);
    if (!items.length) {
      track.append((() => {
        const msg = document.createElement('p');
        msg.className = 'resources-carousel-message';
        msg.textContent = 'No related resources found.';
        return msg;
      })());
      return;
    }

    items.forEach((item) => {
      track.append(buildCard(item, config.learnMoreLabel, config.learnMoreStyle));
    });
    wireCarousel(track, prevBtn, nextBtn, progressBar);
  } catch {
    track.append((() => {
      const msg = document.createElement('p');
      msg.className = 'resources-carousel-message';
      msg.textContent = 'Could not load resources.';
      return msg;
    })());
  }
}
