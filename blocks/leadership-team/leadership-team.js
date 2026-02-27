import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Parse a leader card row from either instrumented (Universal Editor)
 * or legacy (column-based) content.
 */
function parseLeaderRow(row) {
  // Try instrumented fields first
  const instrSection = row.querySelector('[data-aue-prop="sectionName"]');
  const instrImage = row.querySelector('[data-aue-prop="image"]');
  const instrImageAlt = row.querySelector('[data-aue-prop="imageAlt"]');
  const instrName = row.querySelector('[data-aue-prop="name"]');
  const instrTitle = row.querySelector('[data-aue-prop="leaderTitle"]');
  const instrBio = row.querySelector('[data-aue-prop="bio"]');
  const instrLink = row.querySelector('[data-aue-prop="link"]');

  if (instrSection || instrName) {
    const img = (instrImage || row).querySelector('img');
    return {
      sectionName: instrSection?.textContent.trim() || '',
      picture: (instrImage || row).querySelector('picture'),
      imgSrc: img?.src || '',
      imageAlt: instrImageAlt?.textContent.trim() || img?.alt || '',
      name: instrName?.textContent.trim() || '',
      leaderTitle: instrTitle?.textContent.trim() || '',
      bio: instrBio?.textContent.trim() || '',
      link: instrLink?.textContent.trim() || instrLink?.querySelector('a')?.href || '',
      row,
    };
  }

  // Fallback: column-based layout
  // Columns: sectionName | image | name | title | bio | link
  const cols = [...row.children];
  if (cols.length >= 4) {
    const img = cols[1]?.querySelector('img');
    const linkEl = cols[5]?.querySelector('a');
    return {
      sectionName: cols[0]?.textContent.trim() || '',
      picture: cols[1]?.querySelector('picture'),
      imgSrc: img?.src || '',
      imageAlt: img?.alt || '',
      name: cols[2]?.textContent.trim() || '',
      leaderTitle: cols[3]?.textContent.trim() || '',
      bio: cols[4]?.textContent.trim() || '',
      link: linkEl?.href || cols[5]?.textContent.trim() || '',
      row,
    };
  }

  return null;
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
    if (leader.picture) {
      const img = leader.picture.querySelector('img');
      if (img) {
        const optimized = createOptimizedPicture(
          img.src,
          leader.imageAlt || img.alt,
          false,
          [{ width: '400' }],
        );
        moveInstrumentation(img, optimized.querySelector('img'));
        imageWrap.appendChild(optimized);
      } else {
        imageWrap.appendChild(leader.picture);
      }
    } else {
      const optimized = createOptimizedPicture(
        leader.imgSrc,
        leader.imageAlt,
        false,
        [{ width: '400' }],
      );
      imageWrap.appendChild(optimized);
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
