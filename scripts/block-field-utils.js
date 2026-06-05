function normalizeNames(name) {
  return (Array.isArray(name) ? name : [name])
    .filter((value) => value !== undefined && value !== null);
}

export function getFieldSelector(name) {
  return normalizeNames(name)
    .map((fieldName) => `[data-aue-prop="${fieldName}"], [data-richtext-prop="${fieldName}"]`)
    .join(', ');
}

function getDataPropSelector(name) {
  return normalizeNames(name)
    .map((fieldName) => `[data-aue-prop="${fieldName}"]`)
    .join(', ');
}

export function getBlockRows(scope) {
  return [...(scope?.querySelectorAll?.(':scope > div') || [])];
}

function normalizeOptions(options) {
  if (typeof options === 'number') {
    return { rowIndex: options, columnIndex: 0 };
  }

  return {
    rowIndex: options?.rowIndex ?? options?.row,
    columnIndex: options?.columnIndex ?? options?.column ?? 0,
    labels: options?.labels || options?.label || null,
    fallbackCell: options?.fallbackCell || null,
  };
}

function normalizeLabel(value) {
  return `${value || ''}`
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function getFallbackCell(scope, options = {}) {
  const {
    rowIndex,
    columnIndex,
    labels,
    fallbackCell,
  } = normalizeOptions(options);
  if (fallbackCell) return fallbackCell;

  if (labels) {
    const accepted = (Array.isArray(labels) ? labels : [labels]).map(normalizeLabel);
    const row = getBlockRows(scope).find((candidate) => {
      if (candidate.children.length < 2) return false;
      return accepted.includes(normalizeLabel(candidate.children[0].textContent));
    });
    if (row) return row.children[1] || null;
  }

  if (rowIndex === undefined || rowIndex === null) return null;
  const row = getBlockRows(scope)[rowIndex];
  return row?.children?.[columnIndex] || null;
}

function textFrom(node) {
  return node?.textContent?.trim() || '';
}

export function resourcePathFromAueResource(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

export function getAueResourcePath(scope) {
  const resource = scope?.getAttribute?.('data-aue-resource')
    || scope?.querySelector?.('[data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';

  return resourcePathFromAueResource(resource);
}

export async function readAueResourceFields(resourcePath, names = []) {
  if (!resourcePath || typeof fetch !== 'function') return {};

  try {
    const response = await fetch(`${resourcePath}.json`, { cache: 'no-store' });
    if (!response.ok) return {};

    const data = await response.json();
    if (!data || typeof data !== 'object') return {};

    return normalizeNames(names)
      .reduce((fields, name) => {
        if (data[name] !== undefined && data[name] !== null) {
          fields[name] = data[name];
        }
        return fields;
      }, {});
  } catch {
    return {};
  }
}

export function readTextField(scope, name, options = {}) {
  const source = scope.querySelector(getFieldSelector(name));
  const fallbackCell = source ? null : getFallbackCell(scope, options);

  return {
    source,
    cell: source || fallbackCell,
    value: textFrom(source) || textFrom(fallbackCell),
  };
}

export function readLinkField(scope, name, options = {}) {
  const source = scope.querySelector(getDataPropSelector(name));
  const fallbackCell = source ? null : getFallbackCell(scope, options);
  const cell = source || fallbackCell;
  const anchor = cell?.tagName === 'A' ? cell : cell?.querySelector?.('a');

  return {
    source,
    cell,
    value: anchor?.getAttribute('href')
      || cell?.getAttribute?.('href')
      || textFrom(cell),
  };
}

export function readRichTextField(scope, name, options = {}) {
  const source = scope.querySelector(getFieldSelector(name));
  const fallbackCell = source ? null : getFallbackCell(scope, options);
  const cell = source || fallbackCell;

  return {
    source,
    cell,
    html: cell?.innerHTML?.trim() || '',
    text: textFrom(cell),
  };
}

function findPictureNearSource(source, scope) {
  if (!source) return null;
  if (source.tagName === 'PICTURE') return source;
  if (source.closest?.('picture')) return source.closest('picture');
  if (source.querySelector?.('picture')) return source.querySelector('picture');

  let parent = source.parentElement;
  while (parent && parent !== scope) {
    const picture = parent.querySelector?.('picture');
    if (picture) return picture;
    parent = parent.parentElement;
  }

  return null;
}

export function readImageField(scope, name, options = {}) {
  const source = scope.querySelector(getDataPropSelector(name));
  const fallbackCell = source ? null : getFallbackCell(scope, options);
  const cell = source || fallbackCell;
  const picture = findPictureNearSource(source, scope)
    || (cell?.tagName === 'PICTURE' ? cell : null)
    || cell?.querySelector?.('picture')
    || null;
  const img = (cell?.tagName === 'IMG' ? cell : null)
    || cell?.querySelector?.('img')
    || picture?.querySelector?.('img')
    || null;

  return {
    source,
    cell,
    picture,
    img,
  };
}
