import { moveInstrumentation } from '../../scripts/scripts.js';

function getFieldText(row, colIndex, propName) {
  const byProp = row.querySelector(`[data-aue-prop="${propName}"]`);
  if (byProp) return byProp.textContent.trim();
  const cols = [...row.children];
  if (cols[colIndex]) return cols[colIndex].textContent.trim();
  return '';
}

function getFieldImage(row, colIndex) {
  const cols = [...row.children];
  const col = cols[colIndex];
  if (!col) return { picture: null, img: null };
  const picture = col.querySelector('picture');
  const img = col.querySelector('img');
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
  /* --- Extract block-level fields and remove their rows --- */
  const headingProp = block.querySelector('[data-aue-prop="heading"]');
  let heading = '';
  if (headingProp) {
    heading = headingProp.textContent.trim();
    headingProp.closest(':scope > div')?.remove();
  }

  const subtitleProp = block.querySelector('[data-aue-prop="subtitle"]');
  let subtitle = '';
  if (subtitleProp) {
    subtitle = subtitleProp.textContent.trim();
    subtitleProp.closest(':scope > div')?.remove();
  }

  const alignProp = block.querySelector('[data-aue-prop="titleAlign"]');
  let align = 'center';
  if (alignProp) {
    align = alignProp.textContent.trim() || 'center';
    alignProp.closest(':scope > div')?.remove();
  }

  const backgroundColorProp = block.querySelector('[data-aue-prop="backgroundColor"]');
  let backgroundColor = '';
  if (backgroundColorProp) {
    backgroundColor = backgroundColorProp.textContent.trim();
    backgroundColorProp.closest(':scope > div')?.remove();
  }

  if (backgroundColor) {
    block.style.setProperty('background-color', backgroundColor, 'important');
  }

  /* --- Build container --- */
  const container = document.createElement('div');
  container.className = 'card-testimonies-container';

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
  const rows = [...block.querySelectorAll(':scope > div')];
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
