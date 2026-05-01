import { getMetadata } from '../../scripts/aem.js';
import {
  debounce,
  fetchSiteSearchSuggestions,
} from '../../scripts/search-utils.js';
import getSiteSearchConfig from '../../scripts/site-search-config.js';
import resolveSiteHref from '../../scripts/link-utils.js';
import { loadFragment } from '../fragment/fragment.js';

// desktop nav should apply at standard desktop breakpoints
const isDesktop = window.matchMedia('(min-width: 1260px)');
const MOBILE_SUBNAV_TRANSITION_MS = 260;
const POSTER_LISTING_PATH = '/missing-children-posters.html';
const CYBERTIPLINE_DATA_PATH = '/content/edge/data-and-impact/cybertipline-data.html';

function clearTransitionTimer(element, key) {
  if (element?.[key]) {
    window.clearTimeout(element[key]);
    element[key] = null;
  }
}

function afterNextPaint(callback) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

function showMobilePanel(panel) {
  if (!panel) return;
  clearTransitionTimer(panel, 'mobileHideTimer');
  panel.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('is-mobile-visible');
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      panel.classList.add('is-mobile-active');
    });
  });
}

function hideMobilePanel(panel) {
  if (!panel) return;
  clearTransitionTimer(panel, 'mobileHideTimer');
  panel.classList.remove('is-mobile-active');
  panel.setAttribute('aria-hidden', 'true');
  panel.mobileHideTimer = window.setTimeout(() => {
    if (panel.getAttribute('aria-hidden') === 'true') {
      panel.hidden = true;
      panel.classList.remove('is-mobile-visible');
    }
  }, MOBILE_SUBNAV_TRANSITION_MS);
}

function getDirectMobileNavLabel(item) {
  const labelNode = item.querySelector(
    ':scope > a, :scope > p > a, :scope > span, :scope > strong, :scope > em, :scope > .mega-subheader, :scope > p',
  );
  return labelNode?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function getDirectMobileNavLink(item) {
  return item.querySelector(':scope > a, :scope > p > a');
}

function createMobileStackNavigator() {
  const stack = document.createElement('div');
  stack.className = 'nav-mobile-stack';
  stack.setAttribute('aria-label', 'Mobile navigation');

  const viewport = document.createElement('div');
  viewport.className = 'nav-mobile-stack-viewport';
  stack.append(viewport);

  let activeScreen = null;
  let rootScreen = null;

  const syncVisibleScreens = () => {
    const allowed = new Set();
    if (activeScreen) allowed.add(activeScreen);
    if (activeScreen?.mobileParentScreen) allowed.add(activeScreen.mobileParentScreen);

    viewport.querySelectorAll('.nav-mobile-screen').forEach((screen) => {
      const isCurrent = screen === activeScreen;
      const isBehind = screen === activeScreen?.mobileParentScreen;
      screen.classList.toggle('is-current', isCurrent);
      screen.classList.toggle('is-behind', isBehind);
      if (!isCurrent && !isBehind) {
        screen.hidden = true;
        screen.classList.remove('is-ahead');
      } else {
        screen.hidden = false;
      }
    });
  };

  const createScreen = ({
    title = '',
    href = '',
    parentScreen = null,
    root = false,
  }) => {
    const screen = document.createElement('section');
    screen.className = 'nav-mobile-screen';
    screen.mobileParentScreen = parentScreen;
    screen.hidden = !root;

    if (root) {
      screen.classList.add('is-current', 'is-root');
      rootScreen = screen;
      activeScreen = screen;
    } else {
      screen.classList.add('is-ahead');

      const header = document.createElement('div');
      header.className = 'nav-mobile-screen-header';

      const backButton = document.createElement('button');
      backButton.type = 'button';
      backButton.className = 'nav-mobile-screen-back';
      backButton.setAttribute('aria-label', `Back from ${title}`);
      backButton.innerHTML = '<span aria-hidden="true">&larr;</span> Back';
      backButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        stack.goBack();
      });

      const heading = document.createElement('p');
      heading.className = 'nav-mobile-screen-title';
      heading.textContent = title;
      header.append(backButton, heading);
      screen.append(header);
    }

    const body = document.createElement('div');
    body.className = 'nav-mobile-screen-body';

    if (!root && href) {
      const overviewLink = document.createElement('a');
      overviewLink.className = 'nav-mobile-screen-overview';
      overviewLink.href = href;
      overviewLink.textContent = `View ${title}`;
      body.append(overviewLink);
    }

    const list = document.createElement('ul');
    list.className = root ? 'nav-mobile-screen-list nav-mobile-root-list' : 'nav-mobile-screen-list';
    body.append(list);
    screen.append(body);
    viewport.append(screen);

    return { screen, body, list };
  };

  const openScreen = (nextScreen) => {
    if (!nextScreen || nextScreen === activeScreen) return;
    const previousScreen = activeScreen;
    nextScreen.hidden = false;
    nextScreen.classList.add('is-ahead');

    afterNextPaint(() => {
      previousScreen?.classList.remove('is-current');
      previousScreen?.classList.add('is-behind');
      nextScreen.classList.remove('is-ahead');
      nextScreen.classList.add('is-current');
      activeScreen = nextScreen;
    });

    window.setTimeout(syncVisibleScreens, MOBILE_SUBNAV_TRANSITION_MS + 60);
  };

  const goBack = () => {
    const parentScreen = activeScreen?.mobileParentScreen;
    if (!parentScreen) return false;

    const currentScreen = activeScreen;
    parentScreen.hidden = false;
    parentScreen.classList.add('is-behind');

    afterNextPaint(() => {
      parentScreen.classList.remove('is-behind', 'is-ahead');
      parentScreen.classList.add('is-current');
      currentScreen.classList.remove('is-current', 'is-behind');
      currentScreen.classList.add('is-ahead');
      activeScreen = parentScreen;
    });

    window.setTimeout(syncVisibleScreens, MOBILE_SUBNAV_TRANSITION_MS + 60);
    return true;
  };

  const reset = () => {
    activeScreen = rootScreen;
    viewport.querySelectorAll('.nav-mobile-screen').forEach((screen) => {
      const isRoot = screen === rootScreen;
      screen.hidden = !isRoot;
      screen.classList.toggle('is-current', isRoot);
      screen.classList.toggle('is-root', isRoot);
      screen.classList.remove('is-behind', 'is-ahead');
      if (!isRoot) screen.classList.add('is-ahead');
    });
  };

  stack.createScreen = createScreen;
  stack.openScreen = openScreen;
  stack.goBack = goBack;
  stack.reset = reset;

  return stack;
}

function appendMobileScreenFallback(targetList, sourceItem) {
  const item = document.createElement('li');
  item.className = 'nav-mobile-rich-card';
  const content = sourceItem.cloneNode(true);
  const featuredLabel = content.querySelector(':scope > strong, :scope > em, :scope > .mega-subheader');
  const featuredHeading = content.querySelector(':scope > a:not(.button)');

  if (featuredLabel) {
    featuredLabel.classList.add('nav-mobile-rich-card-label');
  }

  if (featuredHeading) {
    featuredHeading.classList.add('nav-mobile-rich-card-heading');
  }

  item.append(content);
  targetList.append(item);
}

function extractMobileScreenEntries(sourceItem) {
  const entries = [];
  const directChildren = [...sourceItem.children];
  let currentEntry = null;
  let pendingLabel = '';

  const pushCurrentEntry = () => {
    if (!currentEntry) return;
    if (currentEntry.label || currentEntry.href || currentEntry.childList) {
      entries.push(currentEntry);
    }
    currentEntry = null;
  };

  directChildren.forEach((child) => {
    const tag = child.tagName;

    if (tag === 'A') {
      pushCurrentEntry();
      currentEntry = {
        label: child.textContent.replace(/\s+/g, ' ').trim(),
        href: child.href,
        description: '',
        childList: null,
      };
      pendingLabel = '';
      return;
    }

    if (['SPAN', 'STRONG', 'EM'].includes(tag)) {
      const text = child.textContent.replace(/\s+/g, ' ').trim();
      if (text) pendingLabel = text;
      return;
    }

    if (tag === 'P' && !child.querySelector('a, ul')) {
      const text = child.textContent.replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (!currentEntry && pendingLabel) {
        currentEntry = {
          label: pendingLabel,
          href: '',
          description: text,
          childList: null,
        };
        pendingLabel = '';
        return;
      }
      if (currentEntry && !currentEntry.description) {
        currentEntry.description = text;
      }
      return;
    }

    if (tag === 'UL') {
      if (!currentEntry) {
        currentEntry = {
          label: pendingLabel,
          href: '',
          description: '',
          childList: child,
        };
        pendingLabel = '';
      } else {
        currentEntry.childList = child;
      }
    }
  });

  pushCurrentEntry();

  if (entries.length) return entries;

  const childList = sourceItem.querySelector(':scope > ul');
  const primaryLink = getDirectMobileNavLink(sourceItem);
  const label = getDirectMobileNavLabel(sourceItem);
  if (!label && !primaryLink && !childList) return [];

  return [{
    label,
    href: primaryLink?.href || '',
    description: '',
    childList,
  }];
}

