import { createOptimizedPicture } from '../../scripts/aem.js';

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

/**
 * Look up a field by data-aue-prop name first, then fall back to a positional row.
 * Mirrors the pattern used by cta-card-1 / job-postings — robust to however AEM
 * decides to render a given field type.
 */
function getField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  if (rows[index]) return { source: null, value: rows[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  if (rows[index]) {
    const anchor = rows[index].querySelector('a');
    return { source: null, value: anchor?.href || rows[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getImageField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  const scope = source || rows[index];
  if (!scope) return { img: null };
  return { img: scope.querySelector('img') };
}

export default function decorate(block) {
  const rows = [...block.children];

  const data = {
    imageSplit: getField(block, rows, 'imageSplit', 0).value,
    mainImage: getImageField(block, rows, 'mainImage', 1).img,
    mainImageAlt: getField(block, rows, 'mainImageAlt', 2).value,
    topLogo: getImageField(block, rows, 'topLogo', 3).img,
    topLogoAlt: getField(block, rows, 'topLogoAlt', 4).value,
    heading: getField(block, rows, 'heading', 5).value,
    subheading: getField(block, rows, 'subheading', 6).value,
    bodyText: (() => {
      const source = block.querySelector('[data-aue-prop="bodyText"]');
      if (source) return source.innerHTML;
      return rows[7]?.innerHTML || '';
    })(),
    buttonText: getField(block, rows, 'buttonText', 8).value,
    buttonLink: getLinkField(block, rows, 'buttonLink', 9).value,
    buttonColor: getField(block, rows, 'buttonColor', 10).value,
    buttonTextColor: getField(block, rows, 'buttonTextColor', 11).value,
    contentBackgroundColor: getField(block, rows, 'contentBackgroundColor', 12).value,
  };

  if (data.mainImage && !data.mainImageAlt) data.mainImageAlt = data.mainImage.alt || '';
  if (data.topLogo && !data.topLogoAlt) data.topLogoAlt = data.topLogo.alt || '';

  // Build the new structure
  const container = document.createElement('div');
  container.className = 'split-card-info-container';

  // Apply image split class
  if (data.imageSplit === 'third') {
    container.classList.add('split-card-info-third');
  } else {
    container.classList.add('split-card-info-half');
  }

  // Left side: Main image
  const mediaSection = document.createElement('div');
  mediaSection.className = 'split-card-info-media';

  if (data.mainImage) {
    const picture = createOptimizedPicture(
      data.mainImage.src,
      data.mainImageAlt,
      false,
      [{ width: '800' }],
    );
    mediaSection.appendChild(picture);
  }

  container.appendChild(mediaSection);

  // Right side: Content
  const contentSection = document.createElement('div');
  contentSection.className = 'split-card-info-content';

  // Apply background color
  if (data.contentBackgroundColor) {
    contentSection.style.backgroundColor = data.contentBackgroundColor;
  }

  // Top logo
  if (data.topLogo) {
    const logoDiv = document.createElement('div');
    logoDiv.className = 'split-card-info-logo';
    const logoPicture = createOptimizedPicture(
      data.topLogo.src,
      data.topLogoAlt,
      false,
      [{ width: '190' }],
    );
    logoDiv.appendChild(logoPicture);
    contentSection.appendChild(logoDiv);
  }

  // Heading
  if (data.heading) {
    const heading = document.createElement('h2');
    heading.className = 'split-card-info-heading';
    heading.textContent = data.heading;
    contentSection.appendChild(heading);
  }

  // Subheading with number parsing
  if (data.subheading) {
    const { number, text } = parseNumberText(data.subheading);
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
      subheadingDiv.textContent = data.subheading;
    }

    contentSection.appendChild(subheadingDiv);
  }

  // Body text
  if (data.bodyText) {
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'split-card-info-body';
    bodyDiv.innerHTML = data.bodyText;
    contentSection.appendChild(bodyDiv);
  }

  // Button — render whenever we have button text; link is optional.
  if (data.buttonText) {
    const button = document.createElement(data.buttonLink ? 'a' : 'button');
    button.className = 'split-card-info-button';
    if (data.buttonLink) {
      button.href = data.buttonLink;
    } else {
      button.type = 'button';
    }
    button.textContent = data.buttonText;

    button.style.setProperty('background-color', data.buttonColor || '#008db6', 'important');
    button.style.setProperty('color', data.buttonTextColor || '#ffffff', 'important');

    contentSection.appendChild(button);
  }

  container.appendChild(contentSection);

  // Replace block content
  block.textContent = '';
  block.appendChild(container);
}
