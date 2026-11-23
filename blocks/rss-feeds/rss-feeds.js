/* RSS Feeds: links to NCMEC's missing-child alert feeds, the national feed of featured
   cases and one feed per state and DC, like the old site's /gethelpnow/search/rss page.

   The feeds are not built here. NCMEC's case system writes them live (XmlServlet on
   api.missingkids.org, the same host the poster and AMBER blocks read), so this block only
   builds the links. The legacy feed address on www.missingkids.org is kept working by a
   redirect row, not by this block.

   These are NOT AMBER Alerts: the default notice says so and links to the AMBER page. */
import { readLinkField, readTextField, getBlockRows } from '../../scripts/block-field-utils.js';
import { applyButtonStyle } from '../../scripts/button-utils.js';
import resolveSiteHref, { currentSiteLocale } from '../../scripts/link-utils.js';

const FEED_ENDPOINT = 'https://api.missingkids.org/missingkids/servlet/XmlServlet';

/* Published rows, in model order. Add new fields at the END of the model, or every later
   row moves on published pages. */
const ROW = {
  feeds: 0,
  language: 1,
  intro: 2,
  notice: 3,
  noticeLinkLabel: 4,
  noticeLink: 5,
  nationalHeading: 6,
  nationalText: 7,
  nationalLabel: 8,
  statesHeading: 9,
  statesText: 10,
};

/* Select values are namespaced so a published page, which carries no field names, can be
   read by value. The feeds select is the anchor every other row is counted from. */
const FEEDS_RE = /^rss-feeds-(all|national|states)$/;
const LANGUAGE_RE = /^rss-lang-(auto|en|es)$/;

/* Used only by a block with no rows at all. Once the Universal Editor has written the
   model's defaults, a blank field is the author's choice and shows nothing. */
const DEFAULTS = {
  intro: "You can receive missing child alerts in RSS format. To subscribe, copy a feed's link and paste it into your RSS reader.",
  notice: 'These are not AMBER Alerts.',
  noticeLinkLabel: 'See active AMBER Alerts',
  noticeLink: '/amber-alerts',
  nationalHeading: 'Missing Children Alert Cases',
  nationalText: 'Add this RSS feed to receive alerts when a new missing child is added to our group of missing-children-alert cases.',
  nationalLabel: 'Missing Children Alerts',
  statesHeading: 'Regional Missing Children Alerts',
  statesText: "Add these RSS feeds to receive alerts whenever a missing child from the chosen area is posted to NCMEC's website.",
};

/* Built-in words follow the page's language; authored fields are translated with the page. */
const STRINGS = {
  en: {
    copy: 'Copy feed link',
    copied: 'Feed link copied. Paste it into your RSS reader.',
    copyFailed: 'Copy this link into your RSS reader:',
  },
  es: {
    copy: 'Copiar enlace del feed',
    copied: 'Enlace copiado. Péguelo en su lector de RSS.',
    copyFailed: 'Copie este enlace en su lector de RSS:',
  },
};

/* The old page's list: the 50 states and DC. (The feed also answers for PR.) */
const STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia', 'Distrito de Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii', 'Hawái'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana', 'Luisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan', 'Míchigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi', 'Misisipi'],
  ['MO', 'Missouri', 'Misuri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire', 'Nuevo Hampshire'],
  ['NJ', 'New Jersey', 'Nueva Jersey'],
  ['NM', 'New Mexico', 'Nuevo México'],
  ['NY', 'New York', 'Nueva York'],
  ['NC', 'North Carolina', 'Carolina del Norte'],
  ['ND', 'North Dakota', 'Dakota del Norte'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon', 'Oregón'],
  ['PA', 'Pennsylvania', 'Pensilvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina', 'Carolina del Sur'],
  ['SD', 'South Dakota', 'Dakota del Sur'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia', 'Virginia Occidental'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];

const SVG_NS = 'http://www.w3.org/2000/svg';

function normalizeText(value) {
  return `${value || ''}`.replace(/\s+/g, ' ').trim();
}

/** The feed address, with its parameters in the old page's order. */
export function feedUrl(language, state = '') {
  const params = new URLSearchParams({
    act: 'rss',
    LanguageCountry: language === 'es' ? 'es_US' : 'en_US',
    orgPrefix: 'NCMC',
  });
  if (state) params.set('state', state);
  return `${FEED_ENDPOINT}?${params}`;
}

/**
 * Where row 0 is. The feeds select always publishes a value, so it places every other
 * row even if a revision of the model ever adds or loses a row ahead of it.
 */
function findRowBase(rows) {
  const at = rows.findIndex((row) => FEEDS_RE.test(normalizeText(row.textContent).toLowerCase()));
  return at >= ROW.feeds ? at - ROW.feeds : 0;
}

function readFields(block) {
  const rows = getBlockRows(block);
  const authored = rows.length > 0;
  const base = findRowBase(rows);
  const text = (name) => normalizeText(readTextField(block, name, base + ROW[name]).value);
  const pick = (name) => (authored ? text(name) : DEFAULTS[name]);

  const feeds = text('feeds').toLowerCase().match(FEEDS_RE)?.[1] || 'all';
  const language = text('language').toLowerCase().match(LANGUAGE_RE)?.[1] || 'auto';
  const noticeLink = authored
    ? normalizeText(readLinkField(block, 'noticeLink', base + ROW.noticeLink).value)
    : DEFAULTS.noticeLink;

  return {
    feeds,
    language,
    intro: pick('intro'),
    notice: pick('notice'),
    noticeLinkLabel: pick('noticeLinkLabel') || (noticeLink ? DEFAULTS.noticeLinkLabel : ''),
    noticeLink,
    nationalHeading: pick('nationalHeading'),
    nationalText: pick('nationalText'),
    // A link needs words, so this one always falls back.
    nationalLabel: pick('nationalLabel') || DEFAULTS.nationalLabel,
    statesHeading: pick('statesHeading'),
    statesText: pick('statesText'),
  };
}

function createElement(tag, className, textContent) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

/* The common feed glyph: a dot and two arcs. Decorative; the link text names the feed. */
function createFeedIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('rss-feeds-icon');

  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '6.5');
  dot.setAttribute('cy', '17.5');
  dot.setAttribute('r', '2');
  svg.append(dot);

  ['M4.5 11a8.5 8.5 0 0 1 8.5 8.5', 'M4.5 4.5a15 15 0 0 1 15 15'].forEach((d) => {
    const arc = document.createElementNS(SVG_NS, 'path');
    arc.setAttribute('d', d);
    svg.append(arc);
  });
  return svg;
}