function buildMobileScreenFromList(navigator, sourceList, options) {
  const {
    title = '',
    href = '',
    parentScreen = null,
    root = false,
  } = options;
  const builtScreen = navigator.createScreen({
    title,
    href,
    parentScreen,
    root,
  });

  [...sourceList.children].forEach((sourceItem) => {
    if (!(sourceItem instanceof HTMLElement)) return;

    if (sourceItem.dataset.mega === 'featured' || sourceItem.dataset.mega === 'footer') {
      appendMobileScreenFallback(builtScreen.list, sourceItem);
      return;
    }

    const entries = extractMobileScreenEntries(sourceItem);
    if (!entries.length) return;

    entries.forEach((entry) => {
      if (!entry.label && !entry.href && !entry.childList) return;

      const item = document.createElement('li');
      item.className = 'nav-mobile-screen-item';

      if (entry.childList && entry.label) {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'nav-mobile-screen-link nav-mobile-screen-trigger';
        trigger.textContent = entry.label;
        item.append(trigger);
        builtScreen.list.append(item);

        const childScreen = buildMobileScreenFromList(navigator, entry.childList, {
          title: entry.label,
          href: entry.href || '',
          parentScreen: builtScreen.screen,
        });

        trigger.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (isDesktop.matches) return;
          navigator.openScreen(childScreen.screen);
        });
        return;
      }

      if (entry.href) {
        const link = document.createElement('a');
        link.className = 'nav-mobile-screen-link';
        link.href = entry.href;
        link.textContent = entry.label;
        item.append(link);
        builtScreen.list.append(item);
        return;
      }

      appendMobileScreenFallback(builtScreen.list, sourceItem);
    });
  });

  return builtScreen;
}

function buildMobileNavStack(navSectionsList) {
  if (!navSectionsList.length) return null;

  const navigator = createMobileStackNavigator();
  const rootScreen = navigator.createScreen({ root: true });
  const appendRootLink = (label, href = '') => {
    if (!label) return;
    const item = document.createElement('li');
    item.className = 'nav-mobile-screen-item';
    const link = document.createElement(href ? 'a' : 'button');
    link.className = 'nav-mobile-screen-link';
    link.textContent = label;
    if (href) {
      link.href = href;
    } else {
      link.type = 'button';
    }
    item.append(link);
    rootScreen.list.append(item);
  };

  navSectionsList.forEach((navSection) => {
    const topLink = navSection.querySelector(':scope > a, :scope > p > a');
    const subNav = navSection.querySelector(':scope > .nav-mega-panel, :scope > ul');
    const label = topLink?.textContent?.replace(/\s+/g, ' ').trim()
      || navSection.textContent.replace(/\s+/g, ' ').trim();

    try {
      if (!label) return;

      const item = document.createElement('li');
      item.className = 'nav-mobile-screen-item';

      if (subNav) {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'nav-mobile-screen-link nav-mobile-screen-trigger';
        trigger.textContent = label;
        item.append(trigger);
        rootScreen.list.append(item);

        const childScreen = buildMobileScreenFromList(navigator, subNav, {
          title: label,
          href: topLink?.href || '',
          parentScreen: rootScreen.screen,
        });

        trigger.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (isDesktop.matches) return;
          navigator.openScreen(childScreen.screen);
        });
        return;
      }

      if (topLink) {
        const link = document.createElement('a');
        link.className = 'nav-mobile-screen-link';
        link.href = topLink.href;
        link.textContent = label;
        item.append(link);
        rootScreen.list.append(item);
      }
    } catch (error) {
      appendRootLink(label, topLink?.href || '');
    }
  });

  if (!rootScreen.list.children.length) {
    navSectionsList.forEach((navSection) => {
      const topLink = navSection.querySelector(':scope > a, :scope > p > a');
      const label = topLink?.textContent?.replace(/\s+/g, ' ').trim()
        || navSection.textContent.replace(/\s+/g, ' ').trim();
      appendRootLink(label, topLink?.href || '');
    });
  }

  navigator.dataset.rootCount = String(rootScreen.list.children.length);
  navigator.reset();
  return navigator;
}

function buildHeaderSearch({ apiBaseUrl, resultsPath, placeholder }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-search is-collapsed';

  const form = document.createElement('form');
  form.className = 'nav-search-form';
  form.setAttribute('role', 'search');

  const input = document.createElement('input');
  input.className = 'nav-search-input';
  input.type = 'search';
  input.name = 'q';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;

  const panel = document.createElement('div');
  panel.className = 'nav-search-panel';
  panel.hidden = true;
  let externalTrigger = null;

  const syncExpandedState = (expanded) => {
    wrapper.classList.toggle('is-expanded', expanded);
    wrapper.classList.toggle('is-collapsed', !expanded);
    externalTrigger?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };

  const expandSearch = () => {
    syncExpandedState(true);
    window.requestAnimationFrame(() => input.focus());
  };

  const closePanel = (clear = false) => {
    if (clear) {
      panel.replaceChildren();
    }

    panel.hidden = true;
    wrapper.classList.remove('is-open');
  };

  const openPanel = () => {
    panel.hidden = false;
    wrapper.classList.add('is-open');
  };

  const buildResultsLink = (query) => {
    const url = new URL(resolveSiteHref(resultsPath), window.location.origin);
    if (query.trim()) url.searchParams.set('q', query.trim());
    return url.toString();
  };

  const syncExternalTrigger = () => {
    if (!externalTrigger) return;
    externalTrigger.href = buildResultsLink(input.value);
  };

  const renderSuggestions = async () => {
    const query = input.value.trim();

    if (query.length < 2) {
      closePanel(true);
      return;
    }

    if (!apiBaseUrl) {
      panel.replaceChildren();
      openPanel();

      const message = document.createElement('p');
      message.className = 'nav-search-status';
      message.textContent = 'Search is unavailable.';
      panel.append(message);
      return;
    }

    panel.replaceChildren();
    openPanel();

    const loading = document.createElement('p');
    loading.className = 'nav-search-status';
    loading.textContent = 'Searching...';
    panel.append(loading);

    try {
      const payload = await fetchSiteSearchSuggestions({
        apiBaseUrl,
        query,
        perPage: 6,
      });

      panel.replaceChildren();

      if (!(payload.data || []).length) {
        const empty = document.createElement('p');
        empty.className = 'nav-search-status';
        empty.textContent = 'No results found.';
        panel.append(empty);
      } else {
        const list = document.createElement('div');
        list.className = 'nav-search-results';

        (payload.data || []).forEach((result) => {
          const link = document.createElement('a');
          link.className = 'nav-search-result';
          link.href = resolveSiteHref(result.url);

          const type = document.createElement('span');
          type.className = 'nav-search-result-type';
          type.textContent = result.document_type_label || 'Result';

          const title = document.createElement('span');
          title.className = 'nav-search-result-title';
          if (`${result.title_html || ''}`.trim()) {
            title.innerHTML = result.title_html;
          } else {
            title.textContent = result.title || 'Search Result';
          }

          link.append(type, title);

          if (`${result.summary_html || ''}`.trim()) {
            const summary = document.createElement('span');
            summary.className = 'nav-search-result-summary';
            summary.innerHTML = result.summary_html;
            link.append(summary);
          }

          list.append(link);
        });

        panel.append(list);
      }

      const footer = document.createElement('a');
      footer.className = 'nav-search-all-results';
      footer.href = buildResultsLink(query);
      footer.textContent = `View all results for "${query}"`;
      panel.append(footer);
    } catch (error) {
      panel.replaceChildren();
      const message = document.createElement('p');
      message.className = 'nav-search-status';
      message.textContent = error?.message || 'Search is unavailable.';
      panel.append(message);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();

    if (!isDesktop.matches) {
      window.location.href = buildResultsLink(query);
      return;
    }

    if (!query) {
      expandSearch();
      return;
    }

    window.location.href = buildResultsLink(query);
  });

  input.addEventListener('input', () => {
    syncExpandedState(true);
    syncExternalTrigger();

    if (input.value.trim().length < 2) {
      closePanel(true);
    }
  });
  input.addEventListener('input', debounce(renderSuggestions, 220));
  input.addEventListener('focus', () => {
    syncExpandedState(true);
    if (panel.children.length && input.value.trim().length >= 2) openPanel();
  });

  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) {
      closePanel();
      if (!input.value.trim()) syncExpandedState(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel();
  });

  wrapper.bindExternalTrigger = (trigger) => {
    const triggerContainer = trigger.closest('.button-container');
    externalTrigger = trigger;
    trigger.classList.add('nav-search-trigger');
    trigger.setAttribute('aria-expanded', 'false');
    syncExternalTrigger();

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!isDesktop.matches) {
        window.location.href = buildResultsLink(query);
        return;
      }
      if (!wrapper.classList.contains('is-expanded') || !query) {
        expandSearch();
        return;
      }

      window.location.href = buildResultsLink(query);
    });

    form.append(trigger);
    triggerContainer?.remove();
  };

  form.append(input);
  wrapper.append(form, panel);
  return wrapper;
}

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
      const mobileStack = navSections.querySelector('.nav-mobile-stack');
      if (mobileStack?.goBack?.()) {
        return;
      }
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections);
      nav.querySelector('.nav-hamburger button')?.focus();
    }
  }
}

