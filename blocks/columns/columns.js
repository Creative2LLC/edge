function readAlignment(block) {
  let verticalAlign = 'top';
  const rowsToRemove = [];

  [...block.children].forEach((row) => {
    const alignField = row.querySelector('[data-aue-prop="verticalAlign"]');
    if (alignField) {
      verticalAlign = alignField.textContent.trim().toLowerCase() || verticalAlign;
      rowsToRemove.push(row);
      return;
    }

    if (row.children.length >= 2) {
      const key = row.children[0].textContent.trim().toLowerCase().replace(/[\s_-]+/g, '');
      if (['verticalalignment', 'alignment', 'align', 'verticalalign'].includes(key)) {
        verticalAlign = row.children[1].textContent.trim().toLowerCase() || verticalAlign;
        rowsToRemove.push(row);
      }
    }
  });

  rowsToRemove.forEach((row) => row.remove());
  return verticalAlign;
}

export default function decorate(block) {
  const verticalAlign = readAlignment(block);

  const contentRow = [...block.children].find((row) => row.children.length);
  const cols = contentRow ? [...contentRow.children] : [];
  if (cols.length) {
    block.classList.add(`columns-${cols.length}-cols`);
  }

  if (['top', 'middle', 'bottom'].includes(verticalAlign)) {
    block.classList.add(`columns-align-${verticalAlign}`);
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
