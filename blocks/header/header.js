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
  sections
    .querySelectorAll(
      '.nav-sections .default-content-wrapper > ul > li, .nav-sections > ul > li',
    )
    .forEach((section) => {
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
  const titleLink = links.find((link) => !link.closest('ul')) || links[0];
  const title = titleLink ? titleLink.textContent.trim() : '';
  const link = titleLink?.href || '';

  const paragraphs = [...element.querySelectorAll('p')]
    .filter((p) => !p.querySelector('a') && !p.querySelector('ul'));
  const description = paragraphs[0]?.textContent.trim() || '';

  let button = null;
  if (type === 'featured' && links.length > 1) {
    const buttonLink = links[links.length - 1];
    if (buttonLink && buttonLink !== titleLink) {
      button = {
        label: buttonLink.textContent.trim(),
        href: buttonLink.href,
      };
    }
  }

  return {
    label,
    title,
    link,
    description,
    sublinks,
    button,
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

  if (hasProps) {
    type = getTextValue(propEls.type);
    column = getTextValue(propEls.column);
    title = getTextValue(propEls.title);
    link = getLinkValue(propEls.link);
    description = getTextValue(propEls.description);
    sublinks = parseLinksField(propEls.sublinks);
    image = getImageValue(propEls.image);
    button = parseButtonField(propEls.button);
    label = getTextValue(propEls.label);

    if (propEls.content) {
      const parsed = parseContentField(propEls.content, type.toLowerCase());
      label = label || parsed.label;
      title = title || parsed.title;
      link = link || parsed.link;
      description = description || parsed.description;
      if (!sublinks.length) sublinks = parsed.sublinks;
      button = button || parsed.button;
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
      label: getTextValue(cols[2]) || inferLabelFromLink(getTextValue(cols[3]), getLinkValue(cols[3])),
      link: getLinkValue(cols[3]),
    };
  }

  return null;
}

function parseMegaNavTopLinkRow(row) {
  const getProp = (name) => row.querySelector(`[data-aue-prop="${name}"]`);
  const columnProp = getProp('column');
  const titleProp = getProp('title');
  const linkProp = getProp('link');
  const descriptionProp = getProp('description');

  if (columnProp || titleProp || linkProp || descriptionProp) {
    const linkText = linkProp ? getTextValue(linkProp) : '';
    const linkHref = linkProp ? getLinkValue(linkProp) : '';
    return {
      column: getTextValue(columnProp),
      title: getTextValue(titleProp) || inferLabelFromLink(linkText, linkHref),
      link: linkHref,
      description: getTextValue(descriptionProp),
    };
  }

  const cols = [...row.children];
  if (cols.length === 4) {
    const possibleLevel = getTextValue(cols[1]);
    if (/^\d+$/.test(possibleLevel.trim())) {
      return null;
    }
    return {
      column: getTextValue(cols[0]),
      title: getTextValue(cols[1]) || inferLabelFromLink(getTextValue(cols[2]), getLinkValue(cols[2])),
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
      footer.textContent = entry.title || entry.description || '';
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
      topList.classList.add(
        'flex',
        'flex-wrap',
        'items-center',
        'gap-2',
        'rounded-full',
        'bg-white',
        'px-2',
        'py-2',
        'shadow-[0_10px_30px_rgba(0,0,0,0.15)]',
      );
    }

    navWrapper.querySelectorAll(':scope > ul > li').forEach((navSection) => {
      let subNav = navSection.querySelector('ul');
      navSection.classList.add('group', '!static');
      if (subNav) {
        navSection.classList.add('nav-drop');
      }
      navSection.addEventListener('click', () => {
        if (!isDesktop.matches) {
          const expanded = navSection.getAttribute('aria-expanded') === 'true';
          toggleAllNavSections(navSections);
          navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        }
      });

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
          'inline-flex',
          'items-center',
          'gap-2',
          'rounded-full',
          'px-4',
          'py-2',
          'font-semibold',
          'text-[#252525]',
          'transition',
          'duration-200',
          'group-hover:!bg-[#143654]',
          'group-hover:!text-white',
          'group-aria-expanded:!bg-[#143654]',
          'group-aria-expanded:!text-white',
        );
      }

      if (!subNav) return;

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
          navSection.setAttribute('aria-expanded', 'false');
        }, 150);
      };

      navSection.addEventListener('mouseenter', () => {
        if (!isDesktop.matches) return;
        clearCloseTimer();
        navSection.setAttribute('aria-expanded', 'true');
      });
      navSection.addEventListener('mouseleave', () => {
        if (!isDesktop.matches) return;
        scheduleClose();
      });
      subNav.addEventListener('mouseenter', () => {
        if (!isDesktop.matches) return;
        clearCloseTimer();
        navSection.setAttribute('aria-expanded', 'true');
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
        3: 'col-span-3',
        4: 'col-span-4',
        5: 'col-span-5',
        6: 'col-span-6',
        7: 'col-span-7',
        12: 'col-span-12',
      };
      const featured = items.find((item) => item.dataset.mega === 'featured'
        || item.querySelector('picture, img')
        || /featured/i.test(item.textContent));
      const footer = items.find((item) => item.dataset.mega === 'footer');
      const normalItems = items.filter((item) => item !== featured && item !== footer);
      let normalSpan = 7;
      let featuredSpan = 5;

      if (featured) {
        if (normalItems.length <= 1) {
          normalSpan = 7;
          featuredSpan = 5;
        } else if (normalItems.length === 2) {
          normalSpan = 4;
          featuredSpan = 4;
        } else {
          normalSpan = 3;
          featuredSpan = 3;
        }
      } else if (normalItems.length === 2) {
        normalSpan = 6;
      } else if (normalItems.length === 3) {
        normalSpan = 4;
      } else {
        normalSpan = 12;
      }

      items.forEach((item) => {
        if (item === featured || item === footer) return;
        const colSpan = Number(item.dataset.col) || normalSpan;
        item.classList.add(colSpanClasses[colSpan] || colSpanClasses[normalSpan], 'space-y-4');
        const useDivider = featured
          ? true
          : item !== normalItems[normalItems.length - 1];
        if (item.dataset.divider === 'right' || useDivider) {
          item.classList.add('border-r', 'border-white/10', 'pr-6');
        }

        item.querySelectorAll(':scope > strong, :scope > em').forEach((label) => {
          label.classList.add('text-xs', 'uppercase', 'tracking-[0.18em]', 'text-white/60');
        });

        item.querySelectorAll(':scope > a').forEach((link) => {
          const next = link.nextElementSibling;
          const isSection = next && (next.tagName === 'P' || next.tagName === 'UL');
          if (isSection) {
            link.classList.add('text-base', 'font-semibold', 'leading-snug', 'text-white', 'hover:underline');
            if (!link.querySelector('.mega-arrow')) {
              const arrow = document.createElement('span');
              arrow.className = 'mega-arrow ml-2 text-white/80';
              arrow.setAttribute('aria-hidden', 'true');
              arrow.textContent = '>';
              link.append(arrow);
            }
          } else {
            link.classList.add('text-sm', 'font-medium', 'leading-snug', 'text-white/90', 'hover:text-white');
          }
        });

        item.querySelectorAll(':scope > p').forEach((description) => {
          description.classList.add('text-sm', 'leading-snug', 'text-white/70');
        });

        item.querySelectorAll('ul').forEach((links) => {
          links.classList.add('mt-2', 'space-y-1.5', 'border-l', 'border-white/10', 'pl-3');
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
          'text-sm',
          'font-semibold',
          'text-yellow-300',
        );
      }

      if (featured) {
        const featuredColSpan = Number(featured.dataset.col) || featuredSpan;
        featured.classList.add(
          colSpanClasses[featuredColSpan] || colSpanClasses[featuredSpan],
          'self-start',
          'space-y-3',
          'rounded-2xl',
          'bg-[#0f2e4b]',
          'p-4',
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
          featuredDescription.classList.add('mt-2', 'text-sm', 'text-white/80');
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

    const toolButtons = [...navTools.querySelectorAll('a.button')];
    toolButtons.forEach((btn, index) => {
      btn.classList.remove('nav-tool-primary', 'nav-tool-accent');
      if (index === 0) btn.classList.add('nav-tool-primary');
      if (index === 1) btn.classList.add('nav-tool-accent');
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
