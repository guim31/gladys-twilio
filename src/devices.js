// -----------------------------------------------------------------------------
// One Gladys device: the Twilio account.
//
// Identity: the Account SID, the id Twilio gives the account. Switching from
// the Auth Token to an API key keeps the device; another account is another
// device.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - balance: currency/decimal, in the currency of the account (euro, dollar
//     or pound sterling get their unit; any other currency has none). Only
//     published once the balance could be read: an API key may not see it;
//   - SMS sent today, calls placed today: counter-sensor/integer, the sends
//     Twilio accepted since local midnight (the counters of the cost guard);
//   - last failure: text/text, "date · SMS +336******78 · reason".
//
// The device is published with should_poll: false: the integration reads the
// balance on its own timer (src/hub.js) and pushes the counters as they move.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'account';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  BALANCE: 'balance',
  SMS_TODAY: 'sms_today',
  CALLS_TODAY: 'calls_today',
  LAST_FAILURE: 'last_failure',
});

// Device and feature names, in the language chosen in the configuration
// (Gladys does not tell a device integration the user's language). Frozen at
// creation in Gladys.
export const NAMES = {
  en: {
    device: 'Twilio account',
    [FEATURE_KEYS.BALANCE]: 'Balance',
    [FEATURE_KEYS.SMS_TODAY]: 'SMS sent today',
    [FEATURE_KEYS.CALLS_TODAY]: 'Calls placed today',
    [FEATURE_KEYS.LAST_FAILURE]: 'Last failure',
  },
  fr: {
    device: 'Compte Twilio',
    [FEATURE_KEYS.BALANCE]: 'Solde',
    [FEATURE_KEYS.SMS_TODAY]: 'SMS envoyés aujourd’hui',
    [FEATURE_KEYS.CALLS_TODAY]: 'Appels passés aujourd’hui',
    [FEATURE_KEYS.LAST_FAILURE]: 'Dernier échec',
  },
  de: {
    device: 'Twilio-Konto',
    [FEATURE_KEYS.BALANCE]: 'Guthaben',
    [FEATURE_KEYS.SMS_TODAY]: 'Heute gesendete SMS',
    [FEATURE_KEYS.CALLS_TODAY]: 'Heutige Anrufe',
    [FEATURE_KEYS.LAST_FAILURE]: 'Letzter Fehler',
  },
  es: {
    device: 'Cuenta Twilio',
    [FEATURE_KEYS.BALANCE]: 'Saldo',
    [FEATURE_KEYS.SMS_TODAY]: 'SMS enviados hoy',
    [FEATURE_KEYS.CALLS_TODAY]: 'Llamadas de hoy',
    [FEATURE_KEYS.LAST_FAILURE]: 'Último fallo',
  },
};

// The currencies Gladys has a unit for.
export const CURRENCY_UNITS = {
  USD: DEVICE_FEATURE_UNITS.DOLLAR,
  EUR: DEVICE_FEATURE_UNITS.EURO,
  GBP: DEVICE_FEATURE_UNITS.POUND_STERLING,
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10_000;
const BALANCE_MIN = -10_000;
const BALANCE_MAX = 1_000_000;

/** External ids of the account device and its features. */
export const deviceIds = (gladys, accountSid) => gladys.externalIds(DEVICE_TYPE, accountSid);

/**
 * The discovery payload of the account.
 * @param {object} gladys SDK client
 * @param {object} options
 * @param {string} options.accountSid
 * @param {string|null} options.currency ISO code of the balance, null while unknown
 * @param {string} options.language feature names language
 */
export function buildDevice(gladys, { accountSid, currency, language = 'fr' }) {
  const ids = deviceIds(gladys, accountSid);
  const names = NAMES[language] ?? NAMES.fr;
  const counter = (key) => ({
    name: names[key],
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: COUNTER_MAX,
  });
  const features = [];
  if (currency) {
    const unit = CURRENCY_UNITS[currency];
    features.push({
      name: names[FEATURE_KEYS.BALANCE],
      external_id: ids.feature(FEATURE_KEYS.BALANCE),
      category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
      type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
      ...(unit ? { unit } : {}),
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: BALANCE_MIN,
      max: BALANCE_MAX,
    });
  }
  features.push(counter(FEATURE_KEYS.SMS_TODAY), counter(FEATURE_KEYS.CALLS_TODAY), {
    name: names[FEATURE_KEYS.LAST_FAILURE],
    external_id: ids.feature(FEATURE_KEYS.LAST_FAILURE),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    // NOT NULL in the core, even for a text (422 on "Add to Gladys" otherwise).
    min: 0,
    max: 0,
  });
  return {
    name: names.device,
    external_id: ids.device,
    should_poll: false,
    features,
  };
}
