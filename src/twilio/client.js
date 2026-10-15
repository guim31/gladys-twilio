// -----------------------------------------------------------------------------
// Client of the Twilio REST API (version 2010-04-01), limited to what the
// integration uses: the account, its balance, its phone numbers, sending an SMS,
// placing a call with inline TwiML, and reading back a message or a call.
//
// Authentication is HTTP Basic: either the Account SID and its Auth Token, or
// an API key (SID `SK…` and secret), which Twilio recommends and which can be
// revoked without touching the account. Requests go to https://api.twilio.com
// only; no webhook, no public URL.
//
// Errors are TwilioError objects with a `kind` (ERROR_KINDS) the hub maps to a
// translated reason, the HTTP status and the Twilio error code. Their message
// never carries a secret, and the phone numbers Twilio quotes are masked.
// -----------------------------------------------------------------------------

import { maskPhonesIn } from '../phone.js';
import { httpRequest } from './http.js';

export const API_BASE = 'https://api.twilio.com/2010-04-01';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer (network, DNS, timeout)
  AUTH: 'auth', // credentials refused
  NOT_FOUND: 'not_found', // unknown Account SID (or resource)
  SUSPENDED: 'suspended', // account suspended or closed
  RATE_LIMIT: 'rate_limit', // too many requests
  INVALID_TO: 'invalid_to', // the recipient is not a valid number
  UNVERIFIED: 'unverified', // trial account: the recipient is not verified
  INVALID_FROM: 'invalid_from', // the sender is not a number of the account
  GEO: 'geo', // the destination country is not allowed (geo permissions)
  BLOCKED: 'blocked', // the recipient replied STOP, or the number is blocked
  NOT_MOBILE: 'not_mobile', // an SMS to a landline
  REFUSED: 'refused', // any other refusal, see the Twilio code
  SERVER: 'server', // Twilio answered 5xx
});

// Twilio error codes (https://www.twilio.com/docs/api/errors) → kind.
const CODE_KINDS = {
  20003: ERROR_KINDS.AUTH,
  20005: ERROR_KINDS.SUSPENDED,
  10001: ERROR_KINDS.SUSPENDED,
  20404: ERROR_KINDS.NOT_FOUND,
  20429: ERROR_KINDS.RATE_LIMIT,
  21211: ERROR_KINDS.INVALID_TO,
  21217: ERROR_KINDS.INVALID_TO,
  21608: ERROR_KINDS.UNVERIFIED,
  21219: ERROR_KINDS.UNVERIFIED,
  21210: ERROR_KINDS.INVALID_FROM,
  21212: ERROR_KINDS.INVALID_FROM,
  21606: ERROR_KINDS.INVALID_FROM,
  21659: ERROR_KINDS.INVALID_FROM,
  21408: ERROR_KINDS.GEO,
  21215: ERROR_KINDS.GEO,
  13227: ERROR_KINDS.GEO,
  21610: ERROR_KINDS.BLOCKED,
  21612: ERROR_KINDS.BLOCKED,
  21614: ERROR_KINDS.NOT_MOBILE,
};

const SID = /\b(AC|SK|MG|SM|MM|CA|PN)[0-9a-f]{32}\b/gi;

/** `ACxxxx…` → `AC…1a2b`: the account SID is not a secret, but needs no publicity. */
export const maskSid = (sid) =>
  typeof sid === 'string' && sid.length > 6 ? `${sid.slice(0, 2)}…${sid.slice(-4)}` : '…';

/** Mask the SIDs and the phone numbers Twilio quotes in its messages. */
export const sanitize = (text) =>
  maskPhonesIn(String(text ?? '').replace(SID, (sid) => maskSid(sid)));

