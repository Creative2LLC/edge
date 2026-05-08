import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const BLOCK_FIELD_INDEX = {
  heading: 0,
  subtitle: 1,
  titleAlign: 2,
  backgroundColor: 3,
};

function getBlockFieldValue(block, rows, name, index, fallbackValue = '') {
  const row = rows[index];
  return readTextField(block, name, { fallbackCell: row?.children[0] || row }).value
    || fallbackValue;
}

function getFieldText(row, colIndex, propName) {
  return readTextField(row, propName, { fallbackCell: row.children[colIndex] }).value;
}

function getFieldImage(row, colIndex) {
  const { picture, img } = readImageField(row, 'image', { fallbackCell: row.children[colIndex] });
  return { picture, img };
}

function buildMainCard(data, row) {
  const card = document.createElement('div');
  card.className = 'card-testimonies-main';
  if (row) moveInstrumentation(row, card);

  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-testimonies-main-image';

  if (data.picture) {
    imgWrap.append(data.picture);
  } else if (data.img) {
    imgWrap.append(data.img);
  }

  card.append(imgWrap);

  const textSection = document.createElement('div');
  textSection.className = 'card-testimonies-main-text';

  if (data.quote) {
    const quote = document.createElement('p');
    quote.className = 'card-testimonies-main-quote';
    quote.textContent = data.quote;
    textSection.append(quote);
  }

  if (data.author) {
    const author = document.createElement('p');
    author.className = 'card-testimonies-main-author';
    author.textContent = data.author;
    textSection.append(author);
  }

  card.append(textSection);
  return card;
}

function buildSmallCard(data, row) {
  const card = document.createElement('div');
  card.className = 'card-testimonies-small';
  if (row) moveInstrumentation(row, card);

  const inner = document.createElement('div');
  inner.className = 'card-testimonies-small-inner';

  if (data.quote) {
    const quote = document.createElement('p');
    quote.className = 'card-testimonies-small-quote';
    quote.textContent = data.quote;
    inner.append(quote);
  }

  if (data.author) {
    const author = document.createElement('p');
    author.className = 'card-testimonies-small-author';
    author.textContent = data.author;
    inner.append(author);
  }

  card.append(inner);
  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const heading = getBlockFieldValue(block, rows, 'heading', BLOCK_FIELD_INDEX.heading);
  const subtitle = getBlockFieldValue(block, rows, 'subtitle', BLOCK_FIELD_INDEX.subtitle);
  const align = getBlockFieldValue(block, rows, 'titleAlign', BLOCK_FIELD_INDEX.titleAlign, 'center') || 'center';
  const backgroundColor = getBlockFieldValue(
    block,
    rows,
    'backgroundColor',
    BLOCK_FIELD_INDEX.backgroundColor,
  );

  if (backgroundColor) {
    block.style.setProperty('background-color', backgroundColor, 'important');
    block.style.setProperty('--card-testimonies-surface-bg', backgroundColor);
    block.style.setProperty('--card-testimonies-secondary-surface-bg', backgroundColor);
  }

  /* --- Build container --- */
  const container = document.createElement('div');
  container.className = 'card-testimonies-container';
  if (backgroundColor) {
    container.style.setProperty('background-color', backgroundColor, 'important');
  }

  /* --- Header --- */
  if (heading || subtitle) {
    const header = document.createElement('div');
    header.className = 'card-testimonies-header';
    header.style.textAlign = align;

    if (heading) {
      const h2 = document.createElement('h2');
      h2.className = 'card-testimonies-title';
      h2.textContent = heading;
      header.append(h2);
    }

    if (subtitle) {
      const sub = document.createElement('p');
      sub.className = 'card-testimonies-subtitle';
      if (align === 'center') sub.style.margin = '0 auto';
      sub.textContent = subtitle;
      header.append(sub);
    }

    container.append(header);
  }

  /* --- Parse remaining rows as testimony items --- */
  let mainBuilt = false;
  let smallRow = null;

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;

    const imageData = getFieldImage(row, 0);
    const quote = getFieldText(row, 1, 'quote');
    const author = getFieldText(row, 2, 'author');

    if (!mainBuilt && imageData.img) {
      const card = buildMainCard({
        picture: imageData.picture,
        img: imageData.img,
        quote,
        author,
      }, row);
      container.append(card);
      mainBuilt = true;
    } else {
      if (!smallRow) {
        smallRow = document.createElement('div');
        smallRow.className = 'card-testimonies-small-row';
        container.append(smallRow);
      }
      smallRow.append(buildSmallCard({ quote, author }, row));
    }
  });

  block.replaceChildren(container);
}
