// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+). The core resolves the
// fields first: the scene variables of the `string` fields are substituted,
// the defaults applied. Keys are permanent once published.
//
// A failure on Twilio's side does not throw: the outputs say what happened, so
// the scene can go on with "only continue if" (call the next person when
// nobody answered). Only an action that cannot run at all throws (no
// configuration, no recipient, empty message).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  send_sms: (hub, { fields }) =>
    hub.sendSms({ recipients: fields.recipients, message: fields.message, source: 'scene' }),

  make_call: (hub, { fields }) =>
    hub.call({
      to: fields.recipient,
      message: fields.message,
      language: fields.language,
      voice: fields.voice,
      repeat: fields.repeat,
      // An older scene, or a core that drops booleans: wait, the safe default.
      wait: fields.wait_for_answer !== false,
    }),
};
