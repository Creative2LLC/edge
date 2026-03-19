import { moveInstrumentation } from '../../scripts/scripts.js';

function getFieldText(row, colIndex, propName) {
  const byProp = row.querySelector(`[data-aue-prop="${propName}"]`);
  if (byProp) return byProp.textContent.trim();
  const cols = [...row.children];
  if (cols[colIndex]) return cols[colIndex].textContent.trim();
  return '';
}

function getFieldHtml(row, colIndex, propName) {
  const byProp = row.querySelector(`[data-aue-prop="${propName}"]`);
  if (byProp) return byProp.innerHTML;
  const cols = [...row.children];
  if (cols[colIndex]) return cols[colIndex].innerHTML;
  return '';
}

function buildFaqItem(row) {
  const question = getFieldText(row, 0, 'question');
  const answer = getFieldHtml(row, 1, 'answer');
  if (!question) return null;

  const item = document.createElement('div');
  item.className = 'frequently-asked-questions-item';
  moveInstrumentation(row, item);

  // Header (question + toggle icon)
  const header = document.createElement('button');
  header.className = 'frequently-asked-questions-item-header';
  header.type = 'button';
  header.setAttribute('aria-expanded', 'false');

  const questionEl = document.createElement('span');
  questionEl.className = 'frequently-asked-questions-item-question';
  questionEl.textContent = question;

  const icon = document.createElement('span');
  icon.className = 'frequently-asked-questions-item-icon';
  icon.setAttribute('aria-hidden', 'true');

  header.append(questionEl, icon);

  // Answer panel
  const panel = document.createElement('div');
  panel.className = 'frequently-asked-questions-item-panel';

  const answerEl = document.createElement('div');
  answerEl.className = 'frequently-asked-questions-item-answer';
  answerEl.innerHTML = answer;
  panel.append(answerEl);

  // Toggle
  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', String(!expanded));
    item.classList.toggle('frequently-asked-questions-item-open', !expanded);
  });

  item.append(header, panel);
  return item;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  // Read optional heading (block-level field)
  const headingEl = block.querySelector('[data-aue-prop="heading"]');
  const headingText = headingEl?.textContent.trim() || '';

  const container = document.createElement('div');
  container.className = 'frequently-asked-questions-inner';

  if (headingText) {
    const h2 = document.createElement('h2');
    h2.className = 'frequently-asked-questions-heading';
    h2.textContent = headingText;
    container.append(h2);
  }

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;
    const item = buildFaqItem(row);
    if (item) container.append(item);
  });

  block.replaceChildren(container);
}
