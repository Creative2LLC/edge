export const DEFAULT_LIST_SORT = 'newest';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'recently_updated', label: 'Last modified' },
  { value: 'oldest_updated', label: 'Least recently modified' },
  { value: 'recently_added', label: 'Recently added' },
  { value: 'oldest_added', label: 'Oldest added' },
  { value: 'title_asc', label: 'Title A-Z' },
  { value: 'title_desc', label: 'Title Z-A' },
];

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeDateValue(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareStrings(left, right, direction = 'asc') {
  const result = normalizeText(left).localeCompare(normalizeText(right), undefined, {
    sensitivity: 'base',
  });

  return direction === 'desc' ? result * -1 : result;
}

function compareDates(left, right, direction = 'desc') {
  const leftValue = normalizeDateValue(left);
  const rightValue = normalizeDateValue(right);

  if (leftValue === null && rightValue === null) return 0;
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;

  const result = leftValue - rightValue;
  return direction === 'desc' ? result * -1 : result;
}

export function getListSortOptions() {
  return SORT_OPTIONS.map((option) => ({ ...option }));
}

export function normalizeListSort(value, fallback = DEFAULT_LIST_SORT) {
  const normalized = normalizeText(value).toLowerCase();
  return SORT_OPTIONS.some((option) => option.value === normalized) ? normalized : fallback;
}

export function sortListItems(items = [], sort = DEFAULT_LIST_SORT, readValues = (entry) => entry) {
  const normalizedSort = normalizeListSort(sort);
  const decorated = items.map((item, index) => ({
    item,
    index,
    values: readValues(item) || {},
  }));

  decorated.sort((left, right) => {
    const leftValues = left.values;
    const rightValues = right.values;

    const sortByTitle = (direction) => {
      const titleResult = compareStrings(leftValues.title, rightValues.title, direction);
      return titleResult || (left.index - right.index);
    };

    if (normalizedSort === 'title_asc') return sortByTitle('asc');
    if (normalizedSort === 'title_desc') return sortByTitle('desc');

    if (normalizedSort === 'newest' || normalizedSort === 'oldest') {
      const direction = normalizedSort === 'newest' ? 'desc' : 'asc';
      const articleDateResult = compareDates(
        leftValues.articleDate,
        rightValues.articleDate,
        direction,
      );
      if (articleDateResult) return articleDateResult;
      const publishedResult = compareDates(
        leftValues.publishedAt,
        rightValues.publishedAt,
        direction,
      );
      if (publishedResult) return publishedResult;
      return sortByTitle('asc');
    }

    if (normalizedSort === 'recently_updated' || normalizedSort === 'oldest_updated') {
      const direction = normalizedSort === 'recently_updated' ? 'desc' : 'asc';
      const updatedResult = compareDates(leftValues.updatedAt, rightValues.updatedAt, direction);
      if (updatedResult) return updatedResult;
      return sortByTitle('asc');
    }

    if (normalizedSort === 'recently_added' || normalizedSort === 'oldest_added') {
      const direction = normalizedSort === 'recently_added' ? 'desc' : 'asc';
      const createdResult = compareDates(leftValues.createdAt, rightValues.createdAt, direction);
      if (createdResult) return createdResult;
      return sortByTitle('asc');
    }

    return left.index - right.index;
  });

  return decorated.map(({ item }) => item);
}
