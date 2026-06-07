/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env browser */
function sampleRUM(checkpoint, data) {
  // eslint-disable-next-line max-len
  const timeShift = () => (window.performance ? window.performance.now() : Date.now() - window.hlx.rum.firstReadTime);
  try {
    window.hlx = window.hlx || {};
    if (!window.hlx.rum || !window.hlx.rum.collector) {
      sampleRUM.enhance = () => {};
      const params = new URLSearchParams(window.location.search);
      const { currentScript } = document;
      const rate = params.get('rum')
        || window.SAMPLE_PAGEVIEWS_AT_RATE
        || params.get('optel')
        || (currentScript && currentScript.dataset.rate);
      const rateValue = {
        on: 1,
        off: 0,
        high: 10,
        low: 1000,
      }[rate];
      const weight = rateValue !== undefined ? rateValue : 100;
      const id = (window.hlx.rum && window.hlx.rum.id) || crypto.randomUUID().slice(-9);
      const isSelected = (window.hlx.rum && window.hlx.rum.isSelected)
        || (weight > 0 && Math.random() * weight < 1);
      // eslint-disable-next-line object-curly-newline, max-len
      window.hlx.rum = {
        weight,
        id,
        isSelected,
        firstReadTime: window.performance ? window.performance.timeOrigin : Date.now(),
        sampleRUM,
        queue: [],
        collector: (...args) => window.hlx.rum.queue.push(args),
      };
      if (isSelected) {
        const dataFromErrorObj = (error) => {
          const errData = { source: 'undefined error' };
          try {
            errData.target = error.toString();
            if (error.stack) {
              errData.source = error.stack
                .split('\n')
                .filter((line) => line.match(/https?:\/\//))
                .shift()
                .replace(/at ([^ ]+) \((.+)\)/, '$1@$2')
                .replace(/ at /, '@')
                .trim();
            }
          } catch (err) {
            /* error structure was not as expected */
          }
          return errData;
        };

        window.addEventListener('error', ({ error }) => {
          const errData = dataFromErrorObj(error);
          sampleRUM('error', errData);
        });

        window.addEventListener('unhandledrejection', ({ reason }) => {
          let errData = {
            source: 'Unhandled Rejection',
            target: reason || 'Unknown',
          };
          if (reason instanceof Error) {
            errData = dataFromErrorObj(reason);
          }
          sampleRUM('error', errData);
        });

        window.addEventListener('securitypolicyviolation', (e) => {
          if (e.blockedURI.includes('helix-rum-enhancer') && e.disposition === 'enforce') {
            const errData = {
              source: 'csp',
              target: e.blockedURI,
            };
            sampleRUM.sendPing('error', timeShift(), errData);
          }
        });

        sampleRUM.baseURL = sampleRUM.baseURL || new URL(window.RUM_BASE || '/', new URL('https://ot.aem.live'));
        sampleRUM.collectBaseURL = sampleRUM.collectBaseURL || sampleRUM.baseURL;
        sampleRUM.sendPing = (ck, time, pingData = {}) => {
          // eslint-disable-next-line max-len, object-curly-newline
          const rumData = JSON.stringify({
            weight,
            id,
            referer: window.location.href,
            checkpoint: ck,
            t: time,
            ...pingData,
          });
          const urlParams = window.RUM_PARAMS
            ? new URLSearchParams(window.RUM_PARAMS).toString() || ''
            : '';
          const { href: url, origin } = new URL(
            `.rum/${weight}${urlParams ? `?${urlParams}` : ''}`,
            sampleRUM.collectBaseURL,
          );
          const body = origin === window.location.origin
            ? new Blob([rumData], { type: 'application/json' })
            : rumData;
          navigator.sendBeacon(url, body);
          // eslint-disable-next-line no-console
          console.debug(`ping:${ck}`, pingData);
        };
        sampleRUM.sendPing('top', timeShift());

        sampleRUM.enhance = () => {
          // only enhance once
          if (document.querySelector('script[src*="rum-enhancer"]')) return;
          const { enhancerVersion, enhancerHash } = sampleRUM.enhancerContext || {};
          const script = document.createElement('script');
          if (enhancerHash) {
            script.integrity = enhancerHash;
            script.setAttribute('crossorigin', 'anonymous');
          }
          script.src = new URL(
            `.rum/@adobe/helix-rum-enhancer@${enhancerVersion || '^2'}/src/index.js`,
            sampleRUM.baseURL,
          ).href;
          document.head.appendChild(script);
        };
        if (!window.hlx.RUM_MANUAL_ENHANCE) {
          sampleRUM.enhance();
        }
      }
    }
    if (window.hlx.rum && window.hlx.rum.isSelected && checkpoint) {
      window.hlx.rum.collector(checkpoint, data, timeShift());
    }
    document.dispatchEvent(new CustomEvent('rum', { detail: { checkpoint, data } }));
  } catch (error) {
    // something went awry
  }
}

/**
 * Setup block utils.
 */
function setup() {
  window.hlx = window.hlx || {};
  window.hlx.RUM_MASK_URL = 'full';
  window.hlx.RUM_MANUAL_ENHANCE = true;
  window.hlx.codeBasePath = '';
  window.hlx.lighthouse = new URLSearchParams(window.location.search).get('lighthouse') === 'on';

  const scriptEl = document.querySelector('script[src$="/scripts/scripts.js"]');
  if (scriptEl) {
    try {
      const scriptURL = new URL(scriptEl.src, window.location);
      if (scriptURL.host === window.location.host) {
        [window.hlx.codeBasePath] = scriptURL.pathname.split('/scripts/scripts.js');
      } else {
        [window.hlx.codeBasePath] = scriptURL.href.split('/scripts/scripts.js');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
    }
  }
}

/**
 * Auto initialization.
 */

function init() {
  setup();
  sampleRUM.collectBaseURL = window.origin;
  sampleRUM();
}

/**
 * Sanitizes a string for use as class name.
 * @param {string} name The unsanitized string
 * @returns {string} The class name
 */
function toClassName(name) {
  return typeof name === 'string'
    ? name
      .toLowerCase()
      .replace(/[^0-9a-z]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    : '';
}

/**
 * Sanitizes a string for use as a js property name.
 * @param {string} name The unsanitized string
 * @returns {string} The camelCased name
 */
function toCamelCase(name) {
  return toClassName(name).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Extracts the config from a block.
 * @param {Element} block The block element
 * @returns {object} The block config
 */
// eslint-disable-next-line import/prefer-default-export
function readBlockConfig(block) {
  const config = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children) {
      const cols = [...row.children];
      if (cols[1]) {
        const col = cols[1];
        const name = toClassName(cols[0].textContent);
        let value = '';
        if (col.querySelector('a')) {
          const as = [...col.querySelectorAll('a')];
          if (as.length === 1) {
            value = as[0].href;
          } else {
            value = as.map((a) => a.href);
          }
        } else if (col.querySelector('img')) {
          const imgs = [...col.querySelectorAll('img')];
          if (imgs.length === 1) {
            value = imgs[0].src;
          } else {
            value = imgs.map((img) => img.src);
          }
        } else if (col.querySelector('p')) {
          const ps = [...col.querySelectorAll('p')];
          if (ps.length === 1) {
            value = ps[0].textContent;
          } else {
            value = ps.map((p) => p.textContent);
          }
        } else value = row.children[1].textContent;
        config[name] = value;
      }
    }
  });
  return config;
}

function cleanupFieldNode(node) {
  const row = node?.parentElement;
  if (row && row.children?.length === 2 && row.children[1] === node) {
    row.remove();
  } else if (node) {
    node.remove();
  }
}

function readSectionFieldValue(node) {
  if (!node) return '';

  const paragraphs = [...node.querySelectorAll('p')]
    .map((paragraph) => paragraph.textContent.trim())
    .filter(Boolean);
  if (paragraphs.length === 1) return paragraphs[0];
  if (paragraphs.length > 1) return paragraphs.join(', ');

  return node.textContent.trim();
}

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalized) && hexMatch) {
    return hexMatch[0];
  }

  return normalized;
}

