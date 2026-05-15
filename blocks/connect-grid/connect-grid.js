import { moveInstrumentation } from '../../scripts/scripts.js';
import { readImageField, readRichTextField, readTextField } from '../../scripts/block-field-utils.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  columns: 2,
};

const ITEM_COLUMN_INDEX = {
  icon: 0,
  image: 1,
  iconColor: 2,
  title: 3,
  description: 4,
  contactMethod1Label: 5,
  contactMethod1Text: 6,
  contactMethod1Link: 7,
  contactMethod2Label: 8,
  contactMethod2Text: 9,
  contactMethod2Link: 10,
  contactMethod3Label: 11,
  contactMethod3Text: 12,
  contactMethod3Link: 13,
  contactMethod4Label: 14,
  contactMethod4Text: 15,
  contactMethod4Link: 16,
  contactMethods: 17,
  cardBackgroundColor: 18,
  showDivider: 19,
  cardHoverBackgroundColor: 20,
};

const DEFAULTS = {
  columns: '3',
  iconColor: '#ff8b7e',
  cardBackgroundColor: '#f4f0ec',
  showDivider: 'show',
};

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isConnectGridItemRow(row) {
  const cols = [...row.children];
  return Boolean(
    row.querySelector('[data-aue-prop="icon"]')
      || row.querySelector('[data-aue-prop="image"]')
      || row.querySelector('[data-aue-prop="title"]')
      || row.querySelector('[data-aue-prop="contactMethods"]')
      || row.querySelector('[data-aue-prop="contactMethod1Text"]')
      || cols.length >= 5,
  );
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isConnectGridItemRow(row));
}

function getParentFallbackCell(scope, rowIndex) {
  if (!scope?.classList?.contains('connect-grid')) return null;
  const row = getParentRows(scope)[rowIndex];
  return row?.children?.[0] || row || null;
}

function getField(scope, name, rowIndexMap, columnIndex = 0) {
  const rowIndex = rowIndexMap?.[name];
  const fallbackCell = rowIndexMap === ITEM_COLUMN_INDEX
    ? scope.children[columnIndex]
    : getParentFallbackCell(scope, rowIndex);
  const field = readTextField(scope, name, { rowIndex, columnIndex, fallbackCell });
  return { ...field, source: field.source || field.cell };
}

function getRichField(scope, name, rowIndexMap, columnIndex = 0) {
  const rowIndex = rowIndexMap?.[name];
  const fallbackCell = rowIndexMap === ITEM_COLUMN_INDEX
    ? scope.children[columnIndex]
    : getParentFallbackCell(scope, rowIndex);
  const field = readRichTextField(scope, name, { rowIndex, columnIndex, fallbackCell });
  return field.source || field.cell;
}

