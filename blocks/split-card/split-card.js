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

function getHexBrightness(value) {
  const normalized = normalizeColorValue(value);
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/iu);
  if (!match) return null;

  const hex = match[1].length === 3
    ? match[1].split('').map((char) => `${char}${char}`).join('')
    : match[1];
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);

  return (red * 299 + green * 587 + blue * 114) / 1000;
}

function isDarkHexColor(value) {
  const brightness = getHexBrightness(value);
  return brightness !== null && brightness < 145;
}

function isLightHexColor(value) {
  const brightness = getHexBrightness(value);
  return brightness !== null && brightness >= 180;
}

function isValidSizeValue(value) {
  const normalized = String(value || '').trim();
  return /^(?:\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh|vmin|vmax|ch|ex|lh|rlh)|calc\(.+\)|clamp\(.+\)|min\(.+\)|max\(.+\))$/iu
    .test(normalized);
}

function normalizeSizeValue(value) {
  const normalized = normalizeJsonFieldValue(value);
  if (!normalized) return '';
  if (/^\d+(\.\d+)?$/.test(normalized)) return `${normalized}px`;
  if (!isValidSizeValue(normalized)) return '';
  return normalized;
}

const BUTTON_STYLE_VALUES = ['default', 'solid', 'outlined', 'outline', 'link'];
const CONTENT_ALIGN_VALUES = ['left', 'center', 'right'];
const IMAGE_POSITION_VALUES = ['left', 'right'];
const IMAGE_SIZE_VALUES = ['even', 'smaller'];
const BLOCK_SIZE_VALUES = ['normal', 'smaller'];
const STYLING_VARIANT_VALUES = ['default', 'variant-2'];

const CURRENT_FIELD_INDEX = {
  heading: 0,
  subheading: 1,
  image: 2,
  imageAlt: 3,
  imagePosition: 4,
  imageSize: 5,
  buttonText: 6,
  buttonLink: 7,
  buttonColor: 8,
  buttonStyle: 9,
  buttonSubtext: 10,
  button2Text: 11,
  button2Link: 12,
  button2Color: 13,
  button2Style: 14,
  button2Subtext: 15,
  backgroundColor: 16,
  headingColor: 17,
  subheadingColor: 18,
  textColor: 19,
  contentAlign: 20,
  blockSize: 21,
  maxWidth: 22,
  stylingVariant: 23,
};

// Pages authored before the field-tab cleanup publish in the previous image-first order.
// Several optional fields do not emit rows when empty, so these indices mirror the old
// runtime fallback that matched those pages.
const LEGACY_FIELD_INDEX = {
  heading: 1,
  subheading: 2,
  buttonText: 3,
  buttonLink: 4,
  buttonStyle: 6,
  button2Text: 7,
  button2Link: 8,
  button2Style: 10,
  contentAlign: 15,
  imagePosition: 16,
  imageSize: 17,
  blockSize: 18,
  maxWidth: 19,
  stylingVariant: 20,
};

