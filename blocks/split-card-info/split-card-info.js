import { createOptimizedPicture } from '../../scripts/aem.js';
import { readLinkField, readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

/**
 * Extracts a number from the start of text and returns both parts
 * Example: "20,512,803 people served" => { number: "20,512,803", text: "people served" }
 */
function parseNumberText(str) {
  if (!str) return { number: '', text: '' };

  const match = str.match(/^([\d,]+)\s*(.*)$/);
  if (match) {
    return { number: match[1], text: match[2] };
  }
  return { number: '', text: str };
}

/* ---------- AEM resource + field helpers (mirrors split-card.js) ---------- */

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
  // EDS may auto-link a hex value into an href; pull the hex back out.
  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalized) && hexMatch) {
    return hexMatch[0];
  }
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

function getRichTextField(block, name) {
  return readRichTextField(block, name).html;
}

function getLinkField(block, name) {
  return readLinkField(block, name).value;
}

/**
 * Resolve a picture for a named image field.
 * EDS sometimes places `data-aue-prop` on the cell, the <picture>, or the
 * <img> itself — walk in both directions and fall back to a positional
 * picture if nothing else matches.
 */
function getPictureFor(block, name, fallbackPicture) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  return (
    source?.closest('picture')
    || source?.querySelector('picture')
    || fallbackPicture
    || null
  );
}

/**
 * Color text fields get auto-linked by EDS (because `#abc123` looks like a
 * URL fragment) and the resulting <a> often loses its data-aue-prop marker.
 * Walk every row that has *no* data-aue-prop element and read the anchor
 * text positionally — same trick split-card.js uses.
 */
function collectOrphanedColorValues(block) {
  const values = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.querySelector('[data-aue-prop]')) return;
    const anchor = row.querySelector('a');
    if (anchor) values.push(anchor.textContent.trim());
    else values.push(row.textContent.trim());
  });
  return values;
}

/* ---------------------------------- decorate ---------------------------------- */

export default async function decorate(block) {
  const resourceData = await getBlockResourceData(block);

  // Snapshot pictures up-front so we can hand them out to mainImage/topLogo
  // before the parsed source rows are wiped.
  const allPictures = [...block.querySelectorAll('picture')];

  const mainPicture = getPictureFor(block, 'mainImage', allPictures[0]);
  const topLogoPicture = getPictureFor(
    block,
    'topLogo',
    allPictures.find((p) => p !== mainPicture) || null,
  );

  const imageSplit = getField(block, 'imageSplit') || normalizeJsonFieldValue(resourceData.imageSplit);
  const mainImageAlt = getField(block, 'mainImageAlt') || normalizeJsonFieldValue(resourceData.mainImageAlt);
  const topLogoAlt = getField(block, 'topLogoAlt') || normalizeJsonFieldValue(resourceData.topLogoAlt);
  const heading = getField(block, 'heading') || normalizeJsonFieldValue(resourceData.heading);
  const subheading = getField(block, 'subheading') || normalizeJsonFieldValue(resourceData.subheading);
  const bodyText = getRichTextField(block, 'bodyText') || normalizeJsonFieldValue(resourceData.bodyText);
  const buttonText = getField(block, 'buttonText') || normalizeJsonFieldValue(resourceData.buttonText);
  const buttonLink = getLinkField(block, 'buttonLink') || normalizeJsonFieldValue(resourceData.buttonLink);

  // Color fields: try the resource JSON first (most reliable for hex values
  // since EDS doesn't mangle them there), then DOM by name, then fall back
  // to positionally walking orphaned auto-linked rows.
  let buttonColor = normalizeColorValue(resourceData.buttonColor) || normalizeColorValue(getField(block, 'buttonColor'));
  let buttonTextColor = normalizeColorValue(resourceData.buttonTextColor) || normalizeColorValue(getField(block, 'buttonTextColor'));
  let contentBackgroundColor = normalizeColorValue(resourceData.contentBackgroundColor) || normalizeColorValue(getField(block, 'contentBackgroundColor'));

  if (!buttonColor || !buttonTextColor || !contentBackgroundColor) {
    const orphans = collectOrphanedColorValues(block);
    // The three color fields appear in this order in _split-card-info.json:
    //   buttonColor, buttonTextColor, contentBackgroundColor
    if (!buttonColor) buttonColor = normalizeColorValue(orphans[0] || '');
    if (!buttonTextColor) buttonTextColor = normalizeColorValue(orphans[1] || '');
    if (!contentBackgroundColor) contentBackgroundColor = normalizeColorValue(orphans[2] || '');
  }

  /* ---------- build the new DOM ---------- */

  const container = document.createElement('div');
  container.className = 'split-card-info-container';
  container.classList.add(imageSplit === 'third' ? 'split-card-info-third' : 'split-card-info-half');

  // Left: main image
  const mediaSection = document.createElement('div');
  mediaSection.className = 'split-card-info-media';
  if (mainPicture) {
    const img = mainPicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(
        img.src,
        mainImageAlt || img.alt || '',
        false,
        [{ width: '800' }],
      );
      mediaSection.appendChild(optimized);
    }
  }
  container.appendChild(mediaSection);

  // Right: content
  const contentSection = document.createElement('div');
  contentSection.className = 'split-card-info-content';
  if (contentBackgroundColor) {
    contentSection.style.setProperty('background-color', contentBackgroundColor, 'important');
  }

  if (topLogoPicture) {
    const logoDiv = document.createElement('div');
    logoDiv.className = 'split-card-info-logo';
    const img = topLogoPicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(
        img.src,
        topLogoAlt || img.alt || '',
        false,
        [{ width: '190' }],
      );
      logoDiv.appendChild(optimized);
    }
    contentSection.appendChild(logoDiv);
  }

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'split-card-info-heading';
    h2.textContent = heading;
    contentSection.appendChild(h2);
  }

  if (subheading) {
    const { number, text } = parseNumberText(subheading);
    const subheadingDiv = document.createElement('div');
    subheadingDiv.className = 'split-card-info-subheading';

    if (number) {
      const numberSpan = document.createElement('span');
      numberSpan.className = 'split-card-info-number';
      numberSpan.textContent = number;
      subheadingDiv.appendChild(numberSpan);

      if (text) {
        const textSpan = document.createElement('span');
        textSpan.className = 'split-card-info-text';
        textSpan.textContent = ` ${text}`;
        subheadingDiv.appendChild(textSpan);
      }
    } else {
      subheadingDiv.textContent = subheading;
    }

    contentSection.appendChild(subheadingDiv);
  }

  if (bodyText) {
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'split-card-info-body';
    bodyDiv.innerHTML = bodyText;
    contentSection.appendChild(bodyDiv);
  }

  // Button — render whenever button text exists; link is optional.
  // Use <a> when there's a real link, <span> otherwise (matches split-card.js
  // pattern; avoids native <button> styling that looks disabled).
  if (buttonText) {
    const button = document.createElement(buttonLink ? 'a' : 'span');
    button.className = 'split-card-info-button';
    if (buttonLink) button.href = buttonLink;
    button.textContent = buttonText;

    button.style.setProperty('background-color', buttonColor || '#008db6', 'important');
    button.style.setProperty('color', buttonTextColor || '#ffffff', 'important');

    contentSection.appendChild(button);
  }

  container.appendChild(contentSection);

  block.textContent = '';
  block.appendChild(container);
}
