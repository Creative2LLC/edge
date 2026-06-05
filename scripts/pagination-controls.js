export function normalizePaginationMode(value, fallback = 'load-more') {
  const normalized = `${value || ''}`.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'pagination' || normalized.includes('paginat') || normalized.includes('page')) {
    return 'pagination';
  }
  return 'load-more';
}

export function isPaginationMode(value) {
  return normalizePaginationMode(value) === 'pagination';
}

function paginationRange(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

function scrollToPaginationTop(nav, className) {
  const target = nav.closest(`.${className}`) || nav.closest('.block') || nav.parentElement;
  if (!target) return;

  const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior, block: 'start' });
  });
}

export function createPaginationControls(className, ariaLabel = 'Pagination') {
  const nav = document.createElement('nav');
  nav.className = `${className}-pagination`;
  nav.setAttribute('aria-label', ariaLabel);
  nav.hidden = true;

  const pageLabel = document.createElement('span');
  pageLabel.className = `${className}-pagination-label`;
  pageLabel.setAttribute('aria-live', 'polite');

  const first = document.createElement('button');
  first.type = 'button';
  first.className = `${className}-pagination-button`;
  first.textContent = 'First';

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = `${className}-pagination-button`;
  previous.textContent = 'Previous';

  const pages = document.createElement('span');
  pages.className = `${className}-pagination-pages`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = `${className}-pagination-button`;
  next.textContent = 'Next';

  const last = document.createElement('button');
  last.type = 'button';
  last.className = `${className}-pagination-button`;
  last.textContent = 'Last';

  nav.append(first, previous, pages, pageLabel, next, last);

  return {
    nav,
    update({ page = 1, lastPage = 1, onPage = null } = {}) {
      const currentPage = Math.max(1, Number(page) || 1);
      const totalPages = Math.max(1, Number(lastPage) || 1);
      const goToPage = (targetPage) => {
        if (typeof onPage !== 'function' || targetPage === currentPage) return;

        Promise.resolve(onPage(targetPage)).then(() => {
          scrollToPaginationTop(nav, className);
        });
      };

      nav.hidden = totalPages <= 1;
      pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
      first.disabled = currentPage <= 1;
      previous.disabled = currentPage <= 1;
      next.disabled = currentPage >= totalPages;
      last.disabled = currentPage >= totalPages;
      first.onclick = () => goToPage(1);
      previous.onclick = () => goToPage(Math.max(1, currentPage - 1));
      next.onclick = () => goToPage(Math.min(totalPages, currentPage + 1));
      last.onclick = () => goToPage(totalPages);

      pages.replaceChildren();
      paginationRange(currentPage, totalPages).forEach((entry, index) => {
        if (entry === 'ellipsis') {
          const ellipsis = document.createElement('span');
          ellipsis.className = `${className}-pagination-ellipsis`;
          ellipsis.textContent = '...';
          ellipsis.setAttribute('aria-hidden', 'true');
          pages.append(ellipsis);
          return;
        }

        const pageButton = document.createElement('button');
        pageButton.type = 'button';
        pageButton.className = `${className}-pagination-button ${className}-pagination-page`;
        pageButton.textContent = String(entry);
        pageButton.setAttribute('aria-label', `Page ${entry}`);
        if (entry === currentPage) {
          pageButton.classList.add('is-active');
          pageButton.setAttribute('aria-current', 'page');
        }
        pageButton.onclick = () => goToPage(entry);
        pages.append(pageButton);

        if (index === 0) {
          pageButton.classList.add('is-first-page');
        }
      });
    },
  };
}
