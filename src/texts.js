// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, failure reasons, the reports of the configuration
// actions, scene action errors, the device and feature names. Four languages,
// the four of the Gladys interface; German says "du", Spanish "usted".
// test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { CONFIG_PROBLEMS } from './config.js';
import { ERROR_KINDS } from './twilio/client.js';

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text?.[language] ?? text?.[LANGUAGE_FALLBACK];

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// What is missing in the configuration (CONFIG_PROBLEMS of src/config.js).
export const PROBLEM_TEXT = {
  [CONFIG_PROBLEMS.ACCOUNT_SID]: {
    en: 'Enter the Account SID of your Twilio account (AC followed by 32 characters).',
    fr: 'Saisissez l’Account SID de votre compte Twilio (AC suivi de 32 caractères).',
    de: 'Gib die Account SID deines Twilio-Kontos ein (AC gefolgt von 32 Zeichen).',
    es: 'Introduzca el Account SID de su cuenta Twilio (AC seguido de 32 caracteres).',
  },
  [CONFIG_PROBLEMS.CREDENTIALS]: {
    en: 'Enter an API key (SID and secret) or the Auth Token of the account.',
    fr: 'Saisissez une clé d’API (SID et secret) ou l’Auth Token du compte.',
    de: 'Gib einen API-Schlüssel (SID und Secret) oder das Auth Token des Kontos ein.',
    es: 'Introduzca una clave de API (SID y secreto) o el Auth Token de la cuenta.',
  },
  [CONFIG_PROBLEMS.API_KEY_SID]: {
    en: 'The API key SID starts with SK followed by 32 characters.',
    fr: 'Le SID de la clé d’API commence par SK suivi de 32 caractères.',
    de: 'Die SID des API-Schlüssels beginnt mit SK, gefolgt von 32 Zeichen.',
    es: 'El SID de la clave de API empieza por SK seguido de 32 caracteres.',
  },
  [CONFIG_PROBLEMS.SENDER]: {
    en: 'Enter the sender: your Twilio number in international format, e.g. +33612345678.',
    fr: 'Saisissez l’expéditeur : votre numéro Twilio au format international, ex. +33612345678.',
    de: 'Gib den Absender ein: deine Twilio-Nummer im internationalen Format, z. B. +33612345678.',
    es: 'Introduzca el remitente: su número Twilio en formato internacional, p. ej. +33612345678.',
  },
};

