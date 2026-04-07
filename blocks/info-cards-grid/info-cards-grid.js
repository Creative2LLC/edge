import { moveInstrumentation } from '../../scripts/scripts.js';

const BLOCK_FIELD_INDEX = {
  columns: 0,
  styleVariant: 1,
  sectionHeading: 2,
  sectionSubheading: 3,
  footerText: 4,
  sectionButtonText: 5,
  sectionButtonLink: 6,
};

const ITEM_FIELD_NAMES = [
  'icon',
  'title',
  'subtitle',
  'bodyContent',
  'buttonText',
  'buttonLink',
  'buttonStyle',
  'buttonBackgroundColor',
  'button2Text',
  'button2Link',
  'button2Style',
  'button2BackgroundColor',
  'cardBackgroundColor',
  'iconColor',
  'textColor',
  'overlayImage',
  'cardStyle',
];

function hasMeaningfulNodeContent(node) {
  if (!node) return false;
  if (node.textContent.trim()) return true;
  return Boolean(node.querySelector('img, picture, video, iframe, svg, ul, ol, li, a, button'));
}

function hasFieldContent(field) {
  return Boolean(field?.value || hasMeaningfulNodeContent(field?.source));
}

function normalizeLines(value) {
  if (!value) return [];
  return String(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeStyleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z]+/g, ' ');
}

function normalizeIconLayout(value) {
  const normalizedValue = normalizeStyleKey(value);

  if (['left', 'left aligned', 'left align', 'icon left', 'left icon'].includes(normalizedValue)) {
    return 'left';
  }

  return 'default';
}

function normalizeCardStyle(value) {
  const normalizedValue = normalizeStyleKey(value);

  if (['outline', 'outlined', 'border', 'bordered', 'dashed'].includes(normalizedValue)) {
    return 'outline';
  }

  if (['filled', 'solid', 'light'].includes(normalizedValue)) {
    return 'filled';
  }

  return 'default';
}

function normalizeButtonStyle(value) {
  const normalizedValue = normalizeStyleKey(value);

  if (['outline', 'outlined', 'border', 'bordered'].includes(normalizedValue)) {
    return 'outlined';
  }

  if (['solid', 'filled', 'fill'].includes(normalizedValue)) {
    return 'solid';
  }

  return 'default';
}

function normalizeCssSize(value) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return '';
  if (/^\d+(\.\d+)?$/.test(normalizedValue)) return `${normalizedValue}px`;
  return normalizedValue;
}

function parseTextStyles(value) {
  return normalizeLines(value).reduce((styles, line) => {
    const separatorIndex = line.includes('|') ? line.indexOf('|') : line.indexOf(':');

    if (separatorIndex <= 0) {
      if (!styles.textColor) styles.textColor = line.trim();
      return styles;
    }

    const key = normalizeStyleKey(line.slice(0, separatorIndex));
    const styleValue = line.slice(separatorIndex + 1).trim();
    if (!styleValue) return styles;

    if (['color', 'text', 'text color'].includes(key)) styles.textColor = styleValue;
    else if (['title color', 'heading color'].includes(key)) styles.titleColor = styleValue;
    else if (['subtitle color', 'subheading color'].includes(key)) styles.subtitleColor = styleValue;
    else if (['body color', 'body text color', 'text body color'].includes(key)) styles.bodyColor = styleValue;
    else if (['title size', 'heading size', 'title font size', 'heading font size'].includes(key)) styles.titleSize = styleValue;
    else if (['subtitle size', 'subheading size', 'subtitle font size', 'subheading font size'].includes(key)) styles.subtitleSize = styleValue;
    else if (['body size', 'body font size', 'text size', 'body text size'].includes(key)) styles.bodySize = styleValue;
    else if (['icon size', 'icon dimension', 'icon width'].includes(key)) styles.iconSize = normalizeCssSize(styleValue);
    else if (['icon layout', 'icon position', 'layout'].includes(key)) styles.iconLayout = normalizeIconLayout(styleValue);

    return styles;
  }, {});
}

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return { source: null, value: anchor?.href || cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

function getRichField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return source;
  const cols = [...row.children];
  return cols[index] || null;
}

