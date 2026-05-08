import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

export default function decorate(block) {
  const allPictures = [...block.querySelectorAll('picture')];
  const mainImageField = readImageField(block, 'mainImage', 0);
  const iconField = readImageField(block, 'icon', 2);
  const mainPicture = mainImageField.picture || allPictures[0] || null;
  const iconPicture = iconField.picture || allPictures.find((p) => p !== mainPicture) || null;

  const mainImageAlt = readTextField(block, 'mainImageAlt', 1).value;
  const title = readTextField(block, 'title', 3).value;
  const subtitle = readTextField(block, 'subtitle', 4).value;
  const buttonText = readTextField(block, 'buttonText', 5).value;
  const buttonLink = readLinkField(block, 'buttonLink', 6).value;
  const stat1Number = readTextField(block, 'stat1Number', 7).value;
  const stat1Text = readTextField(block, 'stat1Text', 8).value;
  const stat2Number = readTextField(block, 'stat2Number', 9).value;
  const stat2Text = readTextField(block, 'stat2Text', 10).value;

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

  // Left column of right side
  const mainCol = document.createElement('div');
  mainCol.className = 'amber-alert-info-main';

  if (iconPicture) {
    const iconImg = iconPicture.querySelector('img');
    const iconSrc = iconImg?.src || '';
    if (iconSrc) {
      const iconWrap = document.createElement('div');
      iconWrap.className = 'amber-alert-info-icon';
      iconWrap.style.maskImage = `url(${iconSrc})`;
      iconWrap.style.webkitMaskImage = `url(${iconSrc})`;
      mainCol.appendChild(iconWrap);
    }
  }

  if (title) {
    const h2 = document.createElement('h2');
    h2.className = 'amber-alert-info-title';
    h2.textContent = title;
    mainCol.appendChild(h2);
  }

  if (subtitle) {
    const p = document.createElement('p');
    p.className = 'amber-alert-info-subtitle';
    p.textContent = subtitle;
    mainCol.appendChild(p);
  }

  if (buttonText) {
    const button = document.createElement(buttonLink ? 'a' : 'span');
    button.className = 'amber-alert-info-button';
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
