// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

import { parseRecipients, parseSender } from './phone.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const VOICES = ['female', 'male'];

// How long a call rings before Twilio gives up, in seconds.
export const RING_SECONDS = ['15', '20', '30', '45', '60'];

// The cost guard: sends allowed per rolling hour and per calendar day.
export const LIMITS = {
  max_sms_per_hour: { min: 0, max: 500 },
  max_sms_per_day: { min: 0, max: 2000 },
  max_calls_per_hour: { min: 0, max: 100 },
  max_calls_per_day: { min: 0, max: 500 },
};

export const DEFAULT_CONFIG = {
  account_sid: '',
  auth_token: '',
  api_key_sid: '',
  api_key_secret: '',
  from_number: '',
  default_recipients: '',
  max_sms_per_hour: 10,
  max_sms_per_day: 30,
  max_calls_per_hour: 5,
  max_calls_per_day: 10,
  voice: 'female',
  ring_seconds: '30',
  language: 'fr',
};

const ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;
const API_KEY_SID = /^SK[0-9a-f]{32}$/i;

/** What is missing or wrong in the configuration (connection status, test). */
export const CONFIG_PROBLEMS = Object.freeze({
  ACCOUNT_SID: 'account_sid',
  CREDENTIALS: 'credentials',
  API_KEY_SID: 'api_key_sid',
  SENDER: 'sender',
});

function limit(source, key) {
  const raw = source[key];
  const number =
    typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(number)) {
    return DEFAULT_CONFIG[key];
  }
  const { min, max } = LIMITS[key];
  return Math.min(max, Math.max(min, Math.floor(number)));
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };

  const problems = [];
  const typedSid = text('account_sid');
  const accountSid = ACCOUNT_SID.test(typedSid) ? `AC${typedSid.slice(2).toLowerCase()}` : null;
  if (!accountSid) {
    problems.push(CONFIG_PROBLEMS.ACCOUNT_SID);
  }

  // An API key (recommended: revocable, no access to the account settings)
  // wins over the Auth Token when both are filled in.
  const keySid = text('api_key_sid');
  const keySecret = text('api_key_secret');
  const authToken = text('auth_token');
  let credentials = null;
  if (keySid || keySecret) {
    if (!API_KEY_SID.test(keySid)) {
      problems.push(CONFIG_PROBLEMS.API_KEY_SID);
    } else if (keySecret) {
      credentials = { username: `SK${keySid.slice(2).toLowerCase()}`, password: keySecret };
    }
  }
  if (!credentials && authToken && accountSid && !problems.includes(CONFIG_PROBLEMS.API_KEY_SID)) {
    credentials = { username: accountSid, password: authToken };
  }
  if (!credentials && !problems.includes(CONFIG_PROBLEMS.API_KEY_SID)) {
    problems.push(CONFIG_PROBLEMS.CREDENTIALS);
  }

  const sender = parseSender(text('from_number'));
  if (!sender) {
    problems.push(CONFIG_PROBLEMS.SENDER);
  }

  const recipients = parseRecipients(text('default_recipients'));

  return {
    accountSid,
    credentials,
    // Which secret is in use, for the reports (never the secret itself).
    authMode: credentials ? (credentials.username === accountSid ? 'auth_token' : 'api_key') : null,
    sender,
    defaultRecipients: recipients.valid,
    invalidDefaultRecipients: recipients.invalid,
    limits: {
      sms: { hour: limit(source, 'max_sms_per_hour'), day: limit(source, 'max_sms_per_day') },
      call: { hour: limit(source, 'max_calls_per_hour'), day: limit(source, 'max_calls_per_day') },
    },
    voice: pick('voice', VOICES),
    ringSeconds: Number(pick('ring_seconds', RING_SECONDS)),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
    problems,
  };
}

/** Enough to talk to Twilio (an account and its credentials). */
export const canConnect = (config) => Boolean(config.accountSid && config.credentials);
