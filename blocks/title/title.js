function readAlignment(block) {
  let alignment = 'left';
  const rowsToRemove = [];

  [...block.children].forEach((row) => {
    // Check for AUE-instrumented field (Universal Editor authoring)
    const alignField = row.querySelector('[data-aue-prop="titleAlignment"]');
    if (alignField) {
      alignment = alignField.textContent.trim().toLowerCase() || alignment;
      rowsToRemove.push(row);
      return;
    }

    // Fallback for published HTML (key-value row pairs)
    if (row.children.length >= 2) {
      const key = row.children[0].textContent.trim().toLowerCase().replace(/[\s_-]+/g, '');
      if (['alignment', 'titlealignment', 'textalign'].includes(key)) {
        alignment = row.children[1].textContent.trim().toLowerCase() || alignment;
        rowsToRemove.push(row);
      }
    }
  });

  rowsToRemove.forEach((row) => row.remove());
  return alignment;
}

export default function decorate(block) {
  const alignment = readAlignment(block);

  if (['left', 'center', 'right'].includes(alignment)) {
    const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      heading.classList.add(`text-align-${alignment}`);
    }
  }
}
