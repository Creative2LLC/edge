import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getFieldSelector,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const BLOCK_FIELDS = [
  'heading',
  'bodyText',
  'buttonText',
  'buttonLink',
  'buttonColor',
  'buttonTextColor',
  'buttonStyle',
  'layout',
];

function isItemRow(row) {
  return Boolean(
    row.querySelector('[data-aue-prop="title"]')
      || row.querySelector('[data-aue-prop="subtitle"]')
      || row.querySelector('[data-aue-prop="year"]')
      || row.querySelector('[data-aue-prop="emailText"]')
      || row.children.length >= 3,
  );
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')].filter((row) => !isItemRow(row));
}

function getParentCell(block, index) {
  const row = getParentRows(block)[index];
  return row?.children?.[0] || row || null;
}

function getParentFieldSource(block, name) {
  const selector = getFieldSelector(name);
  return getParentRows(block)
    .map((row) => (row.matches(selector) ? row : row.querySelector(selector)))
    .find(Boolean)
    || null;
}

function getBlockTextField(block, name) {
  const source = getParentFieldSource(block, name);
  const fallbackCell = source || getParentCell(block, BLOCK_FIELDS.indexOf(name));
  return fallbackCell?.textContent?.trim() || '';
}

function getBlockRichTextField(block, name) {
  const source = getParentFieldSource(block, name);
  const fallbackCell = source || getParentCell(block, BLOCK_FIELDS.indexOf(name));
  return fallbackCell?.innerHTML?.trim() || '';
}

function getBlockLinkField(block, name) {
  const source = getParentFieldSource(block, name);
  const fallbackCell = source || getParentCell(block, BLOCK_FIELDS.indexOf(name));
  const anchor = fallbackCell?.tagName === 'A' ? fallbackCell : fallbackCell?.querySelector?.('a[href]');
  return anchor?.getAttribute('href') || fallbackCell?.textContent?.trim() || '';
}

function getField(scope, name, index) {
  if (scope.classList?.contains('split-card-list')) {
    return getBlockTextField(scope, name);
  }
  const fallbackCell = scope.children[index];
  return readTextField(scope, name, { fallbackCell }).value;
}

function getRichTextField(scope, name, index) {
  if (scope.classList?.contains('split-card-list')) {
    return getBlockRichTextField(scope, name);
  }
  const fallbackCell = scope.children[index];
  return readRichTextField(scope, name, { fallbackCell }).html;
}

function getLinkField(scope, name, index) {
  if (scope.classList?.contains('split-card-list')) {
    return getBlockLinkField(scope, name);
  }
  const fallbackCell = scope.children[index];
  return readLinkField(scope, name, { fallbackCell }).value;
}

function getImageField(scope, name, index) {
  return readImageField(scope, name, { fallbackCell: scope.children[index] }).img;
}

function styleButton(btn, color, textColor, style) {
  const bgColor = color || '#008db6';
  if (style === 'outlined') {
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('color', bgColor, 'important');
    btn.style.setProperty('border', `2px solid ${bgColor}`, 'important');
  } else {
    btn.style.setProperty('background-color', bgColor, 'important');
    btn.style.setProperty('color', textColor || '#ffffff', 'important');
    btn.style.setProperty('border', 'none', 'important');
  }
}

function buildStatementCard(data) {
  const card = document.createElement('div');
  card.className = 'scl-statement-card';
  if (data.row) moveInstrumentation(data.row, card);

  const left = document.createElement('div');
  left.className = 'scl-statement-left';

  if (data.title) {
    const title = document.createElement('h3');
    title.className = 'scl-statement-title';
    title.textContent = data.title;
    left.append(title);
  }

  if (data.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'scl-statement-subtitle';
    subtitle.textContent = data.subtitle;
    left.append(subtitle);
  }

  card.append(left);

  if (data.year) {
    const yearEl = document.createElement('span');
    yearEl.className = 'scl-statement-year';
    yearEl.textContent = data.year;
    card.append(yearEl);
  }

  const btnLabel = data.buttonText;
  const btnHref = data.buttonLink;
  if (btnLabel || btnHref) {
    const btn = document.createElement(btnHref ? 'a' : 'button');
    btn.className = 'scl-statement-button';
    btn.textContent = btnLabel || 'View';
    if (btnHref) btn.href = btnHref;
    if (!btnHref) btn.type = 'button';
    styleButton(btn, data.buttonColor, data.buttonTextColor, data.buttonStyle);
    card.append(btn);
  }

  return card;
}

