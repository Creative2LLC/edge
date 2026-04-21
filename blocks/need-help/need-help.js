import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) {
    return { source: null, value: cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A'
      ? source : source.querySelector('a');
    return {
      source,
      value: anchor?.href || source.textContent.trim(),
    };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return {
      source: null,
      value: anchor?.href || cols[index].textContent.trim(),
    };
  }
  return { source: null, value: '' };
}

function normalizeLengthValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
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

  const headingEl = block.querySelector(
    '[data-aue-prop="heading"]',
  );
  const heading = headingEl?.textContent.trim() || '';

  const subheadingEl = block.querySelector(
    '[data-aue-prop="subheading"]',
  );
  const subheading = subheadingEl?.textContent.trim() || '';

  const marginTopEl = block.querySelector(
    '[data-aue-prop="marginTop"]',
  );
  const marginTopValue = normalizeLengthValue(marginTopEl?.textContent);
  if (marginTopValue) {
    block.style.setProperty('margin-top', marginTopValue, 'important');
  }

  const cards = [];
  rows.forEach((row) => {
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

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'need-help-heading';
    h2.textContent = heading;
    inner.append(h2);
  }

  if (subheading) {
    const sub = document.createElement('p');
    sub.className = 'need-help-subheading';
    sub.textContent = subheading;
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
