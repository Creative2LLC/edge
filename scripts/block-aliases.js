/**
 * Block name aliases.
 *
 * A block's template `name` (in blocks/<block>/_<block>.json) does three jobs: it is the
 * label authors see on a placed block, it becomes the block's CSS class on the page, and
 * AEM names the block's content node after it. The class and the node name are what pick
 * the folder under blocks/ that decorates the block.
 *
 * Authors asked for new names (block-rename/NCMEC-component-renaming-grouping-list.xlsx).
 * So the template name now carries the author-facing name, and this table points each
 * new name back at the folder that still holds the code. Blocks placed before the rename
 * keep their old name and never touch this table.
 *
 * Each entry produces two keys: the full class name (published pages) and the
 * 20-character node name AEM truncates to (the editor reads the block name from its node
 * path; numbered-cards-custo/ and historical-reports-c/ exist because of that truncation).
 *
 * Adding a rename: change `title` and `template.name` together, add the pair here, then run
 * `npm run lint:blocks`, which fails if any template name cannot reach a block folder.
 */

/** [template name, block folder, { nodeAlias: false } to skip the truncated-name key] */
export const BLOCK_RENAMES = [
  ['Family Advocacy Outreach Network Membership Application', 'faon-application'],
  ['CTA 2 Btn Split Col Banner', 'cta-card-1'],
  ['CTA Icn Btn Split Col Banner', 'cta-card-2'],
  ['CTA Media Contact', 'media-contact-cta'],
  ['CTA Social Report', 'social-report-cta'],
  ['CTA Support', 'support-cta'],
  ['Img Btn Banner', 'report-download'],
  ['Img Logo Btn Split Col Banner', 'split-card-info'],
  ['Dark Img Btn 1x4 Col', 'dark-feature-cards'],
  ['Img 2 Btn Split Col Card', 'split-card'],
  ['Img Btn 1-3 Col Card', 'regional-offices'],
  ['Img Disclaimer 1x3 Col Card', 'cards'],
  ['Img Icon 1x4 Split Card', 'split-card-gap'],
  ['Img Icon Btn 1x3 Col Card', 'image-text-card-row'],
  ['Logo Btn 1x6 Col Card Grid', 'card-row'],
  ['Multi Icn Btn Col Card Grid', 'info-cards-grid'],
  ['Txt Btn Split Col List Card', 'split-card-list'],
  ['Txt Btn Split Img Card', 'text-image'],
  ['Dark Multi # Btn Card Carousel', 'numbered-cards-custom'],
  ['Dark Seq Btn 1x8 Card Grid Carousel', 'numbered-cards'],
  ['Icn Btn Card Carousel', 'icon-card-carousel'],
  ['Marquee Logo Carousel', 'partners-showcase'],
  ['Narrow Img Btn Split Col Carousel', 'split-thin-carousel'],
  ['Pano Img 3 Col Btn Card Carousel', 'detailed-carousel'],
  ['Wide Img Btn Split Col Carousel', 'split-card-carousel'],
  ['Img Icn Hyperlink Card Carousel', 'resources'],
  ['Custom Btn Icon', 'colored-button'],
  ['Custom Grid', 'colored-grid'],
  ['Custom Heading', 'colored-heading'],
  ['Custom Icon Text', 'colored-icon-text'],
  ['Custom List', 'colored-list'],
  ['Custom Text', 'colored-text'],
  ['Donated Redblue Txt', 'icon-text'],
  ['Testimonies', 'card-testimonies'],
  ['Icn 1x4 Col', 'icon-text-row'],
  ['Icon 1x4 Col Card', 'card-row-compact'],
  ['Icon 1x4 Grid Img Split Card', 'split-card-detail'],
  ['Icon Hyperlink 1x2 Col Card', 'dual-cards'],
  ['Icon Hyperlink 1x3 Col Card', 'connect-grid'],
  ['1x2 Btn Image Banner', 'image-card'],
  ['Historical Trends Carousel', 'historical-reports-carousel'],
  ['Accordion', 'faq'],
  ['Sticky Nav', 'report-section-nav'],
  ['Resource Browser', 'resources-browser'],
  ['Resource Tags (Metadata)', 'resource-tags'],
  // Named this way before the rename; they never matched their folder.
  ['Become a Team HOPE Volunteer', 'team-hope-volunteer'],
  ['Resource Video Player', 'resource-video-player'],
  // Its 20-character node name is "community-education", a different real block, so it gets
  // no node alias; getBlockName in aem.js prefers the full class over a truncated node name.
  ['Community Education Partner Reporting Form', 'community-education-partner-reporting', { nodeAlias: false }],
];

/* Same rules as toClassName in aem.js; duplicated so this module has no imports. */
export function blockClassName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/* The content node name AEM derives from a template name, as a class name. */
export function blockNodeClassName(name) {
  return blockClassName(String(name ?? '').toLowerCase().replace(/[^0-9a-z]/g, '_').slice(0, 20));
}

export const BLOCK_ALIASES = Object.freeze(BLOCK_RENAMES.reduce((aliases, entry) => {
  const [name, folder, options] = entry;
  const names = options?.nodeAlias === false
    ? [blockClassName(name)]
    : [blockClassName(name), blockNodeClassName(name)];
  names.forEach((alias) => {
    if (alias && alias !== folder) aliases[alias] = folder;
  });
  return aliases;
}, {}));

/**
 * The block folder for a block name. Names that are not aliases come back unchanged.
 * @param {string} name A block class name
 * @returns {string}
 */
export function resolveBlockAlias(name) {
  return Object.prototype.hasOwnProperty.call(BLOCK_ALIASES, name) ? BLOCK_ALIASES[name] : name;
}

/**
 * Swaps an aliased block class for the folder name before anything reads it, so colour
 * remapping, section decoration and other blocks' selectors all see the class they know.
 * Only touches block positions (section > block), never markup a block has rendered.
 * @param {Element} main
 */
export function applyBlockAliases(main) {
  main?.querySelectorAll(':scope > div > div[class]').forEach((block) => {
    const alias = block.classList[0];
    const folder = resolveBlockAlias(alias);
    if (folder === alias) return;
    block.classList.replace(alias, folder);
    block.dataset.blockAlias = alias;
  });
}
