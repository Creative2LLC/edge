import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readLinkField,
  readRichTextField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';

/* Status slug -> display text + color. Selecting an option in the model picks
   which text/color pair renders in column 4. */
const STATUSES = {
  'accepting-applications': { label: 'Accepting Applications', color: '#338739' },
  'limited-seats': { label: 'Limited Seats', color: '#AC6005' },
  'coming-soon': { label: 'Coming Soon', color: '#404041' },
  closed: { label: 'Closed', color: '#B3261E' },
  'waitlist-open': { label: 'Waitlist Open', color: '#007294' },
};

function getField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function getLinkField(row, name, index) {
  return readLinkField(row, name, { fallbackCell: row.children[index] });
}

function buildTextCol(field, className) {
  const el = document.createElement('div');
  el.className = className;
  if (field.source) {
    moveInstrumentation(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
  } else {
    el.textContent = field.value;
  }
  return el;
}

function buildCard(data) {
  const card = document.createElement('div');
  card.className = 'training-sessions-card';
  if (data.row) {
    moveInstrumentation(data.row, card);
    setItemLabel(card, [data.col1.value]);
  }

  card.append(buildTextCol(data.col1, 'training-sessions-col training-sessions-col-1'));
  card.append(buildTextCol(data.col2, 'training-sessions-col training-sessions-col-2'));
  card.append(buildTextCol(data.col3, 'training-sessions-col training-sessions-col-3'));

  // Column 4 — status text driven by the dropdown.
  const status = STATUSES[data.status];
  const statusEl = document.createElement('div');
  statusEl.className = 'training-sessions-col training-sessions-status';
  if (status) {
    statusEl.textContent = status.label;
    statusEl.style.setProperty('color', status.color);
  }
  card.append(statusEl);

  // Arrow link on the far right.
  const arrow = document.createElement(data.link ? 'a' : 'span');
  arrow.className = 'training-sessions-arrow';
  if (data.link) {
    arrow.href = data.link;
    arrow.setAttribute('aria-label', data.col1.value || 'View training session');
  }
  arrow.textContent = '→';
  card.append(arrow);

  return card;
}

export default function decorate(block) {
  const directRowOf = (el) => {
    let cur = el;
    while (cur && cur.parentElement && cur.parentElement !== block) {
      cur = cur.parentElement;
    }
    return cur && cur.parentElement === block ? cur : null;
  };

  // Block-level fields
  const titleField = readRichTextField(block, 'title');
  if (titleField.source) directRowOf(titleField.source)?.remove();

  const descField = readRichTextField(block, 'description');
  if (descField.source) directRowOf(descField.source)?.remove();

  const alignmentField = readTextField(block, 'alignment');
  const alignment = (alignmentField.value || 'center').toLowerCase();
  if (alignmentField.source) directRowOf(alignmentField.source)?.remove();

  // Item rows -> cards
  const rows = [...block.querySelectorAll(':scope > div')];
  const cards = [];

  rows.forEach((row) => {
    if (row.children.length < 1) return;

    const col1 = getField(row, 'column1', 0);
    const col2 = getField(row, 'column2', 1);
    const col3 = getField(row, 'column3', 2);
    const statusField = getField(row, 'status', 3);
    const linkField = getLinkField(row, 'link', 4);

    const hasContent = col1.value || col2.value || col3.value
      || statusField.value || linkField.value;
    const isAuthoring = Boolean(
      row.getAttribute('data-aue-resource')
        || row.querySelector('[data-aue-resource], [data-aue-prop]'),
    );
    if (!hasContent && !isAuthoring) return;

    cards.push({
      col1,
      col2,
      col3,
      status: (statusField.value || '').toLowerCase(),
      link: linkField.value,
      row,
    });
  });

  /* ---------- Build DOM ---------- */

  const inner = document.createElement('div');
  inner.className = 'training-sessions-inner';

  const hasTitle = titleField.html && titleField.html.trim();
  const hasDesc = descField.html && descField.html.trim();
  if (hasTitle || hasDesc) {
    const header = document.createElement('div');
    header.className = 'training-sessions-header';
    header.style.setProperty('text-align', alignment);

    if (hasTitle) {
      const title = document.createElement('div');
      title.className = 'training-sessions-title';
      if (titleField.source) moveInstrumentation(titleField.source, title);
      title.innerHTML = titleField.html;
      header.append(title);
    }
    if (hasDesc) {
      const desc = document.createElement('div');
      desc.className = 'training-sessions-description';
      if (descField.source) moveInstrumentation(descField.source, desc);
      desc.innerHTML = descField.html;
      header.append(desc);
    }
    inner.append(header);
  }

  const list = document.createElement('div');
  list.className = 'training-sessions-list';
  cards.forEach((data) => list.append(buildCard(data)));
  inner.append(list);

  block.replaceChildren(inner);
}
