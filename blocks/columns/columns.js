import {
  readAueResourceFields,
  resourcePathFromAueResource,
} from '../../scripts/block-field-utils.js';

const COLUMN_SCOPE_SELECTOR = '[data-aue-filter="column"], [data-aue-label="Column"], [data-aue-model="column"]';
const DIRECT_COLUMN_SCOPE_SELECTOR = [
  ':scope > [data-aue-filter="column"]',
  ':scope > [data-aue-label="Column"]',
  ':scope > [data-aue-model="column"]',
].join(', ');
const VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'];
const HORIZONTAL_ALIGNMENTS = ['left', 'center', 'right'];

function normalizeAlignment(value, allowedValues, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '');

  return allowedValues.find((allowedValue) => normalized.includes(allowedValue)) || fallback;
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalized) && hexMatch) {
    return hexMatch[0];
  }

  return normalized;
}

function isNestedComponentField(block, field) {
  const blockResource = block.getAttribute('data-aue-resource') || '';
  const fieldResource = field.getAttribute('data-aue-resource') || '';

  if (blockResource && fieldResource && fieldResource !== blockResource) {
    return true;
  }

  const owningComponent = field.parentElement?.closest(
    '[data-aue-resource][data-aue-type="component"], [data-aue-resource][data-aue-behavior="component"]',
  );

  return Boolean(
    owningComponent
      && owningComponent !== block
      && (!blockResource || owningComponent.getAttribute('data-aue-resource') !== blockResource),
  );
}

function getColumnAuthoringScope(column) {
  if (column.matches(COLUMN_SCOPE_SELECTOR)) return column;
  return column.querySelector(DIRECT_COLUMN_SCOPE_SELECTOR);
}

function directChildOf(scope, element) {
  let row = element;
  while (row && row.parentElement !== scope) {
    row = row.parentElement;
  }
  return row && row.parentElement === scope ? row : null;
}

function findOwnField(block, row, name) {
  const selector = `[data-aue-prop="${name}"]`;
  const candidates = [
    ...(row.matches(selector) ? [row] : []),
    ...row.querySelectorAll(selector),
  ];

  return candidates
    .find((field) => !isNestedComponentField(block, field)) || null;
}

function rowText(row) {
  return String(row?.textContent || '').trim();
}

function rowHasNestedContent(row) {
  return Boolean(row?.querySelector(
    'picture, img, ul, ol, a, button, .block, [data-aue-resource], [data-richtext-prop]',
  ));
}

function isSimpleAlignmentRow(row) {
  const text = rowText(row);
  if (!text || text.length > 32 || rowHasNestedContent(row)) return false;

  return Boolean(
    normalizeAlignment(text, VERTICAL_ALIGNMENTS, '')
      || normalizeAlignment(text, HORIZONTAL_ALIGNMENTS, ''),
  );
}

function isColumnsContentRow(row) {
  if (!row?.children?.length || isSimpleAlignmentRow(row)) return false;
  if (row.children.length >= 2) return true;
  return rowHasNestedContent(row);
}

function isNestedColumnField(column, scope, field) {
  if (isNestedComponentField(scope, field)) return true;

  const columnsBlock = column.closest('.columns.block') || column.closest('.block');
  const owningBlock = field.closest('.block');
  if (owningBlock && owningBlock !== columnsBlock) return true;

  const owningModel = field.closest('[data-aue-model]');
  return Boolean(
    owningModel
      && owningModel !== scope
      && owningModel !== column
      && !owningModel.matches(COLUMN_SCOPE_SELECTOR),
  );
}

function cleanupColumnBackgroundField(column, source) {
  if (!source) return;

  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));
  const scope = getColumnAuthoringScope(column) || column;
  const row = directChildOf(scope, source);
  const target = row && row !== scope ? row : source;

  if (target === column || target === scope) return;

  if (isEditor) {
    target.hidden = true;
    return;
  }

  target.remove();
}

function findColumnBackgroundField(column) {
  const scope = getColumnAuthoringScope(column) || column;
  const selector = '[data-aue-prop="backgroundColor"]';
  const candidates = [
    ...(scope.matches(selector) ? [scope] : []),
    ...scope.querySelectorAll(selector),
  ];

  return candidates
    .find((field) => !isNestedColumnField(column, scope, field)) || null;
}

function getColumnResourcePath(column, source = null) {
  const scope = getColumnAuthoringScope(column);
  return resourcePathFromAueResource(
    source?.getAttribute('data-aue-resource')
      || scope?.getAttribute('data-aue-resource')
      || column.getAttribute('data-aue-resource')
      || '',
  );
}

function applyColumnBackground(column, value) {
  const color = normalizeColorValue(value);
  if (!color) return;

  column.classList.add('has-column-background');
  column.style.setProperty('--columns-column-background-color', color);
  column.setAttribute('data-background-color', color);
  column.setAttribute('data-backgroundcolor', color);
}

