import resolveSiteHref from './link-utils.js';

const NAV_LINKS = [
  {
    labels: ['amber alerts', 'amber alert'],
    href: '/amber-alerts',
  },
  {
    labels: ['missing posters', 'missing children posters', 'missing poster'],
    href: '/missing-children-posters',
  },
  {
    labels: ['case anniversaries'],
    href: '/resources/for-professionals/media/case-anniversaries',
  },
];

function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchingLinkConfig(text) {
  const normalized = normalizeLabel(text);
  return NAV_LINKS.find(({ labels }) => labels.includes(normalized)) || null;
}

function updateExistingLinks(root) {
  root.querySelectorAll('a').forEach((link) => {
    const config = matchingLinkConfig(link.textContent);
    if (!config) return;
    link.href = resolveSiteHref(config.href);
  });

  root.querySelectorAll('li').forEach((item) => {
    if (item.querySelector('a')) return;
    const config = matchingLinkConfig(item.textContent);
    if (!config) return;

    const link = document.createElement('a');
    link.href = resolveSiteHref(config.href);
    while (item.firstChild) link.append(item.firstChild);
    item.append(link);
  });
}

function createCaseAnniversariesItem(templateItem) {
  const item = templateItem?.cloneNode(false) || document.createElement('li');

  const link = document.createElement('a');
  link.href = resolveSiteHref(matchingLinkConfig('Case Anniversaries').href);
  link.textContent = 'Case Anniversaries';
  item.append(link);
  return item;
}

function findInsertionList(root) {
  const missingLink = [...root.querySelectorAll('a')]
    .find((link) => matchingLinkConfig(link.textContent)?.href === '/missing-children-posters');
  const amberLink = [...root.querySelectorAll('a')]
    .find((link) => matchingLinkConfig(link.textContent)?.href === '/amber-alerts');
  const anchorLink = missingLink || amberLink;
  const item = anchorLink?.closest('li');
  const list = item?.parentElement?.matches('ul, ol') ? item.parentElement : null;
  return { list, item };
}

function ensureCaseAnniversariesLink(root) {
  const caseHref = matchingLinkConfig('Case Anniversaries').href;
  const hasCaseLink = [...root.querySelectorAll('a')]
    .some((link) => matchingLinkConfig(link.textContent)?.href === caseHref);
  if (hasCaseLink) return;

  const { list, item } = findInsertionList(root);
  if (!list) return;

  const caseItem = createCaseAnniversariesItem(item);
  if (item?.nextSibling) {
    list.insertBefore(caseItem, item.nextSibling);
  } else {
    list.append(caseItem);
  }
}

export default function applyNavLinkOverrides(root) {
  if (!root) return;
  updateExistingLinks(root);
  ensureCaseAnniversariesLink(root);
}
