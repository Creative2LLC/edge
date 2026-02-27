import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Parse a leader card row.
 * Instead of hardcoded column indices, we find the image column dynamically
 * and collect the remaining non-empty text columns in order.
 * This is robust against extra columns injected by the image model
 * (e.g. imageAlt, imageLink, imageTarget).
 */
function parseLeaderRow(row) {
  const cols = [...row.children];
  if (cols.length < 2) return null;

  // First column is always sectionName
  const sectionName = cols[0]?.textContent.trim() || '';

  // Find the image column (contains a <picture> element)
  let imageCol = null;
  let imageIdx = -1;
  for (let i = 1; i < cols.length; i += 1) {
    if (cols[i].querySelector('picture') || cols[i].querySelector('img')) {
      imageCol = cols[i];
      imageIdx = i;
      break;
    }
  }

  const picture = imageCol?.querySelector('picture') || null;
  const img = imageCol?.querySelector('img');
  const imgSrc = img?.src || '';
  const imageAlt = img?.alt || '';

  // Collect remaining non-empty text-only columns after the image
  // These are: name, leaderTitle, bio, link (in order)
  const startIdx = imageIdx >= 0 ? imageIdx + 1 : 2;
  const textCols = cols.slice(startIdx).filter((col) => {
    if (col.querySelector('picture') || col.querySelector('img')) return false;
    return col.textContent.trim().length > 0;
  });

  // Map text columns to fields in order: name, title, bio, link
  const name = textCols[0]?.textContent.trim() || '';
  const leaderTitle = textCols[1]?.textContent.trim() || '';
  const bio = textCols[2]?.textContent.trim() || '';

  // Link: check for <a> tag first, then fall back to text
  const linkCol = textCols[3];
  const linkEl = linkCol?.querySelector('a');
  const link = linkEl?.href || linkCol?.textContent.trim() || '';

  return {
    sectionName,
    picture,
    imgSrc,
    imageAlt,
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
