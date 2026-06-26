import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';
import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

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

function getSlugFromPathname() {
  const clean = window.location.pathname.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  return normalizeSlug(parts[parts.length - 1] || '');
}

function readConfig(block) {
  const rows = getBlockRows(block);

  function fieldValue(name) {
    const prop = readTextField(block, name).value || readLinkField(block, name).value;
    if (normalizeText(prop)) return normalizeText(prop);
    const colIndex = FIELD_COLUMN_INDEX[name];
    if (colIndex === undefined) return '';
    const cellValue = rows.map((row) => {
      const cell = row.children[colIndex];
      if (!cell) return '';
      const anchor = cell.querySelector('a');
      if (anchor) {
        const href = normalizeText(anchor.getAttribute('href') || '');
        if (href) return href;
      }
      return normalizeText(cell.textContent) || '';
    }).find(Boolean);
    return cellValue || '';
  }

  return {
    heading: fieldValue('heading') || 'Related Resources',
    apiBaseUrl: normalizeApiBaseUrl(fieldValue('apiBaseUrl')),
    sourceType: normalizeSourceType(fieldValue('sourceType')),
    slug: normalizeSlug(fieldValue('slug')) || getSlugFromPathname(),
    findAllLabel: fieldValue('findAllLabel') || 'Find other resources',
    findAllHref: fieldValue('findAllHref'),
    learnMoreLabel: fieldValue('learnMoreLabel') || 'Learn more',
    limit: Math.max(1, Math.min(20, parseInt(fieldValue('limit'), 10) || 8)),
    programs: fieldValue('programs'),
  };
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchItems(config) {
  const {
    apiBaseUrl, sourceType, slug, limit, programs,
  } = config;
  const locale = currentSiteLocale();

  if (sourceType === 'articles') {
    const url = new URL(`/api/articles/${encodeURIComponent(slug)}/related`, `${apiBaseUrl}/`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('locale', locale);
    const resp = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!resp.ok) return [];
    const payload = await resp.json();
    return (payload.data || []).map((a) => ({
      title: a.title,
      subtitle: a.excerpt || a.description || '',
      href: resolveSiteHref(a.page_path || a.slug || ''),
    }));
  }

  const url = new URL(`/api/resources/${encodeURIComponent(slug)}/related`, `${apiBaseUrl}/`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('locale', locale);
  if (programs) {
    programs.split(',').map((p) => p.trim()).filter(Boolean).forEach((p) => {
      url.searchParams.append('programs[]', p);
    });
  }
  const resp = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!resp.ok || resp.status === 404) {
    // Fall back to general listing filtered by program
    const listUrl = new URL('/api/resources', `${apiBaseUrl}/`);
    listUrl.searchParams.set('per_page', String(limit));
    listUrl.searchParams.set('locale', locale);
    if (programs) {
      programs.split(',').map((p) => p.trim()).filter(Boolean).forEach((p) => {
        listUrl.searchParams.append('programs[]', p);
      });
    }
    const listResp = await fetch(listUrl.toString(), { headers: { Accept: 'application/json' } });
    if (!listResp.ok) return [];
    const listPayload = await listResp.json();
    return (listPayload.data || []).map((r) => ({
      title: r.title,
      subtitle: r.excerpt || r.description || '',
      href: resolveSiteHref(r.page_path || r.resource_url || ''),
    }));
  }
  const payload = await resp.json();
  return (payload.data || []).map((r) => ({
    title: r.title,
    subtitle: r.excerpt || r.description || '',
    href: resolveSiteHref(r.page_path || r.resource_url || ''),
  }));
}

// ── DOM builders ─────────────────────────────────────────────────────────────

function buildCard(item, learnMoreLabel) {
  const slide = document.createElement('div');
  slide.className = 'resources-carousel-slide';

  const card = document.createElement('div');
  card.className = 'resources-carousel-card';

  const titleEl = document.createElement('h3');
  titleEl.className = 'resources-carousel-card-title';
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
  link.textContent = learnMoreLabel;
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
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `resources-carousel-nav-btn resources-carousel-nav-${direction}`;
  btn.setAttribute('aria-label', direction === 'prev' ? 'Previous' : 'Next');
  btn.innerHTML = direction === 'prev'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
  return btn;
}

function wireCarousel(track, prevBtn, nextBtn, progressBar) {
  const slideWidth = () => {
    const slide = track.querySelector('.resources-carousel-slide');
    if (!slide) return 0;
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    return slide.offsetWidth + gap;
  };

  const updateProgress = () => {
    const max = track.scrollWidth - track.clientWidth;
    const pct = max > 0 ? (track.scrollLeft / max) * 100 : 0;
    if (progressBar) progressBar.style.width = `${Math.min(100, pct)}%`;
    if (prevBtn) prevBtn.disabled = track.scrollLeft <= 1;
    if (nextBtn) nextBtn.disabled = track.scrollLeft >= max - 1;
  };

  prevBtn?.addEventListener('click', () => {
    track.scrollBy({ left: -slideWidth(), behavior: 'smooth' });
  });

  nextBtn?.addEventListener('click', () => {
    track.scrollBy({ left: slideWidth(), behavior: 'smooth' });
  });

  track.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
}

// ── Block entry ───────────────────────────────────────────────────────────────

export default async function decorate(block) {
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
    header.append(findAll);
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

    items.forEach((item) => track.append(buildCard(item, config.learnMoreLabel)));
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
