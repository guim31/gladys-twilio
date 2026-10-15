// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Twilio API, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs unless `timers: true` (with node:test mock
// timers): the tests drive the hub directly (`world.hub.refresh()`...).
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import {
  ACCOUNT_SID,
  API_KEY_SECRET,
  API_KEY_SID,
  AUTH_TOKEN,
  FakeTwilio,
  PHONE_1,
  PHONE_2,
  SENDER,
} from './fakeTwilio.js';

// The "today" counters follow the local day: pin the time zone of the tests.
process.env.TZ = 'Europe/Paris';
// The integration logs every send; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const BASE_CONFIG = {
  account_sid: ACCOUNT_SID,
  api_key_sid: API_KEY_SID,
  api_key_secret: API_KEY_SECRET,
  from_number: SENDER,
  default_recipients: `${PHONE_1}, ${PHONE_2}`,
  language: 'en',
};

export const TOKEN_CONFIG = {
  account_sid: ACCOUNT_SID,
  auth_token: AUTH_TOKEN,
  from_number: SENDER,
  default_recipients: PHONE_1,
  language: 'en',
};

/** A manual clock: 15 October 2026, 10:00 in Paris. */
export function createClock(start = Date.UTC(2026, 9, 15, 8, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {FakeTwilio} [options.twilio]
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.created] add the account device as the user would
 */
export async function createWorld({
  clock = createClock(),
  twilio = new FakeTwilio(),
  config = BASE_CONFIG,
  devices = [],
  created = false,
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-twilio-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  // Each wait between two reads of a call moves the clock instead.
  const sleep = async (ms) => {
    clock.advance(ms);
  };
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: twilio.request,
    timers,
    timings,
    now: clock.now,
    sleep,
  });
  const world = { gladys, fake: gladys.fake, twilio, app, hub: app.hub, clock, dataDir };
  if (connect) {
    await gladys.connect();
    await app.ready;
    if (created) {
      await createAll(world);
    }
  }
  return world;
}

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export const deviceId = (gladys) => gladys.externalIds('account', ACCOUNT_SID).device;
export const featureId = (gladys, key) => gladys.externalIds('account', ACCOUNT_SID).feature(key);

export { FakeTwilio };
