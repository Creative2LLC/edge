const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_MARKER_COLOR = '#f5c84b';

function normalizeMarkerTerms(value) {
  return String(value || '')
    .split(/\r?\n|\|/u)
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term, index, allTerms) => (
      allTerms.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index
    ))
    .sort((a, b) => b.length - a.length);
}

function normalizeMarkerColor(value) {
  const normalized = String(value || '').trim();
  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : DEFAULT_MARKER_COLOR;
}

function normalizeMarkerStyle(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized === 'circle' || normalized === 'underline' ? normalized : 'circle';
}

function isSkippableElement(element) {
  if (!element) return true;
  if (element.closest('.text-marker')) return true;

  return Boolean(element.closest([
    'a',
    'button',
    'script',
    'style',
    'svg',
    'textarea',
    'input',
    'select',
    'option',
  ].join(',')));
}

function getMatchAt(text, lowerText, lowerTerms, index) {
  return lowerTerms.find((entry) => (
    entry.term.length && lowerText.slice(index, index + entry.term.length) === entry.lower
  )) || null;
}

function getNextMatchIndex(lowerText, lowerTerms, startIndex) {
  let nearest = lowerText.length;

  lowerTerms.forEach((entry) => {
    const found = lowerText.indexOf(entry.lower, startIndex);
    if (found >= 0) nearest = Math.min(nearest, found);
  });

  return nearest;
}

function createMarker(text, style) {
  const marker = document.createElement('span');
  marker.className = `text-marker text-marker-${style}`;

  const content = document.createElement('span');
  content.className = 'text-marker-content';
  content.textContent = text;
  marker.append(content);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'text-marker-svg');
  svg.setAttribute('viewBox', '0 0 120 52');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'text-marker-path');
  path.setAttribute('pathLength', '1');
  path.setAttribute(
    'd',
    style === 'underline'
      ? 'M4 29 C30 23 70 36 116 25'
      : 'M15 29 C10 15 27 6 57 5 C91 4 113 15 111 29 C109 43 82 49 49 46 C24 44 8 37 15 20',
  );
  svg.append(path);
  marker.append(svg);

  return marker;
}

function wrapTextNode(node, lowerTerms, style) {
  const text = node.textContent;
  if (!text?.trim()) return false;

  const lowerText = text.toLowerCase();
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let didWrap = false;

  while (cursor < text.length) {
    const match = getMatchAt(text, lowerText, lowerTerms, cursor);
    if (!match) {
      const nextMatchIndex = getNextMatchIndex(lowerText, lowerTerms, cursor + 1);

      fragment.append(document.createTextNode(text.slice(cursor, nextMatchIndex)));
      cursor = nextMatchIndex;
    } else {
      fragment.append(createMarker(text.slice(cursor, cursor + match.term.length), style));
      cursor += match.term.length;
      didWrap = true;
    }
  }

  if (!didWrap) return false;

  node.replaceWith(fragment);
  return true;
}

function wrapMatches(root, terms, style) {
  if (!root || !terms.length) return;

  const lowerTerms = terms.map((term) => ({
    term,
    lower: term.toLowerCase(),
  }));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      if (isSkippableElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  let node = walker.nextNode();

  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }

  textNodes.forEach((textNode) => wrapTextNode(textNode, lowerTerms, style));
}

function revealMarkers(root) {
  const markers = [...root.querySelectorAll('.text-marker:not([data-marker-observed])')];
  if (!markers.length) return;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    markers.forEach((marker) => {
      marker.classList.add('is-visible');
      marker.dataset.markerObserved = 'true';
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.45,
  });

  markers.forEach((marker) => {
    marker.dataset.markerObserved = 'true';
    observer.observe(marker);
  });
}

function applyMarkerState(root, config) {
  if (!root || !config?.terms?.length) return;

  root.style.setProperty('--text-marker-color', config.color);
  root.classList.add(`has-text-marker-${config.style}`);
  wrapMatches(root, config.terms, config.style);
  revealMarkers(root);
}

export function applyAnimatedMarkers(root, options = {}) {
  const terms = normalizeMarkerTerms(options.terms);
  if (!root || !terms.length) return;

  const config = {
    terms,
    color: normalizeMarkerColor(options.color),
    style: normalizeMarkerStyle(options.style),
  };

  root.animatedMarkerConfig = config;
  applyMarkerState(root, config);

  if (root.dataset.animatedMarkerBound === 'true') return;
  root.dataset.animatedMarkerBound = 'true';
  root.addEventListener('count-up:complete', (event) => {
    const nextConfig = root.animatedMarkerConfig;
    if (!nextConfig?.terms?.length || !root.contains(event.target)) return;

    applyMarkerState(event.target, nextConfig);
  });
}

export default applyAnimatedMarkers;
