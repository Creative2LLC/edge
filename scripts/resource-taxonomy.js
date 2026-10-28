/**
 * Resource tag labels for the resource blocks, backed by the generated
 * resource-taxonomy-data.js (the backend enums are the source of truth; run
 * `npm run build:taxonomy` after changing them).
 *
 * One stored value can read differently per library: "families" is
 * "Parents/Guardians" on Prevention and "Families" on General. Pass the
 * resource's section (or let resourceSection() infer it) to get the right one.
 */
import TAXONOMY from './resource-taxonomy-data.js';

export const SECTIONS = ['prevention', 'general'];

// Block field names -> backend taxonomy fields.
const FIELD_ALIASES = {
  audience: 'audience',
  issue: 'issue',
  resourceType: 'resource_type',
  resource_type: 'resource_type',
  type: 'resource_type',
  programs: 'programs',
  language: 'language',
  length: 'length',
  lengths: 'length',
};

// Grade bands became Prevention audiences; the legacy gradeAges field keeps
// recognising exactly these, so it never claims an ordinary audience cell.
const LEGACY_GRADE_VALUES = ['k-2', '3-5', 'middle-school', 'high-school'];

function entriesFor(group) {
  if (group === 'gradeAges' || group === 'grade_ages') {
    return (TAXONOMY.fields.audience || [])
      .filter((entry) => LEGACY_GRADE_VALUES.includes(entry.value));
  }
  return TAXONOMY.fields[FIELD_ALIASES[group]] || [];
}

function splitValues(value) {
  if (Array.isArray(value)) return value;
  return `${value || ''}`.split(/[,;|]/);
}

/** A resource's library: explicit when known, else program-tagged means Prevention. */
export function resourceSection({ section, programs } = {}) {
  const explicit = `${section || ''}`.trim().toLowerCase();
  if (SECTIONS.includes(explicit)) return explicit;
  return splitValues(programs).some((program) => `${program}`.trim()) ? 'prevention' : 'general';
}

/** value -> label for a group, in one library's wording (every known value, retired included). */
export function taxonomyLabelMap(group, section = '') {
  return Object.fromEntries(entriesFor(group).map((entry) => [
    entry.value,
    entry.labels?.[section] || entry.label,
  ]));
}

export function taxonomyLabel(group, value, section = '') {
  return taxonomyLabelMap(group, section)[`${value || ''}`.trim()] || '';
}

/** Filter headings a library's page uses ({ issues: 'Teachable Topic', ... }). */
export function facetLabels(section) {
  return TAXONOMY.sections?.[section]?.facet_labels || {};
}

export function sectionGroupLabel(section) {
  return TAXONOMY.sections?.[section]?.group_label || '';
}