function getImageField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const img = source.tagName === 'IMG' ? source : source.querySelector('img');
    return { source, img };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const img = cols[index].querySelector('img');
    return { source: null, img: img || null };
  }
  return { source: null, img: null };
}

function moveFieldContent(field, target) {
  if (!field?.source) {
    target.textContent = field?.value || '';
    return;
  }

  moveInstrumentation(field.source, target);
  while (field.source.firstChild) target.append(field.source.firstChild);
}

function buildTitle(content, data) {
  if (!hasFieldContent(data.titleField)) return;

  const h3 = document.createElement('h3');
  h3.className = 'info-cards-grid-card-title';
  moveFieldContent(data.titleField, h3);
  if (!h3.textContent.trim()) return;
  content.append(h3);
}

function buildSubtitle(content, data) {
  if (!hasFieldContent(data.subtitleField)) return;

  const p = document.createElement('p');
  p.className = 'info-cards-grid-card-subtitle';
  moveFieldContent(data.subtitleField, p);
  if (!p.textContent.trim()) return;
  content.append(p);
}

function buildBody(content, data) {
  if (!hasMeaningfulNodeContent(data.bodySource)) return;

  const body = document.createElement('div');
  body.className = 'info-cards-grid-card-body';
  moveInstrumentation(data.bodySource, body);
  while (data.bodySource.firstChild) body.append(data.bodySource.firstChild);
  if (!hasMeaningfulNodeContent(body)) return;
  content.append(body);
}

function styleCardButton(btn, buttonBg, buttonStyle, cardBg, variant) {
  const isVolunteerVariant = variant === 'volunteer';
  const normalizedStyle = normalizeButtonStyle(buttonStyle);

  btn.classList.remove('is-solid', 'is-outlined');

  if (normalizedStyle === 'outlined') {
    const accentColor = buttonBg || (isVolunteerVariant ? '#008db6' : '#ffffff');
    btn.classList.add('is-outlined');
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('color', accentColor, 'important');
    btn.style.setProperty('border', `2px solid ${accentColor}`, 'important');
    return;
  }

  if (normalizedStyle === 'solid') {
    const solidBg = buttonBg || '#008db6';
    const solidText = buttonBg && !isVolunteerVariant ? cardBg : '#ffffff';
    btn.classList.add('is-solid');
    btn.style.setProperty('background-color', solidBg, 'important');
    btn.style.setProperty('color', solidText, 'important');
    btn.style.setProperty('border', 'none', 'important');
    return;
  }

  if (buttonBg) {
    btn.classList.add('is-solid');
    btn.style.setProperty('background-color', buttonBg, 'important');
    btn.style.setProperty('color', isVolunteerVariant ? '#ffffff' : cardBg, 'important');
    btn.style.setProperty('border', 'none', 'important');
  } else if (isVolunteerVariant) {
    btn.classList.add('is-solid');
    btn.style.setProperty('background-color', '#008db6', 'important');
    btn.style.setProperty('color', '#ffffff', 'important');
    btn.style.setProperty('border', 'none', 'important');
  } else {
    btn.classList.add('is-outlined');
    btn.style.setProperty('background-color', cardBg, 'important');
    btn.style.setProperty('color', '#ffffff', 'important');
    btn.style.setProperty('border', '2px solid #ffffff', 'important');
  }
}

function buildCardButton(buttonData, cardBg, variant) {
  const btnLabel = buttonData.textField.value;
  const btnHref = buttonData.linkField.value;
  if (!btnLabel && !btnHref) return null;

  const btn = document.createElement(btnHref ? 'a' : 'button');
  btn.className = 'info-cards-grid-card-button';
  btn.textContent = btnLabel || 'Learn More';
  if (btnHref) btn.href = btnHref;
  if (!btnHref) btn.type = 'button';
  if (buttonData.textField.source) moveInstrumentation(buttonData.textField.source, btn);
  if (buttonData.linkField.source) moveInstrumentation(buttonData.linkField.source, btn);

  styleCardButton(btn, buttonData.backgroundColor, buttonData.style, cardBg, variant);
  return btn;
}

