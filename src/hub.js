// -----------------------------------------------------------------------------
// The Twilio hub: the account read on a timer of the container (balance every
// 15 minutes), the SMS and the calls of the scene actions behind the cost
// guard, the follow-up of each send (Twilio says "queued" at once and the
// outcome later), the "Twilio account" device states, the scene events and the
// connection status.
//
// Gladys never polls the device (should_poll: false, and Gladys#3198): the
// hub's timer does the work, the core's onPoll is only a fallback.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { canConnect } from './config.js';
import { FEATURE_KEYS, buildDevice, deviceIds } from './devices.js';
import { createIssueLog } from './issues.js';
import { MAX_RECIPIENTS, maskPhone, normalizePhone, parseRecipients } from './phone.js';
import {
  ACCOUNT_TYPE_TEXT,
  ACTION_TEXT,
  FAILURE_TEXT,
  LANGUAGE_FALLBACK,
  PROBLEM_TEXT,
  REPORT_TEXT,
  TEST_SMS_BODY,
  pick,
  reasonText,
} from './texts.js';
import { ERROR_KINDS, TwilioClient, TwilioError, deliveryKind, maskSid } from './twilio/client.js';
import { VOICE_TABLE, buildSayTwiml } from './twilio/twiml.js';
import { Usage, msUntilMidnight } from './usage.js';

const logger = createLogger({ name: 'twilio-hub' });

export const WIDGET_KEY = 'twilio_account';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  SEND_FAILED: 'send_failed',
  LIMIT_REACHED: 'limit_reached',
});

// The `status` of a failed SMS or call (send_failed trigger filter and variable).
export const FAILURE_STATUSES = Object.freeze({
  REFUSED: 'refused', // Twilio refused the request (nothing billed)
  FAILED: 'failed', // accepted, then failed
  UNDELIVERED: 'undelivered', // SMS not delivered by the carrier
  NO_ANSWER: 'no-answer',
  BUSY: 'busy',
  CANCELED: 'canceled',
});

// The `status` output of the "Make a call" scene action.
export const CALL_OUTCOMES = Object.freeze({
  ANSWERED: 'answered',
  NO_ANSWER: 'no-answer',
  BUSY: 'busy',
  FAILED: 'failed',
  CANCELED: 'canceled',
  REFUSED: 'refused',
  BLOCKED: 'blocked', // held back by the cost guard
  PENDING: 'pending', // not known yet (not waited for, or still ringing)
});

export const HUB_TIMINGS = {
  // The balance and the account status; a call costs cents, not less.
  refreshMs: 15 * 60_000,
  // Re-send unchanged values this often, or Gladys shows "no recent value".
  heartbeatMs: 6 * 60 * 60_000,
  // How often a call is read back while the action waits for the answer.
  callPollMs: 3_000,
  // Waiting for the answer: the ring time plus this margin (Twilio adds up to
  // 5 s to the ring time, and the call takes a few seconds to start).
  callWaitMarginMs: 20_000,
  // When the outcome of an SMS is read back after it was sent.
  smsChecksMs: [60_000, 5 * 60_000, 20 * 60_000],
  // ... and the outcome of a call not waited for (after the ring time).
  callChecksMs: [30_000, 2 * 60_000, 10 * 60_000],
};

// Longest call: what the message needs, bounded so a voicemail that keeps the
// line open is not billed for long.
const CALL_TIME_LIMIT_SECONDS = 180;
// Twilio splits longer texts into several SMS (billed each) up to 1600 characters.
export const MAX_SMS_LENGTH = 1600;
// Follow-ups kept in memory at most (one GET each, a few times).
const MAX_PENDING = 50;

const SMS_FINAL_OK = new Set(['delivered', 'read', 'received']);
const SMS_FINAL_FAILED = new Set(['failed', 'undelivered', 'canceled']);

