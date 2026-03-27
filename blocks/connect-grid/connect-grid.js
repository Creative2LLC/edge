import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  columns: 2,
};

const ITEM_COLUMN_INDEX = {
  icon: 0,
  iconColor: 1,
  title: 2,
  description: 3,
  contactMethods: 4,
  cardBackgroundColor: 5,
};

const DEFAULTS = {
  columns: '3',
  iconColor: '#ff8b7e',
  cardBackgroundColor: '#f4f0ec',
};

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function extractNodeValue(node) {
  if (!node) return '';
  const anchor = node.tagName === 'A' ? node : node.querySelector('a');
  return anchor?.href || node.textContent.trim();
}

function getField(scope, name, rowIndexMap, columnIndex = 0) {
  const source = scope.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  if (source) return { source, value: extractNodeValue(source) };

  const rowIndex = rowIndexMap?.[name];
  const row = Number.isInteger(rowIndex) ? scope.children[rowIndex] : null;
  if (!row) return { source: null, value: '' };

  const cell = row.children[columnIndex] || row;
  return { source: cell, value: extractNodeValue(cell) };
}

function getRichField(scope, name, rowIndexMap, columnIndex = 0) {
  const source = scope.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  if (source) return source;

  const rowIndex = rowIndexMap?.[name];
  const row = Number.isInteger(rowIndex) ? scope.children[rowIndex] : null;
  if (!row) return null;

  return row.children[columnIndex] || row;
}

function getImageField(scope, name, rowIndexMap, columnIndex = 0) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const picture = source.tagName === 'PICTURE' ? source : source.querySelector('picture');
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return {
      source,
      picture: picture || null,
      img: img || picture?.querySelector('img') || null,
    };
  }

  const rowIndex = rowIndexMap?.[name];
  const row = Number.isInteger(rowIndex) ? scope.children[rowIndex] : null;
  if (!row) {
    return {
      source: null,
      picture: null,
      img: null,
    };
  }

  const cell = row.children[columnIndex] || row;
  const picture = cell.querySelector('picture');
  return {
    source: null,
    picture,
    img: cell.querySelector('img') || picture?.querySelector('img') || null,
  };
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!target) return;

  if (!field?.source) {
    target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function buildRichContent(source, className) {
  if (!source) return null;

  const content = document.createElement('div');
  content.className = className;
  moveInstrumentation(source, content);
  while (source.firstChild) content.append(source.firstChild);

  return content.childNodes.length ? content : null;
}

function parseContactMethods(value) {
  if (!value) return [];

  return value.replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());

      if (parts.length >= 3) {
        return {
          label: parts[0],
          text: parts[1],
          link: parts[2],
        };
      }

      if (parts.length === 2) {
        return {
          label: parts[0],
          text: parts[1],
          link: '',
        };
      }

      return {
        label: '',
        text: parts[0],
        link: '',
      };
    })
    .filter((method) => method.text);
}

function shouldUseArrow(url) {
  if (!url) return false;
  return !url.startsWith('mailto:') && !url.startsWith('tel:');
}

function buildIcon(item) {
  const picture = item.iconField.picture?.cloneNode(true) || null;
  const image = !picture && item.iconField.img ? item.iconField.img.cloneNode(true) : null;
  const media = picture || image;
  const mediaImage = picture?.querySelector('img') || image;
  const imgSrc = mediaImage?.currentSrc
    || mediaImage?.src
    || item.iconField.img?.currentSrc
    || item.iconField.img?.src
    || '';

  if (!media && !imgSrc) return null;

  const icon = document.createElement('div');
  icon.className = 'connect-grid-card-icon';

  if (imgSrc) {
    icon.style.setProperty('background-color', item.iconColor || DEFAULTS.iconColor, 'important');
    icon.style.setProperty('-webkit-mask-image', `url("${imgSrc}")`, 'important');
    icon.style.setProperty('mask-image', `url("${imgSrc}")`, 'important');
    icon.style.setProperty('-webkit-mask-size', 'contain', 'important');
    icon.style.setProperty('mask-size', 'contain', 'important');
    icon.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
    icon.style.setProperty('mask-repeat', 'no-repeat', 'important');
    icon.style.setProperty('-webkit-mask-position', 'center', 'important');
    icon.style.setProperty('mask-position', 'center', 'important');
    if (mediaImage) mediaImage.style.visibility = 'hidden';
  }

  if (media) {
    icon.append(media);
  }

  if (item.iconField.source) moveInstrumentation(item.iconField.source, icon);

  return icon;
}

