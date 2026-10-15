// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): the account at a glance.
// Balance, today's SMS and calls against the daily limits of the cost guard,
// the account state and the last failure, and a link to the Twilio console to
// top the balance up. Read only: sending is the job of the scenes.
//
// The core caches the content per (settings, language, units): the texts are
// localized here from `language`.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { ACCOUNT_TYPE_TEXT, pick, reasonText } from './texts.js';

export const CONSOLE_URL = 'https://console.twilio.com/';

export const TEXT = {
  balance: { en: 'Balance', fr: 'Solde', de: 'Guthaben', es: 'Saldo' },
  sms: { en: 'SMS today', fr: 'SMS du jour', de: 'SMS heute', es: 'SMS de hoy' },
  calls: { en: 'Calls today', fr: 'Appels du jour', de: 'Anrufe heute', es: 'Llamadas de hoy' },
  account: { en: 'Account', fr: 'Compte', de: 'Konto', es: 'Cuenta' },
  lastFailure: {
    en: 'Last failure',
    fr: 'Dernier échec',
    de: 'Letzter Fehler',
    es: 'Último fallo',
  },
  none: { en: 'None', fr: 'Aucun', de: 'Keiner', es: 'Ninguno' },
  waiting: {
    en: 'Not read yet',
    fr: 'Pas encore lu',
    de: 'Noch nicht gelesen',
    es: 'Aún no leído',
  },
  console: {
    en: 'Twilio console',
    fr: 'Console Twilio',
    de: 'Twilio-Konsole',
    es: 'Consola de Twilio',
  },
  notConfigured: {
    en: 'Fill in the Account SID, the credentials and the sender in the integration configuration.',
    fr: 'Renseignez l’Account SID, les identifiants et l’expéditeur dans la configuration de l’intégration.',
    de: 'Trag die Account SID, die Zugangsdaten und den Absender in der Konfiguration der Integration ein.',
    es: 'Indique el Account SID, las credenciales y el remitente en la configuración de la integración.',
  },
};

const MAX_STATUS_VALUE = 40;
const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Build the content (pure: from the hub's view).
 * @param {ReturnType<import('./hub.js').TwilioHub['view']>} view
 * @param {string} language
 */
export function buildContent(view, language) {
  const t = (key) => pick(TEXT[key], language);
  if (!view.configured) {
    return {
      ttl_seconds: 300,
      components: [
        { type: 'text', variant: 'body', text: t('notConfigured') },
        { type: 'button', label: t('console'), icon: 'external-link', link: { url: CONSOLE_URL } },
      ],
    };
  }

  const components = [];
  if (view.balance) {
    components.push({
      type: 'value',
      label: t('balance'),
      value: view.balance.amount.toFixed(2),
      unit: view.balance.currency,
      icon: 'credit-card',
      color: view.balance.amount <= 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    });
  }
  const usageTile = (key, { today, limit }, icon) => ({
    type: 'value',
    label: t(key),
    value: `${today}/${limit}`,
    icon,
    color: today >= limit ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
  });
  components.push(
    usageTile('sms', view.sms, 'message-square'),
    usageTile('calls', view.calls, 'phone'),
  );

  let account;
  if (view.error) {
    account = {
      value: shorten(reasonText(view.error.kind, view.error.code, language), MAX_STATUS_VALUE),
      color: WIDGET_COLORS.DANGER,
    };
  } else if (view.account) {
    account = {
      value: `Twilio (${pick(ACCOUNT_TYPE_TEXT[view.account.type], language)})`,
      color: view.account.type === 'Trial' ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    };
  } else {
    account = { value: t('waiting'), color: WIDGET_COLORS.NEUTRAL };
  }
  const failure = view.lastFailure;
  components.push({
    type: 'status',
    items: [
      { label: t('account'), ...account },
      failure
        ? {
            label: t('lastFailure'),
            value: shorten(
              `${failure.to} · ${reasonText(failure.reason, failure.code, language)}`,
              MAX_STATUS_VALUE,
            ),
            color: WIDGET_COLORS.WARNING,
          }
        : { label: t('lastFailure'), value: t('none'), color: WIDGET_COLORS.SUCCESS },
    ],
  });
  components.push({
    type: 'button',
    label: t('console'),
    icon: 'external-link',
    style: 'secondary',
    link: { url: CONSOLE_URL },
  });
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, { language } = {}) => buildContent(hub.view(), language ?? hub.language),
  },
};
