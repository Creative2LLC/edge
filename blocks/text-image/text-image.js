import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function getFieldSelector(name) {
  return `[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`;
}

function getTextField(block, name) {
  const source = block.querySelector(getFieldSelector(name));
  return {
    source,
    value: source?.textContent.trim() || '',
  };
}

function getRichTextField(block, name) {
  const source = block.querySelector(getFieldSelector(name));
  return {
    source,
    html: source?.innerHTML?.trim() || '',
    text: source?.textContent.trim() || '',
  };
}

function getImageField(block) {
  const source = block.querySelector('[data-aue-prop="image"]');
  const picture = source?.querySelector('picture') || block.querySelector('picture');
  const img = source?.querySelector('img') || picture?.querySelector('img');

  return { source, picture, img };
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

  if (field.source) {
    moveInstrumentation(field.source, element);
  }

  if (field.html && /<[^>]+>/u.test(field.html)) {
    element.innerHTML = field.html;
  } else {
    appendPlainText(element, field.text);
  }

  return element.textContent.trim() ? element : null;
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

export default function decorate(block) {
  const subheadField = getTextField(block, 'subhead');
  const headingField = getTextField(block, 'heading');
  const bodyTextField = getRichTextField(block, 'bodyText');
  const imageAltField = getTextField(block, 'imageAlt');
  const overlayTextField = getTextField(block, 'imageOverlayText');
  const imageField = getImageField(block);
  const picture = buildPicture(imageField, imageAltField);

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

  inner.append(contentSide);

  const mediaSide = document.createElement('div');
  mediaSide.className = 'text-image-media';

  if (picture) {
    mediaSide.append(picture);
  }

  const overlayText = buildTextElement(overlayTextField, 'p', 'text-image-overlay-text');
  if (overlayText && picture) {
    const overlay = document.createElement('div');
    overlay.className = 'text-image-overlay';
    overlay.append(overlayText);
    mediaSide.append(overlay);
  }

  inner.append(mediaSide);
  block.replaceChildren(inner);
}
