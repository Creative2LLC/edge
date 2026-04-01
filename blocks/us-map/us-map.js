import { moveInstrumentation } from '../../scripts/scripts.js';

/* Abbreviation → full name lookup */
const STATE_NAMES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

const CHEVRON_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"></polyline></svg>';

const ARROW_SVG = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.167 10h11.666M10.833 5l5 5-5 5" stroke="currentColor" stroke-width="1.67" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function getField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) return { source, value: source.textContent.trim() };
  const cols = [...row.children];
  if (cols[index]) return { source: null, value: cols[index].textContent.trim() };
  return { source: null, value: '' };
}

function getLinkField(row, name, index) {
  const source = row.querySelector(`[data-aue-prop="${name}"]`);
  if (source) {
    const anchor = source.tagName === 'A' ? source : source.querySelector('a');
    return { source, value: anchor?.href || source.textContent.trim() };
  }
  const cols = [...row.children];
  if (cols[index]) {
    const anchor = cols[index].querySelector('a');
    return { source: null, value: anchor?.href || cols[index].textContent.trim() };
  }
  return { source: null, value: '' };
}

/* Fetch the external SVG map and prepare it for interaction */
async function loadMap() {
  const resp = await fetch('/blocks/us-map/us-states.svg');
  const text = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');

  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Interactive map of the United States');

  /* Tag every state path with data-state for easy querying */
  svg.querySelectorAll('path[id]').forEach((path) => {
    const abbr = path.getAttribute('id');
    if (STATE_NAMES[abbr]) {
      path.setAttribute('data-state', abbr);
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', STATE_NAMES[abbr]);
      path.removeAttribute('fill');
    }
  });

  return svg;
}

/* Build the custom dropdown */
function buildDropdown(onSelect) {
  const wrap = document.createElement('div');
  wrap.className = 'us-map-dropdown-wrap';

  const btn = document.createElement('button');
  btn.className = 'us-map-dropdown-btn';
  btn.type = 'button';

  const label = document.createElement('span');
  label.className = 'us-map-dropdown-label';
  label.textContent = 'Select a state';

  const chevron = document.createElement('span');
  chevron.innerHTML = CHEVRON_SVG;

  btn.append(label, chevron);

  const list = document.createElement('ul');
  list.className = 'us-map-dropdown-list';

  const sortedStates = Object.entries(STATE_NAMES)
    .filter(([abbr]) => abbr !== 'DC')
    .map(([abbr, name]) => ({ abbr, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  sortedStates.forEach(({ abbr, name }) => {
    const li = document.createElement('li');
    li.textContent = name;
    li.dataset.state = abbr;
    li.addEventListener('click', () => {
      onSelect(abbr);
      list.classList.remove('open');
      btn.classList.remove('open');
    });
    list.appendChild(li);
  });

  btn.addEventListener('click', () => {
    const isOpen = list.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      list.classList.remove('open');
      btn.classList.remove('open');
    }
  });

  wrap.append(btn, list);
  return { wrap, label, list };
}

export default async function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  /* Read state→link data from block items */
  const stateLinks = {};
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;
    const nameField = getField(row, 'stateName', 0);
    const linkField = getLinkField(row, 'stateLink', 1);
    if (nameField.value) {
      stateLinks[nameField.value.toLowerCase()] = linkField.value;
    }
  });

  /* Load SVG map */
  const mapWrap = document.createElement('div');
  mapWrap.className = 'us-map-svg-wrap';
  const svg = await loadMap();
  mapWrap.appendChild(svg);

  /* Info row */
  const info = document.createElement('div');
  info.className = 'us-map-info';

  const stateName = document.createElement('h2');
  stateName.className = 'us-map-state-name';

  /* Link bar */
  const linkBar = document.createElement('div');
  linkBar.className = 'us-map-link-bar';

  const linkBarName = document.createElement('span');
  linkBarName.className = 'us-map-link-bar-name';

  const linkBarUrl = document.createElement('span');
  linkBarUrl.className = 'us-map-link-bar-url';

  const linkBarArrow = document.createElement('span');
  linkBarArrow.className = 'us-map-link-bar-arrow';

  linkBar.append(linkBarName, linkBarUrl, linkBarArrow);

  /* Dropdown */
  let onStateSelect = () => {};
  const { wrap: dropdownWrap, label: dropdownLabel, list: dropdownList } = buildDropdown(
    (abbr) => onStateSelect(abbr),
  );

  /* Select handler */
  function selectState(abbr) {
    const name = STATE_NAMES[abbr];
    if (!name) return;

    svg.querySelectorAll('path.selected').forEach((p) => p.classList.remove('selected'));
    svg.querySelectorAll(`path[data-state="${abbr}"]`).forEach((p) => p.classList.add('selected'));

    stateName.textContent = name;
    dropdownLabel.textContent = name;
    dropdownList.querySelectorAll('li').forEach((li) => {
      li.classList.toggle('selected', li.dataset.state === abbr);
    });

    info.classList.add('visible');

    const link = stateLinks[name.toLowerCase()] || '';
    if (link) {
      linkBar.classList.add('visible');
      linkBarName.textContent = name;
      linkBarUrl.innerHTML = '';
      const a = document.createElement('a');
      a.href = link;
      a.textContent = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      linkBarUrl.appendChild(a);
      linkBarArrow.innerHTML = '';
      const arrowLink = document.createElement('a');
      arrowLink.href = link;
      arrowLink.target = '_blank';
      arrowLink.rel = 'noopener noreferrer';
      arrowLink.innerHTML = ARROW_SVG;
      linkBarArrow.appendChild(arrowLink);
    } else {
      linkBar.classList.remove('visible');
    }
  }

  onStateSelect = selectState;

  info.append(stateName, dropdownWrap);

  /* Map click handler */
  svg.addEventListener('click', (e) => {
    const path = e.target.closest('path[data-state]');
    if (!path) return;
    selectState(path.dataset.state);
  });

  /* Keyboard accessibility */
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const path = e.target.closest('path[data-state]');
      if (path) {
        e.preventDefault();
        selectState(path.dataset.state);
      }
    }
  });

  if (rows[0]) moveInstrumentation(rows[0], block);
  block.replaceChildren(mapWrap, info, linkBar);
}
