#!/usr/bin/env node

/* eslint-disable no-console -- CLI progress output. */

/**
 * "S3 File" dropdown generator for the resource-download-item model.
 *
 * The Universal Editor's `reference` picker only browses the AEM DAM, and its
 * `select` component only takes STATIC options — there is no datasource hook.
 * So instead of pasting a slug, authors get a generated dropdown: this script
 * reads the backend's authoring catalog and rewrites the `s3File` field's
 * options in blocks/resource-downloads/_resource-downloads.json.
 *
 * The husky pre-commit hook rebuilds component-models.json whenever a `_*.json`
 * partial changes, so committing the regenerated partial is all that ships it.
 *
 * Nothing secret lands in the repo: options carry slugs and titles only. The
 * file itself stays private in S3 and is still delivered by a presigned URL
 * minted after registration.
 *
 * UE has no optgroup support, so grouping is simulated — options are sorted by
 * bucket folder and prefixed with it, which clusters each folder together.
 *
 * Usage:
 *   RESOURCE_AUTHORING_OPTIONS_TOKEN=... node scripts/build-s3-options.mjs
 *   node scripts/build-s3-options.mjs --base http://localhost:8000
 *   node scripts/build-s3-options.mjs --dry-run
 *
 * Reads .env from the repo root when present; real env vars win.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_FILE = path.join(repoRoot, 'blocks', 'resource-downloads', '_resource-downloads.json');
const ITEM_MODEL_ID = 'resource-download-item';
const FIELD_NAME = 's3File';
const EMPTY_OPTION = { name: 'None', value: '' };

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const argValue = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

async function loadDotEnv() {
  const values = {};
  try {
    const raw = await fs.readFile(path.join(repoRoot, '.env'), 'utf8');
    raw.split('\n').forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) return;
      values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    });
  } catch {
    // No .env is fine — real env vars or flags can supply everything.
  }
  return values;
}

/** Label prefix that clusters a folder's files together once sorted. */
function groupLabel(option) {
  const parts = [option.category_label || option.category || 'Uncategorized'];
  if (option.sub_folder) parts.push(...option.sub_folder.split('/').filter(Boolean));
  return parts.join(' › ');
}

function toSelectOption(option) {
  const suffix = option.is_published ? '' : ' (not published yet)';
  return {
    name: `${groupLabel(option)} › ${option.title}${suffix}`,
    value: option.slug,
  };
}

function sortOptions(options) {
  return [...options].sort((a, b) => groupLabel(a).localeCompare(groupLabel(b))
    || `${a.title}`.localeCompare(`${b.title}`));
}

async function fetchCatalog(baseUrl, token) {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/resources/authoring-options`;
  let response;
  try {
    response = await fetch(url, { headers: { 'X-Authoring-Token': token } });
  } catch (error) {
    throw new Error(`Could not reach ${url} — ${error.message}`);
  }

  if (response.status === 401) {
    throw new Error(`${url} rejected the token. Check RESOURCE_AUTHORING_OPTIONS_TOKEN matches the backend.`);
  }
  if (response.status === 404) {
    throw new Error(`${url} is disabled. Set RESOURCE_AUTHORING_OPTIONS_TOKEN in the backend env.`);
  }
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.filter((option) => option && option.slug);
}

async function main() {
  const env = { ...(await loadDotEnv()), ...process.env };
  const baseUrl = argValue('--base') || env.RESOURCE_API_BASE_URL;
  const token = argValue('--token') || env.RESOURCE_AUTHORING_OPTIONS_TOKEN;

  if (!baseUrl) {
    throw new Error('Missing backend origin. Pass --base <url> or set RESOURCE_API_BASE_URL.');
  }
  if (!token) {
    throw new Error('Missing token. Pass --token <value> or set RESOURCE_AUTHORING_OPTIONS_TOKEN.');
  }

  const catalog = await fetchCatalog(baseUrl, token);
  const options = [EMPTY_OPTION, ...sortOptions(catalog).map(toSelectOption)];

  const model = JSON.parse(await fs.readFile(MODEL_FILE, 'utf8'));
  const itemModel = model.models?.find((entry) => entry.id === ITEM_MODEL_ID);
  if (!itemModel) throw new Error(`Model "${ITEM_MODEL_ID}" not found in ${MODEL_FILE}.`);

  const field = itemModel.fields?.find((entry) => entry.name === FIELD_NAME);
  if (!field) throw new Error(`Field "${FIELD_NAME}" not found on "${ITEM_MODEL_ID}".`);

  // The field must stay LAST: published pages bind the informative overrides by
  // cell index (10-15), so reordering fields would silently scramble them.
  if (itemModel.fields[itemModel.fields.length - 1].name !== FIELD_NAME) {
    throw new Error(`"${FIELD_NAME}" must remain the last field on "${ITEM_MODEL_ID}" — published pages bind earlier fields by cell index.`);
  }

  field.options = options;

  const unpublished = catalog.filter((option) => !option.is_published).length;
  console.log(`Found ${catalog.length} S3 file(s)${unpublished ? `, ${unpublished} not published yet` : ''}.`);
  if (catalog.length === 0) {
    console.warn('No S3 resources returned — the dropdown will only offer "None".');
  }

  if (dryRun) {
    options.slice(1).forEach((option) => console.log(`  ${option.name} -> ${option.value}`));
    console.log('Dry run: no files written.');
    return;
  }

  await fs.writeFile(MODEL_FILE, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, MODEL_FILE)}.`);
  console.log('Commit it — the pre-commit hook rebuilds component-models.json.');
}

main().catch((error) => {
  console.error(`build-s3-options: ${error.message}`);
  process.exitCode = 1;
});
