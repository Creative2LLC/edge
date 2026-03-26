import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  columns: 2,
};

function getBlockField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const row = block.children[rowIndex];
  if (!row) return { source: null, value: '' };

  const cell = row.children[columnIndex] || row;
  return { source: cell, value: cell.textContent.trim() };
}

function getBlockRichField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source;

  const row = block.children[rowIndex];
  if (!row) return null;
  return row.children[columnIndex] || row;
}

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }

  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return { source: null, value: anchor?.href || cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getRichField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source;

  const cols = [...row.children];
  return cols[index] || null;
}

function getImageField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const picture = source.querySelector('picture');
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return {
      source,
      picture,
      img: img || picture?.querySelector('img') || null,
    };
  }

  const cols = [...row.children];
  const column = cols[index];
  if (!column) {
    return { source: null, picture: null, img: null };
  }

  return {
    source: null,
    picture: column.querySelector('picture'),
    img: column.querySelector('img'),
  };
}

function buildPicture(imageField, imageAlt) {
  const { img } = imageField;
  if (!img?.src) return null;

  const picture = createOptimizedPicture(img.src, imageAlt || img.alt || '', false, [
    { media: '(min-width: 900px)', width: '420' },
    { width: '300' },
  ]);

  moveInstrumentation(img, picture.querySelector('img'));
  return picture;
}

function buildRichContent(source, className) {
  if (!source) return null;

  const content = document.createElement('div');
  content.className = className;
  moveInstrumentation(source, content);
  while (source.firstChild) content.append(source.firstChild);

  return content.childNodes.length ? content : null;
}

function buildButton(buttonTextField, buttonLinkField, buttonStyle, index) {
  if (!buttonTextField.value && !buttonLinkField.value) return null;

  const button = document.createElement(buttonLinkField.value ? 'a' : 'span');
  button.className = `regional-offices-button regional-offices-button-${buttonStyle || 'outlined'} regional-offices-reveal`;
  button.style.setProperty('--stagger-index', index + 1.4);
  button.textContent = buttonTextField.value || 'Learn More';

  if (buttonLinkField.value) button.href = buttonLinkField.value;
  if (buttonTextField.source || buttonLinkField.source) {
    moveInstrumentation(buttonTextField.source || buttonLinkField.source, button);
  }

  return button;
}

function buildOfficeCard(item, index) {
  const card = document.createElement('article');
  card.className = 'regional-offices-card regional-offices-reveal';
  card.style.setProperty('--stagger-index', index);
  if (item.row) moveInstrumentation(item.row, card);

  const media = document.createElement('div');
  media.className = 'regional-offices-card-media';
  media.style.setProperty('--stagger-index', index + 0.5);
  const picture = buildPicture(item.imageField, item.imageAltField.value);
  if (picture) media.append(picture);
  card.append(media);

  if (item.titleField.value || item.titleField.source) {
    const title = document.createElement('h3');
    title.className = 'regional-offices-card-title';
    if (item.titleField.source) {
      moveInstrumentation(item.titleField.source, title);
      while (item.titleField.source.firstChild) title.append(item.titleField.source.firstChild);
    } else {
      title.textContent = item.titleField.value;
    }
    card.append(title);
  }

  const body = buildRichContent(item.bodySource, 'regional-offices-card-body');
  if (body) card.append(body);

  const button = buildButton(
    item.buttonTextField,
    item.buttonLinkField,
    item.buttonStyleField.value,
    index,
  );
  if (button) card.append(button);

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
    threshold: 0.2,
  });

  observer.observe(block);
}

export default function decorate(block) {
  const headingField = getBlockField(block, 'heading');
  const subheadingSource = getBlockRichField(block, 'subheading');
  const columnsField = getBlockField(block, 'columns');
  const rows = [...block.querySelectorAll(':scope > div')];
  const offices = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    const isItemRow = row.querySelector('[data-aue-prop="image"]')
      || row.querySelector('[data-aue-prop="title"]')
      || row.querySelector('[data-aue-prop="buttonText"]')
      || cols.length >= 5;

    if (!isItemRow) return;

    const imageField = getImageField(row, 'image', 0);
    const imageAltField = getField(row, 'imageAlt', 1);
    const titleField = getField(row, 'title', 2);
    const bodySource = getRichField(row, 'bodyText', 3);
    const buttonTextField = getField(row, 'buttonText', 4);
    const buttonLinkField = getLinkField(row, 'buttonLink', 5);
    const buttonStyleField = getField(row, 'buttonStyle', 6);

    if (!imageField.img && !titleField.value && !bodySource && !buttonTextField.value) return;

    offices.push({
      imageField,
      imageAltField,
      titleField,
      bodySource,
      buttonTextField,
      buttonLinkField,
      buttonStyleField,
      row,
    });
  });

  const inner = document.createElement('div');
  inner.className = 'regional-offices-inner';

  const header = document.createElement('div');
  header.className = 'regional-offices-header regional-offices-reveal';

  if (headingField.value || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'regional-offices-heading';
    if (headingField.source) {
      moveInstrumentation(headingField.source, heading);
      while (headingField.source.firstChild) heading.append(headingField.source.firstChild);
    } else {
      heading.textContent = headingField.value;
    }
    header.append(heading);
  }

  const subheading = buildRichContent(subheadingSource, 'regional-offices-subheading');
  if (subheading) header.append(subheading);

  if (header.childElementCount) inner.append(header);

  const grid = document.createElement('div');
  grid.className = 'regional-offices-grid';
  grid.style.setProperty('--regional-offices-columns', columnsField.value || '3');

  offices.forEach((office, index) => {
    grid.append(buildOfficeCard(office, index));
  });

  inner.append(grid);
  block.replaceChildren(inner);
  enableReveal(block);
}