function normalizeSectionFieldName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const SECTION_FIELD_LABELS = {
  name: ['name', 'sectionname'],
  anchorId: ['anchorid', 'anchor', 'sectionid', 'sectionanchor'],
  style: ['style', 'styles'],
  backgroundColor: ['backgroundcolor', 'sectionbackgroundcolor'],
  topSpacing: ['topspacing', 'margintop', 'sectiontopspacing'],
  bottomSpacing: ['bottomspacing', 'marginbottom', 'sectionbottomspacing'],
};

const SECTION_FIELDS = Object.keys(SECTION_FIELD_LABELS);

function findSectionLabeledField(section, name) {
  const acceptedLabels = SECTION_FIELD_LABELS[name] || [];
  const rows = [...section.querySelectorAll(':scope > div, :scope > div > div, :scope > div > div > div')]
    .filter((row) => row.children?.length === 2)
    .filter((row) => !row.closest('.block'));

  return rows.find((row) => (
    acceptedLabels.includes(normalizeSectionFieldName(row.children[0].textContent))
  )) || null;
}

function getSectionMetadata(section) {
  const meta = {};
  const sectionMeta = section.querySelector('div.section-metadata');

  if (sectionMeta) {
    Object.assign(meta, readBlockConfig(sectionMeta));
  }

  const sectionResource = section.getAttribute('data-aue-resource')
    || section.querySelector(':scope > [data-aue-resource]')?.getAttribute('data-aue-resource')
    || '';

  if (sectionResource) {
    SECTION_FIELDS.forEach((name) => {
      const selector = `[data-aue-resource="${sectionResource}"][data-aue-prop="${name}"]`;
      const node = section.querySelector(selector)
        || section.querySelector(`[data-aue-prop="${name}"]`);
      if (!node) return;

      const value = readSectionFieldValue(node);
      if (value) {
        meta[name] = name === 'backgroundColor' ? normalizeColorValue(value) : value;
      }

      cleanupFieldNode(node);
    });
  }

  SECTION_FIELDS.forEach((name) => {
    if (meta[name]) return;
    const row = findSectionLabeledField(section, name);
    if (!row) return;

    const value = readSectionFieldValue(row.children[1]);
    if (value) {
      meta[name] = name === 'backgroundColor' ? normalizeColorValue(value) : value;
    }
    row.remove();
  });

  const existingBackgroundColor = normalizeColorValue(
    section.getAttribute('data-background-color')
    || section.getAttribute('data-backgroundcolor'),
  );
  if (existingBackgroundColor && !meta.backgroundColor) {
    meta.backgroundColor = existingBackgroundColor;
  }

  [
    ['topSpacing', 'data-top-spacing', 'data-topspacing'],
    ['bottomSpacing', 'data-bottom-spacing', 'data-bottomspacing'],
  ].forEach(([name, dashAttr, compactAttr]) => {
    if (meta[name]) return;
    meta[name] = section.getAttribute(dashAttr)
      || section.getAttribute(compactAttr)
      || '';
  });

  if (sectionMeta) {
    sectionMeta.parentNode.remove();
  }

  return meta;
}

