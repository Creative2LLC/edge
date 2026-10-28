/* eslint-disable no-console, no-restricted-syntax, no-await-in-loop -- CLI generator. */
/* eslint-disable no-promise-executor-return -- server.listen callback. */

/*
 * Regenerates the backend's config/forms.php from the form blocks.
 *
 * Every public form block is rendered in a real browser and every control it
 * produces is read back, because that is the only reliable inventory: the
 * blocks build fields through several helpers, and parsing the source misses
 * whole groups of them. An earlier hand-maintained schema silently dropped 112
 * fields this way - they validated fine and were then thrown away before
 * storage, which is the worst kind of bug to find later.
 *
 *   node scripts/form-field-inventory.mjs            # write config/forms.php
 *   node scripts/form-field-inventory.mjs --check    # fail if it is out of date
 *   node scripts/form-field-inventory.mjs --json     # print the inventory only
 *
 * Run it after changing any form block, and commit the resulting diff. Editing
 * the `fields` blocks in config/forms.php by hand will be overwritten; the
 * per-form metadata lives in FORM_META below.
 */

import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  extname, join, normalize, resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HARNESS_PATH = 'tools/form-test.html';
const BACKEND_CONFIG = resolve(ROOT, '..', 'ncmec-redesign-backend', 'config', 'forms.php');
const PORT = Number.parseInt(process.env.PORT || '3121', 10);

/*
 * Per-form metadata the DOM cannot tell us. `emailField` is the input whose
 * value receives the submitter confirmation; null means this form has no
 * reliable address, so only the staff notification is ever sent for it.
 */
const FORM_META = {
  'apply-for-training': {
    label: 'Apply for Training', emailField: 'contactEmail', nameFields: ['contactName'], subject: 'Training application received',
  },
  'code-adam-kit': {
    label: 'Code Adam Kit Request', emailField: 'emailAddress', nameFields: ['firstName', 'lastName'], subject: 'Code Adam kit request received',
  },
  'community-education-partner-reporting': {
    label: 'Community Education Partner Reporting', emailField: 'emailAddress', nameFields: ['firstName', 'lastName'], subject: 'Quarterly partner report received',
  },
  'event-request-form': {
    label: 'Event Request', emailField: 'emailAddress', nameFields: ['firstName', 'lastName'], subject: 'Event request received',
  },
  'faon-application': {
    label: 'FAON Application', emailField: 'applicantEmail', nameFields: ['applicantFirstName', 'applicantLastName'], subject: 'FAON application received',
  },
  'host-a-fundraiser': {
    label: 'Host a Fundraiser', emailField: 'email', nameFields: ['firstName', 'lastName'], subject: 'Fundraiser enquiry received',
  },
  'missing-child-quick-report': {
    label: 'Missing Child Quick Report', emailField: null, nameFields: [], subject: 'Quick report received',
  },
  'ncmec-reprint-request': {
    label: 'NCMEC Reprint Request', emailField: 'email', nameFields: ['requestorName'], subject: 'Reprint request received',
  },
  'prpl-application': {
    label: 'PRPL Application', emailField: 'agencyEmail', nameFields: ['firstName', 'lastName'], subject: 'PRPL application received',
  },
  'team-hope-volunteer': {
    label: 'Team HOPE Volunteer', emailField: 'email', nameFields: ['name'], subject: 'Volunteer application received',
  },
};

/*
 * Bookkeeping the blocks still post on their legacy Salesforce and Jotform
 * paths. Not answers, never stored.
 */
const IGNORED_FIELDS = new Set([
  'Case.Origin', 'Case.BusinessHoursId', 'inputCase.BusinessHoursId',
  'q302_typeA302', 'jotformFormId', 'formID', 'submissionMode',
  'originalFormName', 'originalFormUrl', 'action', 'subject',
  'mailtoAddress', 'fromAddress', 'LanguageId', 'formType',
  'adaptiveFormPath', 'submissionSystem',
]);

const PHONE_RULE = "'regex:/^\\\\+?[0-9().\\\\-\\\\s]{7,25}$/'";
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const path = normalize(decodeURIComponent(request.url.split('?')[0]))
        .replace(/^(\.\.[/\\])+/, '');
      const body = await readFile(join(ROOT, path));
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(path)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      if (response.headersSent) response.end();
      else response.writeHead(404).end('not found');
    }
  });
  return new Promise((done) => server.listen(PORT, () => done(server)));
}

