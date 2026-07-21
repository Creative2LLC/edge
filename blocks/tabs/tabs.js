import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getFieldSelector,
  readAueResourceFields,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
  resourcePathFromAueResource,
  setItemLabel,
} from '../../scripts/block-field-utils.js';

// Beyond this many tabs the tablist becomes a single horizontal scroller
// instead of wrapping onto multiple rows.
const TAB_SCROLL_THRESHOLD = 9;
// Highest tab number a card can be assigned to (matches the tabIndex model).
const MAX_TAB_INDEX = 15;

const TAB_FIELD_NAMES = ['tabLabel', 'tabId'];
const TAB_LABEL_FIELD_NAMES = ['label', 'tabLabel'];
const CARD_FIELD_NAMES = ['tabIndex', 'tabLabels', 'title', 'bodyContent', 'linkText', 'link'];
const COMPONENT_NAMES = ['tabs-tab', 'tabs-tab-label', 'tabs-info-card'];
const CARD_RESOURCE_FIELDS = ['tabIndex', 'title', 'bodyContent', 'linkText', 'link'];
const cardResourceCache = new Map();

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

  const label = normalizeKey(element.getAttribute('data-aue-label') || '');
  if (COMPONENT_NAMES.includes(label)) return label;

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

function isTabLabelRow(row) {
  return componentName(row) === 'tabs-tab-label' || hasOwnField(row, TAB_LABEL_FIELD_NAMES);
}

function isCardRow(row) {
  return componentName(row) === 'tabs-info-card' || hasOwnField(row, CARD_FIELD_NAMES);
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

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeResourceRichText(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(normalizeResourceRichText).filter(Boolean).join('');
  if (typeof value === 'object') {
    return String(value.html || value.value || value.text || value.label || value.name || '').trim();
  }
  return String(value).trim();
}

function applyRichResourceFallback(field, resourceValue) {
  const html = normalizeResourceRichText(resourceValue);
  if (richFieldHasContent(field) || !html) return field;
  return {
    ...field,
    html,
    text: stripHtml(html),
  };
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

function resourcePathForCard(cardElement, fields = []) {
  const resource = cardElement?.getAttribute?.('data-aue-resource')
    || fields.find((field) => field?.source?.getAttribute?.('data-aue-resource'))
      ?.source?.getAttribute('data-aue-resource')
    || cardElement?.querySelector?.('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';

  return resourcePathFromAueResource(resource);
}

async function readCardResourceFields(cardElement, fields = []) {
  const resourcePath = resourcePathForCard(cardElement, fields);
  if (!resourcePath) return {};
  if (cardResourceCache.has(resourcePath)) return cardResourceCache.get(resourcePath);

  const pendingFields = readAueResourceFields(resourcePath, CARD_RESOURCE_FIELDS);
  cardResourceCache.set(resourcePath, pendingFields);
  return pendingFields;
}

function normalizeResourceText(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(normalizeResourceText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return String(value.value || value.text || value.label || value.name || '').trim();
  }
  return String(value).trim();
}

function normalizeResourceLink(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    return String(value.href || value.path || value.url || value.value || '').trim();
  }
  return String(value).trim();
}

function flattenRawValues(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenRawValues);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenRawValues);
  return [value];
}

function useLegacyRowFallbacks(cardElement) {
  return !hasAuthoringContext(cardElement);
}

function legacyRow(row, useLegacyRows) {
  return useLegacyRows ? row : null;
}

function tabOwnRows(tabRow) {
  const tabElement = componentElement(tabRow, 'tabs-tab') || tabRow;
  return directRows(tabElement).filter((row) => !isCardRow(row));
}

