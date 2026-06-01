/* eslint-disable no-use-before-define */
import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getFieldSelector,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const BLOCK_FIELD_NAMES = [
  'image',
  'imageAlt',
  'heading',
  'imageWidth',
  'bodyText',
  'contentBackgroundColor',
  'textColor',
  'primaryButtonText',
  'primaryButtonLink',
  'secondaryButtonText',
  'secondaryButtonLink',
  'maxWidth',
  'stylingType',
];

function getField(scope, name, index) {
  const field = readTextField(scope, name, { fallbackCell: getFallbackCell(scope, index) });
  return { source: field.source, value: field.value };
}

function getRichField(scope, name, index) {
  const field = readRichTextField(scope, name, { fallbackCell: getFallbackCell(scope, index) });
  return field.source || field.cell;
}

function getLinkField(scope, name, index) {
  const field = readLinkField(scope, name, { fallbackCell: getFallbackCell(scope, index) });
  return { source: field.source, value: field.value };
}

function getImageField(scope, name, index) {
  const field = readImageField(scope, name, { fallbackCell: getFallbackCell(scope, index) });
  return {
    source: field.source,
    picture: field.picture,
    img: field.img,
  };
}

function getParentRows(block) {
  return [...block.querySelectorAll(':scope > div')]
    .filter((row) => !isItemRow(row));
}

function getParentCells(block) {
  return getParentRows(block)
    .map((row) => row.children[0] || row)
    .filter(Boolean);
}

function getFallbackCell(scope, index) {
  if (!scope?.matches?.('.split-card-gap')) return scope?.children?.[index] || null;
  const parentCells = getParentCells(scope);
  const plainTextCells = parentCells.filter((cell) => {
    const text = cell.textContent.trim();
    return text && !cell.querySelector('picture') && !cell.querySelector('a[href]');
  });
  const colorCells = parentCells.filter((cell) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
    cell.textContent.trim(),
  ));
  const linkCells = parentCells.filter((cell) => {
    const anchor = cell.querySelector('a[href]');
    return anchor && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(anchor.textContent.trim());
  });

  const fallbackMap = {
    0: parentCells.find((cell) => cell.querySelector('picture')),
    2: plainTextCells[0],
    3: parentCells.find((cell) => /^\d+(\.\d+)?%?$/.test(cell.textContent.trim())),
    4: plainTextCells[1],
    5: colorCells[0],
    6: colorCells[1],
    7: plainTextCells[2],
    8: linkCells[0],
    9: plainTextCells[3],
    10: linkCells[1],
    11: parentCells.find((cell) => /^\d+(\.\d+)?(px|rem|%)?$/.test(cell.textContent.trim())),
    12: parentCells.find((cell) => /^(default|variant[\s-]?2)$/i.test(cell.textContent.trim())),
  };

  return fallbackMap[index] || parentCells[index] || null;
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function buildAuthoringPlaceholder(tagName, className, text) {
  const placeholder = document.createElement(tagName);
  placeholder.className = `${className} ${className}-placeholder`;
  placeholder.textContent = text;
  return placeholder;
}

function buildOptimizedImage(imageField, imageAlt) {
  const { img } = imageField;
  if (!img?.src) return null;

  const optimized = createOptimizedPicture(img.src, imageAlt || img.alt || '', false, [
    { media: '(min-width: 900px)', width: '900' },
    { width: '700' },
  ]);

  const optimizedImg = optimized.querySelector('img');
  moveInstrumentation(img, optimizedImg);

  if (
    imageField.source
    && imageField.source !== imageField.picture
    && imageField.source !== imageField.img
  ) {
    moveInstrumentation(imageField.source, optimized);
  }

  if (imageField.picture && imageField.picture !== imageField.source) {
    moveInstrumentation(imageField.picture, optimized);
  }

  return optimized;
}

