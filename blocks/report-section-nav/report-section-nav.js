import { readTextField } from '../../scripts/block-field-utils.js';

const DEFAULT_LINKS = [
  'Overview|#overview',
  'Reports|#reports',
  'Report Response|#report-response',
  'Geography|#geography',
  'Downloads|#downloads',
  'Archives|#archives',
];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function createLinkEntry(label, href) {
  const normalizedLabel = normalizeText(label);
  const normalizedHref = normalizeText(href);
  if (!normalizedLabel || !normalizedHref) return null;

  return { label: normalizedLabel, href: normalizedHref };
}

function parseLinkPairs(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const entries = [];
  const linkPattern = /(.+?)[|,]([^\s|,]+)(?=\s+[^|,]+[|,]|$)/g;
  let match = linkPattern.exec(normalized);

  while (match) {
    const entry = createLinkEntry(match[1], match[2]);
    if (entry) entries.push(entry);
    match = linkPattern.exec(normalized);
  }

  return entries;
}

function parseLinks(value) {
  const lines = normalizeLines(value);
  const source = lines.length ? lines : DEFAULT_LINKS;
  const links = source.flatMap(parseLinkPairs);

  return links.length ? links : DEFAULT_LINKS.flatMap(parseLinkPairs);
}

function readField(block, name, rowIndex, labels = []) {
  const field = readTextField(block, name, {
    rowIndex,
    labels,
  });

  return field.value;
}

function sectionForHref(href) {
  if (!href.startsWith('#')) return null;
  try {
    return document.getElementById(decodeURIComponent(href.slice(1)));
  } catch (e) {
    return null;
  }
}

function getScrollOffset() {
  const navHeight = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--nav-height') || '64',
    10,
  );
  const sectionNav = document.querySelector('.report-section-nav');
  const sectionNavHeight = sectionNav ? sectionNav.offsetHeight : 0;
  return navHeight + sectionNavHeight + 24;
}

function smoothScrollTo(target) {
  const top = target.getBoundingClientRect().top + window.scrollY - getScrollOffset();
  window.scrollTo({ top, behavior: 'smooth' });
}

function syncActiveLink(nav, links, select) {
  const sectionEntries = links
    .map((link) => ({
      link,
      section: sectionForHref(link.getAttribute('href') || ''),
    }))
    .filter((entry) => entry.section);

  if (!sectionEntries.length || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0];
    if (!visible) return;

    sectionEntries.forEach(({ link, section }) => {
      const isActive = section === visible.target;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
      if (isActive) select.value = link.getAttribute('href') || '';
    });
  }, {
    rootMargin: '-30% 0px -55% 0px',
    threshold: [0, 0.2, 0.6],
  });

  sectionEntries.forEach(({ section }) => observer.observe(section));
  nav.dataset.observing = 'true';
}

export default function decorate(block) {
  const label = readField(block, 'label', 0, ['label']) || 'Report sections';
  const linksValue = readField(block, 'links', 1, ['links', 'items']);
  const links = parseLinks(linksValue);

  const nav = document.createElement('nav');
  nav.className = 'report-section-nav-inner';
  nav.setAttribute('aria-label', label);

  const list = document.createElement('ul');
  list.className = 'report-section-nav-list';

  const select = document.createElement('select');
  select.className = 'report-section-nav-select';
  select.setAttribute('aria-label', label);

  links.forEach((entry) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = entry.href;
    link.textContent = entry.label;
    link.className = 'report-section-nav-link';

    if (entry.href.startsWith('#')) {
      link.addEventListener('click', (e) => {
        const target = sectionForHref(entry.href);
        if (!target) return;
        e.preventDefault();
        smoothScrollTo(target);
        window.history.pushState(null, '', entry.href);
      });
    }

    item.append(link);
    list.append(item);

    const option = document.createElement('option');
    option.value = entry.href;
    option.textContent = entry.label;
    select.append(option);
  });

  select.addEventListener('change', () => {
    const href = select.value;
    const target = sectionForHref(href);
    if (target) {
      smoothScrollTo(target);
      window.history.pushState(null, '', href);
      return;
    }
    window.location.assign(href);
  });

  const currentHash = window.location.hash;
  if ([...select.options].some((option) => option.value === currentHash)) {
    select.value = currentHash;
  }

  nav.append(list, select);
  block.replaceChildren(nav);
  syncActiveLink(nav, [...nav.querySelectorAll('a[href^="#"]')], select);
}
