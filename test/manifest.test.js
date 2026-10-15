// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// (Adapted from guim31/gladys-pihole.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, LANGUAGES, LIMITS, RING_SECONDS, VOICES } from '../src/config.js';
import { CALL_OUTCOMES, FAILURE_STATUSES, TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { MAX_REPEAT } from '../src/twilio/twiml.js';
import { WIDGETS } from '../src/widgets.js';
import { PHONE_1, PHONE_2 } from './helpers/fakeTwilio.js';
import { BASE_CONFIG, FakeTwilio, createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, cover, cloud transport, notifications category', () => {
  assert.equal(manifest.name, 'Twilio');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-twilio:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-twilio/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['notifications']);
  // No webhook: incoming SMS would need a public URL (see the documentation).
  assert.equal(manifest.webhooks, undefined);
});

test('every manifest action has a handler', async (t) => {
  const world = await createWorld({ created: true });
  t.after(() => world.app.stop());
  for (const action of manifest.actions) {
    const ack = await world.fake.action(action.key, {});
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    assert.equal(typeof ack.data.message.en, 'string');
  }
  assert.deepEqual(keysOf(manifest.actions), ['test_connection', 'send_test_sms']);
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('declaring scene triggers, scene actions or widgets requires Gladys >= 5.1.0', () => {
  const declared = CAPABILITY_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.deepEqual(declared, CAPABILITY_FIELDS);
  assert.ok(isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION));
  // No widget button opens a form (#3168): 5.1.0 is enough.
  assert.equal(manifest.gladys_version, '>=5.1.0');
});

test('every scene_actions key has a handler, and returns the declared outputs', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  const world = await createWorld({ created: true });
  t.after(() => world.app.stop());
  world.twilio.callScript[PHONE_1] = ['completed'];
  for (const action of manifest.scene_actions) {
    const ack = await world.fake.sceneAction(action.key, { message: 'Test' });
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    assert.deepEqual(
      Object.keys(ack.data.outputs).sort(),
      keysOf(action.outputs).sort(),
      `${action.key} outputs`,
    );
    for (const output of action.outputs) {
      assert.equal(typeof ack.data.outputs[output.key], output.type, `${action.key}.${output.key}`);
    }
  }
});

test('the call action fields match the code', () => {
  const call = manifest.scene_actions.find((action) => action.key === 'make_call');
  const field = (key) => call.fields.find((f) => f.key === key);
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
  assert.deepEqual(
    field('voice').options.map((o) => o.value),
    VOICES,
  );
  assert.equal(field('repeat').max, MAX_REPEAT);
  assert.equal(field('repeat').min, 1);
  assert.equal(field('wait_for_answer').default, true);
  // Waiting lasts the longest ring time plus the margin, within the deadline.
  assert.ok(call.timeout_seconds >= 60 + 20 + 15);
  assert.ok(call.timeout_seconds <= 120);
  for (const action of manifest.scene_actions) {
    assert.equal(field('message').required, true);
    assert.equal(
      action.fields.find((f) => f.key === 'message').type,
      'string',
      'string fields accept the scene variables',
    );
  }
  assert.ok(Object.values(CALL_OUTCOMES).includes('answered'));
});

test('the scene triggers are the ones the hub fires, with their filters and variables', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
  const twilio = new FakeTwilio({ type: 'Trial', verified: [PHONE_1] });
  const world = await createWorld({
    twilio,
    config: { ...BASE_CONFIG, max_sms_per_hour: 2 },
    created: true,
  });
  t.after(() => world.app.stop());
  // send_failed (PHONE_2 not verified), then limit_reached.
  await world.fake.sceneAction('send_sms', { message: 'Hi' });
  await world.fake.sceneAction('send_sms', { message: 'Hi', recipients: `${PHONE_1},${PHONE_2}` });
  const fired = new Map(world.fake.sceneEvents.map((event) => [event.key, event.data]));
  for (const trigger of manifest.scene_triggers) {
    const data = fired.get(trigger.key);
    assert.ok(data, `${trigger.key} was fired`);
    // Filters match keys of `data`, variables read keys of `data`.
    for (const key of [...keysOf(trigger.fields), ...keysOf(trigger.variables)]) {
      assert.ok(key in data, `${trigger.key}: "${key}" is in the event data`);
    }
    for (const [key, value] of Object.entries(data)) {
      const variable = trigger.variables.find((v) => v.key === key);
      assert.ok(
        variable || keysOf(trigger.fields).includes(key),
        `${trigger.key}: "${key}" is declared`,
      );
      if (variable && value !== null) {
        assert.equal(typeof value, variable.type, `${trigger.key}.${key}`);
      }
    }
  }
  const status = manifest.scene_triggers
    .find((trigger) => trigger.key === TRIGGERS.SEND_FAILED)
    .fields.find((field) => field.key === 'status');
  assert.deepEqual(
    status.options.map((option) => option.value).sort(),
    Object.values(FAILURE_STATUSES).sort(),
  );
});

test('every widgets key has a handler', async (t) => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(ack.success, true, ack.error);
});

test('config_schema defaults and options stay consistent with the code', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
  const byKey = (key) => manifest.config_schema.find((f) => f.key === key);
  const options = (key) => byKey(key).options.map((o) => o.value);
  assert.deepEqual(options('language'), LANGUAGES);
  assert.deepEqual(options('voice'), VOICES);
  assert.deepEqual(options('ring_seconds'), RING_SECONDS);
  for (const [key, { min, max }] of Object.entries(LIMITS)) {
    assert.equal(byKey(key).min, min, key);
    assert.equal(byKey(key).max, max, key);
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((f) => f.type !== 'section')
      .map((f) => f.key)
      .sort(),
  );
  for (const key of ['auth_token', 'api_key_secret']) {
    assert.equal(byKey(key).type, 'secret', `${key} is a secret field`);
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('number fields have integer bounds and defaults (the form has no step)', () => {
  for (const field of allFields.filter((f) => f.type === 'number')) {
    for (const key of ['min', 'max', 'default']) {
      if (field[key] !== undefined) {
        assert.ok(Number.isInteger(field[key]), `field "${field.key}".${key} must be an integer`);
      }
    }
  }
});

test('actions declare no secret field, no required field (no default is applied)', () => {
  // Gladys#3154/#3155: a secret in an action form cannot be filled, and an
  // action applies no default while enforcing `required`.
  for (const action of manifest.actions ?? []) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret');
      assert.notEqual(field.required, true);
    }
  }
});

test('scene fields use the types the core accepts there', () => {
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields ?? []) {
      assert.ok(['string', 'number', 'select', 'multi_select'].includes(field.type), field.key);
    }
  }
  for (const action of manifest.scene_actions) {
    for (const field of action.fields ?? []) {
      assert.ok(['string', 'number', 'select', 'multi_select', 'boolean'].includes(field.type));
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `${field.key}.placeholder`);
    assert.equal(typeof field.placeholder.en, 'string');
  }
});
