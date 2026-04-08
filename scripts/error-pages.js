import { sampleRUM } from './aem.js';

const ERROR_CONFIG = {
  403: {
    title: 'Access denied',
    eyebrow: 'Error 403',
    heading: 'This page is off limits.',
    description: 'The content is there, but this session or account does not have permission '
      + 'to open it right now.',
    points: [
      'Check that you are signed into the right account or environment.',
      'Use the main navigation to return to a public section of the site.',
      'If you expected access, confirm the page permissions with your team.',
    ],
    panels: [
      { label: 'Status', value: 'Access blocked' },
      { label: 'Suggested action', value: 'Verify permissions' },
    ],
    meta: 'Permission or authentication is required before this request can continue.',
    actions: [
      { type: 'home', label: 'Go home' },
      { type: 'back', label: 'Go back', optional: true },
    ],
  },
  404: {
    title: 'Page not found',
    eyebrow: 'Error 404',
    heading: 'We could not find that page.',
    description: 'The link may be outdated, the URL may have a typo, or the content may have '
      + 'moved somewhere else.',
    points: [
      'Return to the homepage and jump back into the main navigation.',
      'Double-check the URL if you typed it manually.',
      'Use a known page path and continue from there.',
    ],
    panels: [
      { label: 'Status', value: 'Missing page' },
      { label: 'Suggested action', value: 'Start from home' },
    ],
    meta: '',
    actions: [
      { type: 'home', label: 'Go home' },
      { type: 'back', label: 'Go back', optional: true },
    ],
  },
  500: {
    title: 'Something went wrong',
    eyebrow: 'Error 500',
    heading: 'Something went wrong on our side.',
    description: 'This is a temporary server or delivery issue. The safest move is to retry the '
      + 'request or jump back to a stable page.',
    points: [
      'Refresh the page to retry the request.',
      'Return home if you need a guaranteed starting point.',
      'Come back in a moment if the problem continues.',
    ],
    panels: [
      { label: 'Status', value: 'Temporary issue' },
      { label: 'Suggested action', value: 'Retry request' },
    ],
    meta: 'If the problem persists, try again in a few minutes or return to a known page.',
    actions: [
      { type: 'retry', label: 'Try again' },
      { type: 'home', label: 'Go home', secondary: true },
      {
        type: 'back',
        label: 'Go back',
        optional: true,
        secondary: true,
      },
    ],
  },
};

function getErrorConfig(code) {
  return ERROR_CONFIG[code] || ERROR_CONFIG[404];
}

function getSameOriginReferrer() {
  if (!document.referrer) return '';

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) return '';
    return `${referrer.pathname}${referrer.search}${referrer.hash}`;
  } catch (error) {
    return '';
  }
}

function getRequestedPath() {
  const { pathname, search } = window.location;
  const combined = `${pathname}${search}`;
  if (!combined || combined === '/') return '/';
  return combined;
}

function createLinkAction(href, label, secondary = false) {
  const link = document.createElement('a');
  link.className = 'error-page-action';
  if (secondary) link.classList.add('is-secondary');
  link.href = href;
  link.textContent = label;
  return link;
}

function createAction(action) {
  if (action.type === 'retry') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'error-page-action';
    if (action.secondary) button.classList.add('is-secondary');
    button.textContent = action.label;
    button.addEventListener('click', () => window.location.reload());
    return button;
  }

  if (action.type === 'back') {
    const href = getSameOriginReferrer();
    if (!href) {
      return action.optional ? null : createLinkAction('/', action.label, action.secondary);
    }
    return createLinkAction(href, action.label, action.secondary);
  }

  return createLinkAction('/', action.label, action.secondary);
}

function populatePoints(list, points) {
  list.replaceChildren();
  points.forEach((point) => {
    const item = document.createElement('li');
    item.textContent = point;
    list.append(item);
  });
}

function populateActions(container, actions) {
  container.replaceChildren();
  actions
    .map((action) => createAction(action))
    .filter(Boolean)
    .forEach((action) => container.append(action));
}

function populatePanels(root, panels) {
  const labels = root.querySelectorAll('.error-page-panel-label');
  const values = root.querySelectorAll('.error-page-panel-value');

  panels.forEach((panel, index) => {
    if (labels[index]) labels[index].textContent = panel.label;
    if (values[index]) values[index].textContent = panel.value;
  });
}

function buildMetaText(code, config) {
  if (code === '404') {
    return `Requested path: ${getRequestedPath()}`;
  }

  return config.meta;
}

function updateHead(config) {
  document.title = config.title;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', config.title);
}

function initErrorPage() {
  const root = document.querySelector('[data-error-page]');
  if (!root) return;

  const code = String(window.errorCode || '404');
  const config = getErrorConfig(code);
  const main = document.querySelector('main.error');

  if (main) {
    main.dataset.errorCode = code;
  }
  document.body.dataset.errorCode = code;

  updateHead(config);

  root.querySelector('.error-page-eyebrow').textContent = config.eyebrow;
  root.querySelector('.error-page-title').textContent = config.heading;
  root.querySelector('.error-page-description').textContent = config.description;
  root.querySelector('.error-page-code').textContent = code;
  root.querySelector('.error-page-code-shadow').textContent = code;
  root.querySelector('.error-page-meta').textContent = buildMetaText(code, config);

  populatePoints(root.querySelector('.error-page-points'), config.points);
  populateActions(root.querySelector('.error-page-actions'), config.actions);
  populatePanels(root, config.panels);

  sampleRUM(code, {
    source: document.referrer || '',
    target: window.location.pathname,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initErrorPage, {
    once: true,
  });
} else {
  initErrorPage();
}
