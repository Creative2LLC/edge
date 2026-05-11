export function normalizePaginationMode(value, fallback = 'load-more') {
  const normalized = `${value || ''}`.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized.includes('page')) return 'pagination';
  return 'load-more';
}

export function isPaginationMode(value) {
  return normalizePaginationMode(value) === 'pagination';
}

export function createPaginationControls(className, ariaLabel = 'Pagination') {
  const nav = document.createElement('nav');
  nav.className = `${className}-pagination`;
  nav.setAttribute('aria-label', ariaLabel);
  nav.hidden = true;

  const pageLabel = document.createElement('span');
  pageLabel.className = `${className}-pagination-label`;

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = `${className}-pagination-button`;
  previous.textContent = 'Previous';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = `${className}-pagination-button`;
  next.textContent = 'Next';

  nav.append(previous, pageLabel, next);

  return {
    nav,
    update({ page = 1, lastPage = 1, onPage = null } = {}) {
      const currentPage = Math.max(1, Number(page) || 1);
      const totalPages = Math.max(1, Number(lastPage) || 1);
      nav.hidden = totalPages <= 1;
      pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
      previous.disabled = currentPage <= 1;
      next.disabled = currentPage >= totalPages;
      previous.onclick = () => {
        if (typeof onPage === 'function' && currentPage > 1) onPage(currentPage - 1);
      };
      next.onclick = () => {
        if (typeof onPage === 'function' && currentPage < totalPages) onPage(currentPage + 1);
      };
    },
  };
}
