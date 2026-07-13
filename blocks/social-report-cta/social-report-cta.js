import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  getAueResourcePath,
  readImageField,
  readLinkField,
  readAueResourceFields,
  readRichTextField,
  readTextField,
  resourcePathFromAueResource,
} from '../../scripts/block-field-utils.js';

const FIELD_INDEX = {
  eyebrow: 0,
  socialHeading: 1,
  socialIntro: 2,
  facebookLink: 3,
  xLink: 4,
  instagramLink: 5,
  tiktokLink: 6,
  linkedinLink: 7,
  youtubeLink: 8,
  reportHeading: 9,
  reportBody: 10,
  reportImage: 11,
  reportImageAlt: 12,
  reportButtonText: 13,
  reportButtonLink: 14,
  reportPanelDisplay: 15,
  backgroundColor: 16,
  backgroundGradient: 17,
};

const SOCIALS = [
  {
    key: 'facebook', field: 'facebookLink', label: 'Facebook', glyph: 'f', handle: '@NCMEC',
  },
  {
    key: 'x', field: 'xLink', label: 'X', glyph: 'X', handle: '@NCMEC',
  },
  {
    key: 'instagram', field: 'instagramLink', label: 'Instagram', glyph: '◎', handle: '@NCMEC',
  },
  {
    key: 'tiktok', field: 'tiktokLink', label: 'TikTok', glyph: '♪', handle: '@NCMEC',
  },
  {
    key: 'linkedin', field: 'linkedinLink', label: 'LinkedIn', glyph: 'in', handle: 'NCMEC',
  },
  {
    key: 'youtube', field: 'youtubeLink', label: 'YouTube', glyph: '▶', handle: '@NCMEC',
  },
];

const RESOURCE_FIELD_NAMES = [
  ...SOCIALS.map((entry) => entry.field),
  'reportButtonLink',
  'backgroundColor',
  'backgroundGradient',
];

function directRows(block) {
  return [...block.querySelectorAll(':scope > div')];
}

function fieldCell(row) {
  if (!row) return null;
  return row.children.length > 1 ? row.children[1] : row.children[0] || row;
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope?.getAttribute?.('data-aue-resource')
      || scope?.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function fieldOptions(block, name, isEditor) {
  if (isEditor) return {};

  const fallbackCell = fieldCell(directRows(block)[FIELD_INDEX[name]]);
  return fallbackCell
    ? { fallbackCell }
    : { rowIndex: FIELD_INDEX[name], columnIndex: 0 };
}

function getTextField(block, name, isEditor) {
  const field = readTextField(block, name, fieldOptions(block, name, isEditor));
  return { ...field, source: field.source || field.cell };
}

function getRichField(block, name, isEditor) {
  const field = readRichTextField(block, name, fieldOptions(block, name, isEditor));
  return { ...field, source: field.source || field.cell };
}

function getLinkField(block, name, isEditor) {
  const field = readLinkField(block, name, fieldOptions(block, name, isEditor));
  return { ...field, source: field.source || field.cell };
}

function getImageField(block, name, isEditor) {
  const field = readImageField(block, name, fieldOptions(block, name, isEditor));
  return { ...field, source: field.source || field.cell };
}

function textValue(field) {
  return field?.value?.trim() || field?.text?.trim() || '';
}

function resourceValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return resourcePathFromAueResource(trimmed) || trimmed;
  }
  if (Array.isArray(value)) return value.map(resourceValue).find(Boolean) || '';
  if (typeof value !== 'object') return String(value).trim();

  const aemPath = Object.getOwnPropertyDescriptor(value, '_path')?.value;

  return [
    value.href,
    value.url,
    value.path,
    value.src,
    value.link,
    value.value,
    aemPath,
    value.asset?.path,
    value.asset?.url,
  ].map(resourceValue).find(Boolean) || '';
}