/**
 * Loads a CSS file.
 * @param {string} href URL to the CSS file
 */
async function loadCSS(href) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    } else {
      resolve();
    }
  });
}

/**
 * Loads a non module JS file.
 * @param {string} src URL to the JS file
 * @param {Object} attrs additional optional attributes
 */
async function loadScript(src, attrs) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      if (attrs) {
        // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const attr in attrs) {
          script.setAttribute(attr, attrs[attr]);
        }
      }
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    } else {
      resolve();
    }
  });
}

/**
 * Retrieves the content of metadata tags.
 * @param {string} name The metadata name (or property)
 * @param {Document} doc Document object to query for metadata. Defaults to the window's document
 * @returns {string} The metadata value(s)
 */
function getMetadata(name, doc = document) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = [...doc.head.querySelectorAll(`meta[${attr}="${name}"]`)]
    .map((m) => m.content)
    .join(', ');
  return meta || '';
}

/**
 * Returns a picture element with webp and fallbacks
 * @param {string} src The image URL
 * @param {string} [alt] The image alternative text
 * @param {boolean} [eager] Set loading attribute to eager
 * @param {Array} [breakpoints] Breakpoints and corresponding params (eg. width)
 * @returns {Element} The picture element
 */
function createOptimizedPicture(
  src,
  alt = '',
  eager = false,
  breakpoints = [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }],
) {
  const url = new URL(src, window.location.href);
  const picture = document.createElement('picture');
  const { pathname } = url;
  const ext = pathname.substring(pathname.lastIndexOf('.') + 1);

  // webp
  breakpoints.forEach((br) => {
    const source = document.createElement('source');
    if (br.media) source.setAttribute('media', br.media);
    source.setAttribute('type', 'image/webp');
    source.setAttribute('srcset', `${pathname}?width=${br.width}&format=webp&optimize=medium`);
    picture.appendChild(source);
  });

  // fallback
  breakpoints.forEach((br, i) => {
    if (i < breakpoints.length - 1) {
      const source = document.createElement('source');
      if (br.media) source.setAttribute('media', br.media);
      source.setAttribute('srcset', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      picture.appendChild(source);
    } else {
      const img = document.createElement('img');
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      img.setAttribute('alt', alt);
      picture.appendChild(img);
      img.setAttribute('src', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
    }
  });

  return picture;
}

/**
 * Set template (page structure) and theme (page styles).
 */
function decorateTemplateAndTheme() {
  const addClasses = (element, classes) => {
    classes.split(',').forEach((c) => {
      element.classList.add(toClassName(c.trim()));
    });
  };
  const template = getMetadata('template');
  if (template) addClasses(document.body, template);
  const theme = getMetadata('theme');
  if (theme) addClasses(document.body, theme);
}

const COLUMN_NESTED_BLOCK_SELECTOR = [
  '[data-aue-model]',
  '[data-aue-resource][data-aue-type="component"]',
  '[data-aue-resource][data-aue-behavior="component"]',
  '.colored-button',
  '.colored-list',
  '.colored-text',
].join(', ');

/**
 * Wrap inline text content of block cells within a <p> tag.
 * @param {Element} block the block element
 */
function wrapTextNodes(block) {
  const validWrappers = [
    'P',
    'PRE',
    'UL',
    'OL',
    'PICTURE',
    'TABLE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HR',
  ];

  const hasComponentContent = (element) => element.matches?.(COLUMN_NESTED_BLOCK_SELECTOR)
    || element.querySelector?.(COLUMN_NESTED_BLOCK_SELECTOR);

  const isColumnsAuthoringCell = (element) => block.dataset.blockName === 'columns'
    && (
      element.matches('[data-aue-filter="column"], [data-aue-label="Column"]')
      || element.querySelector(':scope > [data-aue-filter="column"], :scope > [data-aue-label="Column"]')
    );

  const wrap = (el) => {
    const wrapper = document.createElement('p');
    wrapper.append(...el.childNodes);
    [...el.attributes]
      // move the instrumentation from the cell to the new paragraph, also keep the class
      // in case the content is a buttton and the cell the button-container
      .filter(({ nodeName }) => nodeName === 'class'
        || nodeName.startsWith('data-aue')
        || nodeName.startsWith('data-richtext'))
      .forEach(({ nodeName, nodeValue }) => {
        wrapper.setAttribute(nodeName, nodeValue);
        el.removeAttribute(nodeName);
      });
    el.append(wrapper);
  };

  block.querySelectorAll(':scope > div > div').forEach((blockColumn) => {
    if (blockColumn.hasChildNodes()) {
      if (hasComponentContent(blockColumn) || isColumnsAuthoringCell(blockColumn)) return;

      const hasWrapper = !!blockColumn.firstElementChild
        && validWrappers.some((tagName) => blockColumn.firstElementChild.tagName === tagName);
      if (!hasWrapper) {
        wrap(blockColumn);
      } else if (
        blockColumn.firstElementChild.tagName === 'PICTURE'
        && (blockColumn.children.length > 1 || !!blockColumn.textContent.trim())
      ) {
        wrap(blockColumn);
      }
    }
  });
}

/**
 * Decorates paragraphs containing a single link as buttons.
 * @param {Element} element container element
 */
function decorateButtons(element) {
  element.querySelectorAll('a').forEach((a) => {
    a.title = a.title || a.textContent;
    if (a.href !== a.textContent) {
      const up = a.parentElement;
      const twoup = a.parentElement.parentElement;
      if (!a.querySelector('img')) {
        if (up.childNodes.length === 1 && (up.tagName === 'P' || up.tagName === 'DIV')) {
          a.classList.add('button'); // default
          up.classList.add('button-container');
        }
        if (
          up.childNodes.length === 1
          && up.tagName === 'STRONG'
          && twoup.childNodes.length === 1
          && twoup.tagName === 'P'
        ) {
          a.classList.add('button', 'primary');
          twoup.classList.add('button-container');
        }
        if (
          up.childNodes.length === 1
          && up.tagName === 'EM'
          && twoup.childNodes.length === 1
          && twoup.tagName === 'P'
        ) {
          a.classList.add('button', 'secondary');
          twoup.classList.add('button-container');
        }
      }
    }
  });
}

/**
 * Add <img> for icon, prefixed with codeBasePath and optional prefix.
 * @param {Element} [span] span element with icon classes
 * @param {string} [prefix] prefix to be added to icon src
 * @param {string} [alt] alt text to be added to icon
 */
function decorateIcon(span, prefix = '', alt = '') {
  const iconName = Array.from(span.classList)
    .find((c) => c.startsWith('icon-'))
    .substring(5);
  const img = document.createElement('img');
  img.dataset.iconName = iconName;
  img.src = `${window.hlx.codeBasePath}${prefix}/icons/${iconName}.svg`;
  img.alt = alt;
  img.loading = 'lazy';
  img.width = 16;
  img.height = 16;
  span.append(img);
}

/**
 * Add <img> for icons, prefixed with codeBasePath and optional prefix.
 * @param {Element} [element] Element containing icons
 * @param {string} [prefix] prefix to be added to icon the src
 */
function decorateIcons(element, prefix = '') {
  const icons = element.querySelectorAll('span.icon');
  icons.forEach((span) => {
    decorateIcon(span, prefix);
  });
}

/**
 * Decorates all sections in a container element.
 * @param {Element} main The container element
 */
function decorateSections(main) {
  main.querySelectorAll(':scope > div:not([data-section-status])').forEach((section) => {
    const wrappers = [];
    let defaultContent = false;
    [...section.children].forEach((e) => {
      if ((e.tagName === 'DIV' && e.className) || !defaultContent) {
        const wrapper = document.createElement('div');
        wrappers.push(wrapper);
        defaultContent = e.tagName !== 'DIV' || !e.className;
        if (defaultContent) wrapper.classList.add('default-content-wrapper');
      }
      wrappers[wrappers.length - 1].append(e);
    });
    wrappers.forEach((wrapper) => section.append(wrapper));
    section.classList.add('section');
    section.dataset.sectionStatus = 'initialized';
    section.style.display = 'none';

    const meta = getSectionMetadata(section);
    Object.keys(meta).forEach((key) => {
      const camelKey = key.includes('-') ? toCamelCase(key) : key;
      if (camelKey === 'style') {
        const styles = String(meta[key] || '')
          .split(',')
          .filter((style) => style)
          .map((style) => toClassName(style.trim()));
        styles.forEach((style) => section.classList.add(style));
      } else if (camelKey === 'anchorId') {
        const value = toClassName(String(meta[key] || '').replace(/^#/, ''));
        if (value) section.id = value;
      } else if (camelKey === 'backgroundColor') {
        const value = normalizeColorValue(meta[key]);
        if (value) {
          section.style.backgroundColor = value;
          [...section.querySelectorAll(':scope > div')].forEach((wrapper) => {
            wrapper.style.backgroundColor = value;
          });
          section.setAttribute('data-background-color', value);
          section.setAttribute('data-backgroundcolor', value);
        }
      } else {
        section.dataset[camelKey] = meta[key];
      }
    });
  });
}

/**
 * Builds a block DOM Element from a two dimensional array, string, or object
 * @param {string} blockName name of the block
 * @param {*} content two dimensional array or string or object of content
 */
function buildBlock(blockName, content) {
  const table = Array.isArray(content) ? content : [[content]];
  const blockEl = document.createElement('div');
  // build image block nested div structure
  blockEl.classList.add(blockName);
  table.forEach((row) => {
    const rowEl = document.createElement('div');
    row.forEach((col) => {
      const colEl = document.createElement('div');
      const vals = col.elems ? col.elems : [col];
      vals.forEach((val) => {
        if (val) {
          if (typeof val === 'string') {
            colEl.innerHTML += val;
          } else {
            colEl.appendChild(val);
          }
        }
      });
      rowEl.appendChild(colEl);
    });
    blockEl.appendChild(rowEl);
  });
  return blockEl;
}

function extractResourceURL(error) {
  const target = error?.target || error?.currentTarget;
  if (target?.href) return target.href;

  if (typeof error?.message === 'string') {
    const match = error.message.match(/https?:\/\/\S+/);
    if (match) return match[0].replace(/[).,;]+$/, '');
  }

  return '';
}

function compactHTML(element, maxLength = 320) {
  if (!element?.outerHTML) return '';
  return element.outerHTML.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function logBlockLoadError(block, blockName, phase, error, resourceURL = '') {
  const section = block.closest('.section');
  const wrapper = block.parentElement;
  const url = resourceURL || extractResourceURL(error);

  // eslint-disable-next-line no-console
  console.error(`[hlx:block-load] Failed to load "${blockName}" (${phase}).`, {
    page: window.location.href,
    blockName,
    phase,
    resourceURL: url,
    blockClasses: [...block.classList],
    sectionClasses: section ? [...section.classList] : [],
    wrapperClasses: wrapper ? [...wrapper.classList] : [],
    blockHTML: compactHTML(block),
    wrapperHTML: compactHTML(wrapper),
  }, error);
}

const CUSTOM_REVEAL_BLOCKS = new Set([
  'code-adam-kit',
  'community-education-partner-reporting',
  'connect-grid',
  'event-request-form',
  'faon-application',
  'hero-footer',
  'historical-reports-carousel',
  'historical-trends',
  'host-a-fundraiser',
  'impact-donut',
  'info-cards-grid',
  'missing-child-poster-api-registration',
  'missing-child-quick-report',
  'ncmec-reprint-request',
  'numbered-cards',
  'regional-offices',
  'report-breakdown',
  'report-download',
  'support-cta',
  'team-hope-volunteer',
  'text-image',
]);

const COLUMN_NESTED_BLOCK_NAMES = new Set([
  'colored-button',
  'colored-list',
  'colored-text',
]);

let blockRevealObserver;

function revealBlock(block) {
  block.classList.add('is-visible');
}

function observeBlockReveal(block) {
  if (!block.closest('main') || block.classList.contains('no-scroll-reveal')) return;

  if (!CUSTOM_REVEAL_BLOCKS.has(block.dataset.blockName)) {
    block.classList.add('scroll-reveal');
  }

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealBlock(block);
    return;
  }

  block.addEventListener('focusin', () => revealBlock(block), { once: true });

  blockRevealObserver ||= new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      revealBlock(entry.target);
      blockRevealObserver.unobserve(entry.target);
    });
  }, {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.16,
  });

  blockRevealObserver.observe(block);
}