function buildButtons(card, data, cardBg, variant) {
  const buttons = [
    buildCardButton({
      textField: data.buttonTextField,
      linkField: data.buttonLinkField,
      backgroundColor: data.buttonBg,
      style: data.buttonStyle,
    }, cardBg, variant),
    buildCardButton({
      textField: data.button2TextField,
      linkField: data.button2LinkField,
      backgroundColor: data.button2Bg,
      style: data.button2Style,
    }, cardBg, variant),
  ].filter(Boolean);

  if (!buttons.length) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'info-cards-grid-card-buttons';
  buttons.forEach((button) => wrapper.append(button));
  card.append(wrapper);
}

function buildSectionText(field, tagName, className) {
  if (!hasFieldContent(field)) return null;

  const element = document.createElement(tagName);
  element.className = className;
  moveFieldContent(field, element);

  if (!hasMeaningfulNodeContent(element)) return null;
  return element;
}

function buildSectionButton(textField, linkField) {
  const label = textField?.value || '';
  const href = linkField?.value || '';
  if (!label && !href) return null;

  const button = document.createElement(href ? 'a' : 'button');
  button.className = 'info-cards-grid-section-button';
  button.textContent = label || 'Learn More';
  if (href) button.href = href;
  if (!href) button.type = 'button';
  if (textField?.source) moveInstrumentation(textField.source, button);
  if (linkField?.source) moveInstrumentation(linkField.source, button);

  return button;
}

function hasItemFieldProps(row) {
  return ITEM_FIELD_NAMES.some((name) => row.querySelector(`[data-aue-prop="${name}"]`));
}