function elementLinkValue(element) {
  const linked = element?.matches?.('a[href], [href], [data-href], [data-url], [src]')
    ? element
    : element?.querySelector?.('a[href], [href], [data-href], [data-url], [src]');

  return resourceValue(
    linked?.getAttribute?.('href')
      || linked?.getAttribute?.('data-href')
      || linked?.getAttribute?.('data-url')
      || linked?.getAttribute?.('src'),
  );
}

function linkValue(field) {
  const value = resourceValue(field?.value)
    || elementLinkValue(field?.cell)
    || elementLinkValue(field?.source);

  return /^(?:add link|add pdf link)$/i.test(value) ? '' : value;
}

function cssBackgroundValue(value) {
  const normalized = resourceValue(value);
  if (!normalized) return '';
  if (!window.CSS?.supports || window.CSS.supports('background', normalized)) return normalized;
  return '';
}

function reportDisplayMode(field) {
  const value = textValue(field).toLowerCase();
  return ['auto', 'show', 'hide'].includes(value) ? value : 'auto';
}

function applyCustomBackground(inner, colorField, gradientField) {
  const background = cssBackgroundValue(textValue(gradientField))
    || cssBackgroundValue(textValue(colorField));
  if (background) inner.style.background = background;
}

function syncCustomBackground(inner, fields) {
  if (!Object.prototype.hasOwnProperty.call(fields, 'backgroundColor')
    && !Object.prototype.hasOwnProperty.call(fields, 'backgroundGradient')) return;

  const background = cssBackgroundValue(fields.backgroundGradient)
    || cssBackgroundValue(fields.backgroundColor);

  if (background) inner.style.background = background;
  else inner.style.removeProperty('background');
}

function richFieldHasContent(field) {
  return Boolean(
    field?.text?.trim()
      || field?.html?.trim()
      || field?.source?.textContent?.trim()
      || field?.source?.querySelector?.('img, picture, a, ul, ol, li'),
  );
}

function moveFieldContent(field, target, fallbackValue = '') {
  if (field?.source) {
    moveInstrumentation(field.source, target);
    while (field.source.firstChild) target.append(field.source.firstChild);
    return;
  }

  if (fallbackValue) target.textContent = fallbackValue;
}

function buildRichContent(field, className) {
  if (!richFieldHasContent(field)) return null;

  const wrapper = document.createElement('div');
  wrapper.className = className;

  if (field.source) {
    moveInstrumentation(field.source, wrapper);
    while (field.source.firstChild) wrapper.append(field.source.firstChild);
  } else if (field.html && /<[^>]+>/u.test(field.html)) {
    wrapper.innerHTML = field.html;
  } else {
    wrapper.textContent = textValue(field);
  }

  return wrapper;
}

function buildPlaceholder(text) {
  const placeholder = document.createElement('div');
  placeholder.className = 'social-report-cta-placeholder';
  placeholder.textContent = text;
  return placeholder;
}

function buildSocialTile(entry, linkField, isEditor) {
  const href = linkValue(linkField);
  if (!href && !isEditor) return null;

  const tile = document.createElement(href || isEditor ? 'a' : 'span');
  tile.className = `social-report-cta-social social-report-cta-social-${entry.key}`;
  tile.setAttribute('aria-label', `Follow NCMEC on ${entry.label}`);

  if (href) {
    tile.href = href;
    tile.target = '_blank';
    tile.rel = 'noopener noreferrer';
  } else {
    tile.classList.add('is-empty');
  }

  if (linkField.source) moveInstrumentation(linkField.source, tile);

  const icon = document.createElement('span');
  icon.className = 'social-report-cta-social-icon';
  icon.dataset.glyph = entry.glyph;
  icon.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'social-report-cta-social-copy';

  const label = document.createElement('span');
  label.className = 'social-report-cta-social-label';
  label.textContent = entry.label;

  const handle = document.createElement('span');
  handle.className = 'social-report-cta-social-handle';
  handle.textContent = href ? entry.handle : 'Add link';

  const arrow = document.createElement('span');
  arrow.className = 'social-report-cta-social-arrow';
  arrow.setAttribute('aria-hidden', 'true');

  copy.append(label, handle);
  tile.append(icon, copy, arrow);
  return tile;
}

