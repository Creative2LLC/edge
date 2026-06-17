import { readAueResourceFields } from './block-field-utils.js';

const SPACING_OPTIONS = [
  'default',
  'none',
  'all-sm',
  'all-md',
  'all-lg',
  'vertical-sm',
  'vertical-md',
  'vertical-lg',
  'horizontal-sm',
  'horizontal-md',
  'horizontal-lg',
  'top-sm',
  'top-md',
  'top-lg',
  'bottom-sm',
  'bottom-md',
  'bottom-lg',
];

const SHADOW_OPTIONS = ['none', 'small', 'medium', 'large'];
const LAYOUT_FIELD_NAMES = ['paddingStyle', 'marginStyle', 'dropShadow', 'layoutOptions'];
const LAYOUT_OPTION_PATTERN = new RegExp(
  [
    `(?:padding|margin)-(?:${SPACING_OPTIONS.join('|')})`,
    `shadow-(?:${SHADOW_OPTIONS.join('|')})`,
  ].join('|'),
  'gu',
);

function normalizeOption(value, allowedValues, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return allowedValues.includes(normalized) ? normalized : fallback;
}

function removeLayoutClasses(block, blockName) {
  [
    ...SPACING_OPTIONS.map((value) => `${blockName}-padding-${value}`),
    ...SPACING_OPTIONS.map((value) => `${blockName}-margin-${value}`),
    ...SHADOW_OPTIONS.map((value) => `${blockName}-shadow-${value}`),
  ].forEach((className) => block.classList.remove(className));
}

function parseLayoutOptions(value) {
  const rawValue = String(value || '').toLowerCase();
  const matchedOptions = rawValue.match(LAYOUT_OPTION_PATTERN);
  const options = matchedOptions || rawValue
    .split(/[\n,]+/u)
    .map((option) => normalizeOption(option, [
      ...SPACING_OPTIONS.map((item) => `padding-${item}`),
      ...SPACING_OPTIONS.map((item) => `margin-${item}`),
      ...SHADOW_OPTIONS.map((item) => `shadow-${item}`),
    ], ''))
    .filter(Boolean);

  return options
    .reduce((fields, option) => {
      if (option.startsWith('padding-')) {
        return { ...fields, paddingStyle: option.replace(/^padding-/u, '') };
      }
      if (option.startsWith('margin-')) {
        return { ...fields, marginStyle: option.replace(/^margin-/u, '') };
      }
      if (option.startsWith('shadow-')) {
        return { ...fields, dropShadow: option.replace(/^shadow-/u, '') };
      }
      return fields;
    }, {});
}

export function applyColoredFieldLayoutOptions(block, blockName, fields = {}) {
  const parsedFields = parseLayoutOptions(fields.layoutOptions);
  const paddingStyle = normalizeOption(
    fields.paddingStyle || parsedFields.paddingStyle,
    SPACING_OPTIONS,
    'default',
  );
  const marginStyle = normalizeOption(
    fields.marginStyle || parsedFields.marginStyle,
    SPACING_OPTIONS,
    'default',
  );
  const dropShadow = normalizeOption(
    fields.dropShadow || parsedFields.dropShadow,
    SHADOW_OPTIONS,
    'none',
  );

  removeLayoutClasses(block, blockName);
  if (paddingStyle !== 'default') block.classList.add(`${blockName}-padding-${paddingStyle}`);
  if (marginStyle !== 'default') block.classList.add(`${blockName}-margin-${marginStyle}`);
  if (dropShadow !== 'none') block.classList.add(`${blockName}-shadow-${dropShadow}`);
}

export function syncColoredFieldLayoutOptions(resourcePath, block, blockName) {
  readAueResourceFields(resourcePath, LAYOUT_FIELD_NAMES)
    .then((fields) => {
      if (Object.keys(fields).length) {
        applyColoredFieldLayoutOptions(block, blockName, fields);
      }
    });
}