function watchColumnBackgroundField(source, column) {
  if (!source) return;

  new MutationObserver(() => {
    applyColumnBackground(column, source.textContent);
  }).observe(source, { childList: true, characterData: true, subtree: true });
}

function decorateColumnBackground(column) {
  const source = findColumnBackgroundField(column);
  const authoredValue = source?.textContent
    || column.getAttribute('data-background-color')
    || column.getAttribute('data-backgroundcolor')
    || '';

  applyColumnBackground(column, authoredValue);
  cleanupColumnBackgroundField(column, source);
  watchColumnBackgroundField(source, column);

  const resourcePath = getColumnResourcePath(column, source);
  readAueResourceFields(resourcePath, ['backgroundColor'])
    .then((fields) => applyColumnBackground(column, fields.backgroundColor));
}

function readAlignment(block) {
  let verticalAlign = 'top';
  let horizontalAlign = '';
  const rowsToRemove = [];
  const hasContentRow = [...block.children].some(isColumnsContentRow);

  [...block.children].forEach((row) => {
    let isConfigRow = false;

    const vField = findOwnField(block, row, 'verticalAlign');
    if (vField) {
      verticalAlign = normalizeAlignment(vField.textContent, VERTICAL_ALIGNMENTS, verticalAlign);
      isConfigRow = true;
    }

    const hField = findOwnField(block, row, 'horizontalAlign');
    if (hField) {
      horizontalAlign = normalizeAlignment(hField.textContent, HORIZONTAL_ALIGNMENTS);
      isConfigRow = true;
    }

    if (hasContentRow && isSimpleAlignmentRow(row)) {
      const text = rowText(row);
      const nextVerticalAlign = normalizeAlignment(text, VERTICAL_ALIGNMENTS, '');
      const nextHorizontalAlign = normalizeAlignment(text, HORIZONTAL_ALIGNMENTS, '');

      if (nextVerticalAlign) {
        verticalAlign = nextVerticalAlign;
        isConfigRow = true;
      }

      if (nextHorizontalAlign) {
        horizontalAlign = nextHorizontalAlign;
        isConfigRow = true;
      }
    }

    if (isConfigRow) {
      rowsToRemove.push(row);
      return;
    }

    if (row.children.length >= 2) {
      const key = row.children[0].textContent.trim().toLowerCase().replace(/[\s_-]+/g, '');
      if (['verticalalignment', 'alignment', 'align', 'verticalalign'].includes(key)) {
        verticalAlign = normalizeAlignment(
          row.children[1].textContent,
          VERTICAL_ALIGNMENTS,
          verticalAlign,
        );
        rowsToRemove.push(row);
      } else if (['horizontalalignment', 'horizontalalign', 'halign'].includes(key)) {
        horizontalAlign = normalizeAlignment(row.children[1].textContent, HORIZONTAL_ALIGNMENTS);
        rowsToRemove.push(row);
      }
    }
  });

  rowsToRemove.forEach((row) => row.remove());
  return { verticalAlign, horizontalAlign };
}

export default function decorate(block) {
  const { verticalAlign, horizontalAlign } = readAlignment(block);

  const contentRow = [...block.children].find(isColumnsContentRow)
    || [...block.children].find((row) => row.children.length);
  const cols = contentRow ? [...contentRow.children] : [];
  if (cols.length) {
    block.classList.add(`columns-${cols.length}-cols`);
  }

  if (VERTICAL_ALIGNMENTS.includes(verticalAlign)) {
    block.classList.add(`columns-align-${verticalAlign}`);
  }

  if (HORIZONTAL_ALIGNMENTS.includes(horizontalAlign)) {
    block.classList.add(`columns-halign-${horizontalAlign}`);
  }

  // In UE, alignment values live in JCR not in DOM rows — fetch and apply them
  const blockResourcePath = resourcePathFromAueResource(
    block.getAttribute('data-aue-resource') || '',
  );
  if (blockResourcePath) {
    readAueResourceFields(blockResourcePath, ['verticalAlign', 'horizontalAlign'])
      .then((fields) => {
        const va = normalizeAlignment(fields.verticalAlign || '', VERTICAL_ALIGNMENTS, '');
        const ha = normalizeAlignment(fields.horizontalAlign || '', HORIZONTAL_ALIGNMENTS, '');
        if (va) {
          VERTICAL_ALIGNMENTS.forEach((v) => block.classList.remove(`columns-align-${v}`));
          block.classList.add(`columns-align-${va}`);
        }
        if (ha) {
          HORIZONTAL_ALIGNMENTS.forEach((v) => block.classList.remove(`columns-halign-${v}`));
          block.classList.add(`columns-halign-${ha}`);
        }
      });
  }

  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      decorateColumnBackground(col);
    });
  });

  // setup image columns
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column
          picWrapper.classList.add('columns-img-col');
        }
      }
    });
  });
}
