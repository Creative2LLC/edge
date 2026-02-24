import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

function isSocialGroup(element) {
  const links = [...element.querySelectorAll('a')];
  if (links.length < 2) return false;

  const containsIcon = links.some((link) => link.querySelector('img, svg, .icon'));
  if (containsIcon) return true;

  return links.every((link) => link.textContent.trim().length <= 2);
}

function classifyBrandContent(brandColumn) {
  if (!brandColumn) return;

  let legalMarked = false;
  [...brandColumn.children].forEach((child) => {
    const text = child.textContent.trim();
    if (!text) return;

    if (/\u00A9|copyright/i.test(text)) {
      child.classList.add('footer-copyright');
      return;
    }

    const links = child.querySelectorAll('a');
    if (links.length < 2) return;

    if (isSocialGroup(child)) {
      child.classList.add('footer-social');
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
      classifyBrandContent(column);
      return;
    }

    column.classList.add('footer-column');
    column.dataset.footerColumn = `${index}`;
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

  decorateFlexibleColumns(footer);

  block.append(footer);
}
