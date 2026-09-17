/*
 * Brand colour palette: the single source of truth for every colour dropdown in a block
 * model, and for the runtime remap of colours stored on already-published pages.
 *
 * A published page keeps the hex its author picked, frozen into the page markup, so
 * swapping a model's options changes nothing live on its own. remapLegacyColors() rewrites
 * the old palette's values to their successors before any block reads them, following the
 * client's mapping sheet (2026-09-16). The CSS mirror is the --ncmec-* tokens in
 * styles/styles.css; `npm run lint:palette` keeps both, and every model, in step.
 */

/** The 19 swatches, in design-sheet order. */
export const PALETTE = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Navy Dark', hex: '#00264D' },
  { name: 'Navy Medium', hex: '#004B76' },
  { name: 'Blue Dark', hex: '#006D90' },
  { name: 'Blue Medium', hex: '#008EB7' },
  { name: 'Blue Light', hex: '#92D6E3' },
  { name: 'Gray Dark', hex: '#414042' },
  { name: 'Gray Medium', hex: '#939598' },
  { name: 'Gray Light', hex: '#C7C8CA' },
  { name: 'Gray Lightest', hex: '#F1F2F2' },
  { name: 'Yellow', hex: '#FDB913' },
  { name: 'Yellow Dark', hex: '#F7941D' },
  { name: 'Red', hex: '#AE1B1F', note: 'urgent only' },
  { name: 'Peach Dark', hex: '#F26D5F' },
  { name: 'Peach Medium', hex: '#F8AC99' },
  { name: 'Beige Dark', hex: '#FAAB60' },
  { name: 'Beige Medium', hex: '#FDCFA3' },
  { name: 'Green Medium', hex: '#5ABB64' },
  { name: 'Green Light', hex: '#A2D4A3' },
];

/* Site surface steps: the rungs the palette lacks between its own neutrals. The site layers
   surfaces (a card on a section on the page), and those layers only read if neighbouring
   colours stay apart, so dozens of stray greys, warm tints, pale blues and navys were
   condensed onto these few steps instead of onto the nearest swatch (2026-09-16). */
export const SITE_NEUTRALS = [
  { name: 'Warm Off-White', hex: '#F4F1EC' },
  { name: 'Warm Gray', hex: '#ECE8E3' },
  { name: 'Blue Tint', hex: '#E9F7FA' },
  { name: 'Navy Raised', hex: '#0F3357' },
];
const byName = (name) => [...PALETTE, ...SITE_NEUTRALS].find((swatch) => swatch.name === name);

/* The light site steps. Every background and card-background dropdown offers them after
   Gray Lightest, and blocks that wash a picked colour to a tint paint these solid. */
export const LIGHT_SURFACES = ['Warm Off-White', 'Warm Gray', 'Blue Tint'].map(byName);

/* The surface ladder, lightest to darkest. Neighbouring surfaces on a page are drawn from
   these, so lint:palette checks every pair within a ladder stays visibly apart. */
export const SURFACE_LADDER = {
  light: ['White', 'Warm Off-White', 'Gray Lightest', 'Blue Tint', 'Warm Gray', 'Gray Light'].map(byName),
  dark: ['Navy Medium', 'Navy Raised', 'Navy Dark'].map(byName),
};

/* What a section's Background Color dropdown offers. lint:palette requires exactly this list. */
export const SECTION_BACKGROUNDS = [
  'White', 'Gray Lightest', 'Warm Off-White', 'Warm Gray', 'Blue Tint', 'Gray Light', 'Gray Medium',
  'Gray Dark', 'Navy Medium', 'Navy Raised', 'Navy Dark',
].map(byName);

/* The swatches that pass WCAG AA (4.5:1) as body text on every surface of one family:
   the light surfaces (White, Gray Lightest) or the dark ones (Navy Dark, Navy Medium,
   Blue Dark, Gray Dark). Text-colour dropdowns offer only these; the other twelve are
   for backgrounds, icons, markers and charts. */
export const TEXT_COLORS = ['#FFFFFF', '#00264D', '#004B76', '#006D90', '#414042', '#F1F2F2', '#AE1B1F'];

