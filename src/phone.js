// -----------------------------------------------------------------------------
// Phone numbers and sender ids.
//
// Twilio wants E.164 numbers (`+33612345678`). Users type them with spaces,
// dots, dashes or a `00` prefix: those are cleaned up here. A national number
// (`06 12 34 56 78`) is refused rather than guessed: the country cannot be
// told from the number, and a wrong guess calls a stranger abroad.
//
// Phone numbers are personal data: the logs, the device and /data only ever
// see them masked (maskPhone).
// -----------------------------------------------------------------------------

const E164 = /^\+[1-9]\d{6,14}$/;
const MESSAGING_SERVICE = /^MG[0-9a-f]{32}$/i;
// Alphanumeric sender id: 1 to 11 letters, digits or spaces, at least one letter.
const ALPHANUMERIC = /^(?=.{1,11}$)[a-z0-9 ]*[a-z][a-z0-9 ]*$/i;

// Most recipients an action accepts at once: a typo in a scene must not text
// a whole address book (the cost guard applies on top).
export const MAX_RECIPIENTS = 10;

/**
 * @param {unknown} raw a number as typed by the user
 * @returns {string|null} the E.164 number, null when unusable
 */
export function normalizePhone(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return null;
  }
  let text = String(raw)
    .trim()
    .replace(/[\s.\-()/]/g, '');
  if (text.startsWith('00')) {
    text = `+${text.slice(2)}`;
  }
  return E164.test(text) ? text : null;
}

/**
 * A list of numbers separated by commas, semicolons or new lines.
 * @param {unknown} raw
 * @returns {{ valid: string[], invalid: string[] }} unique valid numbers in
 *   the order typed (the first ones come first when the cost guard cuts the
 *   list), and the parts that are not numbers
 */
export function parseRecipients(raw) {
  const valid = [];
  const invalid = [];
  if (typeof raw !== 'string') {
    return { valid, invalid };
  }
  for (const part of raw.split(/[,;\n]/)) {
    const text = part.trim();
    if (!text) {
      continue;
    }
    const phone = normalizePhone(text);
    if (phone === null) {
      invalid.push(text);
    } else if (!valid.includes(phone)) {
      valid.push(phone);
    }
  }
  return { valid, invalid };
}

/**
 * The sender typed in the configuration.
 * @param {unknown} raw
 * @returns {{ type: 'phone'|'service'|'alphanumeric', value: string }|null}
 *   a phone number (SMS and calls), a Messaging Service SID or an
 *   alphanumeric sender id (SMS only)
 */
export function parseSender(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const text = raw.trim();
  const phone = normalizePhone(text);
  if (phone) {
    return { type: 'phone', value: phone };
  }
  if (MESSAGING_SERVICE.test(text)) {
    return { type: 'service', value: `MG${text.slice(2).toLowerCase()}` };
  }
  if (ALPHANUMERIC.test(text)) {
    return { type: 'alphanumeric', value: text };
  }
  return null;
}

/**
 * `+33612345678` → `+336******78`: enough to tell two recipients apart in the
 * logs, not enough to call them.
 * @param {string} phone
 */
export function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 7) {
    return '***';
  }
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}

/**
 * Mask every phone number found in a text (Twilio error messages quote them).
 * @param {string} text
 */
export function maskPhonesIn(text) {
  return String(text).replace(/\+?\d[\d ]{5,17}\d/g, (match) => {
    const digits = match.replace(/ /g, '');
    if (digits.replace('+', '').length < 7) {
      return match;
    }
    return maskPhone(digits.startsWith('+') ? digits : `+${digits}`);
  });
}
