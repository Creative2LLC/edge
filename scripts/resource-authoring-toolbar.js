/*
 * Authoring controls — Universal Editor only.
 *
 * Uploading a gated download happens right here in the canvas: pick a file on a
 * Download Item card, it goes straight to S3, and the backend stamps it onto
 * that exact item node. No popup, no second tab.
 *
 * Two constraints shaped this:
 *
 * 1. Block JS cannot write into the Universal Editor model (see
 *    scripts/block-color-picker.js for the attempt that proved it), so the
 *    BACKEND writes the value onto the item's JCR node instead. The item's node
 *    path comes from its own data-aue-resource attribute.
 *
 * 2. The upload token must never live in block content. Every field on a block
 *    model renders as a cell in the page HTML, so a token there would publish to
 *    the live site in plain sight. It lives in an AEM node outside the page tree
 *    instead, which the canvas reads same-origin with the author's own AEM
 *    session — and which is not replicated, so the published site cannot see it.
 */

import { getAueResourcePath } from './block-field-utils.js';

// Mirrors the block's own fallback, for pages authored before the backend
// stamped apiBaseUrl onto the block.
const DEFAULT_API_BASE_URL = 'https://stunning-dust-ntqeawud3dqy.on-vapor.com';
const TOKEN_NODE_PATH = '/conf/edge/authoring/upload-token';

let tokenPromise = null;

export function isUniversalEditor() {
  return Boolean(document.querySelector('[data-aue-resource]'));
}

function backendOrigin(apiBaseUrl) {
  try {
    return new URL(apiBaseUrl || DEFAULT_API_BASE_URL).origin;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

/*
 * Read the token from AEM. Same-origin inside the editor, so the author's own
 * session authorizes it; `credentials: 'include'` is what carries that session.
 * Any failure (published page, missing node, tightened ACL) resolves to '' and
 * the upload control simply does not render — never an error in the author's
 * face for a feature that may not be provisioned.
 */
function fetchUploadToken() {
  if (tokenPromise) return tokenPromise;

  tokenPromise = fetch(`${TOKEN_NODE_PATH}.json`, { credentials: 'include', cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => (payload && typeof payload.token === 'string' ? payload.token : ''))
    .catch(() => '');

  return tokenPromise;
}

function pagePathFrom(scopePath) {
  // The block and its items live under the page's jcr:content tree; the page
  // itself is the part before it, and that is what names the S3 folder.
  return scopePath.split('/jcr:content')[0];
}

async function postJson(url, token, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Authoring-Token': token,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.message || `Server error ${response.status}`);
    error.code = payload.code;
    throw error;
  }

  return payload;
}

async function putToS3(url, headers, file) {
  const response = await fetch(url, { method: 'PUT', headers: headers || {}, body: file });

  if (!response.ok) {
    throw new Error(`S3 rejected the upload (HTTP ${response.status}). `
      + 'If this persists, check the bucket CORS rule allows PUT from this origin.');
  }
}

/**
 * An upload control bound to one Download Item.
 *
 * @param {Element} card the rendered card, used only to host the control
 * @param {Element} row the item's instrumented row, which carries its node path
 * @param {{apiBaseUrl?: string, token: string}} options
 * @returns {Element|null}
 */
export function buildItemUploadControl(card, row, { apiBaseUrl, token }) {
  const itemPath = getAueResourcePath(row);
  if (!itemPath || !token) return null;

  const origin = backendOrigin(apiBaseUrl);
  const pagePath = pagePathFrom(itemPath);

  const wrapper = document.createElement('div');
  wrapper.className = 'resource-authoring-upload';

  const input = document.createElement('input');
  input.type = 'file';
  input.className = 'resource-authoring-upload-input';
  input.accept = '.pdf,.doc,.docx,.ppt,.pptx,.zip,.mp4,.mov';
  input.id = `rd-upload-${Math.random().toString(36).slice(2)}`;

  const label = document.createElement('label');
  label.className = 'resource-authoring-upload-button';
  label.setAttribute('for', input.id);
  label.textContent = 'Upload file to S3';

  const status = document.createElement('span');
  status.className = 'resource-authoring-upload-status';

  const choices = document.createElement('span');
  choices.className = 'resource-authoring-upload-choices';
  choices.hidden = true;

  const say = (message, state = '') => {
    status.textContent = message;
    status.dataset.state = state;
  };

  /*
   * The page's resource already has a different primary download. A resource can
   * hold several, so this is a question, not a failure — asked inline rather
   * than through a blocking confirm() dialog, which the editor iframe handles
   * poorly and which reads as an error.
   */
  const askAddOrReplace = (message) => new Promise((resolve) => {
    say(message, 'error');
    choices.replaceChildren();
    choices.hidden = false;

    [['Add alongside', 'add'], ['Make it primary', 'replace']].forEach(([text, mode]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'resource-authoring-upload-choice';
      button.textContent = text;
      button.addEventListener('click', () => {
        choices.hidden = true;
        resolve(mode);
      });
      choices.append(button);
    });
  });

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;

    label.setAttribute('aria-disabled', 'true');

    try {
      say(`Preparing ${file.name}…`);
      const presigned = await postJson(`${origin}/api/authoring/resource-uploads/url`, token, {
        page_path: pagePath,
        filename: file.name,
      });

      say(`Uploading ${file.name}…`);
      await putToS3(presigned.url, presigned.headers, file);

      say('Attaching…');
      const complete = (mode) => postJson(`${origin}/api/authoring/resource-uploads/complete`, token, {
        page_path: pagePath,
        key: presigned.key,
        item_path: itemPath,
        ...(mode ? { mode } : {}),
      });

      try {
        await complete(null);
      } catch (err) {
        if (err.code !== 'already_attached') throw err;

        const mode = await askAddOrReplace(`${err.message} Add this one alongside, or make it primary?`);
        say(`Attaching ${file.name}…`);
        await complete(mode);
      }

      say(`${file.name} attached — reload the page to see it.`, 'done');
    } catch (err) {
      say(err.message || 'The upload failed.', 'error');
    } finally {
      label.removeAttribute('aria-disabled');
      input.value = '';
    }
  });

  wrapper.append(label, input, status, choices);

  card.append(wrapper);

  return wrapper;
}

