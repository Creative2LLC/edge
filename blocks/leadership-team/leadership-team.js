import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Get text from a data-aue-prop element, or return ''.
 */
function getPropText(row, prop) {
  const el = row.querySelector(`[data-aue-prop="${prop}"]`);
  return el?.textContent.trim() || '';
}

/**
 * Get link from a data-aue-prop element — check for <a> first, then text.
 */
function getPropLink(row, prop) {
  const el = row.querySelector(`[data-aue-prop="${prop}"]`);
  if (!el) return '';
  const a = el.querySelector('a');
  return a?.href || el.textContent.trim();
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
  for (let i = 0; i < cols.length; i += 1) {
    if (cols[i].querySelector('picture') || cols[i].querySelector('img')) {
      imageCol = cols[i];
      break;
    }
  }

  const picture = imageCol?.querySelector('picture') || null;
  const img = imageCol?.querySelector('img');
  const imgSrc = img?.src || '';
  const imageAlt = img?.alt || '';

  return {
    sectionName: getPropText(row, 'sectionName'),
    picture,
    imgSrc,
    imageAlt,
    name: getPropText(row, 'name'),
    leaderTitle: getPropText(row, 'leaderTitle'),
    bio: getPropText(row, 'bio'),
    link: getPropLink(row, 'link'),
    row,
  };
}

/**
 * Build a single leader card element.
 */
function buildLeaderCard(leader) {
  const card = document.createElement('div');
  card.className = 'leadership-team-card';
  if (leader.row) moveInstrumentation(leader.row, card);

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

  // Name
  if (leader.name) {
    const nameEl = document.createElement('h3');
    nameEl.className = 'leadership-team-card-name';
    nameEl.textContent = leader.name;
    card.appendChild(nameEl);
  }

  // Title
  if (leader.leaderTitle) {
    const titleEl = document.createElement('p');
    titleEl.className = 'leadership-team-card-title';
    titleEl.textContent = leader.leaderTitle;
    card.appendChild(titleEl);
  }

  // Bio
  if (leader.bio) {
    const bioEl = document.createElement('p');
    bioEl.className = 'leadership-team-card-bio';
    bioEl.textContent = leader.bio;
    card.appendChild(bioEl);
  }

  // Read bio link
  if (leader.link) {
    const linkEl = document.createElement('a');
    linkEl.className = 'leadership-team-card-link';
    linkEl.href = leader.link;
    linkEl.textContent = 'Read bio →';
    card.appendChild(linkEl);
  }

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
