/* Blog Hero: the resource hero's layout for a blog. A pale wash, the title and
   intro in a ~70% column, the byline and the blog's tags under the title, and
   the page Hero's navy side panel to the right.

   On a blog page every blank field falls back to the blog itself (title from the
   page, author, date and tags from the backend), and Blog Details below it drops
   its own hero, so the page never shows two. On any other page it shows what was
   authored. */
import { getMetadata } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readImageField,
  readLinkField,
  readRichTextField,
  readTextField,
} from '../../scripts/block-field-utils.js';
import { applyButtonStyle, markButtonSurface } from '../../scripts/button-utils.js';
import resolveSiteHref, { isTopLevelPage } from '../../scripts/link-utils.js';
import { buildListFilterHref } from '../../scripts/list-filter-state.js';
import {
  articleTagEntries,
  fetchArticle,
  getBlogListingPath,
  looksLikeBlogPath,
} from '../../scripts/blog-article-api.js';

const MAX_TAGS = 6;
const AUTHOR_CONTENT_ROOT = '/content/edge';

/* Published rows, in model order. panelImageAlt has no row of its own: xwalk
   folds an `<image>Alt` field into its image's <img alt>. Add new fields at the
   END of the model, or every later row moves on published pages. */
const ROW = {
  heroTitle: 0,
  heroIntro: 1,
  author: 2,
  heroDate: 3,
  heroTags: 4,
  showTags: 5,
  showBreadcrumbs: 6,
  breadcrumbs: 7,
  backgroundImage: 8,
  panelTitle: 9,
  panelText: 10,
  panelPrimaryText: 11,
  panelPrimaryLink: 12,
  panelSecondaryText: 13,
  panelSecondaryLink: 14,
  panelFooterText: 15,
  panelImage: 16,
};

const CHOICE_RE = /^(show|hide)$/i;

function normalizeText(value) {
  return `${value || ''}`.replace(/\s+/g, ' ').trim();
}

