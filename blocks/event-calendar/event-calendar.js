import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const DEFAULTS = {
  heading: '',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  emptyMessage: 'No events this month.',
  defaultView: 'calendar',
  tableHeading: 'Upcoming NCMEC Events',
  featuredCount: 2,
  showFeaturedCards: 'show',
  showCalendarView: 'show',
  showTableView: 'show',
};

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  emptyMessage: ['empty message', 'no events message'],
  defaultView: ['default view', 'view mode', 'mode'],
  tableHeading: ['table heading', 'events table heading'],
  featuredCount: ['featured event count', 'featured count', 'card count'],
  showFeaturedCards: ['show featured cards', 'show cards', 'featured cards'],
  showCalendarView: ['show calendar', 'calendar view'],
  showTableView: ['show table', 'table view'],
};

const ARCHIVE_DELAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizeText(value) {
  return `${value || ''}`.trim();
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeView(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized.includes('table')) return 'table';
  return 'calendar';
}

function normalizeCount(value, fallback) {
  const count = Number.parseInt(normalizeText(value), 10);
  if (Number.isNaN(count)) return fallback;
  return Math.max(0, Math.min(count, 6));
}

function normalizeVisibility(value, fallback = 'show') {
  const normalized = normalizeText(value || fallback).toLowerCase();
  return !['hide', 'hidden', 'off', 'false', 'no', '0'].includes(normalized);
}

function resolveDefaultView(value, showCalendarView, showTableView) {
  const preferred = normalizeView(value);
  if (preferred === 'table' && showTableView) return 'table';
  if (preferred === 'calendar' && showCalendarView) return 'calendar';
  if (showCalendarView) return 'calendar';
  return 'table';
}

function getRows(block) {
  return getBlockRows(block);
}

function getPropValue(block, name) {
  return normalizeText(readLinkField(block, name).value || readTextField(block, name).value);
}

function getLegacyValue(block, name, columnIndex) {
  const labels = FIELD_LABELS[name] || [];
  const labeledRow = getRows(block).find((row) => {
    if (row.children.length !== 2) return false;
    const label = normalizeText(row.children[0].textContent).toLowerCase();
    return labels.some((entry) => label === entry || label.includes(entry));
  });

  if (labeledRow) {
    const valueCell = labeledRow.children[1];
    const anchor = valueCell.querySelector('a');
    return normalizeText(anchor?.getAttribute('href') || valueCell.textContent);
  }

  const configRow = getRows(block)[0];
  const cell = configRow ? [...configRow.children][columnIndex] : null;
  if (!cell) return '';
  const anchor = cell.querySelector('a');
  return normalizeText(anchor?.getAttribute('href') || cell.textContent);
}

function getFieldValue(block, name, columnIndex, fallback = '') {
  return getPropValue(block, name) || getLegacyValue(block, name, columnIndex) || fallback;
}

function setStatus(node, message, type = '') {
  node.className = `event-calendar-status${type ? ` is-${type}` : ''}`;
  node.textContent = message;
  node.hidden = !message;
}

function buildDayKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function eventCoversDay(event, key) {
  if (event.start_date > key) return false;
  if (!event.end_datetime) return event.start_date === key;
  // Compare date portion of ISO string only — avoids timezone parsing
  return event.end_datetime.slice(0, 10) >= key;
}

function dateParts(event) {
  const [year = '', month = '', day = ''] = normalizeText(event.start_date).split('-');
  return { year, month, day };
}

function formatCardDate(event) {
  const { year, month, day } = dateParts(event);
  if (!year || !month || !day) return '';
  return `${month}-${day}-${year}`;
}

