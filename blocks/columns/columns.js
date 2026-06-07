function normalizeAlignment(value, allowedValues, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '');

  return allowedValues.find((allowedValue) => normalized.includes(allowedValue)) || fallback;
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

function findOwnField(block, row, name) {
  const selector = `[data-aue-prop="${name}"]`;
  const candidates = [
    ...(row.matches(selector) ? [row] : []),
    ...row.querySelectorAll(selector),
  ];

  return candidates
    .find((field) => !isNestedComponentField(block, field)) || null;
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

export default function decorate(block) {
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
