const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_MARKER_COLOR = '#f5c84b';
let markerId = 0;

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

function parseComputedColor(value) {
  const channels = String(value || '').match(/[\d.]+/g)?.map(Number) || [];
  if (channels.length < 3) return null;

  return {
    red: channels[0],
    green: channels[1],
    blue: channels[2],
    alpha: channels[3] ?? 1,
  };
}

function hasDarkBackground(element) {
  if (!element || typeof window === 'undefined' || !window.getComputedStyle) return false;

  let current = element;
  while (current) {
    const color = parseComputedColor(window.getComputedStyle(current).backgroundColor);
    if (color && color.alpha > 0.05) {
      const luminance = (
        (0.2126 * color.red) + (0.7152 * color.green) + (0.0722 * color.blue)
      ) / 255;
      return luminance < 0.42;
    }
    current = current.parentElement;
  }

  return false;
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

function svgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);

  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, String(value));
  });

  return element;
}

function appendBrushDefs(svg, id, style) {
  const defs = svgElement('defs');
  const filter = svgElement('filter', {
    id: `${id}-roughen`,
    x: '-8%',
    y: '-18%',
    width: '116%',
    height: '136%',
    'color-interpolation-filters': 'sRGB',
  });
  const turbulence = svgElement('feTurbulence', {
    type: 'fractalNoise',
    baseFrequency: style === 'underline' ? '0.72 0.22' : '0.62 0.18',
    numOctaves: '2',
    seed: (markerId % 97) + 11,
    result: 'noise',
  });
  const displacement = svgElement('feDisplacementMap', {
    in: 'SourceGraphic',
    in2: 'noise',
    scale: style === 'underline' ? '1.1' : '1.7',
    xChannelSelector: 'R',
    yChannelSelector: 'G',
  });
  const mask = svgElement('mask', {
    id: `${id}-dry-brush`,
    maskUnits: 'userSpaceOnUse',
  });
  const maskBase = svgElement('rect', {
    x: '-8',
    y: '-8',
    width: '144',
    height: '76',
    fill: '#fff',
  });
  const scratchGroup = svgElement('g', {
    fill: 'none',
    stroke: '#000',
    'stroke-linecap': 'round',
  });
  const scratches = style === 'underline'
    ? [
      ['M6 17 C34 11 79 22 117 13', '0.026 0.016 0.06 0.032', 0.92],
      ['M4 21 C38 14 78 24 116 17', '0.018 0.022 0.04 0.026', 0.72],
      ['M18 12 C46 10 80 16 108 11', '0.035 0.018 0.02 0.03', 0.48],
    ]
    : [
      ['M25 10 C53 5 97 7 117 18', '0.028 0.017 0.07 0.028', 0.9],
      ['M9 33 C15 18 43 10 76 9 C104 9 121 18 120 29', '0.018 0.02 0.05 0.032', 0.76],
      ['M7 37 C22 50 55 53 86 47 C111 42 123 31 119 22', '0.034 0.016 0.04 0.024', 0.78],
      ['M18 45 C43 51 77 50 102 39', '0.02 0.018 0.03 0.026', 0.54],
      ['M38 7 C63 4 98 6 116 15', '0.045 0.021 0.018 0.024', 0.46],
    ];

  scratches.forEach(([pathData, dashArray, opacity], index) => {
    scratchGroup.append(svgElement('path', {
      d: pathData,
      pathLength: '1',
      'stroke-width': index === 0 ? '1.25' : '0.82',
      'stroke-dasharray': dashArray,
      opacity,
    }));
  });

  filter.append(turbulence, displacement);
  mask.append(maskBase, scratchGroup);
  defs.append(filter, mask);
  svg.append(defs);

  return {
    filter: `url(#${id}-roughen)`,
    mask: `url(#${id}-dry-brush)`,
  };
}

function markerPath(className, pathData, attributes = {}) {
  return svgElement('path', {
    class: `text-marker-path ${className}`,
    pathLength: '1',
    d: pathData,
    ...attributes,
  });
}

function appendMarkerPaths(svg, style, id) {
  const urls = appendBrushDefs(svg, id, style);
  const brush = svgElement('g', {
    class: 'text-marker-brush',
    filter: urls.filter,
    mask: urls.mask,
  });

  if (style === 'underline') {
    const underline = 'M4 20 C29 11 70 24 116 13';
    const underlineJitter = 'M5 22 C34 15 76 25 116 17';

    brush.append(
      markerPath('text-marker-path-shadow', underlineJitter),
      markerPath('text-marker-path-main', underline),
    );
    svg.append(
      brush,
      markerPath('text-marker-path-grain is-grain-a', 'M6 18 C31 11 73 22 115 14'),
      markerPath('text-marker-path-grain is-grain-b', underlineJitter),
    );
    return;
  }

  const loop = 'M25 9 C55 2 101 4 117 17 C129 29 115 43 84 49 C47 56 10 48 5 34 C1 22 21 13 54 9 C84 6 111 11 119 25 C120 10 50 4 25 9 Z';
  const outerLoop = 'M22 11 C51 4 98 5 116 17 C130 30 114 45 82 51 C46 57 9 49 4 35 C0 23 19 14 52 10 C83 7 110 12 121 25 C122 10 52 5 22 11 Z';
  const innerSkip = 'M8 35 C14 20 41 12 72 11 C101 11 119 19 119 30 C117 42 88 48 54 48 C26 48 8 42 8 35 Z';

  brush.append(
    markerPath('text-marker-path-shadow', outerLoop),
    markerPath('text-marker-path-main', loop),
  );
  svg.append(
    brush,
    markerPath('text-marker-path-grain is-grain-a', innerSkip),
    markerPath('text-marker-path-grain is-grain-b', 'M18 45 C42 52 77 51 104 39'),
    markerPath('text-marker-path-grain is-grain-c', 'M36 8 C65 4 99 7 117 16'),
  );
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
  markerId += 1;

  const marker = document.createElement('span');
  marker.className = `text-marker text-marker-${style}`;

  const content = document.createElement('span');
  content.className = 'text-marker-content';
  content.textContent = text;
  marker.append(content);

  const svg = document.createElementNS(SVG_NS, 'svg');
  const id = `text-marker-${markerId}`;

  svg.setAttribute('class', 'text-marker-svg');
  svg.setAttribute('viewBox', style === 'underline' ? '0 0 120 32' : '0 0 124 58');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  appendMarkerPaths(svg, style, id);
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
  root.classList.toggle('has-dark-text-marker-background', hasDarkBackground(root));
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