/**
 * Loads JS and CSS for a block.
 * @param {Element} block The block element
 */
async function loadBlock(block) {
  const status = block.dataset.blockStatus;
  if (status !== 'loading' && status !== 'loaded') {
    block.dataset.blockStatus = 'loading';
    const { blockName } = block.dataset;
    let hasDetailedError = false;
    const captureError = (phase, error, resourceURL = '') => {
      hasDetailedError = true;
      logBlockLoadError(block, blockName, phase, error, resourceURL);
    };

    try {
      const cssURL = `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`;
      const moduleURL = `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.js`;
      const cssLoaded = loadCSS(cssURL).catch((error) => {
        captureError('css', error, cssURL);
        throw error;
      });
      const decorationComplete = new Promise((resolve) => {
        (async () => {
          try {
            const mod = await import(moduleURL);
            if (mod.default) {
              await mod.default(block);
            }
          } catch (error) {
            captureError('module', error, moduleURL);
          }
          resolve();
        })();
      });
      await Promise.all([cssLoaded, decorationComplete]);
    } catch (error) {
      if (!hasDetailedError) {
        captureError('block', error);
      }
    }
    block.dataset.blockStatus = 'loaded';
    observeBlockReveal(block);
    // eslint-disable-next-line no-use-before-define
    await loadNestedBlocks(block);
  }
  return block;
}

