const BLOCK_FIELD_NAMES = [
  'backgroundColor',
  'textColor',
  'padding',
  'rowGap',
  'borderRadius',
  'maxWidth',
  'minHeight',
  'verticalAlign',
];

const ROW_FIELD_NAMES = [
  'columns',
  'backgroundColor',
  'textColor',
  'padding',
  'gap',
  'borderRadius',
  'minHeight',
  'horizontalAlign',
  'verticalAlign',
];

const AUTHORING_BOUNDARY_SELECTOR = [
  '[data-aue-model]',
  '[data-aue-filter]',
  '[data-aue-label]',
  '[data-aue-type="component"]',
  '[data-aue-behavior="component"]',
].join(', ');

const COLORED_GRID_ROW_SELECTOR = [
  '[data-aue-model="colored-grid-row"]',
  '[data-aue-filter="colored-grid-row"]',
  '[data-aue-label="Colored Grid Row"]',
].join(', ');

function fieldSelector(names) {
  return (Array.isArray(names) ? names : [names])
    .map((name) => `[data-aue-prop="${name}"], [data-richtext-prop="${name}"]`)
    .join(', ');
}

function normalizeLabel(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function directChildOf(scope, element) {
  let row = element;
  while (row && row.parentElement !== scope) {
    row = row.parentElement;
  }
  return row && row.parentElement === scope ? row : null;
}

function isNestedComponentField(scope, field) {
  const scopeResource = scope.getAttribute?.('data-aue-resource') || '';
  const fieldResource = field.getAttribute?.('data-aue-resource') || '';

  if (scopeResource && fieldResource && fieldResource !== scopeResource) {
    return true;
  }

  const owningComponent = field.parentElement?.closest(AUTHORING_BOUNDARY_SELECTOR);

  return Boolean(
    owningComponent
      && owningComponent !== scope
      && scope.contains(owningComponent),
  );
}

function findOwnField(scope, name) {
  const selector = fieldSelector(name);
  const candidates = [
    ...(scope.matches?.(selector) ? [scope] : []),
    ...scope.querySelectorAll(selector),
  ];

  return candidates
    .find((field) => !isNestedComponentField(scope, field)) || null;
}

function findFallbackCell(scope, labels = []) {
  const accepted = labels.map(normalizeLabel);
  if (!accepted.length) return null;

  const row = [...scope.querySelectorAll(':scope > div')]
    .find((candidate) => (
      candidate.children.length >= 2
        && accepted.includes(normalizeLabel(candidate.children[0].textContent))
    ));

  return row?.children?.[1] || null;
}

function cleanupFieldRow(scope, field, isEditor) {
  const row = field?.cell ? directChildOf(scope, field.cell) : null;
  if (!row || row === scope) return;

  if (isEditor && field.source) {
    row.hidden = true;
    return;
  }

  row.remove();
}

function readOwnField(scope, name, labels = [], isEditor = false) {
  const generatedLabel = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  const source = findOwnField(scope, name);
  const cell = source || findFallbackCell(scope, [generatedLabel, ...labels]);
  const field = {
    source,
    cell,
    value: cell?.textContent?.trim() || '',
  };

  cleanupFieldRow(scope, field, isEditor);
  return field;
}

function cleanupOwnFieldRows(scope, names, isEditor) {
  const rows = new Set();

  names.forEach((name) => {
    [...scope.querySelectorAll(fieldSelector(name))]
      .filter((field) => !isNestedComponentField(scope, field))
      .forEach((field) => {
        const row = directChildOf(scope, field);
        if (row && row !== scope) rows.add(row);
      });
  });

  rows.forEach((row) => {
    if (isEditor && row.querySelector(fieldSelector(names))) {
      row.hidden = true;
      return;
    }

    row.remove();
  });
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  return hexMatch ? hexMatch[0] : normalized;
}

function normalizeCssValue(value, propertyName) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^-?\d+(\.\d+)?$/u.test(normalized)) return `${normalized}px`;
  if (!window.CSS?.supports || window.CSS.supports(propertyName, normalized)) return normalized;
  return '';
}

function normalizeOption(value, allowedValues, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return allowedValues.includes(normalized) ? normalized : fallback;
}

function normalizeColumns(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(Math.max(parsed, 1), 6);
}

function setCssVar(element, name, value) {
  if (value) {
    element.style.setProperty(name, value);
    return;
  }

  element.style.removeProperty(name);
}

function setPrefixedClass(element, prefix, value) {
  [...element.classList]
    .filter((className) => className.startsWith(prefix))
    .forEach((className) => element.classList.remove(className));

  if (value) element.classList.add(`${prefix}${value}`);
}

function setBlockBackground(block, value) {
  const backgroundColor = normalizeColorValue(value);
  block.classList.toggle('has-colored-grid-background', Boolean(backgroundColor));
  setCssVar(block, '--colored-grid-bg', backgroundColor);
}

function setRowBackground(row, value) {
  const backgroundColor = normalizeColorValue(value);
  row.classList.toggle('has-colored-grid-row-background', Boolean(backgroundColor));
  setCssVar(row, '--colored-grid-row-bg', backgroundColor);
}

