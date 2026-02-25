import { decorateIcons, getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

const DEFAULT_HELP_PATH = '/get-help';
const DEFAULT_TRIGGER_LABEL = 'Get Help Now';

const FALLBACK_COLUMNS = {
  left: {
    heading: 'Other Ways We Can Help',
    items: [
      {
        label: 'Take It Down',
        href: '/take-it-down',
        description: 'Remove explicit images of yourself shared online.',
      },
      {
        label: 'CyberTipline',
        href: '/cybertipline',
        description: 'Report suspected child exploitation or online abuse.',
      },
      {
        label: 'NetSmartz',
        href: '/netsmartz',
        description: 'Safety education for kids and parents.',
      },
      {
        label: 'Team HOPE',
        href: '/team-hope',
        description: 'Connect with others who have shared your experience.',
      },
    ],
  },
  right: {
    heading: 'Need Help Now?',
    items: [
      {
        label: 'Call 1-800-THE-LOST',
        href: 'tel:+18008435678',
        description: '(1-800-843-5678)',
      },
      {
        label: 'Text "HELP" to 1-800-THE-LOST',
        href: 'sms:+18008435678',
        description: '(1-800-843-5678)',
      },
    ],
    note: 'Confidential, free, and available 24 hours a day.',
  },
};

function stripButtonClasses(scope) {
  scope.querySelectorAll('a.button').forEach((link) => {
    link.classList.remove('button', 'primary', 'secondary');
  });

  scope.querySelectorAll('.button-container').forEach((container) => {
    container.classList.remove('button-container');
  });
}

function isTitleRow(element) {
  if (!element) return false;
  if (!['P', 'DIV', 'A'].includes(element.tagName)) return false;
  const links = element.querySelectorAll('a');
  if (links.length !== 1) return false;
  const text = element.textContent.replace(/\s+/g, ' ').trim();
  const linkText = links[0].textContent.replace(/\s+/g, ' ').trim();
  return text === linkText;
}

function decorateContactLink(link) {
  const text = link.textContent.trim().toLowerCase();
  let iconName = '';

  if (text.startsWith('call')) {
    iconName = 'phone';
    link.classList.add('is-call');
  } else if (text.startsWith('text')) {
    iconName = 'message-square';
    link.classList.add('is-text');
  }

  if (!iconName) return;

  link.classList.add('is-contact-link');

  if (link.querySelector('.icon')) return;

  const icon = document.createElement('span');
  icon.className = `icon icon-${iconName}`;
  icon.setAttribute('aria-hidden', 'true');
  link.prepend(icon);
}

function normalizeListRows(column, isContact) {
  column.querySelectorAll('ul, ol').forEach((list) => {
    list.classList.add('get-help-list');

    [...list.children].forEach((item) => {
      if (!(item instanceof HTMLElement)) return;

      item.classList.add('get-help-item');
      const link = item.querySelector('a');
      if (!link) return;

      link.classList.add('get-help-item-link');
      if (isContact) decorateContactLink(link);

      const description = [...item.querySelectorAll('p')]
        .find((paragraph) => !paragraph.querySelector('a'));
      if (description) description.classList.add('get-help-item-description');
    });
  });
}

function normalizeFlowRows(column, isContact) {
  const children = [...column.children];

  children.forEach((child, index) => {
    if (child.matches('h1, h2, h3, h4, h5, h6, ul, ol')) return;

    if (isTitleRow(child)) {
      child.classList.add('get-help-item');
      const link = child.querySelector('a');
      link.classList.add('get-help-item-link');
      if (isContact) decorateContactLink(link);

      const next = children[index + 1];
      if (next && next.tagName === 'P' && !next.querySelector('a')) {
        next.classList.add('get-help-item-description');
      }
      return;
    }

    if (child.tagName === 'P' && !child.querySelector('a') && !child.classList.contains('get-help-item-description')) {
      child.classList.add('get-help-note');
    }
  });
}

function enhanceColumn(column, { contact = false } = {}) {
  stripButtonClasses(column);

  const heading = column.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    heading.classList.add('get-help-column-heading');
  } else {
    const fallbackHeading = [...column.children]
      .find((child) => child.tagName === 'P' && !child.querySelector('a') && child.textContent.trim());
    if (fallbackHeading) {
      const convertedHeading = document.createElement('h3');
      convertedHeading.className = 'get-help-column-heading';
      convertedHeading.innerHTML = fallbackHeading.innerHTML;
      fallbackHeading.replaceWith(convertedHeading);
    }
  }

  normalizeListRows(column, contact);
  normalizeFlowRows(column, contact);
}

