import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function getField(scope, name, index) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };

  const cols = [...scope.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getRichField(scope, name, index) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source;

  const cols = [...scope.children];
  return cols[index] || null;
}

function getImageField(scope, name, index) {
  const source = scope.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const picture = source.querySelector('picture');
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return {
      source,
      picture,
      img: img || picture?.querySelector('img') || null,
    };
  }

  const cols = [...scope.children];
  const column = cols[index];
  if (!column) {
    return { source: null, picture: null, img: null };
  }

  return {
    source: null,
    picture: column.querySelector('picture'),
    img: column.querySelector('img'),
  };
}

function buildOptimizedImage(imageField, imageAlt) {
  const { img } = imageField;
  if (!img?.src) return null;

  const optimized = createOptimizedPicture(img.src, imageAlt || img.alt || '', false, [
    { media: '(min-width: 900px)', width: '900' },
    { width: '700' },
  ]);

  moveInstrumentation(img, optimized.querySelector('img'));
  return optimized;
}

function buildBody(bodySource, textColor) {
  if (!bodySource) return null;

  const body = document.createElement('div');
  body.className = 'split-card-gap-body';
  if (textColor) body.style.color = textColor;

  moveInstrumentation(bodySource, body);
  while (bodySource.firstChild) body.append(bodySource.firstChild);

  return body.childNodes.length ? body : null;
}

function buildBenefitItem(data, textColor) {
  if (!data.iconField.img && !data.titleField.value && !data.titleField.source) {
    return null;
  }

  const item = document.createElement('div');
  item.className = 'split-card-gap-benefit';
  if (data.row) moveInstrumentation(data.row, item);

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

  if (data.titleField.value || data.titleField.source) {
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
  const isAuthoring = block.hasAttribute('data-aue-resource');
  const imageField = getImageField(block, 'image', 0);
  const imageAltField = getField(block, 'imageAlt', 1);
  const headingField = getField(block, 'heading', 2);
  const bodySource = getRichField(block, 'bodyText', 3);
  const contentBackgroundColorField = getField(block, 'contentBackgroundColor', 4);
  const textColorField = getField(block, 'textColor', 5);

  const imageAlt = imageAltField.value;
  const heading = headingField.value;
  const contentBackgroundColor = contentBackgroundColorField.value || '#ffffff';
  const textColor = textColorField.value || '';

  const rows = [...block.querySelectorAll(':scope > div')];
  const benefits = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    const isItemRow = row.querySelector('[data-aue-prop="icon"]')
      || row.querySelector('[data-aue-prop="title"]')
      || cols.length >= 3;

    if (!isItemRow) return;

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

  const showEmptyBenefitsHint = isAuthoring && !benefits.length;

  const inner = document.createElement('div');
  inner.className = 'split-card-gap-inner';

  const media = document.createElement('div');
  media.className = 'split-card-gap-media';
  const picture = buildOptimizedImage(imageField, imageAlt);
  if (picture) media.append(picture);
  inner.append(media);

  const content = document.createElement('div');
  content.className = 'split-card-gap-content';
  content.style.backgroundColor = contentBackgroundColor;

  if (heading) {
    const headingEl = document.createElement('h2');
    headingEl.className = 'split-card-gap-heading';
    headingEl.textContent = heading;
    if (textColor) headingEl.style.color = textColor;
    if (headingField.source) moveInstrumentation(headingField.source, headingEl);
    content.append(headingEl);
  }

  const body = buildBody(bodySource, textColor);
  if (body) content.append(body);

  if (benefits.length || showEmptyBenefitsHint) {
    const benefitsGrid = document.createElement('div');
    benefitsGrid.className = 'split-card-gap-benefits';
    benefits.forEach((benefit) => benefitsGrid.append(benefit));

    if (showEmptyBenefitsHint) {
      benefitsGrid.classList.add('is-empty');
      const hint = document.createElement('p');
      hint.className = 'split-card-gap-empty-hint';
      hint.textContent = 'Add Split Card Gap Item children in Universal Editor.';
      benefitsGrid.append(hint);
    }

    content.append(benefitsGrid);
  }

  inner.append(content);
  block.replaceChildren(inner);
}
