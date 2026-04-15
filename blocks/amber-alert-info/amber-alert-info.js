import { createOptimizedPicture } from '../../scripts/aem.js';

function getField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return '';
  return source.textContent.trim();
}

function getLinkField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return '';
  const anchor = source.tagName === 'A' ? source : source.querySelector('a');
  return anchor?.getAttribute('href') || source.getAttribute('href') || source.textContent.trim();
}

function getPictureFor(block, name, fallbackPicture) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  return (
    source?.closest('picture')
    || source?.querySelector('picture')
    || fallbackPicture
    || null
  );
}

export default function decorate(block) {
  const allPictures = [...block.querySelectorAll('picture')];
  const mainPicture = getPictureFor(block, 'mainImage', allPictures[0]);
  const iconPicture = getPictureFor(
    block,
    'icon',
    allPictures.find((p) => p !== mainPicture) || null,
  );

  const mainImageAlt = getField(block, 'mainImageAlt');
  const title = getField(block, 'title');
  const subtitle = getField(block, 'subtitle');
  const buttonText = getField(block, 'buttonText');
  const buttonLink = getLinkField(block, 'buttonLink');
  const stat1Number = getField(block, 'stat1Number');
  const stat1Text = getField(block, 'stat1Text');
  const stat2Number = getField(block, 'stat2Number');
  const stat2Text = getField(block, 'stat2Text');

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