function findTabLabelRow(tabRow) {
  const tabElement = componentElement(tabRow, 'tabs-tab') || tabRow;
  return directRows(tabElement).find(isTabLabelRow)
    || [...tabElement.querySelectorAll('[data-aue-model], [data-block-name], [data-aue-resource]')]
      .find((candidate) => candidate !== tabElement && isTabLabelRow(candidate))
    || null;
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

function parseTabIndices(rawValue, sourceEl) {
  // AEM may render string[] values as child list/block elements; read each child first.
  const childValues = [];
  if (sourceEl) {
    const childEls = [...(sourceEl.querySelectorAll?.('li, p') || [])];
    if (childEls.length) {
      childValues.push(...childEls.map((el) => el.textContent.trim()).filter(Boolean));
    }
  }

  const values = childValues.length ? childValues : flattenRawValues(rawValue);
  const nums = values
    .flatMap((value) => String(value || '').replace(/[[\]"']/g, '').match(/\d+/gu) || [])
    .map((value) => parseInt(value, 10))
    .filter((n) => n >= 1 && n <= MAX_TAB_INDEX);
  const unique = [...new Set(nums)];
  return unique.length ? unique : [1];
}

async function readCard(row, index) {
  const cardElement = componentElement(row, 'tabs-info-card') || row;
  const rows = directRows(cardElement);

  // rows[0] may be a legacy assignment field (tabLabels/tabName) or the new tabIndex field
  const firstLabel = rowLabel(rows[0]);
  const hasLeadField = (
    hasOwnField(cardElement, ['tabIndex', 'tabLabels', 'tabName'])
      || firstLabel === 'tab-index'
      || firstLabel === 'tab-labels'
      || firstLabel === 'tab-name'
  );
  const offset = hasLeadField ? 1 : 0;

  const tabIndexSources = [...(cardElement.querySelectorAll?.('[data-aue-prop="tabIndex"], [data-richtext-prop="tabIndex"]') || [])];
  const tabIndexSource = tabIndexSources[0] || null;
  const useLegacyRows = useLegacyRowFallbacks(cardElement);
  const tabIndexRaw = tabIndexSources.length > 1
    ? tabIndexSources.map((el) => el.textContent.trim()).filter(Boolean).join(',')
    : getRowTextField(
      cardElement,
      'tabIndex',
      legacyRow(hasLeadField ? rows[0] : null, useLegacyRows),
    ).value;

  const titleField = getRowRichField(cardElement, 'title', legacyRow(rows[offset], useLegacyRows));
  const bodyField = getRowRichField(cardElement, 'bodyContent', legacyRow(rows[offset + 1], useLegacyRows));
  const linkTextField = getRowTextField(
    cardElement,
    'linkText',
    legacyRow(rows[offset + 2], useLegacyRows),
  );
  const linkField = getRowLinkField(cardElement, 'link', legacyRow(rows[offset + 3], useLegacyRows));
  const resourceFields = await readCardResourceFields(cardElement, [
    tabIndexSource ? { source: tabIndexSource } : null,
    titleField,
    bodyField,
    linkTextField,
    linkField,
  ]);
  const tabIndices = parseTabIndices(resourceFields.tabIndex || tabIndexRaw, tabIndexSource);
  const resolvedTitleField = applyRichResourceFallback(titleField, resourceFields.title);
  const resolvedBodyField = applyRichResourceFallback(bodyField, resourceFields.bodyContent);
  const linkTextValue = linkTextField.value || normalizeResourceText(resourceFields.linkText);
  const linkValue = linkField.value || normalizeResourceLink(resourceFields.link);

  return {
    index,
    row: cardElement,
    tabIndices,
    tabLabels: [],
    tabKeys: [],
    titleField: resolvedTitleField,
    bodyField: resolvedBodyField,
    tabIndexField: { source: tabIndexSource, value: tabIndexRaw },
    linkTextField: { ...linkTextField, value: linkTextValue },
    linkField: { ...linkField, value: linkValue },
    hasContent: richFieldHasContent(resolvedTitleField) || richFieldHasContent(resolvedBodyField),
  };
}

function buildTabIcon(iconField) {
  const media = iconField?.picture?.cloneNode(true)
    || (iconField?.img ? iconField.img.cloneNode(true) : null);
  if (!media) return null;

  const wrap = document.createElement('span');
  wrap.className = 'tabs-tab-icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.append(media);
  return wrap;
}

function buildHiddenField(field, className) {
  if (!field?.source) return null;

  const hidden = document.createElement('span');
  hidden.className = className;
  hidden.hidden = true;
  appendTextField(field, hidden, field.value);
  return hidden;
}

function buildCardLink(card) {
  const href = card.linkField.value;
  const label = card.linkTextField.value;
  if (!href && !label && !card.linkTextField.source && !card.linkField.source) return null;

  const link = document.createElement(href ? 'a' : 'span');
  link.className = 'tabs-card-link';
  if (href) link.href = href;
  if (card.linkField.source) moveInstrumentation(card.linkField.source, link);

  const labelElement = document.createElement('span');
  labelElement.className = 'tabs-card-link-text';
  appendTextField(card.linkTextField, labelElement, label || 'Learn more');
  link.append(labelElement);

  return link;
}

function buildCard(card, options = {}) {
  const article = options.inPlace && card.row ? card.row : document.createElement('article');
  article.classList.add('tabs-card');
  article.style.setProperty('--tabs-card-index', card.index);
  if (!options.inPlace && card.row) moveInstrumentation(card.row, article);
  if (options.inPlace) article.replaceChildren();
  setItemLabel(article, [card.titleField?.text, card.bodyField?.text]);

  const tabIndexTarget = buildHiddenField(card.tabIndexField, 'tabs-card-tab-index');
  if (tabIndexTarget) article.append(tabIndexTarget);

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

  const link = buildCardLink(card);
  if (link) {
    article.append(link);
  }

  return article;
}

async function readTab(row, index, isAuthoring) {
  const tabElement = componentElement(row, 'tabs-tab') || row;
  const rows = tabOwnRows(tabElement);
  const labelRow = findTabLabelRow(tabElement);
  const labelElement = componentElement(labelRow, 'tabs-tab-label') || labelRow;
  const labelRows = directRows(labelElement);
  const labelField = labelElement
    ? getRowTextField(labelElement, 'label', labelRows[0])
    : getRowTextField(tabElement, 'tabLabel', rows[0]);
  const label = labelField.value || `Tab ${index + 1}`;
  const iconField = readImageField(labelElement || tabElement, 'icon', {
    fallbackCell: labelElement ? fieldCell(labelRows[1]) : null,
  });
  const idField = getRowTextField(tabElement, 'tabId', rows[1]);
  const key = normalizeKey(idField.value || label);
  const readCards = await Promise.all(
    findNestedCardRows(tabElement)
      .map((cardRow, cardIndex) => readCard(cardRow, cardIndex)),
  );
  const cards = readCards
    .filter((card) => card.hasContent || isAuthoring)
    .map((card) => ({ ...card, element: buildCard(card, { inPlace: isAuthoring }) }));

  return {
    cards,
    key,
    label,
    labelField,
    iconField,
    row: tabElement,
  };
}

async function deriveFlatTabs(tabRows, cards, isAuthoring) {
  const tabs = await Promise.all(tabRows.map((row, index) => readTab(row, index, isAuthoring)));
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
        iconField: null,
      });
    });
  });

  if (!derived.length && cards.length) {
    derived.push({
      cards,
      key: 'all-services',
      label: 'All Services',
      iconField: null,
    });
  }

  return derived;
}

