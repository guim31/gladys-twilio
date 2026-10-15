// -----------------------------------------------------------------------------
// The dashboard widget: rendered by the core exactly as sent (the SDK's
// validateWidgetContent finds nothing to drop), in every state and language.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { buildContent } from '../src/widgets.js';
import { PHONE_2 } from './helpers/fakeTwilio.js';
import { BASE_CONFIG, FakeTwilio, createWorld } from './helpers/world.js';

async function content(t, options, language = 'en') {
  const world = await createWorld({ created: true, ...options });
  t.after(() => world.app.stop());
  if (options?.before) {
    await options.before(world);
  }
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

const status = (c) => c.components.find((component) => component.type === 'status');

test('a healthy account: balance, usage against the limits, no failure', async (t) => {
  const c = await content(t, {
    before: (w) => w.hub.sendSms({ message: 'Hi', source: 'scene' }),
  });
  assert.deepEqual(validateWidgetContent(c), []);
  const [balance, sms, calls] = c.components;
  assert.deepEqual([balance.value, balance.unit], ['14.62', 'USD']);
  assert.equal(sms.value, '2/30');
  assert.equal(calls.value, '0/10');
  assert.deepEqual(
    status(c).items.map((item) => item.value),
    ['Twilio (paid)', 'None'],
  );
  assert.equal(c.components.at(-1).link.url, 'https://console.twilio.com/');
});

test('a trial account with a failure, in every language', async (t) => {
  for (const language of ['en', 'fr', 'de', 'es']) {
    const c = await content(
      t,
      {
        twilio: new FakeTwilio({ type: 'Trial', verified: [] }),
        before: (w) => w.hub.sendSms({ recipients: PHONE_2, message: 'Hi', source: 'scene' }),
      },
      language,
    );
    assert.deepEqual(validateWidgetContent(c), [], language);
    const [account, failure] = status(c).items;
    assert.equal(account.color, 'warning');
    assert.ok(failure.value.startsWith('+336******02 · '), failure.value);
    assert.ok(failure.value.length <= 40);
  }
});

test('a limit reached shows in color; an unreadable balance has no tile', async (t) => {
  const c = await content(t, {
    twilio: new FakeTwilio({ balanceForbidden: true }),
    config: { ...BASE_CONFIG, max_sms_per_day: 2 },
    before: (w) => w.hub.sendSms({ message: 'Hi', source: 'scene' }),
  });
  assert.deepEqual(validateWidgetContent(c), []);
  assert.equal(c.components[0].label, 'SMS today');
  assert.equal(c.components[0].color, 'warning');
});

test('Twilio unreachable, and not configured', async (t) => {
  const down = await content(t, {
    before: async (w) => {
      w.twilio.online = false;
      await w.hub.refresh();
    },
  });
  assert.deepEqual(validateWidgetContent(down), []);
  assert.equal(status(down).items[0].value, 'Twilio unreachable');
  assert.equal(status(down).items[0].color, 'danger');

  const unconfigured = await content(t, { config: { language: 'fr' } }, 'fr');
  assert.deepEqual(validateWidgetContent(unconfigured), []);
  assert.match(unconfigured.components[0].text, /Account SID/);
});

test('the content is pure: the same view gives the same content', () => {
  const view = {
    configured: true,
    account: { type: 'Full', name: 'x', status: 'active' },
    error: null,
    balance: { amount: -0.5, currency: 'EUR' },
    sms: { today: 0, limit: 0 },
    calls: { today: 0, limit: 5 },
    lastFailure: null,
  };
  const c = buildContent(view, 'es');
  assert.deepEqual(c, buildContent(view, 'es'));
  assert.deepEqual(validateWidgetContent(c), []);
  assert.equal(c.components[0].color, 'danger');
  assert.equal(c.components[1].color, 'warning', '0/0: nothing can be sent');
});
