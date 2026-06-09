import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getFieldSelector,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const TAB_FIELD_NAMES = ['tabLabel', 'tabId'];
const CARD_FIELD_NAMES = ['tabLabels', 'title', 'bodyContent', 'linkText', 'link'];
const COMPONENT_NAMES = ['tabs-tab', 'tabs-info-card'];

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

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function ownComponentName(element) {
  if (!element) return '';

  const model = element.getAttribute('data-aue-model')
    || element.getAttribute('data-block-name')
    || '';
  if (model) return normalizeKey(model);

  const resource = element.getAttribute('data-aue-resource') || '';
  const match = resource.match(/(\/content\/[^?#]+)/);
  const segments = (match ? match[1] : resource).split('/').filter(Boolean);
  const last = normalizeKey(segments.at(-1) || '');
  return last.replace(/-\d+$/u, '');
}

function componentName(element) {
  const ownName = ownComponentName(element);
  if (ownName) return ownName;

  const directComponent = [...(element?.children || [])]
    .find((child) => ownComponentName(child));
  return ownComponentName(directComponent);
}

function componentElement(element, name) {
  if (!element) return null;
  if (ownComponentName(element) === name) return element;

  const directMatch = [...(element.children || [])]
    .find((child) => ownComponentName(child) === name);
  if (directMatch) return directMatch;

  return [...(element.querySelectorAll?.('[data-aue-model], [data-block-name], [data-aue-resource]') || [])]
    .find((candidate) => ownComponentName(candidate) === name) || null;
}

function rowLabel(row) {
  return normalizeKey(row?.children?.[0]?.textContent || '');
}

function directRows(scope) {
  return [...(scope?.querySelectorAll?.(':scope > div') || [])];
}

function hasOwnField(row, names) {
  return names.some((name) => {
    const selector = getFieldSelector(name);
    if (row.matches?.(selector)) return true;

    return directRows(row).some((child) => {
      if (COMPONENT_NAMES.includes(componentName(child))) return false;
      return child.matches?.(selector) || Boolean(child.querySelector?.(selector));
    });
  });
}

function isTabRow(row) {
  return componentName(row) === 'tabs-tab' || hasOwnField(row, TAB_FIELD_NAMES);
}

function isCardRow(row) {
  return componentName(row) === 'tabs-info-card' || hasOwnField(row, CARD_FIELD_NAMES);
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

function getRowTextField(row, name, fallbackRow) {
  return readTextField(row, name, { fallbackCell: fieldCell(fallbackRow) });
}

function getRowRichField(row, name, fallbackRow) {
  return readRichTextField(row, name, { fallbackCell: fieldCell(fallbackRow) });
}

function getRowLinkField(row, name, fallbackRow) {
  return readLinkField(row, name, { fallbackCell: fieldCell(fallbackRow) });
}

function getBlockRichField(block, name, labels = [], fallbackRow = null) {
  return readRichTextField(block, name, {
    fallbackCell: fieldCell(fallbackRow),
    labels: [name, ...labels],
  });
}

function getBlockTextField(block, name, labels = [], fallbackRow = null) {
  return readTextField(block, name, {
    fallbackCell: fieldCell(fallbackRow),
    labels: [name, ...labels],
  });
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

function tabOwnRows(tabRow) {
  const tabElement = componentElement(tabRow, 'tabs-tab') || tabRow;
  return directRows(tabElement).filter((row) => !isCardRow(row));
}

function findNestedCardRows(tabRow) {
  const tabElement = componentElement(tabRow, 'tabs-tab') || tabRow;
  const directCardRows = directRows(tabElement).filter(isCardRow);

  const nestedCardRows = [...tabElement.querySelectorAll('[data-aue-model], [data-block-name], [data-aue-resource]')]
    .filter((candidate) => candidate !== tabElement && isCardRow(candidate));
  const candidates = [...directCardRows, ...nestedCardRows]
    .map((candidate) => componentElement(candidate, 'tabs-info-card') || candidate)
    .filter((candidate, index, collection) => collection.indexOf(candidate) === index);

  return candidates.filter((candidate, index) => {
    const nestedParent = candidates.find((other, otherIndex) => (
      otherIndex !== index
        && other.contains(candidate)
        && isCardRow(other)
    ));
    return !nestedParent;
  });
}

function readCard(row, index) {
  const cardElement = componentElement(row, 'tabs-info-card') || row;
  const rows = directRows(cardElement);
  const hasTabLabels = (
    hasOwnField(cardElement, ['tabLabels'])
      || rowLabel(rows[0]) === 'tab-labels'
      || rows.length >= 5
  );
  const offset = hasTabLabels ? 1 : 0;
  const tabField = hasTabLabels ? getRowTextField(cardElement, 'tabLabels', rows[0]) : { value: '' };
  const titleField = getRowRichField(cardElement, 'title', rows[offset]);
  const bodyField = getRowRichField(cardElement, 'bodyContent', rows[offset + 1]);
  const linkTextField = getRowTextField(cardElement, 'linkText', rows[offset + 2]);
  const linkField = getRowLinkField(cardElement, 'link', rows[offset + 3]);
  const tabLabels = splitLabels(tabField.value);

  return {
    index,
    row: cardElement,
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

function readTab(row, index, isAuthoring) {
  const tabElement = componentElement(row, 'tabs-tab') || row;
  const rows = tabOwnRows(tabElement);
  const labelField = getRowTextField(tabElement, 'tabLabel', rows[0]);
  const label = labelField.value || `Tab ${index + 1}`;
  const idField = getRowTextField(tabElement, 'tabId', rows[1]);
  const key = normalizeKey(idField.value || label);
  const cards = findNestedCardRows(tabElement)
    .map((cardRow, cardIndex) => readCard(cardRow, cardIndex))
    .filter((card) => card.hasContent || isAuthoring)
    .map((card) => ({ ...card, element: buildCard(card) }));

  return {
    cards,
    key,
    label,
    labelField,
    row: tabElement,
  };
}

function deriveFlatTabs(tabRows, cards, isAuthoring) {
  const tabs = tabRows.map((row, index) => readTab(row, index, isAuthoring));
  if (tabs.length) return tabs;

  const seen = new Set();
  const derived = [];
  cards.forEach((card) => {
    card.tabLabels.forEach((label) => {
      const key = normalizeKey(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      derived.push({
        cards: cards.filter((candidate) => candidate.tabKeys.includes(key)),
        key,
        label,
      });
    });
  });

  if (!derived.length && cards.length) {
    derived.push({
      cards,
      key: 'all-services',
      label: 'All Services',
    });
  }

  return derived;
}

function uniqueCards(cards) {
  const seen = new Set();
  return cards.filter((card) => {
    if (seen.has(card)) return false;
    seen.add(card);
    return true;
  });
}

function allCardsForTabs(tabs, flatCards) {
  return uniqueCards([...tabs.flatMap((tab) => tab.cards || []), ...flatCards]);
}

function cardsForTab(tab, allCards, flatCards) {
  if (isAllTab(tab)) return allCards;
  return uniqueCards([
    ...(tab.cards || []),
    ...flatCards.filter((card) => card.tabKeys.includes(tab.key)),
  ]);
}

function setActiveTab(state, index) {
  state.activeIndex = index;
  const activeTab = state.tabs[index];
  const activeCards = cardsForTab(activeTab, state.allCards, state.flatCards);

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

function firstDirectRowsByType(block, predicate) {
  return directRows(block).filter(predicate);
}

function fieldText(row) {
  return fieldCell(row)?.textContent?.trim() || '';
}

function isColumnsValue(value) {
  return /^[1-4]$/u.test(String(value || '').trim());
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const tabRows = firstDirectRowsByType(block, isTabRow);
  const flatCardRows = firstDirectRowsByType(
    block,
    (row) => isCardRow(row) && !tabRows.includes(row),
  );
  const flatCards = flatCardRows
    .map((row, index) => readCard(row, index))
    .filter((card) => card.hasContent || isAuthoring)
    .map((card) => ({ ...card, element: buildCard(card) }));
  const tabs = deriveFlatTabs(tabRows, flatCards, isAuthoring);
  const allCards = allCardsForTabs(tabs, flatCards);
  const fieldRows = directRows(block).filter((row) => !isTabRow(row) && !isCardRow(row));
  const columnsFallbackRow = [...fieldRows].reverse().find((row) => isColumnsValue(fieldText(row)));
  const contentFallbackRows = fieldRows.filter((row) => row !== columnsFallbackRow);
  const headingField = getBlockRichField(block, 'heading', [], contentFallbackRows[0]);
  const subheadingField = getBlockRichField(block, 'subheading', [], contentFallbackRows[1]);
  const columnsField = getBlockTextField(block, 'columns', ['cards per row'], columnsFallbackRow);
  const columns = Math.max(1, Math.min(4, parseInt(columnsField.value, 10) || 3));

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
      ? 'Add Tab items under this block, then add Tabs Info Card items inside each Tab.'
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
  empty.textContent = 'Add card items inside this tab.';

  const state = {
    activeIndex: 0,
    allCards,
    buttons: [],
    empty,
    flatCards,
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
