import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(row, colIndex, propName) {
  const source = row.querySelector(
    `[data-aue-prop="${propName}"], [data-richtext-prop="${propName}"]`,
  );
  if (source) {
    return {
      source,
      text: source.textContent.trim(),
      html: source.innerHTML,
    };
  }

  const cols = [...row.children];
  const cell = cols[colIndex];
  if (!cell) {
    return {
      source: null,
      text: '',
      html: '',
    };
  }

  return {
    source: null,
    text: cell.textContent.trim(),
    html: cell.innerHTML,
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

  if (!questionField.text && !answerField.text && !answerField.html) return null;

  const item = document.createElement('article');
  item.className = 'faq-item';
  item.style.setProperty('--faq-index', index);
  moveInstrumentation(row, item);

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
  const rows = [...block.querySelectorAll(':scope > div')];
  const headingSource = block.querySelector('[data-aue-prop="heading"]');
  const headingText = headingSource?.textContent.trim() || '';

  const container = document.createElement('div');
  container.className = 'faq-inner';

  if (headingText) {
    const heading = document.createElement('h2');
    heading.className = 'faq-heading';
    moveText({ source: headingSource, text: headingText }, heading, headingText);
    container.append(heading);
  }

  const items = [];
  rows.forEach((row, index) => {
    const cols = [...row.children];
    if (cols.length < 2 && !row.querySelector('[data-aue-prop="question"]')) return;

    const item = buildFaqItem(row, index, items);
    if (!item) return;

    items.push(item);
    container.append(item);
  });

  block.replaceChildren(container);
  observeReveal(block);
}
