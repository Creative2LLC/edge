import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkField, readTextField, setItemLabel } from '../../scripts/block-field-utils.js';

function getField(row, name, index) {
  return readTextField(row, name, { fallbackCell: row.children[index] });
}

function getLinkField(row, name, index) {
  return readLinkField(row, name, { fallbackCell: row.children[index] });
}

function normalizeLengthValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

function normalizeLabel(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getParentFieldElement(block, name) {
  return [...block.querySelectorAll(`[data-aue-prop="${name}"]`)]
    .find((element) => !element.closest('[data-aue-model="need-help-card"]')) || null;
}

function getLabeledValueRow(rows, labels) {
  const accepted = labels.map(normalizeLabel);
  return rows.find((row) => {
    if (row.children.length < 2) return false;
    return accepted.includes(normalizeLabel(row.children[0].textContent));
  }) || null;
}

function getRowValue(row) {
  if (!row) return '';
  if (row.children.length >= 2) return row.children[1].textContent.trim();
  return (row.children[0] || row).textContent.trim();
}

function isNeedHelpCardRow(row) {
  if (row.matches?.('[data-aue-model="need-help-card"]')) return true;
  if (row.children.length < 2) return false;
  if (normalizeLabel(row.children[0].textContent).startsWith('card')) return true;
  return row.children.length >= 3;
}

function readParentText(block, rows, name, labels, fallbackIndex) {
  const source = getParentFieldElement(block, name);
  if (source) {
    return {
      source,
      value: source.textContent.trim(),
    };
  }

  const labeledRow = getLabeledValueRow(rows, labels);
  const fallbackRows = rows.filter((row) => !isNeedHelpCardRow(row));
  const fallbackRow = labeledRow || fallbackRows[fallbackIndex] || null;

  return {
    source: null,
    value: getRowValue(fallbackRow),
  };
}

function formatLinkText(text) {
  return text.replace(
    /(\([^)]*\))/g,
    '<span class="need-help-card-link-small">$1</span>',
  );
}

function buildCard(data) {
  const card = document.createElement('div');
  card.className = 'need-help-card';
  if (data.row) moveInstrumentation(data.row, card);
  setItemLabel(card, [data.titleField.value, data.subheadingField.value]);

  if (data.titleField.value || data.titleField.source) {
    const h3 = document.createElement('h3');
    h3.className = 'need-help-card-title';
    if (data.titleField.source) {
      moveInstrumentation(data.titleField.source, h3);
      const { source } = data.titleField;
      while (source.firstChild) h3.append(source.firstChild);
    } else {
      h3.textContent = data.titleField.value;
    }
    card.append(h3);
  }

  if (data.subheadingField.value || data.subheadingField.source) {
    const p = document.createElement('p');
    p.className = 'need-help-card-subheading';
    if (data.subheadingField.source) {
      moveInstrumentation(data.subheadingField.source, p);
      const { source } = data.subheadingField;
      while (source.firstChild) p.append(source.firstChild);
    } else {
      p.textContent = data.subheadingField.value;
    }
    card.append(p);
  }

  const linkText = data.linkTextField.value;
  const linkHref = data.linkUrlField.value;
  if (linkText) {
    const link = document.createElement(linkHref ? 'a' : 'span');
    link.className = 'need-help-card-link';
    link.innerHTML = formatLinkText(linkText);
    if (linkHref) link.href = linkHref;
    if (data.linkTextField.source) {
      moveInstrumentation(data.linkTextField.source, link);
    }
    card.append(link);
  }

  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const headingField = readParentText(block, rows, 'heading', ['heading', 'title'], 0);
  const blockSubheadingField = readParentText(
    block,
    rows,
    'subheading',
    ['subheading', 'description'],
    1,
  );
  const marginTopField = readParentText(block, rows, 'marginTop', ['top spacing', 'margin top'], 2);
  const marginTopValue = normalizeLengthValue(marginTopField.value);
  if (marginTopValue) {
    block.style.setProperty('margin-top', marginTopValue, 'important');
  }

  const cards = [];
  rows.forEach((row) => {
    if (!isNeedHelpCardRow(row)) return;
    const cols = [...row.children];
    if (cols.length < 2) return;

    const titleField = getField(row, 'title', 0);
    const subheadingField = getField(row, 'subheading', 1);
    const linkTextField = getField(row, 'linkText', 2);
    const linkUrlField = getLinkField(row, 'linkUrl', 3);

    cards.push({
      titleField,
      subheadingField,
      linkTextField,
      linkUrlField,
      row,
    });
  });

  const inner = document.createElement('div');
  inner.className = 'need-help-inner';

  if (headingField.value || headingField.source) {
    const h2 = document.createElement('h2');
    h2.className = 'need-help-heading';
    if (headingField.source) moveInstrumentation(headingField.source, h2);
    h2.textContent = headingField.value;
    inner.append(h2);
  }

  if (blockSubheadingField.value || blockSubheadingField.source) {
    const sub = document.createElement('p');
    sub.className = 'need-help-subheading';
    if (blockSubheadingField.source) moveInstrumentation(blockSubheadingField.source, sub);
    sub.textContent = blockSubheadingField.value;
    inner.append(sub);
  }

  if (cards.length) {
    const grid = document.createElement('div');
    grid.className = 'need-help-cards';

    cards.forEach((data) => {
      const card = buildCard(data);
      grid.append(card);
    });

    inner.append(grid);
  }

  block.replaceChildren(inner);
}
