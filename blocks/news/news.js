import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readImageField,
  readLinkField,
  readTextField,
  setItemLabel,
} from '../../scripts/block-field-utils.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  subheading: ['subheading', 'subtitle'],
  headerButtonText: ['header button text', 'headerbuttontext', 'header button'],
  headerButtonLink: ['header button link', 'headerbuttonlink'],
  featuredMode: ['featured mode', 'featuredmode', 'featured article'],
  button: ['button text', 'buttontext', 'button label', 'button'],
};

function collectLegacyBlockFields(block) {
  const map = {};
  const rowsToRemove = [];
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children.length !== 2) return;
    const key = row.children[0].textContent.trim().toLowerCase();
    const valueEl = row.children[1];
    Object.entries(LEGACY_BLOCK_LABELS).some(([name, labels]) => {
      if (!labels.includes(key)) return false;
      map[name] = valueEl.textContent.trim();
      rowsToRemove.push(row);
      return true;
    });
  });
  rowsToRemove.forEach((row) => row.remove());
  return map;
}

function getBlockField(block, legacyMap, name) {
  const field = readTextField(block, name);
  if (field.source) {
    field.source.remove();
    return field.value;
  }
  return legacyMap[name] || '';
}

function getBlockLinkField(block, legacyMap, name) {
  const field = readLinkField(block, name);
  if (field.source) {
    field.source.remove();
    return field.value;
  }
  return legacyMap[name] || '';
}

function getColText(col) {
  if (!col) return '';
  // Prefer the anchor href for link columns
  const a = col.querySelector('a');
  if (a && a.href) return a.href;
  return col.textContent.trim();
}

function getColImage(col) {
  if (!col) return { src: '', alt: '' };
  const img = col.querySelector('img');
  if (img) return { src: img.src, alt: img.alt || '' };
  return { src: '', alt: '' };
}

// Model fields: image, title, subtitle, link, tags (5 columns)

function parseArticleRow(row) {
  const cols = [...row.children];

  // 5 columns: image | title | subtitle | link | tags
  if (cols.length >= 5) {
    const image = getColImage(cols[0]);
    return {
      imgSrc: image.src,
      imageAlt: image.alt,
      title: getColText(cols[1]),
      subheading: getColText(cols[2]),
      linkUrl: getColText(cols[3]),
      tags: getColText(cols[4]),
    };
  }

  // Try data-aue-prop (Universal Editor live context)
  const getField = (prop) => {
    const field = readTextField(row, prop);
    return field.value;
  };
  const imageField = readImageField(row, 'image');
  const title = getField('title');
  if (title) {
    return {
      imgSrc: imageField.img?.src || '',
      imageAlt: imageField.img?.alt || '',
      title,
      subheading: getField('subtitle'),
      linkUrl: readLinkField(row, 'link').value,
      tags: getField('tags'),
    };
  }

  // Minimal fallback: 2 columns (image | text)
  if (cols.length >= 2) {
    const img = cols[0].querySelector('img');
    const paragraphs = cols[1].querySelectorAll('p');
    const link = cols[1].querySelector('a');
    return {
      imgSrc: img?.src || '',
      imageAlt: img?.alt || '',
      title: paragraphs[0]?.textContent.trim() || '',
      subheading: paragraphs[1]?.textContent.trim() || '',
      linkUrl: link?.href || '',
      tags: '',
    };
  }

  return null;
}