function readControls() {
  const clean = (text) => (text || '').replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim();

  const labelFor = (el) => {
    const wrapper = el.closest('label');
    const ownLabel = () => wrapper?.querySelector('[class$="-label"]') || wrapper?.querySelector('span');

    /*
     * Repeating groups (licences, staff members, references, addresses) title
     * themselves with an <h3> and then reuse the same inner labels, so
     * "Professional Reference 1" + "Name" is the only unambiguous reading.
     * Without the prefix an application shows "Name" three times and a
     * validation error says "the name field is required" about one of them.
     */
    const heading = el.closest('[class$="-field-group"]')?.querySelector('h3');
    const prefix = heading ? clean(heading.textContent) : '';

    if (wrapper && !['radio', 'checkbox'].includes(el.type)) {
      const text = clean(ownLabel()?.textContent);
      if (text) return prefix ? `${prefix}: ${text}` : text;
    }

    const legend = el.closest('fieldset')?.querySelector('legend');
    if (legend) {
      const text = clean(legend.textContent);
      return prefix && !text.startsWith(prefix) ? `${prefix}: ${text}` : text;
    }

    return prefix;
  };

  const controls = new Map();
  document.querySelectorAll('.harness-form').forEach((section) => {
    const list = [];
    section.querySelectorAll('input, textarea, select').forEach((el) => {
      if (!el.name || el.classList.contains('form-honeypot')) return;

      const existing = list.find((entry) => entry.name === el.name);
      if (existing) {
        // Several controls sharing one name is a checkbox or radio group.
        existing.group = true;
        return;
      }

      list.push({
        name: el.name,
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        required: el.required,
        // Rendered but not on screen: a step the form reveals later.
        visible: el.offsetParent !== null || el.type === 'hidden',
        multiple: el.tagName === 'SELECT' ? el.multiple : false,
        label: labelFor(el),
        group: false,
      });
    });
    controls.set(section.id, list);
  });

  return Object.fromEntries(controls);
}

function rulesFor(field) {
  /*
   * Required on the server only when the control is required AND on screen at
   * first render. A field revealed by a later step is still enforced by the
   * browser; rejecting it server-side would break a form nobody could pass.
   */
  const head = field.required && field.visible ? "'required'" : "'nullable'";

  const isList = (field.group && field.type === 'checkbox')
    || field.multiple
    || field.name.endsWith('[]');
  if (isList) return { rules: [head, "'array'"], each: ["'string'", "'max:500'"] };

  switch (field.type) {
    case 'email': return { rules: [head, "'string'", "'email'", "'max:255'"] };
    case 'tel': return { rules: [head, "'string'", "'max:50'", PHONE_RULE] };
    case 'url': return { rules: [head, "'string'", "'url:http,https'", "'max:2048'"] };
    case 'number': return { rules: [head, "'integer'", "'min:0'", "'max:100000000'"] };
    case 'date': return { rules: [head, "'date'"] };
    default: break;
  }

  if (field.tag === 'textarea') return { rules: [head, "'string'", "'max:5000'"] };
  return { rules: [head, "'string'", "'max:255'"] };
}