function buildEmailCard(data) {
  const card = document.createElement('div');
  card.className = 'scl-email-card';
  if (data.row) moveInstrumentation(data.row, card);

  if (data.title) {
    const title = document.createElement('h3');
    title.className = 'scl-email-title';
    title.textContent = data.title;
    card.append(title);
  }

  if (data.icon || data.emailText) {
    const row = document.createElement('div');
    row.className = 'scl-email-row';

    if (data.icon) {
      const icon = data.icon.cloneNode(true);
      icon.className = 'scl-email-icon';
      row.append(icon);
    }

    if (data.emailText) {
      const text = document.createElement('span');
      text.className = 'scl-email-text';
      text.textContent = data.emailText;
      row.append(text);
    }

    card.append(row);
  }

  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  /* Block-level fields */
  const heading = getField(block, 'heading');
  const bodyText = getRichTextField(block, 'bodyText');
  const btnText = getField(block, 'buttonText');
  const btnLink = getLinkField(block, 'buttonLink');
  const btnColor = getField(block, 'buttonColor');
  const btnTextColor = getField(block, 'buttonTextColor');
  const btnStyle = getField(block, 'buttonStyle');
  const layout = getField(block, 'layout') || 'statements';

  /* Collect items */
  const items = [];
  rows.forEach((row) => {
    const aueItem = isItemRow(row);
    const cols = [...row.children];
    const enoughCols = cols.length >= 2;

    if (!aueItem && !enoughCols) return;

    items.push({
      title: getField(row, 'title', 0),
      subtitle: getField(row, 'subtitle', 1),
      year: getField(row, 'year', 2),
      buttonText: getField(row, 'buttonText', 3),
      buttonLink: getLinkField(row, 'buttonLink', 4),
      buttonColor: getField(row, 'buttonColor', 5),
      buttonTextColor: getField(row, 'buttonTextColor', 6),
      buttonStyle: getField(row, 'buttonStyle', 7),
      icon: getImageField(row, 'icon', 8),
      emailText: getField(row, 'emailText', 9),
      row,
    });
  });

  /* Build layout */
  const inner = document.createElement('div');
  inner.className = 'scl-inner';

  /* Left side — content */
  const leftSide = document.createElement('div');
  leftSide.className = 'scl-content';

  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'scl-heading';
    h2.textContent = heading;
    leftSide.append(h2);
  }

  if (bodyText) {
    const body = document.createElement('div');
    body.className = 'scl-body';
    body.innerHTML = bodyText;
    leftSide.append(body);
  }

  if (btnText || btnLink) {
    const btn = document.createElement(btnLink ? 'a' : 'button');
    btn.className = 'scl-button';
    btn.textContent = btnText || 'Learn More';
    if (btnLink) btn.href = btnLink;
    if (!btnLink) btn.type = 'button';
    styleButton(btn, btnColor, btnTextColor, btnStyle);
    leftSide.append(btn);
  }

  inner.append(leftSide);

  /* Right side — cards */
  const rightSide = document.createElement('div');
  rightSide.className = 'scl-cards';

  const isEmail = layout === 'email-cards';
  if (isEmail) {
    rightSide.classList.add('scl-cards-email');
  }

  items.forEach((data) => {
    const card = isEmail ? buildEmailCard(data) : buildStatementCard(data);
    rightSide.append(card);
  });

  inner.append(rightSide);
  block.replaceChildren(inner);
}