function updateSocialTile(tile, handle, href, fallbackHandle) {
  if (!tile) return;

  if (href) {
    tile.href = href;
    tile.target = '_blank';
    tile.rel = 'noopener noreferrer';
    tile.classList.remove('is-empty');
    if (handle) handle.textContent = fallbackHandle;
    return;
  }

  tile.removeAttribute('href');
  tile.removeAttribute('target');
  tile.removeAttribute('rel');
  tile.classList.add('is-empty');
  if (handle) handle.textContent = 'Add link';
}

function buildReportImage(imageField, altField, isEditor) {
  const wrap = document.createElement('div');
  wrap.className = 'social-report-cta-report-visual';

  if (imageField.img) {
    const picture = createOptimizedPicture(
      imageField.img.src,
      textValue(altField) || imageField.img.alt || '',
      false,
      [{ width: '760' }],
    );
    const optimizedImg = picture.querySelector('img');

    if (imageField.source && imageField.source !== imageField.img) {
      moveInstrumentation(imageField.source, picture);
    }
    if (optimizedImg) moveInstrumentation(imageField.img, optimizedImg);

    wrap.append(picture);
  } else if (isEditor) {
    wrap.append(buildPlaceholder('Add the report cover image.'));
  }

  if (wrap.childElementCount) {
    const badge = document.createElement('span');
    badge.className = 'social-report-cta-report-badge';
    badge.textContent = 'PDF';
    wrap.append(badge);
  }

  return wrap.childElementCount ? wrap : null;
}

function buildReportButton(labelField, linkField, showEmptyButton = false) {
  const href = linkValue(linkField);
  const label = textValue(labelField) || (href ? 'Download the PDF' : '');
  if (!href && !showEmptyButton) return null;

  const button = document.createElement(href ? 'a' : 'span');
  button.className = 'social-report-cta-report-button';
  if (href) button.href = href;
  else button.classList.add('is-empty');
  if (linkField.source) moveInstrumentation(linkField.source, button);

  const text = document.createElement('span');
  text.className = 'social-report-cta-report-button-text';
  moveFieldContent(labelField, text, label || 'Add PDF button text');
  if (!text.textContent.trim() && !text.childElementCount) {
    text.textContent = label || 'Add PDF button text';
  }

  const icon = document.createElement('span');
  icon.className = 'social-report-cta-report-button-icon';
  icon.setAttribute('aria-hidden', 'true');

  button.append(text, icon);
  return button;
}

