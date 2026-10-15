// -----------------------------------------------------------------------------
// The hub against the fake Twilio: SMS and calls, the cost guard, the
// follow-up of each send, the device states, the scene events and the
// connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CALL_OUTCOMES, TRIGGERS } from '../src/hub.js';
import { PHONE_1, PHONE_2, PHONE_3, SENDER } from './helpers/fakeTwilio.js';
import {
  BASE_CONFIG,
  FakeTwilio,
  TOKEN_CONFIG,
  createAll,
  createClock,
  createWorld,
  featureId,
} from './helpers/world.js';

const state = (world, key) => world.fake.lastState(featureId(world.gladys, key));
const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);

async function world(t, options) {
  const w = await createWorld({ created: true, ...options });
  t.after(() => w.app.stop());
  return w;
}

test('an SMS goes to each recipient, from the configured sender, and counts', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('send_sms', {
    recipients: `${PHONE_3}; 0033 6 39 98 00 01`,
    message: 'Water leak in the cellar',
  });
  assert.deepEqual(ack, { success: true, data: { outputs: { sent: 2, skipped: 0, failed: 0 } } });
  assert.deepEqual(
    w.twilio.messages.map((m) => [m.to, m.from, m.body]),
    [
      [PHONE_3, SENDER, 'Water leak in the cellar'],
      [PHONE_1, SENDER, 'Water leak in the cellar'],
    ],
  );
  assert.equal(state(w, 'sms_today'), 2);
  assert.equal(state(w, 'calls_today'), 0);
  assert.equal(state(w, 'last_failure'), 'No failure');
});

test('without recipients in the action, the default ones are used', async (t) => {
  const w = await world(t);
  await w.fake.sceneAction('send_sms', { message: 'Alarm' });
  assert.deepEqual(
    w.twilio.messages.map((m) => m.to),
    [PHONE_1, PHONE_2],
  );
});

test('a Messaging Service or a sender name is used as such for SMS', async (t) => {
  const service = `MG${'0'.repeat(31)}1`;
  const w = await world(t, { config: { ...BASE_CONFIG, from_number: service } });
  await w.hub.sendSms({ message: 'Hello', source: 'test' });
  assert.equal(w.twilio.messages[0].messaging_service_sid, service);
  assert.equal(w.twilio.messages[0].from, null);

  const named = await world(t, { config: { ...BASE_CONFIG, from_number: 'Gladys' } });
  await named.hub.sendSms({ message: 'Hello', source: 'test' });
  assert.equal(named.twilio.messages[0].from, 'Gladys');
  const ack = await named.fake.sceneAction('make_call', { message: 'Hello' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Calls need a Twilio phone number/);
});

test('an action that cannot run says why, in the configured language', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  let ack = await w.fake.sceneAction('send_sms', { message: '  ' });
  assert.equal(ack.error, 'Le message est vide.');
  ack = await w.fake.sceneAction('send_sms', { recipients: '06 39 98 00 01', message: 'Hi' });
  assert.match(ack.error, /format international.*06 39 98 00 01/);
  const eleven = Array.from({ length: 11 }, (_, i) => `+3363998${String(i).padStart(4, '0')}`);
  ack = await w.fake.sceneAction('send_sms', { recipients: eleven.join(','), message: 'Hi' });
  assert.equal(ack.error, 'Au plus 10 destinataires par action.');
  assert.equal(w.twilio.messages.length, 0);

  const empty = await world(t, { config: { ...BASE_CONFIG, default_recipients: '' } });
  ack = await empty.fake.sceneAction('send_sms', { message: 'Hi' });
  assert.match(ack.error, /No recipient/);

  const unconfigured = await world(t, { config: { language: 'en' } });
  ack = await unconfigured.fake.sceneAction('send_sms', { message: 'Hi', recipients: PHONE_1 });
  assert.match(ack.error, /Twilio is not configured/);
  assert.equal(unconfigured.fake.discoveredDevices.length, 0);
});

test('a refused SMS is not counted, shows as the last failure and fires send_failed', async (t) => {
  const twilio = new FakeTwilio({ type: 'Trial', verified: [PHONE_1] });
  const w = await world(t, { twilio });
  const ack = await w.fake.sceneAction('send_sms', { message: 'Alarm' });
  assert.deepEqual(ack.data.outputs, { sent: 1, skipped: 0, failed: 1 });
  assert.equal(state(w, 'sms_today'), 1, 'the refused one is not billed');
  assert.match(
    state(w, 'last_failure'),
    /^15\/10 10:00 · SMS \+336\*{6}02 · trial account: verify this number in Twilio first \(Twilio 21608\)$/,
  );
  const [event] = events(w, TRIGGERS.SEND_FAILED);
  assert.deepEqual(event.data, {
    kind: 'sms',
    recipient: PHONE_2,
    status: 'refused',
    reason: 'trial account: verify this number in Twilio first (Twilio 21608)',
    error_code: 21608,
  });
});

