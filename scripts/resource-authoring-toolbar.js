/*
 * Authoring toolbar — Universal Editor only.
 *
 * The Universal Editor has no upload component, and block JS cannot write a
 * value back into the UE model (see scripts/block-color-picker.js for the
 * attempt that proved it). So instead of trying to be a field, this renders two
 * deep links into the Laravel backend, carrying the page path with them:
 *
 *   Upload download file → puts a gated file in the S3 folder that matches the
 *                          folder this page lives in, and attaches it to this
 *                          page's own resource — so it appears on the page with
 *                          no field editing at all.
 *   Set card thumbnail   → the resource library's thumbnail editor.
 *
 * Everything here is additive and editor-scoped: data-aue-resource only exists
 * inside the Universal Editor, so nothing renders on the live site.
 */

import { getAueResourcePath } from './block-field-utils.js';

// Mirrors the block's own fallback, for the case where a page was authored
// before the backend stamped apiBaseUrl onto the block.
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
  // A plain _blank anchor opens a TAB. Passing a feature string to window.open
  // is what forces a popup window instead, so there is deliberately no click
  // handler here — the editor canvas is an iframe, and the anchor's own target
  // escapes it correctly.
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

  const pagePath = getAueResourcePath(block);
  if (!pagePath) return null;

  // The block sits inside the page's jcr:content tree; the page itself is the
  // part before /jcr:content, and that is what names the S3 folder.
  const cleanPagePath = pagePath.split('/jcr:content')[0];
  const origin = backendOrigin(apiBaseUrl);
  const query = `?page_path=${encodeURIComponent(cleanPagePath)}`;

  const toolbar = document.createElement('div');
  toolbar.className = 'resource-authoring-toolbar';

  const note = document.createElement('span');
  note.className = 'resource-authoring-toolbar-note';
  note.textContent = 'Authoring tools (editor only)';
  toolbar.append(note);

  toolbar.append(buildButton(
    'Upload download file',
    `${origin}/admin/upload-resource-file${query}`,
    'Upload a gated file straight into this folder’s S3 location and attach it to this page.',
  ));

  toolbar.append(buildButton(
    'Set card thumbnail',
    `${origin}/admin/resource-by-page${query}`,
    'Open this resource in the library to crop or upload its card thumbnail.',
  ));

  return toolbar;
}