function createFeedLink(href, label, className = '') {
  const link = createElement('a', className);
  link.href = href;
  link.type = 'application/rss+xml';
  link.textContent = label;
  return link;
}

function createGroup(className, heading, text) {
  const group = createElement('section', `rss-feeds-group ${className}`);
  if (heading) group.append(createElement('h2', 'rss-feeds-heading', heading));
  if (text) group.append(createElement('p', 'rss-feeds-text', text));
  return group;
}

async function copyText(value) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(value);
}

function createNationalGroup(config, feedLanguage, strings) {
  const group = createGroup('rss-feeds-national', config.nationalHeading, config.nationalText);
  const href = feedUrl(feedLanguage);

  const feature = createElement('div', 'rss-feeds-feature');
  const link = createFeedLink(href, '', 'rss-feeds-feature-link');
  link.append(createFeedIcon(), createElement('span', '', config.nationalLabel));

  const copy = createElement('button', '', strings.copy);
  copy.type = 'button';
  applyButtonStyle(copy, 'secondary');

  // Polite, so the result is announced without moving focus off the button.
  const status = createElement('p', 'rss-feeds-copy-status u-body-sm');
  status.setAttribute('role', 'status');

  let clearTimer;
  copy.addEventListener('click', async () => {
    window.clearTimeout(clearTimer);
    try {
      await copyText(href);
      status.textContent = strings.copied;
      clearTimer = window.setTimeout(() => { status.textContent = ''; }, 6000);
    } catch (error) {
      // No clipboard (an old browser, or a page that is not https): show the address so
      // it can be copied by hand.
      status.replaceChildren(
        `${strings.copyFailed} `,
        createElement('span', 'rss-feeds-copy-url', href),
      );
    }
  });

  feature.append(link, copy, status);
  group.append(feature);
  return group;
}

function createStatesGroup(config, feedLanguage, uiLanguage) {
  const group = createGroup('rss-feeds-states', config.statesHeading, config.statesText);
  const collator = new Intl.Collator(uiLanguage);
  const states = STATES
    .map(([code, english, spanish]) => ({
      code,
      name: uiLanguage === 'es' && spanish ? spanish : english,
    }))
    .sort((a, b) => collator.compare(a.name, b.name));

  const list = createElement('ul', 'rss-feeds-list');
  states.forEach(({ code, name }) => {
    const item = document.createElement('li');
    item.append(createFeedLink(feedUrl(feedLanguage, code), name));
    list.append(item);
  });
  group.append(list);
  return group;
}

function createNotice(config) {
  if (!config.notice && !(config.noticeLink && config.noticeLinkLabel)) return null;
  const notice = createElement('p', 'rss-feeds-notice');
  if (config.notice) notice.append(createElement('strong', '', config.notice));
  if (config.noticeLink && config.noticeLinkLabel) {
    if (config.notice) notice.append(' ');
    const link = document.createElement('a');
    link.href = resolveSiteHref(config.noticeLink);
    link.textContent = config.noticeLinkLabel;
    notice.append(link);
  }
  return notice;
}

export default function decorate(block) {
  const config = readFields(block);
  const uiLanguage = currentSiteLocale() === 'es' ? 'es' : 'en';
  const feedLanguage = config.language === 'auto' ? uiLanguage : config.language;
  const strings = STRINGS[uiLanguage];

  const content = [];
  if (config.intro) content.push(createElement('p', 'rss-feeds-intro u-body-lg', config.intro));
  const notice = createNotice(config);
  if (notice) content.push(notice);
  if (config.feeds !== 'states') content.push(createNationalGroup(config, feedLanguage, strings));
  if (config.feeds !== 'national') content.push(createStatesGroup(config, feedLanguage, uiLanguage));

  block.replaceChildren(...content);
}