function formatTableDate(event) {
  const { year, month, day } = dateParts(event);
  if (!year || !month || !day) return '';
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function formatModalDate(event) {
  const { year, month, day } = dateParts(event);
  if (!year || !month || !day) return '';
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatEventTime(event) {
  const timePart = event.start_time || '';
  const endTimePart = event.end_time ? ` – ${event.end_time}` : '';
  return timePart ? `${timePart}${endTimePart}` : '';
}

function eventEndDateKey(event) {
  return normalizeText(event.end_datetime).slice(0, 10) || normalizeText(event.start_date);
}

function parseEventDateTime(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventCompletionDate(event) {
  return parseEventDateTime(event.end_datetime) || parseEventDateTime(event.start_datetime);
}

function isArchivedForListings(event, now = new Date()) {
  const completionDate = eventCompletionDate(event);
  if (!completionDate) return false;
  return completionDate.getTime() + ARCHIVE_DELAY_MS <= now.getTime();
}

function activeListingEvents(events) {
  const now = new Date();
  return events.filter((event) => !isArchivedForListings(event, now));
}

function todayDateKey() {
  const today = new Date();
  return buildDayKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

function isUpcomingEvent(event, todayKey = todayDateKey()) {
  const endKey = eventEndDateKey(event);
  return endKey ? endKey >= todayKey : false;
}

function selectFeaturedEvents(events, count) {
  if (!count) return [];

  const upcoming = events.filter((event) => isUpcomingEvent(event));
  return (upcoming.length ? upcoming : events).slice(0, count);
}

function truncateText(value, maxLength = 130) {
  const text = normalizeText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim().replace(/[.,;:!?-]+$/, '')}...`;
}

function locationParts(event) {
  const location = normalizeText(event.location);
  const explicitCityState = normalizeText(event.city_state || event.cityState);

  if (!location) {
    return { venue: '', cityState: explicitCityState };
  }

  const lines = location.split(/\r?\n/).map(normalizeText).filter(Boolean);
  if (lines.length > 1) {
    return {
      venue: lines[0],
      cityState: explicitCityState || lines.slice(1).join(', '),
    };
  }

  return {
    venue: normalizeText(event.venue || event.location_name) || location,
    cityState: explicitCityState,
  };
}

function createModal() {
  const modal = document.createElement('dialog');
  modal.className = 'event-calendar-modal';
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'event-calendar-modal-title');

  const inner = document.createElement('div');
  inner.className = 'event-calendar-modal-inner';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'event-calendar-modal-close';
  closeBtn.setAttribute('aria-label', 'Close event details');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => modal.close());

  const media = document.createElement('div');
  media.className = 'event-calendar-modal-media';

  const imgEl = document.createElement('img');
  imgEl.className = 'event-calendar-modal-image';
  imgEl.loading = 'lazy';
  media.append(imgEl);

  const content = document.createElement('div');
  content.className = 'event-calendar-modal-content';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'event-calendar-modal-eyebrow';
  eyebrow.textContent = 'Event Details';

  const titleEl = document.createElement('h3');
  titleEl.id = 'event-calendar-modal-title';

  const meta = document.createElement('div');
  meta.className = 'event-calendar-modal-meta';

  const whenEl = document.createElement('span');
  whenEl.className = 'event-calendar-modal-chip is-date';

  const locationEl = document.createElement('span');
  locationEl.className = 'event-calendar-modal-chip is-location';

  const descriptionEl = document.createElement('p');
  descriptionEl.className = 'event-calendar-modal-description';

  const linkEl = document.createElement('a');
  linkEl.className = 'event-calendar-modal-link';
  linkEl.target = '_blank';
  linkEl.rel = 'noopener noreferrer';
  linkEl.textContent = 'View event details';

  meta.append(whenEl, locationEl);
  content.append(eyebrow, titleEl, meta, descriptionEl, linkEl);
  inner.append(closeBtn, media, content);
  modal.append(inner);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  });

  function openModal(event) {
    titleEl.textContent = event.title;

    const datePart = formatModalDate(event);
    const timePart = formatEventTime(event);
    whenEl.textContent = timePart ? `${datePart} · ${timePart}` : datePart;
    whenEl.hidden = !datePart;

    const { venue, cityState } = locationParts(event);
    const locationText = [venue, cityState].filter(Boolean).join(' · ');
    const normalizedLocation = locationText.toLowerCase();
    const duplicateChip = normalizedLocation === normalizeText(event.title).toLowerCase()
      || normalizedLocation === normalizeText(event.description).toLowerCase();
    locationEl.textContent = duplicateChip ? '' : locationText;
    locationEl.hidden = !locationEl.textContent;

    descriptionEl.textContent = event.description || '';
    descriptionEl.hidden = !event.description;

    imgEl.src = event.image_url || '';
    imgEl.alt = event.title;
    media.hidden = !event.image_url;

    linkEl.href = event.external_url || '#';
    linkEl.hidden = !event.external_url;

    modal.showModal();
  }

  return { modal, openModal };
}

function buildEventImage(event, className) {
  const image = document.createElement('div');
  image.className = className;

  if (event.image_url) {
    const img = document.createElement('img');
    img.src = event.image_url;
    img.alt = event.title || 'Event image';
    img.loading = 'lazy';
    image.append(img);
    return image;
  }

  image.classList.add('is-placeholder');
  image.textContent = 'NCMEC';
  return image;
}

function renderFeaturedEvents(container, events, count, openModal) {
  container.replaceChildren();

  const featured = selectFeaturedEvents(events, count);
  if (!featured.length) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  featured.forEach((event) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'event-calendar-featured-card';
    card.addEventListener('click', () => openModal(event));

    const content = document.createElement('span');
    content.className = 'event-calendar-featured-content';

    const meta = document.createElement('span');
    meta.className = 'event-calendar-featured-meta';
    meta.textContent = [formatCardDate(event), formatEventTime(event)].filter(Boolean).join(' · ');

    const title = document.createElement('span');
    title.className = 'event-calendar-featured-title';
    title.textContent = event.title || 'Event';

    const description = document.createElement('span');
    description.className = 'event-calendar-featured-description';
    description.textContent = truncateText(event.description);

    if (meta.textContent) content.append(meta);
    content.append(title);
    if (description.textContent) content.append(description);
    card.append(buildEventImage(event, 'event-calendar-featured-image'), content);
    container.append(card);
  });
}

function renderGrid(grid, events, year, month, openModal) {
  grid.replaceChildren();

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayKey = buildDayKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const weekdaysRow = document.createElement('div');
  weekdaysRow.className = 'event-calendar-weekdays';
  WEEKDAYS.forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'event-calendar-weekday';
    cell.textContent = label;
    weekdaysRow.append(cell);
  });

  const daysEl = document.createElement('div');
  daysEl.className = 'event-calendar-days';

  for (let i = 0; i < firstDay; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'event-calendar-day is-empty';
    daysEl.append(empty);
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = buildDayKey(year, month, d);
    const dayEl = document.createElement('div');
    dayEl.className = `event-calendar-day${key === todayKey ? ' is-today' : ''}`;

    const numEl = document.createElement('span');
    numEl.className = 'event-calendar-day-number';
    numEl.textContent = d;
    dayEl.append(numEl);

    events.filter((ev) => eventCoversDay(ev, key)).forEach((ev) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'event-calendar-pill';
      pill.dataset.color = ev.color || 'blue';
      pill.textContent = ev.title;
      pill.addEventListener('click', () => openModal(ev));
      dayEl.append(pill);
    });

    daysEl.append(dayEl);
  }

  grid.append(weekdaysRow, daysEl);
}

function renderTable(container, heading, events, openModal, emptyMessage) {
  container.replaceChildren();

  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'event-calendar-empty';
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }

  if (heading) {
    const headingEl = document.createElement('h3');
    headingEl.className = 'event-calendar-table-heading';
    headingEl.textContent = heading;
    container.append(headingEl);
  }

  const wrap = document.createElement('div');
  wrap.className = 'event-calendar-table-wrap';

  const table = document.createElement('table');
  table.className = 'event-calendar-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Date', 'Time', 'Event', 'Location', 'City, State'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  });
  thead.append(headerRow);

  const tbody = document.createElement('tbody');
  events.forEach((event) => {
    const { venue, cityState } = locationParts(event);
    const row = document.createElement('tr');
    row.tabIndex = 0;
    row.role = 'button';
    row.setAttribute('aria-label', `View details for ${event.title || 'event'}`);
    row.addEventListener('click', () => openModal(event));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(event);
      }
    });

    [
      ['Date', formatTableDate(event)],
      ['Time', formatEventTime(event)],
      ['Event', event.title || 'Event'],
      ['Location', venue],
      ['City, State', cityState],
    ].forEach(([label, value]) => {
      const td = document.createElement('td');
      td.dataset.label = label;
      td.textContent = value;
      row.append(td);
    });

    tbody.append(row);
  });

  table.append(thead, tbody);
  wrap.append(table);
  container.append(wrap);
}

async function fetchEvents(config, params = {}) {
  const url = new URL('/api/events', `${config.apiBaseUrl}/`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

export default async function decorate(block) {
  const config = {
    heading: getFieldValue(block, 'heading', 0, DEFAULTS.heading),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 1, DEFAULTS.apiBaseUrl)),
    emptyMessage: getFieldValue(block, 'emptyMessage', 2, DEFAULTS.emptyMessage),
    defaultView: normalizeView(getFieldValue(block, 'defaultView', 3, DEFAULTS.defaultView)),
    tableHeading: getFieldValue(block, 'tableHeading', 4, DEFAULTS.tableHeading),
    featuredCount: normalizeCount(
      getFieldValue(block, 'featuredCount', 5, DEFAULTS.featuredCount),
      DEFAULTS.featuredCount,
    ),
    showFeaturedCards: normalizeVisibility(
      getFieldValue(block, 'showFeaturedCards', 6, DEFAULTS.showFeaturedCards),
      DEFAULTS.showFeaturedCards,
    ),
    showCalendarView: normalizeVisibility(
      getFieldValue(block, 'showCalendarView', 7, DEFAULTS.showCalendarView),
      DEFAULTS.showCalendarView,
    ),
    showTableView: normalizeVisibility(
      getFieldValue(block, 'showTableView', 8, DEFAULTS.showTableView),
      DEFAULTS.showTableView,
    ),
  };

  if (!config.showFeaturedCards && !config.showCalendarView && !config.showTableView) {
    config.showCalendarView = true;
  }

  const now = new Date();
  const state = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    view: resolveDefaultView(config.defaultView, config.showCalendarView, config.showTableView),
  };

  const inner = document.createElement('div');
  inner.className = 'event-calendar-inner';

  if (config.heading) {
    const headingEl = document.createElement('h2');
    headingEl.textContent = config.heading;
    inner.append(headingEl);
  }

  const featured = document.createElement('div');
  featured.className = 'event-calendar-featured';
  featured.hidden = true;

  const viewToggle = document.createElement('div');
  viewToggle.className = 'event-calendar-view-toggle';
  viewToggle.setAttribute('aria-label', 'Event view');

  const calendarToggle = document.createElement('button');
  calendarToggle.type = 'button';
  calendarToggle.textContent = 'Calendar';

  const tableToggle = document.createElement('button');
  tableToggle.type = 'button';
  tableToggle.textContent = 'Table';

  viewToggle.append(calendarToggle, tableToggle);

  const calendarPanel = document.createElement('div');
  calendarPanel.className = 'event-calendar-panel';
  calendarPanel.dataset.view = 'calendar';

  const controls = document.createElement('div');
  controls.className = 'event-calendar-controls';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'event-calendar-prev';
  prev.setAttribute('aria-label', 'Previous month');
  prev.textContent = '‹';

  const monthLabel = document.createElement('h3');
  monthLabel.className = 'event-calendar-month-label';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'event-calendar-next';
  next.setAttribute('aria-label', 'Next month');
  next.textContent = '›';

  controls.append(prev, monthLabel, next);

  const status = document.createElement('p');
  status.hidden = true;

  const grid = document.createElement('div');
  grid.className = 'event-calendar-grid';

  calendarPanel.append(controls, status, grid);

  const tablePanel = document.createElement('div');
  tablePanel.className = 'event-calendar-panel';
  tablePanel.dataset.view = 'table';

  const tableStatus = document.createElement('p');
  tableStatus.hidden = true;

  const tableContainer = document.createElement('div');
  tableContainer.className = 'event-calendar-table-container';
  tablePanel.append(tableStatus, tableContainer);

  const { modal, openModal } = createModal();

  inner.append(featured, viewToggle, calendarPanel, tablePanel, modal);
  block.replaceChildren(inner);

  function updateView() {
    const isTable = state.view === 'table';
    viewToggle.hidden = !(config.showCalendarView && config.showTableView);
    calendarPanel.hidden = !config.showCalendarView || isTable;
    tablePanel.hidden = !config.showTableView || !isTable;
    calendarToggle.setAttribute('aria-selected', isTable ? 'false' : 'true');
    tableToggle.setAttribute('aria-selected', isTable ? 'true' : 'false');
  }

  function updateMonthLabel() {
    monthLabel.textContent = `${MONTHS[state.month - 1]} ${state.year}`;
  }

  async function loadEvents() {
    setStatus(status, 'Loading events...', 'loading');
    prev.disabled = true;
    next.disabled = true;
    grid.replaceChildren();

    try {
      const events = await fetchEvents(config, { year: state.year, month: state.month });
      setStatus(status, '', '');
      renderGrid(grid, events, state.year, state.month, openModal);
      if (!events.length) {
        const empty = document.createElement('p');
        empty.className = 'event-calendar-empty';
        empty.textContent = config.emptyMessage;
        grid.append(empty);
      }
    } catch {
      setStatus(status, 'Events are unavailable at this time.', 'error');
    } finally {
      prev.disabled = false;
      next.disabled = false;
    }
  }

  async function loadEventListings() {
    setStatus(tableStatus, 'Loading events...', 'loading');
    tableContainer.replaceChildren();

    try {
      const events = activeListingEvents(await fetchEvents(config, { all: 1 }));
      setStatus(tableStatus, '', '');
      if (config.showFeaturedCards) {
        renderFeaturedEvents(featured, events, config.featuredCount, openModal);
      } else {
        featured.replaceChildren();
        featured.hidden = true;
      }
      if (config.showTableView) {
        renderTable(tableContainer, config.tableHeading, events, openModal, config.emptyMessage);
      }
    } catch {
      featured.hidden = true;
      setStatus(tableStatus, 'Events are unavailable at this time.', 'error');
    }
  }

  prev.addEventListener('click', () => {
    if (state.month === 1) { state.month = 12; state.year -= 1; } else { state.month -= 1; }
    updateMonthLabel();
    loadEvents();
  });

  next.addEventListener('click', () => {
    if (state.month === 12) { state.month = 1; state.year += 1; } else { state.month += 1; }
    updateMonthLabel();
    loadEvents();
  });

  calendarToggle.addEventListener('click', () => {
    state.view = 'calendar';
    updateView();
  });

  tableToggle.addEventListener('click', () => {
    state.view = 'table';
    updateView();
  });

  updateView();
  updateMonthLabel();
  if (config.showCalendarView) loadEvents();
  if (config.showFeaturedCards || config.showTableView) loadEventListings();
}
