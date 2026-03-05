import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveAttributes } from '../../scripts/scripts.js';

const LEGACY_LABELS = {
  heading: ['heading', 'title'],
  subheading: ['subheading', 'subtitle', 'description'],
  placeholder: ['placeholder', 'select placeholder'],
  options: ['options', 'newsletter options'],
  target: ['target', 'open links in'],
};

function collectLegacyFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(LEGACY_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      map[name] = { source: valueEl, value: valueEl.textContent.trim() };
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getField(block, legacyMap, nameOrNames) {
  const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const source = block.querySelector(`[data-aue-prop="${name}"]`);
    if (source) {
      return { source, value: source.textContent.trim() };
    }
  }
  const legacyName = names.find((name) => legacyMap[name]);
  return legacyName ? legacyMap[legacyName] : { source: null, value: '' };
}

function moveFieldBinding(from, to) {
  if (!from || !to) return;
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-prop')
        || attr.startsWith('data-richtext-prop')
        || attr === 'data-aue-label'
        || attr.startsWith('data-richtext-')),
  );
}

function buildTextElement(tag, className, field) {
  if (!field?.value && !field?.source?.childNodes?.length) return null;
  const el = document.createElement(tag);
  el.className = className;
  if (field.source) {
    moveFieldBinding(field.source, el);
    while (field.source.firstChild) el.append(field.source.firstChild);
    field.source.remove();
  } else {
    el.textContent = field.value;
  }
  return el;
}

function parseOptions(value) {
  if (!value) return [];
  const normalized = value.replace(/\r/g, '');
  const delimiter = normalized.includes('\n') ? /\n+/ : /;+/;
  const lines = normalized.split(delimiter).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const [labelPart, urlPart] = line.includes('|')
      ? line.split('|', 2).map((part) => part.trim())
      : [line, line];
    return {
      label: labelPart || urlPart || '',
      url: urlPart || labelPart || '',
    };
  }).filter((option) => option.url);
}

function navigateTo(url, target) {
  if (!url) return;
  if (target === '_blank') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.assign(url);
}

function buildBackground(block) {
  const imageField = block.querySelector('[data-aue-prop="media_image"]')
    || block.querySelector('[data-aue-prop="image"]');
  const imageAltField = block.querySelector('[data-aue-prop="media_imageAlt"]')
    || block.querySelector('[data-aue-prop="imageAlt"]');
  const picture = imageField?.querySelector('picture') || block.querySelector('picture');
  const img = picture?.querySelector('img');
  if (!img) return null;
  const alt = imageAltField?.textContent?.trim() || img.alt || '';
  const optimized = createOptimizedPicture(img.src, alt, false, [
    { media: '(min-width: 900px)', width: '1800' },
    { media: '(min-width: 600px)', width: '1200' },
    { width: '900' },
  ]);
  const target = optimized.querySelector('img') || optimized;
  moveFieldBinding(imageField, target);
  moveFieldBinding(imageAltField, target);
  imageField?.remove();
  imageAltField?.remove();
  return optimized;
}

export default function decorate(block) {
  const legacyMap = collectLegacyFields(block);
  const headingField = getField(block, legacyMap, ['content_heading', 'heading']);
  const subheadingField = getField(block, legacyMap, ['content_subheading', 'subheading']);
  const placeholderField = getField(block, legacyMap, ['form_placeholder', 'placeholder']);
  const optionsField = getField(block, legacyMap, ['form_options', 'options']);
  const targetField = getField(block, legacyMap, ['form_target', 'target']);
  const background = buildBackground(block);

  const target = targetField.value === '_blank' ? '_blank' : '_self';
  if (targetField.source) targetField.source.remove();

  const content = document.createElement('div');
  content.className = 'newsletter-content';

  const heading = buildTextElement('h2', 'newsletter-heading', headingField);
  if (heading) content.append(heading);

  const subheading = buildTextElement('p', 'newsletter-subheading', subheadingField);
  if (subheading) content.append(subheading);

  const options = parseOptions(optionsField.value);
  if (optionsField.source) optionsField.source.remove();
  const placeholder = placeholderField.value || 'Select a Newsletter';
  if (placeholderField.source) placeholderField.source.remove();

  if (options.length) {
    const form = document.createElement('form');
    form.className = 'newsletter-form';

    const selectWrap = document.createElement('div');
    selectWrap.className = 'newsletter-select-wrap';

    const select = document.createElement('select');
    select.className = 'newsletter-select';
    select.setAttribute('aria-label', placeholder);

    const defaultOption = document.createElement('option');
    defaultOption.textContent = placeholder;
    defaultOption.value = '';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.append(defaultOption);

    options.forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.textContent = option.label;
      optionEl.value = option.url;
      select.append(optionEl);
    });

    select.addEventListener('change', () => {
      navigateTo(select.value, target);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      navigateTo(select.value, target);
    });

    selectWrap.append(select);
    form.append(selectWrap);
    content.append(form);
  }

  const children = [];
  if (background) {
    const media = document.createElement('div');
    media.className = 'newsletter-media';
    media.append(background);
    children.push(media);
  }
  children.push(content);

  block.replaceChildren(...children);
}
