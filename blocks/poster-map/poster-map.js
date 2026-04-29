const DEFAULTS = {
  heading: 'Interactive Search Missing Children Poster Map',
  copy: 'Welcome to the NCMEC Poster Map, where you can explore and share information to help bring missing children home. This map features only missing or unidentified child cases for which a poster was requested. Click within the map to view active cases and begin your search.',
  subheading: 'Explore the map your way!',
  standardLabel: 'Standard Map Viewer',
  standardUrl: 'https://experience.arcgis.com/experience/e3f5a6be1fe247b0be53d5a48a3f0877',
  standardCopy: 'Use the Standard Viewer to browse with ease and enjoy a helpful photo gallery.',
  advancedLabel: 'Advanced Map Viewer',
  advancedUrl: 'https://experience.arcgis.com/experience/26e6505b54f841039d2a97adc1dd5b3f',
  advancedCopy: 'The Advanced Viewer will allow you to filter by date, location, or radius.',
  image: '',
  imageAlt: '',
};

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  copy: ['copy', 'description'],
  subheading: ['subheading', 'sub heading'],
  standardLabel: ['standard label', 'standard map label'],
  standardUrl: ['standard url', 'standard map url'],
  standardCopy: ['standard copy', 'standard description'],
  advancedLabel: ['advanced label', 'advanced map label'],
  advancedUrl: ['advanced url', 'advanced map url'],
  advancedCopy: ['advanced copy', 'advanced description'],
  image: ['image', 'map image'],
  imageAlt: ['image alt', 'map image alt'],
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function getRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function getPropValue(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return '';
  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  const img = source.querySelector('img');
  return normalizeText(
    img?.getAttribute('src')
      || anchor?.getAttribute('href')
      || source.getAttribute('href')
      || source.textContent,
  );
}

function getLegacyValue(block, name, columnIndex) {
  const labels = FIELD_LABELS[name] || [];
  const row = getRows(block).find((entry) => {
    if (entry.children.length !== 2) return false;
    const label = normalizeText(entry.children[0].textContent).toLowerCase();
    return labels.some((option) => label === option || label.includes(option));
  });

  if (row) {
    const valueCell = row.children[1];
    const anchor = valueCell.querySelector('a');
    const img = valueCell.querySelector('img');
    return normalizeText(img?.getAttribute('src') || anchor?.getAttribute('href') || valueCell.textContent);
  }

  const configRow = getRows(block)[0];
  const cell = configRow ? [...configRow.children][columnIndex] : null;
  if (!cell) return '';
  const anchor = cell.querySelector('a');
  const img = cell.querySelector('img');
  return normalizeText(img?.getAttribute('src') || anchor?.getAttribute('href') || cell.textContent);
}

function getFieldValue(block, name, columnIndex, fallback = '') {
  return getPropValue(block, name) || getLegacyValue(block, name, columnIndex) || fallback;
}

function getImageFromContainer(container) {
  if (!container) return null;
  return container.closest('picture')
    || container.querySelector('picture')
    || (container.tagName === 'IMG' ? container : null)
    || container.querySelector('img');
}

function getLegacyCell(block, name, columnIndex) {
  const labels = FIELD_LABELS[name] || [];
  const row = getRows(block).find((entry) => {
    if (entry.children.length !== 2) return false;
    const label = normalizeText(entry.children[0].textContent).toLowerCase();
    return labels.some((option) => label === option || label.includes(option));
  });

  if (row) return row.children[1];

  const configRow = getRows(block)[0];
  return configRow ? [...configRow.children][columnIndex] : null;
}

function getAuthoredImage(block) {
  const source = block.querySelector('[data-aue-prop="image"]');
  const image = getImageFromContainer(source)
    || getImageFromContainer(getLegacyCell(block, 'image', 9))
    || block.querySelector('picture')
    || block.querySelector('img');

  return image ? image.cloneNode(true) : null;
}

function createViewerLink(label, href, copy) {
  const item = document.createElement('div');
  item.className = 'poster-map-viewer';

  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;

  const description = document.createElement('p');
  description.textContent = copy;

  item.append(link, description);
  return item;
}

export default function decorate(block) {
  const authoredImage = getAuthoredImage(block);
  const config = {
    heading: getFieldValue(block, 'heading', 0, DEFAULTS.heading),
    copy: getFieldValue(block, 'copy', 1, DEFAULTS.copy),
    subheading: getFieldValue(block, 'subheading', 2, DEFAULTS.subheading),
    standardLabel: getFieldValue(block, 'standardLabel', 3, DEFAULTS.standardLabel),
    standardUrl: getFieldValue(block, 'standardUrl', 4, DEFAULTS.standardUrl),
    standardCopy: getFieldValue(block, 'standardCopy', 5, DEFAULTS.standardCopy),
    advancedLabel: getFieldValue(block, 'advancedLabel', 6, DEFAULTS.advancedLabel),
    advancedUrl: getFieldValue(block, 'advancedUrl', 7, DEFAULTS.advancedUrl),
    advancedCopy: getFieldValue(block, 'advancedCopy', 8, DEFAULTS.advancedCopy),
    image: getFieldValue(block, 'image', 9, DEFAULTS.image),
    imageAlt: getFieldValue(block, 'imageAlt', 10, DEFAULTS.imageAlt),
  };

  const inner = document.createElement('div');
  inner.className = 'poster-map-inner';

  const header = document.createElement('div');
  header.className = 'poster-map-header';
  const heading = document.createElement('h2');
  heading.textContent = config.heading;
  const copy = document.createElement('p');
  copy.textContent = config.copy;
  header.append(heading, copy);

  const body = document.createElement('div');
  body.className = 'poster-map-body';

  const content = document.createElement('div');
  content.className = 'poster-map-content';
  const subheading = document.createElement('h3');
  subheading.textContent = config.subheading;
  content.append(
    subheading,
    createViewerLink(config.standardLabel, config.standardUrl, config.standardCopy),
    createViewerLink(config.advancedLabel, config.advancedUrl, config.advancedCopy),
  );

  body.append(content);

  if (authoredImage || config.image) {
    const media = document.createElement('div');
    media.className = 'poster-map-media';
    const image = authoredImage || document.createElement('img');
    const img = image.tagName === 'IMG' ? image : image.querySelector('img');
    if (!authoredImage) img.src = config.image;
    if (img) {
      img.alt = config.imageAlt;
      img.loading = 'lazy';
    }
    media.append(image);
    body.append(media);
  }

  inner.append(header, body);
  block.replaceChildren(inner);
}