/**
 * Resolves the upload token once per page load, so every item control shares it.
 *
 * @returns {Promise<string>} '' when uploads are not available here
 */
export function resolveUploadToken() {
  return isUniversalEditor() ? fetchUploadToken() : Promise.resolve('');
}

/**
 * Block-level tools: the thumbnail editor still lives in the backend, because
 * cropping needs a real UI and a login.
 *
 * @param {Element} block the block being decorated
 * @param {{apiBaseUrl?: string}} options block config; apiBaseUrl names the backend
 * @returns {Element|null} the toolbar, or null when not in the Universal Editor
 */
export default function buildResourceAuthoringToolbar(block, { apiBaseUrl } = {}) {
  if (!isUniversalEditor()) return null;

  const scopePath = getAueResourcePath(block);
  if (!scopePath) return null;

  const origin = backendOrigin(apiBaseUrl);
  const query = `?page_path=${encodeURIComponent(pagePathFrom(scopePath))}`;

  const toolbar = document.createElement('div');
  toolbar.className = 'resource-authoring-toolbar';

  const note = document.createElement('span');
  note.className = 'resource-authoring-toolbar-note';
  note.textContent = 'Authoring tools (editor only)';
  toolbar.append(note);

  const link = document.createElement('a');
  link.className = 'resource-authoring-toolbar-button';
  link.textContent = 'Set card thumbnail';
  link.href = `${origin}/admin/resource-by-page${query}`;
  link.title = 'Open this resource in the library to crop or upload its card thumbnail.';
  // A plain _blank anchor opens a TAB; passing a feature string to window.open
  // is what would force a popup, so there is deliberately no click handler.
  link.target = '_blank';
  link.rel = 'noopener';
  toolbar.append(link);

  return toolbar;
}
