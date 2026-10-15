// -----------------------------------------------------------------------------
// The small pure pieces: phone numbers, configuration, TwiML, the cost guard
// counters, and the Twilio client (requests, authentication, errors).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_PROBLEMS, DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import {
  maskPhone,
  maskPhonesIn,
  normalizePhone,
  parseRecipients,
  parseSender,
} from '../src/phone.js';
import { ERROR_KINDS, TwilioClient, TwilioError, sanitize } from '../src/twilio/client.js';
import { MAX_TWIML_LENGTH, buildSayTwiml } from '../src/twilio/twiml.js';
import { Usage, localDay, msUntilMidnight } from '../src/usage.js';
import {
  ACCOUNT_SID,
  API_KEY_SECRET,
  API_KEY_SID,
  AUTH_TOKEN,
  FakeTwilio,
  PHONE_1,
  SENDER,
} from './helpers/fakeTwilio.js';
import './helpers/world.js'; // TZ=Europe/Paris

// --- Phone numbers ---------------------------------------------------------------

test('phone numbers are cleaned up to E.164, never guessed', () => {
  assert.equal(normalizePhone('+33 6 39 98 00 01'), '+33639980001');
  assert.equal(normalizePhone('0033.6.39.98.00.01'), '+33639980001');
  assert.equal(normalizePhone('+1 (500) 555-0006'), '+15005550006');
  assert.equal(normalizePhone('06 39 98 00 01'), null, 'a national number is refused');
  assert.equal(normalizePhone('+0612345678'), null);
  assert.equal(normalizePhone('+33'), null);
  assert.equal(normalizePhone(undefined), null);
});

test('recipient lists keep the order typed, without duplicates', () => {
  assert.deepEqual(parseRecipients(`${PHONE_1}; +33 6 39 98 00 02,\n${PHONE_1}, nope`), {
    valid: [PHONE_1, '+33639980002'],
    invalid: ['nope'],
  });
  assert.deepEqual(parseRecipients(''), { valid: [], invalid: [] });
});

test('the sender is a number, a Messaging Service or a name', () => {
  assert.deepEqual(parseSender('+1 500 555 0006'), { type: 'phone', value: SENDER });
  assert.deepEqual(parseSender(`MG${'A'.repeat(32)}`), {
    type: 'service',
    value: `MG${'a'.repeat(32)}`,
  });
  assert.deepEqual(parseSender('Gladys'), { type: 'alphanumeric', value: 'Gladys' });
  assert.equal(parseSender('A name too long'), null);
  assert.equal(parseSender('12345'), null);
  assert.equal(parseSender(''), null);
});

test('numbers are masked in the logs and in Twilio messages', () => {
  assert.equal(maskPhone(PHONE_1), '+336******01');
  assert.equal(
    maskPhonesIn('The number +33639980002 is unverified. Verify +33639980002 or 33639980002.'),
    'The number +336******02 is unverified. Verify +336******02 or +336******02.',
  );
  assert.equal(maskPhonesIn('Error 21608 at 10:00'), 'Error 21608 at 10:00');
  assert.equal(sanitize(`Account ${ACCOUNT_SID} not found`), 'Account AC…0001 not found');
});

// --- Configuration -----------------------------------------------------------------

test('an API key wins over the Auth Token', () => {
  const config = normalizeConfig({
    account_sid: ACCOUNT_SID.toLowerCase().replace(/^ac/, 'AC'),
    auth_token: AUTH_TOKEN,
    api_key_sid: API_KEY_SID,
    api_key_secret: API_KEY_SECRET,
    from_number: SENDER,
  });
  assert.deepEqual(config.credentials, { username: API_KEY_SID, password: API_KEY_SECRET });
  assert.equal(config.authMode, 'api_key');
  assert.deepEqual(config.problems, []);
  const token = normalizeConfig({
    account_sid: ACCOUNT_SID,
    auth_token: AUTH_TOKEN,
    from_number: SENDER,
  });
  assert.deepEqual(token.credentials, { username: ACCOUNT_SID, password: AUTH_TOKEN });
  assert.equal(token.authMode, 'auth_token');
});

