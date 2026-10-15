# Twilio for Gladys Assistant

Send **SMS** and place **voice calls** from [Gladys Assistant](https://gladysassistant.com)
scenes through your own [Twilio](https://www.twilio.com) account, with a **cost
guard** that caps what Gladys may send per hour and per day. Useful when an app
notification is not enough: a water leak, an alarm, an elderly relative who
does not answer.

> **Developed without the hardware: feedback welcome.** This integration was
> built against the documented Twilio REST API (version 2010-04-01), without a
> real Twilio account. If something does not work as described, please open an
> [issue](https://github.com/guim31/gladys-twilio/issues) or post on the
> [Gladys forum](https://community.gladysassistant.com).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

- **Scene action "Send an SMS"**: one SMS per recipient (up to 10), with the
  scene variables in the text; outputs the number sent, held back and refused.
- **Scene action "Make a call"**: calls a number and reads the message out with
  a text-to-speech voice in English, French, German or Spanish (female or male
  Amazon Polly voice), 1 to 3 times. It can wait for the outcome and outputs
  whether the call was answered, so a scene can call the next person.
- **Scene trigger "SMS or call failed"**: refused by Twilio, not delivered, not
  answered, busy… with the reason and the Twilio error code. Twilio reports
  delivery after the fact: each SMS and call is read back a few times.
- **Scene trigger "Cost guard limit reached"**: once per episode, to catch a
  scene that loops.
- **Cost guard**: most SMS and calls per rolling hour and per calendar day,
  counted in `/data` (survives a restart), checked before every request.
- **"Twilio account" device**: balance (in the account currency), SMS sent
  today, calls placed today, last failure.
- **Dashboard widget**: balance, usage against the daily limits, account state,
  last failure, link to the Twilio console.
- **Configuration buttons**: _Test the connection_ (account, type, balance,
  sender ownership, today's usage) and _Send a test SMS_.

## Requirements

- Gladys Assistant **5.1.0** or later.
- A Twilio account with balance and a Twilio phone number. A trial account
  works with its limits (verified recipients only, Twilio notice in each
  message).
- The Account SID and, preferably, a Standard **API key** (SID `SK…` and
  secret); the Auth Token works too.

## Installation

In Gladys: **Integrations → Install from GitHub**, then enter
`https://github.com/guim31/gladys-twilio`. Fill in the configuration, click
**Test the connection**, then add the **Twilio account** device from the
**Discover** tab. Details in the [documentation](docs/en.md).

## How it works

- Every request goes to `https://api.twilio.com/2010-04-01` with HTTP Basic
  authentication (API key or Auth Token). No webhook, no public URL, no port
  opened.
- A call carries its TwiML inline (`Twiml` parameter): a `<Say>` per reading,
  the text XML-escaped, so whatever a scene variable holds is read out and never
  interpreted. Ring time is configurable (15 to 60 s) and every call is capped
  at 3 minutes (`TimeLimit`), so a voicemail cannot keep the line open.
- The balance and the account are read every 15 minutes by the container's own
  timer (the device is published with `should_poll: false`; Gladys' `onPoll`
  is only a fallback, see GladysAssistant/Gladys#3198), and at midnight the
  counters of the day go back to 0.
- Only changed states are published (SDK `publishChangedStates`), with a 6-hour
  heartbeat.
- Phone numbers are masked in the logs and in `/data`
  (`+336******01`); secrets are never logged.

## Limitations

- **No incoming SMS**: Twilio delivers them to a public URL. Gladys is not
  exposed to the Internet, and the Gladys Plus webhook relay does not forward
  the `X-Twilio-Signature` header, so an incoming message could not be
  authenticated.
- A voicemail that picks up counts as answered (no paid answering-machine
  detection); a shorter ring time avoids it.
- SMS and voice only: no MMS, no WhatsApp.
- Not checked against a real Twilio account: the test fixtures follow the
  documented API. `scripts/probe.mjs` runs the real client against
  `api.twilio.com` with made-up credentials (it only expects the 401 refusal,
  sends nothing) and, given real credentials in the environment, reads the
  account and the balance.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
node scripts/probe.mjs   # needs network access to api.twilio.com
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Twilio API (`test/helpers/fakeTwilio.js`) built from the
fixtures of `test/fixtures/twilio/`. See [`CLAUDE.md`](CLAUDE.md) for the
project rules.

Releases go through the **Release** workflow (Actions → Release). Prefer the
terminal? A hand-pushed `vX.Y.Z` tag triggers the same build and GitHub
Release, but only after bumping `version` in `package.json` and in
`gladys-assistant-integration.json` (with its `docker_image` tag) yourself.

## Credits

- Home Assistant's
  [`twilio_sms`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/twilio_sms)
  and [`twilio_call`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/twilio_call)
  integrations (Apache-2.0): the scope (SMS, calls reading a message, a
  sender that may be a name for SMS). No code was copied; calls here use
  inline TwiML instead of the twimlets service.
- [twilio/twilio-oai](https://github.com/twilio/twilio-oai) (MIT): the OpenAPI
  description of the 2010-04-01 API, whose resource shapes the fixtures follow.
- The architecture, the conformity and translation tests follow
  [gladys-pihole](https://github.com/guim31/gladys-pihole),
  [gladys-wled](https://github.com/guim31/gladys-wled) and
  [gladys-subsonic](https://github.com/guim31/gladys-subsonic).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Twilio Inc.
"Twilio" is a trademark of Twilio Inc. You are responsible for the costs of your
Twilio account and for following Twilio's
[Acceptable Use Policy](https://www.twilio.com/en-us/legal/aup).

## License

[Apache-2.0](LICENSE)
