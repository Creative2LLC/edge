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

  const owningComponent = field.parentElement?.closest(
    '[data-aue-resource][data-aue-type="component"], [data-aue-resource][data-aue-behavior="component"]',
  );

  return Boolean(
    owningComponent
      && owningComponent !== scope
      && (!scopeResource || owningComponent.getAttribute('data-aue-resource') !== scopeResource),
  );
}

function findOwnField(scope, name) {
  return [...scope.querySelectorAll(fieldSelector(name))]
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

function readOwnField(scope, name, labels = []) {
  const generatedLabel = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  const source = findOwnField(scope, name);
  const cell = source || findFallbackCell(scope, [generatedLabel, ...labels]);
  const row = cell ? directChildOf(scope, cell) : null;

  if (row && row !== scope) row.remove();

  return {
    source,
    cell,
    value: cell?.textContent?.trim() || '',
  };
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
  if (value) element.style.setProperty(name, value);
}

function applyBlockStyles(block) {
  const backgroundColor = normalizeColorValue(
    readOwnField(block, 'backgroundColor', ['background color', 'block background color']).value,
  );
  const textColor = normalizeColorValue(readOwnField(block, 'textColor', ['text color']).value);
  const padding = normalizeCssValue(readOwnField(block, 'padding', ['block padding']).value, 'padding');
  const rowGap = normalizeCssValue(readOwnField(block, 'rowGap', ['row gap']).value, 'gap');
  const borderRadius = normalizeCssValue(
    readOwnField(block, 'borderRadius', ['border radius']).value,
    'border-radius',
  );
  const maxWidth = normalizeCssValue(readOwnField(block, 'maxWidth', ['max width']).value, 'max-width');
  const minHeight = normalizeCssValue(readOwnField(block, 'minHeight', ['minimum height']).value, 'min-height');
  const verticalAlign = normalizeOption(
    readOwnField(block, 'verticalAlign', ['vertical alignment']).value,
    ['top', 'middle', 'bottom'],
    'top',
  );

  block.classList.add(`colored-grid-v-${verticalAlign}`);
  if (backgroundColor) block.classList.add('has-colored-grid-background');
  setCssVar(block, '--colored-grid-bg', backgroundColor);
  setCssVar(block, '--colored-grid-text', textColor);
  setCssVar(block, '--colored-grid-padding', padding);
  setCssVar(block, '--colored-grid-rows-gap', rowGap);
  setCssVar(block, '--colored-grid-radius', borderRadius);
  setCssVar(block, '--colored-grid-max-width', maxWidth);
  setCssVar(block, '--colored-grid-min-height', minHeight);
}

function applyRowStyles(row) {
  const columns = normalizeColumns(readOwnField(row, 'columns').value);
  const backgroundColor = normalizeColorValue(readOwnField(row, 'backgroundColor', ['row background color']).value);
  const textColor = normalizeColorValue(readOwnField(row, 'textColor', ['row text color']).value);
  const padding = normalizeCssValue(readOwnField(row, 'padding', ['row padding']).value, 'padding');
  const gap = normalizeCssValue(readOwnField(row, 'gap', ['column gap']).value, 'gap');
  const borderRadius = normalizeCssValue(
    readOwnField(row, 'borderRadius', ['row border radius']).value,
    'border-radius',
  );
  const minHeight = normalizeCssValue(readOwnField(row, 'minHeight', ['row minimum height']).value, 'min-height');
  const horizontalAlign = normalizeOption(
    readOwnField(row, 'horizontalAlign', ['row horizontal alignment']).value,
    ['stretch', 'left', 'center', 'right'],
    'stretch',
  );
  const verticalAlign = normalizeOption(
    readOwnField(row, 'verticalAlign', ['row vertical alignment']).value,
    ['stretch', 'top', 'middle', 'bottom'],
    'stretch',
  );

  row.classList.add(
    'colored-grid-row',
    `colored-grid-row-h-${horizontalAlign}`,
    `colored-grid-row-v-${verticalAlign}`,
  );

  row.style.setProperty('--colored-grid-row-columns', columns);
  if (backgroundColor) row.classList.add('has-colored-grid-row-background');
  setCssVar(row, '--colored-grid-row-bg', backgroundColor);
  setCssVar(row, '--colored-grid-row-text', textColor);
  setCssVar(row, '--colored-grid-row-padding', padding);
  setCssVar(row, '--colored-grid-row-gap', gap);
  setCssVar(row, '--colored-grid-row-radius', borderRadius);
  setCssVar(row, '--colored-grid-row-min-height', minHeight);
}

function hasAuthoringContext(scope) {
  return Boolean(
    scope.getAttribute?.('data-aue-resource')
      || scope.querySelector?.('[data-aue-resource], [data-aue-prop], [data-richtext-prop]'),
  );
}

export default function decorate(block) {
  applyBlockStyles(block);

  const inner = document.createElement('div');
  inner.className = 'colored-grid-inner';

  [...block.children]
    .forEach((row) => {
      applyRowStyles(row);

      if (!row.children.length && hasAuthoringContext(row)) {
        const placeholder = document.createElement('div');
        placeholder.className = 'colored-grid-row-empty';
        placeholder.textContent = 'Add content blocks to this row.';
        row.append(placeholder);
      }

      if (row.children.length) {
        inner.append(row);
      }
    });

  if (!inner.children.length && hasAuthoringContext(block)) {
    const placeholder = document.createElement('div');
    placeholder.className = 'colored-grid-empty';
    placeholder.textContent = 'Add colored grid rows in the editor.';
    inner.append(placeholder);
  }

  block.replaceChildren(inner);
}
