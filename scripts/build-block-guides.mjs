#!/usr/bin/env node
/* eslint-disable no-console -- CLI output. */

/**
 * Block guides: what the backend's page assistant is told about each block.
 *
 * The Universal Editor's models say what fields a block has; they do not say what the block
 * looks like, when to choose it, how many items suit it or which fields it cannot do
 * without. Each block folder says that in <folder>.guide.json (built-in components keep
 * theirs in models/), keyed by component id, items included:
 *
 *   looks        what it looks like on the page (blocks)
 *   use          when to choose it (blocks)
 *   avoid        when not to, and what to use instead
 *   on_request   true: never chosen on its own, only when the author asks for it
 *   items        { min, max, best }: how many items suit it; min/max are checked before
 *                the assistant may finish, best is advice
 *   required     fields that must be filled before the assistant may finish
 *   limits       field -> most characters it may hold
 *   link_optional  label fields that are fine without their link
 *   fields       field -> what goes in it, with an example. A note on a setting also puts
 *                that setting in the block's style_options, which the assistant always
 *                sees: note the settings that change the layout or look (and what each
 *                value does), not fine-tuning, and not settings that have no effect
 *
 * They are merged into block-guides.json at the root, which the backend reads from the EDS
 * host beside component-models.json. The guide files themselves stay off the site
 * (.hlxignore).
 *
 * Usage:
 *   npm run build:guides   write block-guides.json
 *   npm run lint:guides    fail if a guide is missing, names a field the model does not
 *                          have, or block-guides.json is out of date
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'block-guides.json');
const CHECK = process.argv.includes('--check');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const definition = readJson(path.join(ROOT, 'component-definition.json'));
const models = readJson(path.join(ROOT, 'component-models.json'));
const filters = readJson(path.join(ROOT, 'component-filters.json'));

// The same rules as the backend's BlockCatalog::placeable(): what an author can put in a
// section, minus retired blocks and the built-ins it swaps for Custom blocks.
const RETIRED_GROUPS = ['marked-for-removal'];
const REPLACED_BUILT_INS = ['text', 'title', 'image'];
const KEYS = ['looks', 'use', 'avoid', 'on_request', 'items', 'required', 'limits', 'link_optional', 'fields'];
const ITEM_KEYS = ['min', 'max', 'best'];

const components = new Map();
definition.groups.forEach((group) => group.components.forEach((component) => {
  const template = component.plugins?.xwalk?.page?.template || {};
  components.set(component.id, { group: group.id, model: template.model, filter: template.filter });
}));
const filterComponents = (id) => filters.find((filter) => filter.id === id)?.components || [];
const placeable = filterComponents('section').filter((id) => components.has(id)
  && !RETIRED_GROUPS.includes(components.get(id).group)
  && !REPLACED_BUILT_INS.includes(id));
const fieldNames = (modelId) => new Set((models.find((model) => model.id === modelId)?.fields || [])
  .map((field) => field.name).filter(Boolean));

const guideFiles = [
  ...fs.readdirSync(path.join(ROOT, 'blocks'))
    .map((dir) => path.join('blocks', dir, `${dir}.guide.json`)),
  ...fs.readdirSync(path.join(ROOT, 'models'))
    .filter((file) => file.endsWith('.guide.json'))
    .map((file) => path.join('models', file)),
].filter((file) => fs.existsSync(path.join(ROOT, file)));

const problems = [];
const guides = {};

guideFiles.forEach((file) => {
  let entries;
  try {
    entries = readJson(path.join(ROOT, file));
  } catch (error) {
    problems.push(`${file}: not valid JSON (${error.message})`);
    return;
  }

  Object.entries(entries).forEach(([id, guide]) => {
    const where = `${file}: ${id}`;
    const component = components.get(id);
    if (!component) {
      problems.push(`${where}: no component with this id in component-definition.json`);
      return;
    }
    if (guides[id]) problems.push(`${where}: also guided in another file`);

    Object.keys(guide).filter((key) => !KEYS.includes(key))
      .forEach((key) => problems.push(`${where}: unknown key "${key}" (allowed: ${KEYS.join(', ')})`));

    const names = fieldNames(component.model);
    const checkField = (name, key) => {
      if (!names.has(name)) problems.push(`${where}: ${key} names "${name}", which is not a field of model ${component.model}`);
    };
    (guide.required || []).forEach((name) => checkField(name, 'required'));
    (guide.link_optional || []).forEach((name) => checkField(name, 'link_optional'));
    Object.keys(guide.limits || {}).forEach((name) => checkField(name, 'limits'));
    Object.keys(guide.fields || {}).forEach((name) => checkField(name, 'fields'));

    if (guide.items) {
      if (!component.filter) problems.push(`${where}: has items, but the block takes no items`);
      Object.keys(guide.items).filter((key) => !ITEM_KEYS.includes(key))
        .forEach((key) => problems.push(`${where}: unknown items key "${key}" (allowed: ${ITEM_KEYS.join(', ')})`));
      const { min, max } = guide.items;
      if (min !== undefined && !Number.isInteger(min)) problems.push(`${where}: items.min must be a whole number`);
      if (max !== undefined && !Number.isInteger(max)) problems.push(`${where}: items.max must be a whole number`);
    }

    guides[id] = guide;
  });
});

placeable.forEach((id) => {
  const guide = guides[id];
  if (!guide) {
    problems.push(`${id}: placeable block with no guide; add one to its folder's <folder>.guide.json`);
  } else if (!guide.looks || !guide.use) {
    problems.push(`${id}: a block's guide needs "looks" and "use"`);
  }
});

if (problems.length) {
  console.error(`Block guides: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

const sorted = Object.fromEntries(Object.keys(guides).sort().map((id) => [id, guides[id]]));
const output = `${JSON.stringify(sorted, null, 2)}\n`;

if (CHECK) {
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== output) {
    console.error('Block guides: block-guides.json is out of date. Run npm run build:guides.');
    process.exit(1);
  }
  console.log(`Block guides: ${Object.keys(sorted).length} guides, all ${placeable.length} placeable blocks covered.`);
} else {
  fs.writeFileSync(OUTPUT, output);
  console.log(`Block guides: wrote ${Object.keys(sorted).length} guides to block-guides.json.`);
}
