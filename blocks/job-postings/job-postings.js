import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function isItemRow(row) {
  return Boolean(
    row.querySelector('[data-aue-prop="positionName"]')
      || row.querySelector('[data-aue-prop="location"]')
      || row.querySelector('[data-aue-prop="category"]')
      || row.querySelector('[data-aue-prop="employmentType"]'),
  );
}

function getField(scope, name, index) {
  const field = readTextField(scope, name, { fallbackCell: scope.children[index] });
  return { source: field.source, value: field.value };
}

function getLinkField(scope, name, index) {
  const field = readLinkField(scope, name, { fallbackCell: scope.children[index] });
  return { source: field.source, value: field.value };
}

function getImageField(scope, name) {
  return readImageField(scope, name).img;
}

function styleButton(btn, color, textColor, style) {
  const bgColor = color || '#008db6';
  if (style === 'outlined') {
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('color', bgColor, 'important');
    btn.style.setProperty('border', `2px solid ${bgColor}`, 'important');
  } else {
    btn.style.setProperty('background-color', bgColor, 'important');
    btn.style.setProperty('color', textColor || '#ffffff', 'important');
    btn.style.setProperty('border', 'none', 'important');
  }
}

function buildMetaItem(text, iconImg) {
  if (!text) return null;

  const span = document.createElement('span');
  span.className = 'job-postings-meta-item';

  if (iconImg) {
    const icon = iconImg.cloneNode(true);
    icon.className = 'job-postings-meta-icon';
    span.append(icon);
  }

  const label = document.createElement('span');
  label.textContent = text;
  span.append(label);

  return span;
}

function buildCard(data, icons) {
  const card = document.createElement('div');
  card.className = 'job-postings-card';
  if (data.row) moveInstrumentation(data.row, card);

  const bgColor = data.cardBg || '#DDD5CC52';
  card.style.setProperty('background-color', bgColor, 'important');

  const hasContent = data.positionName || data.location
    || data.category || data.employmentType;

  /* Authoring placeholder */
  if (!hasContent && data.isAuthoring) {
    card.classList.add('is-authoring-placeholder');
    const placeholder = document.createElement('p');
    placeholder.className = 'job-postings-card-placeholder';
    placeholder.textContent = 'Edit this job posting in the properties panel';
    card.append(placeholder);
    return card;
  }

  /* Left side — text content */
  const info = document.createElement('div');
  info.className = 'job-postings-card-info';

  if (data.positionName) {
    const title = document.createElement('h3');
    title.className = 'job-postings-card-title';
    title.textContent = data.positionName;
    info.append(title);
  }

  const meta = document.createElement('div');
  meta.className = 'job-postings-card-meta';

  const locItem = buildMetaItem(data.location, icons.location);
  const catItem = buildMetaItem(data.category, icons.category);
  const typeItem = buildMetaItem(data.employmentType, icons.type);

  if (locItem) meta.append(locItem);
  if (catItem) meta.append(catItem);
  if (typeItem) meta.append(typeItem);

  if (meta.childNodes.length) info.append(meta);
  card.append(info);

  /* Right side — apply button */
  const btnLabel = data.buttonText;
  const btnHref = data.buttonLink;
  if (btnLabel || btnHref) {
    const btn = document.createElement(btnHref ? 'a' : 'button');
    btn.className = 'job-postings-card-button';
    btn.textContent = btnLabel || 'Apply';
    if (btnHref) btn.href = btnHref;
    if (!btnHref) btn.type = 'button';
    styleButton(btn, data.buttonColor, data.buttonTextColor, data.buttonStyle);
    card.append(btn);
  }

  return card;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  /* Block-level icons */
  const locationIconImg = getImageField(block, 'locationIcon');
  const categoryIconImg = getImageField(block, 'categoryIcon');
  const typeIconImg = getImageField(block, 'typeIcon');
  const icons = {
    location: locationIconImg,
    category: categoryIconImg,
    type: typeIconImg,
  };

  /* Block-level bottom button */
  const bottomBtnTextField = getField(block, 'bottomButtonText');
  const bottomBtnLinkField = getLinkField(block, 'bottomButtonLink');
  const bottomBtnColorField = getField(block, 'bottomButtonColor');
  const bottomBtnTextColorField = getField(block, 'bottomButtonTextColor');
  const bottomBtnStyleField = getField(block, 'bottomButtonStyle');

  /* Collect job posting items */
  const items = [];
  rows.forEach((row) => {
    const aueItem = isItemRow(row);
    const cols = [...row.children];
    const enoughCols = cols.length >= 2;

    if (!aueItem && !enoughCols) return;

    const positionNameField = getField(row, 'positionName', 0);
    const locationField = getField(row, 'location', 1);
    const categoryField = getField(row, 'category', 2);
    const employmentTypeField = getField(row, 'employmentType', 3);
    const buttonTextField = getField(row, 'buttonText', 4);
    const buttonLinkField = getLinkField(row, 'buttonLink', 5);
    const buttonColorField = getField(row, 'buttonColor', 6);
    const buttonTextColorField = getField(row, 'buttonTextColor', 7);
    const buttonStyleField = getField(row, 'buttonStyle', 8);
    const cardBgField = getField(row, 'cardBackgroundColor', 9);

    const hasContent = positionNameField.value || locationField.value
      || categoryField.value || employmentTypeField.value;
    const authoring = hasAuthoringContext(row);

    if (!hasContent && !authoring) return;

    items.push({
      positionName: positionNameField.value,
      location: locationField.value,
      category: categoryField.value,
      employmentType: employmentTypeField.value,
      buttonText: buttonTextField.value,
      buttonLink: buttonLinkField.value,
      buttonColor: buttonColorField.value,
      buttonTextColor: buttonTextColorField.value,
      buttonStyle: buttonStyleField.value,
      cardBg: cardBgField.value,
      isAuthoring: authoring && !hasContent,
      row,
    });
  });

  /* Build list */
  const list = document.createElement('div');
  list.className = 'job-postings-list';

  items.forEach((data) => {
    list.append(buildCard(data, icons));
  });

  /* Bottom button */
  const wrapper = document.createElement('div');
  wrapper.className = 'job-postings-inner';
  wrapper.append(list);

  const bottomLabel = bottomBtnTextField.value;
  const bottomHref = bottomBtnLinkField.value;
  if (bottomLabel || bottomHref) {
    const bottomBtn = document.createElement(bottomHref ? 'a' : 'button');
    bottomBtn.className = 'job-postings-bottom-button';
    bottomBtn.textContent = bottomLabel || 'View All Positions';
    if (bottomHref) bottomBtn.href = bottomHref;
    if (!bottomHref) bottomBtn.type = 'button';
    styleButton(
      bottomBtn,
      bottomBtnColorField.value,
      bottomBtnTextColorField.value,
      bottomBtnStyleField.value,
    );
    wrapper.append(bottomBtn);
  }

  block.replaceChildren(wrapper);
}
