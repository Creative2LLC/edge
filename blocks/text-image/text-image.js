import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const LEGACY_FIELD_INDEX = {
  subhead: 0,
  heading: 1,
  bodyText: 2,
  ctaText: 3,
  ctaLink: 4,
  backgroundColor: 5,
  imageAlt: 7,
  imageOverlayText: 8,
  styleVariant: 9,
};

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

function normalizeJsonFieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.href || value.path || value.url || '').trim();
  }
  return '';
}

function normalizeColorValue(value) {
  const normalized = normalizeJsonFieldValue(value);
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalized) && hexMatch) {
    return hexMatch[0];
  }

  return normalized;
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

function getLegacyFieldCell(block, name) {
  const index = LEGACY_FIELD_INDEX[name];
  if (index === undefined) return null;
  const row = block.querySelectorAll(':scope > div')[index];
  if (!row || row.querySelector('[data-aue-prop], [data-richtext-prop]')) return null;
  return row.children[0] || null;
}

function getTextField(block, name) {
  return readTextField(block, name, { fallbackCell: getLegacyFieldCell(block, name) });
}

function getLinkField(block, name) {
  return readLinkField(block, name, { fallbackCell: getLegacyFieldCell(block, name) });
}

function getRichTextField(block, name) {
  return readRichTextField(block, name, { fallbackCell: getLegacyFieldCell(block, name) });
}

function getImageField(block) {
  const field = readImageField(block, 'image');
  return {
    source: field.source,
    picture: field.picture || block.querySelector('picture'),
    img: field.img || block.querySelector('picture img'),
  };
}

function appendPlainText(wrapper, text) {
  const normalized = text.replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return;

  const paragraphs = normalized.split(/\n{2,}/u).filter(Boolean);
  const chunks = paragraphs.length ? paragraphs : [normalized];

  chunks.forEach((chunk) => {
    const paragraph = document.createElement('p');
    chunk.split('\n').forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement('br'));
      paragraph.append(document.createTextNode(line.trim()));
    });
    wrapper.append(paragraph);
  });
}

function buildTextElement(field, tagName, className) {
  if (!field.value) return null;

  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = field.value;

  if (field.source) {
    moveInstrumentation(field.source, element);
  }

  return element;
}

function buildRichTextElement(field, className) {
  if (!field.text) return null;

  const element = document.createElement('div');
  element.className = className;
  const hasElementChildren = field.source
    ? [...field.source.childNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)
    : false;

  if (field.source) {
    moveInstrumentation(field.source, element);
  }

  if (field.source && hasElementChildren) {
    while (field.source.firstChild) {
      element.append(field.source.firstChild);
    }
  } else if (field.html && /<[^>]+>/u.test(field.html)) {
    element.innerHTML = field.html;
  } else {
    appendPlainText(element, field.text);
  }

  return element.textContent.trim() ? element : null;
}

function moveText(field, element) {
  if (!field?.source) {
    element.textContent = field?.value || '';
    return;
  }

  moveInstrumentation(field.source, element);

  if (field.source.firstChild) {
    while (field.source.firstChild) {
      element.append(field.source.firstChild);
    }
  }

  if (!element.textContent.trim() && field.value) {
    element.textContent = field.value;
  }
}

function buildCta(textField, linkField) {
  if (!textField.value && !textField.source) return null;

  const href = linkField.value;
  const cta = document.createElement(href ? 'a' : 'span');
  cta.className = 'text-image-cta';

  if (href) {
    cta.href = href;
  }

  if (linkField.source) {
    moveInstrumentation(linkField.source, cta);
  }

  const label = document.createElement('span');
  label.className = 'text-image-cta-label';
  moveText(textField, label);

  if (!label.textContent.trim()) return null;

  cta.append(label);
  return cta;
}

function observeReveal(block) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    block.classList.add('is-visible');
    observer.disconnect();
  }, { threshold: 0.18 });

  observer.observe(block);
}

function buildPicture(imageField, imageAltField) {
  if (!imageField.picture || !imageField.img) return null;

  const optimized = createOptimizedPicture(
    imageField.img.src,
    imageAltField.value || imageField.img.alt || '',
    false,
    [{ width: '800' }],
  );
  const optimizedImg = optimized.querySelector('img');

  if (optimizedImg && imageAltField.value) {
    optimizedImg.alt = imageAltField.value;
  }

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

  if (imageAltField.source && optimizedImg) {
    moveInstrumentation(imageAltField.source, optimizedImg);
  }

  return optimized;
}

export default async function decorate(block) {
  const subheadField = getTextField(block, 'subhead');
  const headingField = getTextField(block, 'heading');
  const bodyTextField = getRichTextField(block, 'bodyText');
  const ctaTextField = getTextField(block, 'ctaText');
  const ctaLinkField = getLinkField(block, 'ctaLink');
  const backgroundColorField = getTextField(block, 'backgroundColor');
  const imageAltField = getTextField(block, 'imageAlt');
  const overlayHeaderField = getTextField(block, 'imageOverlayHeader');
  const overlayTextField = getTextField(block, 'imageOverlayText');
  const styleVariantField = getTextField(block, 'styleVariant');
  const imageField = getImageField(block);

  if (styleVariantField.value === 'variant-2') {
    block.classList.add('text-image-variant-2');
  }
  const picture = buildPicture(imageField, imageAltField);
  const sectionBackgroundColor = block.closest('.section')?.dataset.backgroundColor || '';
  const backgroundColor = normalizeColorValue(
    backgroundColorField.value || await getFieldValueFromResourceJson(block, 'backgroundColor'),
  );

  if (backgroundColor) {
    block.style.backgroundColor = backgroundColor;
  } else if (sectionBackgroundColor) {
    block.style.backgroundColor = 'transparent';
  } else {
    block.style.removeProperty('background-color');
  }

  const inner = document.createElement('div');
  inner.className = 'text-image-inner';

  const contentSide = document.createElement('div');
  contentSide.className = 'text-image-content';

  const subhead = buildTextElement(subheadField, 'p', 'text-image-subhead');
  if (subhead) contentSide.append(subhead);

  const heading = buildTextElement(headingField, 'h2', 'text-image-heading');
  if (heading) contentSide.append(heading);

  const body = buildRichTextElement(bodyTextField, 'text-image-body');
  if (body) contentSide.append(body);

  const cta = buildCta(ctaTextField, ctaLinkField);
  if (cta) contentSide.append(cta);

  inner.append(contentSide);

  const mediaSide = document.createElement('div');
  mediaSide.className = 'text-image-media';

  if (picture) {
    mediaSide.append(picture);
  }

  const overlayHeader = buildTextElement(overlayHeaderField, 'p', 'text-image-overlay-header');
  const overlayText = buildTextElement(overlayTextField, 'p', 'text-image-overlay-text');
  if ((overlayHeader || overlayText) && picture) {
    const overlay = document.createElement('div');
    overlay.className = 'text-image-overlay';
    if (overlayHeader) overlay.append(overlayHeader);
    if (overlayText) overlay.append(overlayText);
    mediaSide.append(overlay);

    requestAnimationFrame(() => {
      if (overlay.scrollHeight > overlay.clientHeight) {
        overlay.classList.add('text-small');
      }
    });
  }

  inner.append(mediaSide);
  block.replaceChildren(inner);
  observeReveal(block);
}
