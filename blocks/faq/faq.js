import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getFieldSelector,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const FAQ_BLOCK_FIELD_NAMES = ['heading', 'preset'];

const AMBER_CONTACTS = [
  ['Alabama', 'Alabama State Bureau of Investigations', ['1-800-228-7688']],
  ['Alaska', 'Fairbanks Dispatch Center', ['907-451-5100']],
  ['Arizona', 'Arizona Department of Public Safety', ['602-223-2212']],
  ['Arkansas', 'Arkansas State Police', ['501-618-8100']],
  ['California', 'California Highway Patrol', ['1-800-TELL-CHP (1-800-835-5247)']],
  ['Colorado', 'Colorado Bureau of Investigation', ['303-239-4211']],
  ['Connecticut', 'Connecticut State Police', ['860-685-8190']],
  ['Delaware', 'Delaware State Police Communications', ['302-739-5901']],
  ['District of Columbia', 'Metropolitan Police Department', ['202-727-9099']],
  ['Florida', 'Florida Department of Law Enforcement', ['Missing Children Information Clearinghouse', '1-888-356-4774']],
  ['Georgia', 'Georgia Bureau of Investigation', ['404-244-2600']],
  ['Hawaii', 'Missing Child Center-Hawaii', ['Department of the Attorney General', '808-753-9797', 'hawaiimissingkids@hawaii.gov']],
  ['Idaho', 'Idaho State Police', ['208-884-7000']],
  ['Illinois', 'Illinois State Police', ['217-786-6677', 'missing@isp.state.il.us']],
  ['Indiana', 'Indiana State Police', ['1-800-831-8953', 'MissingChildren@isp.IN.gov']],
  ['Iowa', 'Iowa State Patrol Communications', ['515-323-4360']],
  ['Kansas', 'Kansas Bureau of Investigation', ['785-296-8262', '1-800-KS CRIME']],
  ['Kentucky', 'Kentucky State Police', ['502-227-2221']],
  ['Louisiana', 'Louisiana Clearinghouse for Missing & Exploited Children', ['225-925-6536 or 6636']],
  ['Maine', 'Maine State Police', ['207-624-7076']],
  ['Maryland', 'Maryland State Police', ['800-637-5437']],
  ['Massachusetts', 'Massachusetts State Police', ['508-820-2121']],
  ['Michigan', 'Michigan State Police', ['1-800-525-5555', '517-241-8000']],
  ['Minnesota', 'Bureau of Criminal Apprehension', ['651-793-7000']],
  ['Mississippi', 'Mississippi Highway Patrol', ['601-987-1212 or 1530']],
  ['Missouri', 'Missouri State Highway Patrol, Troop F', ['573-751-1000']],
  ['Montana', 'Montana Department of Justice', ['406-444-2800']],
  ['Nebraska', 'Nebraska State Patrol', ['308-385-6000']],
  ['Nevada', 'Nevada Highway Patrol', ['775-687-0400']],
  ['New Hampshire', 'New Hampshire State Police', ['603-271-3636']],
  ['New Jersey', 'New Jersey State Police', ['Missing Persons Unit', '609-963-6900']],
  ['New Mexico', 'New Mexico State Police', ['505-795-2793']],
  ['New York', 'New York State Police', ['NYSP Special Victims Unit', 'The NYS AMBER Alert Coordinator Office', '518-457-6811', 'NYSPSVU@troopers.ny.gov']],
  ['North Carolina', 'North Carolina Center for Missing Persons', ['1-800-522-5437']],
  ['North Dakota', 'North Dakota State Police', ['701-328-9921']],
  ['Ohio', 'Department of Public Safety', ['Emergency Operations Center', '614-466-2660']],
  ['Oklahoma', 'Oklahoma Highway Patrol Communications Center', ['405-425-2231']],
  ['Oregon', 'Oregon State Police Communications Center', ['503-375-3555']],
  ['Pennsylvania', 'Pennsylvania State Police', ['717-346-5430']],
  ['Puerto Rico', 'Puerto Rico Police Department', ['787-782-9006']],
  ['Rhode Island', 'Rhode Island State Police', ['401-444-1000']],
  ['South Carolina', 'South Carolina Law Enforcement Division (SLED)', ['803-737-9000']],
  ['South Dakota', 'Division of Criminal Intelligence Analyst', ['605-773-7281', 'Pierre State Radio', '605-773-3536']],
  ['Tennessee', 'Tennessee Bureau of Investigation', ['615-744-4000']],
  ['Texas', 'Texas Department of Public Safety', ['Missing Persons Toll-Free Line: (800) 346-3243']],
  ['Utah', 'Utah Department of Public Safety', ['801-652-6287']],
  ['Vermont', 'Vermont State Police', ['802-875-6110']],
  ['Virginia', 'Virginia State Police - Missing Children Clearinghouse', ['804-674-2026']],
  ['U.S. Virgin Islands', 'U.S. Virgin Islands Police Department', ['340-772-9111']],
  ['Washington', 'Washington State Patrol', ['360-704-2404']],
  ['West Virginia', 'West Virginia State Police', ['304-746-2158']],
  ['Wisconsin', 'Wisconsin Clearinghouse for Missing & Exploited Children', ['608-266-1671']],
  ['Wyoming', 'Wyoming Highway Patrol', ['307-777-4237']],
];

