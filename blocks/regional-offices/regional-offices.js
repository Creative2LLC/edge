import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';

const BLOCK_ROW_INDEX = {
  heading: 0,
  subheading: 1,
  columns: 2,
  stylingVariant: 3,
};

function isRegionalOfficeItemRow(row) {
  const cols = [...row.children];
  return Boolean(
    row.querySelector('[data-aue-prop="image"]')
      || row.querySelector('[data-aue-prop="title"]')
      || row.querySelector('[data-aue-prop="buttonText"]')
      || cols.length >= 5,
  );
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isRegionalOfficeItemRow(row));
}

function getParentFallbackCell(block, rowIndex) {
  const row = getParentRows(block)[rowIndex];
  return row?.children?.[0] || row || null;
}

function getBlockField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const field = readTextField(block, name, {
    rowIndex,
    columnIndex,
    fallbackCell: getParentFallbackCell(block, rowIndex),
  });
  return { source: field.source || field.cell, value: field.value };
}

function getBlockRichField(block, name, rowIndex = BLOCK_ROW_INDEX[name], columnIndex = 0) {
  const field = readRichTextField(block, name, {
    rowIndex,
    columnIndex,
    fallbackCell: getParentFallbackCell(block, rowIndex),
  });
  return field.source || field.cell;
}

function getField(row, name, index) {
  const field = readTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getLinkField(row, name, index) {
  const field = readLinkField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getRichField(row, name, index) {
  const field = readRichTextField(row, name, { fallbackCell: row.children[index] });
  return field.source || field.cell;
}

function getImageField(row, name, index) {
  const field = readImageField(row, name, { fallbackCell: row.children[index] });
  return {
    source: field.source,
    picture: field.picture,
    img: field.img,
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

function buildOfficeCard(item, index, variant) {
  const card = document.createElement('article');
  card.className = 'regional-offices-card regional-offices-reveal';
  card.style.setProperty('--stagger-index', index);
  if (item.row) {
    moveInstrumentation(item.row, card);
    setItemLabel(card, [item.titleField.value, item.bodySource?.textContent]);
  }

  const media = document.createElement('div');
  media.className = 'regional-offices-card-media';
  media.style.setProperty('--stagger-index', index + 0.5);
  const picture = buildPicture(item.imageField, item.imageAltField.value);
  if (picture) media.append(picture);
  card.append(media);

  const textWrap = document.createElement('div');
  textWrap.className = 'regional-offices-card-text';

  if (item.titleField.value || item.titleField.source) {
    const title = document.createElement('h3');
    title.className = 'regional-offices-card-title';
    if (item.titleField.source) {
      moveInstrumentation(item.titleField.source, title);
      while (item.titleField.source.firstChild) title.append(item.titleField.source.firstChild);
    } else {
      title.textContent = item.titleField.value;
    }
    textWrap.append(title);
  }

  const body = buildRichContent(item.bodySource, 'regional-offices-card-body');
  if (body) textWrap.append(body);

  if (textWrap.childElementCount) card.append(textWrap);

  if (variant !== 'boxed') {
    const button = buildButton(
      item.buttonTextField,
      item.buttonLinkField,
      item.buttonStyleField.value,
      index,
    );
    if (button) card.append(button);
  }

  return card;
}

export default function decorate(block) {
  const headingField = getBlockField(block, 'heading');
  const subheadingSource = getBlockRichField(block, 'subheading');
  const columnsField = getBlockField(block, 'columns');
  const stylingVariantField = getBlockField(block, 'stylingVariant');
  const variant = (stylingVariantField.value || 'default').toLowerCase();
  const rows = [...block.querySelectorAll(':scope > div')];
  const offices = [];

  rows.forEach((row) => {
    const isItemRow = isRegionalOfficeItemRow(row);

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
    grid.append(buildOfficeCard(office, index, variant));
  });

  inner.append(grid);
  block.replaceChildren(inner);

  block.classList.toggle('regional-offices-boxed', variant === 'boxed');
}
