#!/usr/bin/env node
/* eslint-disable no-console -- CLI output. */

/**
 * Block name guard: every block an author can place must reach a block folder.
 *
 * A placed block's template `name` becomes its CSS class and (truncated to 20 characters)
 * its content node name, and the loader picks blocks/<name>/ from those. Renaming a block
 * for authors without an entry in scripts/block-aliases.js makes every NEW placement load
 * a folder that does not exist, while existing pages keep working, so it is easy to miss.
 *
 * Checks, for each block definition (child items are skipped; their name is only a label):
 *   - the class name and the node name both resolve to a folder with a <name>.js;
 *   - no alias shadows a real block folder, and every alias target exists.
 *
 * Usage: npm run lint:blocks
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  BLOCK_ALIASES, blockClassName, blockNodeClassName, resolveBlockAlias,
} from './block-aliases.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKS = path.join(ROOT, 'blocks');
const hasBlock = (name) => fs.existsSync(path.join(BLOCKS, name, `${name}.js`));

const problems = [];

Object.entries(BLOCK_ALIASES).forEach(([alias, folder]) => {
  if (!hasBlock(folder)) problems.push(`alias "${alias}" points at missing blocks/${folder}/`);
  if (hasBlock(alias)) problems.push(`alias "${alias}" shadows the real block blocks/${alias}/`);
});

let checked = 0;
fs.readdirSync(BLOCKS).forEach((dir) => {
  const file = path.join(BLOCKS, dir, `_${dir}.json`);
  if (!fs.existsSync(file)) return;
  const definitions = JSON.parse(fs.readFileSync(file, 'utf8')).definitions || [];
  definitions.forEach((definition) => {
    const page = definition.plugins?.xwalk?.page;
    const name = page?.template?.name;
    if (!name || !String(page.resourceType || '').endsWith('/block/v1/block')) return;
    checked += 1;
    const className = blockClassName(name);
    const nodeName = blockNodeClassName(name);
    const where = `${path.relative(ROOT, file)}: "${name}"`;
    if (!hasBlock(resolveBlockAlias(className))) {
      problems.push(`${where} -> class "${className}" has no block folder; add it to BLOCK_RENAMES in scripts/block-aliases.js`);
    }
    // getBlockName prefers the class when the node name is only its truncated prefix, unless
    // an alias claims the node name first.
    const nodeFolder = resolveBlockAlias(nodeName);
    const expected = resolveBlockAlias(className);
    const nodeWins = nodeFolder !== nodeName
      || nodeName === className
      || !className.startsWith(nodeName);
    if (nodeWins && nodeFolder !== expected) {
      problems.push(`${where} -> node name "${nodeName}" loads blocks/${nodeFolder}/, not ${expected}/`);
    }
  });
});

if (problems.length) {
  console.error(`Block name guard: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Block name guard: ${checked} block names all reach a block folder.`);