function appendPlainText(wrapper, text) {
  const normalized = text.replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return;

  const paragraphs = normalized.split(/\n{2,}/u).filter(Boolean);
  const chunks = paragraphs.length ? paragraphs : [normalized];

  chunks.forEach((chunk) => {
    const paragraph = document.createElement('p');
    chunk.split('\n').forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement('br'));
      paragraph.append(document.createTextNode(line.trim()));
    });
    wrapper.append(paragraph);
  });
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!field?.source) {
    target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function buildHeading(headingSource, textColor) {
  if (!headingSource) return null;

  const headingEl = document.createElement('h2');
  headingEl.className = 'split-card-gap-heading';
  if (textColor) headingEl.style.color = textColor;

  moveInstrumentation(headingSource, headingEl);

  // Flatten rich text block wrappers (p/div) into a single heading, keeping
  // each authored paragraph on its own line via <br> and preserving any
  // inline formatting.
  const blocks = [...headingSource.children]
    .filter((node) => node.tagName === 'P' || node.tagName === 'DIV');

  if (blocks.length) {
    blocks.forEach((blockEl, index) => {
      if (index > 0) headingEl.append(document.createElement('br'));
      while (blockEl.firstChild) headingEl.append(blockEl.firstChild);
    });
  } else {
    while (headingSource.firstChild) headingEl.append(headingSource.firstChild);
  }

  return headingEl.textContent.trim() ? headingEl : null;
}

function buildBody(bodySource, textColor) {
  if (!bodySource) return null;

  const body = document.createElement('div');
  body.className = 'split-card-gap-body';
  if (textColor) body.style.color = textColor;

  moveInstrumentation(bodySource, body);

  const hasElementChildren = [...bodySource.childNodes]
    .some((node) => node.nodeType === Node.ELEMENT_NODE);

  if (hasElementChildren) {
    while (bodySource.firstChild) body.append(bodySource.firstChild);
  } else {
    appendPlainText(body, bodySource.textContent || '');
  }

  return body.textContent.trim() ? body : null;
}

function buildButton(textField, linkField, className) {
  const href = linkField.value;
  const label = textField.value || href;
  if (!label) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = className;
  if (href) button.href = href;

  moveFieldContent(textField, button, label);
  if (linkField.source) moveInstrumentation(linkField.source, button);

  return button;
}

function buildActions(primaryTextField, primaryLinkField, secondaryTextField, secondaryLinkField) {
  const primaryButton = buildButton(
    primaryTextField,
    primaryLinkField,
    'split-card-gap-button split-card-gap-button-primary',
  );
  const secondaryButton = buildButton(
    secondaryTextField,
    secondaryLinkField,
    'split-card-gap-button split-card-gap-button-secondary',
  );

  if (!primaryButton && !secondaryButton) return null;

  const actions = document.createElement('div');
  actions.className = 'split-card-gap-actions';
  if (primaryButton) actions.append(primaryButton);
  if (secondaryButton) actions.append(secondaryButton);
  return actions;
}

function normalizeSplitPercent(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const numeric = parseFloat(trimmed.replace('%', ''));
  if (Number.isNaN(numeric)) return '';

  const clamped = Math.min(75, Math.max(25, numeric));
  return `${clamped}%`;
}

function normalizeSizeValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

function isItemRow(row) {
  if (row.querySelector('[data-aue-prop="icon"], [data-aue-prop="title"]')) return true;
  if (row.querySelector(BLOCK_FIELD_NAMES.map((name) => getFieldSelector(name)).join(', '))) return false;
  return row.children.length >= 3 && Boolean(row.querySelector('picture'));
}

function buildBenefitItem(data, textColor) {
  const hasVisibleContent = Boolean(data.iconField.img || data.titleField.value);
  const isAuthoringPlaceholder = hasAuthoringContext(data.row) && !hasVisibleContent;

  if (!hasVisibleContent && !isAuthoringPlaceholder) {
    return null;
  }

  const item = document.createElement('div');
  item.className = 'split-card-gap-benefit';
  if (data.row) moveInstrumentation(data.row, item);

  if (isAuthoringPlaceholder) {
    item.classList.add('is-authoring-placeholder');

    const icon = document.createElement('div');
    icon.className = 'split-card-gap-benefit-icon is-empty';
    icon.append(
      buildAuthoringPlaceholder('span', 'split-card-gap-benefit-placeholder', 'Add benefit icon'),
    );
    item.append(icon);

    const title = buildAuthoringPlaceholder(
      'p',
      'split-card-gap-benefit-title',
      'Add benefit text in the editor.',
    );
    if (textColor) title.style.color = textColor;
    item.append(title);
    return item;
  }

  if (data.iconField.img) {
    const icon = document.createElement('div');
    icon.className = 'split-card-gap-benefit-icon';

    const img = data.iconField.img.cloneNode(true);
    if (data.iconField.source) moveInstrumentation(data.iconField.source, img);

    const imgSrc = img.currentSrc || img.src;
    const color = data.iconColor || '#008DB6';
    if (imgSrc) {
      icon.style.setProperty('background-color', color, 'important');
      icon.style.setProperty('-webkit-mask-image', `url("${imgSrc}")`, 'important');
      icon.style.setProperty('mask-image', `url("${imgSrc}")`, 'important');
      img.style.visibility = 'hidden';
    }

    icon.append(img);
    item.append(icon);
  }

  if (data.titleField.value) {
    const title = document.createElement('p');
    title.className = 'split-card-gap-benefit-title';
    if (textColor) title.style.color = textColor;

    if (data.titleField.source) {
      moveInstrumentation(data.titleField.source, title);
      while (data.titleField.source.firstChild) title.append(data.titleField.source.firstChild);
    } else {
      title.textContent = data.titleField.value;
    }

    item.append(title);
  }

  return item;
}

export default function decorate(block) {
  const imageField = getImageField(block, 'image', 0);
  const imageAltField = getField(block, 'imageAlt', 1);
  const headingSource = getRichField(block, 'heading', 2);
  const imageWidthField = getField(block, 'imageWidth', 3);
  const bodySource = getRichField(block, 'bodyText', 4);
  const contentBackgroundColorField = getField(block, 'contentBackgroundColor', 5);
  const textColorField = getField(block, 'textColor', 6);
  const primaryButtonTextField = getField(block, 'primaryButtonText', 7);
  const primaryButtonLinkField = getLinkField(block, 'primaryButtonLink', 8);
  const secondaryButtonTextField = getField(block, 'secondaryButtonText', 9);
  const secondaryButtonLinkField = getLinkField(block, 'secondaryButtonLink', 10);
  const maxWidthField = getField(block, 'maxWidth', 11);
  const stylingTypeField = getField(block, 'stylingType', 12);

  const imageAlt = imageAltField.value;
  const contentBackgroundColor = contentBackgroundColorField.value || '#ffffff';
  const textColor = textColorField.value || '';
  const imageWidth = normalizeSplitPercent(imageWidthField.value) || '52.5%';
  const maxWidth = normalizeSizeValue(maxWidthField.value);
  const stylingType = (stylingTypeField.value || 'default').trim().toLowerCase();
  const isVariant2 = /^variant[\s-]?2$/.test(stylingType);

  block.classList.toggle('split-card-gap-variant-2', isVariant2);

  block.style.setProperty('--split-card-gap-media-width', imageWidth);
  block.style.setProperty('--split-card-gap-content-width', `calc(100% - ${imageWidth})`);
  if (maxWidth) {
    block.style.setProperty('--split-card-gap-max-width', maxWidth);
  } else {
    block.style.removeProperty('--split-card-gap-max-width');
  }

  const rows = getParentRows(block).length
    ? [...block.querySelectorAll(':scope > div')].filter(isItemRow)
    : [...block.querySelectorAll(':scope > div')];
  const benefits = [];

  rows.forEach((row) => {
    if (!isItemRow(row)) return;

    const iconField = getImageField(row, 'icon', 0);
    const titleField = getField(row, 'title', 1);
    const iconColorField = getField(row, 'iconColor', 2);

    const benefit = buildBenefitItem({
      iconField,
      titleField,
      iconColor: iconColorField.value,
      row,
    }, textColor);

    if (benefit) benefits.push(benefit);
  });

  const inner = document.createElement('div');
  inner.className = 'split-card-gap-inner';

  const media = document.createElement('div');
  media.className = 'split-card-gap-media';
  const picture = buildOptimizedImage(imageField, imageAlt);
  if (picture) media.append(picture);
  inner.append(media);

  const content = document.createElement('div');
  content.className = 'split-card-gap-content';
  // Variant 2 uses a transparent content panel (handled in CSS); keep the
  // authored background color for the default styling type.
  if (!isVariant2) {
    content.style.backgroundColor = contentBackgroundColor;
  }

  const headingEl = buildHeading(headingSource, textColor);
  if (headingEl) content.append(headingEl);

  const body = buildBody(bodySource, textColor);
  if (body) content.append(body);

  if (benefits.length) {
    const benefitsGrid = document.createElement('div');
    benefitsGrid.className = 'split-card-gap-benefits';
    benefits.forEach((benefit) => benefitsGrid.append(benefit));
    content.append(benefitsGrid);
  }

  const actions = buildActions(
    primaryButtonTextField,
    primaryButtonLinkField,
    secondaryButtonTextField,
    secondaryButtonLinkField,
  );
  if (actions) content.append(actions);

  inner.append(content);
  block.replaceChildren(inner);
}