test('the configuration problems are named', () => {
  assert.deepEqual(normalizeConfig({}).problems, [
    CONFIG_PROBLEMS.ACCOUNT_SID,
    CONFIG_PROBLEMS.CREDENTIALS,
    CONFIG_PROBLEMS.SENDER,
  ]);
  assert.deepEqual(
    normalizeConfig({
      account_sid: ACCOUNT_SID,
      api_key_sid: 'AC123',
      api_key_secret: 'x',
      auth_token: 'y',
      from_number: SENDER,
    }).problems,
    [CONFIG_PROBLEMS.API_KEY_SID],
    'a wrong key SID is not silently replaced by the token',
  );
  assert.equal(
    normalizeConfig({ account_sid: ACCOUNT_SID, api_key_sid: API_KEY_SID }).credentials,
    null,
  );
});

test('the limits are integers within bounds, the selects within their lists', () => {
  const config = normalizeConfig({
    max_sms_per_hour: '12',
    max_sms_per_day: -3,
    max_calls_per_hour: 'many',
    max_calls_per_day: 99999,
    ring_seconds: 25,
    voice: 'robot',
    language: 'it',
  });
  assert.deepEqual(config.limits, { sms: { hour: 12, day: 0 }, call: { hour: 5, day: 500 } });
  assert.equal(config.ringSeconds, 30);
  assert.equal(config.voice, 'female');
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig().language, DEFAULT_CONFIG.language);
});

// --- TwiML ---------------------------------------------------------------------------

test('the TwiML escapes the text and picks the voice of the language', () => {
  const twiml = buildSayTwiml({
    text: '<Hangup/> & "quotes"',
    language: 'es',
    voice: 'male',
    repeat: 1,
  });
  assert.equal(
    twiml,
    '<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/>' +
      '<Say voice="Polly.Enrique" language="es-ES">&lt;Hangup/&gt; &amp; &quot;quotes&quot;</Say></Response>',
  );
  assert.match(buildSayTwiml({ text: 'x', language: 'it', voice: 'x', repeat: 9 }), /Polly.Joanna/);
  assert.equal(
    buildSayTwiml({ text: 'x', language: 'fr', voice: 'female', repeat: 9 }).match(/<Say /g).length,
    3,
  );
  assert.ok(
    !buildSayTwiml({ text: 'a\u0000b', language: 'fr', voice: 'female', repeat: 1 }).includes(
      '\u0000',
    ),
  );
});

test('the TwiML stays under the Twilio limit whatever the text', () => {
  const twiml = buildSayTwiml({
    text: '&'.repeat(5000),
    language: 'fr',
    voice: 'female',
    repeat: 3,
  });
  assert.ok(twiml.length <= MAX_TWIML_LENGTH, `${twiml.length}`);
  assert.match(twiml, /<\/Response>$/);
});

// --- Cost guard counters ---------------------------------------------------------------

const limits = { hour: 3, day: 5 };
const H = 60 * 60_000;

test('the guard grants up to the binding limit, and frees the hour after an hour', () => {
  const start = Date.UTC(2026, 9, 15, 8, 0, 0);
  const usage = new Usage();
  assert.deepEqual(usage.reserve('sms', 2, limits, start), {
    granted: 2,
    window: 'hour',
    limit: 3,
  });
  assert.deepEqual(usage.reserve('sms', 2, limits, start + 1000), {
    granted: 1,
    window: 'hour',
    limit: 3,
  });
  assert.equal(usage.reserve('sms', 1, limits, start + 2000).granted, 0);
  assert.equal(usage.reserve('call', 1, limits, start).granted, 1, 'calls count apart');
  // An hour later: the day binds (5 - 3 = 2 left).
  assert.deepEqual(usage.reserve('sms', 4, limits, start + H), {
    granted: 2,
    window: 'day',
    limit: 5,
  });
  assert.equal(usage.today('sms', start + H), 5);
});

