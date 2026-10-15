// -----------------------------------------------------------------------------
// A fake Twilio REST API behind the `request` seam of src/twilio/http.js: the
// answers are the fixtures of test/fixtures/twilio, the rules the ones the
// integration relies on (Basic authentication, a trial account only reaching
// verified numbers, the sender belonging to the account, call statuses moving
// from queued to an outcome). Nothing leaves the process.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/twilio/${name}.json`, import.meta.url), 'utf8'));

export const ACCOUNT_SID = fixture('account').sid;
export const AUTH_TOKEN = 'test-auth-token-0123456789abcdef';
export const API_KEY_SID = 'SK00000000000000000000000000000001';
export const API_KEY_SECRET = 'test-api-key-secret-abcdefghijkl';
export const SENDER = '+15005550006';
export const PHONE_1 = '+33639980001';
export const PHONE_2 = '+33639980002';
export const PHONE_3 = '+33639980003';

const PREFIX = `/2010-04-01/Accounts/${ACCOUNT_SID}`;

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const error = (status, code, message) =>
  json(status, {
    code,
    message,
    more_info: `https://www.twilio.com/docs/errors/${code}`,
    status,
  });

export class FakeTwilio {
  constructor({
    type = 'Full',
    status = 'active',
    balance = '14.6175',
    currency = 'USD',
    balanceForbidden = false,
    verified = null,
    numbers = [SENDER],
  } = {}) {
    this.type = type;
    this.status = status;
    this.balance = balance;
    this.currency = currency;
    this.balanceForbidden = balanceForbidden;
    // Trial accounts: the numbers that may be reached.
    this.verified = verified;
    this.numbers = numbers;
    this.online = true;
    /** Error codes forced per recipient, e.g. { '+33…': 21610 }. */
    this.refuse = {};
    /** Call statuses read back in turn, per recipient (the last one stays). */
    this.callScript = {};
    /** Message statuses read back in turn, per recipient. */
    this.messageScript = {};
    this.messages = [];
    this.calls = [];
    this.requests = [];
    this.counter = 0;
  }

  sid(prefix) {
    this.counter += 1;
    return `${prefix}${String(this.counter).padStart(32, '0')}`;
  }

  /** The `request` seam. */
  request = async ({ method, url, headers, body }) => {
    const parsed = new URL(url);
    const params = Object.fromEntries(
      method === 'POST' ? new URLSearchParams(body ?? '') : parsed.searchParams,
    );
    this.requests.push({ method, path: parsed.pathname, params, headers });
    if (!this.online) {
      const err = new Error('ECONNREFUSED');
      err.network = true;
      throw err;
    }
    return this.handle(method, parsed.pathname, params, headers);
  };

  authorized(headers) {
    const header = headers?.Authorization ?? '';
    const [user, ...rest] = Buffer.from(header.replace(/^Basic /, ''), 'base64')
      .toString('utf8')
      .split(':');
    const password = rest.join(':');
    return (
      (user === ACCOUNT_SID && password === AUTH_TOKEN) ||
      (user === API_KEY_SID && password === API_KEY_SECRET)
    );
  }

