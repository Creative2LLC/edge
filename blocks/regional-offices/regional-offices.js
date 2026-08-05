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
      || cols.length >= 5
      || (cols.length >= 3 && row.querySelector('picture, img')),
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

function getFallbackCellAt(row, index) {
  return Number.isInteger(index) ? row.children[index] || null : null;
}

function getField(row, name, index) {
  const field = readTextField(row, name, { fallbackCell: getFallbackCellAt(row, index) });
  return { source: field.source, value: field.value };
}

function getLinkField(row, name, index) {
  const field = readLinkField(row, name, { fallbackCell: getFallbackCellAt(row, index) });
  return { source: field.source, value: field.value };
}

function getRichField(row, name, index) {
  const field = readRichTextField(row, name, { fallbackCell: getFallbackCellAt(row, index) });
  return field.source || field.cell;
}

function getImageField(row, name, index) {
  const field = readImageField(row, name, { fallbackCell: getFallbackCellAt(row, index) });
  return {
    source: field.source,
    picture: field.picture,
    img: field.img,
  };
}

function isButtonStyleValue(value) {
  return ['solid', 'outlined'].includes(String(value || '').trim().toLowerCase());
}

function isLikelyLinkValue(value) {
  return /^(?:#|\/|https?:\/\/|mailto:|tel:)/i.test(String(value || '').trim());
}

function isLikelyButtonText(value, imageAlts = []) {
  const text = String(value || '').trim();
  return /(?:learn more|view more|read more|contact us|office details|→)/i.test(text)
    || (imageAlts.length > 0 && /office$/i.test(text) && !imageAlts.includes(text));
}

function normalizeCompactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function getCellLinkValue(cell) {
  if (!cell) return '';
  const anchor = cell.tagName === 'A' ? cell : cell.querySelector?.('a[href]');
  const href = anchor?.getAttribute('href') || anchor?.href || '';
  if (href) return href;
  const text = cell.textContent.trim();
  return isLikelyLinkValue(text) && !isButtonStyleValue(text) ? text : '';
}

function findRowLinkField(row, startIndex = 0) {
  const cells = [...row.children].slice(Math.max(startIndex, 0));
  const cell = cells.find((candidate) => getCellLinkValue(candidate));
  return {
    source: cell || null,
    value: getCellLinkValue(cell),
  };
}

function getItemColumnMap(row) {
  const hasInstrumentation = row.querySelector('[data-aue-prop], [data-richtext-prop]');
  const cells = [...row.children];

  if (!hasInstrumentation) {
    const imageAlts = [...row.querySelectorAll('img')]
      .map((img) => normalizeCompactText(img.alt))
      .filter(Boolean);
    const textCells = cells
      .map((cell, index) => ({
        cell,
        index,
        text: normalizeCompactText(cell.textContent),
      }))
      .filter(({ index, text }) => index > 0 && text)
      .filter(({ text }) => !isButtonStyleValue(text) && !isLikelyLinkValue(text));

    const buttonTextCell = textCells.find(({ text }) => isLikelyButtonText(text, imageAlts));
    const contentCells = textCells.filter((entry) => entry !== buttonTextCell);
    const titleCell = contentCells.find(({ text }) => imageAlts.includes(text))
      || [...contentCells].sort((a, b) => a.text.length - b.text.length)[0];
    const bodyCell = contentCells
      .filter((entry) => entry !== titleCell)
      .sort((a, b) => b.text.length - a.text.length)[0];

    return {
      image: 0,
      imageAlt: null,
      title: titleCell?.index ?? 2,
      bodyText: bodyCell?.index ?? 1,
      buttonText: buttonTextCell?.index ?? null,
      buttonLink: null,
      buttonStyle: null,
    };
  }

  return {
    image: 0,
    imageAlt: 1,
    title: 2,
    bodyText: 3,
    buttonText: 4,
    buttonLink: 5,
    buttonStyle: 6,
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

    const itemColumns = getItemColumnMap(row);
    const imageField = getImageField(row, 'image', itemColumns.image);
    const imageAltField = getField(row, 'imageAlt', itemColumns.imageAlt);
    const titleField = getField(row, 'title', itemColumns.title);
    const bodySource = getRichField(row, 'bodyText', itemColumns.bodyText);
    const buttonTextField = getField(row, 'buttonText', itemColumns.buttonText);
    const buttonLinkField = getLinkField(row, 'buttonLink', itemColumns.buttonLink);
    const buttonStyleField = getField(row, 'buttonStyle', itemColumns.buttonStyle);

    if (isButtonStyleValue(buttonLinkField.value)) buttonLinkField.value = '';
    if (!buttonLinkField.value) {
      const compactLinkField = findRowLinkField(row, itemColumns.buttonText);
      buttonLinkField.source = compactLinkField.source;
      buttonLinkField.value = compactLinkField.value;
    }

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
