#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real Twilio API, read only: runs the integration's own client
// against https://api.twilio.com with a made-up Account SID and made-up
// credentials, and checks that Twilio refuses them the way the integration
// expects (HTTP 401, error 20003 → "credentials refused"). Nothing is sent: no
// SMS, no call, only GET requests that Twilio refuses. Prints no secret.
//
//   node scripts/probe.mjs
//
// With real credentials in the environment (TWILIO_ACCOUNT_SID and
// TWILIO_AUTH_TOKEN, or TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET), it also
// reads the account, its balance and, with TWILIO_FROM, checks that the sender
// belongs to the account. Still nothing is sent.
// -----------------------------------------------------------------------------

import { TwilioClient, maskSid } from '../src/twilio/client.js';
import { maskPhone } from '../src/phone.js';

const FAKE_SID = `AC${'0'.repeat(31)}1`;
const results = [];

async function step(name, run, expect) {
  try {
    const value = await run();
    const ok = expect ? expect(null, value) : true;
    results.push({ name, ok, detail: 'answered' });
    return value;
  } catch (err) {
    const ok = expect ? expect(err, null) : false;
    results.push({
      name,
      ok,
      detail: `${err.kind ?? 'error'} (HTTP ${err.status ?? '-'}, Twilio ${err.code ?? '-'})`,
    });
    return null;
  }
}

// 1. A made-up account and token: Twilio must answer 401 / 20003.
const fake = new TwilioClient({
  accountSid: FAKE_SID,
  credentials: { username: FAKE_SID, password: 'not-a-real-token' },
});
await step(
  'fake Auth Token: account refused',
  () => fake.getAccount(),
  (err) => err?.kind === 'auth' && err.status === 401 && err.code === 20003,
);
await step(
  'fake Auth Token: balance refused',
  () => fake.getBalance(),
  (err) => err?.kind === 'auth' && err.status === 401,
);

// 2. A made-up API key: same refusal.
const fakeKey = new TwilioClient({
  accountSid: FAKE_SID,
  credentials: { username: `SK${'0'.repeat(31)}1`, password: 'not-a-real-secret' },
});
await step(
  'fake API key: account refused',
  () => fakeKey.getAccount(),
  (err) => err?.kind === 'auth' && err.status === 401,
);

// 3. Optional: real credentials, read only.
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_FROM,
} = process.env;
if (TWILIO_ACCOUNT_SID && (TWILIO_AUTH_TOKEN || (TWILIO_API_KEY_SID && TWILIO_API_KEY_SECRET))) {
  const real = new TwilioClient({
    accountSid: TWILIO_ACCOUNT_SID,
    credentials: TWILIO_API_KEY_SID
      ? { username: TWILIO_API_KEY_SID, password: TWILIO_API_KEY_SECRET }
      : { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
  });
  const account = await step('real account read', () => real.getAccount());
  if (account) {
    console.log(`account ${maskSid(account.sid)}: type ${account.type}, status ${account.status}`);
  }
  const balance = await step('real balance read', () => real.getBalance());
  if (balance) {
    console.log(`balance: ${balance.balance} ${balance.currency}`);
  }
  if (TWILIO_FROM) {
    const owned = await step('sender lookup', () => real.ownsNumber(TWILIO_FROM));
    console.log(`sender ${maskPhone(TWILIO_FROM)} owned: ${owned}`);
  }
}

for (const { name, ok, detail } of results) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${detail}`);
}
process.exit(results.every((result) => result.ok) ? 0 : 1);
