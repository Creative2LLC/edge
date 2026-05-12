import { decorateIcons, getMetadata } from '../../scripts/aem.js';
import applyNavLinkOverrides from '../../scripts/nav-link-overrides.js';
import { loadFragment } from '../fragment/fragment.js';

const SOCIAL_DEFINITIONS = {
  facebook: {
    text: ['facebook', 'fb', 'f'],
    hosts: ['facebook.com', 'fb.com'],
  },
  x: {
    text: ['x', 'twitter', 'x-twitter', 'xtwitter'],
    hosts: ['x.com', 'twitter.com'],
  },
  youtube: {
    text: ['youtube', 'yt'],
    hosts: ['youtube.com', 'youtu.be'],
  },
  instagram: {
    text: ['instagram', 'insta', 'ig'],
    hosts: ['instagram.com'],
  },
};

const FOOTER_LEGAL_LINKS = [
  {
    text: 'Terms and Conditions',
    href: '/footer/termsandconditions',
  },
  {
    text: 'Privacy Policy',
    href: '/footer/privacypolicy',
  },
  {
    text: 'Donor Policy',
    href: '/footer/privacypolicy/donorprivacypolicy',
  },
  {
    text: 'Sitemap',
    href: '/sitemap.xml',
  },
];

const FOOTER_SOCIAL_LINKS = [
  {
    text: 'Facebook',
    href: 'https://www.facebook.com/ncmec',
  },
  {
    text: 'X',
    href: 'https://x.com/NCMEC',
  },
  {
    text: 'YouTube',
    href: 'https://www.youtube.com/@ncmec',
  },
  {
    text: 'Instagram',
    href: 'https://www.instagram.com/ncmec',
  },
];

function normalizeLabel(value) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function detectSocialType(link) {
  const text = normalizeLabel(link.textContent || '');
  const href = (link.getAttribute('href') || link.href || '').toLowerCase();

  const entry = Object.entries(SOCIAL_DEFINITIONS).find(([, definition]) => (
    definition.text.includes(text)
    || definition.hosts.some((host) => href.includes(host))
  ));

  return entry?.[0] || '';
}

function isSocialLink(link) {
  if (link.querySelector('img, svg, .icon')) return true;
  if (detectSocialType(link)) return true;
  return link.textContent.trim().length <= 2;
}

function isSocialGroup(element) {
  const links = [...element.querySelectorAll('a')];
  if (links.length < 2) return false;

  return links.every((link) => isSocialLink(link));
}

function decorateSocialLinks(element) {
  element.querySelectorAll('a').forEach((link) => {
    const type = detectSocialType(link);
    if (!type) return;

    link.dataset.social = type;

    if (link.querySelector('img, svg, .icon')) return;

    const label = link.textContent.trim() || type;
    link.setAttribute('aria-label', label);
    link.textContent = '';

    const icon = document.createElement('span');
    icon.className = `icon icon-${type}`;
    icon.setAttribute('aria-hidden', 'true');
    link.append(icon);
  });
}

function buildFooterLinkItem({ text, href }) {
  const item = document.createElement('p');
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  item.append(link);
  return item;
}

function getOrCreateBrandGroup(brandColumn, className, fallbackSelector) {
  const existing = brandColumn.querySelector(`:scope > .${className}`);
  if (existing) return existing;

  const group = document.createElement('div');
  group.className = className;

  const fallback = fallbackSelector ? brandColumn.querySelector(fallbackSelector) : null;
  if (fallback) {
    fallback.before(group);
  } else {
    brandColumn.append(group);
  }

  return group;
}

function normalizeBrandFooterLinks(brandColumn) {
  const social = getOrCreateBrandGroup(
    brandColumn,
    'footer-social',
    ':scope > .footer-legal-links, :scope > .footer-copyright',
  );
  social.replaceChildren(...FOOTER_SOCIAL_LINKS.map(buildFooterLinkItem));
  decorateSocialLinks(social);

  const legal = getOrCreateBrandGroup(brandColumn, 'footer-legal-links', ':scope > .footer-copyright');
  legal.replaceChildren(...FOOTER_LEGAL_LINKS.map(buildFooterLinkItem));
}

function collectSingleLinkRows(brandColumn, predicate) {
  const groups = [];
  let run = [];

  const flush = () => {
    if (run.length >= 2) groups.push(run);
    run = [];
  };

  [...brandColumn.children].forEach((child) => {
    if (child.classList.contains('footer-social') || child.classList.contains('footer-legal-links')) {
      flush();
      return;
    }

    const links = [...child.querySelectorAll('a')];
    if (links.length !== 1) {
      flush();
      return;
    }

    if (predicate(links[0], child)) {
      run.push(child);
    } else {
      flush();
    }
  });

  flush();
  return groups;
}

