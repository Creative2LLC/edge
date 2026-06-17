import { moveInstrumentation, decoratePdfLinks } from '../../scripts/scripts.js';

const IMAGE_PATH_RE = /\.(avif|bmp|gif|jfif|jpe?g|png|svg|webp)(\?.*)?$/i;
const DAM_PATH_RE = /\/content\/dam\//;

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isItemRow(row) {
  return Boolean(
    row.getAttribute('data-aue-model') === 'report-archive-item'
      || row.querySelector('[data-aue-prop="year"], [data-richtext-prop="links"], [data-aue-prop="links"]')
      || (!hasAuthoringContext(row) && [...row.children].length >= 3),
  );
}

function getBlockConfigRows(rows) {
  const firstItemIdx = rows.findIndex(isItemRow);
  return firstItemIdx > 0 ? rows.slice(0, firstItemIdx) : [];
}

function parseSrc(value) {
  const str = String(value || '').trim();
  if (!str) return '';
  if (/^data:image\//i.test(str)) return str;
  if (IMAGE_PATH_RE.test(str)) return str;
  if (DAM_PATH_RE.test(str)) return str;
  return '';
}

function buildCoverImage(imageCell, altText) {
  if (!imageCell) return null;

  const picture = imageCell.querySelector('picture');
  if (picture) {
    const clone = picture.cloneNode(true);
    const cloneImg = clone.querySelector('img');
    if (cloneImg && altText) cloneImg.alt = altText;
    moveInstrumentation(imageCell, clone);
    return clone;
  }

  const img = imageCell.querySelector('img');
  if (img) {
    const clone = img.cloneNode(true);
    if (altText) clone.alt = altText;
    moveInstrumentation(imageCell, clone);
    return clone;
  }

  const anchor = imageCell.querySelector('a');
  const src = parseSrc(anchor?.getAttribute('href') || imageCell.textContent);
  if (src) {
    const newImg = document.createElement('img');
    newImg.src = src;
    newImg.alt = altText || '';
    newImg.loading = 'lazy';
    moveInstrumentation(imageCell, newImg);
    return newImg;
  }

  return null;
}

function parseItemRow(row, isAuthoring) {
  const yearCell = row.querySelector('[data-aue-prop="year"]') || row.children[0] || null;
  const imageCell = row.querySelector('[data-aue-prop="coverImage"]') || row.children[1] || null;
  const altCell = row.querySelector('[data-aue-prop="coverImageAlt"]') || null;
  const linksSource = row.querySelector('[data-richtext-prop="links"], [data-aue-prop="links"]')
    || (!isAuthoring ? row.children[row.children.length - 1] || null : null);

  const altText = altCell?.textContent?.trim() || imageCell?.querySelector('img')?.alt || '';
  const coverImage = buildCoverImage(imageCell, altText);
  const year = yearCell?.textContent?.trim() || '';

  return {
    year,
    yearCell,
    coverImage,
    linksSource,
  };
}

function buildAccordionItem(data, row, index, isAuthoring) {
  const item = document.createElement('div');
  item.className = index === 0 ? 'report-archive-item is-open' : 'report-archive-item';
  moveInstrumentation(row, item);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'report-archive-trigger';
  trigger.setAttribute('aria-expanded', String(index === 0));

  const triggerText = document.createElement('span');
  triggerText.className = 'report-archive-trigger-text';
  if (data.yearCell) moveInstrumentation(data.yearCell, triggerText);
  triggerText.textContent = data.year || 'Year';

  const icon = document.createElement('span');
  icon.className = 'report-archive-icon';
  icon.setAttribute('aria-hidden', 'true');

  trigger.append(triggerText, icon);

  const panel = document.createElement('div');
  panel.className = 'report-archive-panel';
  if (index !== 0) panel.classList.add('is-collapsed');

  const panelInner = document.createElement('div');
  panelInner.className = 'report-archive-panel-inner';

  if (data.coverImage) {
    const figure = document.createElement('figure');
    figure.className = 'report-archive-cover';
    figure.append(data.coverImage);
    panelInner.append(figure);
  } else if (isAuthoring) {
    const placeholder = document.createElement('div');
    placeholder.className = 'report-archive-placeholder';
    placeholder.textContent = 'Add cover image in Universal Editor.';
    panelInner.append(placeholder);
  }

  if (data.linksSource) {
    const links = document.createElement('div');
    links.className = 'report-archive-links';
    moveInstrumentation(data.linksSource, links);
    while (data.linksSource.firstChild) links.append(data.linksSource.firstChild);
    decoratePdfLinks(links);
    panelInner.append(links);
  } else if (isAuthoring) {
    const placeholder = document.createElement('div');
    placeholder.className = 'report-archive-placeholder';
    placeholder.textContent = 'Add PDF download links in Universal Editor.';
    panelInner.append(placeholder);
  }

  panel.append(panelInner);
  item.append(trigger, panel);

  trigger.addEventListener('click', () => {
    const open = item.classList.toggle('is-open');
    trigger.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('is-collapsed', !open);
  });

  return item;
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const configRows = getBlockConfigRows(rows);
  const itemRows = rows.filter(isItemRow);

  const headingCell = block.querySelector('[data-aue-prop="heading"]')
    || (configRows[0]?.children.length >= 2 ? configRows[0].children[1] : null);
  const headingText = headingCell?.textContent?.trim() || '';

  const bgCell = block.querySelector('[data-aue-prop="backgroundColor"]')
    || configRows.find((r) => /background|color/i.test(r.children[0]?.textContent || ''))?.children[1]
    || null;
  const bgColor = bgCell?.textContent?.trim() || '';

  configRows.forEach((r) => r.remove());

  if (bgColor) block.style.backgroundColor = bgColor;

  const wrapper = document.createElement('div');
  wrapper.className = 'report-archive-wrapper';

  if (headingText) {
    const heading = document.createElement('h2');
    heading.className = 'report-archive-heading';
    if (headingCell) moveInstrumentation(headingCell, heading);
    heading.textContent = headingText;
    wrapper.append(heading);
  }

  if (!itemRows.length) {
    if (isAuthoring) {
      const empty = document.createElement('div');
      empty.className = 'report-archive-empty';
      empty.textContent = 'Add Report Archive Items in Universal Editor.';
      wrapper.append(empty);
    }
    block.replaceChildren(wrapper);
    return;
  }

  const accordion = document.createElement('div');
  accordion.className = 'report-archive-accordion';

  itemRows.forEach((row, index) => {
    const data = parseItemRow(row, isAuthoring);
    const item = buildAccordionItem(data, row, index, isAuthoring);
    accordion.append(item);
  });

  wrapper.append(accordion);
  block.replaceChildren(wrapper);
}