function watchField(source, callback) {
  if (!source) return;

  new MutationObserver(() => callback(source.textContent?.trim() || ''))
    .observe(source, { childList: true, characterData: true, subtree: true });
}

function applyBlockStyles(block, isEditor) {
  const fields = {
    backgroundColor: readOwnField(
      block,
      'backgroundColor',
      ['background color', 'block background color'],
      isEditor,
    ),
    textColor: readOwnField(block, 'textColor', ['text color'], isEditor),
    padding: readOwnField(block, 'padding', ['block padding'], isEditor),
    rowGap: readOwnField(block, 'rowGap', ['row gap'], isEditor),
    borderRadius: readOwnField(block, 'borderRadius', ['border radius'], isEditor),
    maxWidth: readOwnField(block, 'maxWidth', ['max width'], isEditor),
    minHeight: readOwnField(block, 'minHeight', ['minimum height'], isEditor),
    verticalAlign: readOwnField(block, 'verticalAlign', ['vertical alignment'], isEditor),
  };
  const backgroundColor = normalizeColorValue(
    fields.backgroundColor.value,
  );
  const textColor = normalizeColorValue(fields.textColor.value);
  const padding = normalizeCssValue(fields.padding.value, 'padding');
  const rowGap = normalizeCssValue(fields.rowGap.value, 'gap');
  const borderRadius = normalizeCssValue(
    fields.borderRadius.value,
    'border-radius',
  );
  const maxWidth = normalizeCssValue(fields.maxWidth.value, 'max-width');
  const minHeight = normalizeCssValue(fields.minHeight.value, 'min-height');
  const verticalAlign = normalizeOption(
    fields.verticalAlign.value,
    ['top', 'middle', 'bottom'],
    'top',
  );

  setPrefixedClass(block, 'colored-grid-v-', verticalAlign);
  setBlockBackground(block, backgroundColor);
  setCssVar(block, '--colored-grid-text', textColor);
  setCssVar(block, '--colored-grid-padding', padding);
  setCssVar(block, '--colored-grid-rows-gap', rowGap);
  setCssVar(block, '--colored-grid-radius', borderRadius);
  setCssVar(block, '--colored-grid-max-width', maxWidth);
  setCssVar(block, '--colored-grid-min-height', minHeight);

  if (isEditor) {
    watchField(fields.backgroundColor.source, (value) => setBlockBackground(block, value));
    watchField(fields.textColor.source, (value) => setCssVar(block, '--colored-grid-text', normalizeColorValue(value)));
    watchField(fields.padding.source, (value) => setCssVar(block, '--colored-grid-padding', normalizeCssValue(value, 'padding')));
    watchField(fields.rowGap.source, (value) => setCssVar(block, '--colored-grid-rows-gap', normalizeCssValue(value, 'gap')));
    watchField(fields.borderRadius.source, (value) => setCssVar(block, '--colored-grid-radius', normalizeCssValue(value, 'border-radius')));
    watchField(fields.maxWidth.source, (value) => setCssVar(block, '--colored-grid-max-width', normalizeCssValue(value, 'max-width')));
    watchField(fields.minHeight.source, (value) => setCssVar(block, '--colored-grid-min-height', normalizeCssValue(value, 'min-height')));
    watchField(fields.verticalAlign.source, (value) => setPrefixedClass(
      block,
      'colored-grid-v-',
      normalizeOption(value, ['top', 'middle', 'bottom'], 'top'),
    ));
  }
}