// Why an SMS or a call failed: the error kinds of src/twilio/client.js, the
// delivery statuses read afterwards, and the integration's own refusals.
export const REASON_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Twilio unreachable',
    fr: 'Twilio injoignable',
    de: 'Twilio nicht erreichbar',
    es: 'Twilio inaccesible',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'credentials refused by Twilio',
    fr: 'identifiants refusés par Twilio',
    de: 'Zugangsdaten von Twilio abgelehnt',
    es: 'credenciales rechazadas por Twilio',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'unknown Account SID',
    fr: 'Account SID inconnu',
    de: 'unbekannte Account SID',
    es: 'Account SID desconocido',
  },
  [ERROR_KINDS.SUSPENDED]: {
    en: 'Twilio account suspended or closed',
    fr: 'compte Twilio suspendu ou fermé',
    de: 'Twilio-Konto gesperrt oder geschlossen',
    es: 'cuenta Twilio suspendida o cerrada',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests, Twilio asks to slow down',
    fr: 'trop de requêtes, Twilio demande de ralentir',
    de: 'zu viele Anfragen, Twilio bremst',
    es: 'demasiadas solicitudes, Twilio pide reducir el ritmo',
  },
  [ERROR_KINDS.INVALID_TO]: {
    en: 'invalid recipient number',
    fr: 'numéro du destinataire invalide',
    de: 'ungültige Empfängernummer',
    es: 'número del destinatario no válido',
  },
  [ERROR_KINDS.UNVERIFIED]: {
    en: 'trial account: verify this number in Twilio first',
    fr: 'compte d’essai : vérifiez d’abord ce numéro dans Twilio',
    de: 'Testkonto: Bestätige diese Nummer zuerst in Twilio',
    es: 'cuenta de prueba: verifique primero este número en Twilio',
  },
  [ERROR_KINDS.INVALID_FROM]: {
    en: 'the sender is not a number of your Twilio account',
    fr: 'l’expéditeur n’est pas un numéro de votre compte Twilio',
    de: 'der Absender ist keine Nummer deines Twilio-Kontos',
    es: 'el remitente no es un número de su cuenta Twilio',
  },
  [ERROR_KINDS.GEO]: {
    en: 'country not allowed in the Twilio geographic permissions',
    fr: 'pays non autorisé dans les permissions géographiques Twilio',
    de: 'Land in den geografischen Berechtigungen von Twilio nicht erlaubt',
    es: 'país no autorizado en los permisos geográficos de Twilio',
  },
  [ERROR_KINDS.BLOCKED]: {
    en: 'recipient blocked (replied STOP)',
    fr: 'destinataire bloqué (a répondu STOP)',
    de: 'Empfänger blockiert (hat mit STOP geantwortet)',
    es: 'destinatario bloqueado (respondió STOP)',
  },
  [ERROR_KINDS.NOT_MOBILE]: {
    en: 'not a mobile number',
    fr: 'pas un numéro de mobile',
    de: 'keine Mobilfunknummer',
    es: 'no es un número móvil',
  },
  [ERROR_KINDS.REFUSED]: {
    en: 'refused by Twilio',
    fr: 'refusé par Twilio',
    de: 'von Twilio abgelehnt',
    es: 'rechazado por Twilio',
  },
  [ERROR_KINDS.SERVER]: {
    en: 'Twilio error, try again later',
    fr: 'erreur de Twilio, réessayez plus tard',
    de: 'Twilio-Fehler, versuch es später erneut',
    es: 'error de Twilio, inténtelo más tarde',
  },
  undelivered: {
    en: 'not delivered',
    fr: 'non distribué',
    de: 'nicht zugestellt',
    es: 'no entregado',
  },
  failed: {
    en: 'sending failed',
    fr: 'échec de l’envoi',
    de: 'Senden fehlgeschlagen',
    es: 'fallo del envío',
  },
  'no-answer': {
    en: 'no answer',
    fr: 'pas de réponse',
    de: 'keine Antwort',
    es: 'sin respuesta',
  },
  busy: {
    en: 'line busy',
    fr: 'ligne occupée',
    de: 'Leitung besetzt',
    es: 'línea ocupada',
  },
  canceled: {
    en: 'call canceled',
    fr: 'appel annulé',
    de: 'Anruf abgebrochen',
    es: 'llamada cancelada',
  },
  limit_hour: {
    en: 'hourly limit of the cost guard reached',
    fr: 'plafond horaire du garde-fou atteint',
    de: 'Stundenlimit des Kostenschutzes erreicht',
    es: 'límite por hora del control de gastos alcanzado',
  },
  limit_day: {
    en: 'daily limit of the cost guard reached',
    fr: 'plafond journalier du garde-fou atteint',
    de: 'Tageslimit des Kostenschutzes erreicht',
    es: 'límite diario del control de gastos alcanzado',
  },
};

/** The reason of a failure, with the Twilio error code when there is one. */
export function reasonText(reason, code, language) {
  const text = pick(REASON_TEXT[reason] ?? REASON_TEXT[ERROR_KINDS.REFUSED], language);
  return code ? `${text} (Twilio ${code})` : text;
}