const AMBER_REPORTS = [
  '2024 AMBER Alert Report',
  '2023 AMBER Alert Report',
  '2022 AMBER Alert Report',
  '2021 AMBER Alert Report',
  '2020 AMBER Alert Report',
  '2019 AMBER Alert Report',
  '2018 AMBER Alert Report',
  '2017 AMBER Alert Report',
  '2016 AMBER Alert Report',
  '2015 AMBER Alert Report',
  '2014 AMBER Alert Report',
  '2013 AMBER Alert Report',
];

const AMBER_FAQS = [
  {
    question: 'What happens when an AMBER Alert is received?',
    answers: [
      'AMBER Alerts use a distinct sound and vibration so people understand the message is urgent and accessible.',
      'The message shares core details about the missing child and, when available, the abductor or suspected vehicle.',
    ],
  },
  {
    question: 'How do AMBER Alerts work?',
    answers: [
      'Law enforcement decides whether to issue an alert using its AMBER Alert criteria, then defines the alert area and shares available case details.',
      'After an alert is issued, broadcasters, transportation agencies, NCMEC, and secondary distributors help distribute it quickly.',
    ],
  },
  {
    question: 'How are AMBER Alerts distributed to cell phones?',
    answers: [
      'Cell phone alerts are sent through the Wireless Emergency Alerts program as part of AMBER Alert secondary distribution.',
    ],
  },
  {
    question: 'What is the Wireless Emergency Alert program?',
    answers: [
      'Wireless Emergency Alerts are operated by FEMA and carry authorized emergency messages from government agencies to capable mobile devices.',
      'The program includes AMBER Alerts, National Weather Service alerts, Presidential alerts, and imminent threat alerts.',
      'Alerts use Cell Broadcast, so they are not delayed by voice or SMS congestion and do not require tracking a user phone number or location.',
    ],
  },
  {
    question: 'Will wireless customers be charged for Wireless Emergency Alert messages?',
    answers: ['No. Wireless customers are not charged for receiving these messages.'],
  },
  {
    question: 'How do I know if my device is Wireless Emergency Alert capable?',
    answers: [
      'Check with your wireless provider for supported devices, and ask about Wireless Emergency Alert capability when purchasing a new device.',
    ],
  },
  {
    question: 'Is it possible to adjust the volume of the Wireless Emergency Alert audible signal?',
    answers: [
      'If a device is set to vibrate only, the audible alert may not play. Wireless customers should contact their provider for device-specific settings or opt-out options.',
    ],
  },
  {
    question: 'Where can I go for more information after receiving an AMBER Alert on my cell phone?',
    answers: [
      'Check local media, missingkids.org/AMBER, or amberalert.gov for additional details about an active alert.',
    ],
  },
];