test('an SMS reported undelivered later fires send_failed, a delivered one nothing', async (t) => {
  const twilio = new FakeTwilio();
  twilio.messageScript[PHONE_1] = ['sent', 'delivered'];
  twilio.messageScript[PHONE_2] = ['sent', 'undelivered'];
  const w = await world(t, { twilio });
  await w.fake.sceneAction('send_sms', { message: 'Alarm' });
  assert.equal(w.hub.pending.length, 2);

  w.clock.advance(60_000);
  await w.hub.checkPending();
  assert.equal(events(w, TRIGGERS.SEND_FAILED).length, 0, '"sent" is not an outcome yet');
  w.clock.advance(5 * 60_000);
  await w.hub.checkPending();
  assert.equal(w.hub.pending.length, 0);
  const failed = events(w, TRIGGERS.SEND_FAILED);
  assert.equal(failed.length, 1);
  assert.deepEqual(failed[0].data, {
    kind: 'sms',
    recipient: PHONE_2,
    status: 'undelivered',
    reason: 'not delivered (Twilio 30003)',
    error_code: 30003,
  });
  assert.match(state(w, 'last_failure'), /SMS \+336\*{6}02 · not delivered \(Twilio 30003\)/);
});

test('a follow-up gives up after its last check', async (t) => {
  const w = await world(t);
  await w.hub.sendSms({ recipients: PHONE_1, message: 'Hi', source: 'test' });
  for (const minutes of [1, 5, 20]) {
    w.clock.advance(minutes * 60_000);
    await w.hub.checkPending();
  }
  assert.equal(w.hub.pending.length, 0);
  assert.equal(w.twilio.count('GET', `/Messages/${w.twilio.messages[0].sid}.json`), 3);
});

test('a call reads the message out in the chosen language and voice, and waits for the answer', async (t) => {
  const twilio = new FakeTwilio();
  twilio.callScript[PHONE_3] = ['queued', 'ringing', 'in-progress'];
  const w = await world(t, { twilio, config: { ...BASE_CONFIG, ring_seconds: '20' } });
  const ack = await w.fake.sceneAction('make_call', {
    recipient: PHONE_3,
    message: 'Fuite d’eau à la cave & au garage',
    language: 'fr',
    voice: 'male',
    repeat: 3,
    wait_for_answer: true,
  });
  assert.deepEqual(ack.data.outputs, {
    call_sid: w.twilio.calls[0].sid,
    status: CALL_OUTCOMES.ANSWERED,
    answered: true,
  });
  const [call] = w.twilio.calls;
  assert.equal(call.to, PHONE_3);
  assert.equal(call.from, SENDER);
  assert.equal(call.timeout, 20);
  assert.equal(call.time_limit, 180);
  assert.equal(call.twiml.match(/<Say voice="Polly.Mathieu" language="fr-FR">/g).length, 3);
  assert.match(call.twiml, /Fuite d’eau à la cave &amp; au garage/);
  assert.equal(state(w, 'calls_today'), 1);
  assert.equal(events(w, TRIGGERS.SEND_FAILED).length, 0);
});

test('an unanswered call says so in its outputs and fires send_failed', async (t) => {
  const twilio = new FakeTwilio();
  twilio.callScript[PHONE_1] = ['ringing', 'no-answer'];
  const w = await world(t, { twilio, config: { ...BASE_CONFIG, language: 'de' } });
  const ack = await w.fake.sceneAction('make_call', { message: 'Wasser!' });
  assert.deepEqual(ack.data.outputs, {
    call_sid: twilio.calls[0].sid,
    status: 'no-answer',
    answered: false,
  });
  assert.match(twilio.calls[0].twiml, /voice="Polly.Vicki" language="de-DE"/);
  const [event] = events(w, TRIGGERS.SEND_FAILED);
  assert.deepEqual(event.data, {
    kind: 'call',
    recipient: PHONE_1,
    status: 'no-answer',
    reason: 'keine Antwort',
    error_code: null,
  });
  assert.match(state(w, 'last_failure'), /Anruf \+336\*{6}01 · keine Antwort$/);
});

test('waiting stops at the ring time; the outcome is then read back later', async (t) => {
  const twilio = new FakeTwilio();
  twilio.callScript[PHONE_1] = [
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'ringing',
    'busy',
  ];
  const w = await world(t, { twilio, config: { ...BASE_CONFIG, ring_seconds: '15' } });
  const ack = await w.fake.sceneAction('make_call', { message: 'Hi' });
  assert.equal(ack.data.outputs.status, CALL_OUTCOMES.PENDING);
  assert.equal(ack.data.outputs.answered, false);
  assert.ok(twilio.calls[0].reads <= 12, 'about (15 + 20) / 3 reads');
  assert.equal(w.hub.pending.length, 1);
  twilio.callScript[PHONE_1] = ['busy'];
  w.clock.advance(60_000);
  await w.hub.checkPending();
  assert.equal(events(w, TRIGGERS.SEND_FAILED)[0].data.status, 'busy');
});

