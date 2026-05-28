import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  getBlockRows,
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function findHexAcrossRows(block) {
  const rows = getBlockRows(block);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const cell = rows[i]?.children?.[0];
    if (!cell) continue;
    if (cell.querySelector?.('picture, img, a')) continue;
    const text = cell.textContent?.trim() || '';
    if (HEX_RE.test(text)) return text.startsWith('#') ? text : `#${text}`;
  }
  return '';
}

export default function decorate(block) {
  const allPictures = [...block.querySelectorAll('picture')];
  const mainImageField = readImageField(block, 'mainImage', 0);
  const iconField = readImageField(block, 'icon', 2);
  const mainPicture = mainImageField.picture || allPictures[0] || null;
  const iconPicture = iconField.picture || allPictures.find((p) => p !== mainPicture) || null;

  const mainImageAlt = readTextField(block, 'mainImageAlt', 1).value;
  const titleField = readRichTextField(block, 'title', 3);
  const subtitleField = readRichTextField(block, 'subtitle', 4);
  const buttonText = readTextField(block, 'buttonText', 5).value;
  const buttonLink = readLinkField(block, 'buttonLink', 6).value;
  const stat1Number = readTextField(block, 'stat1Number', 7).value;
  const stat1Text = readTextField(block, 'stat1Text', 8).value;
  const stat2Number = readTextField(block, 'stat2Number', 9).value;
  const stat2Text = readTextField(block, 'stat2Text', 10).value;
  const rawBg = readTextField(block, 'backgroundColor', 11).value.trim();
  const directHex = HEX_RE.test(rawBg) ? (rawBg.startsWith('#') ? rawBg : `#${rawBg}`) : '';
  const backgroundColor = directHex || findHexAcrossRows(block);
  const buttonStyle = readTextField(block, 'buttonStyle', 12).value || 'solid';

  const container = document.createElement('div');
  container.className = 'amber-alert-info-container';

  // Left: main image
  const mediaSection = document.createElement('div');
  mediaSection.className = 'amber-alert-info-media';
  if (mainPicture) {
    const img = mainPicture.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(
        img.src,
        mainImageAlt || img.alt || '',
        false,
        [{ width: '800' }],
      );
      mediaSection.appendChild(optimized);
    }
  }
  container.appendChild(mediaSection);

  // Right: content
  const contentSection = document.createElement('div');
  contentSection.className = 'amber-alert-info-content';
  block.dataset.bgRead = rawBg || '(empty)';
  block.dataset.bgApplied = backgroundColor || '(none)';
  if (backgroundColor) {
    contentSection.style.setProperty('--amber-alert-info-bg', backgroundColor);
    contentSection.style.setProperty('background-color', backgroundColor, 'important');
  }

  // Left column of right side
  const mainCol = document.createElement('div');
  mainCol.className = 'amber-alert-info-main';

  if (iconPicture) {
    const iconImg = iconPicture.querySelector('img');
    const iconSrc = iconImg?.src || '';
    if (iconSrc) {
      const icon = document.createElement('img');
      icon.className = 'amber-alert-info-icon';
      icon.src = iconSrc;
      icon.alt = iconImg.alt || '';
      mainCol.appendChild(icon);
    }
  }

  if (titleField.html || titleField.text) {
    const h2 = document.createElement('h2');
    h2.className = 'amber-alert-info-title';
    h2.innerHTML = titleField.html || titleField.text;
    mainCol.appendChild(h2);
  }

  if (subtitleField.html || subtitleField.text) {
    const subtitle = document.createElement('div');
    subtitle.className = 'amber-alert-info-subtitle';
    subtitle.innerHTML = subtitleField.html || subtitleField.text;
    mainCol.appendChild(subtitle);
  }

  if (buttonText) {
    const button = document.createElement(buttonLink ? 'a' : 'span');
    button.className = `amber-alert-info-button amber-alert-info-button-${buttonStyle}`;
    if (buttonLink) button.href = buttonLink;
    button.textContent = buttonText;
    mainCol.appendChild(button);
  }

  contentSection.appendChild(mainCol);

  // Right column of right side (stats)
  const statsCol = document.createElement('div');
  statsCol.className = 'amber-alert-info-stats';

  function buildStat(number, text) {
    const stat = document.createElement('div');
    stat.className = 'amber-alert-info-stat';
    if (number) {
      const num = document.createElement('div');
      num.className = 'amber-alert-info-stat-number';
      num.textContent = number;
      stat.appendChild(num);
    }
    if (text) {
      const t = document.createElement('div');
      t.className = 'amber-alert-info-stat-text';
      t.textContent = text;
      stat.appendChild(t);
    }
    return stat;
  }

  if (stat1Number || stat1Text) {
    statsCol.appendChild(buildStat(stat1Number, stat1Text));
  }
  if ((stat1Number || stat1Text) && (stat2Number || stat2Text)) {
    const divider = document.createElement('div');
    divider.className = 'amber-alert-info-divider';
    statsCol.appendChild(divider);
  }
  if (stat2Number || stat2Text) {
    statsCol.appendChild(buildStat(stat2Number, stat2Text));
  }

  contentSection.appendChild(statsCol);
  container.appendChild(contentSection);

  block.textContent = '';
  block.appendChild(container);
}
