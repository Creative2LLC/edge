import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getFieldSelector,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const BLOCK_FIELD_INDEX = {
  columns: 0,
  styleVariant: 1,
  sectionHeading: 2,
  sectionSubheading: 3,
  footerText: 4,
  sectionButtonText: 5,
  sectionButtonLink: 6,
  introButtonText: 7,
  introButtonLink: 8,
  headerAlignment: 9,
  cardContentAlignment: 10,
};

const ITEM_FIELD_NAMES = [
  'icon',
  'title',
  'subtitle',
  'bodyContent',
  'buttonText',
  'buttonLink',
  'buttonStyle',
  'cardBackgroundColor',
  'buttonBackgroundColor',
  'button2Text',
  'button2Link',
  'button2Style',
  'button2BackgroundColor',
  'iconColor',
  'textColor',
  'overlayImage',
  'cardStyle',
  'cardHoverBackgroundColor',
];

const ITEM_FIELD_INDEX = Object.fromEntries(
  ITEM_FIELD_NAMES.map((name, index) => [name, index]),
);

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

  if (['link', 'text', 'plain'].includes(normalizedValue)) {
    return 'link';
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
  const field = readTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getLinkField(row, name, index) {
  const field = readLinkField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getRichField(row, name, index) {
  const field = readRichTextField(row, name, { fallbackCell: row.children[index] });
  return field.source || field.cell;
}

function getImageField(row, name, index) {
  const field = readImageField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, img: field.img };
}

function getBlockField(block, rows, name, index) {
  const row = rows[index];
  const field = readTextField(block, name, { fallbackCell: row?.children[0] || row });
  return { source: field.source, value: field.value };
}

function getBlockLinkField(block, rows, name, index) {
  const row = rows[index];
  const field = readLinkField(block, name, { fallbackCell: row?.children[0] || row });
  return { source: field.source, value: field.value };
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

  const subtitle = document.createElement('div');
  subtitle.className = 'info-cards-grid-card-subtitle';
  moveFieldContent(data.subtitleField, subtitle);
  if (!subtitle.textContent.trim()) return;
  content.append(subtitle);
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

  btn.classList.remove('is-solid', 'is-outlined', 'is-link');

  if (normalizedStyle === 'link') {
    const linkColor = buttonBg || '#008db6';
    btn.classList.add('is-link');
    btn.style.setProperty('background-color', 'transparent', 'important');
    btn.style.setProperty('color', linkColor, 'important');
    btn.style.setProperty('border', 'none', 'important');
    return;
  }

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

function buildSectionButton(textField, linkField, className = 'info-cards-grid-section-button') {
  const label = textField?.value || '';
  const href = linkField?.value || '';
  if (!label && !href) return null;

  const button = document.createElement(href ? 'a' : 'button');
  button.className = className;
  button.textContent = label || 'Learn More';
  if (href) button.href = href;
  if (!href) button.type = 'button';
  if (textField?.source) moveInstrumentation(textField.source, button);
  if (linkField?.source) moveInstrumentation(linkField.source, button);

  return button;
}

function hasItemFieldProps(row) {
  return ITEM_FIELD_NAMES.some((name) => row.querySelector(getFieldSelector(name)));
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
  } else {
    card.classList.add('info-cards-grid-card-default');
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
  if (data.cardHoverBg) {
    card.classList.add('info-cards-grid-card-has-hover-bg');
    card.style.setProperty('--info-card-hover-bg', data.cardHoverBg);
  }
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

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const firstItemRowIndex = rows.findIndex((row) => {
    if (hasItemFieldProps(row)) return true;
    if (row.querySelector('[data-aue-prop]')) return false;
    return row.children.length >= 4;
  });
  const blockRows = firstItemRowIndex >= 0 ? rows.slice(0, firstItemRowIndex) : rows;
  const itemRows = firstItemRowIndex >= 0 ? rows.slice(firstItemRowIndex) : [];
  const columnsField = getBlockField(block, blockRows, 'columns', BLOCK_FIELD_INDEX.columns);
  const styleVariantField = getBlockField(block, blockRows, 'styleVariant', BLOCK_FIELD_INDEX.styleVariant);
  const sectionHeadingField = getBlockField(block, blockRows, 'sectionHeading', BLOCK_FIELD_INDEX.sectionHeading);
  const sectionSubheadingField = getBlockField(block, blockRows, 'sectionSubheading', BLOCK_FIELD_INDEX.sectionSubheading);
  const introButtonTextField = getBlockField(block, blockRows, 'introButtonText', BLOCK_FIELD_INDEX.introButtonText);
  const introButtonLinkField = getBlockLinkField(block, blockRows, 'introButtonLink', BLOCK_FIELD_INDEX.introButtonLink);
  const footerTextField = getBlockField(block, blockRows, 'footerText', BLOCK_FIELD_INDEX.footerText);
  const sectionButtonTextField = getBlockField(block, blockRows, 'sectionButtonText', BLOCK_FIELD_INDEX.sectionButtonText);
  const sectionButtonLinkField = getBlockLinkField(block, blockRows, 'sectionButtonLink', BLOCK_FIELD_INDEX.sectionButtonLink);
  const headerAlignmentField = getBlockField(block, blockRows, 'headerAlignment', BLOCK_FIELD_INDEX.headerAlignment);
  const cardContentAlignmentField = getBlockField(block, blockRows, 'cardContentAlignment', BLOCK_FIELD_INDEX.cardContentAlignment);

  const columns = parseInt(columnsField.value, 10) || 3;
  const variant = styleVariantField.value === 'volunteer' ? 'volunteer' : 'default';
  const headerAlignment = ['left', 'center', 'right'].includes(headerAlignmentField.value)
    ? headerAlignmentField.value
    : 'left';
  const cardContentAlignment = ['left', 'center', 'right'].includes(cardContentAlignmentField.value)
    ? cardContentAlignmentField.value
    : 'left';

  block.classList.toggle('info-cards-grid-volunteer', variant === 'volunteer');
  block.classList.toggle('info-cards-grid-button-top', styleVariantField.value === 'button-top');

  const cards = [];
  itemRows.forEach((row) => {
    const iconField = getImageField(row, 'icon', 0);
    const titleField = getField(row, 'title', 1);
    const subtitleField = getField(row, 'subtitle', 2);
    const bodySource = getRichField(row, 'bodyContent', 3);
    const buttonTextField = getField(row, 'buttonText', ITEM_FIELD_INDEX.buttonText);
    const buttonLinkField = getLinkField(row, 'buttonLink', ITEM_FIELD_INDEX.buttonLink);
    const buttonStyleField = getField(row, 'buttonStyle', ITEM_FIELD_INDEX.buttonStyle);
    const cardBgField = getField(row, 'cardBackgroundColor', ITEM_FIELD_INDEX.cardBackgroundColor);
    const cardHoverBgField = getField(
      row,
      'cardHoverBackgroundColor',
      ITEM_FIELD_INDEX.cardHoverBackgroundColor,
    );
    const buttonBgField = getField(row, 'buttonBackgroundColor', ITEM_FIELD_INDEX.buttonBackgroundColor);
    const button2TextField = getField(row, 'button2Text', ITEM_FIELD_INDEX.button2Text);
    const button2LinkField = getLinkField(row, 'button2Link', ITEM_FIELD_INDEX.button2Link);
    const button2StyleField = getField(row, 'button2Style', ITEM_FIELD_INDEX.button2Style);
    const button2BgField = getField(row, 'button2BackgroundColor', ITEM_FIELD_INDEX.button2BackgroundColor);
    const iconColorField = getField(row, 'iconColor', ITEM_FIELD_INDEX.iconColor);
    const textStyleField = getField(row, 'textColor', ITEM_FIELD_INDEX.textColor);
    const overlayField = getImageField(row, 'overlayImage', ITEM_FIELD_INDEX.overlayImage);
    const cardStyleField = getField(row, 'cardStyle', ITEM_FIELD_INDEX.cardStyle);
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
      cardHoverBg: cardHoverBgField.value,
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
  intro.classList.add(`info-cards-grid-intro-align-${headerAlignment}`);
  const introContent = document.createElement('div');
  introContent.className = 'info-cards-grid-intro-content';
  const introHeading = buildSectionText(sectionHeadingField, 'h2', 'info-cards-grid-section-heading');
  const introSubheading = buildSectionText(sectionSubheadingField, 'p', 'info-cards-grid-section-subheading');
  const introButton = buildSectionButton(
    introButtonTextField,
    introButtonLinkField,
    'info-cards-grid-intro-button',
  );
  if (introHeading) introContent.append(introHeading);
  if (introSubheading) introContent.append(introSubheading);
  if (introContent.childElementCount) intro.append(introContent);
  if (introButton) intro.append(introButton);
  if (intro.childElementCount) shell.append(intro);

  const grid = document.createElement('div');
  grid.className = 'info-cards-grid-inner';
  grid.classList.add(`info-cards-grid-inner-align-${cardContentAlignment}`);
  grid.style.setProperty('--grid-columns', columns);

  const cardElements = cards.map((data, index) => buildCard(data, index, variant));
  const orphanCount = columns > 1 ? cardElements.length % columns : 0;
  const fullRowCount = cardElements.length - orphanCount;

  cardElements.slice(0, fullRowCount).forEach((card) => grid.append(card));

  if (orphanCount > 0) {
    const orphanRow = document.createElement('div');
    orphanRow.className = 'info-cards-grid-orphan-row';
    cardElements.slice(fullRowCount).forEach((card) => orphanRow.append(card));
    grid.append(orphanRow);
  }

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
}