function buildIcon(content, data) {
  if (!data.iconField.img) return;

  const iconColor = data.iconColor || '#ffffff';
  const normalizedColor = iconColor.toLowerCase();
  const isWhite = normalizedColor === '#ffffff'
    || normalizedColor === '#fff'
    || normalizedColor === 'white';

  if (isWhite) {
    const img = data.iconField.img.cloneNode(true);
    img.className = 'info-cards-grid-card-icon';
    if (data.iconField.source) moveInstrumentation(data.iconField.source, img);
    img.style.setProperty('filter', 'brightness(0) invert(1)', 'important');
    content.append(img);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'info-cards-grid-card-icon-wrap';
  wrap.style.setProperty('background-color', iconColor, 'important');
  wrap.style.setProperty('-webkit-mask-image', `url(${data.iconField.img.src})`, 'important');
  wrap.style.setProperty('mask-image', `url(${data.iconField.img.src})`, 'important');
  wrap.style.setProperty('-webkit-mask-size', 'contain', 'important');
  wrap.style.setProperty('mask-size', 'contain', 'important');
  wrap.style.setProperty('-webkit-mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('mask-repeat', 'no-repeat', 'important');
  wrap.style.setProperty('-webkit-mask-position', 'center', 'important');
  wrap.style.setProperty('mask-position', 'center', 'important');
  if (data.iconField.source) moveInstrumentation(data.iconField.source, wrap);
  content.append(wrap);
}

function applyTextStyles(card, textStyles) {
  if (!textStyles) return;

  if (textStyles.textColor) {
    card.style.setProperty('--info-card-title-color', textStyles.textColor);
    card.style.setProperty('--info-card-subtitle-color', textStyles.textColor);
    card.style.setProperty('--info-card-body-color', textStyles.textColor);
  }

  if (textStyles.titleColor) card.style.setProperty('--info-card-title-color', textStyles.titleColor);
  if (textStyles.subtitleColor) card.style.setProperty('--info-card-subtitle-color', textStyles.subtitleColor);
  if (textStyles.bodyColor) card.style.setProperty('--info-card-body-color', textStyles.bodyColor);
  if (textStyles.titleSize) card.style.setProperty('--info-card-title-size', textStyles.titleSize);
  if (textStyles.subtitleSize) card.style.setProperty('--info-card-subtitle-size', textStyles.subtitleSize);
  if (textStyles.bodySize) card.style.setProperty('--info-card-body-size', textStyles.bodySize);
}

function buildCard(data, index, variant) {
  const card = document.createElement('div');
  card.className = 'info-cards-grid-card';
  card.style.setProperty('--info-card-index', index);
  if (data.row) moveInstrumentation(data.row, card);

  const isVolunteerVariant = variant === 'volunteer';
  let { cardStyle } = data;
  if (cardStyle === 'default' && isVolunteerVariant) {
    cardStyle = 'filled';
  }

  if (isVolunteerVariant) {
    card.classList.add('info-cards-grid-card-volunteer');
  }

  if (cardStyle === 'filled') {
    card.classList.add('info-cards-grid-card-filled');
  } else if (cardStyle === 'outline') {
    card.classList.add('info-cards-grid-card-outline');
  }

  let cardBg = data.cardBg || '#1a1a2e';
  if (isVolunteerVariant && !data.cardBg) {
    cardBg = cardStyle === 'outline' ? 'transparent' : '#ffffff';
  }

  card.style.setProperty('--info-card-bg', cardBg);
  applyTextStyles(card, data.textStyles);

  if (isVolunteerVariant && !data.textStyles.textColor) {
    card.style.setProperty('--info-card-title-color', '#00264d');
    card.style.setProperty('--info-card-subtitle-color', '#465a70');
    card.style.setProperty('--info-card-body-color', '#2f485d');
  }

  if (data.iconSize) {
    card.style.setProperty('--info-card-icon-size', data.iconSize);
  }

  if (data.iconLayout === 'left' && data.iconField.img) {
    card.classList.add('info-cards-grid-card-left-icon');
  }

  if (data.overlayField?.img) {
    const overlay = document.createElement('div');
    overlay.className = 'info-cards-grid-card-overlay';
    const img = data.overlayField.img.cloneNode(true);
    if (data.overlayField.source) moveInstrumentation(data.overlayField.source, img);
    overlay.append(img);
    card.append(overlay);
  }

  const content = document.createElement('div');
  content.className = 'info-cards-grid-card-content';

  buildIcon(content, data);

  const textContent = document.createElement('div');
  textContent.className = 'info-cards-grid-card-text';
  buildTitle(textContent, data);
  buildSubtitle(textContent, data);
  buildBody(textContent, data);

  if (textContent.childElementCount) {
    content.append(textContent);
  }

  card.append(content);
  buildButtons(card, data, cardBg, variant);

  return card;
}

function setupMatchedHeights(block, grid) {
  if (typeof block.infoCardsGridHeightCleanup === 'function') {
    block.infoCardsGridHeightCleanup();
  }

  const cards = [...grid.querySelectorAll('.info-cards-grid-card')];
  if (!cards.length) {
    block.infoCardsGridHeightCleanup = null;
    return;
  }

  let frameId = 0;
  const syncHeights = () => {
    if (frameId) window.cancelAnimationFrame(frameId);

    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      cards.forEach((card) => card.style.removeProperty('--info-card-matched-height'));

      const tallestHeight = Math.ceil(
        Math.max(0, ...cards.map((card) => card.getBoundingClientRect().height)),
      );

      cards.forEach((card) => {
        if (tallestHeight > 0) {
          card.style.setProperty('--info-card-matched-height', `${tallestHeight}px`);
        } else {
          card.style.removeProperty('--info-card-matched-height');
        }
      });
    });
  };

  const onResize = () => syncHeights();
  window.addEventListener('resize', onResize, { passive: true });

  const mutationObserver = 'MutationObserver' in window
    ? new MutationObserver(() => syncHeights())
    : null;
  mutationObserver?.observe(grid, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => syncHeights())
    : null;
  cards.forEach((card) => {
    const observedTarget = card.querySelector('.info-cards-grid-card-content') || card;
    resizeObserver?.observe(observedTarget);
  });

  grid.querySelectorAll('img').forEach((img) => {
    if (img.complete) return;
    img.addEventListener('load', syncHeights, { once: true });
    img.addEventListener('error', syncHeights, { once: true });
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => syncHeights()).catch(() => {});
  }

  syncHeights();

  block.infoCardsGridHeightCleanup = () => {
    if (frameId) window.cancelAnimationFrame(frameId);
    window.removeEventListener('resize', onResize);
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    cards.forEach((card) => card.style.removeProperty('--info-card-matched-height'));
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

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const columnsField = getField(block, 'columns', BLOCK_FIELD_INDEX.columns);
  const styleVariantField = getField(block, 'styleVariant', BLOCK_FIELD_INDEX.styleVariant);
  const sectionHeadingField = getField(block, 'sectionHeading', BLOCK_FIELD_INDEX.sectionHeading);
  const sectionSubheadingField = getField(block, 'sectionSubheading', BLOCK_FIELD_INDEX.sectionSubheading);
  const footerTextField = getField(block, 'footerText', BLOCK_FIELD_INDEX.footerText);
  const sectionButtonTextField = getField(block, 'sectionButtonText', BLOCK_FIELD_INDEX.sectionButtonText);
  const sectionButtonLinkField = getLinkField(block, 'sectionButtonLink', BLOCK_FIELD_INDEX.sectionButtonLink);

  const columns = parseInt(columnsField.value, 10) || 3;
  const variant = styleVariantField.value === 'volunteer' ? 'volunteer' : 'default';

  block.classList.toggle('info-cards-grid-volunteer', variant === 'volunteer');

  const cards = [];
  rows
    .filter((row) => {
      if (hasItemFieldProps(row)) return true;
      if (row.querySelector('[data-aue-prop]')) return false;
      return row.children.length >= 4;
    })
    .forEach((row) => {
      const iconField = getImageField(row, 'icon', 0);
      const titleField = getField(row, 'title', 1);
      const subtitleField = getField(row, 'subtitle', 2);
      const bodySource = getRichField(row, 'bodyContent', 3);
      const buttonTextField = getField(row, 'buttonText', 4);
      const buttonLinkField = getLinkField(row, 'buttonLink', 5);
      const buttonStyleField = getField(row, 'buttonStyle', 6);
      const buttonBgField = getField(row, 'buttonBackgroundColor', 7);
      const button2TextField = getField(row, 'button2Text', 8);
      const button2LinkField = getLinkField(row, 'button2Link', 9);
      const button2StyleField = getField(row, 'button2Style', 10);
      const button2BgField = getField(row, 'button2BackgroundColor', 11);
      const cardBgField = getField(row, 'cardBackgroundColor', 12);
      const iconColorField = getField(row, 'iconColor', 13);
      const textStyleField = getField(row, 'textColor', 14);
      const overlayField = getImageField(row, 'overlayImage', 15);
      const cardStyleField = getField(row, 'cardStyle', 16);
      const textStyles = parseTextStyles(textStyleField.value);

      cards.push({
        iconField,
        titleField,
        subtitleField,
        bodySource,
        buttonTextField,
        buttonLinkField,
        buttonStyle: normalizeButtonStyle(buttonStyleField.value),
        button2TextField,
        button2LinkField,
        button2Style: normalizeButtonStyle(button2StyleField.value),
        cardBg: cardBgField.value,
        buttonBg: buttonBgField.value,
        button2Bg: button2BgField.value,
        iconColor: iconColorField.value,
        textStyles,
        overlayField,
        cardStyle: normalizeCardStyle(cardStyleField.value),
        iconLayout: textStyles.iconLayout || 'default',
        iconSize: textStyles.iconSize,
        row,
      });
    });

  const shell = document.createElement('div');
  shell.className = 'info-cards-grid-shell';

  const intro = document.createElement('div');
  intro.className = 'info-cards-grid-intro';
  const introHeading = buildSectionText(sectionHeadingField, 'h2', 'info-cards-grid-section-heading');
  const introSubheading = buildSectionText(sectionSubheadingField, 'p', 'info-cards-grid-section-subheading');
  if (introHeading) intro.append(introHeading);
  if (introSubheading) intro.append(introSubheading);
  if (intro.childElementCount) shell.append(intro);

  const grid = document.createElement('div');
  grid.className = 'info-cards-grid-inner';
  grid.style.setProperty('--grid-columns', columns);

  cards.forEach((data, index) => {
    grid.append(buildCard(data, index, variant));
  });

  shell.append(grid);

  const footer = document.createElement('div');
  footer.className = 'info-cards-grid-footer';
  const footerText = buildSectionText(footerTextField, 'p', 'info-cards-grid-footer-text');
  const sectionButton = buildSectionButton(sectionButtonTextField, sectionButtonLinkField);
  if (footerText) footer.append(footerText);
  if (sectionButton) footer.append(sectionButton);
  if (footer.childElementCount) shell.append(footer);

  block.replaceChildren(shell);
  setupMatchedHeights(block, grid);
  observeReveal(block);
}
