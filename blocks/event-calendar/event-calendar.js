import {
  getBlockRows,
  readLinkField,
  readTextField,
} from '../../scripts/block-field-utils.js';

const DEFAULTS = {
  heading: '',
  apiBaseUrl: 'https://stunning-dust-ntqeawud3dqy.on-vapor.com',
  emptyMessage: 'No events this month.',
};

const FIELD_LABELS = {
  heading: ['heading', 'title'],
  apiBaseUrl: ['api base url', 'api url', 'backend url'],
  emptyMessage: ['empty message', 'no events message'],
};

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

  const titleEl = document.createElement('h3');
  titleEl.id = 'event-calendar-modal-title';

  const whenEl = document.createElement('time');
  whenEl.className = 'event-calendar-modal-time';

  const locationEl = document.createElement('p');
  locationEl.className = 'event-calendar-modal-location';

  const descriptionEl = document.createElement('p');
  descriptionEl.className = 'event-calendar-modal-description';

  const imgEl = document.createElement('img');
  imgEl.className = 'event-calendar-modal-image';
  imgEl.loading = 'lazy';

  const linkEl = document.createElement('a');
  linkEl.className = 'event-calendar-modal-link';
  linkEl.target = '_blank';
  linkEl.rel = 'noopener noreferrer';
  linkEl.textContent = 'Learn more';

  inner.append(closeBtn, titleEl, whenEl, locationEl, descriptionEl, imgEl, linkEl);
  modal.append(inner);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  });

  function openModal(event) {
    titleEl.textContent = event.title;

    const datePart = event.start_datetime
      ? new Date(event.start_datetime).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
      : '';
    const timePart = event.start_time || '';
    const endTimePart = event.end_time ? ` – ${event.end_time}` : '';
    whenEl.setAttribute('datetime', event.start_datetime || '');
    whenEl.textContent = timePart ? `${datePart} · ${timePart}${endTimePart}` : datePart;
    whenEl.hidden = !datePart;

    locationEl.textContent = event.location || '';
    locationEl.hidden = !event.location;

    descriptionEl.textContent = event.description || '';
    descriptionEl.hidden = !event.description;

    imgEl.src = event.image_url || '';
    imgEl.alt = event.title;
    imgEl.hidden = !event.image_url;

    linkEl.href = event.external_url || '#';
    linkEl.hidden = !event.external_url;

    modal.showModal();
  }

  return { modal, openModal };
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

export default async function decorate(block) {
  const config = {
    heading: getFieldValue(block, 'heading', 0, DEFAULTS.heading),
    apiBaseUrl: normalizeApiBaseUrl(getFieldValue(block, 'apiBaseUrl', 1, DEFAULTS.apiBaseUrl)),
    emptyMessage: getFieldValue(block, 'emptyMessage', 2, DEFAULTS.emptyMessage),
  };

  const now = new Date();
  const state = { year: now.getFullYear(), month: now.getMonth() + 1 };

  const inner = document.createElement('div');
  inner.className = 'event-calendar-inner';

  if (config.heading) {
    const headingEl = document.createElement('h2');
    headingEl.textContent = config.heading;
    inner.append(headingEl);
  }

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

  const { modal, openModal } = createModal();

  inner.append(controls, status, grid, modal);
  block.replaceChildren(inner);

  function updateMonthLabel() {
    monthLabel.textContent = `${MONTHS[state.month - 1]} ${state.year}`;
  }

  async function loadEvents() {
    setStatus(status, 'Loading events...', 'loading');
    prev.disabled = true;
    next.disabled = true;
    grid.replaceChildren();

    try {
      const url = new URL('/api/events', `${config.apiBaseUrl}/`);
      url.searchParams.set('year', state.year);
      url.searchParams.set('month', state.month);
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const events = Array.isArray(payload?.data) ? payload.data : [];
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

  updateMonthLabel();
  loadEvents();
}