test('a call not waited for returns at once, pending, and is followed up', async (t) => {
  const twilio = new FakeTwilio();
  twilio.callScript[PHONE_1] = ['completed'];
  const w = await world(t, { twilio });
  const ack = await w.fake.sceneAction('make_call', { message: 'Hi', wait_for_answer: false });
  assert.equal(ack.data.outputs.status, CALL_OUTCOMES.PENDING);
  assert.equal(twilio.calls[0].reads, 0);
  w.clock.advance(5 * 60_000);
  await w.hub.checkPending();
  assert.equal(w.hub.pending.length, 0);
  assert.equal(events(w, TRIGGERS.SEND_FAILED).length, 0);
});

test('a call refused by Twilio returns "refused" and gives its slot back', async (t) => {
  const twilio = new FakeTwilio();
  twilio.refuse[PHONE_1] = 21215;
  const w = await world(t, { twilio });
  const ack = await w.fake.sceneAction('make_call', { message: 'Hi' });
  assert.deepEqual(ack.data.outputs, { call_sid: '', status: 'refused', answered: false });
  assert.equal(state(w, 'calls_today'), 0);
  assert.equal(
    events(w, TRIGGERS.SEND_FAILED)[0].data.reason,
    'country not allowed in the Twilio geographic permissions (Twilio 21215)',
  );
});

test('the cost guard holds back what exceeds the hourly limit, first recipients first', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, max_sms_per_hour: 3 } });
  let ack = await w.fake.sceneAction('send_sms', { message: 'One' });
  assert.deepEqual(ack.data.outputs, { sent: 2, skipped: 0, failed: 0 });
  ack = await w.fake.sceneAction('send_sms', {
    recipients: `${PHONE_3}, ${PHONE_1}`,
    message: 'Two',
  });
  assert.deepEqual(ack.data.outputs, { sent: 1, skipped: 1, failed: 0 });
  assert.equal(w.twilio.messages.at(-1).to, PHONE_3);
  ack = await w.fake.sceneAction('send_sms', { message: 'Three' });
  assert.deepEqual(ack.data.outputs, { sent: 0, skipped: 2, failed: 0 });
  assert.equal(w.twilio.messages.length, 3);

  // Announced once for the episode.
  const limits = events(w, TRIGGERS.LIMIT_REACHED);
  assert.equal(limits.length, 1);
  assert.deepEqual(limits[0].data, { kind: 'sms', window: 'hour', limit: 3, skipped: 1 });
  assert.equal(events(w, TRIGGERS.SEND_FAILED).length, 0);
  assert.match(state(w, 'last_failure'), /hourly limit of the cost guard reached$/);

  // An hour later the window has freed up.
  w.clock.advance(60 * 60_000);
  ack = await w.fake.sceneAction('send_sms', { message: 'Four' });
  assert.deepEqual(ack.data.outputs, { sent: 2, skipped: 0, failed: 0 });
  assert.equal(state(w, 'sms_today'), 5);
});

test('the daily limit binds calls too, and 0 blocks everything', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, max_calls_per_day: 1 } });
  w.twilio.callScript[PHONE_1] = ['completed'];
  let ack = await w.fake.sceneAction('make_call', { message: 'Hi' });
  assert.equal(ack.data.outputs.status, 'answered');
  w.clock.advance(2 * 60 * 60_000);
  ack = await w.fake.sceneAction('make_call', { message: 'Hi' });
  assert.deepEqual(ack.data.outputs, { call_sid: '', status: 'blocked', answered: false });
  assert.deepEqual(events(w, TRIGGERS.LIMIT_REACHED)[0].data, {
    kind: 'call',
    window: 'day',
    limit: 1,
    skipped: 1,
  });
  assert.equal(w.twilio.calls.length, 1);

  const blocked = await world(t, { config: { ...BASE_CONFIG, max_sms_per_day: 0 } });
  ack = await blocked.fake.sceneAction('send_sms', { message: 'Hi' });
  assert.deepEqual(ack.data.outputs, { sent: 0, skipped: 2, failed: 0 });
  assert.equal(blocked.twilio.messages.length, 0);
});

test('two scenes at once cannot both take the last slot', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, max_sms_per_hour: 1 } });
  const [a, b] = await Promise.all([
    w.hub.sendSms({ recipients: PHONE_1, message: 'A', source: 'scene' }),
    w.hub.sendSms({ recipients: PHONE_2, message: 'B', source: 'scene' }),
  ]);
  assert.equal(a.sent + b.sent, 1);
  assert.equal(w.twilio.messages.length, 1);
});