function normalizeOptionValue(value, allowedValues, fallback) {
  const normalized = normalizeJsonFieldValue(value).toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function isConfigToken(value) {
  const normalized = normalizeJsonFieldValue(value).toLowerCase();
  return [
    ...BUTTON_STYLE_VALUES,
    ...CONTENT_ALIGN_VALUES,
    ...IMAGE_POSITION_VALUES,
    ...IMAGE_SIZE_VALUES,
    ...BLOCK_SIZE_VALUES,
    ...STYLING_VARIANT_VALUES,
  ].includes(normalized)
    || isValidSizeValue(normalized)
    || normalizeColorValue(normalized).startsWith('#');
}

function normalizeButtonTextValue(value) {
  const normalized = normalizeJsonFieldValue(value);
  return isConfigToken(normalized) ? '' : normalized;
}

function normalizeLinkValue(value) {
  const normalized = normalizeJsonFieldValue(value);
  if (!normalized) return '';
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(normalized)) return '';
  if (isConfigToken(normalized)) return '';
  if (/\s/u.test(normalized)) return '';
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

function findFallbackOptionFromEnd(
  block,
  preferredIndex,
  allowedValues,
  fallback,
  honorPreferredFallback = true,
) {
  const preferred = normalizeOptionValue(getFallbackText(block, preferredIndex), allowedValues, '');
  if (preferred && (honorPreferredFallback || preferred !== fallback)) return preferred;

  const tailMatch = getRowCells(block)
    .slice()
    .reverse()
    .map((cell) => normalizeOptionValue(cell.textContent, allowedValues, ''))
    .find((value) => value && value !== fallback);

  return tailMatch || preferred || '';
}

function findFallbackOptionNear(block, preferredIndex, allowedValues, fallback) {
  const preferred = normalizeOptionValue(getFallbackText(block, preferredIndex), allowedValues, '');
  if (preferred) return preferred;

  const cells = getRowCells(block);
  const start = Math.max(0, preferredIndex - 2);
  const end = Math.min(cells.length - 1, preferredIndex + 2);
  for (let index = start; index <= end; index += 1) {
    if (index !== preferredIndex) {
      const value = normalizeOptionValue(cells[index]?.textContent, allowedValues, '');
      if (value && value !== fallback) return value;
    }
  }

  return '';
}

function findFallbackSizeFromEnd(block, preferredIndex) {
  const preferred = normalizeSizeValue(getFallbackText(block, preferredIndex));
  if (preferred) return preferred;

  return getRowCells(block)
    .slice()
    .reverse()
    .map((cell) => normalizeSizeValue(cell.textContent))
    .find(Boolean) || '';
}

function getFallbackIndexMap(block, isEditor) {
  if (isEditor) return CURRENT_FIELD_INDEX;

  const currentHeading = getFallbackText(block, CURRENT_FIELD_INDEX.heading);
  const legacyHeading = getFallbackText(block, LEGACY_FIELD_INDEX.heading);
  const currentMaxWidth = getFallbackText(block, CURRENT_FIELD_INDEX.maxWidth);
  const legacyVariant = getFallbackText(block, LEGACY_FIELD_INDEX.stylingVariant);

  if (!currentHeading && legacyHeading) return LEGACY_FIELD_INDEX;
  if (!isValidSizeValue(currentMaxWidth) && normalizeOptionValue(
    legacyVariant,
    STYLING_VARIANT_VALUES,
    '',
  )) {
    return LEGACY_FIELD_INDEX;
  }

  return CURRENT_FIELD_INDEX;
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

function extractHexColor(cell) {
  if (!cell) return '';
  const hexRe = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/iu;
  const anchor = cell.querySelector?.('a');
  const hrefMatch = anchor?.getAttribute('href')?.match(hexRe);
  if (hrefMatch) return hrefMatch[0];
  const anchorTextMatch = anchor?.textContent?.trim()?.match(hexRe);
  if (anchorTextMatch) return anchorTextMatch[0];
  const textMatch = cell.textContent?.trim()?.match(hexRe);
  return textMatch ? textMatch[0] : '';
}

/**
 * Legacy color rows may still be auto-linked by EDS into button anchors
 * without data-aue-prop markers. Preserve the existing visible order for those rows.
 */
function collectColorValues(block) {
  const values = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.querySelector('[data-aue-prop]')) return;
    const value = extractHexColor(row);
    if (value) {
      values.push(value);
    }
  });

  return { values };
}

