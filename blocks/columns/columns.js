import { decorateBlock, loadBlock } from '../../scripts/aem.js';
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
const FLATTENED_NESTED_BLOCK_SELECTOR = '.colored-button, .colored-heading, .colored-text, .statistics, [data-aue-resource]';
const HEX_COLOR_PATTERN = /#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i;
const HORIZONTAL_ALIGNMENTS = ['left', 'center', 'right', 'justify', 'stretch'];
const VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'];
const HEADING_LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

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

function textOf(node) {
  return node?.textContent?.trim() || '';
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-|-$/g, '');
}

function tokenOf(node) {
  return normalizeToken(textOf(node));
}

function isToken(node, allowedValues) {
  return allowedValues.includes(tokenOf(node));
}

function hexColorOf(node) {
  return textOf(node).match(HEX_COLOR_PATTERN)?.[0] || '';
}

function isHexColorNode(node) {
  return Boolean(hexColorOf(node));
}

function isCssLengthNode(node) {
  const value = textOf(node);
  if (!value) return false;
  if (/^-?\d+(\.\d+)?(?:px|rem|em|%|vw|vh|vmin|vmax|ch|ex)?$/iu.test(value)) return true;
  return /^(?:clamp|min|max|calc)\(/iu.test(value);
}

function isFontWeightNode(node) {
  const value = textOf(node).toLowerCase();
  return /^(?:[1-9]00)$/u.test(value)
    || ['regular', 'normal', 'medium', 'semibold', 'semi-bold', 'bold', 'extrabold', 'extra-bold']
      .includes(value);
}

function isMediaOnlyNode(node) {
  return Boolean(
    node?.querySelector?.('picture, img')
      && !textOf(node)
      && !node.querySelector?.('p, ul, ol, table, h1, h2, h3, h4, h5, h6')?.textContent?.trim(),
  );
}

function isTextContentNode(node) {
  return Boolean(
    node
      && !isMediaOnlyNode(node)
      && (textOf(node) || node.querySelector?.('ul, ol, table, h1, h2, h3, h4, h5, h6')),
  );
}

function isColoredFieldConfigNode(node) {
  const token = tokenOf(node);
  return Boolean(
    isHexColorNode(node)
      || isCssLengthNode(node)
      || isFontWeightNode(node)
      || HORIZONTAL_ALIGNMENTS.includes(token)
      || VERTICAL_ALIGNMENTS.includes(token)
      || ['default', 'none', 'circle', 'underline'].includes(token)
      || token.startsWith('padding-')
      || token.startsWith('margin-')
      || token.startsWith('shadow-'),
  );
}

function isButtonConfigNode(node) {
  const token = tokenOf(node);
  return Boolean(
    isHexColorNode(node)
      || isCssLengthNode(node)
      || isFontWeightNode(node)
      || HORIZONTAL_ALIGNMENTS.includes(token)
      || VERTICAL_ALIGNMENTS.includes(token)
      || ['solid', 'outlined', 'inverted', 'yes', 'no', 'left', 'right', 'none', 'default'].includes(token)
      || token.startsWith('padding-')
      || token.startsWith('margin-')
      || token.startsWith('shadow-'),
  );
}

function isColoredHeadingStart(nodes, index) {
  return Boolean(
    isTextContentNode(nodes[index])
      && isToken(nodes[index + 1], HEADING_LEVELS)
      && isHexColorNode(nodes[index + 2]),
  );
}

function getButtonColorIndex(nodes, index) {
  if (!isTextContentNode(nodes[index])) return -1;
  if (isHexColorNode(nodes[index + 1]) && isHexColorNode(nodes[index + 2])) return index + 1;
  if (
    nodes[index + 1]
      && isHexColorNode(nodes[index + 2])
      && isHexColorNode(nodes[index + 3])
  ) return index + 2;
  return -1;
}

function isColoredButtonStart(nodes, index) {
  const colorIndex = getButtonColorIndex(nodes, index);
  if (colorIndex < 0) return false;
  return !nodes[colorIndex + 2] || isButtonConfigNode(nodes[colorIndex + 2]);
}

function isStatisticsStart(nodes, index) {
  if (!isToken(nodes[index], ['left', 'center', 'right'])) return false;
  if (!isToken(nodes[index + 1], VERTICAL_ALIGNMENTS)) return false;

  let cursor = index + 2;
  if (isMediaOnlyNode(nodes[cursor])) cursor += 1;

  return Boolean(
    isToken(nodes[cursor], ['icon', 'fluid'])
      && isToken(nodes[cursor + 1], ['_self', '_blank'])
      && isToken(nodes[cursor + 2], ['show', 'hide']),
  );
}

function makeFieldRow(content) {
  const row = document.createElement('div');
  const cell = document.createElement('div');
  const values = Array.isArray(content) ? content : [content];

  values.forEach((value) => {
    if (!value) return;
    if (typeof value === 'string') {
      if (value) cell.append(document.createTextNode(value));
    } else {
      cell.append(value);
    }
  });

  row.append(cell);
  return row;
}

function firstNodeInRows(rows) {
  return rows.flat().find((item) => item instanceof Node) || null;
}

function createSyntheticBlock(blockName, rows) {
  const block = document.createElement('div');
  block.className = blockName;
  const firstNode = firstNodeInRows(rows);
  if (firstNode) firstNode.before(block);
  rows.forEach((row) => block.append(makeFieldRow(row)));
  return block;
}

function consumeColoredHeading(nodes, index) {
  if (!isColoredHeadingStart(nodes, index)) return null;

  const rows = [
    [nodes[index]],
    [nodes[index + 1]],
    [nodes[index + 2]],
  ];
  let cursor = index + 3;

  while (
    cursor < nodes.length
      && !isColoredHeadingStart(nodes, cursor)
      && !isColoredButtonStart(nodes, cursor)
      && !isStatisticsStart(nodes, cursor)
      && isColoredFieldConfigNode(nodes[cursor])
  ) {
    rows.push([nodes[cursor]]);
    cursor += 1;
  }

  return { blockName: 'colored-heading', rows, endIndex: cursor };
}

function consumeColoredButton(nodes, index) {
  if (!isColoredButtonStart(nodes, index)) return null;

  const colorIndex = getButtonColorIndex(nodes, index);
  const rows = [
    [nodes[index]],
    colorIndex === index + 2 ? [nodes[index + 1]] : [''],
    [nodes[colorIndex]],
    [nodes[colorIndex + 1]],
  ];
  let cursor = colorIndex + 2;

  if (isHexColorNode(nodes[cursor])) {
    rows.push([nodes[cursor]]);
    cursor += 1;
  } else {
    rows.push(['']);
  }

  while (
    cursor < nodes.length
      && !isColoredHeadingStart(nodes, cursor)
      && !isStatisticsStart(nodes, cursor)
      && !isColoredButtonStart(nodes, cursor)
      && isButtonConfigNode(nodes[cursor])
  ) {
    rows.push([nodes[cursor]]);
    cursor += 1;
  }

  return { blockName: 'colored-button', rows, endIndex: cursor };
}

function consumeColoredText(nodes, index) {
  if (
    !isTextContentNode(nodes[index])
      || isColoredHeadingStart(nodes, index)
      || isColoredButtonStart(nodes, index)
  ) {
    return null;
  }

  const content = [];
  let cursor = index;
  while (
    cursor < nodes.length
      && isTextContentNode(nodes[cursor])
      && !isHexColorNode(nodes[cursor])
      && !isColoredHeadingStart(nodes, cursor)
      && !isColoredButtonStart(nodes, cursor)
      && !isStatisticsStart(nodes, cursor)
  ) {
    content.push(nodes[cursor]);
    cursor += 1;
  }

  if (!content.length || !isHexColorNode(nodes[cursor])) return null;

  const rows = [content, [nodes[cursor]]];
  cursor += 1;

  while (
    cursor < nodes.length
      && !isColoredHeadingStart(nodes, cursor)
      && !isColoredButtonStart(nodes, cursor)
      && !isStatisticsStart(nodes, cursor)
      && isColoredFieldConfigNode(nodes[cursor])
  ) {
    rows.push([nodes[cursor]]);
    cursor += 1;
  }

  return { blockName: 'colored-text', rows, endIndex: cursor };
}

function consumeStatistics(nodes, index) {
  if (!isStatisticsStart(nodes, index)) return null;

  const rows = Array.from({ length: 33 }, () => ['']);
  rows[1] = [nodes[index]];
  rows[2] = [nodes[index + 1]];

  let cursor = index + 2;
  if (isMediaOnlyNode(nodes[cursor])) {
    rows[4] = [nodes[cursor]];
    cursor += 1;
  }

  rows[5] = [nodes[cursor]];
  cursor += 1;
  rows[10] = isToken(nodes[cursor], ['_self', '_blank']) ? [nodes[cursor]] : ['_self'];
  if (isToken(nodes[cursor], ['_self', '_blank'])) cursor += 1;
  rows[11] = isToken(nodes[cursor], ['show', 'hide']) ? [nodes[cursor]] : ['show'];
  if (isToken(nodes[cursor], ['show', 'hide'])) cursor += 1;

  if (isHexColorNode(nodes[cursor])) {
    rows[19] = [nodes[cursor]];
    cursor += 1;
  }

  if (isCssLengthNode(nodes[cursor])) {
    rows[20] = [nodes[cursor]];
    cursor += 1;
  }

  if (!isTextContentNode(nodes[cursor]) || !isTextContentNode(nodes[cursor + 1])) return null;

  rows[27] = [nodes[cursor]];
  rows[28] = [nodes[cursor + 1]];

  return { blockName: 'statistics', rows, endIndex: cursor + 2 };
}

function consumeFlattenedNestedBlock(nodes, index) {
  return consumeStatistics(nodes, index)
    || consumeColoredHeading(nodes, index)
    || consumeColoredButton(nodes, index)
    || consumeColoredText(nodes, index);
}

async function decorateFlattenedColumnBlocks(block, columns) {
  if (block.querySelector('[data-aue-resource], [data-aue-prop], [data-richtext-prop]')) return;

  const syntheticBlocks = [];

  columns.forEach((column) => {
    if (column.querySelector(FLATTENED_NESTED_BLOCK_SELECTOR)) return;

    let children = [...column.children];
    let index = 0;
    while (index < children.length) {
      const result = consumeFlattenedNestedBlock(children, index);
      if (!result) {
        index += 1;
      } else {
        const syntheticBlock = createSyntheticBlock(result.blockName, result.rows);
        decorateBlock(syntheticBlock);
        syntheticBlocks.push(syntheticBlock);

        children = [...column.children];
        index = children.indexOf(syntheticBlock) + 1;
      }
    }
  });

  for (let index = 0; index < syntheticBlocks.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadBlock(syntheticBlocks[index]);
  }
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

  [...block.children].forEach((row) => {
    let isConfigRow = false;

    const vField = findOwnField(block, row, 'verticalAlign');
    if (vField) {
      verticalAlign = normalizeAlignment(vField.textContent, ['top', 'middle', 'bottom'], verticalAlign);
      isConfigRow = true;
    }

    const hField = findOwnField(block, row, 'horizontalAlign');
    if (hField) {
      horizontalAlign = normalizeAlignment(hField.textContent, ['left', 'center', 'right']);
      isConfigRow = true;
    }

    if (isConfigRow) {
      rowsToRemove.push(row);
      return;
    }

    if (row.children.length >= 2) {
      const key = row.children[0].textContent.trim().toLowerCase().replace(/[\s_-]+/g, '');
      if (['verticalalignment', 'alignment', 'align', 'verticalalign'].includes(key)) {
        verticalAlign = normalizeAlignment(row.children[1].textContent, ['top', 'middle', 'bottom'], verticalAlign);
        rowsToRemove.push(row);
      } else if (['horizontalalignment', 'horizontalalign', 'halign'].includes(key)) {
        horizontalAlign = normalizeAlignment(row.children[1].textContent, ['left', 'center', 'right']);
        rowsToRemove.push(row);
      }
    }
  });

  rowsToRemove.forEach((row) => row.remove());
  return { verticalAlign, horizontalAlign };
}

export default async function decorate(block) {
  const { verticalAlign, horizontalAlign } = readAlignment(block);

  const contentRow = [...block.children].find((row) => row.children.length);
  const cols = contentRow ? [...contentRow.children] : [];
  if (cols.length) {
    block.classList.add(`columns-${cols.length}-cols`);
  }

  if (['top', 'middle', 'bottom'].includes(verticalAlign)) {
    block.classList.add(`columns-align-${verticalAlign}`);
  }

  if (['left', 'center', 'right'].includes(horizontalAlign)) {
    block.classList.add(`columns-halign-${horizontalAlign}`);
  }

  // In UE, alignment values live in JCR not in DOM rows — fetch and apply them
  const blockResourcePath = resourcePathFromAueResource(
    block.getAttribute('data-aue-resource') || '',
  );
  if (blockResourcePath) {
    readAueResourceFields(blockResourcePath, ['verticalAlign', 'horizontalAlign'])
      .then((fields) => {
        const va = normalizeAlignment(fields.verticalAlign || '', ['top', 'middle', 'bottom'], '');
        const ha = normalizeAlignment(fields.horizontalAlign || '', ['left', 'center', 'right'], '');
        if (va) {
          ['top', 'middle', 'bottom'].forEach((v) => block.classList.remove(`columns-align-${v}`));
          block.classList.add(`columns-align-${va}`);
        }
        if (ha) {
          ['left', 'center', 'right'].forEach((v) => block.classList.remove(`columns-halign-${v}`));
          block.classList.add(`columns-halign-${ha}`);
        }
      });
  }

  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      decorateColumnBackground(col);
    });
  });

  await decorateFlattenedColumnBlocks(block, cols);

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
