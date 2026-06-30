import { moveInstrumentation, decoratePdfLinks } from '../../scripts/scripts.js';
import { readImageField, readTextField, setItemLabel } from '../../scripts/block-field-utils.js';

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

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#\s]+)/);
  return match ? match[1] : '';
}

function resolveCoverImageValue(value) {
  if (Array.isArray(value)) return value[0];
  if (value && typeof value === 'object') return value.path || value.url || '';
  return String(value || '');
}

async function resolveImageSrc(imageCell) {
  if (!imageCell) return '';

  // EDS: picture or img already in DOM
  const img = imageCell.querySelector('img');
  if (img?.src) return img.src;

  // UE reference field: path or URN in text content or value attribute
  const raw = imageCell.getAttribute('value')
    || imageCell.getAttribute('src')
    || imageCell.textContent?.trim()
    || '';
  const path = resourcePathFromUrn(raw);
  if (path && (path.includes('/content/dam/') || /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(path))) {
    return path;
  }

  // Fallback: fetch resource JSON (matches pattern used by other blocks)
  const resource = imageCell.closest('[data-aue-resource]')?.getAttribute('data-aue-resource') || '';
  const resourcePath = resourcePathFromUrn(resource);
  if (!resourcePath) return '';

  try {
    const response = await fetch(`${resourcePath}.json`);
    if (!response.ok) return '';
    const data = await response.json();
    const value = data?.coverImage;
    if (!value) return '';
    const resolved = resolveCoverImageValue(value);
    return resourcePathFromUrn(String(resolved || '')) || '';
  } catch {
    return '';
  }
}

function openPanel(panel, panelInner) {
  const targetH = panelInner.scrollHeight;
  panel.style.height = `${targetH}px`;
  panel.addEventListener('transitionend', () => {
    if (!panel.classList.contains('is-collapsed')) panel.style.height = 'auto';
  }, { once: true });
}

function closePanel(panel) {
  // Snapshot current rendered height before transition to 0
  panel.style.height = `${panel.offsetHeight}px`;
  requestAnimationFrame(() => {
    panel.style.height = '0';
  });
}

async function buildAccordionItem(data, row, index, isAuthoring) {
  const item = document.createElement('div');
  item.className = index === 0 ? 'report-archive-item is-open' : 'report-archive-item';
  moveInstrumentation(row, item);
  setItemLabel(item, [data.year]);

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
  panel.style.height = index === 0 ? 'auto' : '0';

  const panelInner = document.createElement('div');
  panelInner.className = 'report-archive-panel-inner';

  // Cover image
  const imageSrc = await resolveImageSrc(data.imageCell);
  if (imageSrc) {
    const figure = document.createElement('figure');
    figure.className = 'report-archive-cover';
    if (data.imageCell) moveInstrumentation(data.imageCell, figure);

    const existingPicture = data.imageCell?.querySelector('picture');
    if (existingPicture) {
      const clone = existingPicture.cloneNode(true);
      const cloneImg = clone.querySelector('img');
      if (cloneImg && data.alt) cloneImg.alt = data.alt;
      figure.append(clone);
    } else {
      const img = document.createElement('img');
      img.src = imageSrc;
      img.alt = data.alt || '';
      img.loading = 'lazy';
      figure.append(img);
    }
    panelInner.append(figure);
  } else if (isAuthoring) {
    const placeholder = document.createElement('div');
    placeholder.className = 'report-archive-placeholder';
    placeholder.textContent = 'Add cover image in Universal Editor.';
    panelInner.append(placeholder);
  }

  // Links
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
    if (open) {
      openPanel(panel, panelInner);
    } else {
      closePanel(panel);
    }
  });

  return item;
}

async function parseItemRow(row, isAuthoring) {
  const yearField = readTextField(row, 'year', { fallbackCell: row.children[0] });
  const imageField = readImageField(row, 'coverImage', { fallbackCell: row.children[1] });
  const altField = readTextField(row, 'coverImageAlt', { fallbackCell: null });

  const yearCell = yearField.source || yearField.cell;
  const imageCell = imageField.source || imageField.cell;

  const year = yearField.value || '';
  const alt = altField.value || imageField.img?.alt || '';
  const linksSource = row.querySelector('[data-richtext-prop="links"], [data-aue-prop="links"]')
    || (!isAuthoring ? row.children[row.children.length - 1] || null : null);

  return {
    year,
    yearCell,
    imageCell,
    alt,
    linksSource,
  };
}

export default async function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const rows = [...block.querySelectorAll(':scope > div')];
  const configRows = getBlockConfigRows(rows);
  const itemRows = rows.filter(isItemRow);

  const headingField = readTextField(block, 'heading', {
    fallbackCell: configRows[0]?.children.length >= 2 ? configRows[0].children[1] : null,
  });
  const bgField = readTextField(block, 'backgroundColor', {
    fallbackCell: configRows[1]?.children.length >= 2 ? configRows[1].children[1] : null,
  });

  const headingText = headingField.value || '';
  const headingSource = headingField.source || headingField.cell;
  const bgColor = bgField.value || '';

  configRows.forEach((r) => r.remove());

  if (bgColor) block.style.backgroundColor = bgColor;

  const wrapper = document.createElement('div');
  wrapper.className = 'report-archive-wrapper';

  if (headingText) {
    const heading = document.createElement('h2');
    heading.className = 'report-archive-heading';
    if (headingSource) moveInstrumentation(headingSource, heading);
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

  const items = await Promise.all(
    itemRows.map(async (row, index) => {
      const data = await parseItemRow(row, isAuthoring);
      return buildAccordionItem(data, row, index, isAuthoring);
    }),
  );

  (await Promise.all(items)).forEach((item) => accordion.append(item));

  wrapper.append(accordion);
  block.replaceChildren(wrapper);
}