const AMBER_HELPFUL_LINKS = [
  ['Learn about the AMBER Alert Training and Technical Assistance Program', 'https://www.amberadvocate.org'],
  ['Learn about the AMBER in Indian Country Initiative', 'https://amber-ic.org'],
  ['DOJ AMBER Alert Training', 'https://ncjtc.fvtc.edu'],
  ['AMBER Alert Program', 'https://amberalert.ojp.gov'],
];

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function normalizePreset(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isBlockFieldRow(row) {
  return FAQ_BLOCK_FIELD_NAMES.some((name) => row.querySelector(getFieldSelector(name)));
}

function appendParagraph(parent, text) {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  parent.append(paragraph);
  return paragraph;
}

function appendLinkList(parent, links) {
  const list = document.createElement('ul');
  links.forEach(([label, href]) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    item.append(link);
    list.append(item);
  });
  parent.append(list);
  return list;
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

function appendAmberContacts(target) {
  appendParagraph(
    target,
    'The contact information below is provided for public reference. Law enforcement and AMBER Alert Coordinators should call the NCMEC Hotline at 800-843-5678 if more information is needed.',
  );

  const tableWrap = document.createElement('div');
  tableWrap.className = 'faq-amber-table-wrap';

  const table = document.createElement('table');
  table.className = 'faq-amber-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['State', 'Contact', 'Details'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headRow.append(th);
  });
  thead.append(headRow);

  const tbody = document.createElement('tbody');
  AMBER_CONTACTS.forEach(([state, agency, details]) => {
    const row = document.createElement('tr');

    const stateCell = document.createElement('th');
    stateCell.scope = 'row';
    stateCell.textContent = state;

    const agencyCell = document.createElement('td');
    agencyCell.textContent = agency;

    const detailsCell = document.createElement('td');
    details.forEach((detail, index) => {
      if (index > 0) detailsCell.append(document.createElement('br'));
      detailsCell.append(document.createTextNode(detail));
    });

    row.append(stateCell, agencyCell, detailsCell);
    tbody.append(row);
  });

  table.append(thead, tbody);
  tableWrap.append(table);
  target.append(tableWrap);
}

function appendAmberReports(target) {
  const list = document.createElement('ul');
  list.className = 'faq-amber-report-list';

  AMBER_REPORTS.forEach((label) => {
    const item = document.createElement('li');
    item.textContent = label;
    list.append(item);
  });

  target.append(list);
  appendParagraph(target, 'For reports beyond this date range, visit amberalert.gov/statistics.');
}

function appendAmberFaqs(target) {
  const list = document.createElement('div');
  list.className = 'faq-amber-faq-list';

  AMBER_FAQS.forEach(({ question, answers }) => {
    const group = document.createElement('section');
    group.className = 'faq-amber-faq';

    const heading = document.createElement('h3');
    heading.textContent = question;
    group.append(heading);

    answers.forEach((answer) => appendParagraph(group, answer));
    list.append(group);
  });

  target.append(list);

  const helpfulHeading = document.createElement('h3');
  helpfulHeading.textContent = 'Helpful Links';
  target.append(helpfulHeading);
  appendLinkList(target, AMBER_HELPFUL_LINKS);
}

function buildStaticFaqItem(data, index, items) {
  const item = document.createElement('article');
  item.className = 'faq-item';
  item.style.setProperty('--faq-index', index);

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
  questionEl.textContent = data.question;

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
  data.render(answerEl);
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

function buildAmberAdditionalInfoItems(items) {
  return [
    {
      question: 'State AMBER Alert Contacts',
      render: appendAmberContacts,
    },
    {
      question: 'AMBER Alert Reports',
      render: appendAmberReports,
    },
    {
      question: 'AMBER Alert FAQs',
      render: appendAmberFaqs,
    },
  ].map((data, index) => {
    const item = buildStaticFaqItem(data, index, items);
    items.push(item);
    return item;
  });
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const headingField = readTextField(block, 'heading');
  const presetField = readTextField(block, 'preset');
  const preset = normalizePreset(presetField.value);
  const isAmberAdditionalInfo = preset === 'amber-additional-info';
  const headingText = headingField.value || (isAmberAdditionalInfo ? 'Additional Information' : '');
  const itemRows = rows.filter((row) => !isBlockFieldRow(row));
  const children = [];
  const items = [];

  if (headingText) {
    const heading = document.createElement('h2');
    heading.className = 'faq-heading';
    moveText(headingField, heading, headingText);
    children.push(heading);
  }

  if (isAmberAdditionalInfo) {
    children.push(...buildAmberAdditionalInfoItems(items));
    block.replaceChildren(...children);
    return;
  }

  itemRows.forEach((row, index) => {
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
}