/* Old value → successor. The first block is the client's mapping sheet (plus the near-
   identical brand blue and yellows); the second is hand-typed near-misses of those colours
   found on published pages (2026-09-16 scan). */
const LEGACY_COLORS = {
  '#007294': '#006D90',
  '#008DB6': '#008EB7',
  '#404041': '#414042',
  '#0D273B': '#004B76',
  '#A1A1A1': '#939598',
  '#E07E27': '#F7941D',
  '#FCBC7E': '#FAAB60',
  // The sheet names Green Dark, but that is the Donate button's colour alone; every
  // published use of this green is an icon or accent.
  '#7BC581': '#5ABB64',
  '#E13E30': '#AE1B1F',
  '#F58A80': '#F26D5F',
  '#F6F6F6': '#F1F2F2',
  '#E7E4E1': '#C7C8CA',
  '#DDD5CC': '#ECE8E3',
  '#FECF5D': '#FDB913',
  '#FFB81C': '#FDB913',
  '#C5EAF2': '#92D6E3',

  '#008EB6': '#008EB7',
  '#0F94BF': '#008EB7',
  '#039AB5': '#008EB7',
  '#FAAD67': '#FAAB60',
  '#F7941C': '#F7941D',
  '#F4961C': '#F7941D',
  '#FC951C': '#F7941D',
  '#81BE89': '#5ABB64',
  '#E6E4E1': '#C7C8CA',
  '#E7E5E2': '#C7C8CA',
  '#DBD5CF': '#ECE8E3',

  // Stray surface colours condensed onto the ladder (see SITE_NEUTRALS): each joins the step
  // of its own family (warm stays warm, blue stays blue), never a neighbouring one.
  '#F7F9FB': '#FFFFFF',
  '#F7FAFC': '#FFFFFF',
  '#F7FBFD': '#FFFFFF',
  '#F8FBFD': '#FFFFFF',
  '#F8FBFE': '#FFFFFF',
  '#FBFDFF': '#FFFFFF',
  '#FFFAFA': '#FFFFFF',
  '#F0EFED': '#F4F1EC',
  '#F3EFE9': '#F4F1EC',
  '#F3EFEA': '#F4F1EC',
  '#F3F2F0': '#F4F1EC',
  '#F4F0EA': '#F4F1EC',
  '#F4F0EC': '#F4F1EC',
  '#F5F0EB': '#F4F1EC',
  '#F6F3EF': '#F4F1EC',
  '#E8EEF1': '#F1F2F2',
  '#EEEEEE': '#F1F2F2',
  '#EEF1F5': '#F1F2F2',
  '#EEF2F5': '#F1F2F2',
  '#EEF3F6': '#F1F2F2',
  '#EEF4F7': '#F1F2F2',
  '#F2F5F7': '#F1F2F2',
  '#F3F7FA': '#F1F2F2',
  '#F4F5F5': '#F1F2F2',
  '#F4F7FA': '#F1F2F2',
  '#F4F8FB': '#F1F2F2',
  '#F5F7F8': '#F1F2F2',
  '#F5F9FB': '#F1F2F2',
  '#F6F6F5': '#F1F2F2',
  '#E3F0F5': '#E9F7FA',
  '#E7F4FA': '#E9F7FA',
  '#E7F6FA': '#E9F7FA',
  '#E8F1F5': '#E9F7FA',
  '#E8F7FB': '#E9F7FA',
  '#E9F1F5': '#E9F7FA',
  '#E9F2F8': '#E9F7FA',
  '#E9FBFF': '#E9F7FA',
  '#EAF4F8': '#E9F7FA',
  '#ECF6FA': '#E9F7FA',
  '#EDF4F8': '#E9F7FA',
  '#EDF4F9': '#E9F7FA',
  '#EEF5F8': '#E9F7FA',
  '#EEF5FB': '#E9F7FA',
  '#EEF7FB': '#E9F7FA',
  '#EEFBFF': '#E9F7FA',
  '#EFFBFF': '#E9F7FA',
  '#ECE8E4': '#ECE8E3',
  '#EDEBE9': '#ECE8E3',
  '#EDECEA': '#ECE8E3',
  '#EEEBE9': '#ECE8E3',
  '#EFE8E2': '#ECE8E3',
  '#EFE9E4': '#ECE8E3',
  '#EFEBE8': '#ECE8E3',
  '#092348': '#00264D',
  '#143654': '#0F3357',
  '#1D4B89': '#004B76',
};

