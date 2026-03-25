import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_FIELDS = [
  'heading',
  'subheading',
  'featuredImage',
  'featuredImageAlt',
  'featuredQuote',
  'featuredName',
  'featuredTitle',
  'featuredLinkText',
  'featuredLink',
  'backgroundColor',
  'featuredCardBackgroundColor',
];

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  subheading: ['subheading', 'subtitle', 'intro'],
  featuredImageAlt: ['featured image alt', 'image alt', 'featured photo alt'],
  featuredQuote: ['featured quote', 'quote'],
  featuredName: ['featured name', 'name'],
  featuredTitle: ['featured title', 'title role', 'role'],
  featuredLinkText: ['featured link text', 'link text', 'cta text'],
  featuredLink: ['featured link', 'link', 'cta link'],
  backgroundColor: ['background color', 'section background color'],
  featuredCardBackgroundColor: [
    'featured card background color',
    'card background color',
  ],
};

const ARROW_SVG = [
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">',
  '<path d="M4.167 10h11.666M10.833 5l5 5-5 5" '
    + 'stroke="currentColor" stroke-width="1.67" '
    + 'stroke-linecap="round" stroke-linejoin="round"/>',
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

function getLinkField(scope, name) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    return {
      source,
      value: resolveLinkValue(source),
    };
  }

  return { source: null, value: '' };
}

function getRichTextField(scope, name) {
  const source = scope.querySelector(getFieldSelector(name));
  return {
    source,
    text: source?.textContent.trim() || '',
  };
}

function getImageField(scope, name) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const picture = source.tagName === 'PICTURE' ? source : source.querySelector('picture');
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return { source, picture, img };
  }

  return { source: null, picture: null, img: null };
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
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };

  return { source: null, value: '' };
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

function buildOptimizedPicture(imageField, imageAltField, width = 760) {
  if (!imageField.img) return null;

  const alt = imageAltField.value || imageField.img.alt || '';
  const optimized = createOptimizedPicture(
    imageField.img.src,
    alt,
    false,
    [{ width: `${width}` }],
  );

  const optimizedImg = optimized.querySelector('img');

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
    optimizedImg.alt = alt;
  }

  return optimized;
}

function buildLink(linkTextField, linkField, className, fallbackLabel = 'Learn More') {
  if (!linkField.value) {
    return null;
  }

  const link = document.createElement('a');
  link.className = className;
  link.href = linkField.value;
  if (linkField.source) moveInstrumentation(linkField.source, link);

  const label = document.createElement('span');
  label.className = `${className}-label`;
  const labelText = linkTextField.value || fallbackLabel;
  if (linkTextField.source) {
    moveFieldContent(linkTextField, label, labelText);
  } else {
    label.textContent = labelText;
  }

  const icon = document.createElement('span');
  icon.className = `${className}-icon`;
  icon.innerHTML = ARROW_SVG;

  link.append(label, icon);
  return link;
}

function buildHeader(headingField, subheadingField) {
  const header = document.createElement('div');
  header.className = 'leadership-overview-header';

  if (headingField.value || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'leadership-overview-heading';
    if (headingField.source) {
      moveFieldContent(headingField, heading, headingField.value);
    } else {
      heading.textContent = headingField.value;
    }
    header.append(heading);
  }

  if (subheadingField.text || subheadingField.source) {
    const subheading = document.createElement('div');
    subheading.className = 'leadership-overview-subheading';
    if (subheadingField.source) {
      moveFieldContent(subheadingField, subheading, subheadingField.text);
    } else {
      subheading.textContent = subheadingField.text;
    }
    header.append(subheading);
  }

  return header.children.length ? header : null;
}

function buildFeaturedPanel(fields) {
  const hasFeatureContent = fields.featuredImage.img
    || fields.featuredQuote.text
    || fields.featuredQuote.source
    || fields.featuredName.value
    || fields.featuredName.source
    || fields.featuredTitle.value
    || fields.featuredTitle.source
    || (
      fields.featuredLink.value
      && (fields.featuredLinkText.value || fields.featuredLinkText.source)
    );

  if (!hasFeatureContent) return null;

  const panel = document.createElement('div');
  panel.className = 'leadership-overview-feature';
  panel.style.backgroundColor = fields.featuredCardBackgroundColor.value || '#ffffff';

  const media = document.createElement('div');
  media.className = 'leadership-overview-feature-media';
  const picture = buildOptimizedPicture(fields.featuredImage, fields.featuredImageAlt, 900);
  if (picture) {
    media.append(picture);
    panel.append(media);
  } else {
    panel.classList.add('leadership-overview-feature-text-only');
  }

  const content = document.createElement('div');
  content.className = 'leadership-overview-feature-content';

  if (fields.featuredQuote.text || fields.featuredQuote.source) {
    const quote = document.createElement('div');
    quote.className = 'leadership-overview-feature-quote';
    if (fields.featuredQuote.source) {
      moveFieldContent(fields.featuredQuote, quote, fields.featuredQuote.text);
    } else {
      quote.textContent = fields.featuredQuote.text;
    }
    content.append(quote);
  }

  const meta = document.createElement('div');
  meta.className = 'leadership-overview-feature-meta';

  if (fields.featuredName.value || fields.featuredName.source) {
    const name = document.createElement('p');
    name.className = 'leadership-overview-feature-name';
    if (fields.featuredName.source) {
      moveFieldContent(fields.featuredName, name, fields.featuredName.value);
    } else {
      name.textContent = fields.featuredName.value;
    }
    meta.append(name);
  }

  if (fields.featuredTitle.value || fields.featuredTitle.source) {
    const title = document.createElement('p');
    title.className = 'leadership-overview-feature-title';
    if (fields.featuredTitle.source) {
      moveFieldContent(fields.featuredTitle, title, fields.featuredTitle.value);
    } else {
      title.textContent = fields.featuredTitle.value;
    }
    meta.append(title);
  }

  if (meta.children.length) content.append(meta);

  const link = buildLink(
    fields.featuredLinkText,
    fields.featuredLink,
    'leadership-overview-feature-link',
    'Read Bio',
  );
  if (link) content.append(link);

  panel.append(content);
  return panel;
}

