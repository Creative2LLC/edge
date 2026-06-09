import {
  decorateBlock,
  decorateBlocks,
  decorateButtons,
  decorateIcons,
  decorateSections,
  loadBlock,
  loadNestedBlocks,
  loadScript,
  loadSections,
} from './aem.js';
import { decorateRichtext } from './editor-support-rte.js';
import {
  applyDefaultContentAuthorStyles,
  applyImageLinks,
  applySectionSpacing,
  decorateMain,
  decoratePdfLinks,
} from './scripts.js';

const SECTION_BACKGROUND_FALLBACKS = {
  'leadership-overview': '#f4f1ec',
  'partners-showcase': '#ffffff',
  'trust-badges': '#ffffff',
};

const blockBackgroundColorCache = new Map();

function normalizeColorValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hexMatch = normalized.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/i);
  if (/^https?:/i.test(normalized) && hexMatch) {
    return hexMatch[0];
  }

  return normalized;
}

function getSectionBackgroundColor(section) {
  if (!section) return '';

  return normalizeColorValue(
    section.getAttribute('data-background-color')
      || section.getAttribute('data-backgroundcolor'),
  );
}

function applySectionBackground(section, backgroundColor) {
  if (!section) return;

  const value = normalizeColorValue(backgroundColor);
  const wrappers = [...section.querySelectorAll(':scope > div')];

  if (!value) {
    section.style.removeProperty('background-color');
    wrappers.forEach((wrapper) => wrapper.style.removeProperty('background-color'));
    return;
  }

  section.style.backgroundColor = value;
  wrappers.forEach((wrapper) => {
    wrapper.style.backgroundColor = value;
  });
  section.setAttribute('data-background-color', value);
  section.setAttribute('data-backgroundcolor', value);
}

function getSectionBackgroundFallback(block) {
  const blockName = block.dataset.blockName || '';
  if (SECTION_BACKGROUND_FALLBACKS[blockName]) return SECTION_BACKGROUND_FALLBACKS[blockName];

  const matchedClassName = Object.keys(SECTION_BACKGROUND_FALLBACKS)
    .find((className) => block.classList.contains(className));
  return matchedClassName ? SECTION_BACKGROUND_FALLBACKS[matchedClassName] : '';
}