function normalizeBlockNameCandidate(value) {
  return toClassName(value).replace(/-\d{4,}$/u, '');
}

function getResourceSegments(resource) {
  if (!resource) return [];
  const match = resource.match(/(\/content\/[^?#]+)/);
  const normalizedPath = (match ? match[1] : resource).replace(/\/+$/g, '');
  return normalizedPath.split('/').filter(Boolean);
}

function getResourceBlockName(element) {
  if (!element) return '';
  const resource = element.getAttribute('data-aue-resource') || '';
  const propName = normalizeBlockNameCandidate(element.getAttribute('data-aue-prop') || '');
  const segments = getResourceSegments(resource);
  if (!segments.length) return '';
  const lastSegment = normalizeBlockNameCandidate(segments[segments.length - 1]);
  if (propName && lastSegment === propName && segments.length > 1) {
    return normalizeBlockNameCandidate(segments[segments.length - 2]);
  }
  return lastSegment;
}

function getBlockName(block) {
  const modelValue = block.querySelector('[data-aue-prop="model"]')?.textContent.trim() || '';
  const componentIdValue = block.querySelector('[data-aue-prop="aueComponentId"]')?.textContent.trim() || '';
  const resourceField = block.querySelector('[data-aue-resource]');
  const classCandidates = [...block.classList]
    .map((className) => normalizeBlockNameCandidate(className))
    .filter((className) => className && className !== 'block');

  return normalizeBlockNameCandidate(
    modelValue
    || block.getAttribute('data-aue-model')
    || getResourceBlockName(block)
    || getResourceBlockName(resourceField)
    || componentIdValue
    || block.getAttribute('data-aue-component-id')
    || block.getAttribute('data-block-name')
    || classCandidates[0]
    || '',
  );
}

function isNestedBlockCandidate(candidate, columnsBlock) {
  if (candidate === columnsBlock) return false;
  if (candidate.classList.contains('block')) return false;
  if (candidate.hasAttribute('data-aue-prop') || candidate.hasAttribute('data-richtext-prop')) return false;

  const parentBlock = candidate.parentElement?.closest('.block');
  return !parentBlock || parentBlock === columnsBlock;
}

function replaceTag(element, tagName) {
  const replacement = document.createElement(tagName);
  [...element.attributes].forEach(({ name, value }) => replacement.setAttribute(name, value));
  replacement.append(...element.childNodes);
  element.replaceWith(replacement);
  return replacement;
}

function normalizeColumnAuthoringContainers(columnsBlock) {
  columnsBlock
    .querySelectorAll(':scope > div > div > p[data-aue-filter="column"], :scope > div > div > p[data-aue-label="Column"]')
    .forEach((columnContainer) => {
      if (!columnContainer.querySelector(COLUMN_NESTED_BLOCK_SELECTOR)) return;
      replaceTag(columnContainer, 'div');
    });
}

function decorateNestedBlocks(root) {
  const columnsBlocks = root.matches?.('.columns.block') ? [root] : [...root.querySelectorAll('.columns.block')];

  columnsBlocks.forEach((columnsBlock) => {
    normalizeColumnAuthoringContainers(columnsBlock);

    columnsBlock.querySelectorAll(':scope > div > div').forEach((column) => {
      column.querySelectorAll(COLUMN_NESTED_BLOCK_SELECTOR).forEach((candidate) => {
        if (!isNestedBlockCandidate(candidate, columnsBlock)) return;

        const nestedBlockName = getBlockName(candidate);
        if (!COLUMN_NESTED_BLOCK_NAMES.has(nestedBlockName)) return;

        // eslint-disable-next-line no-use-before-define
        decorateBlock(candidate);
      });
    });
  });
}

async function loadNestedBlocks(root) {
  decorateNestedBlocks(root);

  const nestedBlocks = [...root.querySelectorAll(':scope .block')]
    .filter((nestedBlock) => nestedBlock.dataset.blockStatus === 'initialized');

  for (let i = 0; i < nestedBlocks.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadBlock(nestedBlocks[i]);
  }
}

/**
 * Decorates a block.
 * @param {Element} block The block element
 */
function decorateBlock(block) {
  const shortBlockName = getBlockName(block);

  if (shortBlockName && !block.dataset.blockStatus) {
    if (!block.classList.contains(shortBlockName)) {
      block.classList.add(shortBlockName);
    }
    block.classList.add('block');
    block.dataset.blockName = shortBlockName;
    block.dataset.blockStatus = 'initialized';
    wrapTextNodes(block);
    const blockWrapper = block.parentElement;
    blockWrapper.classList.add(`${shortBlockName}-wrapper`);
    const section = block.closest('.section');
    if (section) section.classList.add(`${shortBlockName}-container`);
    // eslint-disable-next-line no-use-before-define
    decorateButtons(block);
  }
}

/**
 * Decorates all blocks in a container element.
 * @param {Element} main The container element
 */
function decorateBlocks(main) {
  main.querySelectorAll('div.section > div > div').forEach(decorateBlock);
  decorateNestedBlocks(main);
}

/**
 * Loads a block named 'header' into header
 * @param {Element} header header element
 * @returns {Promise}
 */
async function loadHeader(header) {
  const headerBlock = buildBlock('header', '');
  header.append(headerBlock);
  decorateBlock(headerBlock);
  return loadBlock(headerBlock);
}

/**
 * Loads a block named 'footer' into footer
 * @param footer footer element
 * @returns {Promise}
 */
async function loadFooter(footer) {
  const footerBlock = buildBlock('footer', '');
  footer.append(footerBlock);
  decorateBlock(footerBlock);
  return loadBlock(footerBlock);
}

/**
 * Loads a block named 'get-help' into a host element
 * @param {Element} host host element
 * @returns {Promise}
 */
async function loadGetHelp(host) {
  const getHelpBlock = buildBlock('get-help', '');
  host.append(getHelpBlock);
  decorateBlock(getHelpBlock);
  return loadBlock(getHelpBlock);
}

/**
 * Loads a block named 'cookie-consent' into a host element
 * @param {Element} host host element
 * @returns {Promise}
 */
async function loadCookieConsent(host) {
  const cookieConsentBlock = buildBlock('cookie-consent', '');
  host.append(cookieConsentBlock);
  decorateBlock(cookieConsentBlock);
  return loadBlock(cookieConsentBlock);
}

/**
 * Wait for Image.
 * @param {Element} section section element
 */
async function waitForFirstImage(section) {
  const lcpCandidate = section.querySelector('img');
  await new Promise((resolve) => {
    if (lcpCandidate && !lcpCandidate.complete) {
      lcpCandidate.setAttribute('loading', 'eager');
      lcpCandidate.addEventListener('load', resolve);
      lcpCandidate.addEventListener('error', resolve);
    } else {
      resolve();
    }
  });
}

/**
 * Loads all blocks in a section.
 * @param {Element} section The section element
 */

async function loadSection(section, loadCallback) {
  const status = section.dataset.sectionStatus;
  if (!status || status === 'initialized') {
    section.dataset.sectionStatus = 'loading';
    const blocks = [...section.querySelectorAll('div.block')];
    for (let i = 0; i < blocks.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await loadBlock(blocks[i]);
    }
    if (loadCallback) await loadCallback(section);
    section.dataset.sectionStatus = 'loaded';
    section.style.display = null;
  }
}

/**
 * Loads all sections.
 * @param {Element} element The parent element of sections to load
 */

async function loadSections(element) {
  const sections = [...element.querySelectorAll('div.section')];
  for (let i = 0; i < sections.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadSection(sections[i]);
    if (i === 0 && sampleRUM.enhance) {
      sampleRUM.enhance();
    }
  }
}

init();

export {
  buildBlock,
  createOptimizedPicture,
  decorateBlock,
  decorateBlocks,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateTemplateAndTheme,
  getMetadata,
  loadBlock,
  loadNestedBlocks,
  loadCookieConsent,
  loadCSS,
  loadFooter,
  loadGetHelp,
  loadHeader,
  loadScript,
  loadSection,
  loadSections,
  readBlockConfig,
  sampleRUM,
  setup,
  toCamelCase,
  toClassName,
  waitForFirstImage,
  wrapTextNodes,
};