function hasAuthoringContext(block) {
  return Boolean(
    block.getAttribute('data-aue-resource')
      || block.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

/**
 * Where row 0 is. The two show/hide selects always publish a value and sit side
 * by side, so they place every other row even if a revision of the model ever
 * adds or loses a row ahead of them.
 */
function findRowBase(rows) {
  const at = rows.findIndex((row, index) => (
    CHOICE_RE.test(normalizeText(row.textContent))
      && CHOICE_RE.test(normalizeText(rows[index + 1]?.textContent))
  ));
  return at >= ROW.showTags ? at - ROW.showTags : 0;
}

function readFields(block) {
  const inEditor = hasAuthoringContext(block);
  const rows = [...block.children];
  const base = findRowBase(rows);
  // A field the editor has bound (data-aue-prop) is read by name. The rest are
  // read by row: published pages carry no names, and in the editor an empty
  // field and a select are plain cells in the same published shape.
  const at = (name) => ({ fallbackCell: rows[base + ROW[name]]?.firstElementChild || null });

  const text = (name) => readTextField(block, name, at(name));
  const rich = (name) => readRichTextField(block, name, at(name));
  const link = (name) => readLinkField(block, name, at(name));

  return {
    inEditor,
    title: text('heroTitle'),
    intro: rich('heroIntro'),
    author: text('author'),
    date: text('heroDate'),
    tags: text('heroTags'),
    showTags: normalizeText(text('showTags').value).toLowerCase() !== 'hide',
    showBreadcrumbs: normalizeText(text('showBreadcrumbs').value).toLowerCase() === 'show',
    breadcrumbs: text('breadcrumbs'),
    backgroundImage: readImageField(block, 'backgroundImage', at('backgroundImage')),
    panel: {
      title: text('panelTitle'),
      text: rich('panelText'),
      primaryText: text('panelPrimaryText'),
      primaryLink: link('panelPrimaryLink'),
      secondaryText: text('panelSecondaryText'),
      secondaryLink: link('panelSecondaryLink'),
      footer: rich('panelFooterText'),
      image: readImageField(block, 'panelImage', at('panelImage')),
    },
  };
}

function formatDate(value) {
  const text = normalizeText(value);
  if (!text) return '';

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Copies an authored field into a new element, keeping its editor binding. */
function fieldElement(tagName, className, field, { html = false, fallback = '' } = {}) {
  const value = html ? field.html : normalizeText(field.value);
  if (!value && !fallback) return null;
  const element = document.createElement(tagName);
  element.className = className;
  if (html && value) element.innerHTML = value;
  else element.textContent = value || fallback;
  if (field.source) moveInstrumentation(field.source, element);
  return element;
}

/* ---- Breadcrumbs ------------------------------------------------------- */

function isAuthorContentPath() {
  const { pathname } = window.location;
  return pathname === AUTHOR_CONTENT_ROOT || pathname.startsWith(`${AUTHOR_CONTENT_ROOT}/`);
}

function formatPathSegment(segment) {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // keep the raw segment
  }
  return decoded
    .replace(/\.html$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** The trail from the page path. A blog's year folder has no page, so it is skipped. */
function buildPathCrumbs(currentLabel) {
  const segments = window.location.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  const site = isAuthorContentPath() ? segments.slice(2) : segments;
  return site
    .map((segment, index) => {
      const isLast = index === site.length - 1;
      if (!isLast && /^\d{4}$/.test(segment)) return null;
      const sitePath = `/${site.slice(0, index + 1).join('/')}`;
      return {
        label: isLast && currentLabel ? currentLabel : formatPathSegment(segment),
        href: isAuthorContentPath() ? `${AUTHOR_CONTENT_ROOT}${sitePath}.html` : sitePath,
      };
    })
    .filter(Boolean);
}

function parseTrail(value) {
  return normalizeText(value)
    .split(/[>|]/)
    .map((item) => {
      const [label, href] = item.split('::').map((part) => part.trim());
      return label ? { label, href: href || '' } : null;
    })
    .filter(Boolean);
}

function buildBreadcrumbs(fields, currentLabel) {
  if (!fields.showBreadcrumbs || isTopLevelPage()) return null;

  const authored = parseTrail(fields.breadcrumbs.value);
  const crumbs = authored.length ? authored : buildPathCrumbs(currentLabel);
  if (!crumbs.length) return null;

  const nav = document.createElement('nav');
  nav.className = 'blog-hero-breadcrumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');
  const list = document.createElement('ol');

  crumbs.forEach((crumb, index) => {
    const isCurrent = index === crumbs.length - 1;
    const item = document.createElement('li');
    if (!isCurrent && crumb.href) {
      const anchor = document.createElement('a');
      anchor.href = resolveSiteHref(crumb.href);
      anchor.textContent = crumb.label;
      item.append(anchor);
    } else {
      const label = document.createElement('span');
      label.textContent = crumb.label;
      if (isCurrent) label.setAttribute('aria-current', 'page');
      item.append(label);
    }
    list.append(item);

    if (!isCurrent) {
      const separator = document.createElement('li');
      separator.className = 'separator';
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '>';
      list.append(separator);
    }
  });

  nav.append(list);
  return nav;
}

/* ---- Byline and tags --------------------------------------------------- */

function buildMeta(author, date) {
  const values = [author, date].map(normalizeText).filter(Boolean);
  if (!values.length) return null;

  const meta = document.createElement('div');
  meta.className = 'blog-hero-meta';
  values.forEach((value, index) => {
    if (index) {
      const separator = document.createElement('span');
      separator.className = 'blog-hero-meta-separator';
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '|';
      meta.append(separator);
    }
    const item = document.createElement('span');
    item.className = 'blog-hero-meta-item';
    item.textContent = value;
    meta.append(item);
  });
  return meta;
}

/** Authored tags are labels only; the blog's own tags link to the filtered listing. */
function buildTags(entries) {
  if (!entries.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'blog-hero-tags';
  const listingPath = getBlogListingPath();

  entries.forEach(({ label, facet, value }) => {
    if (!facet || !value) {
      const tag = document.createElement('span');
      tag.className = 'blog-hero-tag';
      tag.textContent = label;
      wrap.append(tag);
      return;
    }
    const tag = document.createElement('a');
    tag.className = 'blog-hero-tag is-linked';
    tag.href = resolveSiteHref(buildListFilterHref(listingPath, { [facet]: [value] }));
    tag.textContent = label;
    tag.setAttribute('aria-label', `See all blogs tagged ${label}`);
    wrap.append(tag);
  });
  return wrap;
}

function authoredTagEntries(value) {
  return normalizeText(value)
    .split(/[,;\n]/)
    .map((label) => normalizeText(label))
    .filter(Boolean)
    .slice(0, MAX_TAGS)
    .map((label) => ({ label }));
}

/* ---- Side panel (the page Hero's navy panel) --------------------------- */

function panelLink(textField, linkField, style) {
  const href = normalizeText(linkField.value);
  const label = normalizeText(textField.value);
  if (!href && !label) return null;
  const anchor = document.createElement('a');
  anchor.className = 'blog-hero-side-panel-btn';
  anchor.href = href ? resolveSiteHref(href) : '#';
  anchor.textContent = label || 'Learn More';
  applyButtonStyle(anchor, style);
  if (textField.source) moveInstrumentation(textField.source, anchor);
  else if (linkField.source) moveInstrumentation(linkField.source, anchor);
  return anchor;
}

function buildSidePanel(panel, inEditor) {
  const panelEl = document.createElement('aside');
  panelEl.className = 'blog-hero-side-panel';

  const picture = panel.image.picture || null;
  if (picture) {
    const media = document.createElement('div');
    media.className = 'blog-hero-side-panel-image';
    media.append(picture);
    panelEl.append(media);
    panelEl.classList.add('has-panel-image');
  }

  const parts = [
    fieldElement('h2', 'blog-hero-side-panel-title u-h3', panel.title),
    fieldElement('div', 'blog-hero-side-panel-text', panel.text, { html: true }),
  ].filter(Boolean);
  panelEl.append(...parts);

  const primary = panelLink(panel.primaryText, panel.primaryLink, 'primary');
  const secondary = panelLink(panel.secondaryText, panel.secondaryLink, 'text-link');
  if (primary || secondary) {
    const actions = document.createElement('div');
    actions.className = 'blog-hero-side-panel-actions';
    // The panel is always navy, so its buttons take the dark form.
    markButtonSurface(actions, true);
    actions.append(...[primary, secondary].filter(Boolean));
    panelEl.append(actions);
    parts.push(actions);
  }

  const footer = fieldElement('div', 'blog-hero-side-panel-footer', panel.footer, { html: true });
  if (footer) {
    panelEl.append(footer);
    parts.push(footer);
  }

  if (parts.length) return panelEl;
  if (picture) {
    panelEl.classList.add('is-image-only');
    return panelEl;
  }
  if (!inEditor) return null;

  // An empty panel still needs something to click in the editor.
  const hint = document.createElement('p');
  hint.className = 'blog-hero-side-panel-text';
  hint.textContent = 'Side panel: fill the Side Panel tab, or leave it empty to hide this.';
  panelEl.append(hint);
  panelEl.classList.add('is-placeholder');
  return panelEl;
}

/* ---- Decorate ---------------------------------------------------------- */

function pageTitle() {
  return normalizeText(getMetadata('og:title') || document.title);
}

export default async function decorate(block) {
  const fields = readFields(block);
  const isBlog = looksLikeBlogPath() || Boolean(document.querySelector('main .article-details'));

  const titleText = normalizeText(fields.title.value) || pageTitle();

  const content = document.createElement('div');
  content.className = 'blog-hero-content';
  const layout = document.createElement('div');
  layout.className = 'blog-hero-layout';
  const main = document.createElement('div');
  main.className = 'blog-hero-main';

  const breadcrumbs = buildBreadcrumbs(fields, titleText);
  if (breadcrumbs) main.append(breadcrumbs);

  const title = fieldElement('h1', 'blog-hero-title', fields.title, {
    fallback: titleText || (fields.inEditor ? 'Blog title' : ''),
  });
  if (title) main.append(title);

  const metaSlot = document.createElement('div');
  metaSlot.className = 'blog-hero-meta-slot';
  const tagSlot = document.createElement('div');
  tagSlot.className = 'blog-hero-tag-slot';
  main.append(metaSlot, tagSlot);

  const intro = fieldElement('div', 'blog-hero-intro', fields.intro, { html: true });
  if (intro) main.append(intro);

  layout.append(main);

  const panel = buildSidePanel(fields.panel, fields.inEditor);
  if (panel) {
    layout.append(panel);
    block.classList.add('has-side-panel');
  }

  content.append(layout);

  const backgroundPicture = fields.backgroundImage.picture || null;
  block.replaceChildren();
  if (backgroundPicture) {
    const media = document.createElement('div');
    media.className = 'blog-hero-background';
    const img = backgroundPicture.querySelector('img');
    if (img) img.alt = '';
    media.append(backgroundPicture);
    block.append(media);
    block.classList.add('has-background');
  }
  block.append(content);

  // The byline and tags paint now from what was authored, then fill from the
  // blog's record where a field was left blank.
  const renderMeta = (author, date) => {
    metaSlot.replaceChildren(...[buildMeta(author, formatDate(date))].filter(Boolean));
  };
  const renderTags = (entries) => {
    tagSlot.replaceChildren(...[fields.showTags ? buildTags(entries) : null].filter(Boolean));
  };

  const authoredTags = authoredTagEntries(fields.tags.value);
  renderMeta(fields.author.value, fields.date.value);
  renderTags(authoredTags);

  const needsAuthor = !normalizeText(fields.author.value);
  const needsDate = !normalizeText(fields.date.value);
  const needsTags = fields.showTags && !authoredTags.length;
  if (!isBlog || !(needsAuthor || needsDate || needsTags)) return;

  const article = await fetchArticle();
  if (!article) return;
  renderMeta(
    needsAuthor ? article.author : fields.author.value,
    needsDate ? (article.article_date || article.published_at) : fields.date.value,
  );
  if (needsTags) renderTags(articleTagEntries(article, MAX_TAGS));
}
