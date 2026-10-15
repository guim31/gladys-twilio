// -----------------------------------------------------------------------------
// The TwiML of a call: the message read by Twilio's text-to-speech, sent inline
// with the call (`Twiml` parameter), so Twilio never has to fetch anything from
// Gladys and no public URL is needed.
//
// The voices are standard Amazon Polly voices, one female and one male per
// language of Gladys. The text is XML-escaped: whatever a scene variable holds,
// it is read out, never interpreted as TwiML.
// -----------------------------------------------------------------------------

export const VOICE_TABLE = {
  en: { language: 'en-US', female: 'Polly.Joanna', male: 'Polly.Matthew' },
  fr: { language: 'fr-FR', female: 'Polly.Lea', male: 'Polly.Mathieu' },
  de: { language: 'de-DE', female: 'Polly.Vicki', male: 'Polly.Hans' },
  es: { language: 'es-ES', female: 'Polly.Lucia', male: 'Polly.Enrique' },
};

// Twilio refuses an inline TwiML over 4000 characters.
export const MAX_TWIML_LENGTH = 4000;
// Longest text read out; a call is billed by the minute.
export const MAX_SPOKEN_LENGTH = 1000;
export const MAX_REPEAT = 3;

const escapeXml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Control characters are not allowed in XML 1.0 (tab and new lines are).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

/**
 * @param {object} options
 * @param {string} options.text what is read out
 * @param {string} options.language en, fr, de or es
 * @param {'female'|'male'} options.voice
 * @param {number} options.repeat times the text is read (1 to 3)
 * @returns {string} the TwiML document, at most MAX_TWIML_LENGTH characters
 */
export function buildSayTwiml({ text, language, voice, repeat }) {
  const table = VOICE_TABLE[language] ?? VOICE_TABLE.en;
  const times = Math.min(MAX_REPEAT, Math.max(1, Math.round(Number(repeat) || 1)));
  let spoken = String(text).replace(CONTROL, ' ').trim().slice(0, MAX_SPOKEN_LENGTH);

  const build = (content) => {
    const say = `<Say voice="${table[voice] ?? table.female}" language="${table.language}">${escapeXml(content)}</Say>`;
    // A pause first: the callee says "hello" before listening. Then a pause
    // between two readings.
    const body = Array.from({ length: times }, () => say).join('<Pause length="1"/>');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/>${body}</Response>`;
  };

  let twiml = build(spoken);
  // Escaping can push a long text with many "&" over the limit: shorten it.
  while (twiml.length > MAX_TWIML_LENGTH && spoken.length > 0) {
    spoken = spoken.slice(0, Math.floor(spoken.length * 0.9));
    twiml = build(spoken);
  }
  return twiml;
}