const TAG_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FLATTENED_TAG_SEPARATOR_RE = /(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8}))\s+(?=[^:\n]+(?::#|$))/gi;

function normalizeTagLines(tagsStr) {
  return String(tagsStr || '')
    .replace(FLATTENED_TAG_SEPARATOR_RE, '$1\n')
    .split(/\r?\n|[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTags(tagsStr) {
  return normalizeTagLines(tagsStr).map((line) => {
    const sep = line.lastIndexOf(':');
    if (sep > 0) {
      const color = line.slice(sep + 1).trim();
      return {
        name: line.slice(0, sep).trim(),
        color: TAG_COLOR_RE.test(color) ? color : '#a1a1a1',
      };
    }
    return { name: line, color: '#a1a1a1' };
  });
}

function buildTagsContainer(tags) {
  if (!tags.length) return null;
  const container = document.createElement('div');
  container.className = 'news-tags';
  tags.forEach(({ name, color }) => {
    const span = document.createElement('span');
    span.className = 'news-tag';
    span.textContent = name;
    span.style.backgroundColor = color;
    container.append(span);
  });
  return container;
}

function buildReadMore(url) {
  if (!url) return null;
  const a = document.createElement('a');
  a.className = 'news-read-more';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Read more \u2192';
  return a;
}

function buildFeaturedCard(article, row) {
  const featured = document.createElement('div');
  featured.className = 'news-featured';
  if (row) moveInstrumentation(row, featured);
  setItemLabel(featured, [article.title, article.subheading]);

  const content = document.createElement('div');
  content.className = 'news-featured-content';

  const tags = parseTags(article.tags);
  const tagsEl = buildTagsContainer(tags);
  if (tagsEl) content.append(tagsEl);

  const titleEl = document.createElement('h3');
  titleEl.className = 'news-featured-title';
  titleEl.textContent = article.title;
  content.append(titleEl);

  if (article.subheading) {
    const sub = document.createElement('p');
    sub.className = 'news-featured-subheading';
    sub.textContent = article.subheading;
    content.append(sub);
  }

  const readMore = buildReadMore(article.linkUrl);
  if (readMore) content.append(readMore);

  featured.append(content);

  if (article.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'news-featured-image';
    const pic = createOptimizedPicture(article.imgSrc, article.imageAlt, false, [{ width: '800' }]);
    imageWrap.append(pic);
    featured.append(imageWrap);
  }

  return featured;
}

function buildSmallCard(article, row, hidden) {
  const li = document.createElement('li');
  li.className = `news-card${hidden ? ' news-card-hidden' : ''}`;
  if (row) moveInstrumentation(row, li);
  setItemLabel(li, [article.title, article.subheading]);

  if (article.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'news-card-image';
    const pic = createOptimizedPicture(article.imgSrc, article.imageAlt, false, [{ width: '400' }]);
    imageWrap.append(pic);
    li.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'news-card-content';

  const tags = parseTags(article.tags);
  const tagsEl = buildTagsContainer(tags);
  if (tagsEl) content.append(tagsEl);

  const titleEl = document.createElement('h4');
  titleEl.className = 'news-card-title';
  titleEl.textContent = article.title;
  content.append(titleEl);

  if (article.subheading) {
    const sub = document.createElement('p');
    sub.className = 'news-card-subheading';
    sub.textContent = article.subheading;
    content.append(sub);
  }

  const readMore = buildReadMore(article.linkUrl);
  if (readMore) content.append(readMore);

  li.append(content);
  return li;
}

export default function decorate(block) {
  const legacyMap = collectLegacyBlockFields(block);
  const heading = getBlockField(block, legacyMap, 'heading');
  const subheading = getBlockField(block, legacyMap, 'subheading');
  const headerButtonText = getBlockField(block, legacyMap, 'headerButtonText');
  const headerButtonLink = getBlockLinkField(block, legacyMap, 'headerButtonLink');
  const featuredMode = getBlockField(block, legacyMap, 'featuredMode') || 'featured';
  const buttonText = getBlockField(block, legacyMap, 'button') || 'View More News';

  const useFeatured = featuredMode !== 'none';

  // Remaining rows are article items
  const rows = [...block.querySelectorAll(':scope > div')];
  const articles = [];
  rows.forEach((row) => {
    const article = parseArticleRow(row);
    if (article) articles.push({ data: article, row });
  });

  const inner = document.createElement('div');
  inner.className = 'news-inner';

  // Header row — heading + subheading on left, optional button on right
  const hasHeader = heading || subheading || headerButtonText || headerButtonLink;
  if (hasHeader) {
    const header = document.createElement('div');
    header.className = 'news-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'news-header-left';

    if (heading) {
      const h2 = document.createElement('h2');
      h2.className = 'news-heading';
      h2.textContent = heading;
      headerLeft.append(h2);
    }

    if (subheading) {
      const sub = document.createElement('p');
      sub.className = 'news-subheading';
      sub.textContent = subheading;
      headerLeft.append(sub);
    }

    if (headerLeft.childElementCount) header.append(headerLeft);

    if (headerButtonText || headerButtonLink) {
      const headerBtn = document.createElement(headerButtonLink ? 'a' : 'button');
      headerBtn.className = 'news-header-button';
      headerBtn.textContent = headerButtonText || 'Learn More';
      if (headerButtonLink) headerBtn.href = headerButtonLink;
      else headerBtn.type = 'button';
      header.append(headerBtn);
    }

    inner.append(header);
  }

  // Featured card (first article) — only in featured mode
  if (useFeatured && articles.length > 0) {
    const featured = buildFeaturedCard(articles[0].data, articles[0].row);
    inner.append(featured);
  }

  // Small cards — remaining articles (or all if no featured). First 3 visible, rest hidden.
  const startIndex = useFeatured ? 1 : 0;
  const visibleCount = 3;

  if (articles.length > startIndex) {
    const ul = document.createElement('ul');
    ul.className = 'news-cards';
    for (let i = startIndex; i < articles.length; i += 1) {
      const positionInGrid = i - startIndex;
      const hidden = positionInGrid >= visibleCount;
      const card = buildSmallCard(articles[i].data, articles[i].row, hidden);
      ul.append(card);
    }
    inner.append(ul);

    // View More button — only if there are more small cards than visible
    const smallCardCount = articles.length - startIndex;
    if (smallCardCount > visibleCount) {
      const btnWrapper = document.createElement('div');
      btnWrapper.className = 'news-button-wrapper';
      const btn = document.createElement('button');
      btn.className = 'news-button';
      btn.textContent = buttonText;
      btn.addEventListener('click', () => {
        const expanded = block.classList.toggle('news-expanded');
        btn.textContent = expanded ? 'Show Less' : buttonText;
      });
      btnWrapper.append(btn);
      inner.append(btnWrapper);
    }
  }

  block.replaceChildren(inner);
}
