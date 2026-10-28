import {
  getBlockRows,
  readImageField,
  readLinkField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function getField(scope, name) {
  return normalizeText(readTextField(scope, name).value || readLinkField(scope, name).value);
}

function buildCard(row) {
  const imageField = readImageField(row, 'image');
  const img = imageField.img || row.querySelector('img');
  const title = getField(row, 'title') || normalizeText(row.children[1]?.textContent);
  const description = getField(row, 'description') || normalizeText(row.children[2]?.textContent);
  const linkField = readLinkField(row, 'link');
  const href = linkField.value || normalizeText(row.querySelector('a')?.getAttribute('href') || '');
  const altVal = getField(row, 'imageAlt') || normalizeText(row.children[4]?.textContent);

  const card = document.createElement(href ? 'a' : 'div');
  card.className = 'picture-card';
  if (href) {
    card.href = href;
    card.setAttribute('aria-label', title || '');
  }

  if (img) {
    const media = document.createElement('div');
    media.className = 'picture-card-media';
    const pic = img.closest('picture') || img;
    const picClone = pic.cloneNode(true);
    const cloneImg = picClone.tagName === 'IMG' ? picClone : picClone.querySelector('img');
    if (altVal && cloneImg) cloneImg.alt = altVal;
    media.append(picClone);
    card.append(media);
  }

  const overlay = document.createElement('div');
  overlay.className = 'picture-card-overlay';
  card.append(overlay);

  const content = document.createElement('div');
  content.className = 'picture-card-content';

  if (title) {
    const h = document.createElement('h3');
    h.className = 'picture-card-title';
    h.textContent = title;
    content.append(h);
  }

  if (description) {
    const p = document.createElement('p');
    p.className = 'picture-card-description';
    p.textContent = description;
    content.append(p);
  }

  card.append(content);
  return card;
}

export default function decorate(block) {
  const rows = getBlockRows(block);

  const heading = rows.length
    ? (readTextField(block, 'heading').value || normalizeText(rows[0]?.children[0]?.textContent))
    : '';
  const subheading = rows.length
    ? (readTextField(block, 'subheading').value || '')
    : '';

  const itemRows = rows.filter((row) => {
    const hasImage = !!row.querySelector('img');
    const hasTitle = row.children.length >= 2;
    return hasImage || hasTitle;
  });

  const shell = document.createElement('div');
  shell.className = 'picture-cards-shell';

  if (heading || subheading) {
    const header = document.createElement('div');
    header.className = 'picture-cards-header';
    if (heading) {
      const h2 = document.createElement('h2');
      h2.className = 'picture-cards-heading';
      h2.textContent = heading;
      header.append(h2);
    }
    if (subheading) {
      const sub = document.createElement('p');
      sub.className = 'picture-cards-subheading';
      sub.textContent = subheading;
      header.append(sub);
    }
    shell.append(header);
  }

  const grid = document.createElement('div');
  grid.className = 'picture-cards-grid';
  itemRows.forEach((row) => {
    const card = buildCard(row);
    [...row.attributes].forEach(({ name, value }) => {
      if (name.startsWith('data-aue-') || name.startsWith('data-richtext')) {
        card.setAttribute(name, value);
      }
    });
    setItemLabel(card, [
      getField(row, 'title') || normalizeText(row.children[1]?.textContent),
      getField(row, 'description') || normalizeText(row.children[2]?.textContent),
    ]);
    grid.append(card);
  });
  shell.append(grid);

  block.replaceChildren(shell);
}