// Errors of the scene actions and configuration actions, shown in Gladys.
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Twilio is not configured: fill in the integration configuration.',
    fr: 'Twilio n’est pas configuré : remplissez la configuration de l’intégration.',
    de: 'Twilio ist nicht konfiguriert: Fülle die Konfiguration der Integration aus.',
    es: 'Twilio no está configurado: complete la configuración de la integración.',
  },
  emptyMessage: {
    en: 'The message is empty.',
    fr: 'Le message est vide.',
    de: 'Die Nachricht ist leer.',
    es: 'El mensaje está vacío.',
  },
  noRecipient: {
    en: 'No recipient: enter one in the action, or default recipients in the configuration.',
    fr: 'Aucun destinataire : saisissez-en un dans l’action, ou des destinataires par défaut dans la configuration.',
    de: 'Kein Empfänger: Gib einen in der Aktion ein oder Standardempfänger in der Konfiguration.',
    es: 'Ningún destinatario: introduzca uno en la acción, o destinatarios por defecto en la configuración.',
  },
  invalidRecipient: {
    en: 'Not a number in international format (+ and country code):',
    fr: 'Pas un numéro au format international (+ et indicatif du pays) :',
    de: 'Keine Nummer im internationalen Format (+ und Ländervorwahl):',
    es: 'No es un número en formato internacional (+ y prefijo del país):',
  },
  tooManyRecipients: {
    en: 'At most 10 recipients per action.',
    fr: 'Au plus 10 destinataires par action.',
    de: 'Höchstens 10 Empfänger pro Aktion.',
    es: 'Como máximo 10 destinatarios por acción.',
  },
  callNeedsPhone: {
    en: 'Calls need a Twilio phone number as sender, not a sender id or a Messaging Service.',
    fr: 'Les appels exigent un numéro Twilio comme expéditeur, pas un nom ni un Messaging Service.',
    de: 'Anrufe brauchen eine Twilio-Telefonnummer als Absender, keinen Namen und keinen Messaging Service.',
    es: 'Las llamadas requieren un número Twilio como remitente, no un nombre ni un Messaging Service.',
  },
};

// The SMS sent by the "Send a test SMS" button.
export const TEST_SMS_BODY = {
  en: 'Gladys: test message from the Twilio integration.',
  fr: 'Gladys : message de test de l’intégration Twilio.',
  de: 'Gladys: Testnachricht der Twilio-Integration.',
  es: 'Gladys: mensaje de prueba de la integración Twilio.',
};