function getImageField(scope, name, rowIndexMap, columnIndex = 0) {
  const rowIndex = rowIndexMap?.[name];
  const fallbackCell = rowIndexMap === ITEM_COLUMN_INDEX
    ? scope.children[columnIndex]
    : getParentFallbackCell(scope, rowIndex);
  const field = readImageField(scope, name, { rowIndex, columnIndex, fallbackCell });
  return { source: field.source, picture: field.picture, img: field.img };
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

function getStructuredContactMethods(row) {
  const methods = [];

  for (let index = 1; index <= 4; index += 1) {
    const labelField = getField(
      row,
      `contactMethod${index}Label`,
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX[`contactMethod${index}Label`],
    );
    const textField = getField(
      row,
      `contactMethod${index}Text`,
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX[`contactMethod${index}Text`],
    );
    const linkField = getField(
      row,
      `contactMethod${index}Link`,
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX[`contactMethod${index}Link`],
    );

    const text = textField.value || linkField.value;
    if (labelField.value || text || linkField.value) {
      methods.push({
        label: labelField.value,
        text,
        link: linkField.value,
        labelField,
        textField,
        linkField,
      });
    }
  }

  return methods;
}

function shouldUseArrow(url) {
  if (!url) return false;
  return !url.startsWith('mailto:') && !url.startsWith('tel:');
}

function shouldShowDivider(value) {
  const normalizedValue = String(value || DEFAULTS.showDivider).trim().toLowerCase();
  return !['hide', 'hidden', 'off', 'false', 'no', 'none'].includes(normalizedValue);
}

function buildMedia(item) {
  const imagePicture = item.imageField.picture?.cloneNode(true) || null;
  const imageImg = !imagePicture && item.imageField.img
    ? item.imageField.img.cloneNode(true)
    : null;
  const imageMedia = imagePicture || imageImg;
  if (imageMedia) {
    const media = document.createElement('div');
    media.className = 'connect-grid-card-media is-image';
    media.append(imageMedia);
    if (item.imageField.source) moveInstrumentation(item.imageField.source, media);
    return media;
  }

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
  icon.className = 'connect-grid-card-media is-icon';

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

  if (method.label || method.labelField?.source) {
    const label = document.createElement('p');
    label.className = 'connect-grid-method-label';
    moveFieldContent(method.labelField, label, method.label);
    wrapper.append(label);
  }

  const value = document.createElement(method.link ? 'a' : 'span');
  value.className = 'connect-grid-method-value';
  moveFieldContent(method.textField, value, method.text);

  if (method.link) {
    value.href = method.link;
    if (shouldUseArrow(method.link)) {
      value.classList.add('with-arrow');
    }
  }

  if (method.linkField?.source) {
    moveInstrumentation(method.linkField.source, value);
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
  if (item.cardHoverBackgroundColor) {
    card.classList.add('has-hover-bg');
    card.style.setProperty('--connect-grid-card-hover-bg', item.cardHoverBackgroundColor);
  }
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

  const media = buildMedia(item);
  if (media) card.append(media);

  if (item.titleField.value || item.titleField.source) {
    const title = document.createElement('h3');
    title.className = 'connect-grid-card-title';
    moveFieldContent(item.titleField, title, item.titleField.value);
    card.append(title);
  }

  const description = buildRichContent(item.descriptionSource, 'connect-grid-card-description');
  if (description) card.append(description);

  if (item.contactMethods.length) {
    if (item.showDivider) {
      const divider = document.createElement('div');
      divider.className = 'connect-grid-card-divider';
      card.append(divider);
    }

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

function setupMatchedHeights(block, grid) {
  if (typeof block.connectGridHeightCleanup === 'function') {
    block.connectGridHeightCleanup();
  }

  const cards = [...grid.querySelectorAll('.connect-grid-card:not(.is-authoring-placeholder)')];
  if (!cards.length) {
    block.connectGridHeightCleanup = null;
    return;
  }

  let frameId = 0;
  const syncHeights = () => {
    if (frameId) window.cancelAnimationFrame(frameId);

    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      cards.forEach((card) => card.style.removeProperty('--connect-grid-card-matched-height'));

      const columns = getComputedStyle(grid).gridTemplateColumns
        .split(' ')
        .filter(Boolean)
        .length;
      if (columns <= 1) return;

      const tallestHeight = Math.ceil(
        Math.max(0, ...cards.map((card) => card.getBoundingClientRect().height)),
      );

      cards.forEach((card) => {
        if (tallestHeight > 0) {
          card.style.setProperty('--connect-grid-card-matched-height', `${tallestHeight}px`);
        }
      });
    });
  };

  const onResize = () => syncHeights();
  window.addEventListener('resize', onResize, { passive: true });

  const mutationObserver = 'MutationObserver' in window
    ? new MutationObserver(() => syncHeights())
    : null;
  mutationObserver?.observe(grid, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => syncHeights())
    : null;
  cards.forEach((card) => resizeObserver?.observe(card));

  grid.querySelectorAll('img').forEach((img) => {
    if (img.complete) return;
    img.addEventListener('load', syncHeights, { once: true });
    img.addEventListener('error', syncHeights, { once: true });
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => syncHeights()).catch(() => {});
  }

  syncHeights();

  block.connectGridHeightCleanup = () => {
    if (frameId) window.cancelAnimationFrame(frameId);
    window.removeEventListener('resize', onResize);
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    cards.forEach((card) => card.style.removeProperty('--connect-grid-card-matched-height'));
  };
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const headingField = getField(block, 'heading', BLOCK_ROW_INDEX);
  const subheadingSource = getRichField(block, 'subheading', BLOCK_ROW_INDEX);
  const columnsField = getField(block, 'columns', BLOCK_ROW_INDEX);
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row, index) => {
    const isItemRow = isConnectGridItemRow(row);

    if (!isItemRow) return;

    const iconField = getImageField(row, 'icon', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.icon);
    const imageField = getImageField(row, 'image', ITEM_COLUMN_INDEX, ITEM_COLUMN_INDEX.image);
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
    const structuredContactMethods = getStructuredContactMethods(row);
    const cardBackgroundColorField = getField(
      row,
      'cardBackgroundColor',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.cardBackgroundColor,
    );
    const showDividerField = getField(
      row,
      'showDivider',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.showDivider,
    );
    const cardHoverBackgroundColorField = getField(
      row,
      'cardHoverBackgroundColor',
      ITEM_COLUMN_INDEX,
      ITEM_COLUMN_INDEX.cardHoverBackgroundColor,
    );

    if (
      !titleField.value
      && !descriptionSource
      && !contactMethodsField.value
      && !structuredContactMethods.length
    ) {
      return;
    }

    cards.push({
      iconField,
      imageField,
      iconColor: iconColorField.value,
      titleField,
      descriptionSource,
      contactMethodsField,
      contactMethods: structuredContactMethods.length
        ? structuredContactMethods
        : parseContactMethods(contactMethodsField.value),
      cardBackgroundColor: cardBackgroundColorField.value,
      showDivider: shouldShowDivider(showDividerField.value),
      cardHoverBackgroundColor: cardHoverBackgroundColorField.value,
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
  setupMatchedHeights(block, grid);
}
