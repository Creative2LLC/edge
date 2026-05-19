import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

function getField(row, name, index) {
  const field = readTextField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getLinkField(row, name, index) {
  const field = readLinkField(row, name, { fallbackCell: row.children[index] });
  return { source: field.source, value: field.value };
}

function getImageField(row, index) {
  const { picture, img } = readImageField(row, 'image', { fallbackCell: row.children[index] });
  return { picture, img };
}

function buildSlide(data, row) {
  const slide = document.createElement('div');
  slide.className = 'detailed-carousel-slide';
  if (row) moveInstrumentation(row, slide);

  const card = document.createElement('div');
  card.className = 'detailed-carousel-card';

  // Top: image
  const media = document.createElement('div');
  media.className = 'detailed-carousel-media';

  if (data.imageField.picture) {
    const { picture } = data.imageField;
    media.append(picture);
    const img = picture.querySelector('img');
    if (img) {
      if (data.imageAlt) img.alt = data.imageAlt;
      const optimized = createOptimizedPicture(img.src, img.alt, false, [{ width: '800' }]);
      moveInstrumentation(img, optimized.querySelector('img'));
      picture.replaceWith(optimized);
    }
  } else if (data.imageField.img) {
    const pic = createOptimizedPicture(
      data.imageField.img.src,
      data.imageAlt,
      false,
      [{ width: '800' }],
    );
    media.append(pic);
  }

  card.append(media);

  // Bottom: content area
  const content = document.createElement('div');
  content.className = 'detailed-carousel-content';

  // Three stat columns
  const stats = document.createElement('div');
  stats.className = 'detailed-carousel-stats';

  const statFields = [
    { title: data.stat1Title, body: data.stat1Body },
    { title: data.stat2Title, body: data.stat2Body },
    { title: data.stat3Title, body: data.stat3Body },
  ];

  statFields.forEach((stat) => {
    const col = document.createElement('div');
    col.className = 'detailed-carousel-stat';

    if (stat.title) {
      const h4 = document.createElement('h4');
      h4.className = 'detailed-carousel-stat-title';
      h4.textContent = stat.title;
      col.append(h4);
    }

    if (stat.body) {
      const p = document.createElement('p');
      p.className = 'detailed-carousel-stat-body';
      p.textContent = stat.body;
      col.append(p);
    }

    stats.append(col);
  });

  content.append(stats);

  // Button
  if (data.buttonText && data.buttonLink) {
    const btn = document.createElement('a');
    btn.className = 'detailed-carousel-button';
    btn.href = data.buttonLink;
    btn.textContent = data.buttonText;
    if (data.buttonColor) {
      btn.style.setProperty('background-color', data.buttonColor, 'important');
    }
    content.append(btn);
  }

  card.append(content);
  slide.append(card);
  return slide;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  let sectionTitle = '';
  let sectionDescription = '';
  const slideRows = [];

  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) {
      const headingEl = row.querySelector('[data-aue-prop="heading"]');
      const descEl = row.querySelector('[data-aue-prop="description"]');
      if (headingEl) sectionTitle = headingEl.textContent.trim();
      else if (descEl) sectionDescription = descEl.textContent.trim();
      else {
        const text = row.textContent.trim();
        if (text && !sectionTitle) sectionTitle = text;
        else if (text && !sectionDescription) sectionDescription = text;
      }
    } else {
      slideRows.push(row);
    }
  });

  const slides = [];
  slideRows.forEach((row) => {
    const imageField = getImageField(row, 0);
    const imageAltField = getField(row, 'imageAlt', 1);
    const stat1TitleField = getField(row, 'stat1Title', 2);
    const stat1BodyField = getField(row, 'stat1Body', 3);
    const stat2TitleField = getField(row, 'stat2Title', 4);
    const stat2BodyField = getField(row, 'stat2Body', 5);
    const stat3TitleField = getField(row, 'stat3Title', 6);
    const stat3BodyField = getField(row, 'stat3Body', 7);
    const buttonTextField = getField(row, 'buttonText', 8);
    const buttonLinkField = getLinkField(row, 'buttonLink', 9);
    const buttonColorField = getField(row, 'buttonColor', 10);

    slides.push({
      data: {
        imageField,
        imageAlt: imageAltField.value,
        stat1Title: stat1TitleField.value,
        stat1Body: stat1BodyField.value,
        stat2Title: stat2TitleField.value,
        stat2Body: stat2BodyField.value,
        stat3Title: stat3TitleField.value,
        stat3Body: stat3BodyField.value,
        buttonText: buttonTextField.value,
        buttonLink: buttonLinkField.value,
        buttonColor: buttonColorField.value,
      },
      row,
    });
  });

  // Build wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'detailed-carousel-wrapper';

  if (sectionTitle) {
    const h2 = document.createElement('h2');
    h2.className = 'detailed-carousel-title';
    h2.textContent = sectionTitle;
    wrapper.append(h2);
  }

  if (sectionDescription) {
    const desc = document.createElement('p');
    desc.className = 'detailed-carousel-description';
    desc.textContent = sectionDescription;
    wrapper.append(desc);
  }

  // Track
  const track = document.createElement('div');
  track.className = 'detailed-carousel-track';

  slides.forEach(({ data, row }) => {
    track.append(buildSlide(data, row));
  });

  wrapper.append(track);

  block.replaceChildren(wrapper);
}
