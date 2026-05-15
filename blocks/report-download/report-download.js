import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const FIELD_ROW_INDEX = {
  backImage: 0,
  backImageAlt: 1,
  frontImage: 2,
  frontImageAlt: 3,
  heading: 4,
  bodyText: 5,
  buttonText: 6,
  buttonLink: 7,
};

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute('data-aue-resource')
      || scope?.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function getTextField(block, name, rowIndex = FIELD_ROW_INDEX[name], columnIndex = 0) {
  const field = readTextField(block, name, { rowIndex, columnIndex });
  return { source: field.source || field.cell, value: field.value };
}

function getRichField(block, name, rowIndex = FIELD_ROW_INDEX[name], columnIndex = 0) {
  const field = readRichTextField(block, name, { rowIndex, columnIndex });
  return field.source || field.cell;
}

function getLinkField(block, name, rowIndex = FIELD_ROW_INDEX[name], columnIndex = 0) {
  const field = readLinkField(block, name, { rowIndex, columnIndex });
  return { source: field.source || field.cell, value: field.value };
}

function getImageField(block, name, rowIndex = FIELD_ROW_INDEX[name], columnIndex = 0) {
  const field = readImageField(block, name, { rowIndex, columnIndex });
  return {
    source: field.source || field.cell,
    picture: field.picture,
    img: field.img,
  };
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (!target) return;

  if (!field?.source) {
    if (fallbackValue) target.textContent = fallbackValue;
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);

  if (!target.childNodes.length && fallbackValue) {
    target.textContent = fallbackValue;
  }
}

function buildRichContent(source, className) {
  if (!source) return null;

  const content = document.createElement('div');
  content.className = className;
  moveInstrumentation(source, content);
  while (source.firstChild) content.append(source.firstChild);

  return content.childNodes.length ? content : null;
}

function buildPicture(imageField, altField, width) {
  if (!imageField.img) return null;

  const alt = altField.value || imageField.img.alt || '';
  const picture = createOptimizedPicture(
    imageField.img.src,
    alt,
    false,
    [{ width: String(width) }],
  );
  const pictureImg = picture.querySelector('img');

  if (
    imageField.source
    && imageField.source !== imageField.picture
    && imageField.source !== imageField.img
  ) {
    moveInstrumentation(imageField.source, picture);
  }

  if (imageField.picture && imageField.picture !== imageField.source) {
    moveInstrumentation(imageField.picture, picture);
  }

  if (imageField.img && pictureImg) {
    moveInstrumentation(imageField.img, pictureImg);
  }

  if (altField.source && pictureImg) {
    moveInstrumentation(altField.source, pictureImg);
    pictureImg.alt = altField.value || alt;
  }

  return picture;
}

function buildAuthoringPlaceholder(className, text) {
  const placeholder = document.createElement('div');
  placeholder.className = className;
  placeholder.textContent = text;
  return placeholder;
}

function buildButton(labelField, linkField) {
  const label = labelField.value.trim();
  const href = linkField.value.trim();

  if (!label) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = 'report-download-button report-download-reveal';
  if (href) button.href = href;
  if (href && linkField.source) moveInstrumentation(linkField.source, button);

  if (labelField.source) {
    moveFieldContent(labelField, button, label);
  } else {
    button.textContent = label;
  }

  return button.textContent.trim() ? button : null;
}

export default function decorate(block) {
  const isAuthoring = hasAuthoringContext(block);
  const backImageField = getImageField(block, 'backImage');
  const backImageAltField = getTextField(block, 'backImageAlt');
  const frontImageField = getImageField(block, 'frontImage');
  const frontImageAltField = getTextField(block, 'frontImageAlt');
  const headingField = getTextField(block, 'heading');
  const bodyTextSource = getRichField(block, 'bodyText');
  const buttonTextField = getTextField(block, 'buttonText');
  const buttonLinkField = getLinkField(block, 'buttonLink');

  const backPicture = buildPicture(backImageField, backImageAltField, 620);
  const frontPicture = buildPicture(frontImageField, frontImageAltField, 440);
  const inner = document.createElement('div');
  inner.className = 'report-download-inner';

  const media = document.createElement('div');
  media.className = 'report-download-media';

  if (backPicture) {
    const backCover = document.createElement('figure');
    backCover.className = 'report-download-cover is-back report-download-reveal';
    backCover.append(backPicture);
    media.append(backCover);
  }

  if (frontPicture) {
    const frontCover = document.createElement('figure');
    frontCover.className = 'report-download-cover is-front report-download-reveal';
    frontCover.append(frontPicture);
    media.append(frontCover);
  }

  if (!media.childElementCount && isAuthoring) {
    media.append(
      buildAuthoringPlaceholder(
        'report-download-media-placeholder report-download-reveal',
        'Add one or two report cover images in Universal Editor.',
      ),
    );
  }

  inner.append(media);

  const content = document.createElement('div');
  content.className = 'report-download-content report-download-reveal';

  if (headingField.value || headingField.source) {
    const heading = document.createElement('h2');
    heading.className = 'report-download-heading';
    moveFieldContent(headingField, heading, headingField.value);
    content.append(heading);
  } else if (isAuthoring) {
    content.append(
      buildAuthoringPlaceholder('report-download-text-placeholder', 'Add a heading.'),
    );
  }

  const body = buildRichContent(bodyTextSource, 'report-download-body');
  if (body) {
    content.append(body);
  } else if (isAuthoring) {
    content.append(
      buildAuthoringPlaceholder('report-download-text-placeholder', 'Add body copy.'),
    );
  }

  inner.append(content);

  const actions = document.createElement('div');
  actions.className = 'report-download-actions';
  const button = buildButton(buttonTextField, buttonLinkField);
  if (button) {
    actions.append(button);
  } else if (isAuthoring) {
    actions.append(
      buildAuthoringPlaceholder(
        'report-download-button-placeholder report-download-reveal',
        'Add button text to show the CTA.',
      ),
    );
  }

  inner.append(actions);
  block.replaceChildren(inner);
}
