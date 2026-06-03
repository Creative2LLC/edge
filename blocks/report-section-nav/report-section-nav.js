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

function parseLinks(value) {
  const lines = normalizeLines(value);
  const source = lines.length ? lines : DEFAULT_LINKS;

  return source
    .map((line) => {
      const separatorIndex = line.includes('|') ? line.indexOf('|') : line.indexOf(',');
      if (separatorIndex < 0) return null;

      const label = normalizeText(line.slice(0, separatorIndex));
      const href = normalizeText(line.slice(separatorIndex + 1));
      if (!label || !href) return null;

      return { label, href };
    })
    .filter(Boolean);
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

function syncActiveLink(nav, links) {
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

  links.forEach((entry) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = entry.href;
    link.textContent = entry.label;
    link.className = 'report-section-nav-link';
    item.append(link);
    list.append(item);
  });

  nav.append(list);
  block.replaceChildren(nav);
  syncActiveLink(nav, [...nav.querySelectorAll('a[href^="#"]')]);
}
