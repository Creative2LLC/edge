/**
 * Recognising nested blocks on PUBLISHED pages.
 *
 * In Universal Editor a nested component carries `data-aue-resource` /
 * `data-aue-model`, so a container block can just read the name off the element.
 * Published pages carry none of that: the nested component arrives as a single
 * row whose cells are its model fields, flattened in field order, with empty
 * fields still emitting an empty cell.
 *
 * A container that doesn't recognise those rows falls through to its plain-item
 * path and renders whatever happens to sit in a fixed cell — which is how a
 * Statistics item turns into a text card reading "middle" (its verticalAlignment
 * cell) on live while looking perfect in the editor.
 *
 * The detectors below anchor on ADJACENT option pairs rather than absolute
 * indices, because pages published under an older model revision carry a
 * different number of leading cells and every absolute index shifts.
 */

export function directRows(scope) {
  return [...(scope?.querySelectorAll?.(':scope > div') || [])];
}

export function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-\d{4,}$/u, '')
    .replace(/^-|-$/g, '');
}

export function directRowText(row, index) {
  return (directRows(row)[index]?.textContent || '').trim();
}

export function isOptionAt(row, index, allowedValues) {
  return allowedValues.includes(normalizeToken(directRowText(row, index)));
}

const HORIZONTAL = ['left', 'center', 'right'];
const VERTICAL = ['top', 'middle', 'bottom'];

/**
 * Index of an adjacent horizontalAlign/verticalAlign pair near the start of a row.
 * Every nested block model puts these two side by side, and no two content fields
 * ever both hold pure alignment tokens, so the pair is a stable landmark.
 */
export function findAlignPairIndex(row, maxStart = 4) {
  const rows = directRows(row);
  return rows.findIndex((_, index) => (
    index >= 1
    && index <= maxStart
    && index + 1 < rows.length
    && isOptionAt(row, index, HORIZONTAL)
    && isOptionAt(row, index + 1, VERTICAL)
  ));
}

export function isConfigOnlyText(value) {
  const normalized = normalizeToken(value);
  const raw = String(value || '').trim();
  return [
    'left', 'center', 'right', 'justify', 'stretch',
    'top', 'middle', 'bottom', 'show', 'hide', 'icon', 'fluid',
    'self', 'blank', 'same-tab', 'new-tab',
    'solid', 'outlined', 'inverted', 'none', 'yes', 'no', 'true', 'false',
  ].includes(normalized)
    || /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)
    || /^-?\d+(\.\d+)?(?:px|em|rem|vh|vw|vmin|vmax|%)$/i.test(raw)
    || /^(?:[1-9]00)$/u.test(raw);
}

export function flattenedContentTexts(row) {
  return directRows(row)
    .map((child) => (child.textContent || '').trim())
    .filter((text) => text && !isConfigOnlyText(text));
}

/**
 * Statistics is the only nested model that pairs an alignment landmark with
 * several free-text cells of which at least one carries a numeral — that numeral
 * is the stat value itself, which is what the component exists to display.
 */
export function isFlattenedStatisticsItem(row) {
  const texts = flattenedContentTexts(row);
  return directRows(row).length >= 12
    && findAlignPairIndex(row) >= 1
    && texts.length >= 2
    && texts.some((text) => /\d/u.test(text));
}

/**
 * A row long enough to be a flattened component, but which no detector claimed.
 * Callers use this to skip the row rather than render one of its config cells as
 * visible content — a missing item is a far better failure than the word
 * "middle" rendered where a statistic should be.
 */
export function looksFlattenedComponent(row, minCells = 12) {
  const rows = directRows(row);
  if (rows.length < minCells) return false;
  const configCells = rows.filter((cell) => isConfigOnlyText(cell.textContent || '')).length;
  return configCells >= 3;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Field offsets measured from the horizontalAlign/verticalAlign pair, for the
 * published field order shared by colored-text and colored-heading.
 *
 * That order puts blockBackgroundColor immediately BEFORE the alignment pair
 * (right after textColor) and the typography/spacing run immediately after it. The
 * current model moved blockBackgroundColor down near dropShadow, which shifted
 * every field between it and the alignment pair by one. Reading those at current
 * model indices is what turned an authored `paddingStyle: bottom-md` into
 * `margin-bottom-md`, and an authored `fontWeight: 700` into `min-height: 700px`.
 */
export const ALIGN_ANCHORED_PUBLISHED_OFFSETS = {
  blockBackgroundColor: -1,
  fontSize: 2,
  fontWeight: 3,
  minHeight: 4,
  minHeightMobile: 5,
  paddingStyle: 6,
  marginStyle: 7,
  dropShadow: 8,
  markerTerms: 9,
  markerColor: 10,
  markerStyle: 11,
  // contentPaddingStyle post-dates the rest of the model, so on pages published at
  // that point it is APPENDED after markerStyle rather than sitting in model order.
  // Rows published before it exist simply run out of cells here, which reads as ''.
  contentPaddingStyle: 12,
};

/**
 * Resolve fields for a published colored-* block from its raw cell texts.
 *
 * Returns NULL unless the row genuinely carries the older published order — the
 * null/object distinction matters, because when the layout IS recognised its
 * answer has to win even for fields that resolve to an empty string. Falling back
 * to a current-model index on an empty result is what left `fontWeight: 700`
 * being read as `min-height: 700px`.
 *
 * The signature is a hex colour in one of the two cells before the alignment pair:
 * in the current order those hold fontSize and fontWeight, neither of which can
 * ever be a hex, so this can never fire on a current-order row.
 */
export function resolveAlignAnchoredFields(texts) {
  const isAlign = (v) => ['left', 'center', 'right', 'justify'].includes(String(v || '').trim().toLowerCase());
  const isVAlign = (v) => ['top', 'middle', 'bottom'].includes(String(v || '').trim().toLowerCase());

  // The pair sits at index 3 (colored-text) or 4 (colored-heading) in this layout,
  // never at 2. Requiring >= 3 is what keeps this off the synthetic blocks that
  // aem.js reconstructs from a flattened `columns` cell: those are built as
  // [text, textColor, hAlign, vAlign, fontSize], so their pair lands at 2 with a hex
  // directly before it. Treating that hex as blockBackgroundColor painted the block
  // in its own text colour — navy text on a navy card.
  const anchor = texts.findIndex((_, i) => i >= 3 && isAlign(texts[i]) && isVAlign(texts[i + 1]));
  if (anchor < 3) return null;

  // textColor sits two before the pair in this layout, so a hex THERE is the
  // signature. Checking anchor-1 as well would re-admit the synthetic rows above.
  if (!HEX_COLOR.test(String(texts[anchor - 2] || '').trim())) return null;

  return Object.entries(ALIGN_ANCHORED_PUBLISHED_OFFSETS).reduce((out, [name, offset]) => {
    out[name] = String(texts[anchor + offset] || '').trim();
    return out;
  }, {});
}
