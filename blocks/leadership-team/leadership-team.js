import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import resolveSiteHref from '../../scripts/link-utils.js';
import {
  readImageField,
  readLinkField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';
import { decorateButtonText } from '../../scripts/button-utils.js';

const FIELD_INDEX = {
  sectionName: 0,
  image: 1,
  imageAlt: 2,
  leaderName: 3,
  leaderTitle: 4,
  bio: 5,
  link: 6,
  imageSize: 7,
};

function getCell(row, index) {
  if (index === null || index === undefined) return null;
  return row.children[index] || null;
}

/**
 * Get text from a data-aue-prop element, or positional published fallback.
 */
function getPropText(row, prop, index = FIELD_INDEX[prop]) {
  return readTextField(row, prop, { fallbackCell: getCell(row, index) }).value;
}

/**
 * Get link from a data-aue-prop element — check for <a> first, then text.
 */
function getPropLink(row, prop, index = FIELD_INDEX[prop]) {
  return readLinkField(row, prop, { fallbackCell: getCell(row, index) }).value;
}

function hasInstrumentation(row) {
  return Boolean(row.querySelector('[data-aue-prop], [data-richtext-prop]'));
}

function getPublishedFieldMap(row, imageIndex) {
  if (hasInstrumentation(row)) return FIELD_INDEX;

  const sectionName = row.children[0]?.textContent.trim() || '';
  const imageAlt = row.children[imageIndex + 1]?.textContent.trim() || '';
  const leaderName = row.children[imageIndex + 2]?.textContent.trim() || '';

  if (imageIndex === 1 && sectionName && imageAlt && !leaderName) {
    return {
      ...FIELD_INDEX,
      imageAlt: null,
      leaderName: imageIndex + 1,
      leaderTitle: imageIndex + 2,
      bio: imageIndex + 3,
      link: imageIndex + 4,
      imageSize: imageIndex + 5,
    };
  }

  return FIELD_INDEX;
}

/**
 * Parse a leader card row.
 * Uses data-aue-prop attributes to find fields by name, avoiding any
 * column-position issues from extra image model columns.
 * Image is found by scanning for a <picture> element.
 */
function parseLeaderRow(row) {
  const cols = [...row.children];
  if (cols.length < 2) return null;

  // Find the image by scanning for a <picture> or <img> element
  let imageCol = null;
  let imageIndex = FIELD_INDEX.image;
  for (let i = 0; i < cols.length; i += 1) {
    if (cols[i].querySelector('picture') || cols[i].querySelector('img')) {
      imageCol = cols[i];
      imageIndex = i;
      break;
    }
  }

  const fieldMap = getPublishedFieldMap(row, imageIndex);
  const imageField = readImageField(row, 'image', { fallbackCell: imageCol });
  const { picture, img } = imageField;
  const imgSrc = img?.src || '';
  const imageAlt = getPropText(row, 'imageAlt', fieldMap.imageAlt) || img?.alt || '';
  const name = getPropText(row, 'leaderName', fieldMap.leaderName);
  const leaderTitle = getPropText(row, 'leaderTitle', fieldMap.leaderTitle);
  const bio = getPropText(row, 'bio', fieldMap.bio);
  const link = getPropLink(row, 'link', fieldMap.link);

  if (!imgSrc && !name && !leaderTitle && !bio && !link) return null;

  return {
    sectionName: getPropText(row, 'sectionName', fieldMap.sectionName),
    picture,
    imgSrc,
    imageAlt,
    imageSize: getPropText(row, 'imageSize', fieldMap.imageSize) || 'large',
    name,
    leaderTitle,
    bio,
    link,
    row,
  };
}

/**
 * Build a single leader card element.
 */
function buildLeaderCard(leader) {
  const card = document.createElement('div');
  card.className = 'leadership-team-card';

  // Add image size class
  if (leader.imageSize === 'small') {
    card.classList.add('leadership-team-card-small-image');
  }

  if (leader.row) moveInstrumentation(leader.row, card);
  setItemLabel(card, [leader.name, leader.leaderTitle]);

  // Image
  if (leader.picture || leader.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'leadership-team-card-image';
    const src = leader.imgSrc || leader.picture?.querySelector('img')?.src;
    if (src) {
      const optimized = createOptimizedPicture(
        src,
        leader.imageAlt,
        false,
        [{ width: '400' }],
      );
      if (leader.picture) {
        const origImg = leader.picture.querySelector('img');
        if (origImg) moveInstrumentation(origImg, optimized.querySelector('img'));
      }
      imageWrap.appendChild(optimized);
    } else if (leader.picture) {
      imageWrap.appendChild(leader.picture.cloneNode(true));
    }
    card.appendChild(imageWrap);
  }

  const textWrap = document.createElement('div');
  textWrap.className = 'leadership-team-card-text';

  if (leader.name) {
    const nameEl = document.createElement('h3');
    nameEl.className = 'leadership-team-card-name';
    nameEl.textContent = leader.name;
    textWrap.appendChild(nameEl);
  }

  if (leader.leaderTitle) {
    const titleEl = document.createElement('p');
    titleEl.className = 'leadership-team-card-title';
    titleEl.textContent = leader.leaderTitle;
    textWrap.appendChild(titleEl);
  }

  if (leader.bio) {
    const bioEl = document.createElement('p');
    bioEl.className = 'leadership-team-card-bio';
    bioEl.textContent = leader.bio;
    textWrap.appendChild(bioEl);
  }

  if (leader.link) {
    const linkEl = document.createElement('a');
    linkEl.className = 'leadership-team-card-link';
    linkEl.href = resolveSiteHref(leader.link);
    linkEl.textContent = decorateButtonText('Read bio');
    textWrap.appendChild(linkEl);
  }

  if (textWrap.childElementCount) card.appendChild(textWrap);

  return card;
}

/**
 * Create a slug-safe ID from a section name.
 */
function toSectionId(name) {
  return `leadership-section-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const leaders = [];

  rows.forEach((row) => {
    const leader = parseLeaderRow(row);
    if (leader) leaders.push(leader);
  });

  // Group leaders by section (preserving order of first appearance)
  const sectionOrder = [];
  const sectionMap = {};
  leaders.forEach((leader) => {
    const section = leader.sectionName || 'Team';
    if (!sectionMap[section]) {
      sectionMap[section] = [];
      sectionOrder.push(section);
    }
    sectionMap[section].push(leader);
  });

  const inner = document.createElement('div');
  inner.className = 'leadership-team-inner';

  // Navigation bar (only show if more than one section)
  if (sectionOrder.length > 1) {
    const nav = document.createElement('nav');
    nav.className = 'leadership-team-nav';
    nav.setAttribute('aria-label', 'Leadership sections');

    const navList = document.createElement('ul');
    navList.className = 'leadership-team-nav-list';

    sectionOrder.forEach((section, index) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'leadership-team-nav-btn';
      btn.textContent = section;
      btn.dataset.section = toSectionId(section);
      if (index === 0) btn.classList.add('active');

      btn.addEventListener('click', () => {
        // Update active state
        navList.querySelectorAll('.leadership-team-nav-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Scroll to section
        const target = document.getElementById(btn.dataset.section);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      li.appendChild(btn);
      navList.appendChild(li);
    });

    nav.appendChild(navList);
    inner.appendChild(nav);
  }

  // Sections with leader cards
  sectionOrder.forEach((section) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'leadership-team-section';
    sectionEl.id = toSectionId(section);

    // Section heading
    const heading = document.createElement('h2');
    heading.className = 'leadership-team-section-heading';
    heading.textContent = section;
    sectionEl.appendChild(heading);

    // Cards grid
    const grid = document.createElement('div');
    grid.className = 'leadership-team-grid';

    sectionMap[section].forEach((leader) => {
      const card = buildLeaderCard(leader);
      grid.appendChild(card);
    });

    sectionEl.appendChild(grid);
    inner.appendChild(sectionEl);
  });

  block.replaceChildren(inner);
}
