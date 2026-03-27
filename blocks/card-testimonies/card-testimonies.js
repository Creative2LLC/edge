import { moveInstrumentation } from '../../scripts/scripts.js';

function getImageField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return { source, img };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const img = cols[index].querySelector('img');
    return { source: null, img: img || null };
  }
  return { source: null, img: null };
}

function getRichTextField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    return {
      source, html: source.innerHTML.trim(), value: source.textContent.trim(),
    };
  }
  const cols = [...row.children];
  if (cols[index]) {
    return {
      source: null, html: cols[index].innerHTML.trim(), value: cols[index].textContent.trim(),
    };
  }
  return { source: null, html: '', value: '' };
}

function buildMainCard(data) {
  const card = document.createElement('div');
  card.className = 'card-testimonies-main';
  if (data.row) moveInstrumentation(data.row, card);

  if (data.imageField.img) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-testimonies-main-image';
    const img = data.imageField.img.cloneNode(true);
    if (data.imageField.source) moveInstrumentation(data.imageField.source, img);
    imgWrap.append(img);
    card.append(imgWrap);
  }

  const textSection = document.createElement('div');
  textSection.className = 'card-testimonies-main-text';

  if (data.quoteField.value || data.quoteField.source) {
    const quote = document.createElement('p');
    quote.className = 'card-testimonies-main-quote';
    if (data.quoteField.source) {
      moveInstrumentation(data.quoteField.source, quote);
      quote.innerHTML = data.quoteField.html;
    } else {
      quote.textContent = data.quoteField.value;
    }
    textSection.append(quote);
  }

  if (data.authorField.value || data.authorField.source) {
    const author = document.createElement('p');
    author.className = 'card-testimonies-main-author';
    if (data.authorField.source) {
      moveInstrumentation(data.authorField.source, author);
      author.innerHTML = data.authorField.html;
    } else {
      author.textContent = data.authorField.value;
    }
    textSection.append(author);
  }

  card.append(textSection);
  return card;
}

function buildSmallCard(data) {
  const card = document.createElement('div');
  card.className = 'card-testimonies-small';
  if (data.row) moveInstrumentation(data.row, card);

  const inner = document.createElement('div');
  inner.className = 'card-testimonies-small-inner';

  if (data.quoteField.value || data.quoteField.source) {
    const quote = document.createElement('p');
    quote.className = 'card-testimonies-small-quote';
    if (data.quoteField.source) {
      moveInstrumentation(data.quoteField.source, quote);
      quote.innerHTML = data.quoteField.html;
    } else {
      quote.textContent = data.quoteField.value;
    }
    inner.append(quote);
  }

  if (data.authorField.value || data.authorField.source) {
    const author = document.createElement('p');
    author.className = 'card-testimonies-small-author';
    if (data.authorField.source) {
      moveInstrumentation(data.authorField.source, author);
      author.innerHTML = data.authorField.html;
    } else {
      author.textContent = data.authorField.value;
    }
    inner.append(author);
  }

  card.append(inner);
  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const container = document.createElement('div');
  container.className = 'card-testimonies-container';

  /* --- Block-level fields --- */
  const alignEl = block.querySelector('[data-aue-prop="titleAlign"]');
  const align = alignEl?.textContent.trim() || 'center';

  /* --- Header: title + subtitle --- */
  const headerRow = rows.find((r) => {
    const cols = [...r.children];
    return cols.length >= 1
      && !r.querySelector('[data-aue-prop="image"]')
      && !r.querySelector('[data-aue-prop="quote"]')
      && (r.querySelector('[data-aue-prop="title"]') || cols.length <= 2);
  });

  if (headerRow) {
    const titleField = getRichTextField(headerRow, 'title', 0);
    const subtitleField = getRichTextField(headerRow, 'subtitle', 1);

    const header = document.createElement('div');
    header.className = 'card-testimonies-header';
    header.style.textAlign = align;

    if (titleField.value || titleField.source) {
      const h2 = document.createElement('h2');
      h2.className = 'card-testimonies-title';
      if (titleField.source) {
        moveInstrumentation(titleField.source, h2);
        h2.innerHTML = titleField.html;
      } else {
        h2.textContent = titleField.value;
      }
      header.append(h2);
    }

    if (subtitleField.value || subtitleField.source) {
      const sub = document.createElement('p');
      sub.className = 'card-testimonies-subtitle';
      if (align === 'center') sub.style.margin = '0 auto';
      if (subtitleField.source) {
        moveInstrumentation(subtitleField.source, sub);
        sub.innerHTML = subtitleField.html;
      } else {
        sub.textContent = subtitleField.value;
      }
      header.append(sub);
    }

    container.append(header);
  }

  /* --- Testimony items --- */
  const itemRows = rows.filter((r) => r !== headerRow && [...r.children].length >= 2);
  let mainBuilt = false;

  itemRows.forEach((row) => {
    const imageField = getImageField(row, 'image', 0);
    const quoteField = getRichTextField(row, 'quote', 1);
    const authorField = getRichTextField(row, 'author', 2);

    if (!mainBuilt && imageField.img) {
      container.append(buildMainCard({
        row, imageField, quoteField, authorField,
      }));
      mainBuilt = true;
    } else {
      if (!container.querySelector('.card-testimonies-small-row')) {
        const smallRow = document.createElement('div');
        smallRow.className = 'card-testimonies-small-row';
        container.append(smallRow);
      }
      container
        .querySelector('.card-testimonies-small-row')
        .append(buildSmallCard({ row, quoteField, authorField }));
    }
  });

  block.replaceChildren(container);
}