function createFallbackColumn(config, { contact = false } = {}) {
  const column = document.createElement('section');
  column.className = `get-help-column${contact ? ' is-contact-column' : ''}`;

  const heading = document.createElement('h3');
  heading.className = 'get-help-column-heading';
  heading.textContent = config.heading;
  column.append(heading);

  const list = document.createElement('ul');
  list.className = 'get-help-list';
  config.items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'get-help-item';

    const link = document.createElement('a');
    link.className = 'get-help-item-link';
    link.href = item.href;
    link.textContent = item.label;
    if (contact) decorateContactLink(link);
    li.append(link);

    if (item.description) {
      const description = document.createElement('p');
      description.className = 'get-help-item-description';
      description.textContent = item.description;
      li.append(description);
    }

    list.append(li);
  });
  column.append(list);

  if (config.note) {
    const note = document.createElement('p');
    note.className = 'get-help-note';
    note.textContent = config.note;
    column.append(note);
  }

  return column;
}

function getColumnsFromFragment(fragment) {
  const row = fragment?.querySelector('.columns > div');
  if (row) {
    const columns = [...row.children].filter((column) => column.textContent.trim());
    if (columns.length >= 2) return columns.slice(0, 2);
  }

  const fallbackColumns = [...(fragment?.querySelectorAll('.section > .default-content-wrapper > div') || [])]
    .filter((column) => column.textContent.trim());
  if (fallbackColumns.length >= 2) return fallbackColumns.slice(0, 2);

  return [];
}

function buildLayout(fragment) {
  const layout = document.createElement('div');
  layout.className = 'get-help-layout';

  const columns = getColumnsFromFragment(fragment);
  if (columns.length < 2) {
    layout.append(
      createFallbackColumn(FALLBACK_COLUMNS.left),
      createFallbackColumn(FALLBACK_COLUMNS.right, { contact: true }),
    );
    return layout;
  }

  const leftColumn = document.createElement('section');
  leftColumn.className = 'get-help-column';
  leftColumn.innerHTML = columns[0].innerHTML;
  enhanceColumn(leftColumn);

  const rightColumn = document.createElement('section');
  rightColumn.className = 'get-help-column is-contact-column';
  rightColumn.innerHTML = columns[1].innerHTML;
  enhanceColumn(rightColumn, { contact: true });

  layout.append(leftColumn, rightColumn);
  return layout;
}

function buildWidget(label, layout) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'get-help-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `
    <span class="icon icon-help-bubble" aria-hidden="true"></span>
    <span>${label}</span>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'get-help-overlay';
  overlay.hidden = true;

  const panel = document.createElement('section');
  panel.className = 'get-help-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.tabIndex = -1;

  const dialogId = `get-help-dialog-${Math.random().toString(36).slice(2, 9)}`;
  panel.id = dialogId;
  trigger.setAttribute('aria-controls', dialogId);

  const panelHeading = layout.querySelector('.get-help-column-heading');
  if (panelHeading) {
    const headingId = `${dialogId}-title`;
    panelHeading.id = headingId;
    panel.setAttribute('aria-labelledby', headingId);
  }

  const card = document.createElement('div');
  card.className = 'get-help-card';
  card.append(layout);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'get-help-close';
  closeButton.setAttribute('aria-label', 'Close get help panel');
  closeButton.innerHTML = `
    <span class="icon icon-x-circle" aria-hidden="true"></span>
    <span>Close</span>
  `;

  panel.append(card, closeButton);
  overlay.append(panel);

  return {
    trigger,
    overlay,
    panel,
    closeButton,
  };
}

function attachInteractions(block, trigger, overlay, panel, closeButton) {
  let previousOverflow = '';

  const isOpen = () => block.classList.contains('is-open');

  const open = () => {
    if (isOpen()) return;

    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    block.classList.add('is-open');
    overlay.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  };

  const close = (focusTrigger = true) => {
    if (!isOpen()) return;

    block.classList.remove('is-open');
    overlay.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = previousOverflow;

    if (focusTrigger) trigger.focus();
  };

  trigger.addEventListener('click', open);
  closeButton.addEventListener('click', () => close());

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  panel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => close(false));
  });

  window.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
}

/**
 * loads and decorates the get-help widget
 * @param {Element} block The get-help block element
 */
export default async function decorate(block) {
  const helpMeta = getMetadata('get-help');
  const helpPath = helpMeta ? new URL(helpMeta, window.location).pathname : DEFAULT_HELP_PATH;
  const currentPath = window.location.pathname.replace(/\/$/, '');
  const configuredPath = helpPath.replace(/\/$/, '');
  if (currentPath === configuredPath) return;

  const labelMeta = getMetadata('get-help-label');
  const triggerLabel = labelMeta || DEFAULT_TRIGGER_LABEL;

  const fragment = await loadFragment(helpPath);
  const layout = buildLayout(fragment);
  const {
    trigger,
    overlay,
    panel,
    closeButton,
  } = buildWidget(triggerLabel, layout);

  block.textContent = '';
  block.append(trigger, overlay);
  decorateIcons(block);
  attachInteractions(block, trigger, overlay, panel, closeButton);
}