async function buildFlatTabs(allRows) {
  const tabs = [];

  // First pass: collect tab labels in DOM order (AEM groups all labels first)
  allRows.forEach((row) => {
    if (!isTabLabelRow(row)) return;
    const labelElement = componentElement(row, 'tabs-tab-label') || row;
    const labelRows = directRows(labelElement);
    const labelField = getRowTextField(labelElement, 'label', labelRows[0]);
    const label = labelField.value || `Tab ${tabs.length + 1}`;
    const key = normalizeKey(label);
    const iconField = readImageField(labelElement, 'icon', {
      fallbackCell: fieldCell(labelRows[1]),
    });
    tabs.push({
      cards: [], key, label, labelField, iconField, labelRow: row, row: null,
    });
  });

  // Second pass: assign cards by tabIndices field — order-independent, works even when
  // AEM groups all cards at the bottom after all label items. Each card may belong to
  // multiple tabs (multiselect).
  const cardRows = allRows.filter(isCardRow);
  const readCards = await Promise.all(cardRows.map((row, index) => readCard(row, index)));
  const flatCards = readCards.reduce((cards, card) => {
    const tabKeys = card.tabIndices
      .map((i) => (tabs[i - 1] ? tabs[i - 1].key : null))
      .filter(Boolean);
    // Fall back to first tab if no valid indices
    let keys = tabKeys;
    if (!keys.length && tabs.length) {
      keys = [tabs[0].key];
    }
    if (keys.length) cards.push({ ...card, tabKeys: keys });
    return cards;
  }, []);

  return { tabs, flatCards };
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

function renderPanelCards(panelState, cards) {
  if (panelState.preserveChildren) {
    panelState.empty.hidden = Boolean(cards.length);
    return;
  }

  panelState.grid.replaceChildren();

  if (!cards.length) {
    panelState.empty.hidden = false;
    panelState.grid.hidden = true;
    return;
  }

  panelState.empty.hidden = true;
  panelState.grid.hidden = false;
  // All-tab panels clone card elements so originals stay in their individual panels
  // (important in authoring mode where elements carry AUE instrumentation).
  if (panelState.cloneCards) {
    cards.forEach((card) => panelState.grid.append(card.element.cloneNode(true)));
  } else {
    cards.forEach((card) => panelState.grid.append(card.element));
  }
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

  state.panels.forEach((panelState, panelIndex) => {
    const isActive = panelIndex === index;
    panelState.panel.hidden = !isActive;
    panelState.panel.classList.toggle('is-active', isActive);
    if (isActive) renderPanelCards(panelState, activeCards);
  });
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

function createTabPanel(tab, index, instanceId, isAuthoring) {
  const panel = tab.row || document.createElement('div');
  panel.classList.add('tabs-panel');
  panel.id = `${instanceId}-panel-${tab.key || index}`;
  panel.setAttribute('role', 'tabpanel');
  panel.tabIndex = 0;

  const allTab = isAllTab(tab);

  const empty = document.createElement('p');
  empty.className = 'tabs-empty';
  empty.hidden = true;
  empty.textContent = 'No cards assigned to this tab. Add a Tabs Info Card and set its Tab(s) field to include this tab\'s number.';

  if (isAuthoring && tab.row) {
    panel.classList.add('tabs-card-grid');
    findTabLabelRow(panel)?.setAttribute('hidden', '');
    panel.append(empty);
    return {
      empty,
      grid: panel,
      panel,
      preserveChildren: true,
      cloneCards: false,
    };
  }

  const grid = document.createElement('div');
  grid.className = 'tabs-card-grid';
  panel.replaceChildren(grid, empty);

  return {
    empty,
    grid,
    panel,
    preserveChildren: false,
    // All-tab always clones so originals stay in individual panels (critical in authoring mode)
    cloneCards: allTab,
  };
}

export default async function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const allBlockRows = directRows(block);
  const hasFlatLabels = allBlockRows.some((row) => componentName(row) === 'tabs-tab-label');

  let tabs;
  let flatCards;

  if (hasFlatLabels) {
    const flatResult = await buildFlatTabs(allBlockRows);
    tabs = flatResult.tabs;
    flatCards = flatResult.flatCards
      .filter((card) => card.hasContent || isAuthoring)
      .map((card) => ({ ...card, element: buildCard(card, { inPlace: isAuthoring }) }));
    if (tabs.length > 1) {
      tabs = [
        {
          cards: [],
          key: 'all',
          label: 'All',
          labelField: { value: 'All' },
          iconField: null,
          labelRow: null,
          row: null,
        },
        ...tabs,
      ];
    }
  } else {
    const tabRows = firstDirectRowsByType(block, isTabRow);
    const flatCardRows = firstDirectRowsByType(
      block,
      (row) => isCardRow(row) && !tabRows.includes(row),
    );
    const readCards = await Promise.all(flatCardRows.map((row, index) => readCard(row, index)));
    flatCards = readCards
      .filter((card) => card.hasContent || isAuthoring)
      .map((card) => ({ ...card, element: buildCard(card) }));
    tabs = await deriveFlatTabs(tabRows, flatCards, isAuthoring);
  }

  const allCards = allCardsForTabs(tabs, flatCards);
  const fieldRows = allBlockRows.filter(
    (row) => !isTabLabelRow(row) && !isTabRow(row) && !isCardRow(row),
  );
  const columnsFallbackRow = [...fieldRows].reverse().find((row) => isColumnsValue(fieldText(row)));
  const contentFallbackRows = fieldRows.filter((row) => row !== columnsFallbackRow);
  const headingField = getBlockRichField(block, 'heading', [], contentFallbackRows[0]);
  const subheadingField = getBlockRichField(block, 'subheading', [], contentFallbackRows[1]);
  const columnsField = getBlockTextField(block, 'columns', ['cards per row'], columnsFallbackRow);
  const columns = Math.max(1, Math.min(4, parseInt(columnsField.value, 10) || 4));

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
      ? 'Add Tabs Tab Label items (one per tab), then add Tabs Info Card items and set each card\'s Tab Number.'
      : '';
    block.replaceChildren(shell, placeholder);
    return;
  }

  const instanceId = `tabs-${Math.random().toString(36).slice(2, 9)}`;
  const tablist = document.createElement('div');
  tablist.className = 'tabs-tablist';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Card categories');
  // Many tabs wrap onto several rows and look cluttered; switch to a single
  // horizontal scroller once the count grows past the threshold.
  if (tabs.length > TAB_SCROLL_THRESHOLD) tablist.classList.add('is-scroll');

  const panels = document.createElement('div');
  panels.className = 'tabs-panels';

  const state = {
    activeIndex: 0,
    allCards,
    buttons: [],
    flatCards,
    panels: [],
    tabs,
  };

  tabs.forEach((tab, index) => {
    const panelState = createTabPanel(tab, index, instanceId, isAuthoring);
    state.panels.push(panelState);
    panels.append(panelState.panel);

    const button = document.createElement('button');
    button.className = 'tabs-tab';
    button.type = 'button';
    button.id = `${instanceId}-tab-${tab.key || index}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelState.panel.id);
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.tabIndex = index === 0 ? 0 : -1;
    if (tab.labelRow) {
      moveInstrumentation(tab.labelRow, button);
    } else if (!isAuthoring && tab.labelField?.source) {
      moveInstrumentation(tab.labelField.source, button);
    }
    setItemLabel(button, [tab.label]);

    const icon = buildTabIcon(tab.iconField);
    if (icon) button.append(icon);
    const labelSpan = document.createElement('span');
    labelSpan.className = 'tabs-tab-label';
    labelSpan.textContent = tab.label;
    button.append(labelSpan);

    button.addEventListener('click', () => setActiveTab(state, index));
    state.buttons.push(button);
    tablist.append(button);
  });

  if (hasFlatLabels && isAuthoring) {
    const primaryElements = new Set();
    state.panels.forEach((panelState, index) => {
      const tab = tabs[index];
      // Skip synthetic tabs (All) — they have no original DOM row to preserve
      if (isAllTab(tab)) return;
      const tabCards = cardsForTab(tab, allCards, flatCards);

      // Cards that appear in multiple tabs: use the instrumented element on first
      // occurrence and a visual clone on subsequent ones.
      panelState.grid.replaceChildren();
      panelState.empty.hidden = Boolean(tabCards.length);
      panelState.grid.hidden = !tabCards.length;
      tabCards.forEach((card) => {
        if (primaryElements.has(card.element)) {
          panelState.grid.append(card.element.cloneNode(true));
        } else {
          primaryElements.add(card.element);
          panelState.grid.append(card.element);
        }
      });

      panelState.preserveChildren = true;
    });
  }

  bindKeyboard(state, tablist);
  shell.append(tablist, panels);
  block.replaceChildren(shell);
  setActiveTab(state, 0);
}
