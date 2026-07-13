import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField, readLinkField, readRichTextField, readTextField,
} from '../../scripts/block-field-utils.js';

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

// Fields with no authored value frequently don't get their own row in the exported
// markup at all, so a positional fallback can silently grab a completely different
// field's value. In the editor, named data-aue-prop lookup is reliable whenever a
// field actually has content, so a failed name lookup there means the field is
// genuinely empty — never fall back to a position guess in that case. Positional
// fallback is only meaningful on true published pages (see cards.js /
// colored-icon-text.js for the same pattern).
function getFieldWithFallback(block, name, fallbackIndex, isEditor) {
  const value = getField(block, name);
  if (value || isEditor) return value;
  return getFallbackText(block, fallbackIndex);
}

function getLinkFieldWithFallback(block, name, fallbackIndex, isEditor) {
  const value = getLinkField(block, name);
  if (value || isEditor) return value;
  return getFallbackLink(block, fallbackIndex);
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

function applyButtonStyle(button, backgroundColor, style, textColor) {
  const normalized = normalizeButtonStyle(style);
  const accent = backgroundColor || '#008db6';

  if (normalized === 'link') {
    button.classList.add('is-link');
    button.style.setProperty('background-color', 'transparent', 'important');
    button.style.setProperty('color', textColor || accent, 'important');
    button.style.setProperty('border', 'none', 'important');
    return;
  }

  if (normalized === 'outlined') {
    button.classList.add('is-outlined');
    button.style.setProperty('background-color', 'transparent', 'important');
    button.style.setProperty('color', textColor || accent, 'important');
    button.style.setProperty('border', `2px solid ${accent}`, 'important');
    return;
  }

  // default + solid share behavior: keep existing solid look
  if (normalized === 'solid') button.classList.add('is-solid');
  if (backgroundColor) {
    button.style.setProperty('background-color', backgroundColor, 'important');
  }
  if (textColor) {
    button.style.setProperty('color', textColor, 'important');
  }
}

function buildButton(text, href, backgroundColor, style, textColor) {
  if (!text && !href) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = 'split-card-button';
  button.textContent = text || 'Learn More';

  if (href) {
    button.href = href;
  }

  applyButtonStyle(button, backgroundColor, style, textColor);

  return button;
}

export default async function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const wrapper = block.closest('.split-card-wrapper') || block.parentElement;
  const resourceData = await getBlockResourceData(block);
  const picture = getImage(block);

  // Fallback indices below match _split-card.json's ACTUAL current field order (fields
  // were regrouped under UI tabs by a later commit, which changed this order without
  // the fixed-index reads here being updated). Order: heading(0), subheading(1),
  // image(2), imageAlt(3), imagePosition(4), imageSize(5), buttonText(6), buttonLink(7),
  // buttonColor(8), buttonStyle(9), buttonSubtext(10), button2Text(11), button2Link(12),
  // button2Color(13), button2Style(14), button2Subtext(15), backgroundColor(16),
  // headingColor(17), subheadingColor(18), textColor(19), contentAlign(20), blockSize(21),
  // maxWidth(22), stylingVariant(23).
  const heading = getFieldWithFallback(block, 'heading', 0, isEditor)
    || normalizeJsonFieldValue(resourceData.heading);
  const subheadingField = readRichTextField(block, 'subheading', {
    fallbackCell: isEditor ? null : getRowCells(block)[1],
  });
  const subheadingHtml = subheadingField.html
    || normalizeJsonFieldValue(resourceData.subheading);
  const buttonText = getFieldWithFallback(block, 'buttonText', 6, isEditor)
    || normalizeJsonFieldValue(resourceData.buttonText);
  const buttonLink = getLinkFieldWithFallback(block, 'buttonLink', 7, isEditor)
    || normalizeJsonFieldValue(resourceData.buttonLink);
  const button2Text = getFieldWithFallback(block, 'button2Text', 11, isEditor)
    || normalizeJsonFieldValue(resourceData.button2Text);
  const button2Link = getLinkFieldWithFallback(block, 'button2Link', 12, isEditor)
    || normalizeJsonFieldValue(resourceData.button2Link);
  const buttonStyle = getFieldWithFallback(block, 'buttonStyle', 9, isEditor)
    || normalizeJsonFieldValue(resourceData.buttonStyle);
  const button2Style = getFieldWithFallback(block, 'button2Style', 14, isEditor)
    || normalizeJsonFieldValue(resourceData.button2Style);
  const buttonSubtext = getField(block, 'buttonSubtext')
    || normalizeJsonFieldValue(resourceData.buttonSubtext);
  const button2Subtext = getField(block, 'button2Subtext')
    || normalizeJsonFieldValue(resourceData.button2Subtext);
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

  const contentAlign = getFieldWithFallback(block, 'contentAlign', 20, isEditor)
    || normalizeJsonFieldValue(resourceData.contentAlign)
    || 'left';
  const imagePosition = getFieldWithFallback(block, 'imagePosition', 4, isEditor)
    || normalizeJsonFieldValue(resourceData.imagePosition)
    || 'left';
  const maxWidth = normalizeSizeValue(
    getFieldWithFallback(block, 'maxWidth', 22, isEditor) || resourceData.maxWidth,
  );
  const blockSize = (getFieldWithFallback(block, 'blockSize', 21, isEditor)
    || normalizeJsonFieldValue(resourceData.blockSize) || 'normal').toLowerCase();
  const imageSize = (getFieldWithFallback(block, 'imageSize', 5, isEditor)
    || normalizeJsonFieldValue(resourceData.imageSize) || 'even').toLowerCase();
  const stylingVariant = (getFieldWithFallback(block, 'stylingVariant', 23, isEditor)
    || normalizeJsonFieldValue(resourceData.stylingVariant) || 'default').toLowerCase();

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAlt) img.alt = imageAlt;
  }

  block.classList.toggle('split-card-size-smaller', blockSize === 'smaller');
  block.classList.toggle('split-card-image-smaller', imageSize === 'smaller');
  block.classList.toggle('split-card-variant-2', stylingVariant === 'variant-2');

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

  if (subheadingHtml) {
    const sub = document.createElement('div');
    sub.className = 'split-card-subheading';
    sub.innerHTML = subheadingHtml;
    if (subheadingColor) sub.style.setProperty('color', subheadingColor, 'important');
    contentSide.append(sub);
  }

  const primaryButton = buildButton(
    buttonText,
    buttonLink,
    buttonColor,
    buttonStyle,
    sharedTextColor,
  );
  const secondaryButton = buildButton(
    button2Text,
    button2Link,
    button2Color,
    button2Style,
    sharedTextColor,
  );

  const wrapButtonWithSubtext = (button, subtext) => {
    if (!button) return null;
    const group = document.createElement('div');
    group.className = 'split-card-button-group';
    group.append(button);
    if (subtext) {
      const sub = document.createElement('span');
      sub.className = 'split-card-button-subtext';
      sub.textContent = subtext;
      group.append(sub);
    }
    return group;
  };

  const primaryGroup = wrapButtonWithSubtext(primaryButton, buttonSubtext);
  const secondaryGroup = wrapButtonWithSubtext(secondaryButton, button2Subtext);

  if (primaryGroup || secondaryGroup) {
    const btnContainer = document.createElement('div');
    btnContainer.className = 'split-card-buttons';
    if (primaryButton && secondaryButton) {
      btnContainer.classList.add('split-card-buttons-duo');
    }

    if (primaryGroup) btnContainer.append(primaryGroup);
    if (secondaryGroup) btnContainer.append(secondaryGroup);
    contentSide.append(btnContainer);
  }

  card.append(contentSide);
  block.replaceChildren(card);
}
