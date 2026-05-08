import { createOptimizedPicture } from '../../scripts/aem.js';
import { readImageField, readLinkField, readTextField } from '../../scripts/block-field-utils.js';

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
  return readTextField(block, name).value;
}

function getLinkField(block, name) {
  return readLinkField(block, name).value;
}

function getRowCells(block) {
  return [...block.querySelectorAll(':scope > div')]
    .map((row) => row.children[0] || row)
    .filter(Boolean);
}

function getFallbackText(block, index) {
  return getRowCells(block)[index]?.textContent?.trim() || '';
}

function getFallbackLink(block, index) {
  const cell = getRowCells(block)[index];
  const anchor = cell?.querySelector?.('a[href]');
  return anchor?.getAttribute('href') || cell?.textContent?.trim() || '';
}

function getFieldWithFallback(block, name, fallbackIndex) {
  return getField(block, name) || getFallbackText(block, fallbackIndex);
}

function getLinkFieldWithFallback(block, name, fallbackIndex) {
  return getLinkField(block, name) || getFallbackLink(block, fallbackIndex);
}

function getImage(block) {
  const imageField = readImageField(block, 'image', {
    fallbackCell: getRowCells(block).find((cell) => cell.querySelector('picture')),
  });
  const picture = imageField.picture || block.querySelector('picture');
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
    const value = anchor?.textContent.trim() || '';
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
      values.push(value);
    }
  });

  return {
    buttonColor: values[0] || '',
    button2Color: values[1] || '',
    backgroundColor: values[2] || '',
    textColor: values[3] || '',
  };
}

function normalizeButtonStyle(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['outline', 'outlined', 'border', 'bordered'].includes(v)) return 'outlined';
  if (['solid', 'filled', 'fill'].includes(v)) return 'solid';
  if (['link', 'text', 'plain'].includes(v)) return 'link';
  return 'default';
}

function applyButtonStyle(button, backgroundColor, style) {
  const normalized = normalizeButtonStyle(style);
  const accent = backgroundColor || '#008db6';

  if (normalized === 'link') {
    button.classList.add('is-link');
    button.style.setProperty('background-color', 'transparent', 'important');
    button.style.setProperty('color', accent, 'important');
    button.style.setProperty('border', 'none', 'important');
    return;
  }

  if (normalized === 'outlined') {
    button.classList.add('is-outlined');
    button.style.setProperty('background-color', 'transparent', 'important');
    button.style.setProperty('color', accent, 'important');
    button.style.setProperty('border', `2px solid ${accent}`, 'important');
    return;
  }

  // default + solid share behavior: keep existing solid look
  if (normalized === 'solid') button.classList.add('is-solid');
  if (backgroundColor) {
    button.style.setProperty('background-color', backgroundColor, 'important');
  }
}

function buildButton(text, href, backgroundColor, style) {
  if (!text && !href) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = 'split-card-button';
  button.textContent = text || 'Learn More';

  if (href) {
    button.href = href;
  }

  applyButtonStyle(button, backgroundColor, style);

  return button;
}

export default async function decorate(block) {
  const wrapper = block.closest('.split-card-wrapper') || block.parentElement;
  const resourceData = await getBlockResourceData(block);
  const picture = getImage(block);

  const heading = getFieldWithFallback(block, 'heading', 1)
    || normalizeJsonFieldValue(resourceData.heading);
  const subheading = getFieldWithFallback(block, 'subheading', 2)
    || normalizeJsonFieldValue(resourceData.subheading);
  const buttonText = getFieldWithFallback(block, 'buttonText', 3)
    || normalizeJsonFieldValue(resourceData.buttonText);
  const buttonLink = getLinkFieldWithFallback(block, 'buttonLink', 4)
    || normalizeJsonFieldValue(resourceData.buttonLink);
  const button2Text = getFieldWithFallback(block, 'button2Text', 7)
    || normalizeJsonFieldValue(resourceData.button2Text);
  const button2Link = getLinkFieldWithFallback(block, 'button2Link', 8)
    || normalizeJsonFieldValue(resourceData.button2Link);
  const buttonStyle = getFieldWithFallback(block, 'buttonStyle', 6)
    || normalizeJsonFieldValue(resourceData.buttonStyle);
  const button2Style = getFieldWithFallback(block, 'button2Style', 10)
    || normalizeJsonFieldValue(resourceData.button2Style);
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

  const contentAlign = getFieldWithFallback(block, 'contentAlign', 15)
    || normalizeJsonFieldValue(resourceData.contentAlign)
    || 'left';
  const imagePosition = getFieldWithFallback(block, 'imagePosition', 16)
    || normalizeJsonFieldValue(resourceData.imagePosition)
    || 'left';
  const maxWidth = normalizeSizeValue(getFieldWithFallback(block, 'maxWidth', 19) || resourceData.maxWidth);
  const blockSize = (getFieldWithFallback(block, 'blockSize', 18)
    || normalizeJsonFieldValue(resourceData.blockSize) || 'normal').toLowerCase();
  const imageSize = (getFieldWithFallback(block, 'imageSize', 17)
    || normalizeJsonFieldValue(resourceData.imageSize) || 'even').toLowerCase();

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAlt) img.alt = imageAlt;
  }

  block.classList.toggle('split-card-size-smaller', blockSize === 'smaller');
  block.classList.toggle('split-card-image-smaller', imageSize === 'smaller');

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

  const primaryButton = buildButton(buttonText, buttonLink, buttonColor, buttonStyle);
  const secondaryButton = buildButton(button2Text, button2Link, button2Color, button2Style);

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
