import { moveInstrumentation } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';

const LEGACY_BLOCK_LABELS = {
  heading: ['heading', 'title'],
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

function splitOnBr(el) {
  const html = el.innerHTML;
  if (html.includes('<br')) {
    return html.split(/<br\s*\/?>/i).map((s) => {
      const tmp = document.createElement('span');
      tmp.innerHTML = s;
      return tmp.textContent.trim();
    }).filter(Boolean);
  }
  return null;
}

function getColTexts(col) {
  if (!col) return [];
  const paragraphs = col.querySelectorAll('p');
  if (paragraphs.length === 1) {
    // Collapsed fields may be inside a single <p> separated by <br>
    const parts = splitOnBr(paragraphs[0]);
    if (parts && parts.length > 1) return parts;
    return [paragraphs[0].textContent.trim()];
  }
  if (paragraphs.length > 1) {
    return [...paragraphs].map((p) => p.textContent.trim());
  }
  // Fallback: split on <br> at cell level
  const parts = splitOnBr(col);
  if (parts && parts.length > 1) return parts;
  return [col.textContent.trim()];
}

// Field order matches news-article model (4 cells):
// image+imageAlt | title+titleSub | link | tags
const ARTICLE_FIELD_COUNT = 4;

function parseArticleRow(row) {
  const cols = [...row.children];

  // 4-cell layout: image+imageAlt | title+titleSub | link | tags
  if (cols.length >= ARTICLE_FIELD_COUNT) {
    const image = getColImage(cols[0]);
    const texts = getColTexts(cols[1]);
    return {
      imgSrc: image.src,
      imageAlt: image.alt,
      title: texts[0] || '',
      subheading: texts[1] || '',
      linkUrl: getColText(cols[2]),
      tags: getColText(cols[3]),
    };
  }

  // Try data-aue-prop (Universal Editor live context)
  const getField = (prop) => {
    const el = row.querySelector(`[data-aue-prop="${prop}"]`);
    return el ? el.textContent.trim() : '';
  };
  const imageEl = row.querySelector('[data-aue-prop="image"]');
  const title = getField('title');
  if (title) {
    const pic = imageEl?.querySelector('img');
    return {
      imgSrc: pic?.src || '',
      imageAlt: getField('imageAlt') || pic?.alt || '',
      title,
      subheading: getField('titleText'),
      linkUrl: getField('link'),
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

function parseTags(tagsStr) {
  if (!tagsStr) return [];
  const lines = tagsStr.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return lines.map((line) => {
    const sep = line.lastIndexOf(':');
    if (sep > 0) {
      return { name: line.slice(0, sep).trim(), color: line.slice(sep + 1).trim() };
    }
    return { name: line, color: '#666' };
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
  const buttonText = getBlockField(block, legacyMap, 'button') || 'View More News';

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
