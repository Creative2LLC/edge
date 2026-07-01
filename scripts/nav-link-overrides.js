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

export default function applyNavLinkOverrides(root) {
  if (!root) return;
  updateExistingLinks(root);
}
