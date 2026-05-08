import { moveInstrumentation } from '../../scripts/scripts.js';
import { readImageField, readTextField } from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  image: 0,
  heading: 1,
  copy: 2,
  email: 3,
  note: 4,
};

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function getImageField(block) {
  const field = readImageField(block, 'image', { rowIndex: 0, columnIndex: FIELD_INDEX.image });
  return { source: field.source || field.cell, img: field.img };
}

function mailTo(email) {
  return email ? `mailto:${email}` : '';
}

function appendText(parent, field, tagName, className) {
  if (!field.source && !field.value) return null;

  const element = document.createElement(tagName);
  element.className = className;
  if (field.source) {
    moveInstrumentation(field.source, element);
    while (field.source.firstChild) element.append(field.source.firstChild);
  } else {
    element.textContent = field.value;
  }

  if (!element.textContent.trim()) return null;
  parent.append(element);
  return element;
}

function buildVisual(imageField, href) {
  const visual = document.createElement(href ? 'a' : 'span');
  visual.className = 'media-contact-cta-visual';
  if (href) {
    visual.href = href;
    visual.setAttribute('aria-label', 'Email media team');
  }

  if (imageField.img) {
    const img = imageField.img.cloneNode(true);
    img.className = 'media-contact-cta-image';
    if (imageField.source) moveInstrumentation(imageField.source, img);
    visual.append(img);
  } else {
    visual.classList.add('is-fallback');
    visual.setAttribute('aria-hidden', href ? 'false' : 'true');
  }

  return visual;
}

export default function decorate(block) {
  const imageField = getImageField(block);
  const headingField = readTextField(block, 'heading', { rowIndex: 0, columnIndex: FIELD_INDEX.heading });
  const copyField = readTextField(block, 'copy', { rowIndex: 0, columnIndex: FIELD_INDEX.copy });
  const emailField = readTextField(block, 'email', { rowIndex: 0, columnIndex: FIELD_INDEX.email });
  const noteField = readTextField(block, 'note', { rowIndex: 0, columnIndex: FIELD_INDEX.note });
  const email = normalizeText(emailField.value);
  const href = mailTo(email);

  const inner = document.createElement('div');
  inner.className = 'media-contact-cta-inner';
  inner.append(buildVisual(imageField, href));

  const body = document.createElement('div');
  body.className = 'media-contact-cta-body';
  appendText(body, headingField, 'h2', 'media-contact-cta-heading');

  const copy = document.createElement('p');
  copy.className = 'media-contact-cta-copy';
  const copyText = normalizeText(copyField.value);
  if (copyField.source) {
    moveInstrumentation(copyField.source, copy);
    while (copyField.source.firstChild) copy.append(copyField.source.firstChild);
    if (email) copy.append(document.createTextNode(' '));
  } else if (copyText) {
    copy.append(document.createTextNode(`${copyText} `));
  }
  if (email) {
    const emailLink = document.createElement('a');
    emailLink.href = href;
    emailLink.textContent = email;
    if (emailField.source) moveInstrumentation(emailField.source, emailLink);
    copy.append(emailLink);
  }
  if (copy.textContent.trim()) body.append(copy);

  appendText(body, noteField, 'p', 'media-contact-cta-note');
  inner.append(body);
  block.replaceChildren(inner);
}
