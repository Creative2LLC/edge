import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkField, readRichTextField, readTextField } from '../../scripts/block-field-utils.js';
import { applyButtonStyle, resolveButtonStyle } from '../../scripts/button-utils.js';

const FIELD_INDEX = {
  heading: 0,
  subheading: 1,
  buttonText: 2,
  buttonSubtext: 3,
  buttonLink: 4,
  helperText: 5,
  backgroundStart: 6,
  backgroundEnd: 7,
  buttonColor: 8,
  buttonTextColor: 9,
};

const DEFAULTS = {
  heading: 'Ready to talk? Call Team HOPE today.',
  subheading: 'All support is phone-based and completely free of charge.',
  buttonText: 'Call 866-305-HOPE',
  buttonSubtext: '866-305-4673',
  buttonLink: 'tel:+18663054673',
  helperText: "You'll be connected with a volunteer who understands what you're going through.",
  backgroundStart: '#f3efea',
  backgroundEnd: '#ece8e3',
};

function moveText(field, target, fallbackValue = '') {
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

export default function decorate(block) {
  const headingField = readRichTextField(block, 'heading', FIELD_INDEX.heading);
  const subheadingField = readRichTextField(block, 'subheading', FIELD_INDEX.subheading);
  const buttonTextField = readTextField(block, 'buttonText', FIELD_INDEX.buttonText);
  const buttonSubtextField = readTextField(block, 'buttonSubtext', FIELD_INDEX.buttonSubtext);
  const buttonLinkField = readLinkField(block, 'buttonLink', FIELD_INDEX.buttonLink);
  const helperTextField = readTextField(block, 'helperText', FIELD_INDEX.helperText);
  const backgroundStartField = readTextField(block, 'backgroundStart', FIELD_INDEX.backgroundStart);
  const backgroundEndField = readTextField(block, 'backgroundEnd', FIELD_INDEX.backgroundEnd);
  const buttonColorField = readTextField(block, 'buttonColor', FIELD_INDEX.buttonColor);

  block.style.setProperty(
    '--support-cta-background-start',
    backgroundStartField.value || DEFAULTS.backgroundStart,
  );
  block.style.setProperty(
    '--support-cta-background-end',
    backgroundEndField.value || DEFAULTS.backgroundEnd,
  );

  const card = document.createElement('div');
  card.className = 'support-cta-card';

  const content = document.createElement('div');
  content.className = 'support-cta-content';

  const heading = document.createElement('h2');
  heading.className = 'support-cta-heading';
  moveText(headingField, heading, DEFAULTS.heading);

  const subheading = document.createElement('p');
  subheading.className = 'support-cta-subheading';
  moveText(subheadingField, subheading, DEFAULTS.subheading);

  const ctaHref = buttonLinkField.value || DEFAULTS.buttonLink;
  const cta = document.createElement(ctaHref ? 'a' : 'div');
  cta.className = 'support-cta-button';
  if (ctaHref) cta.href = ctaHref;

  if (buttonLinkField.source) {
    moveInstrumentation(buttonLinkField.source, cta);
  }

  const ctaLabel = document.createElement('span');
  ctaLabel.className = 'support-cta-button-label';
  moveText(buttonTextField, ctaLabel, DEFAULTS.buttonText);

  const ctaSubtext = document.createElement('span');
  ctaSubtext.className = 'support-cta-button-subtext';
  moveText(buttonSubtextField, ctaSubtext, DEFAULTS.buttonSubtext);

  cta.append(ctaLabel, ctaSubtext);
  // The look comes from the button standard; the old colour picker only chooses the style.
  applyButtonStyle(cta, resolveButtonStyle(buttonColorField.value));

  const helperText = document.createElement('p');
  helperText.className = 'support-cta-helper';
  moveText(helperTextField, helperText, DEFAULTS.helperText);

  content.append(heading, subheading, cta, helperText);
  card.append(content);
  block.replaceChildren(card);
}
