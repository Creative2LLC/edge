import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_FIELDS = ['heading', 'ctaText', 'ctaLink', 'backgroundColor'];

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  ctaText: ['cta text', 'button text', 'link text'],
  ctaLink: ['cta link', 'button link', 'link url', 'link'],
  backgroundColor: ['background color', 'section background color'],
};

const ARROW_SVG = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.167 10h11.666M10.833 5l5 5-5 5" stroke="currentColor" stroke-width="1.67" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

function resolveLinkValue(source) {
  if (!source) return '';

  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  const href = anchor?.getAttribute('href')
    || source.getAttribute('href')
    || source.textContent.trim();

  if (href) return href;

  const resourceRef = source.getAttribute('data-aue-resource')
    || source.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';

  return resourcePathFromUrn(resourceRef);
}

function normalizeJsonFieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.href || value.path || value.url || '').trim();
  }
  return '';
}

async function getFieldValueFromResourceJson(scope, name) {
  const resource = scope.getAttribute('data-aue-resource')
    || scope.closest('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return '';

  try {
    const response = await fetch(`${resourcePath}.json`);
    if (!response.ok) return '';
    const data = await response.json();
    return normalizeJsonFieldValue(data[name]);
  } catch (error) {
    return '';
  }
}

function getTextField(scope, name) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(scope, name) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: resolveLinkValue(source) };
  return { source: null, value: '' };
}

function collectLegacyBlockFields(block) {
  const map = {};
  const rowsToRemove = [];

  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];

    Object.entries(LEGACY_BLOCK_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      const isLink = name.toLowerCase().includes('link');
      const anchor = valueEl.querySelector('a');
      map[name] = {
        source: valueEl,
        value: isLink ? anchor?.href || valueEl.textContent.trim() : valueEl.textContent.trim(),
      };
      rowsToRemove.push(row);
      return true;
    });
  });

  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function readBlockField(block, legacyMap, name, type = 'text') {
  const field = type === 'link' ? getLinkField(block, name) : getTextField(block, name);
  return field.value || field.source ? field : legacyMap[name] || { source: null, value: '' };
}

function readRowTextField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function readRowLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: resolveLinkValue(source) };
  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return {
      source: null,
      value: anchor?.getAttribute('href') || cols[index].textContent.trim(),
    };
  }
  return { source: null, value: '' };
}

function readRowImageField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const picture = source.tagName === 'PICTURE' ? source : source.querySelector('picture');
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return { source, picture, img };
  }

  const cols = [...row.children];
  if (cols[index]) {
    const picture = cols[index].querySelector('picture');
    const img = cols[index].querySelector('img');
    return { source: null, picture, img: img || null };
  }

  return { source: null, picture: null, img: null };
}

function buildOptimizedPicture(imageField, width = 320) {
  if (!imageField.img) return null;

  const optimized = createOptimizedPicture(
    imageField.img.src,
    imageField.img.alt || '',
    false,
    [{ width: `${width}` }],
  );

  const optimizedImg = optimized.querySelector('img');

  if (
    imageField.source
    && imageField.source !== imageField.picture
    && imageField.source !== imageField.img
  ) {
    moveInstrumentation(imageField.source, optimized);
  }

  if (imageField.picture && imageField.picture !== imageField.source) {
    moveInstrumentation(imageField.picture, optimized);
  }

  if (imageField.img && optimizedImg) {
    moveInstrumentation(imageField.img, optimizedImg);
  }

  return optimized;
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!field?.source || !target) {
    if (!field?.source && fallbackValue) target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);

  if (field.source.firstChild) {
    while (field.source.firstChild) target.append(field.source.firstChild);
    return;
  }

  if (fallbackValue) target.textContent = fallbackValue;
}

function buildHeading(field) {
  if (!field.value && !field.source) return null;

  const heading = document.createElement('h2');
  heading.className = 'trust-badges-heading';

  if (field.source) {
    moveFieldContent(field, heading, field.value);
  } else {
    heading.textContent = field.value;
  }

  return heading;
}

function buildCta(textField, linkField) {
  if (!textField.value && !textField.source && !linkField.value) return null;

  const cta = document.createElement(linkField.value ? 'a' : 'button');
  cta.className = 'trust-badges-cta';

  if (linkField.value) cta.href = linkField.value;
  if (!linkField.value) cta.type = 'button';
  if (linkField.source) moveInstrumentation(linkField.source, cta);

  const label = document.createElement('span');
  label.className = 'trust-badges-cta-label';
  if (textField.source) {
    moveFieldContent(textField, label, textField.value || 'Learn More');
  } else {
    label.textContent = textField.value || 'Learn More';
  }

  const icon = document.createElement('span');
  icon.className = 'trust-badges-cta-icon';
  icon.innerHTML = ARROW_SVG;

  cta.append(label, icon);
  return cta;
}

function buildBadge(row, index) {
  const logoField = readRowImageField(row, 'logo', 0);
  const captionField = readRowTextField(row, 'caption', 1);
  const linkField = readRowLinkField(row, 'badgeLink', 2);

  if (!logoField.img && !captionField.value && !captionField.source) return null;

  const badge = document.createElement(linkField.value ? 'a' : 'div');
  badge.className = 'trust-badges-item';
  badge.dataset.index = `${index}`;
  if (linkField.value) badge.href = linkField.value;
  if (linkField.source) moveInstrumentation(linkField.source, badge);
  if (row) moveInstrumentation(row, badge);

  const media = document.createElement('div');
  media.className = 'trust-badges-item-media';
  const picture = buildOptimizedPicture(logoField);
  if (picture) media.append(picture);
  badge.append(media);

  if (captionField.value || captionField.source) {
    const caption = document.createElement('p');
    caption.className = 'trust-badges-item-caption';
    if (captionField.source) {
      moveFieldContent(captionField, caption, captionField.value);
    } else {
      caption.textContent = captionField.value;
    }
    badge.append(caption);
  }

  return badge;
}

export default async function decorate(block) {
  const legacyMap = collectLegacyBlockFields(block);
  const headingField = readBlockField(block, legacyMap, 'heading');
  const ctaTextField = readBlockField(block, legacyMap, 'ctaText');
  const ctaLinkField = readBlockField(block, legacyMap, 'ctaLink', 'link');
  const backgroundColorField = readBlockField(block, legacyMap, 'backgroundColor');

  if (!ctaLinkField.value) {
    ctaLinkField.value = await getFieldValueFromResourceJson(block, 'ctaLink');
  }

  block.style.backgroundColor = backgroundColorField.value || '#ffffff';

  const inner = document.createElement('div');
  inner.className = 'trust-badges-inner';

  const header = document.createElement('div');
  header.className = 'trust-badges-header';

  const heading = buildHeading(headingField);
  if (heading) header.append(heading);

  const cta = buildCta(ctaTextField, ctaLinkField);
  if (cta) header.append(cta);

  if (header.children.length) inner.append(header);

  const grid = document.createElement('div');
  grid.className = 'trust-badges-grid';

  const rows = [...block.querySelectorAll(':scope > div')].filter((row) => !BLOCK_FIELDS.some((name) => row.querySelector(`[data-aue-prop="${name}"]`)));

  rows.forEach((row, index) => {
    const badge = buildBadge(row, index);
    if (badge) grid.append(badge);
  });

  if (grid.children.length) inner.append(grid);

  block.replaceChildren(inner);
}
