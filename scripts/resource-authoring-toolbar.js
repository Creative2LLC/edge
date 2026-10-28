/*
 * Authoring toolbar — Universal Editor only.
 *
 * Two deep links into the Laravel backend, carrying the page path with them:
 *
 *   Upload download file → puts a gated file in the S3 folder matching the
 *                          folder this page lives in, attaches it to this
 *                          page's own resource, and adds a Download Item to
 *                          this block with the style you pick.
 *   Set card thumbnail   → the resource library's thumbnail editor.
 *
 * WHY A LINK AND NOT A FIELD. A real upload field in the properties rail — one
 * sitting under "File" — needs an Adobe App Builder UIX extension; that is the
 * only way to plug custom UI into the Universal Editor's rail. Doing it from
 * block JS instead was tried and removed: the canvas cannot write into the UE
 * model (see scripts/block-color-picker.js), and authenticating a direct upload
 * from the canvas meant shipping a write-capable token, which would have
 * published to the live site inside the block's own markup.
 *
 * Non-gated files need none of this — the item's "File" field is a normal DAM
 * picker and keeps working exactly as before. This route exists only for gated
 * files, which live in a private S3 bucket rather than the DAM.
 *
 * Editor-scoped: data-aue-resource exists nowhere else, so nothing renders on
 * the live site.
 */

import { getAueResourcePath } from './block-field-utils.js';

// Mirrors the block's own fallback, for pages authored before the backend
// stamped apiBaseUrl onto the block.
const DEFAULT_API_BASE_URL = 'https://stunning-dust-ntqeawud3dqy.on-vapor.com';

function isUniversalEditor() {
  return Boolean(document.querySelector('[data-aue-resource]'));
}

function backendOrigin(apiBaseUrl) {
  try {
    return new URL(apiBaseUrl || DEFAULT_API_BASE_URL).origin;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

function buildButton(label, href, title) {
  const link = document.createElement('a');
  link.className = 'resource-authoring-toolbar-button';
  link.textContent = label;
  link.href = href;
  link.title = title;
  // A plain _blank anchor opens a TAB; passing a feature string to window.open
  // is what would force a popup, so there is deliberately no click handler.
  link.target = '_blank';
  link.rel = 'noopener';

  return link;
}

/**
 * @param {Element} block the block being decorated
 * @param {{apiBaseUrl?: string}} options block config; apiBaseUrl names the backend
 * @returns {Element|null} the toolbar, or null when not in the Universal Editor
 */
export default function buildResourceAuthoringToolbar(block, { apiBaseUrl } = {}) {
  if (!isUniversalEditor()) return null;

  const scopePath = getAueResourcePath(block);
  if (!scopePath) return null;

  // The block sits inside the page's jcr:content tree; the page itself is the
  // part before it, and that is what names the S3 folder.
  const pagePath = scopePath.split('/jcr:content')[0];
  const origin = backendOrigin(apiBaseUrl);
  const query = `?page_path=${encodeURIComponent(pagePath)}`;

  const toolbar = document.createElement('div');
  toolbar.className = 'resource-authoring-toolbar';

  const note = document.createElement('span');
  note.className = 'resource-authoring-toolbar-note';
  note.textContent = 'Authoring tools (editor only)';
  toolbar.append(note);

  toolbar.append(buildButton(
    'Upload gated download',
    `${origin}/admin/upload-resource-file${query}`,
    'Upload a gated file into this folder’s S3 location and add it to this block. '
      + 'Non-gated files go in the item’s File field instead.',
  ));

  toolbar.append(buildButton(
    'Set card thumbnail',
    `${origin}/admin/resource-by-page${query}`,
    'Open this resource in the library to crop or upload its card thumbnail.',
  ));

  return toolbar;
}
