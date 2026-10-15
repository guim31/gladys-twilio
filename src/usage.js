// -----------------------------------------------------------------------------
// The cost guard. Twilio bills every SMS and every call: a scene that loops
// (a sensor flapping, a trigger on its own effect) could empty the account in
// an afternoon. The user sets how many SMS and calls are allowed per rolling
// hour and per calendar day; past that, nothing is sent until the window
// frees up.
//
// One timestamp per send accepted by Twilio, kept for 26 hours (a calendar day
// is 25 hours long on a DST change) and saved under /data, so a restart does
// not reset the counters. A slot is reserved before the request, synchronously,
// so two scenes running at once cannot both take the last one; a request
// Twilio refuses is not billed and gives its slot back.
// -----------------------------------------------------------------------------

export const KINDS = ['sms', 'call'];

const HOUR_MS = 60 * 60_000;
const KEEP_MS = 26 * HOUR_MS;

/** The local calendar day of a timestamp (TZ: the time zone of Gladys). */
export function localDay(time) {
  const date = new Date(time);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Milliseconds until the next local midnight. */
export function msUntilMidnight(time) {
  const next = new Date(time);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - time;
}

export class Usage {
  /**
   * @param {object} [saved] what toJSON() returned before a restart
   */
  constructor(saved = {}) {
    this.events = {};
    for (const kind of KINDS) {
      const list = saved?.[kind];
      this.events[kind] = Array.isArray(list)
        ? list.filter((t) => Number.isFinite(t)).sort((a, b) => a - b)
        : [];
    }
  }

  prune(now) {
    for (const kind of KINDS) {
      this.events[kind] = this.events[kind].filter((t) => now - t < KEEP_MS);
    }
  }

  lastHour(kind, now) {
    return this.events[kind].filter((t) => t <= now && now - t < HOUR_MS).length;
  }

  today(kind, now) {
    const day = localDay(now);
    return this.events[kind].filter((t) => localDay(t) === day).length;
  }

  /**
   * How many more sends the limits allow now, and which window binds.
   * @param {'sms'|'call'} kind
   * @param {{ hour: number, day: number }} limits
   * @returns {{ allowed: number, window: 'hour'|'day', limit: number }}
   */
  remaining(kind, limits, now) {
    const hour = Math.max(0, limits.hour - this.lastHour(kind, now));
    const day = Math.max(0, limits.day - this.today(kind, now));
    return day <= hour
      ? { allowed: day, window: 'day', limit: limits.day }
      : { allowed: hour, window: 'hour', limit: limits.hour };
  }

  /**
   * Take up to `count` slots now.
   * @returns {{ granted: number, window: 'hour'|'day', limit: number }} the
   *   binding window when not everything was granted
   */
  reserve(kind, count, limits, now) {
    this.prune(now);
    const { allowed, window, limit } = this.remaining(kind, limits, now);
    const granted = Math.min(count, allowed);
    for (let i = 0; i < granted; i += 1) {
      this.events[kind].push(now);
    }
    return { granted, window, limit };
  }

  /** Give back a slot reserved at `time` (the request was refused, not billed). */
  release(kind, time) {
    const index = this.events[kind].lastIndexOf(time);
    if (index !== -1) {
      this.events[kind].splice(index, 1);
    }
  }

  toJSON() {
    return { sms: [...this.events.sms], call: [...this.events.call] };
  }
}