test('a released slot is free again; the counters survive a round trip', () => {
  const now = Date.UTC(2026, 9, 15, 8, 0, 0);
  const usage = new Usage();
  usage.reserve('sms', 3, limits, now);
  usage.release('sms', now);
  assert.equal(usage.lastHour('sms', now), 2);
  const copy = new Usage(JSON.parse(JSON.stringify(usage)));
  assert.equal(copy.lastHour('sms', now), 2);
  assert.deepEqual(new Usage({ sms: 'garbage', call: [1, 'x'] }).toJSON(), { sms: [], call: [1] });
});

test('the day is the local day of Gladys, DST included', () => {
  // 25 October 2026: the clocks go back in Paris, the day lasts 25 hours.
  const midnight = Date.UTC(2026, 9, 24, 22, 0, 0); // 00:00 on the 25th in Paris
  assert.equal(localDay(midnight), '2026-10-25');
  assert.equal(localDay(midnight - 1), '2026-10-24');
  assert.equal(msUntilMidnight(midnight), 25 * H);
  const usage = new Usage();
  usage.reserve('sms', 1, { hour: 10, day: 10 }, midnight - 1);
  assert.equal(usage.today('sms', midnight), 0);
  assert.equal(usage.lastHour('sms', midnight), 1);
});

// --- Twilio client ------------------------------------------------------------------------

test('the client sends Basic auth and form bodies to api.twilio.com', async () => {
  const twilio = new FakeTwilio();
  const client = new TwilioClient({
    accountSid: ACCOUNT_SID,
    credentials: { username: API_KEY_SID, password: API_KEY_SECRET },
    request: twilio.request,
  });
  const message = await client.sendSms({
    to: PHONE_1,
    sender: { type: 'phone', value: SENDER },
    body: 'é & ü',
  });
  assert.equal(message.status, 'queued');
  const [request] = twilio.requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.path, `/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`);
  assert.deepEqual(request.params, { To: PHONE_1, From: SENDER, Body: 'é & ü' });
  assert.equal(request.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(
    request.headers.Authorization,
    `Basic ${Buffer.from(`${API_KEY_SID}:${API_KEY_SECRET}`).toString('base64')}`,
  );
  assert.equal(await client.ownsNumber(SENDER), true);
  assert.equal(await client.ownsNumber(PHONE_1), false);
});

test('Twilio errors are typed, with their code, and carry no secret', async () => {
  const twilio = new FakeTwilio({ type: 'Trial', verified: [] });
  const client = new TwilioClient({
    accountSid: ACCOUNT_SID,
    credentials: { username: ACCOUNT_SID, password: AUTH_TOKEN },
    request: twilio.request,
  });
  await assert.rejects(
    client.sendSms({ to: '+33639980002', sender: { type: 'phone', value: SENDER }, body: 'x' }),
    (err) =>
      err instanceof TwilioError &&
      err.kind === ERROR_KINDS.UNVERIFIED &&
      err.code === 21608 &&
      err.status === 400 &&
      !err.message.includes('+33639980002'),
  );
  const wrong = new TwilioClient({
    accountSid: ACCOUNT_SID,
    credentials: { username: ACCOUNT_SID, password: 'not-the-token' },
    request: twilio.request,
  });
  await assert.rejects(
    wrong.getAccount(),
    (err) => err.kind === ERROR_KINDS.AUTH && !err.message.includes('not-the-token'),
  );
  twilio.online = false;
  await assert.rejects(client.getBalance(), (err) => err.kind === ERROR_KINDS.UNREACHABLE);
});

test('an unexpected answer is an error, not a crash', async () => {
  const answers = [
    { status: 200, headers: {}, body: '<html>proxy</html>' },
    { status: 502, headers: {}, body: '' },
    { status: 429, headers: {}, body: '{"code":20429,"message":"Too Many Requests"}' },
  ];
  const client = new TwilioClient({
    accountSid: ACCOUNT_SID,
    credentials: { username: ACCOUNT_SID, password: AUTH_TOKEN },
    request: async () => answers.shift(),
  });
  await assert.rejects(client.getAccount(), (err) => err.kind === ERROR_KINDS.REFUSED);
  await assert.rejects(client.getAccount(), (err) => err.kind === ERROR_KINDS.SERVER);
  await assert.rejects(
    client.getAccount(),
    (err) => err.kind === ERROR_KINDS.RATE_LIMIT && err.code === 20429,
  );
});