function buildMethod(method) {
  const wrapper = document.createElement('div');
  wrapper.className = 'connect-grid-method';

  if (method.label) {
    const label = document.createElement('p');
    label.className = 'connect-grid-method-label';
    label.textContent = method.label;
    wrapper.append(label);
  }

  const value = document.createElement(method.link ? 'a' : 'span');
  value.className = 'connect-grid-method-value';
  value.textContent = method.text;

  if (method.link) {
    value.href = method.link;
    if (shouldUseArrow(method.link)) {
      value.classList.add('with-arrow');
    }
  }

  wrapper.append(value);
  return wrapper;
}

function buildCard(item, index) {
  const card = document.createElement('article');
  card.className = 'connect-grid-card connect-grid-reveal';
  card.style.setProperty('--stagger-index', index);
  card.style.setProperty(
    '--connect-grid-card-bg',
    item.cardBackgroundColor || DEFAULTS.cardBackgroundColor,
  );
  if (item.row) moveInstrumentation(item.row, card);

  if (item.isAuthoringPlaceholder) {
    card.classList.add('is-authoring-placeholder');

    const title = document.createElement('h3');
    title.className = 'connect-grid-card-title';
    title.textContent = 'New connect card';

    const body = document.createElement('p');
    body.className = 'connect-grid-card-description';
    body.textContent = 'Add an icon, description, and contact methods in Universal Editor.';

    card.append(title, body);
    return card;
  }

  const icon = buildIcon(item);
  if (icon) card.append(icon);

  if (item.titleField.value || item.titleField.source) {
    const title = document.createElement('h3');
    title.className = 'connect-grid-card-title';
    moveFieldContent(item.titleField, title, item.titleField.value);
    card.append(title);
  }

  const description = buildRichContent(item.descriptionSource, 'connect-grid-card-description');
  if (description) card.append(description);

  if (item.contactMethods.length) {
    const divider = document.createElement('div');
    divider.className = 'connect-grid-card-divider';
    card.append(divider);

    const methods = document.createElement('div');
    methods.className = 'connect-grid-methods';
    if (item.contactMethodsField.source) {
      moveInstrumentation(item.contactMethodsField.source, methods);
    }

    item.contactMethods.forEach((method) => {
      methods.append(buildMethod(method));
    });

    card.append(methods);
  }

  return card;
}

function enableReveal(block) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.some((entry) => entry.isIntersecting);
    if (!visible) return;

    block.classList.add('is-visible');
    observer.disconnect();
  }, {
    threshold: 0.18,
  });

  observer.observe(block);
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const headingField = getField(block, 'heading', BLOCK_ROW_INDEX);
  const subheadingSource = getRichField(block, 'subheading', BLOCK_ROW_INDEX);
  const columnsField = getField(block, 'columns', BLOCK_ROW_INDEX);
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row, index) => {
    const cols = [...row.children];
    const isItemRow = row.querySelector('[data-aue-prop="icon"]')
      || row.querySelector('[data-aue-prop="title"]')
      || row.querySelector('[data-aue-prop="contactMethods"]')
      || cols.length >= 5;

    if (!isItemRow) return;

    const iconField = getImageField(row, 'icon', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.icon);
    const iconColorField = getField(
      row,
      'iconColor',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.iconColor,
    );
    const titleField = getField(row, 'title', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.title);
    const descriptionSource = getRichField(
      row,
      'description',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.description,
    );
    const contactMethodsField = getField(
      row,
      'contactMethods',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.contactMethods,
    );
    const cardBackgroundColorField = getField(
      row,
      'cardBackgroundColor',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.cardBackgroundColor,
    );

    if (!titleField.value && !descriptionSource && !contactMethodsField.value) {
      return;
    }

    cards.push({
      iconField,
      iconColor: iconColorField.value,
      titleField,
      descriptionSource,
      contactMethodsField,
      contactMethods: parseContactMethods(contactMethodsField.value),
      cardBackgroundColor: cardBackgroundColorField.value,
      row,
      order: index,
    });
  });

  if (!cards.length && isAuthoring) {
    cards.push({ isAuthoringPlaceholder: true });
  }

  const inner = document.createElement('div');
  inner.className = 'connect-grid-inner';

  const header = document.createElement('div');
  header.className = 'connect-grid-header connect-grid-reveal';

  if (headingField.value || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'connect-grid-heading';
    moveFieldContent(headingField, heading, headingField.value);
    header.append(heading);
  }

  const subheading = buildRichContent(subheadingSource, 'connect-grid-subheading');
  if (subheading) header.append(subheading);

  if (header.childElementCount) inner.append(header);

  const grid = document.createElement('div');
  grid.className = 'connect-grid-cards';
  grid.style.setProperty('--connect-grid-columns', columnsField.value || DEFAULTS.columns);

  cards.forEach((card, index) => {
    grid.append(buildCard(card, index));
  });

  inner.append(grid);
  block.replaceChildren(inner);
  enableReveal(block);
}