// The reports of the configuration actions, one sentence per line.
export const REPORT_TEXT = {
  en: {
    connected: (name, type) => `Connected to the Twilio account "${name}" (${type}).`,
    trial: 'Trial account: SMS and calls only reach verified numbers, with a Twilio notice.',
    balance: (amount) => `Balance: ${amount}.`,
    noBalance: 'Balance not readable with these credentials.',
    senderOwned: (sender) => `Sender ${sender}: a number of your account.`,
    senderNotOwned: (sender) => `Sender ${sender}: not found among the numbers of your account.`,
    senderUnchecked: (sender) => `Sender ${sender}: could not be checked.`,
    senderService: 'Sender: a Messaging Service.',
    senderAlphanumeric: (sender) => `Sender: the name "${sender}" (SMS only, no calls).`,
    usage: (sms, smsLimit, calls, callLimit) =>
      `Today: ${sms}/${smsLimit} SMS, ${calls}/${callLimit} calls.`,
    recipients: (count) => `Default recipients: ${count}.`,
    ignored: (count) => `Ignored default recipients (not in +… format): ${count}.`,
    failed: (reason) => `Connection failed: ${reason}.`,
    testSent: (count) => `Test SMS sent to ${count} recipient(s).`,
    testNotSent: 'No test SMS sent.',
    testRefused: (count) => `Refused by Twilio: ${count}, see "Last failure".`,
    testSkipped: (count) => `Held back by the cost guard: ${count}.`,
  },
  fr: {
    connected: (name, type) => `Connecté au compte Twilio « ${name} » (${type}).`,
    trial:
      'Compte d’essai : SMS et appels ne vont qu’aux numéros vérifiés, avec une mention Twilio.',
    balance: (amount) => `Solde : ${amount}.`,
    noBalance: 'Solde illisible avec ces identifiants.',
    senderOwned: (sender) => `Expéditeur ${sender} : un numéro de votre compte.`,
    senderNotOwned: (sender) => `Expéditeur ${sender} : absent des numéros de votre compte.`,
    senderUnchecked: (sender) => `Expéditeur ${sender} : vérification impossible.`,
    senderService: 'Expéditeur : un Messaging Service.',
    senderAlphanumeric: (sender) =>
      `Expéditeur : le nom « ${sender} » (SMS seulement, pas d’appel).`,
    usage: (sms, smsLimit, calls, callLimit) =>
      `Aujourd’hui : ${sms}/${smsLimit} SMS, ${calls}/${callLimit} appels.`,
    recipients: (count) => `Destinataires par défaut : ${count}.`,
    ignored: (count) => `Destinataires par défaut ignorés (pas au format +…) : ${count}.`,
    failed: (reason) => `Connexion impossible : ${reason}.`,
    testSent: (count) => `SMS de test envoyé à ${count} destinataire(s).`,
    testNotSent: 'Aucun SMS de test envoyé.',
    testRefused: (count) => `Refusés par Twilio : ${count}, voir « Dernier échec ».`,
    testSkipped: (count) => `Retenus par le garde-fou : ${count}.`,
  },
  de: {
    connected: (name, type) => `Mit dem Twilio-Konto „${name}“ verbunden (${type}).`,
    trial: 'Testkonto: SMS und Anrufe erreichen nur bestätigte Nummern, mit einem Twilio-Hinweis.',
    balance: (amount) => `Guthaben: ${amount}.`,
    noBalance: 'Guthaben mit diesen Zugangsdaten nicht lesbar.',
    senderOwned: (sender) => `Absender ${sender}: eine Nummer deines Kontos.`,
    senderNotOwned: (sender) => `Absender ${sender}: nicht unter den Nummern deines Kontos.`,
    senderUnchecked: (sender) => `Absender ${sender}: Prüfung nicht möglich.`,
    senderService: 'Absender: ein Messaging Service.',
    senderAlphanumeric: (sender) => `Absender: der Name „${sender}“ (nur SMS, keine Anrufe).`,
    usage: (sms, smsLimit, calls, callLimit) =>
      `Heute: ${sms}/${smsLimit} SMS, ${calls}/${callLimit} Anrufe.`,
    recipients: (count) => `Standardempfänger: ${count}.`,
    ignored: (count) => `Ignorierte Standardempfänger (nicht im Format +…): ${count}.`,
    failed: (reason) => `Verbindung fehlgeschlagen: ${reason}.`,
    testSent: (count) => `Test-SMS an ${count} Empfänger gesendet.`,
    testNotSent: 'Keine Test-SMS gesendet.',
    testRefused: (count) => `Von Twilio abgelehnt: ${count}, siehe „Letzter Fehler“.`,
    testSkipped: (count) => `Vom Kostenschutz zurückgehalten: ${count}.`,
  },
  es: {
    connected: (name, type) => `Conectado a la cuenta Twilio «${name}» (${type}).`,
    trial:
      'Cuenta de prueba: los SMS y las llamadas solo llegan a números verificados, con un aviso de Twilio.',
    balance: (amount) => `Saldo: ${amount}.`,
    noBalance: 'Saldo no legible con estas credenciales.',
    senderOwned: (sender) => `Remitente ${sender}: un número de su cuenta.`,
    senderNotOwned: (sender) => `Remitente ${sender}: no figura entre los números de su cuenta.`,
    senderUnchecked: (sender) => `Remitente ${sender}: no se ha podido comprobar.`,
    senderService: 'Remitente: un Messaging Service.',
    senderAlphanumeric: (sender) => `Remitente: el nombre «${sender}» (solo SMS, sin llamadas).`,
    usage: (sms, smsLimit, calls, callLimit) =>
      `Hoy: ${sms}/${smsLimit} SMS, ${calls}/${callLimit} llamadas.`,
    recipients: (count) => `Destinatarios por defecto: ${count}.`,
    ignored: (count) => `Destinatarios por defecto ignorados (no en formato +…): ${count}.`,
    failed: (reason) => `Conexión imposible: ${reason}.`,
    testSent: (count) => `SMS de prueba enviado a ${count} destinatario(s).`,
    testNotSent: 'No se ha enviado ningún SMS de prueba.',
    testRefused: (count) => `Rechazados por Twilio: ${count}, vea «Último fallo».`,
    testSkipped: (count) => `Retenidos por el control de gastos: ${count}.`,
  },
};

// Account types as Twilio names them.
export const ACCOUNT_TYPE_TEXT = {
  Trial: { en: 'trial', fr: 'essai', de: 'Testversion', es: 'prueba' },
  Full: { en: 'paid', fr: 'payant', de: 'kostenpflichtig', es: 'de pago' },
};

// The "Last failure" text feature of the device.
export const FAILURE_TEXT = {
  en: { none: 'No failure', sms: 'SMS', call: 'Call' },
  fr: { none: 'Aucun échec', sms: 'SMS', call: 'Appel' },
  de: { none: 'Kein Fehler', sms: 'SMS', call: 'Anruf' },
  es: { none: 'Ningún fallo', sms: 'SMS', call: 'Llamada' },
};
