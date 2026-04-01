import { moveInstrumentation } from '../../scripts/scripts.js';

/* ------------------------------------------------------------------ */
/*  US state data – abbreviation, name, and simplified SVG path       */
/*  Paths are for a 960 × 600 Albers-USA-style viewBox.              */
/* ------------------------------------------------------------------ */
const STATES = {
  AL: { name: 'Alabama', path: 'M649,336 L688,332 L694,396 L696,432 L690,453 L681,458 L676,444 L651,447 L649,380Z' },
  AK: { name: 'Alaska', path: 'M161,453 L183,448 L190,453 L178,470 L185,480 L178,490 L164,497 L144,502 L128,510 L112,510 L100,505 L96,497 L84,497 L72,490 L50,490 L36,485 L28,480 L16,475 L24,468 L8,460 L20,455 L32,452 L44,448 L56,445 L70,448 L80,455 L88,462 L96,458 L108,460 L120,455 L130,450 L145,448 L157,452Z' },
  AZ: { name: 'Arizona', path: 'M140,353 L206,316 L247,313 L267,310 L270,440 L168,442 L140,408Z' },
  AR: { name: 'Arkansas', path: 'M548,348 L610,345 L612,418 L548,420Z' },
  CA: { name: 'California', path: 'M90,175 L122,170 L130,185 L140,210 L138,235 L140,260 L140,285 L140,310 L140,353 L122,378 L108,398 L96,408 L86,395 L76,370 L68,340 L66,310 L68,280 L72,250 L78,220 L82,195Z' },
  CO: { name: 'Colorado', path: 'M298,222 L398,218 L400,302 L300,306Z' },
  CT: { name: 'Connecticut', path: 'M847,195 L868,190 L872,196 L870,210 L848,215Z' },
  DE: { name: 'Delaware', path: 'M816,272 L825,268 L828,280 L826,296 L818,296Z' },
  FL: { name: 'Florida', path: 'M696,432 L738,428 L752,433 L762,443 L766,460 L760,478 L748,498 L735,515 L722,522 L715,512 L710,496 L705,475 L698,455 L694,440Z' },
  GA: { name: 'Georgia', path: 'M694,342 L738,338 L744,390 L742,420 L738,428 L696,432 L694,396 L688,368Z' },
  HI: { name: 'Hawaii', path: 'M225,495 L236,492 L242,497 L252,495 L262,498 L268,505 L280,508 L288,515 L295,518 L300,525 L292,530 L280,528 L268,522 L255,518 L242,512 L232,505Z' },
  ID: { name: 'Idaho', path: 'M192,62 L234,58 L258,52 L255,96 L252,130 L240,155 L228,192 L200,196 L192,168 L192,112Z' },
  IL: { name: 'Illinois', path: 'M598,192 L635,188 L640,222 L642,258 L638,298 L632,322 L618,338 L605,340 L600,310 L598,265Z' },
  IN: { name: 'Indiana', path: 'M646,222 L682,218 L686,268 L688,316 L685,332 L648,336 L642,295 L644,258Z' },
  IA: { name: 'Iowa', path: 'M510,188 L576,184 L582,218 L584,256 L515,260 L510,228Z' },
  KS: { name: 'Kansas', path: 'M418,270 L542,266 L544,336 L418,340Z' },
  KY: { name: 'Kentucky', path: 'M648,284 L742,276 L748,296 L742,316 L710,326 L685,332 L648,336Z' },
  LA: { name: 'Louisiana', path: 'M548,420 L610,418 L618,436 L624,460 L615,478 L600,485 L582,482 L570,488 L556,478 L548,458Z' },
  ME: { name: 'Maine', path: 'M882,62 L908,53 L920,78 L918,108 L908,136 L895,158 L882,168 L876,132 L880,98Z' },
  MD: { name: 'Maryland', path: 'M780,268 L816,262 L822,272 L816,272 L818,296 L808,296 L795,286 L788,278 L780,278Z' },
  MA: { name: 'Massachusetts', path: 'M852,180 L876,177 L890,178 L898,184 L894,192 L878,196 L856,198 L848,195Z' },
  MI: { name: 'Michigan', path: 'M578,88 L606,82 L620,78 L636,92 L640,108 L628,118 L612,120 L595,118 L580,108ZM648,138 L668,128 L688,118 L706,118 L712,140 L714,168 L710,198 L698,222 L685,232 L668,235 L658,228 L648,198 L646,168Z' },
  MN: { name: 'Minnesota', path: 'M498,58 L566,55 L572,92 L576,138 L578,180 L502,184 L498,118Z' },
  MS: { name: 'Mississippi', path: 'M608,348 L644,344 L649,380 L651,420 L648,450 L632,468 L618,462 L610,448 L608,418Z' },
  MO: { name: 'Missouri', path: 'M538,262 L598,258 L604,292 L610,328 L610,345 L548,348 L538,318 L535,290Z' },
  MT: { name: 'Montana', path: 'M247,48 L388,42 L392,98 L394,132 L262,138 L255,96 L250,72Z' },
  NE: { name: 'Nebraska', path: 'M405,212 L530,208 L536,238 L538,262 L418,266 L406,248Z' },
  NV: { name: 'Nevada', path: 'M135,178 L192,168 L200,196 L206,258 L210,316 L168,330 L140,353 L140,310 L140,260 L135,215Z' },
  NH: { name: 'New Hampshire', path: 'M862,118 L876,112 L882,148 L880,175 L862,182 L858,150Z' },
  NJ: { name: 'New Jersey', path: 'M822,228 L838,222 L842,248 L840,268 L834,288 L826,296 L822,272Z' },
  NM: { name: 'New Mexico', path: 'M270,310 L375,306 L378,358 L380,442 L270,446Z' },
  NY: { name: 'New York', path: 'M790,142 L824,134 L842,138 L858,152 L868,172 L862,188 L848,200 L838,215 L822,228 L810,232 L794,222 L788,198 L790,168Z' },
  NC: { name: 'North Carolina', path: 'M700,310 L790,300 L812,296 L818,310 L808,322 L785,332 L748,340 L738,338 L700,342Z' },
  ND: { name: 'North Dakota', path: 'M400,56 L496,52 L498,98 L500,130 L402,134Z' },
  OH: { name: 'Ohio', path: 'M690,200 L728,196 L742,198 L746,232 L745,268 L738,292 L720,298 L695,298 L688,268 L690,238Z' },
  OK: { name: 'Oklahoma', path: 'M346,332 L346,348 L418,345 L544,340 L548,370 L550,398 L468,402 L440,392 L412,382 L388,375 L346,362Z' },
  OR: { name: 'Oregon', path: 'M82,108 L110,100 L140,96 L170,92 L192,96 L196,128 L198,166 L140,175 L108,162 L88,145 L78,128Z' },
  PA: { name: 'Pennsylvania', path: 'M748,202 L812,196 L822,228 L812,238 L798,246 L752,250Z' },
  RI: { name: 'Rhode Island', path: 'M876,192 L882,188 L885,198 L880,204 L875,200Z' },
  SC: { name: 'South Carolina', path: 'M730,340 L782,332 L790,352 L772,380 L748,388 L735,378 L728,362Z' },
  SD: { name: 'South Dakota', path: 'M402,135 L505,130 L508,168 L510,208 L406,212 L404,172Z' },
  TN: { name: 'Tennessee', path: 'M618,315 L742,306 L748,326 L742,340 L700,345 L618,348Z' },
  TX: { name: 'Texas', path: 'M346,362 L388,375 L412,382 L440,392 L468,402 L550,398 L556,432 L548,468 L532,498 L508,520 L478,528 L452,522 L430,508 L408,488 L388,468 L374,445 L362,418 L350,392Z' },
  UT: { name: 'Utah', path: 'M210,200 L280,196 L290,198 L298,222 L300,306 L218,310 L210,258Z' },
  VT: { name: 'Vermont', path: 'M846,122 L860,118 L862,148 L858,178 L848,182 L846,155Z' },
  VA: { name: 'Virginia', path: 'M730,278 L762,272 L790,266 L812,262 L818,278 L812,296 L790,310 L760,320 L742,326 L738,316 L748,306 L742,296 L735,292Z' },
  WA: { name: 'Washington', path: 'M100,48 L140,44 L170,42 L192,44 L196,72 L196,100 L172,105 L155,98 L140,105 L122,108 L108,105 L100,92Z' },
  WV: { name: 'West Virginia', path: 'M720,258 L748,252 L758,268 L762,288 L752,308 L742,316 L730,310 L722,298 L718,278Z' },
  WI: { name: 'Wisconsin', path: 'M566,82 L594,78 L612,80 L626,78 L638,98 L642,132 L640,168 L636,188 L600,192 L580,188 L572,168 L568,132Z' },
  WY: { name: 'Wyoming', path: 'M268,138 L392,132 L396,178 L398,218 L270,222Z' },
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

/* Build the SVG map */
function buildMap() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 960 600');
  svg.setAttribute('xmlns', svgNS);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Interactive map of the United States');

  Object.entries(STATES).forEach(([abbr, state]) => {
    const parts = state.path.split(/(?=M)/);
    parts.forEach((d) => {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('data-state', abbr);
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', state.name);
      svg.appendChild(path);
    });
  });

  return svg;
}

