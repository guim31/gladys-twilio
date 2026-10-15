// -----------------------------------------------------------------------------
// The refresh timer of the container. Gladys never polls a device published
// with should_poll: false (and never polls the devices created without
// should_poll, GladysAssistant/Gladys#3198): the account must be read by the
// hub's own timer, with no onPoll at all.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeTwilio, createClock, createWorld, featureId } from './helpers/world.js';

/** Let the timer callback and the fake network settle. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('the internal timer refreshes the balance without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock(); // 10:00, far from midnight
  const twilio = new FakeTwilio();
  const w = await createWorld({ clock, twilio, timers: true, created: true });
  t.after(() => w.app.stop());
  const polled = t.mock.method(w.hub, 'pollDevice');

  const device = w.fake.discoveredDevices[0];
  assert.equal(device.should_poll, false, 'Gladys is not asked to poll');
  const reads = () => twilio.count('GET', '/Balance.json');
  const before = reads();

  for (const balance of ['13.00', '12.50', '12.00']) {
    twilio.balance = balance;
    clock.advance(15 * 60_000);
    t.mock.timers.tick(15 * 60_000);
    await settle();
    assert.equal(w.fake.lastState(featureId(w.gladys, 'balance')), Number(balance));
  }
  assert.equal(reads() - before, 3, 'one reading per period');
  assert.equal(polled.mock.callCount(), 0, 'no onPoll involved');
});

test('the timer fires at midnight to reset the counters of the day', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock(Date.UTC(2026, 9, 15, 21, 55, 0)); // 23:55 in Paris
  const w = await createWorld({ clock, timers: true, created: true });
  t.after(() => w.app.stop());
  await w.hub.sendSms({ message: 'Hi', source: 'scene' });
  assert.equal(w.fake.lastState(featureId(w.gladys, 'sms_today')), 2);

  clock.advance(5 * 60_000 + 1_000);
  t.mock.timers.tick(5 * 60_000 + 1_000);
  await settle();
  assert.equal(w.fake.lastState(featureId(w.gladys, 'sms_today')), 0);
});

test('the follow-up of a send runs on its own timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const twilio = new FakeTwilio();
  twilio.messageScript['+33639980001'] = ['undelivered'];
  const w = await createWorld({ clock, twilio, timers: true, created: true });
  t.after(() => w.app.stop());
  await w.hub.sendSms({ recipients: '+33639980001', message: 'Hi', source: 'scene' });
  clock.advance(60_000);
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(w.fake.sceneEvents.at(-1)?.key, 'send_failed');
});

test('the core onPoll stays a fallback: skipped while the timer is fresh', async (t) => {
  const clock = createClock();
  const twilio = new FakeTwilio();
  const w = await createWorld({ clock, twilio, created: true });
  t.after(() => w.app.stop());
  const device = w.fake.discoveredDevices[0];
  const before = twilio.count('GET', '/Balance.json');
  await w.fake.poll(device);
  assert.equal(twilio.count('GET', '/Balance.json'), before);
  clock.advance(15 * 60_000);
  await w.fake.poll(device);
  assert.equal(twilio.count('GET', '/Balance.json'), before + 1);
});

test('the timer stops with the integration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const twilio = new FakeTwilio();
  const w = await createWorld({ twilio, timers: true });
  await w.app.stop();
  const before = twilio.requests.length;
  t.mock.timers.tick(60 * 60_000);
  await settle();
  assert.equal(twilio.requests.length, before);
});