function groupRows(brandColumn, className, predicate) {
  const groups = collectSingleLinkRows(brandColumn, predicate);
  groups.forEach((group) => {
    const wrapper = document.createElement('div');
    wrapper.className = className;
    group[0].before(wrapper);
    group.forEach((node) => wrapper.append(node));
  });
}

function applyBrandWidth(columnsBlock, brandColumn) {
  const widthPattern = /^(?:brand\s*width|brandwidth|first\s*column\s*width|width)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*(%|fr)?$/i;

  [...brandColumn.children].some((child) => {
    const text = child.textContent.trim();
    const match = text.match(widthPattern);
    if (!match) return false;

    const value = Number(match[1]);
    if (!Number.isFinite(value)) return false;

    const unit = (match[2] || '%').toLowerCase();
    if (unit === 'fr') {
      const clamped = Math.min(Math.max(value, 1), 6);
      columnsBlock.style.setProperty('--footer-brand-width', `${clamped}fr`);
    } else {
      const clamped = Math.min(Math.max(value, 20), 60);
      columnsBlock.style.setProperty('--footer-brand-width', `${clamped}%`);
    }

    child.remove();
    return true;
  });
}

function stripButtonClasses(column) {
  column.querySelectorAll('a.button').forEach((link) => {
    link.classList.remove('button', 'primary', 'secondary');
  });

  column.querySelectorAll('.button-container').forEach((container) => {
    container.classList.remove('button-container');
  });
}

function isSingleLinkRow(element) {
  const links = [...element.querySelectorAll('a')];
  if (links.length !== 1) return false;
  if (element.querySelector('ul, ol')) return false;

  const linkText = links[0].textContent.replace(/\s+/g, ' ').trim();
  const rowText = element.textContent.replace(/\s+/g, ' ').trim();
  return !rowText || rowText === linkText;
}

function normalizeColumnLinks(column) {
  stripButtonClasses(column);

  const groups = [];
  let run = [];

  const flush = () => {
    if (run.length >= 2) groups.push(run);
    run = [];
  };

  [...column.children].forEach((child) => {
    if (isSingleLinkRow(child)) {
      run.push(child);
    } else {
      flush();
    }
  });

  flush();

  groups.forEach((group) => {
    const list = document.createElement('ul');
    list.className = 'footer-link-list';
    group[0].before(list);

    group.forEach((row) => {
      const link = row.querySelector('a');
      if (!link) return;

      const item = document.createElement('li');
      item.append(link);
      list.append(item);
      row.remove();
    });
  });
}

function classifyBrandContent(brandColumn) {
  if (!brandColumn) return;

  groupRows(brandColumn, 'footer-social', (link) => isSocialLink(link));
  groupRows(
    brandColumn,
    'footer-legal-links',
    (link, child) => !isSocialLink(link) && !/\u00A9|copyright/i.test(child.textContent.trim()),
  );

  let legalMarked = false;
  [...brandColumn.children].forEach((child) => {
    const text = child.textContent.trim();
    if (!text) return;

    if (child.classList.contains('footer-social')) {
      decorateSocialLinks(child);
      return;
    }

    if (child.classList.contains('footer-legal-links')) {
      legalMarked = true;
      return;
    }

    if (/\u00A9|copyright/i.test(text)) {
      child.classList.add('footer-copyright');
      return;
    }

    const links = child.querySelectorAll('a');
    if (links.length < 2) return;

    if (isSocialGroup(child)) {
      child.classList.add('footer-social');
      decorateSocialLinks(child);
      return;
    }

    if (!legalMarked) {
      child.classList.add('footer-legal-links');
      legalMarked = true;
    }
  });
}

function decorateFlexibleColumns(footerRoot) {
  const columnsBlock = footerRoot.querySelector('.columns');
  if (!columnsBlock) return;

  const row = columnsBlock.querySelector(':scope > div');
  if (!row) return;

  const columns = [...row.children];
  if (columns.length < 2) return;

  columnsBlock.classList.add('footer-columns-layout');
  columnsBlock.style.setProperty('--footer-link-columns', `${Math.max(columns.length - 1, 1)}`);

  columns.forEach((column, index) => {
    if (index === 0) {
      column.classList.add('footer-brand');
      applyBrandWidth(columnsBlock, column);
      classifyBrandContent(column);
      normalizeBrandFooterLinks(column);
      return;
    }

    column.classList.add('footer-column');
    column.dataset.footerColumn = `${index}`;
    normalizeColumnLinks(column);
  });
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  if (!fragment) return;

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  footer.className = 'footer-content';
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  applyNavLinkOverrides(footer);
  decorateFlexibleColumns(footer);
  decorateIcons(footer);

  block.append(footer);
}