const escape = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function renderConfig(inventory) {
  const out = [
    '<?php',
    '',
    '/*',
    '|--------------------------------------------------------------------------',
    '| Public form schemas',
    '|--------------------------------------------------------------------------',
    '|',
    '| One entry per public form block in the edge repo. The keys under `fields`',
    '| are the exact input `name` attributes the block renders, so this file and',
    '| the blocks are a matched pair.',
    '|',
    '| GENERATED - do not edit `fields` by hand. Re-run this in the edge repo',
    '| after changing a form block and commit the diff:',
    '|',
    '|     npm run forms:sync        # rewrite this file',
    '|     npm run forms:check       # fail if it is out of date',
    '|',
    '| Anything a block posts that is NOT listed under `fields` is dropped before',
    '| storage rather than rejected. Legacy Salesforce and Jotform builds still',
    '| append their own bookkeeping keys, and a hard reject would turn one of',
    '| those into a form nobody can submit.',
    '|',
    '| `required` here means "required and on screen when the form first loads".',
    '| A field inside a later step stays nullable server-side: the browser already',
    '| enforces it, and rejecting one the person never saw is a dead end.',
    '|',
    '*/',
    '',
    'return [',
    '',
    '    /*',
    '    | Recipients for the staff notification, per form, comma separated. Falls',
    '    | back to FORMS_DEFAULT_NOTIFICATION_EMAIL. A form with no recipient',
    '    | anywhere stores the submission and skips the staff email; it does not fail.',
    '    */',
    "    'default_notification_email' => env('FORMS_DEFAULT_NOTIFICATION_EMAIL'),",
    '',
    "    'schemas' => [",
  ];

  for (const [formId, meta] of Object.entries(FORM_META)) {
    const fields = (inventory[formId] || []).filter((f) => !IGNORED_FIELDS.has(f.name));
    const envKey = formId.toUpperCase().replace(/-/g, '_');

    out.push('');
    out.push(`        '${formId}' => [`);
    out.push(`            'label' => '${escape(meta.label)}',`);
    out.push(`            'email_field' => ${meta.emailField ? `'${meta.emailField}'` : 'null'},`);
    out.push(`            'name_fields' => [${meta.nameFields.map((n) => `'${n}'`).join(', ')}],`);
    out.push(`            'confirmation_subject' => '${escape(meta.subject)}',`);
    out.push(`            'notification_email' => env('FORMS_${envKey}_EMAIL'),`);
    out.push("            'fields' => [");

    for (const field of fields) {
      const { rules, each } = rulesFor(field);
      // PHP parses `foo[]` into $_POST['foo'], so the validation key never
      // carries the brackets the input name does.
      out.push(`                '${escape(field.name.replace(/\[\]$/, ''))}' => [`);
      out.push(`                    'label' => '${escape(field.label || field.name)}',`);
      out.push(`                    'rules' => [${rules.join(', ')}],`);
      if (each) out.push(`                    'each' => [${each.join(', ')}],`);
      out.push('                ],');
    }

    out.push('            ],');
    out.push('        ],');
  }

  out.push('    ],');
  out.push('');
  out.push('];');
  out.push('');
  return out.join('\n');
}

const args = new Set(process.argv.slice(2));
const server = await startServer();
const browser = await chromium.launch();

let inventory;
try {
  // Match a normal desktop browser. Headless otherwise reports
  // prefers-reduced-motion: reduce, which several blocks branch on.
  const context = await browser.newContext({
    reducedMotion: 'no-preference',
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));

  await page.goto(
    `http://localhost:${PORT}/${HARNESS_PATH}`,
    { waitUntil: 'networkidle' },
  );

  const rendered = await page.$$eval('.harness-form', (nodes) => nodes.map((n) => n.id));
  const missing = Object.keys(FORM_META).filter((id) => !rendered.includes(id));
  if (missing.length) {
    throw new Error(`Harness did not render: ${missing.join(', ')}`);
  }

  inventory = await page.evaluate(readControls);
  if (failures.length) console.warn(`  page errors: ${failures.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

if (args.has('--json')) {
  console.log(JSON.stringify(inventory, null, 2));
  process.exit(0);
}

const config = renderConfig(inventory);

let total = 0;
for (const [formId] of Object.entries(FORM_META)) {
  const fields = (inventory[formId] || []).filter((f) => !IGNORED_FIELDS.has(f.name));
  const required = fields.filter((f) => f.required && f.visible).length;
  const relaxed = fields.filter((f) => f.required && !f.visible).length;
  total += fields.length;
  console.log(`  ${formId.padEnd(40)} ${String(fields.length).padStart(3)} fields, ${required} required${
    relaxed ? `, ${relaxed} revealed later` : ''}`);
}
console.log(`  ${'total'.padEnd(40)} ${String(total).padStart(3)} fields`);

if (!existsSync(BACKEND_CONFIG)) {
  console.error(`\nBackend config not found at ${BACKEND_CONFIG}.`);
  console.error('Check out ncmec-redesign-backend beside this repo and re-run.');
  process.exit(1);
}

if (args.has('--check')) {
  const current = await readFile(BACKEND_CONFIG, 'utf8');
  if (current === config) {
    console.log('\nconfig/forms.php is up to date.');
    process.exit(0);
  }
  console.error('\nconfig/forms.php is out of date with the form blocks.');
  console.error('Run `npm run forms:sync` and commit the result.');
  process.exit(1);
}

await writeFile(BACKEND_CONFIG, config);
console.log(`\nwrote ${BACKEND_CONFIG}`);
console.log('Restart the backend container: opcache runs with validate_timestamps off,');
console.log('so an edited PHP file is not picked up until the process restarts.');