function closeOnFocusLost(e) {
  if (!e.relatedTarget) return;
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
  const isNavDrop = focused?.classList?.contains('nav-drop');
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
  const shouldExpand = expanded === true || expanded === 'true';
  sections
    .querySelectorAll(
      '.nav-sections .default-content-wrapper > ul > li, .nav-sections > ul > li',
    )
    .forEach((section) => {
      section.setAttribute('aria-expanded', shouldExpand ? 'true' : 'false');
      section.querySelector(':scope > a, :scope > p > a')?.setAttribute(
        'aria-expanded',
        shouldExpand ? 'true' : 'false',
      );
      const panel = section.querySelector(':scope > .nav-mega-panel, :scope > ul');
      if (panel) {
        if (isDesktop.matches) {
          panel.removeAttribute('hidden');
          panel.removeAttribute('aria-hidden');
        } else if (shouldExpand) {
          showMobilePanel(panel);
        } else {
          hideMobilePanel(panel);
        }
      }
    });
}

function syncMobileMorphOrigin(nav) {
  const button = nav?.querySelector('.nav-hamburger button');
  if (!nav || !button) return;

  const navRect = nav.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const x = (buttonRect.left - navRect.left) + (buttonRect.width / 2);
  const y = (buttonRect.top - navRect.top) + (buttonRect.height / 2);
  const radius = Math.ceil(Math.max(buttonRect.width, buttonRect.height) * 0.72);

  nav.style.setProperty('--nav-morph-x', `${x}px`);
  nav.style.setProperty('--nav-morph-y', `${y}px`);
  nav.style.setProperty('--nav-morph-radius', `${radius}px`);
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const nextExpanded = forceExpanded !== null
    ? forceExpanded === true || forceExpanded === 'true'
    : nav.getAttribute('aria-expanded') !== 'true';
  const button = nav.querySelector('.nav-hamburger button');
  syncMobileMorphOrigin(nav);
  document.body.style.overflowY = (!isDesktop.matches && nextExpanded) ? 'hidden' : '';
  document.body.classList.toggle('nav-mobile-open', !isDesktop.matches && nextExpanded);
  nav.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
  toggleAllNavSections(navSections, false);
  navSections.querySelector('.nav-mobile-stack')?.reset?.();
  button.setAttribute('aria-label', nextExpanded ? 'Close navigation' : 'Open navigation');
  button.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
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
  if (nextExpanded || isDesktop.matches) {
    window.addEventListener('keydown', closeOnEscape);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
  }

  // only use focusout close handling on desktop hover navigation
  if (nextExpanded && isDesktop.matches) {
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
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
  linksList.querySelectorAll('a').forEach((link) => {
    const label = link.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
    if (label === 'amber alerts' || label === 'missing posters') {
      link.href = resolveSiteHref(POSTER_LISTING_PATH);
    } else if (label === 'cybertipline') {
      link.href = resolveSiteHref(CYBERTIPLINE_DATA_PATH);
    }
  });

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

function decorateMobileTopBannerLinks(topBanner, navSections) {
  if (!topBanner || !navSections) return;
  const linksList = topBanner.querySelector('.top-banner-links');
  if (!linksList) return;
  const wrapper = navSections.querySelector('.default-content-wrapper') || navSections;
  if (!wrapper) return;

  let mobileMeta = wrapper.querySelector('.nav-mobile-meta');
  if (!mobileMeta) {
    mobileMeta = document.createElement('div');
    mobileMeta.className = 'nav-mobile-meta';
    wrapper.prepend(mobileMeta);
  }

  mobileMeta.textContent = '';
  const mobileLinks = linksList.cloneNode(true);
  mobileLinks.classList.remove('top-banner-links');
  mobileLinks.classList.add('nav-mobile-meta-links');
  mobileMeta.append(mobileLinks);

  const languageLabel = topBanner.querySelector('.top-banner-language-toggle span:not(.icon)');
  if (languageLabel?.textContent.trim()) {
    const languageChip = document.createElement('span');
    languageChip.className = 'nav-mobile-meta-language';
    languageChip.textContent = languageLabel.textContent.trim();
    mobileMeta.append(languageChip);
  }
}

function toSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeNavLabel(label) {
  return label
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function humanizePathLabel(value) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    const parts = url.pathname.split('/').filter(Boolean);
    let slug = parts[parts.length - 1] || '';
    slug = slug.replace(/\.(html|htm)$/i, '');
    slug = slug.replace(/[-_]+/g, ' ');
    return slug.replace(/\b\w/g, (char) => char.toUpperCase());
  } catch (e) {
    const trimmed = value.replace(/\?.*$/, '').replace(/#.*$/, '');
    const parts = trimmed.split('/').filter(Boolean);
    let slug = parts[parts.length - 1] || trimmed;
    slug = slug.replace(/\.(html|htm)$/i, '');
    slug = slug.replace(/[-_]+/g, ' ');
    return slug.replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function inferLabelFromLink(text, href) {
  const raw = (text || '').trim();
  if (raw && !raw.startsWith('/') && !raw.startsWith('http')) return raw;
  return humanizePathLabel(href || raw);
}

function findMegaNavTable(root) {
  const tables = [...root.querySelectorAll('table')];
  return tables.find((table) => {
    const headerRow = table.querySelector('tr');
    if (!headerRow) return false;
    const headers = [...headerRow.children]
      .map((cell) => cell.textContent.trim().toLowerCase());
    return headers.includes('menu') && headers.includes('column');
  });
}

function parseDelimitedLinks(value) {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
      if (parts.length === 1) return { label: parts[0], href: '' };
      return { label: parts[0], href: parts[1] };
    });
}

function getAnchorFromElement(element) {
  if (!element) return null;
  if (element.tagName === 'A') return element;
  return element.querySelector('a');
}

function getTextValue(element) {
  if (!element) return '';
  const anchor = getAnchorFromElement(element);
  if (anchor) return anchor.textContent.trim();
  return element.textContent.trim();
}

function getLinkValue(element) {
  if (!element) return '';
  const anchor = getAnchorFromElement(element);
  if (anchor && anchor.href) return anchor.href;
  return element.textContent.trim();
}

function getImageValue(element) {
  if (!element) return null;
  const image = element.querySelector('picture, img');
  return image ? image.cloneNode(true) : null;
}

function parseLinksField(element) {
  if (!element) return [];
  const links = [...element.querySelectorAll('a')];
  if (links.length) {
    return links.map((link) => ({
      label: link.textContent.trim(),
      href: link.href,
    }));
  }
  return parseDelimitedLinks(element.textContent || element.innerText || '');
}

function parseButtonField(element) {
  if (!element) return null;
  const anchor = getAnchorFromElement(element);
  if (anchor && (anchor.textContent || anchor.href)) {
    return {
      label: anchor.textContent.trim(),
      href: anchor.href,
    };
  }
  return parseDelimitedLinks(element.textContent || '')[0] || null;
}

function parseContentField(element, type) {
  if (!element) {
    return {
      label: '',
      title: '',
      link: '',
      description: '',
      sublinks: [],
      button: null,
      footerHtml: '',
    };
  }

  const labelEl = element.querySelector('strong, em, h1, h2, h3, h4, h5, h6');
  const label = labelEl ? labelEl.textContent.trim() : '';
  const list = element.querySelector('ul');
  const sublinks = list
    ? [...list.querySelectorAll('a')].map((link) => ({
      label: link.textContent.trim(),
      href: link.href,
    }))
    : [];

  const links = [...element.querySelectorAll('a')];
  let buttonLink = null;

  if (type === 'featured') {
    buttonLink = element.querySelector('a.button')
      || element.querySelector('.button-container a')
      || element.querySelector('[data-block-name="button"] a')
      || element.querySelector('.button.block a');

    if (!buttonLink) {
      buttonLink = links.find((link) => /^(button|cta)\s*:/i.test(link.textContent.trim())) || null;
    }
  }

  const linksForTitle = links.filter((link) => link !== buttonLink && !link.closest('ul'));
  const titleLink = linksForTitle[0] || links.find((link) => link !== buttonLink) || null;
  let title = titleLink ? titleLink.textContent.trim() : '';
  const link = titleLink?.href || '';

  const allParagraphs = [...element.querySelectorAll('p')];
  const paragraphTexts = allParagraphs
    .map((p) => p.textContent.trim())
    .filter(Boolean);
  const paragraphs = allParagraphs
    .filter((p) => !p.querySelector('a') && !p.querySelector('ul'));
  let description = paragraphs[0]?.textContent.trim() || '';

  if (type === 'featured') {
    if (!title && paragraphTexts.length) {
      const [firstParagraph] = paragraphTexts;
      title = firstParagraph;
    }
    if (paragraphTexts.length > 1 && (!description || description === paragraphTexts[0])) {
      const [, secondParagraph] = paragraphTexts;
      description = secondParagraph;
    }
    if (!description) {
      const paragraphWithLink = allParagraphs.find((p) => {
        const text = p.textContent.trim();
        if (!text) return false;
        const linkEl = p.querySelector('a');
        if (!linkEl) return false;
        const linkText = linkEl.textContent.trim();
        const cleaned = text.replace(linkText, '').trim();
        return cleaned.length > 0;
      });
      if (paragraphWithLink) {
        const linkText = paragraphWithLink.querySelector('a')?.textContent.trim() || '';
        description = paragraphWithLink.textContent.replace(linkText, '').trim();
      }
    }

    if (!title) {
      const firstText = allParagraphs[0]?.innerText?.trim() || '';
      const lines = firstText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      if (lines.length) {
        const [firstLine, ...restLines] = lines;
        title = firstLine;
        if (!description && restLines.length) {
          description = restLines.join(' ');
        }
      }
    }
  }

  let button = null;
  if (type === 'featured') {
    if (!buttonLink && links.length > 1) {
      buttonLink = links[links.length - 1];
    }
    if (buttonLink && buttonLink !== titleLink) {
      const cleaned = buttonLink.textContent.trim().replace(/^(button|cta)\s*:\s*/i, '');
      button = {
        label: cleaned || buttonLink.textContent.trim(),
        href: buttonLink.href,
      };
    }
  }

  const footerHtml = type === 'footer' ? element.innerHTML.trim() : '';

  return {
    label,
    title,
    link,
    description,
    sublinks,
    button,
    footerHtml,
  };
}

function parseMegaNavRow(row) {
  const getProp = (name) => row.querySelector(`[data-aue-prop="${name}"]`);
  const propEls = {
    type: getProp('type'),
    column: getProp('column'),
    content: getProp('content'),
    title: getProp('title'),
    link: getProp('link'),
    description: getProp('description'),
    sublinks: getProp('sublinks'),
    image: getProp('image'),
    button: getProp('button'),
    buttonText: getProp('buttonText'),
    buttonLink: getProp('buttonLink'),
    label: getProp('label'),
  };
  const hasProps = Object.values(propEls).some(Boolean);
  let type = '';
  let column = '';
  let title = '';
  let link = '';
  let description = '';
  let sublinks = [];
  let image = null;
  let button = null;
  let label = '';
  let footerHtml = '';

  if (hasProps) {
    type = getTextValue(propEls.type);
    column = getTextValue(propEls.column);
    title = getTextValue(propEls.title);
    link = getLinkValue(propEls.link);
    description = getTextValue(propEls.description);
    sublinks = parseLinksField(propEls.sublinks);
    image = getImageValue(propEls.image);
    button = parseButtonField(propEls.button);
    const buttonText = getTextValue(propEls.buttonText);
    const buttonLink = getLinkValue(propEls.buttonLink);
    if (buttonText || buttonLink) {
      const inferredLabel = inferLabelFromLink(
        buttonText || getTextValue(propEls.buttonLink),
        buttonLink,
      );
      button = {
        label: inferredLabel,
        href: buttonLink,
      };
    }
    label = getTextValue(propEls.label);

    if (propEls.content) {
      const parsed = parseContentField(propEls.content, type.toLowerCase());
      label = label || parsed.label;
      title = title || parsed.title;
      link = link || parsed.link;
      description = description || parsed.description;
      if (!sublinks.length) sublinks = parsed.sublinks;
      button = button || parsed.button;
      footerHtml = footerHtml || parsed.footerHtml;
    }

    if (!link && propEls.title) {
      const anchor = getAnchorFromElement(propEls.title);
      if (anchor) {
        title = anchor.textContent.trim();
        link = anchor.href;
      }
    }
  } else {
    const cols = [...row.children];
    if (cols.length < 2) return null;

    if (cols.length <= 4) {
      type = getTextValue(cols[0]);
      column = getTextValue(cols[1]);
      image = getImageValue(cols[3]);

      if (cols[2]) {
        const parsed = parseContentField(cols[2], type.toLowerCase());
        label = parsed.label;
        title = parsed.title;
        link = parsed.link;
        description = parsed.description;
        sublinks = parsed.sublinks;
        button = parsed.button;
        footerHtml = parsed.footerHtml;
      }
    } else if (cols.length === 6) {
      type = getTextValue(cols[0]);
      column = getTextValue(cols[1]);
      image = getImageValue(cols[5]);

      if (cols[2]) {
        const parsed = parseContentField(cols[2], type.toLowerCase());
        label = parsed.label;
        title = parsed.title;
        link = parsed.link;
        description = parsed.description;
        sublinks = parsed.sublinks;
        button = parsed.button;
        footerHtml = parsed.footerHtml;
      }

      const buttonText = getTextValue(cols[3]);
      const buttonLink = getLinkValue(cols[4]);
      if (buttonText || buttonLink) {
        button = {
          label: inferLabelFromLink(buttonText, buttonLink),
          href: buttonLink,
        };
      }
    } else {
      type = getTextValue(cols[0]);
      column = getTextValue(cols[1]);
      title = getTextValue(cols[2]);
      link = getLinkValue(cols[3]);
      description = getTextValue(cols[4]);
      sublinks = parseLinksField(cols[5]);
      image = getImageValue(cols[6]);
      button = parseButtonField(cols[7]);
      label = getTextValue(cols[8]);
    }

    if (!link && cols[2]) {
      const anchor = getAnchorFromElement(cols[2]);
      if (anchor) {
        title = anchor.textContent.trim();
        link = anchor.href;
      }
    }
  }

  if (!type && !column && !title && !description
    && !sublinks.length && !image && !button && !label) {
    return null;
  }

  return {
    type,
    column,
    title,
    link,
    description,
    sublinks,
    image,
    button,
    label,
    footerHtml,
  };
}

function parseMegaNavSubLinkRow(row) {
  const getProp = (name) => row.querySelector(`[data-aue-prop="${name}"]`);
  const columnProp = getProp('column');
  const levelProp = getProp('level');
  const labelProp = getProp('label');
  const linkProp = getProp('link');

  const isNumericLevel = (value) => {
    if (!value) return false;
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return false;
    const level = Number.parseInt(trimmed, 10);
    return level >= 1 && level <= 6;
  };

  if (columnProp || levelProp || labelProp || linkProp) {
    const linkText = linkProp ? getTextValue(linkProp) : '';
    const linkHref = linkProp ? getLinkValue(linkProp) : '';
    return {
      column: getTextValue(columnProp),
      level: Number.parseInt(getTextValue(levelProp), 10) || 1,
      label: getTextValue(labelProp) || inferLabelFromLink(linkText, linkHref),
      link: linkHref,
    };
  }

  const cols = [...row.children];
  if (cols.length === 4) {
    const levelText = getTextValue(cols[1]);
    if (!isNumericLevel(levelText)) return null;
    return {
      column: getTextValue(cols[0]),
      level: Number.parseInt(levelText, 10) || 1,
      label: getTextValue(cols[2])
        || inferLabelFromLink(getTextValue(cols[3]), getLinkValue(cols[3])),
      link: getLinkValue(cols[3]),
    };
  }

  return null;
}

function parseMegaNavTopLinkRow(row) {
  const getProp = (name) => row.querySelector(`[data-aue-prop="${name}"]`);
  const columnProp = getProp('column');
  const eyebrowProp = getProp('eyebrow');
  const titleProp = getProp('title');
  const linkProp = getProp('link');
  const descriptionProp = getProp('description');

  if (columnProp || eyebrowProp || titleProp || linkProp || descriptionProp) {
    const linkText = linkProp ? getTextValue(linkProp) : '';
    const linkHref = linkProp ? getLinkValue(linkProp) : '';
    return {
      column: getTextValue(columnProp),
      label: getTextValue(eyebrowProp),
      title: getTextValue(titleProp) || inferLabelFromLink(linkText, linkHref),
      link: linkHref,
      description: getTextValue(descriptionProp),
    };
  }

  const cols = [...row.children];
  if (cols.length === 5) {
    const firstCell = getTextValue(cols[0]).toLowerCase();
    if (['column', 'featured', 'footer'].includes(firstCell)) return null;
    const possibleLevel = getTextValue(cols[1]);
    if (/^\d+$/.test(possibleLevel.trim())) {
      return null;
    }
    return {
      column: getTextValue(cols[0]),
      label: getTextValue(cols[1]),
      title: getTextValue(cols[2])
        || inferLabelFromLink(getTextValue(cols[3]), getLinkValue(cols[3])),
      link: getLinkValue(cols[3]),
      description: getTextValue(cols[4]),
    };
  }

  if (cols.length === 4) {
    const firstCell = getTextValue(cols[0]).toLowerCase();
    if (['column', 'featured', 'footer'].includes(firstCell)) return null;
    const possibleLevel = getTextValue(cols[1]);
    if (/^\d+$/.test(possibleLevel.trim())) {
      return null;
    }
    return {
      column: getTextValue(cols[0]),
      title: getTextValue(cols[1])
        || inferLabelFromLink(getTextValue(cols[2]), getLinkValue(cols[2])),
      link: getLinkValue(cols[2]),
      description: getTextValue(cols[3]),
    };
  }

  return null;
}
function getBlockTextField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return '';
  const value = getTextValue(source);
  source.remove();
  return value;
}

function getBlockLinkField(block, name) {
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (!source) return '';
  const value = getLinkValue(source);
  source.remove();
  return value;
}

function buildMegaNavList(menus) {
  const buildNestedList = (nodes) => {
    if (!nodes?.length) return null;
    const list = document.createElement('ul');
    nodes.forEach((node) => {
      const li = document.createElement('li');
      if (node.href) {
        const link = document.createElement('a');
        link.textContent = node.label;
        link.href = node.href;
        li.append(link);
      } else {
        const span = document.createElement('span');
        span.className = 'mega-subheader';
        span.textContent = node.label;
        li.append(span);
      }
      if (node.children?.length) {
        const childList = buildNestedList(node.children);
        if (childList) li.append(childList);
      }
      list.append(li);
    });
    return list;
  };

  const navList = document.createElement('ul');
  menus.forEach((data) => {
    const topLi = document.createElement('li');
    const topLink = document.createElement('a');
    topLink.textContent = data.menu;
    topLink.href = data.menuLink || `/${toSlug(data.menu)}`;
    topLi.append(topLink);

    const subNav = document.createElement('ul');
    data.columnOrder.forEach((columnKey) => {
      const colLi = document.createElement('li');
      data.columns.get(columnKey).forEach((entry) => {
        if (entry.label && !entry.title && !entry.description && !entry.sublinks.length) {
          const label = document.createElement('strong');
          label.textContent = entry.label;
          colLi.append(label);
          return;
        }
        if (entry.label && (entry.title || entry.description || entry.sublinks.length)) {
          const label = document.createElement('span');
          label.className = 'mega-subheader';
          label.textContent = entry.label;
          colLi.append(label);
        }
        if (entry.title) {
          const linkEl = document.createElement('a');
          linkEl.textContent = entry.title;
          if (entry.link) linkEl.href = entry.link;
          colLi.append(linkEl);
        }
        if (entry.description) {
          const desc = document.createElement('p');
          desc.textContent = entry.description;
          colLi.append(desc);
        }
        const linkTree = [...(entry.nestedLinks || [])];
        if (entry.sublinks.length) {
          entry.sublinks.forEach((sub) => {
            linkTree.push({ label: sub.label, href: sub.href, children: [] });
          });
        }
        if (linkTree.length) {
          const subList = buildNestedList(linkTree);
          if (subList) colLi.append(subList);
        }
      });
      subNav.append(colLi);
    });

    data.featured.forEach((entry) => {
      const featuredLi = document.createElement('li');
      featuredLi.dataset.mega = 'featured';

      const featuredLabel = document.createElement('strong');
      featuredLabel.textContent = entry.label || 'Featured';
      featuredLi.append(featuredLabel);

      if (entry.image) {
        featuredLi.append(entry.image);
      }

      if (entry.title) {
        const titleLink = document.createElement('a');
        titleLink.textContent = entry.title;
        if (entry.link) titleLink.href = entry.link;
        featuredLi.append(titleLink);
      }

      if (entry.description) {
        const desc = document.createElement('p');
        desc.textContent = entry.description;
        featuredLi.append(desc);
      }

      if (entry.button?.label) {
        const button = document.createElement('a');
        button.classList.add('button');
        button.textContent = entry.button.label;
        if (entry.button.href) button.href = entry.button.href;
        featuredLi.append(button);
      }

      subNav.append(featuredLi);
    });

    data.footer.forEach((entry) => {
      const footerLi = document.createElement('li');
      footerLi.dataset.mega = 'footer';
      const footer = document.createElement('div');
      footer.className = 'mega-footer';
      if (entry.footerHtml) {
        footer.innerHTML = entry.footerHtml;
        footer.querySelectorAll('a').forEach((link) => {
          link.classList.add(
            'underline',
            'decoration-[#FCB813]/60',
            'underline-offset-4',
          );
        });
      } else {
        footer.textContent = entry.title || entry.description || '';
      }
      footerLi.append(footer);
      subNav.append(footerLi);
    });

    topLi.append(subNav);
    navList.append(topLi);
  });

  return navList;
}

function buildMegaNavFromTable(table) {
  const rows = [...table.querySelectorAll('tr')];
  if (rows.length < 2) return null;

  const headerCells = [...rows.shift().children]
    .map((cell) => cell.textContent.trim().toLowerCase());
  const colIndex = (name) => headerCells.findIndex((header) => header === name);
  const col = {
    menu: colIndex('menu'),
    menuLink: colIndex('menu link'),
    column: colIndex('column'),
    title: colIndex('title'),
    link: colIndex('link'),
    description: colIndex('description'),
    sublinks: colIndex('sublinks'),
    image: colIndex('image'),
    button: colIndex('button'),
    label: colIndex('label'),
  };

  const menus = new Map();

  rows.forEach((row) => {
    const cells = [...row.children];
    const menu = cells[col.menu]?.textContent.trim();
    if (!menu) return;

    const menuLink = cells[col.menuLink]?.textContent.trim() || '';
    const column = (cells[col.column]?.textContent.trim() || '1').toLowerCase();
    const title = cells[col.title]?.textContent.trim() || '';
    const link = cells[col.link]?.textContent.trim() || '';
    const description = cells[col.description]?.textContent.trim() || '';
    const sublinks = parseDelimitedLinks(cells[col.sublinks]?.innerText || '');
    const label = cells[col.label]?.textContent.trim() || '';
    const button = parseDelimitedLinks(cells[col.button]?.innerText || '')[0] || null;
    const imageCell = cells[col.image];
    const image = imageCell?.querySelector('picture, img')?.cloneNode(true) || null;

    if (!menus.has(menu)) {
      menus.set(menu, {
        menu,
        menuLink,
        columns: new Map(),
        columnOrder: [],
        featured: [],
        footer: [],
      });
    }

    const data = menus.get(menu);
    if (menuLink) data.menuLink = menuLink;

    const entry = {
      title,
      link,
      description,
      sublinks,
      image,
      button,
      label,
    };

    if (column === 'featured') {
      data.featured.push(entry);
      return;
    }

    if (column === 'footer') {
      data.footer.push(entry);
      return;
    }

    if (!data.columns.has(column)) {
      data.columns.set(column, []);
      data.columnOrder.push(column);
    }
    data.columns.get(column).push(entry);
  });

  return buildMegaNavList(menus);
}

function buildMegaNavFromBlocks(blocks) {
  if (!blocks.length) return null;
  const menus = new Map();

  blocks.forEach((blockEl) => {
    let menuLabel = getBlockTextField(blockEl, 'menu_label')
      || getBlockTextField(blockEl, 'menu')
      || blockEl.dataset.menu
      || '';
    let menuLink = getBlockLinkField(blockEl, 'menu_link')
      || getBlockLinkField(blockEl, 'menu link');

    const rows = [...blockEl.querySelectorAll(':scope > div')];
    if (!menuLabel && rows.length) {
      const firstRow = rows[0];
      const cells = [...firstRow.children];
      if (cells.length <= 2) {
        const primaryCell = cells[0];
        const paragraphs = primaryCell?.querySelectorAll('p') || [];
        menuLabel = paragraphs[0]?.textContent.trim()
          || primaryCell?.textContent.trim()
          || '';
        const firstLink = primaryCell?.querySelector('a')
          || cells[1]?.querySelector('a');
        menuLink = menuLink
          || firstLink?.href
          || cells[1]?.textContent.trim()
          || '';
        rows.shift();
        firstRow.remove();
      }
    }

    if (!menuLabel) return;

    if (!menus.has(menuLabel)) {
      menus.set(menuLabel, {
        menu: menuLabel,
        menuLink,
        columns: new Map(),
        columnOrder: [],
        featured: [],
        footer: [],
      });
    }

    const data = menus.get(menuLabel);
    if (menuLink) data.menuLink = menuLink;

    const levelContexts = new Map();
    let currentColumnKey = '1';

    const getLevelContext = (columnKey) => {
      if (!levelContexts.has(columnKey)) {
        levelContexts.set(columnKey, { currentEntry: null, stack: [] });
      }
      return levelContexts.get(columnKey);
    };

    const addLevelNode = (entry, context, level, node) => {
      const safeLevel = Math.max(2, Math.min(level, 6));
      if (safeLevel === 2) {
        entry.nestedLinks = entry.nestedLinks || [];
        entry.nestedLinks.push(node);
        context.stack = [node];
        return;
      }

      const parent = context.stack[safeLevel - 3];
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      } else {
        entry.nestedLinks = entry.nestedLinks || [];
        entry.nestedLinks.push(node);
      }

      context.stack = context.stack.slice(0, safeLevel - 2);
      context.stack[safeLevel - 2] = node;
    };

    rows.forEach((row) => {
      const columnRow = parseMegaNavTopLinkRow(row);
      if (columnRow && columnRow.title) {
        const columnKey = (columnRow.column || currentColumnKey || '1').toLowerCase();
        if (!data.columns.has(columnKey)) {
          data.columns.set(columnKey, []);
          data.columnOrder.push(columnKey);
        }

        let entry = data.columns.get(columnKey)
          .find((item) => normalizeNavLabel(item.title) === normalizeNavLabel(columnRow.title));
        if (!entry) {
          entry = {
            title: columnRow.title,
            link: '',
            description: '',
            sublinks: [],
            image: null,
            button: null,
            label: '',
            nestedLinks: [],
          };
          data.columns.get(columnKey).push(entry);
        }

        if (columnRow.link) entry.link = columnRow.link;
        if (columnRow.description) entry.description = columnRow.description;
        if (columnRow.label) entry.label = columnRow.label;

        const context = getLevelContext(columnKey);
        context.currentEntry = entry;
        context.stack = [];
        currentColumnKey = columnKey;
        return;
      }

      const levelRow = parseMegaNavSubLinkRow(row);
      if (levelRow && levelRow.label) {
        const columnKey = (levelRow.column || currentColumnKey || '1').toLowerCase();
        if (levelRow.column) currentColumnKey = columnKey;
        if (!data.columns.has(columnKey)) {
          data.columns.set(columnKey, []);
          data.columnOrder.push(columnKey);
        }

        const context = getLevelContext(columnKey);
        let level = Math.max(1, levelRow.level || 1);
        const href = levelRow.link;

        if (context.currentEntry && level === 1) {
          level = 2;
        }

        if (level === 1 || !context.currentEntry) {
          let entry = data.columns.get(columnKey)
            .find((item) => normalizeNavLabel(item.title) === normalizeNavLabel(levelRow.label));
          if (!entry) {
            entry = {
              title: levelRow.label,
              link: '',
              description: '',
              sublinks: [],
              image: null,
              button: null,
              label: '',
              nestedLinks: [],
            };
            data.columns.get(columnKey).push(entry);
          }
          if (href) entry.link = entry.link || href;
          context.currentEntry = entry;
          context.stack = [];
          return;
        }

        const node = {
          label: levelRow.label,
          href: href || '',
          children: [],
        };
        addLevelNode(context.currentEntry, context, level, node);
        return;
      }

      const entry = parseMegaNavRow(row);
      if (!entry) return;
      const type = (entry.type || '').toLowerCase();
      const column = (entry.column || '1').toLowerCase();

      if (type === 'featured' || column === 'featured') {
        data.featured.push(entry);
        return;
      }

      if (type === 'footer' || column === 'footer') {
        data.footer.push(entry);
        return;
      }

      const columnKey = column || '1';
      if (!data.columns.has(columnKey)) {
        data.columns.set(columnKey, []);
        data.columnOrder.push(columnKey);
      }
      data.columns.get(columnKey).push(entry);
    });
  });

  if (!menus.size) return null;
  return buildMegaNavList(menus);
}

