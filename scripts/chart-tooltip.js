/**
 * The hover readout the data blocks share (impact-donut, report-breakdown, historical-trends,
 * impact-bar-chart), so every chart on the site answers a pointer the same way.
 *
 * Value first, then the label keyed by a short stroke of the mark's colour, then an optional
 * detail line (a share, a change). Styles live in styles/lazy-styles.css: the readout only
 * appears on interaction, long after first paint.
 *
 * Everything it shows must also be reachable without it — a legend, a table, an aria-label —
 * so it is aria-hidden. It enhances the chart; it never gates a number.
 */

function buildKey(color) {
  const key = document.createElement('span');
  key.className = 'chart-tooltip-key';
  key.setAttribute('aria-hidden', 'true');
  key.style.setProperty('--chart-tooltip-key-color', color);
  return key;
}

/**
 * @param {HTMLElement} host positioned element the readout is placed in (position: relative)
 * @returns {{ show: Function, hide: Function, element: HTMLElement }}
 */
export default function createChartTooltip(host) {
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.hidden = true;
  host.append(tooltip);

  return {
    element: tooltip,

    /**
     * @param {{ value: string, label?: string, color?: string, detail?: string }} content
     * @param {number} x anchor, px from the host's left edge
     * @param {number} y anchor, px from the host's top edge; the readout sits above it
     */
    show({
      value, label = '', color = '', detail = '',
    }, x, y) {
      const valueEl = document.createElement('strong');
      valueEl.className = 'chart-tooltip-value';
      valueEl.textContent = value;
      const parts = [valueEl];

      if (label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'chart-tooltip-label';
        if (color) labelEl.append(buildKey(color));
        labelEl.append(document.createTextNode(label));
        parts.push(labelEl);
      }

      if (detail) {
        const detailEl = document.createElement('span');
        detailEl.className = 'chart-tooltip-detail';
        detailEl.textContent = detail;
        parts.push(detailEl);
      }

      tooltip.replaceChildren(...parts);
      tooltip.hidden = false;

      // Keep it inside the host: clamp sideways, and drop below the anchor when there is
      // no room above it.
      const { width, height } = tooltip.getBoundingClientRect();
      const hostWidth = host.clientWidth;
      const half = width / 2;
      const left = hostWidth > width ? Math.min(Math.max(x, half), hostWidth - half) : x;
      tooltip.classList.toggle('is-below', y - height - 12 < 0);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${y}px`;
    },

    hide() {
      tooltip.hidden = true;
    },
  };
}

/**
 * A number the way the charts print it: grouped digits, no trailing decimals.
 * @param {number} value
 * @returns {string}
 */
export function formatChartNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '';
}

/**
 * A share of a total as a whole percent, with "<1%" rather than a misleading "0%".
 * @param {number} value
 * @param {number} total
 * @returns {string}
 */
export function formatChartShare(value, total) {
  if (!total || !Number.isFinite(value)) return '';
  const percent = (value / total) * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}