/** The outcome of a call status, null while it is not known. */
export function callOutcome(status) {
  switch (status) {
    case 'in-progress':
    case 'completed':
      return CALL_OUTCOMES.ANSWERED;
    case 'busy':
      return CALL_OUTCOMES.BUSY;
    case 'no-answer':
      return CALL_OUTCOMES.NO_ANSWER;
    case 'failed':
      return CALL_OUTCOMES.FAILED;
    case 'canceled':
      return CALL_OUTCOMES.CANCELED;
    default:
      return null; // queued, initiated, ringing
  }
}

/** "12.34 USD" with two decimals. */
export const formatAmount = (balance) =>
  balance ? `${balance.amount.toFixed(2)} ${balance.currency}` : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class TwilioHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/twilio/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep] wait between call reads
   */
  constructor({ gladys, store, request, timers = true, timings, now, sleep: wait }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.sleep = wait ?? sleep;
    this.issues = createIssueLog(logger);
    this.config = null;
    this.client = null;
    this.account = null; // { name, type, status }
    this.balance = null; // { amount, currency }
    this.balanceReadable = null;
    this.error = null; // TwilioError of the last account read
    this.connected = null; // whether the lifecycle "connected" line was written
    this.usage = new Usage();
    this.lastFailure = null; // { at, kind, to (masked), reason, code }
    this.currency = null;
    this.limitsHit = new Set();
    this.pending = [];
    this.pendingTimer = null;
    this.refreshTimer = null;
    this.refreshing = null;
    this.lastRefreshAt = null;
    this.connectionKey = null;
    this.transport = null;
    this.stopped = false;
  }

  get language() {
    return this.config?.language ?? 'fr';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.usage = new Usage(saved.usage);
    this.lastFailure =
      saved.lastFailure && typeof saved.lastFailure === 'object' ? saved.lastFailure : null;
    this.currency = typeof saved.currency === 'string' ? saved.currency : null;
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connectionKey = null;
    this.transport = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (previous?.accountSid !== config.accountSid) {
      // Another account: its balance and currency are not the previous ones.
      this.balance = null;
      this.balanceReadable = null;
      if (previous) {
        this.currency = null;
        this.save();
      }
    }
    this.client = canConnect(config)
      ? new TwilioClient({
          accountSid: config.accountSid,
          credentials: config.credentials,
          request: this.request,
        })
      : null;
    this.account = null;
    this.error = null;
    this.connected = null;
    this.lastRefreshAt = null;
    if (!this.client) {
      logger.info('Not configured yet: waiting for the Account SID and the credentials');
    }
    await this.publishDevices();
    // A read in progress may use the previous configuration: read again after it.
    await this.refreshing?.catch(() => {});
    await this.refresh();
    this.scheduleRefresh();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.refreshTimer);
    clearTimeout(this.pendingTimer);
    await this.store.flush();
  }

  save() {
    this.store.save({
      usage: this.usage.toJSON(),
      lastFailure: this.lastFailure,
      currency: this.currency,
    });
  }

  scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    // At midnight too: the "today" counters go back to 0.
    const delay = Math.min(this.timings.refreshMs, msUntilMidnight(this.now()) + 1_000);
    this.refreshTimer = setTimeout(async () => {
      try {
        await this.cycle();
        this.issues.ok('cycle', 'Refresh cycle works again');
      } catch (err) {
        this.issues.fail('cycle', `Refresh cycle failed: ${err.message}`);
      }
      this.scheduleRefresh();
    }, delay);
  }

  /** One timer tick: read the account when due, publish the counters anyway. */
  async cycle() {
    if (
      this.lastRefreshAt === null ||
      this.now() - this.lastRefreshAt >= this.timings.refreshMs / 2
    ) {
      await this.refresh();
    } else {
      await this.publishStates();
    }
  }

  /** The core's onPoll (fallback): read the account unless the timer just did. */
  async pollDevice(device) {
    if (!this.config?.accountSid || device.external_id !== this.deviceId()) {
      return;
    }
    if (
      this.lastRefreshAt !== null &&
      this.now() - this.lastRefreshAt < this.timings.refreshMs * 0.9
    ) {
      logger.debug('onPoll skipped: the account was read recently');
      await this.publishStates();
      return;
    }
    await this.refresh();
  }

  // --- Reading the account -----------------------------------------------------

  /** Read the account and its balance; concurrent calls share the read. */
  refresh() {
    this.refreshing ??= this.readAccount().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async readAccount() {
    this.lastRefreshAt = this.now();
    let changed = false;
    if (this.client) {
      const client = this.client;
      try {
        const account = await client.getAccount();
        if (client !== this.client) {
          return; // reconfigured meanwhile
        }
        this.account = {
          name: typeof account.friendly_name === 'string' ? account.friendly_name : '',
          type: account.type === 'Trial' ? 'Trial' : 'Full',
          status: account.status,
        };
        if (account.status && account.status !== 'active') {
          throw new TwilioError(ERROR_KINDS.SUSPENDED, `Twilio account ${account.status}`);
        }
        changed = (await this.readBalance(client)) || changed;
        changed = this.markConnected() || changed;
      } catch (err) {
        if (!(err instanceof TwilioError)) {
          throw err;
        }
        changed = this.markError(err) || changed;
      }
    }
    await this.publishStates();
    await this.publishTransport();
    await this.publishConnectionStatus();
    if (changed) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** @returns {Promise<boolean>} whether something the widget shows changed */
  async readBalance(client) {
    try {
      const answer = await client.getBalance();
      const amount = Number.parseFloat(answer.balance);
      const currency = typeof answer.currency === 'string' ? answer.currency.toUpperCase() : null;
      if (!Number.isFinite(amount) || !currency) {
        throw new TwilioError(ERROR_KINDS.REFUSED, 'Twilio balance not understood');
      }
      const previous = this.balance;
      this.balance = { amount: Math.round(amount * 100) / 100, currency };
      this.balanceReadable = true;
      this.issues.ok('balance', 'Twilio balance readable again');
      if (this.currency !== currency) {
        // The balance feature appears (or changes unit): publish the device again.
        this.currency = currency;
        this.save();
        await this.publishDevices();
      }
      return previous?.amount !== this.balance.amount || previous?.currency !== currency;
    } catch (err) {
      if (!(err instanceof TwilioError)) {
        throw err;
      }
      if (
        [ERROR_KINDS.UNREACHABLE, ERROR_KINDS.SERVER, ERROR_KINDS.RATE_LIMIT].includes(err.kind)
      ) {
        throw err; // Twilio itself is the problem, not the balance
      }
      // An API key may not be allowed to read the balance: not a lost connection.
      const changed = this.balanceReadable !== false;
      this.balanceReadable = false;
      this.issues.fail('balance', `Twilio balance not readable: ${err.message}`);
      return changed;
    }
  }

  markConnected() {
    const wasError = this.error;
    const first = this.connected === null;
    this.error = null;
    this.issues.ok('account', 'Twilio answers again');
    if (first && !wasError) {
      logger.info(
        `Connected to the Twilio account ${maskSid(this.config.accountSid)} (${this.account.type}, ${this.config.authMode})`,
      );
    }
    this.connected = true;
    return Boolean(wasError) || first;
  }

  markError(err) {
    const changed = this.error?.kind !== err.kind;
    this.error = err;
    this.issues.fail('account', `Twilio account check failed: ${err.message}`);
    return changed;
  }

  // --- Publishing to Gladys ------------------------------------------------------

  deviceId() {
    return deviceIds(this.gladys, this.config.accountSid).device;
  }

  isCreated() {
    if (!this.config?.accountSid) {
      return false;
    }
    const id = this.deviceId();
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  buildDevices() {
    if (!this.config?.accountSid) {
      return [];
    }
    return [
      buildDevice(this.gladys, {
        accountSid: this.config.accountSid,
        currency: this.currency,
        language: this.language,
      }),
    ];
  }

  async publishDevices() {
    try {
      // Even an empty list: the Discovery tab then shows no stale account.
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
      this.issues.ok('discovery', 'Device published again');
    } catch (err) {
      this.issues.fail('discovery', `Publishing the device failed: ${err.message}`);
    }
  }

  /** The text of the "Last failure" feature. */
  failureText(language = this.language) {
    const words = FAILURE_TEXT[language] ?? FAILURE_TEXT[LANGUAGE_FALLBACK];
    const failure = this.lastFailure;
    if (!failure) {
      return words.none;
    }
    const at = new Date(failure.at);
    const pad = (n) => String(n).padStart(2, '0');
    const when = `${pad(at.getDate())}/${pad(at.getMonth() + 1)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
    return [
      when,
      `${words[failure.kind] ?? failure.kind} ${failure.to}`,
      reasonText(failure.reason, failure.code, language),
    ].join(' · ');
  }

  featureStates() {
    const ids = deviceIds(this.gladys, this.config.accountSid);
    const now = this.now();
    const states = [
      {
        device_feature_external_id: ids.feature(FEATURE_KEYS.SMS_TODAY),
        state: this.usage.today('sms', now),
      },
      {
        device_feature_external_id: ids.feature(FEATURE_KEYS.CALLS_TODAY),
        state: this.usage.today('call', now),
      },
      {
        device_feature_external_id: ids.feature(FEATURE_KEYS.LAST_FAILURE),
        text: this.failureText(),
      },
    ];
    if (this.balance && this.currency === this.balance.currency) {
      states.unshift({
        device_feature_external_id: ids.feature(FEATURE_KEYS.BALANCE),
        state: this.balance.amount,
      });
    }
    return states;
  }

  /** Send what changed (and, past the heartbeat, what did not) for an added device. */
  async publishStates() {
    if (!this.isCreated()) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(this.featureStates(), {
        heartbeat: this.timings.heartbeatMs,
      });
      this.issues.ok('states', 'States accepted again');
    } catch (err) {
      this.issues.fail('states', `States refused: ${err.message}`);
    }
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.config?.accountSid || device.external_id !== this.deviceId()) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    this.transport = null;
    await this.publishStates();
    await this.publishTransport();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async publishTransport() {
    if (!this.client || !this.isCreated()) {
      return;
    }
    const transport =
      this.error?.kind === ERROR_KINDS.UNREACHABLE
        ? DEVICE_TRANSPORTS.UNREACHABLE
        : DEVICE_TRANSPORTS.CLOUD;
    if (this.transport === transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: this.deviceId(), transport }]);
      this.transport = transport;
      this.issues.ok('transport', 'Transport accepted again');
    } catch (err) {
      this.issues.fail('transport', `Transport refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    const problems = this.config?.problems ?? [];
    if (problems.length) {
      const message = {};
      for (const language of Object.keys(PROBLEM_TEXT[problems[0]])) {
        message[language] = problems
          .map((problem) => pick(PROBLEM_TEXT[problem], language))
          .join(' ')
          .slice(0, 200);
      }
      // The sender alone missing still lets the account be read.
      return { connected: Boolean(this.client && this.account && !this.error), message };
    }
    if (this.error) {
      const message = {};
      for (const language of Object.keys(TEST_SMS_BODY)) {
        message[language] = reasonText(this.error.kind, this.error.code, language);
      }
      return { connected: false, message };
    }
    return { connected: Boolean(this.account) };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connectionKey) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connectionKey = key;
      this.issues.ok('connection-status', 'Connection status accepted again');
    } catch (err) {
      this.issues.fail('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.issues.ok('scene-event', 'Scene events accepted again');
    } catch (err) {
      this.issues.fail('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Failures -------------------------------------------------------------------

  /**
   * An SMS or a call did not reach its recipient: shown by the device, and
   * announced to the scenes (send_failed) unless the cost guard held it back
   * (limit_reached says so instead).
   */
  async recordFailure({ kind, to, reason, code = null, status, announce = true }) {
    this.lastFailure = { at: this.now(), kind, to: maskPhone(to), reason, code };
    this.save();
    if (announce) {
      logger.warn(
        `${kind === 'sms' ? 'SMS' : 'Call'} to ${maskPhone(to)} failed: ${reason}${code ? ` (Twilio ${code})` : ''}`,
      );
      await this.fire(TRIGGERS.SEND_FAILED, {
        kind,
        recipient: to,
        status,
        reason: reasonText(reason, code, this.language),
        error_code: code,
      });
    }
    await this.publishStates();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** A send hit a credentials or account problem: the connection status says it too. */
  async noteAccountError(err) {
    if ([ERROR_KINDS.AUTH, ERROR_KINDS.NOT_FOUND, ERROR_KINDS.SUSPENDED].includes(err.kind)) {
      this.markError(err);
      await this.publishConnectionStatus();
    }
  }

  /**
   * The cost guard held back `skipped` sends. The scenes hear it once per
   * episode: again only after a send of that kind went through in full.
   */
  async limitReached(kind, { window, limit }, skipped, recipients) {
    const reason = window === 'day' ? 'limit_day' : 'limit_hour';
    this.issues.fail(
      `limit:${kind}`,
      `Cost guard: ${kind === 'sms' ? 'SMS' : 'call'} ${window}ly limit (${limit}) reached, ${skipped} held back`,
    );
    // The device shows it as the last failure; the warning above is enough
    // for the logs, said once while the guard holds.
    await this.recordFailure({ kind, to: recipients[0], reason, status: null, announce: false });
    const key = `${kind}:${window}`;
    if (this.limitsHit.has(key)) {
      return;
    }
    this.limitsHit.add(key);
    await this.fire(TRIGGERS.LIMIT_REACHED, { kind, window, limit, skipped });
  }

  limitCleared(kind) {
    this.limitsHit.delete(`${kind}:hour`);
    this.limitsHit.delete(`${kind}:day`);
    this.issues.ok(
      `limit:${kind}`,
      `Cost guard: ${kind === 'sms' ? 'SMS' : 'calls'} allowed again`,
    );
  }

  // --- Sending ----------------------------------------------------------------------

  /** @throws {Error} translated, when the integration cannot send at all */
  ensureReady() {
    if (!this.client || !this.config.sender) {
      throw new Error(pick(ACTION_TEXT.notConfigured, this.language));
    }
  }

  /** The recipients typed in the action, else the default ones. */
  recipientsOf(raw) {
    const typed = typeof raw === 'string' ? raw.trim() : '';
    if (typed) {
      const { valid, invalid } = parseRecipients(typed);
      if (invalid.length) {
        throw new Error(
          `${pick(ACTION_TEXT.invalidRecipient, this.language)} ${invalid.join(', ')}`,
        );
      }
      return valid;
    }
    return this.config.defaultRecipients;
  }

  /**
   * Send one SMS to each recipient (scene action, test button).
   * @param {{ recipients?: string, message: string, source: string }} options
   * @returns {Promise<{ sent: number, skipped: number, failed: number }>}
   */
  async sendSms({ recipients, message, source }) {
    this.ensureReady();
    const body = typeof message === 'string' ? message.trim() : '';
    if (!body) {
      throw new Error(pick(ACTION_TEXT.emptyMessage, this.language));
    }
    const targets = this.recipientsOf(recipients);
    if (targets.length === 0) {
      throw new Error(pick(ACTION_TEXT.noRecipient, this.language));
    }
    if (targets.length > MAX_RECIPIENTS) {
      throw new Error(pick(ACTION_TEXT.tooManyRecipients, this.language));
    }

    const reservedAt = this.now();
    const quota = this.usage.reserve('sms', targets.length, this.config.limits.sms, reservedAt);
    const allowed = targets.slice(0, quota.granted);
    const held = targets.slice(quota.granted);
    this.save();
    if (held.length) {
      await this.limitReached('sms', quota, held.length, held);
    } else {
      this.limitCleared('sms');
    }

    let sent = 0;
    let failed = 0;
    const client = this.client;
    // In parallel: Twilio queues them anyway, and ten slow answers in a row
    // could outlast the deadline of the scene action.
    await Promise.all(
      allowed.map(async (to) => {
        try {
          const answer = await client.sendSms({
            to,
            sender: this.config.sender,
            body: body.slice(0, MAX_SMS_LENGTH),
          });
          sent += 1;
          this.follow({ kind: 'sms', sid: answer.sid, to });
        } catch (err) {
          if (!(err instanceof TwilioError)) {
            throw err;
          }
          // A refusal is not billed; a lost answer may have been.
          if (err.kind !== ERROR_KINDS.UNREACHABLE) {
            this.usage.release('sms', reservedAt);
          }
          failed += 1;
          await this.noteAccountError(err);
          await this.recordFailure({
            kind: 'sms',
            to,
            reason: err.kind,
            code: err.code,
            status: FAILURE_STATUSES.REFUSED,
          });
        }
      }),
    );
    this.save();
    logger.info(
      `SMS (${source}): ${sent} sent, ${failed} refused, ${held.length} held back by the cost guard`,
    );
    await this.publishStates();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
    return { sent, skipped: held.length, failed };
  }

  /**
   * Place a call that reads a message out.
   * @param {object} options
   * @param {string} [options.to] the recipient, else the first default recipient
   * @param {string} options.message
   * @param {string} [options.language] en, fr, de or es; else the configuration's
   * @param {string} [options.voice] female or male; else the configuration's
   * @param {number} [options.repeat] readings, 1 to 3
   * @param {boolean} [options.wait] wait until the call is answered or not
   * @returns {Promise<{ call_sid: string, status: string, answered: boolean }>}
   */
  async call({ to, message, language, voice, repeat = 2, wait = true }) {
    this.ensureReady();
    if (this.config.sender.type !== 'phone') {
      throw new Error(pick(ACTION_TEXT.callNeedsPhone, this.language));
    }
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) {
      throw new Error(pick(ACTION_TEXT.emptyMessage, this.language));
    }
    const typed = typeof to === 'string' ? to.trim() : '';
    const recipient = typed ? normalizePhone(typed) : (this.config.defaultRecipients[0] ?? null);
    if (typed && !recipient) {
      throw new Error(`${pick(ACTION_TEXT.invalidRecipient, this.language)} ${typed}`);
    }
    if (!recipient) {
      throw new Error(pick(ACTION_TEXT.noRecipient, this.language));
    }

    const reservedAt = this.now();
    const quota = this.usage.reserve('call', 1, this.config.limits.call, reservedAt);
    this.save();
    if (quota.granted === 0) {
      await this.limitReached('call', quota, 1, [recipient]);
      logger.info(`Call to ${maskPhone(recipient)}: held back by the cost guard`);
      return { call_sid: '', status: CALL_OUTCOMES.BLOCKED, answered: false };
    }
    this.limitCleared('call');

    const spokenLanguage = VOICE_TABLE[language] ? language : this.language;
    const twiml = buildSayTwiml({
      text,
      language: spokenLanguage,
      voice: voice === 'male' || voice === 'female' ? voice : this.config.voice,
      repeat,
    });

    let created;
    try {
      created = await this.client.createCall({
        to: recipient,
        from: this.config.sender.value,
        twiml,
        timeout: this.config.ringSeconds,
        timeLimit: CALL_TIME_LIMIT_SECONDS,
      });
    } catch (err) {
      if (!(err instanceof TwilioError)) {
        throw err;
      }
      if (err.kind !== ERROR_KINDS.UNREACHABLE) {
        this.usage.release('call', reservedAt);
      }
      this.save();
      await this.noteAccountError(err);
      await this.recordFailure({
        kind: 'call',
        to: recipient,
        reason: err.kind,
        code: err.code,
        status: FAILURE_STATUSES.REFUSED,
      });
      logger.info(`Call to ${maskPhone(recipient)}: refused by Twilio`);
      return { call_sid: '', status: CALL_OUTCOMES.REFUSED, answered: false };
    }
    await this.publishStates();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);

    let outcome = callOutcome(created.status);
    let code = null;
    if (wait && outcome === null) {
      ({ outcome, code } = await this.waitForAnswer(created.sid));
    }
    if (outcome === null) {
      this.follow({ kind: 'call', sid: created.sid, to: recipient });
    } else if (outcome !== CALL_OUTCOMES.ANSWERED) {
      await this.recordFailure({
        kind: 'call',
        to: recipient,
        reason: outcome,
        code,
        status: outcome,
      });
    }
    const status = outcome ?? CALL_OUTCOMES.PENDING;
    logger.info(`Call to ${maskPhone(recipient)}: ${status}`);
    return {
      call_sid: created.sid,
      status,
      answered: status === CALL_OUTCOMES.ANSWERED,
    };
  }

  /** Read the call back until it is answered or not, within the ring time. */
  async waitForAnswer(sid) {
    const deadline = this.now() + this.config.ringSeconds * 1000 + this.timings.callWaitMarginMs;
    while (this.now() < deadline && !this.stopped) {
      await this.sleep(this.timings.callPollMs);
      try {
        const call = await this.client.getCall(sid);
        const outcome = callOutcome(call.status);
        if (outcome !== null) {
          return { outcome, code: Number.isInteger(call.error_code) ? call.error_code : null };
        }
      } catch (err) {
        if (!(err instanceof TwilioError)) {
          throw err;
        }
        logger.debug(`Reading the call back failed: ${err.message}`);
      }
    }
    return { outcome: null, code: null };
  }

  // --- Follow-up of the sends ---------------------------------------------------------

  /** Read an SMS or a call back later: Twilio only says "queued" at first. */
  follow({ kind, sid, to }) {
    if (typeof sid !== 'string' || !sid) {
      return;
    }
    const delays = kind === 'sms' ? this.timings.smsChecksMs : this.timings.callChecksMs;
    const base = kind === 'call' ? this.config.ringSeconds * 1000 : 0;
    if (this.pending.length >= MAX_PENDING) {
      this.pending.shift();
    }
    const now = this.now();
    this.pending.push({
      kind,
      sid,
      to,
      client: this.client,
      due: now + base + delays[0],
      tries: 0,
      delays,
      base,
      sentAt: now,
    });
    this.schedulePending();
  }

  schedulePending() {
    clearTimeout(this.pendingTimer);
    if (!this.timersEnabled || this.stopped || this.pending.length === 0) {
      return;
    }
    const next = Math.min(...this.pending.map((item) => item.due));
    this.pendingTimer = setTimeout(
      () => {
        this.checkPending()
          .then(() => this.issues.ok('follow-up', 'Follow-up works again'))
          .catch((err) => this.issues.fail('follow-up', `Follow-up failed: ${err.message}`))
          .finally(() => this.schedulePending());
      },
      Math.max(1_000, next - this.now()),
    );
    this.pendingTimer.unref?.();
  }

  /** Read back every send whose check is due. */
  async checkPending() {
    const now = this.now();
    const due = this.pending.filter((item) => item.due <= now);
    for (const item of due) {
      if (item.client !== this.client) {
        this.pending.splice(this.pending.indexOf(item), 1);
        continue;
      }
      let done = false;
      try {
        done = await (item.kind === 'sms' ? this.checkSms(item) : this.checkCall(item));
      } catch (err) {
        if (!(err instanceof TwilioError)) {
          throw err;
        }
        logger.debug(`Reading back ${maskSid(item.sid)} failed: ${err.message}`);
      }
      item.tries += 1;
      if (done || item.tries >= item.delays.length) {
        this.pending.splice(this.pending.indexOf(item), 1);
      } else {
        item.due = item.sentAt + item.base + item.delays[item.tries];
      }
    }
  }

  /** @returns {Promise<boolean>} whether the outcome is known */
  async checkSms(item) {
    const message = await this.client.getMessage(item.sid);
    const code = Number.isInteger(message.error_code) ? message.error_code : null;
    if (SMS_FINAL_FAILED.has(message.status)) {
      const status =
        message.status === 'undelivered' ? FAILURE_STATUSES.UNDELIVERED : FAILURE_STATUSES.FAILED;
      await this.recordFailure({
        kind: 'sms',
        to: item.to,
        reason: deliveryKind(code) ?? (message.status === 'undelivered' ? 'undelivered' : 'failed'),
        code,
        status: message.status === 'canceled' ? FAILURE_STATUSES.CANCELED : status,
      });
      return true;
    }
    // "sent" is final for the carriers that report no delivery.
    return SMS_FINAL_OK.has(message.status) || (message.status === 'sent' && item.tries >= 1);
  }

  async checkCall(item) {
    const call = await this.client.getCall(item.sid);
    const outcome = callOutcome(call.status);
    if (outcome === null) {
      return false;
    }
    if (outcome !== CALL_OUTCOMES.ANSWERED) {
      const code = Number.isInteger(call.error_code) ? call.error_code : null;
      await this.recordFailure({
        kind: 'call',
        to: item.to,
        reason: outcome,
        code,
        status: outcome,
      });
    }
    return true;
  }

  // --- Configuration actions ------------------------------------------------------------

  /** "Test the connection": read the account now, check the sender, one line each. */
  async testConnection() {
    await this.refresh();
    let owned = null;
    const sender = this.config.sender;
    if (this.client && this.account && !this.error && sender?.type === 'phone') {
      try {
        owned = await this.client.ownsNumber(sender.value);
      } catch (err) {
        if (!(err instanceof TwilioError)) {
          throw err;
        }
        logger.debug(`Checking the sender failed: ${err.message}`);
      }
    }
    const now = this.now();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const lines = [];
      if (this.config.problems.length) {
        lines.push(...this.config.problems.map((problem) => pick(PROBLEM_TEXT[problem], language)));
      }
      if (this.error) {
        lines.push(text.failed(reasonText(this.error.kind, this.error.code, language)));
      } else if (this.account) {
        lines.push(
          text.connected(
            this.account.name || maskSid(this.config.accountSid),
            pick(ACCOUNT_TYPE_TEXT[this.account.type], language),
          ),
        );
        if (this.account.type === 'Trial') {
          lines.push(text.trial);
        }
        lines.push(this.balance ? text.balance(formatAmount(this.balance)) : text.noBalance);
        if (sender?.type === 'phone') {
          const shown = maskPhone(sender.value);
          lines.push(
            owned === true
              ? text.senderOwned(shown)
              : owned === false
                ? text.senderNotOwned(shown)
                : text.senderUnchecked(shown),
          );
        } else if (sender?.type === 'service') {
          lines.push(text.senderService);
        } else if (sender?.type === 'alphanumeric') {
          lines.push(text.senderAlphanumeric(sender.value));
        }
      }
      const { limits, defaultRecipients, invalidDefaultRecipients } = this.config;
      lines.push(
        text.usage(
          this.usage.today('sms', now),
          limits.sms.day,
          this.usage.today('call', now),
          limits.call.day,
        ),
        text.recipients(defaultRecipients.length),
      );
      if (invalidDefaultRecipients.length) {
        lines.push(text.ignored(invalidDefaultRecipients.length));
      }
      message[language] = lines.join('\n');
    }
    logger.info('Action: test the connection');
    return message;
  }

  /** "Send a test SMS": to the number typed, else to the default recipients. */
  async sendTestSms(fields = {}) {
    logger.info('Action: send a test SMS');
    const result = await this.sendSms({
      recipients: fields.to,
      message: pick(TEST_SMS_BODY, this.language),
      source: 'test',
    });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const lines = [result.sent ? text.testSent(result.sent) : text.testNotSent];
      if (result.failed) {
        lines.push(text.testRefused(result.failed));
      }
      if (result.skipped) {
        lines.push(text.testSkipped(result.skipped));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }

  /** What the widget shows. */
  view() {
    const now = this.now();
    return {
      configured: Boolean(this.client),
      account: this.account,
      error: this.error,
      balance: this.balance,
      balanceReadable: this.balanceReadable,
      sms: { today: this.usage.today('sms', now), limit: this.config?.limits.sms.day ?? 0 },
      calls: { today: this.usage.today('call', now), limit: this.config?.limits.call.day ?? 0 },
      lastFailure: this.lastFailure,
    };
  }
}