function buildDummyMegaMenu(label) {
  const key = normalizeNavLabel(label);
  const images = {
    gethelp: 'https://placehold.co/560x360?text=Get+Help',
    resources: 'https://placehold.co/560x360?text=Resources',
    dataandimpact: 'https://placehold.co/560x360?text=Data+%26+Impact',
    about: 'https://placehold.co/560x360?text=About',
    support: 'https://placehold.co/560x360?text=Support',
    fallback: 'https://placehold.co/560x360?text=Featured',
  };
  const img = images[key] || images.fallback;

  switch (key) {
    case 'gethelp':
      return `
        <li data-col="7" class="space-y-4">
          <a href="/get-help/missing-child">Get Help to Find A Missing Child</a>
          <p>Help finding a missing child.</p>
          <ul>
            <li><a href="/get-help/clearinghouses">Missing Child Clearinghouses</a></li>
          </ul>
          <a href="/report-exploitation">Report Child Exploitation</a>
          <p>Report exploitation & remove content.</p>
          <ul>
            <li><a href="/cybertipline">CyberTipline</a></li>
            <li><a href="/take-it-down">Take It Down</a></li>
          </ul>
          <a href="/survivor-support">Survivor, Victim & Family Support</a>
          <p>Counseling, peer support, legal help.</p>
          <ul>
            <li><a href="/team-hope">Team HOPE</a></li>
            <li><a href="/mental-health">Mental Health Support</a></li>
            <li><a href="/legal-resources">Legal Resources</a></li>
          </ul>
          <div class="mega-footer mt-2 border-t border-white/10 pt-4 text-sm font-semibold text-yellow-300">
            If your child is missing, call 911 immediately, then 1-800-THE-LOST
          </div>
        </li>
        <li data-mega="featured" data-col="5">
          <strong>Featured</strong>
          <picture>
            <img src="${img}" alt="Team HOPE Peer Support" />
          </picture>
          <a href="/team-hope-peer-support">Team HOPE Peer Support</a>
          <p>Connect with families who understand what you're going through.</p>
          <a href="/get-support" class="button">Get Support</a>
        </li>
      `;
    case 'resources':
      return `
        <li data-col="4" data-divider="right" class="space-y-4">
          <strong>NCMEC Resources</strong>
          <ul>
            <li><a href="/training">Training & Education Programs</a></li>
            <li><a href="/families">For Families</a></li>
            <li><a href="/professionals">For Professionals</a></li>
            <li><a href="/law-enforcement">Law Enforcement</a></li>
            <li><a href="/educators">Educators</a></li>
            <li><a href="/child-welfare">Child Welfare Providers</a></li>
            <li><a href="/legal">Legal Professionals</a></li>
            <li><a href="/mental-health">Mental Health Professionals</a></li>
            <li><a href="/policymakers">Policymakers</a></li>
            <li><a href="/media">Media</a></li>
            <li><a href="/esp">Electronic Service Providers</a></li>
            <li><a href="/tribal">Native, Indigenous & Tribal Nations</a></li>
          </ul>
        </li>
        <li data-col="4" data-divider="right" class="space-y-4">
          <strong>Safety Issues</strong>
          <a href="/missing-children">Missing Children</a>
          <ul>
            <li><a href="/autism-wandering">Autism & Wandering</a></li>
            <li><a href="/missing-from-care">Children Missing from Care</a></li>
            <li><a href="/help-id-me">Help ID Me: Unidentified Child Remains</a></li>
            <li><a href="/infant-abductions">Infant Abductions</a></li>
            <li><a href="/long-term-missing">Long-Term Missing Children</a></li>
            <li><a href="/runaway-abducted">Runaway & Abducted Children</a></li>
          </ul>
          <a href="/exploited-children">Exploited Children</a>
          <ul>
            <li><a href="/csam">Child Sexual Abuse Material (CSAM)</a></li>
            <li><a href="/trafficking">Child Sex Trafficking</a></li>
            <li><a href="/encryption">End-to-End Encryption</a></li>
            <li><a href="/generative-ai">Generative AI</a></li>
            <li><a href="/online-enticement">Online Enticement</a></li>
            <li><a href="/sextortion">Sextortion</a></li>
          </ul>
        </li>
        <li data-mega="featured" data-col="4">
          <strong>Featured Resource</strong>
          <picture>
            <img src="${img}" alt="NCMEC Connect" />
          </picture>
          <a href="/ncmec-connect">NCMEC Connect</a>
          <p>Free on-demand training for law enforcement, educators, and child-serving professionals.</p>
          <a href="/create-account" class="button">Create Free Account</a>
        </li>
      `;
    case 'dataandimpact':
      return `
        <li data-col="7" class="space-y-4">
          <a href="/impact-report">Our Impact Report</a>
          <ul>
            <li><a href="/missing-children-data">Missing Children Data</a></li>
            <li><a href="/child-exploitation-data">Child Exploitation Data</a></li>
          </ul>
          <a href="/cybertipline-data">CyberTipline Data</a>
          <a href="/analysis">NCMEC Analysis</a>
          <a href="/policy-advocacy">Policy & Advocacy</a>
        </li>
        <li data-mega="featured" data-col="5">
          <strong>Featured</strong>
          <picture>
            <img src="${img}" alt="2024 CyberTipline Report" />
          </picture>
          <a href="/cybertipline-report-2024">2024 CyberTipline Report</a>
          <p>36.2M reports processed with 99.99% accuracy. See the latest data on online child exploitation.</p>
          <a href="/view-report" class="button">View Report</a>
        </li>
      `;
    case 'about':
      return `
        <li data-col="4" data-divider="right" class="space-y-4">
          <a href="/mission-history">Mission & History</a>
          <a href="/annual-report">Annual Report & Financials</a>
          <a href="/leadership">Leadership</a>
          <a href="/partnerships">Partnerships</a>
          <a href="/careers">Join our Team</a>
          <a href="/news">NCMEC News</a>
        </li>
        <li data-col="4" class="space-y-4">
          <strong>Regional Offices</strong>
          <a href="/offices/florida">Florida Office</a>
          <a href="/offices/new-york">New York Office</a>
          <a href="/offices/texas">Texas Office</a>
        </li>
        <li data-mega="featured" data-col="4">
          <strong>Featured</strong>
          <picture>
            <img src="${img}" alt="Join Our Team" />
          </picture>
          <a href="/careers">Join Our Team</a>
          <p>We're hiring mission-driven professionals ready to protect children.</p>
          <a href="/open-positions" class="button">View Open Positions</a>
        </li>
      `;
    case 'support':
      return `
        <li data-col="7" class="space-y-4">
          <a href="/ways-to-give">Ways to Give</a>
          <a href="/monthly-giving">Be A Hero: Monthly Giving</a>
          <a href="/planned-giving">Planned Giving</a>
          <a href="/corporate">Corporate Partnership</a>
          <a href="/foundations">Foundations</a>
          <a href="/fundraising">Fundraising Events</a>
          <a href="/store">NCMEC Store</a>
        </li>
        <li data-mega="featured" data-col="5">
          <strong>Featured</strong>
          <picture>
            <img src="${img}" alt="Your Gift at Work" />
          </picture>
          <a href="/your-gift-at-work">Your Gift at Work</a>
          <p>In 2023, NCMEC helped resolve 27,542 missing children cases and processed 36.2M CyberTipline reports.</p>
          <a href="/donate" class="button">Donate Now</a>
        </li>
      `;
    default:
      return '';
  }
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const buildNavFromPath = async (path) => {
    const fragment = await loadFragment(path);
    if (!fragment) return null;

    const navEl = document.createElement('nav');
    navEl.id = 'nav';
    while (fragment.firstElementChild) navEl.append(fragment.firstElementChild);

    const classes = navEl.children.length >= 4
      ? ['top-banner', 'brand', 'sections', 'tools']
      : ['brand', 'sections', 'tools'];
    classes.forEach((c, i) => {
      const section = navEl.children[i];
      if (section) section.classList.add(`nav-${c}`);
    });

    const hasBrand = !!navEl.querySelector('.nav-brand');
    const hasSections = !!navEl.querySelector('.nav-sections');
    return hasBrand && hasSections ? navEl : null;
  };

  // load nav as fragment
  const navMeta = getMetadata('nav');
  const configuredNavPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  let nav = await buildNavFromPath(configuredNavPath);
  if (!nav && configuredNavPath !== '/nav') {
    // eslint-disable-next-line no-console
    console.warn(`Invalid nav fragment at "${configuredNavPath}". Falling back to "/nav".`);
    nav = await buildNavFromPath('/nav');
  }
  if (!nav) {
    // eslint-disable-next-line no-console
    console.error('Unable to load a valid nav fragment for header.');
    return;
  }

  // decorate nav DOM
  block.textContent = '';

  const navBrand = nav.querySelector('.nav-brand');
  const brandButton = navBrand.querySelector('.button');
  if (brandButton) {
    brandButton.className = '';
    brandButton.closest('.button-container').className = '';
  }

  let brandLink = navBrand.querySelector('a');
  if (!brandLink) {
    const brandImage = navBrand.querySelector('picture, img');
    if (brandImage) {
      const imageWrapper = brandImage.closest('picture') || brandImage;
      brandLink = document.createElement('a');
      imageWrapper.replaceWith(brandLink);
      brandLink.append(imageWrapper);
    }
  }

  if (brandLink) {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const contentRoot = (pathParts[0] === 'content' && pathParts[1])
      ? `/${pathParts[0]}/${pathParts[1]}`
      : '';
    brandLink.href = `${contentRoot}/index.html`;
    brandLink.target = '_parent';
    brandLink.removeAttribute('rel');
  }

  const navSections = nav.querySelector('.nav-sections');
  if (navSections) {
    const megaBlocks = [...nav.querySelectorAll(
      '.mega-nav, .mega-nav-parent-link, [data-block-name="mega-nav-parent-link"]',
    )];
    let megaNav = null;

    if (megaBlocks.length) {
      megaNav = buildMegaNavFromBlocks(megaBlocks);
      if (megaNav) {
        const wrapper = navSections.querySelector('.default-content-wrapper') || navSections;
        wrapper.textContent = '';
        wrapper.append(megaNav);
        megaBlocks.forEach((megaBlock) => megaBlock.remove());
      }
    }

    if (!megaNav) {
      const megaTable = findMegaNavTable(nav);
      if (megaTable) {
        megaNav = buildMegaNavFromTable(megaTable);
        if (megaNav) {
          const wrapper = navSections.querySelector('.default-content-wrapper') || navSections;
          wrapper.textContent = '';
          wrapper.append(megaNav);
        }
        megaTable.remove();
      }
    }

    const useDummyNav = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    navSections.classList.add('relative', 'isolate');
    const navWrapper = navSections.querySelector('.default-content-wrapper') || navSections;
    const topList = navWrapper.querySelector(':scope > ul');
    if (topList) {
      topList.classList.add('nav-top-list');
    }

    const navSectionsList = [...navWrapper.querySelectorAll(':scope > ul > li')];
    const existingMobileStack = navWrapper.querySelector(':scope > .nav-mobile-stack');
    existingMobileStack?.remove();
    const mobileStack = buildMobileNavStack(navSectionsList);
    if (mobileStack) {
      navWrapper.append(mobileStack);
    }

    const closeSectionNow = (section) => {
      section.setAttribute('aria-expanded', 'false');
      section.querySelector(':scope > a, :scope > p > a')?.setAttribute('aria-expanded', 'false');
    };
    const closeOtherDesktopSections = (activeSection) => {
      navSectionsList.forEach((section) => {
        if (section === activeSection || !section.classList.contains('nav-drop')) return;
        closeSectionNow(section);
      });
    };
    const getEqualSpans = (count) => {
      if (count <= 0) return [];
      const base = Math.floor(12 / count);
      const remainder = 12 % count;
      return Array.from({ length: count }, (_, index) => (
        Math.max(1, Math.min(12, base + (index < remainder ? 1 : 0)))
      ));
    };

    navSectionsList.forEach((navSection) => {
      let subNav = navSection.querySelector('ul');
      navSection.classList.add('group', '!static');
      if (subNav) {
        navSection.classList.add('nav-drop');
      }

      let topLink = navSection.querySelector(':scope > a, :scope > p > a');
      const navLabel = topLink?.textContent.trim()
        || navSection.textContent.trim();
      if (!topLink) {
        const textNodes = [...navSection.childNodes].filter(
          (node) => node.nodeType === Node.TEXT_NODE,
        );
        if (navLabel) {
          textNodes.forEach((node) => node.remove());
          topLink = document.createElement('a');
          const slug = navLabel
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          topLink.href = `/${slug}`;
          topLink.textContent = navLabel;
          navSection.prepend(topLink);
        }
      }

      if (!subNav && useDummyNav) {
        const dummy = buildDummyMegaMenu(navLabel);
        if (dummy) {
          subNav = document.createElement('ul');
          subNav.innerHTML = dummy;
          navSection.append(subNav);
          navSection.classList.add('nav-drop');
        }
      }

      if (topLink) {
        topLink.classList.add(
          'nav-top-link',
          'inline-flex',
          'items-center',
          'gap-2',
          'font-semibold',
          'transition',
          'duration-200',
        );
      }

      if (!subNav) return;

      subNav.setAttribute('hidden', '');
      subNav.setAttribute('aria-hidden', 'true');
      if (topLink) {
        const panelId = `nav-shelf-${navLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'section'}`;
        subNav.id = subNav.id || panelId;
        topLink.setAttribute('aria-controls', subNav.id);
        topLink.setAttribute('aria-expanded', 'false');
      }

      if (topLink) {
        topLink.addEventListener('click', (event) => {
          if (isDesktop.matches) return;
          event.preventDefault();
          event.stopPropagation();
        });
      }

      subNav.classList.add(
        'nav-mega-panel',
        'hidden',
        'group-hover:grid',
        'group-focus-within:grid',
        'group-aria-expanded:grid',
        'absolute',
        'left-1/2',
        '-translate-x-1/2',
        'top-full',
        'mt-3',
        'w-[calc(100vw-2rem)]',
        'max-w-[900px]',
        'rounded-[28px]',
        'bg-[#143654]',
        'px-8',
        'py-7',
        'text-white',
        'whitespace-normal',
        'shadow-[0_20px_60px_rgba(0,0,0,0.25)]',
        'ring-1',
        'ring-white/10',
        'grid',
        'grid-cols-12',
        'gap-8',
        'z-50',
        'after:content-[""]',
        'after:absolute',
        'after:-top-3',
        'after:left-0',
        'after:right-0',
        'after:h-3',
        'after:bg-transparent',
      );

      let closeTimer;
      const clearCloseTimer = () => {
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
      };
      const scheduleClose = () => {
        clearCloseTimer();
        closeTimer = setTimeout(() => {
          if (navSection.matches(':hover') || subNav.matches(':hover')) return;
          closeSectionNow(navSection);
        }, 300);
      };
      const openDesktopSection = () => {
        clearCloseTimer();
        closeOtherDesktopSections(navSection);
        navSection.setAttribute('aria-expanded', 'true');
        topLink?.setAttribute('aria-expanded', 'true');
      };

      navSection.addEventListener('mouseenter', () => {
        if (!isDesktop.matches) return;
        openDesktopSection();
      });
      navSection.addEventListener('mouseleave', () => {
        if (!isDesktop.matches) return;
        scheduleClose();
      });
      subNav.addEventListener('mouseenter', () => {
        if (!isDesktop.matches) return;
        openDesktopSection();
      });
      subNav.addEventListener('mouseleave', () => {
        if (!isDesktop.matches) return;
        scheduleClose();
      });

      const footerCandidate = subNav.querySelector(
        '.mega-footer, [data-mega="footer"]',
      );
      if (footerCandidate) {
        const footerItem = document.createElement('li');
        footerItem.dataset.mega = 'footer';
        footerItem.dataset.col = '12';

        if (footerCandidate.closest('li')) {
          footerCandidate.parentElement.removeChild(footerCandidate);
        }

        footerItem.append(footerCandidate);
        subNav.append(footerItem);
      }

      const items = [...subNav.children];
      const colSpanClasses = {
        1: 'col-span-1',
        2: 'col-span-2',
        3: 'col-span-3',
        4: 'col-span-4',
        5: 'col-span-5',
        6: 'col-span-6',
        7: 'col-span-7',
        8: 'col-span-8',
        9: 'col-span-9',
        10: 'col-span-10',
        11: 'col-span-11',
        12: 'col-span-12',
      };
      const featured = items.find((item) => item.dataset.mega === 'featured'
        || item.querySelector('picture, img')
        || /featured/i.test(item.textContent));
      const footer = items.find((item) => item.dataset.mega === 'footer');
      const normalItems = items.filter((item) => item !== featured && item !== footer);
      const layoutItems = [...normalItems];
      if (featured) layoutItems.push(featured);
      const equalSpans = getEqualSpans(layoutItems.length);
      const spanByItem = new Map(layoutItems.map((item, index) => [item, equalSpans[index] || 12]));

      items.forEach((item) => {
        if (item === featured || item === footer) return;
        const itemSpan = spanByItem.get(item) || 12;
        item.classList.add(colSpanClasses[itemSpan] || colSpanClasses[12], 'space-y-4');
        const useDivider = featured
          ? true
          : item !== normalItems[normalItems.length - 1];
        if (item.dataset.divider === 'right' || useDivider) {
          item.classList.add('border-none', 'border-white/10');
        }

        item.querySelectorAll(':scope > strong, :scope > em').forEach((label) => {
          label.classList.add('text-xs', 'uppercase', 'tracking-[0.18em]', 'text-white/60');
        });

        item.querySelectorAll(':scope > a').forEach((link) => {
          const next = link.nextElementSibling;
          link.classList.add('block');
          const hasDetails = next && (next.tagName === 'P' || next.tagName === 'UL');
          link.classList.add('text-base', 'font-semibold', 'leading-snug', 'text-white', 'hover:underline');
          if (!link.querySelector('.mega-arrow')) {
            const arrow = document.createElement('span');
            arrow.className = 'mega-arrow ml-2 text-white/80';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '>';
            link.append(arrow);
          }
          if (!hasDetails) link.classList.add('text-white/90');
        });

        item.querySelectorAll(':scope > p').forEach((description) => {
          description.classList.add('text-sm', 'leading-snug', 'text-white/70', '!mt-0');
        });

        item.querySelectorAll('ul').forEach((links) => {
          links.classList.add('!mt-[10px]', '!mb-[30px]', 'space-y-1.5', 'border-white/10', 'pl-3');
          const parentList = links.parentElement?.closest('ul');
          if (parentList && parentList !== links) {
            links.classList.add('pl-4');
          }
          links.querySelectorAll('a').forEach((link) => {
            link.classList.add(
              'text-sm',
              'leading-snug',
              'text-white/80',
              'underline',
              'decoration-white/40',
              'underline-offset-4',
              'hover:text-white',
              'hover:decoration-white',
            );
          });
        });

        item.querySelectorAll('.mega-subheader').forEach((label) => {
          label.classList.add(
            'block',
            'mb-2',
            'text-xs',
            'uppercase',
            'tracking-[0.18em]',
            'text-white/60',
          );
        });

        item.querySelectorAll('li').forEach((li) => {
          const childList = li.querySelector(':scope > ul');
          if (!childList) return;
          const labelEl = li.querySelector(':scope > a, :scope > span');
          if (!labelEl || labelEl.querySelector('.mega-arrow')) return;
          const arrow = document.createElement('span');
          arrow.className = 'mega-arrow ml-2 text-white/80';
          arrow.setAttribute('aria-hidden', 'true');
          arrow.textContent = '>';
          labelEl.append(arrow);
        });
      });

      if (footer) {
        footer.classList.add(
          colSpanClasses[12],
          'mt-2',
          'border-t',
          'border-white/10',
          'pt-4',
          'text-[#FCB813]',
          'text-[20px]',
          'font-["Inter"]',
          'font-bold',
          'leading-[1.48]',
        );
      }

      if (featured) {
        const featuredColSpan = spanByItem.get(featured) || 12;
        featured.classList.add(
          colSpanClasses[featuredColSpan] || colSpanClasses[12],
          'self-start',
          'space-y-3',
          'rounded-2xl',
          'px-0',
          'py-0',
          'mt-[-7px]',
        );
        const featuredLabel = featured.querySelector(':scope > strong, :scope > em');
        if (featuredLabel) {
          featuredLabel.classList.add('text-xs', 'uppercase', 'tracking-[0.18em]', 'text-white/60');
        }

        const featuredLinks = [...featured.querySelectorAll(':scope > a')];
        const featuredHeading = featuredLinks.find((link) => !link.classList.contains('button')) || featuredLinks[0];
        if (featuredHeading) {
          featuredHeading.classList.add('mt-3', 'block', 'text-base', 'font-semibold', 'text-white');
        }

        const featuredDescription = featured.querySelector(':scope > p');
        if (featuredDescription) {
          featuredDescription.classList.add('mt-2', 'text-sm', 'text-white/80', '!whitespace-normal');
        }

        const picture = featured.querySelector('picture');
        if (picture) {
          picture.classList.add('block', 'overflow-hidden', 'rounded-xl');
          const img = picture.querySelector('img');
          if (img) img.classList.add('h-auto', 'w-full', 'object-cover');
        }

        const featuredButton = featured.querySelector('a.button')
          || featuredLinks[featuredLinks.length - 1];
        if (featuredButton) {
          featuredButton.classList.add('button');
          featuredButton.classList.add(
            'mt-4',
            'inline-flex',
            'items-center',
            'gap-2',
            'rounded-full',
            'bg-[#0ea5c6]',
            'px-4',
            'py-2',
            'text-sm',
            'font-semibold',
            'text-white',
          );
        }
      }
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
  syncMobileMorphOrigin(nav);
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => {
    syncMobileMorphOrigin(nav);
    toggleMenu(nav, navSections, isDesktop.matches);
  });

  // Extract top banner out of nav if present, place above nav-wrapper
  const topBanner = nav.querySelector('.nav-top-banner');
  if (topBanner) {
    topBanner.remove();
    decorateTopBanner(topBanner);
    decorateMobileTopBannerLinks(topBanner, navSections);
    block.append(topBanner);
  }

  // Inject icons into nav-tools buttons that carry an icon name in their title attribute
  const navTools = nav.querySelector('.nav-tools');
  if (navTools) {
    const headerSearch = buildHeaderSearch(getSiteSearchConfig());
    navTools.prepend(headerSearch);

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

    const toolButtons = [...navTools.querySelectorAll('a.button')];
    toolButtons.forEach((btn, index) => {
      btn.classList.remove('nav-tool-primary', 'nav-tool-accent', 'nav-tool-mobile-hidden');
      if (index === 0) btn.classList.add('nav-tool-primary');
      if (index === 1) btn.classList.add('nav-tool-accent');
      if (index >= 2) btn.classList.add('nav-tool-mobile-hidden');
    });

    const searchTrigger = toolButtons.find((btn) => btn.textContent.trim().toLowerCase() === 'search');
    if (searchTrigger) {
      headerSearch.bindExternalTrigger(searchTrigger);
    }
  }

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  // Mark body when a hero block is present so the nav can overlay it
  const hasHero = !!document.querySelector('main .hero');
  if (hasHero) {
    document.body.classList.add('has-hero');
  }

  const stickyScrollThreshold = 12;
  const updateStickyState = () => {
    const sticky = isDesktop.matches && window.scrollY > stickyScrollThreshold;
    navWrapper.classList.toggle('is-sticky', sticky);
  };

  updateStickyState();
  window.addEventListener('resize', () => syncMobileMorphOrigin(nav));
  window.addEventListener('scroll', updateStickyState, { passive: true });
  window.addEventListener('resize', updateStickyState);
  isDesktop.addEventListener('change', updateStickyState);
}