function applyRowStyles(row, isEditor) {
  const fields = {
    columns: readOwnField(row, 'columns', [], isEditor),
    backgroundColor: readOwnField(row, 'backgroundColor', ['row background color'], isEditor),
    textColor: readOwnField(row, 'textColor', ['row text color'], isEditor),
    padding: readOwnField(row, 'padding', ['row padding'], isEditor),
    gap: readOwnField(row, 'gap', ['column gap'], isEditor),
    borderRadius: readOwnField(row, 'borderRadius', ['row border radius'], isEditor),
    minHeight: readOwnField(row, 'minHeight', ['row minimum height'], isEditor),
    horizontalAlign: readOwnField(row, 'horizontalAlign', ['row horizontal alignment'], isEditor),
    verticalAlign: readOwnField(row, 'verticalAlign', ['row vertical alignment'], isEditor),
  };
  const columns = normalizeColumns(fields.columns.value);
  const backgroundColor = normalizeColorValue(fields.backgroundColor.value);
  const textColor = normalizeColorValue(fields.textColor.value);
  const padding = normalizeCssValue(fields.padding.value, 'padding');
  const gap = normalizeCssValue(fields.gap.value, 'gap');
  const borderRadius = normalizeCssValue(
    fields.borderRadius.value,
    'border-radius',
  );
  const minHeight = normalizeCssValue(fields.minHeight.value, 'min-height');
  const horizontalAlign = normalizeOption(
    fields.horizontalAlign.value,
    ['stretch', 'left', 'center', 'right'],
    'stretch',
  );
  const verticalAlign = normalizeOption(
    fields.verticalAlign.value,
    ['stretch', 'top', 'middle', 'bottom'],
    'stretch',
  );

  row.classList.add('colored-grid-row');
  setPrefixedClass(row, 'colored-grid-row-h-', horizontalAlign);
  setPrefixedClass(row, 'colored-grid-row-v-', verticalAlign);

  row.style.setProperty('--colored-grid-row-columns', columns);
  setRowBackground(row, backgroundColor);
  setCssVar(row, '--colored-grid-row-text', textColor);
  setCssVar(row, '--colored-grid-row-padding', padding);
  setCssVar(row, '--colored-grid-row-gap', gap);
  setCssVar(row, '--colored-grid-row-radius', borderRadius);
  setCssVar(row, '--colored-grid-row-min-height', minHeight);

  if (isEditor) {
    watchField(fields.columns.source, (value) => row.style.setProperty('--colored-grid-row-columns', normalizeColumns(value)));
    watchField(fields.backgroundColor.source, (value) => setRowBackground(row, value));
    watchField(fields.textColor.source, (value) => setCssVar(row, '--colored-grid-row-text', normalizeColorValue(value)));
    watchField(fields.padding.source, (value) => setCssVar(row, '--colored-grid-row-padding', normalizeCssValue(value, 'padding')));
    watchField(fields.gap.source, (value) => setCssVar(row, '--colored-grid-row-gap', normalizeCssValue(value, 'gap')));
    watchField(fields.borderRadius.source, (value) => setCssVar(row, '--colored-grid-row-radius', normalizeCssValue(value, 'border-radius')));
    watchField(fields.minHeight.source, (value) => setCssVar(row, '--colored-grid-row-min-height', normalizeCssValue(value, 'min-height')));
    watchField(fields.horizontalAlign.source, (value) => setPrefixedClass(
      row,
      'colored-grid-row-h-',
      normalizeOption(value, ['stretch', 'left', 'center', 'right'], 'stretch'),
    ));
    watchField(fields.verticalAlign.source, (value) => setPrefixedClass(
      row,
      'colored-grid-row-v-',
      normalizeOption(value, ['stretch', 'top', 'middle', 'bottom'], 'stretch'),
    ));
  }
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope.getAttribute?.('data-aue-resource')
      || scope.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

function visibleChildCount(element) {
  return [...element.children]
    .filter((child) => (
      !child.hidden
        && child.style.display !== 'none'
        && !child.classList.contains('colored-grid-row-empty')
    ))
    .length;
}

function isColoredGridRow(row) {
  if (!row || row.hidden || row.classList?.contains('colored-grid-field-archive')) return false;
  if (row.matches?.(COLORED_GRID_ROW_SELECTOR) || row.classList?.contains('colored-grid-row')) return true;
  return row.children.length > 0;
}

function preserveRowAddTarget(row) {
  if (!hasAuthoringContext(row)) return;
  if (!row.getAttribute('data-aue-filter')) row.setAttribute('data-aue-filter', 'colored-grid-row');
  if (!row.getAttribute('data-aue-label')) row.setAttribute('data-aue-label', 'Colored Grid Row');
}

function removeGeneratedPlaceholders(scope) {
  scope.querySelectorAll(':scope > .colored-grid-row-empty, :scope > .colored-grid-empty')
    .forEach((placeholder) => placeholder.remove());
}

function archiveHiddenFieldRows(block, inner, isEditor) {
  if (!isEditor) return;

  const archive = document.createElement('span');
  archive.className = 'colored-grid-field-archive';
  archive.hidden = true;

  [...block.querySelectorAll(':scope > div[hidden]')]
    .forEach((row) => archive.append(row));

  if (archive.children.length) inner.append(archive);
}

export default function decorate(block) {
  const isEditor = Boolean(document.querySelector('[data-aue-resource]'));

  removeGeneratedPlaceholders(block);
  applyBlockStyles(block, isEditor);
  cleanupOwnFieldRows(block, BLOCK_FIELD_NAMES, isEditor);

  const inner = document.createElement('div');
  inner.className = 'colored-grid-inner';

  let appendedRows = 0;

  [...block.children]
    .filter(isColoredGridRow)
    .forEach((row) => {
      removeGeneratedPlaceholders(row);
      preserveRowAddTarget(row);
      applyRowStyles(row, isEditor);
      cleanupOwnFieldRows(row, ROW_FIELD_NAMES, isEditor);

      if (!visibleChildCount(row) && hasAuthoringContext(row)) {
        const placeholder = document.createElement('div');
        placeholder.className = 'colored-grid-row-empty';
        placeholder.textContent = 'Add content blocks to this row.';
        row.append(placeholder);
      }

      if (visibleChildCount(row)) {
        inner.append(row);
        appendedRows += 1;
      }
    });

  archiveHiddenFieldRows(block, inner, isEditor);

  if (!appendedRows && hasAuthoringContext(block)) {
    const placeholder = document.createElement('div');
    placeholder.className = 'colored-grid-empty';
    placeholder.textContent = 'Add colored grid rows in the editor.';
    inner.append(placeholder);
  }

  block.replaceChildren(inner);
}
