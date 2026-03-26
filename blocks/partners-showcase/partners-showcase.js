import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_FIELDS = [
  'heading',
  'subheading',
  'ctaText',
  'ctaLink',
  'backgroundColor',
  'testimonialCardBackgroundColor',
];

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  subheading: ['subheading', 'subtitle', 'intro'],
  ctaText: ['cta text', 'button text', 'link text'],
  ctaLink: ['cta link', 'button link', 'link'],
  backgroundColor: ['background color', 'section background color'],
  testimonialCardBackgroundColor: [
    'testimonial card background color',
    'card background color',
  ],
};

const ARROW_SVG = [
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">',
  '<path d="M4.167 10h11.666M10.833 5l5 5-5 5" ',
  'stroke="currentColor" stroke-width="1.67" ',
  'stroke-linecap="round" stroke-linejoin="round"/>',
  '</svg>',
].join('');

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

function getFieldSelector(name) {
  return `[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`;
}

function getTextField(scope, name) {
  const source = scope.querySelector(getFieldSelector(name));
  return {
    source,
    value: source?.textContent.trim() || '',
  };
}

function getRichTextField(scope, name) {
  const source = scope.querySelector(getFieldSelector(name));
  return {
    source,
    text: source?.textContent.trim() || '',
  };
}

function getLinkField(scope, name) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return { source: null, value: '' };

  return {
    source,
    value: resolveLinkValue(source),
  };
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
      map[name] = {
        source: valueEl,
        value: isLink
          ? valueEl.querySelector('a')?.href || valueEl.textContent.trim()
          : valueEl.textContent.trim(),
      };
      rowsToRemove.push(row);
      return true;
    });
  });

  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function readBlockField(block, legacyMap, name, type = 'text') {
  let field;

  if (type === 'link') field = getLinkField(block, name);
  else if (type === 'richtext') field = getRichTextField(block, name);
  else field = getTextField(block, name);

  if (field.value || field.text || field.source) return field;
  return legacyMap[name] || { source: null, value: '', text: '' };
}

function readRowTextField(row, name, index) {
  const source = row.querySelector(getFieldSelector(name));
  if (source) return { source, value: source.textContent.trim() };

  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };

  return { source: null, value: '' };
}

function readRowRichTextField(row, name, index) {
  const source = row.querySelector(getFieldSelector(name));
  if (source) return { source, text: source.textContent.trim() };

  const cols = [...row.children];
  if (cols[index]) return { source: null, text: cols[index].textContent.trim() };

  return { source: null, text: '' };
}

function readRowLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    return { source, value: resolveLinkValue(source) };
  }

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

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function buildAuthoringPlaceholder(tagName, className, text) {
  const placeholder = document.createElement(tagName);
  placeholder.className = `${className} ${className}-placeholder`;
  placeholder.textContent = text;
  return placeholder;
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!field?.source || !target) {
    if (!field?.source && fallbackValue) target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function buildOptimizedPicture(imageField, altField, width = 320, instrument = true) {
  if (!imageField.img) return null;

  const alt = altField?.value || imageField.img.alt || '';
  const optimized = createOptimizedPicture(
    imageField.img.src,
    alt,
    false,
    [{ width: `${width}` }],
  );

  const optimizedImg = optimized.querySelector('img');

  if (instrument) {
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
  }

  if (optimizedImg) optimizedImg.alt = alt;
  return optimized;
}

function buildHeader(fields) {
  const header = document.createElement('div');
  header.className = 'partners-showcase-header';

  if (fields.heading.value || fields.heading.source) {
    const heading = document.createElement('h2');
    heading.className = 'partners-showcase-heading';
    if (fields.heading.source) {
      moveFieldContent(fields.heading, heading, fields.heading.value);
    } else {
      heading.textContent = fields.heading.value;
    }
    header.append(heading);
  }

  if (fields.subheading.text || fields.subheading.source) {
    const subheading = document.createElement('div');
    subheading.className = 'partners-showcase-subheading';
    if (fields.subheading.source) {
      moveFieldContent(fields.subheading, subheading, fields.subheading.text);
    } else {
      subheading.textContent = fields.subheading.text;
    }
    header.append(subheading);
  }

  return header.children.length ? header : null;
}

function buildCta(textField, linkField, fallbackLabel = 'Learn More') {
  if (!linkField.value) return null;

  const cta = document.createElement('a');
  cta.className = 'partners-showcase-cta';
  cta.href = linkField.value;
  if (linkField.source) moveInstrumentation(linkField.source, cta);

  const label = document.createElement('span');
  label.className = 'partners-showcase-cta-label';
  const labelText = textField.value || fallbackLabel;
  if (textField.source) {
    moveFieldContent(textField, label, labelText);
  } else {
    label.textContent = labelText;
  }

  const icon = document.createElement('span');
  icon.className = 'partners-showcase-cta-icon';
  icon.innerHTML = ARROW_SVG;

  cta.append(label, icon);
  return cta;
}

function buildLogoItem(data, clone = false) {
  const isAuthoringPlaceholder = !clone && hasAuthoringContext(data.row) && !data.logoField.img;
  if (!data.logoField.img && !isAuthoringPlaceholder) return null;

  const hasLink = !clone && data.logoField.img && data.logoLinkField.value;
  const item = document.createElement(hasLink ? 'a' : 'div');
  item.className = 'partners-showcase-logo-item';

  if (hasLink) item.href = data.logoLinkField.value;
  if (!clone && data.logoLinkField.source) moveInstrumentation(data.logoLinkField.source, item);
  if (!clone && data.row) moveInstrumentation(data.row, item);
  if (clone) item.setAttribute('aria-hidden', 'true');

  const picture = buildOptimizedPicture(data.logoField, data.logoAltField, 280, !clone);
  if (picture) item.append(picture);
  if (isAuthoringPlaceholder) {
    item.classList.add('is-authoring-placeholder');
    item.append(
      buildAuthoringPlaceholder('span', 'partners-showcase-item-placeholder', 'Add partner logo'),
    );
  }

  return item;
}

function buildLogoBand(logos) {
  const band = document.createElement('div');
  band.className = 'partners-showcase-logo-band';

  const marquee = document.createElement('div');
  marquee.className = 'partners-showcase-logo-marquee';

  const track = document.createElement('div');
  track.className = 'partners-showcase-logo-track';

  const originalGroup = document.createElement('div');
  originalGroup.className = 'partners-showcase-logo-group';

  logos.forEach((data) => {
    const item = buildLogoItem(data);
    if (item) originalGroup.append(item);
  });

  if (!originalGroup.children.length) return null;

  track.append(originalGroup);

  if (logos.filter((data) => data.logoField.img).length > 1) {
    band.classList.add('is-animated');

    const cloneGroup = document.createElement('div');
    cloneGroup.className = 'partners-showcase-logo-group partners-showcase-logo-group-clone';
    cloneGroup.setAttribute('aria-hidden', 'true');

    logos.forEach((data) => {
      const item = buildLogoItem(data, true);
      if (item) cloneGroup.append(item);
    });

    if (cloneGroup.children.length) track.append(cloneGroup);
  } else {
    band.classList.add('is-static');
  }

  marquee.append(track);
  band.append(marquee);
  return band;
}

function buildAttribution(nameField, titleField) {
  if (!nameField.value && !nameField.source && !titleField.value && !titleField.source) {
    return null;
  }

  const attribution = document.createElement('p');
  attribution.className = 'partners-showcase-testimonial-attribution';

  if (nameField.value || nameField.source) {
    const name = document.createElement('span');
    name.className = 'partners-showcase-testimonial-attribution-name';
    if (nameField.source) {
      moveFieldContent(nameField, name, nameField.value);
    } else {
      name.textContent = nameField.value;
    }
    attribution.append(name);
  }

  if (titleField.value || titleField.source) {
    const title = document.createElement('span');
    title.className = 'partners-showcase-testimonial-attribution-title';
    if (titleField.source) {
      moveFieldContent(titleField, title, titleField.value);
    } else {
      title.textContent = titleField.value;
    }

    if (attribution.childNodes.length) {
      attribution.append(document.createTextNode(', '));
    }
    attribution.append(title);
  }

  return attribution;
}

function buildTestimonialCard(data, cardBackgroundColor) {
  const hasVisibleContent = data.logoField.img
    || data.quoteField.text
    || data.attributionNameField.value
    || data.attributionTitleField.value;
  const isAuthoringPlaceholder = hasAuthoringContext(data.row) && !hasVisibleContent;

  if (!hasVisibleContent && !isAuthoringPlaceholder) return null;

  const card = document.createElement('article');
  card.className = 'partners-showcase-testimonial';
  card.style.backgroundColor = cardBackgroundColor;
  if (data.row) moveInstrumentation(data.row, card);

  if (isAuthoringPlaceholder) {
    card.classList.add('is-authoring-placeholder');
    card.append(
      buildAuthoringPlaceholder('p', 'partners-showcase-item-placeholder', 'Add quote, logo, and attribution'),
    );
    return card;
  }

  if (data.logoField.img) {
    const logo = document.createElement('div');
    logo.className = 'partners-showcase-testimonial-logo';
    const picture = buildOptimizedPicture(data.logoField, data.logoAltField, 240);
    if (picture) logo.append(picture);
    card.append(logo);
  }

  if (data.quoteField.text || data.quoteField.source) {
    const quote = document.createElement('div');
    quote.className = 'partners-showcase-testimonial-quote';
    if (data.quoteField.source) {
      moveFieldContent(data.quoteField, quote, data.quoteField.text);
    } else {
      quote.textContent = data.quoteField.text;
    }
    card.append(quote);
  }

  const attribution = buildAttribution(
    data.attributionNameField,
    data.attributionTitleField,
  );
  if (attribution) card.append(attribution);

  return card;
}

function normalizeItemType(rawValue, data) {
  const value = rawValue.trim().toLowerCase();
  if (value === 'testimonial' || value === 'quote') return 'testimonial';
  if (value === 'logo') return 'logo';
  if (data.quoteField.text || data.quoteField.source) return 'testimonial';
  if (data.logoField.img) return 'logo';
  if (hasAuthoringContext(data.row)) return 'logo';
  return '';
}

function createShell(className) {
  const shell = document.createElement('div');
  shell.className = `partners-showcase-shell ${className}`.trim();
  return shell;
}

export default async function decorate(block) {
  const legacyMap = collectLegacyBlockFields(block);

  const fields = {
    heading: readBlockField(block, legacyMap, 'heading'),
    subheading: readBlockField(block, legacyMap, 'subheading', 'richtext'),
    ctaText: readBlockField(block, legacyMap, 'ctaText'),
    ctaLink: readBlockField(block, legacyMap, 'ctaLink', 'link'),
    backgroundColor: readBlockField(block, legacyMap, 'backgroundColor'),
    testimonialCardBackgroundColor: readBlockField(
      block,
      legacyMap,
      'testimonialCardBackgroundColor',
    ),
  };

  if (!fields.ctaLink.value) {
    fields.ctaLink.value = await getFieldValueFromResourceJson(block, 'ctaLink');
  }

  block.style.backgroundColor = fields.backgroundColor.value || 'var(--section-background-color, #ffffff)';

  const logos = [];
  const testimonials = [];

  const rows = [...block.querySelectorAll(':scope > div')].filter(
    (row) => !BLOCK_FIELDS.some((name) => row.querySelector(getFieldSelector(name))),
  );

  rows.forEach((row) => {
    const data = {
      row,
      logoField: readRowImageField(row, 'logo', 1),
      logoAltField: readRowTextField(row, 'logoAlt', 2),
      logoLinkField: readRowLinkField(row, 'logoLink', 3),
      quoteField: readRowRichTextField(row, 'quote', 4),
      attributionNameField: readRowTextField(row, 'attributionName', 5),
      attributionTitleField: readRowTextField(row, 'attributionTitle', 6),
    };

    const itemTypeField = readRowTextField(row, 'itemType', 0);
    const itemType = normalizeItemType(itemTypeField.value, data);

    if (itemType === 'testimonial') testimonials.push(data);
    else if (itemType === 'logo') logos.push(data);
  });

  const fragments = [];

  const introShell = createShell('partners-showcase-intro-shell');
  const header = buildHeader(fields);
  if (header) introShell.append(header);
  if (introShell.children.length) fragments.push(introShell);

  const logoBand = buildLogoBand(logos);
  if (logoBand) fragments.push(logoBand);

  const contentShell = createShell('partners-showcase-content-shell');

  if (testimonials.length) {
    const testimonialsGrid = document.createElement('div');
    testimonialsGrid.className = 'partners-showcase-testimonials';
    const cardBackgroundColor = fields.testimonialCardBackgroundColor.value || '#f4f0ea';

    testimonials.forEach((data) => {
      const card = buildTestimonialCard(data, cardBackgroundColor);
      if (card) testimonialsGrid.append(card);
    });

    if (testimonialsGrid.children.length) contentShell.append(testimonialsGrid);
  }

  const cta = buildCta(fields.ctaText, fields.ctaLink, 'View All Partners');
  if (cta) {
    const footer = document.createElement('div');
    footer.className = 'partners-showcase-footer';
    footer.append(cta);
    contentShell.append(footer);
  }

  if (contentShell.children.length) fragments.push(contentShell);

  block.replaceChildren(...fragments);
}
