import { createOptimizedPicture } from '../../scripts/aem.js';

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

function normalizeSizeValue(value) {
  const normalized = normalizeJsonFieldValue(value);
  if (!normalized) return '';
  if (/^\d+(\.\d+)?$/.test(normalized)) return `${normalized}px`;
  return normalized;
}

async function getBlockResourceData(block) {
  const resource = block.getAttribute('data-aue-resource') || '';
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return {};

  try {
    const response = await fetch(`${resourcePath}.json`);
    if (!response.ok) return {};
    return await response.json();
  } catch (error) {
    return {};
  }
}

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source.textContent.trim();
  return '';
}

function getLinkField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return '';

  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  return anchor?.getAttribute('href') || source.getAttribute('href') || source.textContent.trim();
}

function getImage(block) {
  const source = block.querySelector('[data-aue-prop="image"]');
  const picture = source?.closest('picture')
    || source?.querySelector('picture')
    || block.querySelector('picture');
  if (!picture) return null;

  const img = picture.querySelector('img');
  if (!img) return picture;

  const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
  picture.replaceWith(optimized);
  return optimized;
}

/**
 * Legacy color rows may still be auto-linked by EDS into button anchors
 * without data-aue-prop markers. Preserve the existing order for those rows.
 */
function collectColorValues(block) {
  const values = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.querySelector('[data-aue-prop]')) return;
    const anchor = row.querySelector('a');
    if (anchor) {
      values.push(anchor.textContent.trim());
    }
  });

  return {
    buttonColor: values[0] || '',
    button2Color: values[1] || '',
    backgroundColor: values[2] || '',
    textColor: values[3] || '',
  };
}

function buildButton(text, href, backgroundColor) {
  if (!text && !href) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = 'split-card-button';
  button.textContent = text || 'Learn More';

  if (href) {
    button.href = href;
  }

  if (backgroundColor) {
    button.style.setProperty('background-color', backgroundColor, 'important');
  }

  return button;
}

export default async function decorate(block) {
  const wrapper = block.closest('.split-card-wrapper') || block.parentElement;
  const resourceData = await getBlockResourceData(block);
  const picture = getImage(block);

  const heading = getField(block, 'heading') || normalizeJsonFieldValue(resourceData.heading);
  const subheading = getField(block, 'subheading') || normalizeJsonFieldValue(resourceData.subheading);
  const buttonText = getField(block, 'buttonText') || normalizeJsonFieldValue(resourceData.buttonText);
  const buttonLink = getLinkField(block, 'buttonLink') || normalizeJsonFieldValue(resourceData.buttonLink);
  const button2Text = getField(block, 'button2Text') || normalizeJsonFieldValue(resourceData.button2Text);
  const button2Link = getLinkField(block, 'button2Link') || normalizeJsonFieldValue(resourceData.button2Link);
  const imageAlt = getField(block, 'imageAlt') || normalizeJsonFieldValue(resourceData.imageAlt);

  const colors = collectColorValues(block);
  const buttonColor = colors.buttonColor || normalizeColorValue(resourceData.buttonColor);
  const button2Color = colors.button2Color || normalizeColorValue(resourceData.button2Color);
  const backgroundColor = colors.backgroundColor
    || normalizeColorValue(resourceData.backgroundColor);
  const sharedTextColor = colors.textColor || normalizeColorValue(resourceData.textColor);
  const headingColor = normalizeColorValue(getField(block, 'headingColor') || resourceData.headingColor)
    || sharedTextColor;
  const subheadingColor = normalizeColorValue(
    getField(block, 'subheadingColor') || resourceData.subheadingColor,
  ) || sharedTextColor;

  const contentAlign = getField(block, 'contentAlign')
    || normalizeJsonFieldValue(resourceData.contentAlign)
    || 'left';
  const imagePosition = getField(block, 'imagePosition')
    || normalizeJsonFieldValue(resourceData.imagePosition)
    || 'left';
  const maxWidth = normalizeSizeValue(getField(block, 'maxWidth') || resourceData.maxWidth);

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAlt) img.alt = imageAlt;
  }

  if (maxWidth) {
    block.style.setProperty('--split-card-max-width', maxWidth);
    if (wrapper) {
      wrapper.style.maxWidth = 'none';
    }
  } else {
    block.style.removeProperty('--split-card-max-width');
    if (wrapper) {
      wrapper.style.removeProperty('max-width');
    }
  }

  const card = document.createElement('div');
  card.className = 'split-card-inner';
  if (imagePosition === 'right') {
    card.classList.add('split-card-image-right');
  }

  const mediaSide = document.createElement('div');
  mediaSide.className = 'split-card-media';
  if (picture) mediaSide.append(picture);
  card.append(mediaSide);

  const contentSide = document.createElement('div');
  contentSide.className = 'split-card-content';
  contentSide.style.textAlign = contentAlign;

  if (contentAlign === 'center') {
    contentSide.style.alignItems = 'center';
  } else if (contentAlign === 'right') {
    contentSide.style.alignItems = 'flex-end';
  }

  if (backgroundColor) {
    contentSide.style.setProperty('background-color', backgroundColor, 'important');
  }

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'split-card-heading';
    h2.textContent = heading;
    if (headingColor) h2.style.setProperty('color', headingColor, 'important');
    contentSide.append(h2);
  }

  if (subheading) {
    const p = document.createElement('p');
    p.className = 'split-card-subheading';
    p.textContent = subheading;
    if (subheadingColor) p.style.setProperty('color', subheadingColor, 'important');
    contentSide.append(p);
  }

  const primaryButton = buildButton(buttonText, buttonLink, buttonColor);
  const secondaryButton = buildButton(button2Text, button2Link, button2Color);

  if (primaryButton || secondaryButton) {
    const btnContainer = document.createElement('div');
    btnContainer.className = 'split-card-buttons';
    if (primaryButton && secondaryButton) {
      btnContainer.classList.add('split-card-buttons-duo');
    }

    if (primaryButton) btnContainer.append(primaryButton);
    if (secondaryButton) btnContainer.append(secondaryButton);
    contentSide.append(btnContainer);
  }

  card.append(contentSide);
  block.replaceChildren(card);
}