function resolveFlattenedColors(colorValues, hasPrimaryButton, hasSecondaryButton) {
  const buttonCount = (hasPrimaryButton ? 1 : 0) + (hasSecondaryButton ? 1 : 0);
  const remaining = colorValues.slice(buttonCount);

  if (remaining.length >= 4) {
    return {
      backgroundColor: remaining[0] || '',
      headingColor: remaining[1] || '',
      subheadingColor: remaining[2] || '',
      textColor: remaining[3] || '',
    };
  }

  if (remaining.length >= 2 && isDarkHexColor(remaining[0]) && isLightHexColor(remaining[1])) {
    return {
      backgroundColor: remaining[0],
      headingColor: '',
      subheadingColor: '',
      textColor: remaining[1],
    };
  }

  if (remaining[0] && isLightHexColor(remaining[0])) {
    return {
      backgroundColor: remaining[0],
      headingColor: remaining[1] || '',
      subheadingColor: remaining[2] || '',
      textColor: '',
    };
  }

  return {
    backgroundColor: '',
    headingColor: remaining[0] || '',
    subheadingColor: remaining[1] || '',
    textColor: remaining[2] || '',
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
  const fieldIndex = getFallbackIndexMap(block, isEditor);

  // Use the selected field index map for positional live fallbacks. Author keeps using
  // data-aue-prop/resource JSON, while live can support both current and pre-tabs rows.
  const heading = getFieldWithFallback(block, 'heading', fieldIndex.heading, isEditor)
    || normalizeJsonFieldValue(resourceData.heading);
  const subheadingField = readRichTextField(block, 'subheading', {
    fallbackCell: isEditor ? null : getRowCells(block)[fieldIndex.subheading],
  });
  const subheadingHtml = subheadingField.html
    || normalizeJsonFieldValue(resourceData.subheading);
  const buttonText = normalizeButtonTextValue(getFieldWithFallback(
    block,
    'buttonText',
    fieldIndex.buttonText,
    isEditor,
  ) || resourceData.buttonText);
  const buttonLink = normalizeLinkValue(getLinkFieldWithFallback(
    block,
    'buttonLink',
    fieldIndex.buttonLink,
    isEditor,
  ) || resourceData.buttonLink);
  const button2Text = normalizeButtonTextValue(getFieldWithFallback(
    block,
    'button2Text',
    fieldIndex.button2Text,
    isEditor,
  ) || resourceData.button2Text);
  const button2Link = normalizeLinkValue(getLinkFieldWithFallback(
    block,
    'button2Link',
    fieldIndex.button2Link,
    isEditor,
  ) || resourceData.button2Link);
  const buttonStyle = normalizeOptionValue(
    getFieldWithFallback(block, 'buttonStyle', fieldIndex.buttonStyle, isEditor)
      || resourceData.buttonStyle,
    BUTTON_STYLE_VALUES,
    'default',
  );
  const button2Style = normalizeOptionValue(
    getFieldWithFallback(block, 'button2Style', fieldIndex.button2Style, isEditor)
      || resourceData.button2Style,
    BUTTON_STYLE_VALUES,
    'default',
  );
  const buttonSubtext = getField(block, 'buttonSubtext')
    || normalizeJsonFieldValue(resourceData.buttonSubtext);
  const button2Subtext = getField(block, 'button2Subtext')
    || normalizeJsonFieldValue(resourceData.button2Subtext);
  const imageAlt = getField(block, 'imageAlt') || normalizeJsonFieldValue(resourceData.imageAlt);

  const colors = collectColorValues(block);
  const colorValues = colors.values || [];
  const hasPrimaryButton = Boolean(buttonText || buttonLink);
  const hasSecondaryButton = Boolean(button2Text || button2Link);
  const flattenedColors = resolveFlattenedColors(
    colorValues,
    hasPrimaryButton,
    hasSecondaryButton,
  );
  const buttonColor = (hasPrimaryButton ? colorValues[0] : '')
    || normalizeColorValue(resourceData.buttonColor);
  const button2Color = (hasSecondaryButton ? colorValues[hasPrimaryButton ? 1 : 0] : '')
    || normalizeColorValue(resourceData.button2Color);
  const backgroundColor = normalizeColorValue(getField(block, 'backgroundColor')
    || resourceData.backgroundColor) || flattenedColors.backgroundColor;
  const sharedTextColor = normalizeColorValue(getField(block, 'textColor')
    || resourceData.textColor) || flattenedColors.textColor;
  const fallbackTextColor = !sharedTextColor && isDarkHexColor(backgroundColor) ? '#fff' : '';
  const effectiveTextColor = sharedTextColor || fallbackTextColor;
  const headingColor = normalizeColorValue(getField(block, 'headingColor') || resourceData.headingColor)
    || flattenedColors.headingColor
    || effectiveTextColor;
  const subheadingColor = normalizeColorValue(
    getField(block, 'subheadingColor') || resourceData.subheadingColor,
  ) || flattenedColors.subheadingColor || effectiveTextColor;

  const contentAlign = normalizeOptionValue(
    getFieldWithFallback(block, 'contentAlign', fieldIndex.contentAlign, isEditor)
      || resourceData.contentAlign,
    CONTENT_ALIGN_VALUES,
    'left',
  );
  const imagePosition = normalizeOptionValue(
    getField(block, 'imagePosition')
      || findFallbackOptionNear(block, fieldIndex.imagePosition, IMAGE_POSITION_VALUES, 'left')
      || resourceData.imagePosition,
    IMAGE_POSITION_VALUES,
    'left',
  );
  const maxWidth = normalizeSizeValue(
    getField(block, 'maxWidth')
      || findFallbackSizeFromEnd(block, fieldIndex.maxWidth)
      || resourceData.maxWidth,
  );
  const blockSize = normalizeOptionValue(
    getField(block, 'blockSize')
      || findFallbackOptionFromEnd(block, fieldIndex.blockSize, BLOCK_SIZE_VALUES, 'normal')
      || resourceData.blockSize,
    BLOCK_SIZE_VALUES,
    'normal',
  );
  const imageSize = normalizeOptionValue(
    getField(block, 'imageSize')
      || findFallbackOptionNear(block, fieldIndex.imageSize, IMAGE_SIZE_VALUES, 'even')
      || resourceData.imageSize,
    IMAGE_SIZE_VALUES,
    'even',
  );
  const stylingVariant = normalizeOptionValue(
    getField(block, 'stylingVariant')
      || findFallbackOptionFromEnd(
        block,
        fieldIndex.stylingVariant,
        STYLING_VARIANT_VALUES,
        'default',
        false,
      )
      || resourceData.stylingVariant,
    STYLING_VARIANT_VALUES,
    'default',
  );

  if (picture) {
    const img = picture.querySelector('img');
    if (img && imageAlt) img.alt = imageAlt;
  }

  block.classList.toggle('split-card-size-smaller', blockSize === 'smaller');
  block.classList.toggle('split-card-image-smaller', imageSize === 'smaller');
  block.classList.toggle('split-card-variant-2', stylingVariant === 'variant-2');

  if (maxWidth) {
    block.style.setProperty('--split-card-max-width', maxWidth);
  } else {
    block.style.removeProperty('--split-card-max-width');
  }

  if (maxWidth || blockSize === 'smaller') {
    if (wrapper) {
      wrapper.style.maxWidth = 'none';
    }
  } else if (wrapper) {
    wrapper.style.removeProperty('max-width');
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
    effectiveTextColor,
  );
  const secondaryButton = buildButton(
    button2Text,
    button2Link,
    button2Color,
    button2Style,
    effectiveTextColor,
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
