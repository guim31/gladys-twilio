// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle and
// one line per action only. A normal refresh writes nothing, a failure that
// repeats is logged once, and its end once. Never a secret of the
// configuration, never a full phone number.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY_SECRET, AUTH_TOKEN, PHONE_1, PHONE_2 } from './helpers/fakeTwilio.js';
import { BASE_CONFIG, FakeTwilio, TOKEN_CONFIG, createWorld } from './helpers/world.js';

/** Capture the lines of the SDK logger at the given level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld({ created: true, ...options });
  t.after(() => w.app.stop());
  return w;
}

test('a normal refresh cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => /Connected to the Twilio account AC…0001/.test(text)),
    'the connection is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.twilio.balance = String(10 - i);
    w.clock.advance(15 * 60_000);
    await w.hub.cycle();
  }
  assert.deepEqual(logs.texts(), []);
});

test('an action writes one info line, with masked numbers', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('send_sms', { message: 'Hi' });
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /SMS \(scene\): 2 sent, 0 refused, 0 held back/);

  logs.clear();
  w.twilio.callScript[PHONE_1] = ['completed'];
  await w.fake.sceneAction('make_call', { message: 'Hi' });
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /Call to \+336\*{6}01: answered/);
});

test('Twilio down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.twilio.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(15 * 60_000);
    await w.hub.cycle();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  assert.match(logs.lines[0].text, /Twilio unreachable \(ECONNREFUSED\)/);

  logs.clear();
  w.twilio.online = true;
  await w.hub.refresh();
  await w.hub.refresh();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /Twilio answers again/);
});

test('a scene looping into the cost guard warns once, not at every attempt', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, { config: { ...BASE_CONFIG, max_sms_per_hour: 2 } });
  await w.fake.sceneAction('send_sms', { message: 'Hi' });
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    await w.fake.sceneAction('send_sms', { message: 'Hi' });
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /hourly limit \(2\) reached/);
});

test('an unreadable balance is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, { twilio: new FakeTwilio({ balanceForbidden: true }) });
  logs.clear();
  for (let i = 0; i < 4; i += 1) {
    w.clock.advance(15 * 60_000);
    await w.hub.cycle();
  }
  assert.deepEqual(logs.texts(), []);
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishChangedStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    await w.hub.sendSms({ recipients: PHONE_1, message: 'Hi', source: 'scene' });
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /States refused/);
});

test('no secret of the configuration and no full number ever reaches the logs', async (t) => {
  const logs = captureLogs(t, 'debug');
  const twilio = new FakeTwilio({ type: 'Trial', verified: [PHONE_1] });
  twilio.messageScript[PHONE_1] = ['undelivered'];
  for (const config of [BASE_CONFIG, TOKEN_CONFIG, { ...BASE_CONFIG, api_key_secret: 'wrong' }]) {
    const w = await world(t, { twilio, config });
    await w.fake.sceneAction('send_sms', { message: 'Hi' });
    await w.fake.sceneAction('make_call', { message: 'Hi', recipient: PHONE_2 });
    w.clock.advance(60 * 60_000);
    await w.hub.checkPending();
    await w.fake.action('test_connection', {});
  }
  const text = logs.texts().join('\n');
  assert.ok(text.length > 0);
  for (const secret of [AUTH_TOKEN, API_KEY_SECRET, 'fake-auth-token-returned-by-twilio']) {
    assert.ok(!text.includes(secret), `a secret is in the logs: ${secret.slice(0, 6)}…`);
  }
  for (const phone of [PHONE_1, PHONE_2, PHONE_1.slice(1), PHONE_2.slice(1)]) {
    assert.ok(!text.includes(phone), `a full phone number is in the logs: ${phone}`);
  }
  assert.ok(
    !text.includes(Buffer.from(`${BASE_CONFIG.api_key_sid}:${API_KEY_SECRET}`).toString('base64')),
  );
});
