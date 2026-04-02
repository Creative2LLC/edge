import { moveInstrumentation } from '../../scripts/scripts.js';

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
  buttonColor: '#0f94bf',
  buttonTextColor: '#ffffff',
};

function getCell(rows, index) {
  const row = rows[index];
  if (!row) return null;
  return row.children[0] || row;
}

function getTextField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`);
  const cell = source || getCell(rows, index);
  return {
    source: cell,
    value: cell?.textContent?.trim() || '',
  };
}

function getLinkField(block, rows, name, index) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`) || getCell(rows, index);
  const anchor = source?.tagName === 'A' ? source : source?.querySelector('a');
  return {
    source,
    value: anchor?.href || source?.textContent?.trim() || '',
  };
}

function observeReveal(block) {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    block.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    block.classList.add('is-visible');
    observer.disconnect();
  }, { threshold: 0.18 });

  observer.observe(block);
}
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
  const rows = [...block.querySelectorAll(':scope > div')];

  const headingField = getTextField(block, rows, 'heading', FIELD_INDEX.heading);
  const subheadingField = getTextField(block, rows, 'subheading', FIELD_INDEX.subheading);
  const buttonTextField = getTextField(block, rows, 'buttonText', FIELD_INDEX.buttonText);
  const buttonSubtextField = getTextField(block, rows, 'buttonSubtext', FIELD_INDEX.buttonSubtext);
  const buttonLinkField = getLinkField(block, rows, 'buttonLink', FIELD_INDEX.buttonLink);
  const helperTextField = getTextField(block, rows, 'helperText', FIELD_INDEX.helperText);
  const backgroundStartField = getTextField(block, rows, 'backgroundStart', FIELD_INDEX.backgroundStart);
  const backgroundEndField = getTextField(block, rows, 'backgroundEnd', FIELD_INDEX.backgroundEnd);
  const buttonColorField = getTextField(block, rows, 'buttonColor', FIELD_INDEX.buttonColor);
  const buttonTextColorField = getTextField(block, rows, 'buttonTextColor', FIELD_INDEX.buttonTextColor);

  block.style.setProperty(
    '--support-cta-background-start',
    backgroundStartField.value || DEFAULTS.backgroundStart,
  );
  block.style.setProperty(
    '--support-cta-background-end',
    backgroundEndField.value || DEFAULTS.backgroundEnd,
  );
  block.style.setProperty(
    '--support-cta-button-color',
    buttonColorField.value || DEFAULTS.buttonColor,
  );
  block.style.setProperty(
    '--support-cta-button-text-color',
    buttonTextColorField.value || DEFAULTS.buttonTextColor,
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

  const helperText = document.createElement('p');
  helperText.className = 'support-cta-helper';
  moveText(helperTextField, helperText, DEFAULTS.helperText);

  content.append(heading, subheading, cta, helperText);
  card.append(content);
  block.replaceChildren(card);
  observeReveal(block);
}
