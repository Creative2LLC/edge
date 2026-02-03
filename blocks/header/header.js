import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.nav-sections');
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections);
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections);
      nav.querySelector('button').focus();
    }
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (!nav.contains(e.relatedTarget)) {
    const navSections = nav.querySelector('.nav-sections');
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections, false);
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections, false);
    }
  }
}

function openOnKeydown(e) {
  const focused = document.activeElement;
  const isNavDrop = focused.className === 'nav-drop';
  if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
    const dropExpanded = focused.getAttribute('aria-expanded') === 'true';
    // eslint-disable-next-line no-use-before-define
    toggleAllNavSections(focused.closest('.nav-sections'));
    focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
  }
}

function focusNavSection() {
  document.activeElement.addEventListener('keydown', openOnKeydown);
}

/**
 * Toggles all nav sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleAllNavSections(sections, expanded = false) {
  sections.querySelectorAll('.nav-sections .default-content-wrapper > ul > li').forEach((section) => {
    section.setAttribute('aria-expanded', expanded);
  });
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  document.body.style.overflowY = (expanded || isDesktop.matches) ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
  button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  // enable nav dropdown keyboard accessibility
  const navDrops = navSections.querySelectorAll('.nav-drop');
  if (isDesktop.matches) {
    navDrops.forEach((drop) => {
      if (!drop.hasAttribute('tabindex')) {
        drop.setAttribute('tabindex', 0);
        drop.addEventListener('focus', focusNavSection);
      }
    });
  } else {
    navDrops.forEach((drop) => {
      drop.removeAttribute('tabindex');
      drop.removeEventListener('focus', focusNavSection);
    });
  }

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    // collapse menu on escape press
    window.addEventListener('keydown', closeOnEscape);
    // collapse menu on focus lost
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}

/**
 * Decorates the top banner section with links and language dropdown
 * @param {Element} section The top-banner nav section
 */
function decorateTopBanner(section) {
  const lists = section.querySelectorAll('ul');
  if (lists.length < 2) return;

  const linksList = lists[0];
  const languageList = lists[1];

  linksList.classList.add('top-banner-links');

  // Build language dropdown
  const languageItems = [...languageList.querySelectorAll('li')];
  const selectedText = languageItems.length > 0 ? languageItems[0].textContent.trim() : 'English';

  // Find the globe icon — look for an icon in a <p> tag (outside the lists)
  const globeIcon = section.querySelector('p span.icon');
  const globeIconClone = globeIcon ? globeIcon.cloneNode(true) : document.createElement('span');

  const languageWrapper = document.createElement('div');
  languageWrapper.className = 'top-banner-language';

  const toggle = document.createElement('button');
  toggle.className = 'top-banner-language-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'listbox');

  const langText = document.createElement('span');
  langText.textContent = selectedText;

  const chevron = document.createElement('span');
  chevron.className = 'icon icon-chevron-down';

  toggle.append(globeIconClone, langText, chevron);

  const panel = document.createElement('ul');
  panel.className = 'top-banner-language-panel';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-hidden', 'true');

  languageItems.forEach((item) => {
    const option = document.createElement('li');
    option.setAttribute('role', 'option');
    option.textContent = item.textContent.trim();
    option.addEventListener('click', () => {
      langText.textContent = option.textContent;
      toggle.setAttribute('aria-expanded', 'false');
      panel.setAttribute('aria-hidden', 'true');
    });
    panel.append(option);
  });

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    panel.setAttribute('aria-hidden', expanded ? 'true' : 'false');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!languageWrapper.contains(e.target)) {
      toggle.setAttribute('aria-expanded', 'false');
      panel.setAttribute('aria-hidden', 'true');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      toggle.setAttribute('aria-expanded', 'false');
      panel.setAttribute('aria-hidden', 'true');
      toggle.focus();
    }
  });

  languageWrapper.append(toggle, panel);

  // Build the content container
  const content = document.createElement('div');
  content.className = 'top-banner-content';
  content.append(linksList, languageWrapper);

  // Clear section and add content
  section.textContent = '';
  section.append(content);

  // Manually add chevron img (globe clone is already decorated, so avoid decorateIcons)
  const chevronImg = document.createElement('img');
  chevronImg.src = `${window.hlx.codeBasePath}/icons/chevron-down.svg`;
  chevronImg.alt = '';
  chevronImg.loading = 'lazy';
  chevron.append(chevronImg);
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  // load nav as fragment
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  // decorate nav DOM
  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  const classes = nav.children.length >= 4
    ? ['top-banner', 'brand', 'sections', 'tools']
    : ['brand', 'sections', 'tools'];
  classes.forEach((c, i) => {
    const section = nav.children[i];
    if (section) section.classList.add(`nav-${c}`);
  });

  const navBrand = nav.querySelector('.nav-brand');
  const brandLink = navBrand.querySelector('.button');
  if (brandLink) {
    brandLink.className = '';
    brandLink.closest('.button-container').className = '';
  }

  const navSections = nav.querySelector('.nav-sections');
  if (navSections) {
    navSections.querySelectorAll(':scope .default-content-wrapper > ul > li').forEach((navSection) => {
      if (navSection.querySelector('ul')) navSection.classList.add('nav-drop');
      navSection.addEventListener('click', () => {
        if (isDesktop.matches) {
          const expanded = navSection.getAttribute('aria-expanded') === 'true';
          toggleAllNavSections(navSections);
          navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        }
      });
    });
  }

  // hamburger for mobile
  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));
  nav.prepend(hamburger);
  nav.setAttribute('aria-expanded', 'false');
  // prevent mobile nav behavior on window resize
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  // Extract top banner out of nav if present, place above nav-wrapper
  const topBanner = nav.querySelector('.nav-top-banner');
  if (topBanner) {
    topBanner.remove();
    decorateTopBanner(topBanner);
    block.append(topBanner);
  }

  // Inject icons into nav-tools buttons that carry an icon name in their title attribute
  const navTools = nav.querySelector('.nav-tools');
  if (navTools) {
    navTools.querySelectorAll('a.button[title]').forEach((btn) => {
      const iconName = btn.getAttribute('title').trim();
      if (iconName) {
        const icon = document.createElement('span');
        icon.className = `icon icon-${iconName}`;
        const img = document.createElement('img');
        img.src = `${window.hlx.codeBasePath}/icons/${iconName}.svg`;
        img.alt = '';
        img.loading = 'lazy';
        icon.append(img);
        btn.prepend(icon);
        btn.removeAttribute('title');
      }
    });
  }

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  // Mark body when a hero block is present so the nav can overlay it
  if (document.querySelector('main .hero')) {
    document.body.classList.add('has-hero');
  }
}
