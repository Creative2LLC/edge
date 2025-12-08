export default function decorate(block) {
  // read optional alignment control row (instrumented field or metadata key/value) and remove it
  let verticalAlign = 'top';
  let metadataRow = null;
  [...block.children].forEach((row) => {
    const alignField = row.querySelector('[data-aue-prop="verticalAlign"]');
    if (alignField) {
      verticalAlign = alignField.textContent.trim().toLowerCase() || verticalAlign;
      row.remove();
    } else if (
      row.children.length === 2
      && row.children[0].textContent.trim().toLowerCase() === 'vertical alignment'
    ) {
      verticalAlign = row.children[1].textContent.trim().toLowerCase() || verticalAlign;
      metadataRow = row;
    }
  });
  if (metadataRow) metadataRow.remove();

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