test('the counters survive a restart (saved under /data) and reset at midnight', async (t) => {
  const clock = createClock(Date.UTC(2026, 9, 15, 21, 30, 0)); // 23:30 in Paris
  const first = await createWorld({ clock, created: true });
  await first.hub.sendSms({ message: 'Hi', source: 'scene' });
  await first.app.stop();
  const saved = JSON.parse(await readFile(join(first.dataDir, 'twilio-state.json'), 'utf8'));
  assert.equal(saved.usage.sms.length, 2);
  assert.ok(!JSON.stringify(saved).includes(PHONE_1), 'no full phone number in /data');

  const second = await createWorld({ clock, dataDir: first.dataDir, created: true });
  t.after(() => second.app.stop());
  assert.equal(state(second, 'sms_today'), 2);
  clock.advance(31 * 60_000); // 00:01
  await second.hub.cycle();
  assert.equal(state(second, 'sms_today'), 0);
  // The hourly window still remembers them.
  assert.equal(second.hub.usage.lastHour('sms', clock.now()), 2);
});

test('the Auth Token works as well as an API key', async (t) => {
  const w = await world(t, { config: TOKEN_CONFIG });
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  const ack = await w.fake.sceneAction('send_sms', { message: 'Hi' });
  assert.equal(ack.data.outputs.sent, 1);
});

test('refused credentials: disconnected with the reason, and a send says it too', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, api_key_secret: 'wrong-secret' } });
  assert.deepEqual(w.fake.connectionStatus, {
    connected: false,
    message: {
      en: 'credentials refused by Twilio (Twilio 20003)',
      fr: 'identifiants refusés par Twilio (Twilio 20003)',
      de: 'Zugangsdaten von Twilio abgelehnt (Twilio 20003)',
      es: 'credenciales rechazadas por Twilio (Twilio 20003)',
    },
  });
  const ack = await w.fake.sceneAction('send_sms', { recipients: PHONE_1, message: 'Hi' });
  assert.deepEqual(ack.data.outputs, { sent: 0, skipped: 0, failed: 1 });
});

test('an incomplete configuration is explained in the connection status', async (t) => {
  const w = await world(t, {
    config: { account_sid: 'AC123', api_key_sid: 'nope', language: 'fr' },
  });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /Account SID.*SK.*expéditeur/s);
  assert.equal(w.fake.discoveredDevices.length, 0);
});

test('a suspended account is not connected', async (t) => {
  const w = await world(t, { twilio: new FakeTwilio({ status: 'suspended' }) });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.connectionStatus.message.en, 'Twilio account suspended or closed');
});

test('Twilio unreachable: the device badge says so, and recovers', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: w.hub.deviceId(),
    transport: 'cloud',
  });
  w.twilio.online = false;
  await w.hub.refresh();
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(w.fake.connectionStatus.message.en, 'Twilio unreachable');
  w.twilio.online = true;
  await w.hub.refresh();
  assert.equal(w.fake.transports.at(-1).transport, 'cloud');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a balance the API key cannot read leaves the connection up, without the feature', async (t) => {
  const w = await world(t, { twilio: new FakeTwilio({ balanceForbidden: true }) });
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  const names = w.fake.discoveredDevices[0].features.map((f) => f.external_id);
  assert.ok(!names.includes(featureId(w.gladys, 'balance')));
});

test('the balance follows Twilio, rounded to the cent', async (t) => {
  const w = await world(t);
  assert.equal(state(w, 'balance'), 14.62);
  w.twilio.balance = '9.996';
  await w.hub.refresh();
  assert.equal(state(w, 'balance'), 10);
});

test('the states are sent again once the user adds the device', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  assert.equal(w.fake.states.length, 0, 'nothing for a device Gladys does not know');
  await createAll(w);
  assert.equal(state(w, 'sms_today'), 0);
  assert.equal(state(w, 'last_failure'), 'No failure');
  assert.equal(state(w, 'balance'), 14.62);
  assert.ok(w.fake.widgetRefreshes.includes('twilio_account'));
});

test('a new configuration re-reads the account and may change the account', async (t) => {
  const w = await world(t);
  const before = w.twilio.count('GET', '.json');
  await w.fake.configUpdated({ ...BASE_CONFIG, language: 'fr' });
  assert.equal(w.twilio.count('GET', '.json'), before + 1);
  assert.equal(w.fake.discoveredDevices[0].name, 'Compte Twilio');
});

test('a configuration saved while the account is being read is read again', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, api_key_secret: 'wrong-secret' } });
  assert.equal(w.fake.connectionStatus.connected, false);
  const reading = w.hub.refresh(); // still in flight when the new configuration arrives
  await w.fake.configUpdated(BASE_CONFIG);
  await reading;
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});