/* The warm grey was mostly stored as a 32% tint (#DDD5CC52). The client asked for solid Gray
   Lightest, but that is also the page background, so every tinted card vanished into the page.
   It becomes solid Warm Gray, the ladder step closest to how the tint used to look on the old
   page grey. A remap must not change a value's shape, though: blocks that read
   published cells by position tell a card background from a button colour by its translucency
   (split-card-info's isAlphaColor). So the tint becomes FE alpha, which renders as solid
   (99.6%) but still reads as translucent. */
const SOLID_SUCCESSORS = new Set(['#DDD5CC', '#DBD5CF']);
const SOLID_ALPHA = 'FE';

/* Hand-typed gradient stops, which the client keeps as they are. Their blocks have no other
   live colour field (the rest are locked to site styles), so they skip the remap whole. */
const GRADIENT_BLOCKS = '.cta-card-1, .support-cta';
export const GRADIENT_STOP_FIELDS = new Set(['gradientLeft', 'gradientRight', 'backgroundStart', 'backgroundEnd']);

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// A hex standing alone in a config value: bare, or one entry of a list such as
// "color|#hex icon-size|64px" or "Education:#hex Blog:#hex". Not {#hex}, which
// decorateInlineColors() resolves itself.
const VALUE_HEX_RE = /(^|[\s|:])(#[0-9a-f]{8}|#[0-9a-f]{6})(?=$|\s)/gi;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE']);

/**
 * Maps an old palette colour to its successor. Anything else, including a value that is
 * not a bare hex, comes back untouched.
 * @param {*} value Stored field value
 * @returns {*} The successor hex, or the value as given
 */
export function resolveBrandColor(value) {
  const match = String(value ?? '').trim().match(HEX_RE);
  if (!match) return value;

  let digits = match[1].toUpperCase();
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join('');
  const rgb = `#${digits.slice(0, 6)}`;
  const next = LEGACY_COLORS[rgb];
  if (!next) return value;
  const alpha = digits.slice(6);
  return `${next}${alpha && SOLID_SUCCESSORS.has(rgb) ? SOLID_ALPHA : alpha}`;
}

/**
 * Maps every old palette colour that stands alone in a stored config value, which is a
 * bare hex or a list entry such as "color|#hex icon-size|64px". Non-strings come back as is.
 * @param {*} value Stored field value
 * @returns {*} The value with each old colour replaced by its successor
 */
export function remapColorValue(value) {
  if (typeof value !== 'string' || !value.includes('#')) return value;
  return value.replace(VALUE_HEX_RE, (match, lead, hex) => `${lead}${resolveBrandColor(hex)}`);
}

/**
 * Rewrites old palette colours in authored markup before blocks read it. A colour field
 * reaches the page as its own text node, usually auto-linked (<a href="#hex">#hex</a>);
 * list-style fields hold several ("color|#hex icon-size|64px"). See remapColorValue().
 * @param {Element} root Container to rewrite in place
 */
export function remapLegacyColors(root) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeValue.includes('#') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });

  const updates = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const next = remapColorValue(node.nodeValue);
    if (next !== node.nodeValue && parent && !SKIP_TAGS.has(parent.tagName)
      && !parent.closest(GRADIENT_BLOCKS)) {
      updates.push([node, next]);
    }
  }

  updates.forEach(([node, next]) => {
    const link = node.parentElement.closest('a[href^="#"]');
    const href = link?.getAttribute('href');
    if (href && HEX_RE.test(href)) link.setAttribute('href', resolveBrandColor(href));
    node.nodeValue = next;
  });
}