export default function decorate(block) {
  const isEditor = hasAuthoringContext(block);
  const resourcePath = getAueResourcePath(block);
  const eyebrowField = getTextField(block, 'eyebrow', isEditor);
  const socialHeadingField = getTextField(block, 'socialHeading', isEditor);
  const socialIntroField = getRichField(block, 'socialIntro', isEditor);
  const backgroundColorField = getTextField(block, 'backgroundColor', isEditor);
  const backgroundGradientField = getTextField(block, 'backgroundGradient', isEditor);
  const reportPanelDisplayField = getTextField(block, 'reportPanelDisplay', isEditor);
  const reportHeadingField = getTextField(block, 'reportHeading', isEditor);
  const reportBodyField = getRichField(block, 'reportBody', isEditor);
  const reportImageField = getImageField(block, 'reportImage', isEditor);
  const reportImageAltField = getTextField(block, 'reportImageAlt', isEditor);
  const reportButtonTextField = getTextField(block, 'reportButtonText', isEditor);
  const reportButtonLinkField = getLinkField(block, 'reportButtonLink', isEditor);

  const socialLinks = SOCIALS.map((entry) => ({
    entry,
    field: getLinkField(block, entry.field, isEditor),
  }));

  const hasReportContent = Boolean(
    textValue(reportHeadingField)
      || richFieldHasContent(reportBodyField)
      || reportImageField.img
      || linkValue(reportButtonLinkField),
  );
  const displayMode = reportDisplayMode(reportPanelDisplayField);
  const shouldRenderReport = displayMode === 'show'
    ? isEditor || hasReportContent
    : displayMode !== 'hide' && hasReportContent;

  const inner = document.createElement('div');
  inner.className = 'social-report-cta-inner';
  applyCustomBackground(inner, backgroundColorField, backgroundGradientField);
  if (!shouldRenderReport) inner.classList.add('is-social-only');

  const socialPanel = document.createElement('section');
  socialPanel.className = 'social-report-cta-panel social-report-cta-social-panel';
  socialPanel.setAttribute('aria-label', 'Social media links');

  if (textValue(eyebrowField) || eyebrowField.source) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'social-report-cta-eyebrow';
    moveFieldContent(eyebrowField, eyebrow, textValue(eyebrowField));
    socialPanel.append(eyebrow);
  }

  const socialHeading = document.createElement('h2');
  socialHeading.className = 'social-report-cta-heading';
  moveFieldContent(
    socialHeadingField,
    socialHeading,
    textValue(socialHeadingField) || 'Connect with us on social media',
  );
  socialPanel.append(socialHeading);

  const intro = buildRichContent(socialIntroField, 'social-report-cta-intro');
  if (intro) socialPanel.append(intro);

  const socialGrid = document.createElement('div');
  socialGrid.className = 'social-report-cta-social-grid';
  const socialTileData = [];
  socialLinks.forEach(({ entry, field }) => {
    const tile = buildSocialTile(entry, field, isEditor);
    if (tile) {
      socialTileData.push({
        entry,
        tile,
        handle: tile.querySelector('.social-report-cta-social-handle'),
      });
      socialGrid.append(tile);
    }
  });

  if (!socialGrid.childElementCount && isEditor) {
    socialGrid.append(buildPlaceholder('Add one or more social links.'));
  }
  socialPanel.append(socialGrid);
  inner.append(socialPanel);

  if (shouldRenderReport) {
    const reportPanel = document.createElement('section');
    reportPanel.className = 'social-report-cta-panel social-report-cta-report-panel';
    reportPanel.setAttribute('aria-label', 'Report download');

    const reportVisual = buildReportImage(reportImageField, reportImageAltField, isEditor);
    if (reportVisual) reportPanel.append(reportVisual);

    const reportContent = document.createElement('div');
    reportContent.className = 'social-report-cta-report-content';

    if (textValue(reportHeadingField) || reportHeadingField.source) {
      const reportHeading = document.createElement('h2');
      reportHeading.className = 'social-report-cta-report-heading';
      moveFieldContent(reportHeadingField, reportHeading, textValue(reportHeadingField));
      reportContent.append(reportHeading);
    } else if (isEditor) {
      reportContent.append(buildPlaceholder('Add report heading to show this panel live.'));
    }

    const reportBody = buildRichContent(reportBodyField, 'social-report-cta-report-body');
    if (reportBody) reportContent.append(reportBody);

    const button = buildReportButton(
      reportButtonTextField,
      reportButtonLinkField,
      isEditor && displayMode === 'show',
    );
    if (button) reportContent.append(button);

    reportPanel.append(reportContent);
    inner.append(reportPanel);
  }

  block.replaceChildren(inner);

  if (isEditor && resourcePath) {
    readAueResourceFields(resourcePath, RESOURCE_FIELD_NAMES).then((fields) => {
      syncCustomBackground(inner, fields);
      socialTileData.forEach(({ entry, tile, handle }) => {
        if (!Object.prototype.hasOwnProperty.call(fields, entry.field)) return;
        updateSocialTile(tile, handle, resourceValue(fields[entry.field]), entry.handle);
      });
    });
  }
}