function buildNavCard(row, index) {
  const titleField = readRowTextField(row, 'title', 0);
  const descriptionField = readRowTextField(row, 'description', 1);
  const linkTextField = readRowTextField(row, 'linkText', 2);
  const linkField = readRowLinkField(row, 'link', 3);
  const cardBackgroundColorField = readRowTextField(row, 'cardBackgroundColor', 4);
  const titleColorField = readRowTextField(row, 'titleColor', 5);
  const descriptionColorField = readRowTextField(row, 'descriptionColor', 6);
  const linkColorField = readRowTextField(row, 'linkColor', 7);

  if (!titleField.value && !descriptionField.value && !linkTextField.value && !linkField.value) {
    return null;
  }

  const card = document.createElement('div');
  card.className = 'leadership-overview-nav-card';
  card.dataset.index = `${index}`;
  card.style.backgroundColor = cardBackgroundColorField.value || '#00264d';
  if (row) moveInstrumentation(row, card);

  if (titleField.value || titleField.source) {
    const title = document.createElement('h3');
    title.className = 'leadership-overview-nav-card-title';
    title.style.color = titleColorField.value || '#ffffff';
    if (titleField.source) {
      moveFieldContent(titleField, title, titleField.value);
    } else {
      title.textContent = titleField.value;
    }
    card.append(title);
  }

  if (descriptionField.value || descriptionField.source) {
    const description = document.createElement('p');
    description.className = 'leadership-overview-nav-card-description';
    description.style.color = descriptionColorField.value || '#ffffff';
    if (descriptionField.source) {
      moveFieldContent(descriptionField, description, descriptionField.value);
    } else {
      description.textContent = descriptionField.value;
    }
    card.append(description);
  }

  const link = buildLink(linkTextField, linkField, 'leadership-overview-nav-card-link', 'Learn More');
  if (link) {
    link.style.color = linkColorField.value || '#00a0ca';
    card.append(link);
  }

  return card;
}

export default async function decorate(block) {
  const legacyMap = collectLegacyBlockFields(block);

  const fields = {
    heading: readBlockField(block, legacyMap, 'heading'),
    subheading: readBlockField(block, legacyMap, 'subheading', 'richtext'),
    featuredImage: getImageField(block, 'featuredImage'),
    featuredImageAlt: readBlockField(block, legacyMap, 'featuredImageAlt'),
    featuredQuote: readBlockField(block, legacyMap, 'featuredQuote', 'richtext'),
    featuredName: readBlockField(block, legacyMap, 'featuredName'),
    featuredTitle: readBlockField(block, legacyMap, 'featuredTitle'),
    featuredLinkText: readBlockField(block, legacyMap, 'featuredLinkText'),
    featuredLink: readBlockField(block, legacyMap, 'featuredLink', 'link'),
    backgroundColor: readBlockField(block, legacyMap, 'backgroundColor'),
    featuredCardBackgroundColor: readBlockField(
      block,
      legacyMap,
      'featuredCardBackgroundColor',
    ),
  };

  if (!fields.featuredLink.value) {
    fields.featuredLink.value = await getFieldValueFromResourceJson(block, 'featuredLink');
  }

  block.style.backgroundColor = fields.backgroundColor.value || '#f4f1ec';

  const inner = document.createElement('div');
  inner.className = 'leadership-overview-inner';

  const header = buildHeader(fields.heading, fields.subheading);
  if (header) inner.append(header);

  const feature = buildFeaturedPanel(fields);
  if (feature) inner.append(feature);

  const navGrid = document.createElement('div');
  navGrid.className = 'leadership-overview-nav-grid';

  const rows = [...block.querySelectorAll(':scope > div')]
    .filter(
      (row) => !BLOCK_FIELDS.some(
        (name) => row.querySelector(
          `[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`,
        ),
      ),
    );

  rows.forEach((row, index) => {
    const card = buildNavCard(row, index);
    if (card) navGrid.append(card);
  });

  if (navGrid.children.length) inner.append(navGrid);

  block.replaceChildren(inner);
}