function resourcePathFromUrn(resource) {
  if (!resource) return '';
  if (resource.startsWith('/')) return resource;
  const match = resource.match(/(\/content\/[^?#]+)/);
  return match ? match[1] : '';
}

async function getExplicitBlockBackgroundColor(block) {
  const resourcePath = resourcePathFromUrn(block.getAttribute('data-aue-resource') || '');
  if (!resourcePath) return '';
  if (blockBackgroundColorCache.has(resourcePath)) {
    return blockBackgroundColorCache.get(resourcePath);
  }

  const pendingColor = fetch(`${resourcePath}.json`)
    .then(async (response) => {
      if (!response.ok) return '';
      const data = await response.json();
      return normalizeColorValue(data.backgroundColor);
    })
    .catch(() => '');

  blockBackgroundColorCache.set(resourcePath, pendingColor);
  return pendingColor;
}

async function syncBlockBackground(block, sectionBackgroundColor) {
  const fallbackColor = getSectionBackgroundFallback(block);
  if (!fallbackColor) return;

  const explicitColor = await getExplicitBlockBackgroundColor(block);
  block.style.backgroundColor = explicitColor || (sectionBackgroundColor ? 'transparent' : fallbackColor);
}

async function syncSectionBackgrounds(scope) {
  if (!scope) return;

  const sections = scope.matches?.('.section') ? [scope] : [...scope.querySelectorAll('.section')];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const backgroundColor = getSectionBackgroundColor(section);
    applySectionBackground(section, backgroundColor);

    const blocks = [...section.querySelectorAll(':scope > div > .block')];
    for (let j = 0; j < blocks.length; j += 1) {
      // eslint-disable-next-line no-await-in-loop
      await syncBlockBackground(blocks[j], backgroundColor);
    }
  }
}

function isAuthoringFieldElement(element) {
  return Boolean(element?.hasAttribute?.('data-aue-prop') || element?.hasAttribute?.('data-richtext-prop'));
}

function authoringFieldName(element) {
  return element?.getAttribute?.('data-aue-prop')
    || element?.getAttribute?.('data-richtext-prop')
    || '';
}

function copyAuthoringAttributes(target, source) {
  [...target.attributes]
    .filter(({ name }) => name.startsWith('data-aue') || name.startsWith('data-richtext'))
    .forEach(({ name }) => target.removeAttribute(name));

  [...source.attributes]
    .filter(({ name }) => name.startsWith('data-aue') || name.startsWith('data-richtext'))
    .forEach(({ name, value }) => target.setAttribute(name, value));
}

function replaceFieldContent(target, replacement) {
  copyAuthoringAttributes(target, replacement);
  target.replaceChildren(...replacement.childNodes);
  decorateRichtext(target);
}

async function applyChanges(event) {
  // redecorate default content and blocks on patches (in the properties rail)
  const { detail } = event;

  const resource = detail?.request?.target?.resource // update, patch components
    || detail?.request?.target?.container?.resource // update, patch, add to sections
    || detail?.request?.to?.container?.resource; // move in sections
  if (!resource) return false;
  const updates = detail?.response?.updates;
  if (!updates.length) return false;
  const { content } = updates[0];
  if (!content) return false;

  // load dompurify
  await loadScript(`${window.hlx.codeBasePath}/scripts/dompurify.min.js`);

  const sanitizedContent = window.DOMPurify.sanitize(content, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['class'],
  });
  const parsedUpdate = new DOMParser().parseFromString(sanitizedContent, 'text/html');
  const element = document.querySelector(`[data-aue-resource="${resource}"]`);

  if (element) {
    if (element.matches('main')) {
      const newMain = parsedUpdate.querySelector(`[data-aue-resource="${resource}"]`);
      newMain.style.display = 'none';
      element.insertAdjacentElement('afterend', newMain);
      decorateMain(newMain);
      decorateRichtext(newMain);
      await loadSections(newMain);
      await syncSectionBackgrounds(newMain);
      element.remove();
      newMain.style.display = null;
      // eslint-disable-next-line no-use-before-define
      attachEventListners(newMain);
      return true;
    }

    const block = element?.closest('.block[data-aue-resource]')
      || element.parentElement?.closest('.block[data-aue-resource]');
    if (block) {
      let blockToReplace = block;
      let blockResource = block.getAttribute('data-aue-resource');
      let newBlock = parsedUpdate.querySelector(`[data-aue-resource="${blockResource}"]`);
      if (isAuthoringFieldElement(newBlock)) newBlock = null;
      const parentColumnsBlock = block.closest('.columns.block[data-aue-resource]');

      if (!newBlock && parentColumnsBlock && parentColumnsBlock !== block) {
        blockResource = parentColumnsBlock.getAttribute('data-aue-resource');
        newBlock = parsedUpdate.querySelector(`[data-aue-resource="${blockResource}"]`);
        if (isAuthoringFieldElement(newBlock)) newBlock = null;
        blockToReplace = parentColumnsBlock;
      }

      // The tabs block AEM update response omits nested card content, so
      // in-place re-decoration would silently lose newly added cards.
      // Always force a full page reload for tabs to get the complete JCR state.
      if (blockToReplace.matches('.tabs.block')) {
        return false;
      }

      if (newBlock) {
        newBlock.style.display = 'none';
        blockToReplace.insertAdjacentElement('afterend', newBlock);
        decorateButtons(newBlock);
        decorateIcons(newBlock);
        decorateBlock(newBlock);
        decorateRichtext(newBlock);
        await loadBlock(newBlock);
        const section = newBlock.closest('.section');
        if (section) await syncSectionBackgrounds(section);
        blockToReplace.remove();
        newBlock.style.display = null;
        return true;
      }
    }

    // sections and default content, may be multiple in the case of richtext
    const newElements = parsedUpdate.querySelectorAll(`[data-aue-resource="${resource}"],[data-richtext-resource="${resource}"]`);
    if (newElements.length) {
      const { parentElement } = element;
      const [replacement] = newElements;
      const fieldName = authoringFieldName(replacement);
      const fieldTarget = block && fieldName
        ? block.querySelector(`[data-aue-prop="${fieldName}"], [data-richtext-prop="${fieldName}"]`)
        : null;

      if (block && fieldTarget && newElements.length === 1) {
        replaceFieldContent(fieldTarget, replacement);
        return true;
      }

      if (element.matches('.section')) {
        const [newSection] = newElements;
        newSection.style.display = 'none';
        element.insertAdjacentElement('afterend', newSection);
        decorateButtons(newSection);
        decorateIcons(newSection);
        decorateRichtext(newSection);
        decorateSections(parentElement);
        applySectionSpacing(parentElement);
        decorateBlocks(parentElement);
        applyDefaultContentAuthorStyles(newSection);
        applyImageLinks(newSection);
        decoratePdfLinks(newSection);
        await loadSections(parentElement);
        await syncSectionBackgrounds(newSection);
        element.remove();
        newSection.style.display = null;
      } else {
        element.replaceWith(...newElements);
        decorateButtons(parentElement);
        decorateIcons(parentElement);
        decorateRichtext(parentElement);
        applyDefaultContentAuthorStyles(parentElement);
        applyImageLinks(parentElement);
        decoratePdfLinks(parentElement);
        const columnsBlock = parentElement?.closest('.columns.block');
        if (columnsBlock) await loadNestedBlocks(columnsBlock);
        const section = parentElement?.closest('.section');
        if (section) await syncSectionBackgrounds(section);
      }
      return true;
    }
  }

  return false;
}

function attachEventListners(main) {
  [
    'aue:content-patch',
    'aue:content-update',
    'aue:content-add',
    'aue:content-move',
    'aue:content-remove',
    'aue:content-copy',
  ].forEach((eventType) => main?.addEventListener(eventType, async (event) => {
    event.stopPropagation();
    const applied = await applyChanges(event);
    if (!applied) window.location.reload();
  }));
}

attachEventListners(document.querySelector('main'));

// decorate rich text
// this has to happen after decorateMain(), and everythime decorateBlocks() is called
decorateRichtext();
syncSectionBackgrounds(document.querySelector('main')).catch(() => {});
// in cases where the block decoration is not done in one synchronous iteration we need to listen
// for new richtext-instrumented elements. this happens for example when using experimentation.
const observer = new MutationObserver(() => decorateRichtext());
observer.observe(document, { attributeFilter: ['data-richtext-prop'], subtree: true });
