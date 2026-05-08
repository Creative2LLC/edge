import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function getField(row, colIndex, propName) {
  const field = readRichTextField(row, propName, { fallbackCell: row.children[colIndex] });
  return {
    source: field.source,
    text: field.text,
    html: field.html,
  };
}

function moveText(field, target, fallback = '') {
  if (!field?.source) {
    target.textContent = field?.text || fallback;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallback) {
    target.textContent = fallback;
  }
}

function moveHtml(field, target) {
  if (!field?.source) {
    target.innerHTML = field?.html || '';
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);
}

function setExpanded(item, expanded, immediate = false) {
  const button = item.querySelector('.faq-item-header');
  const panel = item.querySelector('.faq-item-panel');
  if (!button || !panel) return;

  if (expanded) {
    panel.hidden = false;
    window.requestAnimationFrame(() => {
      item.classList.add('faq-item-open');
      button.setAttribute('aria-expanded', 'true');
      panel.setAttribute('aria-hidden', 'false');
    });
    return;
  }

  item.classList.remove('faq-item-open');
  button.setAttribute('aria-expanded', 'false');
  panel.setAttribute('aria-hidden', 'true');

  if (immediate) {
    panel.hidden = true;
    return;
  }

  const onTransitionEnd = (event) => {
    if (event.target !== panel) return;
    if (!item.classList.contains('faq-item-open')) panel.hidden = true;
    panel.removeEventListener('transitionend', onTransitionEnd);
  };

  panel.addEventListener('transitionend', onTransitionEnd);
}

function buildFaqItem(row, index, items) {
  const questionField = getField(row, 0, 'question');
  const answerField = getField(row, 1, 'answer');
  const hasVisibleContent = Boolean(
    questionField.text || answerField.text || answerField.html,
  );
  const isAuthoringPlaceholder = hasAuthoringContext(row) && !hasVisibleContent;

  if (!hasVisibleContent && !isAuthoringPlaceholder) return null;

  const item = document.createElement('article');
  item.className = 'faq-item';
  item.style.setProperty('--faq-index', index);
  moveInstrumentation(row, item);

  if (isAuthoringPlaceholder) {
    item.classList.add('is-authoring-placeholder', 'faq-item-open');

    const body = document.createElement('div');
    body.className = 'faq-item-placeholder';

    const title = document.createElement('p');
    title.className = 'faq-item-placeholder-title';
    title.textContent = 'New FAQ item';

    const text = document.createElement('p');
    text.className = 'faq-item-placeholder-body';
    text.textContent = 'Add a question and answer in Universal Editor.';

    body.append(title, text);
    item.append(body);
    return item;
  }

  const questionId = `faq-question-${Math.random().toString(36).slice(2, 9)}`;
  const panelId = `faq-panel-${Math.random().toString(36).slice(2, 9)}`;

  const header = document.createElement('button');
  header.className = 'faq-item-header';
  header.type = 'button';
  header.id = questionId;
  header.setAttribute('aria-expanded', 'false');
  header.setAttribute('aria-controls', panelId);

  const questionEl = document.createElement('span');
  questionEl.className = 'faq-item-question';
  moveText(questionField, questionEl, questionField.text);

  const icon = document.createElement('span');
  icon.className = 'faq-item-icon';
  icon.setAttribute('aria-hidden', 'true');

  header.append(questionEl, icon);

  const panel = document.createElement('div');
  panel.className = 'faq-item-panel';
  panel.id = panelId;
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', questionId);
  panel.setAttribute('aria-hidden', 'true');

  const panelInner = document.createElement('div');
  panelInner.className = 'faq-item-panel-inner';

  const answerEl = document.createElement('div');
  answerEl.className = 'faq-item-answer';
  moveHtml(answerField, answerEl);
  panelInner.append(answerEl);
  panel.append(panelInner);

  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    items.forEach((faqItem) => {
      if (faqItem !== item) setExpanded(faqItem, false);
    });
    setExpanded(item, !expanded);
  });

  item.append(header, panel);
  return item;
}

function buildPlaceholderItem() {
  const item = document.createElement('article');
  item.className = 'faq-item is-authoring-placeholder faq-item-open';
  item.style.setProperty('--faq-index', '0');

  const body = document.createElement('div');
  body.className = 'faq-item-placeholder';

  const title = document.createElement('p');
  title.className = 'faq-item-placeholder-title';
  title.textContent = 'Add FAQ items';

  const text = document.createElement('p');
  text.className = 'faq-item-placeholder-body';
  text.textContent = 'Use Universal Editor to add child FAQ items under this block.';

  body.append(title, text);
  item.append(body);
  return item;
}

function observeReveal(block) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    block.classList.add('is-visible');
    observer.disconnect();
  }, {
    threshold: 0.18,
  });

  observer.observe(block);
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const headingField = readTextField(block, 'heading');
  const headingText = headingField.value;
  const children = [];
  const items = [];

  if (headingText) {
    const heading = document.createElement('h2');
    heading.className = 'faq-heading';
    moveText(headingField, heading, headingText);
    children.push(heading);
  }

  rows.forEach((row, index) => {
    const cols = [...row.children];
    if (cols.length < 2 && !row.querySelector('[data-aue-prop="question"]')) return;

    const item = buildFaqItem(row, index, items);
    if (!item) return;

    items.push(item);
    children.push(item);
  });

  if (!items.length && isAuthoring) {
    children.push(buildPlaceholderItem());
  }

  block.replaceChildren(...children);
  observeReveal(block);
}
