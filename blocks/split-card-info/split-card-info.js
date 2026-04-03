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

export default function decorate(block) {
  const rows = [...block.children];

  // Parse all the data from the block structure
  const data = {
    imageSplit: '',
    mainImage: null,
    mainImageAlt: '',
    topLogo: null,
    topLogoAlt: '',
    heading: '',
    subheading: '',
    bodyText: '',
    buttonText: '',
    buttonLink: '',
    buttonColor: '',
    buttonTextColor: '',
    contentBackgroundColor: '',
  };

  // Extract data from rows based on data-aue-prop attributes
  rows.forEach((row) => {
    const prop = row.querySelector('[data-aue-prop]')?.getAttribute('data-aue-prop');
    const value = row.textContent.trim();

    if (prop === 'imageSplit') data.imageSplit = value;
    else if (prop === 'mainImageAlt') data.mainImageAlt = value;
    else if (prop === 'topLogoAlt') data.topLogoAlt = value;
    else if (prop === 'heading') data.heading = value;
    else if (prop === 'subheading') data.subheading = value;
    else if (prop === 'bodyText') {
      const richTextDiv = row.querySelector('[data-aue-prop="bodyText"]');
      data.bodyText = richTextDiv?.innerHTML || value;
    } else if (prop === 'buttonText') data.buttonText = value;
    else if (prop === 'buttonLink') {
      const link = row.querySelector('a');
      data.buttonLink = link?.href || value;
    } else if (prop === 'buttonColor') data.buttonColor = value;
    else if (prop === 'buttonTextColor') data.buttonTextColor = value;
    else if (prop === 'contentBackgroundColor') data.contentBackgroundColor = value;

    // Extract images
    if (prop === 'mainImage') {
      const img = row.querySelector('img');
      if (img) {
        data.mainImage = img;
        if (!data.mainImageAlt) data.mainImageAlt = img.alt || '';
      }
    } else if (prop === 'topLogo') {
      const img = row.querySelector('img');
      if (img) {
        data.topLogo = img;
        if (!data.topLogoAlt) data.topLogoAlt = img.alt || '';
      }
    }
  });

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

  // Button
  if (data.buttonText && data.buttonLink) {
    const button = document.createElement('a');
    button.className = 'split-card-info-button';
    button.href = data.buttonLink;
    button.textContent = data.buttonText;

    if (data.buttonColor) {
      button.style.backgroundColor = data.buttonColor;
    }
    if (data.buttonTextColor) {
      button.style.color = data.buttonTextColor;
    }

    contentSection.appendChild(button);
  }

  container.appendChild(contentSection);

  // Replace block content
  block.textContent = '';
  block.appendChild(container);
}