  handle(method, path, params, headers) {
    if (!this.authorized(headers)) {
      return json(401, fixture('error-authenticate'));
    }
    if (!path.startsWith(PREFIX)) {
      return error(404, 20404, `The requested resource ${path} was not found`);
    }
    const route = path.slice(PREFIX.length);

    if (method === 'GET' && route === '.json') {
      return json(200, { ...fixture('account'), type: this.type, status: this.status });
    }
    if (method === 'GET' && route === '/Balance.json') {
      if (this.balanceForbidden) {
        return error(403, 20403, 'Forbidden');
      }
      return json(200, { ...fixture('balance'), balance: this.balance, currency: this.currency });
    }
    if (method === 'GET' && route === '/IncomingPhoneNumbers.json') {
      const page = fixture('incoming-phone-numbers');
      const owned = this.numbers.includes(params.PhoneNumber);
      return json(200, {
        ...page,
        incoming_phone_numbers: owned ? page.incoming_phone_numbers : [],
      });
    }
    if (method === 'POST' && route === '/Messages.json') {
      return this.createMessage(params);
    }
    if (method === 'POST' && route === '/Calls.json') {
      return this.createCall(params);
    }
    const message = route.match(/^\/Messages\/(SM\w+)\.json$/);
    if (method === 'GET' && message) {
      return this.readBack(this.messages, message[1], this.messageScript, 'error-undelivered');
    }
    const call = route.match(/^\/Calls\/(CA\w+)\.json$/);
    if (method === 'GET' && call) {
      return this.readBack(this.calls, call[1], this.callScript);
    }
    return error(404, 20404, `The requested resource ${path} was not found`);
  }

  checkRecipient(to) {
    if (!/^\+[1-9]\d{6,14}$/.test(to ?? '')) {
      return json(400, fixture('error-invalid-to'));
    }
    if (this.refuse[to]) {
      return error(400, this.refuse[to], `Refused for ${to}`);
    }
    if (this.type === 'Trial' && this.verified && !this.verified.includes(to)) {
      return json(400, fixture('error-unverified'));
    }
    return null;
  }

  createMessage(params) {
    const refused = this.checkRecipient(params.To);
    if (refused) {
      return refused;
    }
    if (
      !params.MessagingServiceSid &&
      !this.numbers.includes(params.From) &&
      !/[a-z]/i.test(params.From ?? '')
    ) {
      return error(
        400,
        21606,
        `The From phone number ${params.From} is not a valid message-capable Twilio phone number.`,
      );
    }
    if (!params.Body) {
      return error(400, 21602, 'Message body is required.');
    }
    const message = {
      ...fixture('message-queued'),
      sid: this.sid('SM'),
      to: params.To,
      from: params.From ?? null,
      messaging_service_sid: params.MessagingServiceSid ?? null,
      body: params.Body,
      status: params.MessagingServiceSid ? 'accepted' : 'queued',
    };
    this.messages.push({ ...message, reads: 0 });
    return json(201, message);
  }

  createCall(params) {
    const refused = this.checkRecipient(params.To);
    if (refused) {
      return refused;
    }
    if (!this.numbers.includes(params.From)) {
      return error(
        400,
        21212,
        `The phone number you are attempting to call from, ${params.From}, is not valid.`,
      );
    }
    const call = {
      ...fixture('call-queued'),
      sid: this.sid('CA'),
      to: params.To,
      from: params.From,
      twiml: params.Twiml,
      timeout: Number(params.Timeout),
      time_limit: Number(params.TimeLimit),
    };
    this.calls.push({ ...call, reads: 0 });
    const { twiml: _twiml, timeout: _timeout, time_limit: _limit, ...answer } = call;
    return json(201, answer);
  }

  readBack(list, sid, script, failureFixture) {
    const item = list.find((entry) => entry.sid === sid);
    if (!item) {
      return error(404, 20404, `The requested resource ${sid} was not found`);
    }
    const steps = script[item.to] ?? [];
    const status = steps[Math.min(item.reads, steps.length - 1)] ?? item.status;
    item.reads += 1;
    const { reads: _reads, twiml: _twiml, timeout: _timeout, time_limit: _limit, ...answer } = item;
    if (failureFixture && ['undelivered', 'failed'].includes(status)) {
      const failed = fixture(failureFixture.replace('error-', 'message-'));
      return json(200, {
        ...answer,
        status,
        error_code: failed.error_code,
        error_message: failed.error_message,
      });
    }
    return json(200, { ...answer, status });
  }

  /** The requests of one route, e.g. count('POST', '/Messages.json'). */
  count(method, route) {
    return this.requests.filter((r) => r.method === method && r.path === `${PREFIX}${route}`)
      .length;
  }
}