/* Build the dropdown */
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

  const sortedStates = Object.entries(STATES)
    .map(([abbr, s]) => ({ abbr, name: s.name }))
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

export default function decorate(block) {
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

  /* Map container */
  const mapWrap = document.createElement('div');
  mapWrap.className = 'us-map-svg-wrap';
  const svg = buildMap();
  mapWrap.appendChild(svg);

  /* Info row: state name + dropdown */
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

  /* Dropdown — built before selectState so vars are in scope */
  let onStateSelect = () => {};
  const { wrap: dropdownWrap, label: dropdownLabel, list: dropdownList } = buildDropdown(
    (abbr) => onStateSelect(abbr),
  );

  /* Select handler */
  function selectState(abbr) {
    const state = STATES[abbr];
    if (!state) return;

    svg.querySelectorAll('path.selected').forEach((p) => p.classList.remove('selected'));
    svg.querySelectorAll(`path[data-state="${abbr}"]`).forEach((p) => p.classList.add('selected'));

    stateName.textContent = state.name;
    dropdownLabel.textContent = state.name;
    dropdownList.querySelectorAll('li').forEach((li) => {
      li.classList.toggle('selected', li.dataset.state === abbr);
    });

    info.classList.add('visible');

    const link = stateLinks[state.name.toLowerCase()] || '';
    if (link) {
      linkBar.classList.add('visible');
      linkBarName.textContent = state.name;
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
