import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getFieldSelector,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const BLOCK_FIELD_NAMES = ['heading', 'subheading', 'columns'];
const TAB_FIELD_NAMES = ['tabLabel', 'tabId'];
const CARD_FIELD_NAMES = ['tabLabels', 'title', 'bodyContent', 'linkText', 'link'];

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function fieldCell(row) {
  if (!row) return null;
  return row.children.length > 1 ? row.children[1] : row.children[0] || row;
}

function rowModel(row) {
  return String(
    row?.getAttribute('data-aue-model')
      || row?.querySelector('[data-aue-model]')?.getAttribute('data-aue-model')
      || '',
  ).trim();
}

function hasField(row, names) {
  return names.some((name) => row.querySelector(getFieldSelector(name)));
}

function isBlockFieldRow(row) {
  return hasField(row, BLOCK_FIELD_NAMES);
}

function isTabRow(row) {
  return rowModel(row) === 'tabs-tab' || hasField(row, TAB_FIELD_NAMES);
}

function isCardRow(row) {
  return rowModel(row) === 'tabs-info-card' || hasField(row, CARD_FIELD_NAMES);
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitLabels(value) {
  return String(value || '')
    .split(/[\n,|]+/u)
    .map((label) => label.trim())
    .filter(Boolean);
}

function isAllTab(tab) {
  const key = normalizeKey(tab.label);
  return key === 'all' || key.startsWith('all-') || key.endsWith('-all') || key.includes('all-services');
}

function getRowTextField(row, name, index) {
  return readTextField(row, name, { fallbackCell: fieldCell(row.children?.[index]) });
}

function getRowRichField(row, name, index) {
  return readRichTextField(row, name, { fallbackCell: fieldCell(row.children?.[index]) });
}

function getRowLinkField(row, name, index) {
  return readLinkField(row, name, { fallbackCell: fieldCell(row.children?.[index]) });
}

function richFieldHasContent(field) {
  return Boolean(field?.text?.trim() || field?.html?.trim() || field?.source);
}

function appendRichField(field, target) {
  if (field?.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    return;
  }

  target.innerHTML = field?.html || '';
}

function appendTextField(field, target, fallback = '') {
  if (field?.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
  }

  if (!target.textContent.trim()) {
    target.textContent = field?.value || fallback;
  }
}

function parseTabs(tabRows, cards) {
  const tabs = tabRows
    .map((row, index) => {
      const labelField = getRowTextField(row, 'tabLabel', 0);
      const label = labelField.value || `Tab ${index + 1}`;
      const idField = getRowTextField(row, 'tabId', 1);
      const key = normalizeKey(idField.value || label);
      if (!key) return null;
      return {
        key,
        label,
        row,
        labelField,
      };
    })
    .filter(Boolean);

  if (tabs.length) return tabs;

  const derived = [];
  const seen = new Set();
  cards.forEach((card) => {
    card.tabLabels.forEach((label) => {
      const key = normalizeKey(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      derived.push({ key, label });
    });
  });

  return derived;
}

function readCard(row, index) {
  const tabField = getRowTextField(row, 'tabLabels', 0);
  const titleField = getRowRichField(row, 'title', 1);
  const bodyField = getRowRichField(row, 'bodyContent', 2);
  const linkTextField = getRowTextField(row, 'linkText', 3);
  const linkField = getRowLinkField(row, 'link', 4);
  const tabLabels = splitLabels(tabField.value);

  return {
    index,
    row,
    tabLabels,
    tabKeys: tabLabels.map(normalizeKey),
    titleField,
    bodyField,
    linkTextField,
    linkField,
    hasContent: richFieldHasContent(titleField) || richFieldHasContent(bodyField),
  };
}

function buildCard(card) {
  const article = document.createElement('article');
  article.className = 'tabs-card';
  article.style.setProperty('--tabs-card-index', card.index);
  if (card.row) moveInstrumentation(card.row, article);

  const content = document.createElement('div');
  content.className = 'tabs-card-content';

  if (richFieldHasContent(card.titleField)) {
    const title = document.createElement('h3');
    title.className = 'tabs-card-title';
    appendRichField(card.titleField, title);
    content.append(title);
  }

  if (richFieldHasContent(card.bodyField)) {
    const body = document.createElement('div');
    body.className = 'tabs-card-body';
    appendRichField(card.bodyField, body);
    content.append(body);
  }

  article.append(content);

  const href = card.linkField.value;
  const label = card.linkTextField.value;
  if (href || label) {
    const link = document.createElement(href ? 'a' : 'button');
    link.className = 'tabs-card-link';
    if (href) link.href = href;
    if (!href) link.type = 'button';
    appendTextField(card.linkTextField, link, 'Learn more');
    if (card.linkField.source) moveInstrumentation(card.linkField.source, link);
    article.append(link);
  }

  return article;
}

function cardsForTab(cards, tab) {
  if (isAllTab(tab)) return cards;
  return cards.filter((card) => card.tabKeys.includes(tab.key));
}

function setActiveTab(state, index) {
  state.activeIndex = index;
  const activeTab = state.tabs[index];
  const activeCards = cardsForTab(state.cards, activeTab);

  state.buttons.forEach((button, buttonIndex) => {
    const isActive = buttonIndex === index;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  });

  state.panel.setAttribute('aria-labelledby', state.buttons[index].id);
  state.panel.hidden = false;
  state.grid.replaceChildren();

  if (!activeCards.length) {
    state.empty.hidden = false;
    state.grid.hidden = true;
    return;
  }

  state.empty.hidden = true;
  state.grid.hidden = false;
  activeCards.forEach((card) => state.grid.append(card.element));
}

function bindKeyboard(state, tablist) {
  tablist.addEventListener('keydown', (event) => {
    const currentIndex = state.buttons.indexOf(document.activeElement);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % state.buttons.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + state.buttons.length) % state.buttons.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = state.buttons.length - 1;
    else return;

    event.preventDefault();
    state.buttons[nextIndex].focus();
    setActiveTab(state, nextIndex);
  });
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const tabRows = rows.filter((row) => isTabRow(row));
  const cardRows = rows.filter((row) => isCardRow(row));
  const blockRows = rows.filter((row) => isBlockFieldRow(row) && !isTabRow(row) && !isCardRow(row));
  const headingField = readRichTextField(block, 'heading', { fallbackCell: fieldCell(blockRows[0]) });
  const subheadingField = readRichTextField(block, 'subheading', { fallbackCell: fieldCell(blockRows[1]) });
  const columnsField = readTextField(block, 'columns', { fallbackCell: fieldCell(blockRows[2]) });
  const columns = Math.max(1, Math.min(4, parseInt(columnsField.value, 10) || 3));
  const cards = cardRows
    .map(readCard)
    .filter((card) => card.hasContent || isAuthoring)
    .map((card) => ({ ...card, element: buildCard(card) }));
  const tabs = parseTabs(tabRows, cards);

  block.style.setProperty('--tabs-columns', columns);

  const shell = document.createElement('div');
  shell.className = 'tabs-shell';

  if (richFieldHasContent(headingField) || richFieldHasContent(subheadingField)) {
    const header = document.createElement('div');
    header.className = 'tabs-header';

    if (richFieldHasContent(headingField)) {
      const heading = document.createElement('h2');
      heading.className = 'tabs-heading';
      appendRichField(headingField, heading);
      header.append(heading);
    }

    if (richFieldHasContent(subheadingField)) {
      const subheading = document.createElement('div');
      subheading.className = 'tabs-subheading';
      appendRichField(subheadingField, subheading);
      header.append(subheading);
    }

    shell.append(header);
  }

  if (!tabs.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'tabs-empty';
    placeholder.textContent = isAuthoring
      ? 'Add tab items and info card items in Universal Editor.'
      : '';
    block.replaceChildren(shell, placeholder);
    return;
  }

  const instanceId = `tabs-${Math.random().toString(36).slice(2, 9)}`;
  const tablist = document.createElement('div');
  tablist.className = 'tabs-tablist';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Card categories');

  const panel = document.createElement('div');
  panel.className = 'tabs-panel';
  panel.id = `${instanceId}-panel`;
  panel.setAttribute('role', 'tabpanel');
  panel.tabIndex = 0;

  const grid = document.createElement('div');
  grid.className = 'tabs-card-grid';

  const empty = document.createElement('p');
  empty.className = 'tabs-empty';
  empty.hidden = true;
  empty.textContent = 'No cards have been assigned to this tab.';

  const state = {
    activeIndex: 0,
    buttons: [],
    cards,
    empty,
    grid,
    panel,
    tabs,
  };

  tabs.forEach((tab, index) => {
    const button = document.createElement('button');
    button.className = 'tabs-tab';
    button.type = 'button';
    button.id = `${instanceId}-tab-${tab.key || index}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.tabIndex = index === 0 ? 0 : -1;
    if (tab.labelField?.source) moveInstrumentation(tab.labelField.source, button);
    button.textContent = tab.label;
    button.addEventListener('click', () => setActiveTab(state, index));
    state.buttons.push(button);
    tablist.append(button);
  });

  bindKeyboard(state, tablist);
  panel.append(grid, empty);
  shell.append(tablist, panel);
  block.replaceChildren(shell);
  setActiveTab(state, 0);
}
