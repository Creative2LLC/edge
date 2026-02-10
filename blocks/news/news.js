import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
  buttonText: ['button text', 'buttontext', 'button label'],
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
  const source = block.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const value = source.textContent.trim();
    source.remove();
    return value;
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

// Field order matches news-article model: image, imageAlt, title, subheading, linkUrl, tagNames, tagColors
const ARTICLE_FIELD_COUNT = 7;

function parseArticleRow(row) {
  const cols = [...row.children];

  // Multi-column: columns match model field order
  if (cols.length >= ARTICLE_FIELD_COUNT) {
    const image = getColImage(cols[0]);
    return {
      imgSrc: image.src,
      imageAlt: getColText(cols[1]) || image.alt,
      title: getColText(cols[2]),
      subheading: getColText(cols[3]),
      linkUrl: getColText(cols[4]),
      tagNames: getColText(cols[5]),
      tagColors: getColText(cols[6]),
    };
  }

  // Try data-aue-prop (Universal Editor live context)
  const getField = (prop) => {
    const el = row.querySelector(`[data-aue-prop="${prop}"]`);
    return el ? el.textContent.trim() : '';
  };
  const imageEl = row.querySelector(`[data-aue-prop="image"]`);
  const title = getField('title');
  if (title) {
    const pic = imageEl?.querySelector('img');
    return {
      imgSrc: pic?.src || '',
      imageAlt: getField('imageAlt') || pic?.alt || '',
      title,
      subheading: getField('subheading'),
      linkUrl: getField('linkUrl'),
      tagNames: getField('tagNames'),
      tagColors: getField('tagColors'),
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
      tagNames: '',
      tagColors: '',
    };
  }

  return null;
}

function parseTags(tagNames, tagColors) {
  const names = tagNames.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const colors = tagColors.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return names.map((name, i) => ({ name, color: colors[i] || '#666' }));
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

  const content = document.createElement('div');
  content.className = 'news-featured-content';

  const tags = parseTags(article.tagNames, article.tagColors);
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

  if (article.imgSrc) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'news-card-image';
    const pic = createOptimizedPicture(article.imgSrc, article.imageAlt, false, [{ width: '400' }]);
    imageWrap.append(pic);
    li.append(imageWrap);
  }

  const content = document.createElement('div');
  content.className = 'news-card-content';

  const tags = parseTags(article.tagNames, article.tagColors);
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
  const buttonText = getBlockField(block, legacyMap, 'buttonText') || 'View More News';

  // Remaining rows are article items
  const rows = [...block.querySelectorAll(':scope > div')];
  const articles = [];
  rows.forEach((row) => {
    const article = parseArticleRow(row);
    if (article) articles.push({ data: article, row });
  });

  const inner = document.createElement('div');
  inner.className = 'news-inner';

  // Heading
  if (heading) {
    const h2 = document.createElement('h2');
    h2.className = 'news-heading';
    h2.textContent = heading;
    inner.append(h2);
  }

  // Featured card (first article)
  if (articles.length > 0) {
    const featured = buildFeaturedCard(articles[0].data, articles[0].row);
    inner.append(featured);
  }

  // Small cards (remaining articles)
  if (articles.length > 1) {
    const ul = document.createElement('ul');
    ul.className = 'news-cards';
    for (let i = 1; i < articles.length; i += 1) {
      const hidden = i > 3; // First 3 small cards visible (indices 1-3), rest hidden
      const card = buildSmallCard(articles[i].data, articles[i].row, hidden);
      ul.append(card);
    }
    inner.append(ul);

    // View More button (only if more than 3 small cards)
    const smallCardCount = articles.length - 1;
    if (smallCardCount > 3) {
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