export class TwilioError extends Error {
  /**
   * @param {string} kind ERROR_KINDS
   * @param {string} message safe to log
   * @param {{ status?: number, code?: number|null }} [details]
   */
  constructor(kind, message, { status = null, code = null } = {}) {
    super(message);
    this.name = 'TwilioError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

/** The kind of a Twilio error answer. */
export function errorKind(status, code) {
  if (code !== null && CODE_KINDS[code]) {
    return CODE_KINDS[code];
  }
  if (status === 401) {
    return ERROR_KINDS.AUTH;
  }
  if (status === 404) {
    return ERROR_KINDS.NOT_FOUND;
  }
  if (status === 429) {
    return ERROR_KINDS.RATE_LIMIT;
  }
  if (status >= 500) {
    return ERROR_KINDS.SERVER;
  }
  return ERROR_KINDS.REFUSED;
}

/** The kind of a delivery error code found on a message or a call afterwards. */
export const deliveryKind = (code) => (code ? (CODE_KINDS[code] ?? null) : null);

export class TwilioClient {
  /**
   * @param {object} options
   * @param {string} options.accountSid
   * @param {{ username: string, password: string }} options.credentials
   * @param {Function} [options.request] HTTP seam (src/twilio/http.js)
   */
  constructor({ accountSid, credentials, request = httpRequest }) {
    this.accountSid = accountSid;
    this.request = request;
    // Built once; never logged, never part of an error message.
    this.authorization = `Basic ${Buffer.from(
      `${credentials.username}:${credentials.password}`,
    ).toString('base64')}`;
  }

  /**
   * @param {'GET'|'POST'} method
   * @param {string} path below /Accounts/{sid}, e.g. `/Messages.json` ('' for the account)
   * @param {Record<string, string|number|undefined>} [params] query (GET) or form (POST)
   */
  async api(method, path, params = {}) {
    const entries = Object.entries(params).filter(([, value]) => value !== undefined);
    const encoded = new URLSearchParams(entries.map(([key, value]) => [key, String(value)]));
    let url = `${API_BASE}/Accounts/${this.accountSid}${path || '.json'}`;
    const headers = { Authorization: this.authorization, Accept: 'application/json' };
    let body;
    if (method === 'GET' && entries.length) {
      url += `?${encoded}`;
    } else if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = encoded.toString();
    }

    let response;
    try {
      response = await this.request({ method, url, headers, body });
    } catch (err) {
      throw new TwilioError(
        ERROR_KINDS.UNREACHABLE,
        `Twilio unreachable (${sanitize(err.message)})`,
      );
    }

    let data;
    try {
      data = response.body ? JSON.parse(response.body) : null;
    } catch {
      data = null; // an HTML error page from a proxy
    }
    if (response.status >= 200 && response.status < 300 && data && typeof data === 'object') {
      return data;
    }
    const code = Number.isInteger(data?.code) ? data.code : null;
    const kind = errorKind(response.status, code);
    const detail = data?.message ? `: ${sanitize(data.message)}` : '';
    throw new TwilioError(
      kind,
      `Twilio HTTP ${response.status}${code ? ` (error ${code})` : ''}${detail}`,
      { status: response.status, code },
    );
  }

  /** The account: `status` (active, suspended, closed), `type` (Trial, Full). */
  getAccount() {
    return this.api('GET', '');
  }

  /** `{ balance: "12.34", currency: "USD" }` */
  getBalance() {
    return this.api('GET', '/Balance.json');
  }

  /** Whether a phone number belongs to the account (the sender check). */
  async ownsNumber(phone) {
    const page = await this.api('GET', '/IncomingPhoneNumbers.json', {
      PhoneNumber: phone,
      PageSize: 1,
    });
    return Array.isArray(page.incoming_phone_numbers) && page.incoming_phone_numbers.length > 0;
  }

  /**
   * @param {{ to: string, sender: { type: string, value: string }, body: string }} message
   */
  sendSms({ to, sender, body }) {
    return this.api('POST', '/Messages.json', {
      To: to,
      ...(sender.type === 'service'
        ? { MessagingServiceSid: sender.value }
        : { From: sender.value }),
      Body: body,
    });
  }

  getMessage(sid) {
    return this.api('GET', `/Messages/${encodeURIComponent(sid)}.json`);
  }

  /**
   * @param {{ to: string, from: string, twiml: string, timeout: number, timeLimit: number }} call
   */
  createCall({ to, from, twiml, timeout, timeLimit }) {
    return this.api('POST', '/Calls.json', {
      To: to,
      From: from,
      Twiml: twiml,
      Timeout: timeout,
      TimeLimit: timeLimit,
    });
  }

  getCall(sid) {
    return this.api('GET', `/Calls/${encodeURIComponent(sid)}.json`);
  }
}
