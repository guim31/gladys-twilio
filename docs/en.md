# Twilio

Send **SMS** and place **voice calls** from your Gladys scenes through your own
[Twilio](https://www.twilio.com) account: a text message to the family when the
water leak sensor goes off, a phone call that reads the alarm out loud when
nobody looks at their phone, a call to a neighbour when an elderly relative does
not answer. Useful where an app notification is not enough, or where there is
no mobile Internet.

This integration is not affiliated with Twilio. Twilio bills every SMS and every
call to your account: a **cost guard** caps what Gladys may send per hour and
per day.

> **Developed without the hardware: feedback welcome.** This integration was
> built against the documented Twilio API, without a real Twilio account. If
> something does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-twilio/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A Twilio account with some balance, and a **Twilio phone number** able to send
  SMS and place calls to the countries you need. A trial account works, with
  its limits: it only reaches the numbers you verified in Twilio, and its
  messages start with a Twilio notice.
- The **Account SID** (on the home page of the Twilio console, `AC…`).
- Preferably an **API key**: in the Twilio console, **Account** → **API keys &
  tokens** → **Create API key**, type _Standard_. Note its SID (`SK…`) and its
  secret, shown only once. Without an API key, the **Auth Token** of the
  account works too, but it gives full access to the account.
- In the Twilio console, the **geographic permissions** of SMS and voice must
  allow the countries of your recipients.

## Configuration

1. Install the integration from the Gladys catalog.
2. In **Configuration**, fill in the **Account SID**, the **API key SID** and
   **API key secret** (or the **Auth Token**), and the **Sender**: your Twilio
   number in international format, e.g. `+33612345678`.
3. **Default recipients**: the numbers used when an action names none,
   separated by commas, the most important first. Always in international
   format (`+` and the country code): `06 12 34 56 78` is refused, because the
   country cannot be guessed.
4. Set the **cost guard** (see below), the **Voice** and **Ring time** of the
   calls, and the **Language** (French by default).
5. Save, then click **Test the connection**: the message under the button names
   the account, its type, its balance, whether the sender belongs to the
   account, and today's usage.
6. Click **Send a test SMS** (to the default recipients, or to the number you
   type) to check the whole path.
7. Open the **Discover** tab and add the **Twilio account** device.

The sender can also be a **Messaging Service** SID (`MG…`) or an alphanumeric
sender name (`Gladys`, up to 11 characters, where the destination country
allows it). Both work for SMS only: a call always needs a Twilio phone number.

### Cost guard

Four limits: **Most SMS per hour**, **Most SMS per day**, **Most calls per
hour**, **Most calls per day** (10, 30, 5 and 10 by default). The hour is a
rolling hour, the day is the calendar day in the time zone of Gladys. Each
recipient counts as one SMS. Past a limit, nothing more is sent until the window
frees up: the first recipients of a list go first, the others are held back. A
limit of 0 blocks that kind of send. The counters are kept under `/data` and
survive a restart. Only the sends Twilio accepted count: a refused request is
not billed.

## The "Twilio account" device

| Feature                | What it shows                                                                     |
| ---------------------- | --------------------------------------------------------------------------------- |
| **Balance**            | The balance of the account, in its currency, read every 15 minutes.               |
| **SMS sent today**     | SMS accepted by Twilio since midnight.                                            |
| **Calls placed today** | Calls accepted by Twilio since midnight.                                          |
| **Last failure**       | Date, SMS or call, masked number and reason of the last failure, or _No failure_. |

Euros, dollars and pounds get their unit; another currency shows the amount
alone. The balance only appears once Twilio let it be read: a restricted API key
may not see it, which does not prevent sending.

## Dashboard widget

The **Twilio** widget shows the balance, the SMS and calls of the day against
the daily limits (in orange once reached), the state of the account and the last
failure, with a link to the Twilio console to top the balance up. It sends
nothing itself.

## Scenes

### Actions

**Send an SMS**: one SMS to each recipient (up to 10). _Recipients_: numbers
separated by commas, empty for the default recipients. _Message_: up to 1600
characters, with the variables of the scene (type `{{` to insert one). Results
for the next steps: _SMS sent_, _Held back by the cost guard_, _Refused by
Twilio_.

**Make a call**: calls one number (empty: the first default recipient) and reads
the _Message read out_ (up to 1000 characters) with a text-to-speech voice. The
_Language_ (English, French, German or Spanish) and the _Voice_ (female or male)
default to those of the configuration; the message is read 1 to 3 times. With
_Wait for the answer_ ticked (the default), the scene waits until the call is
answered or not, at most the ring time plus 20 seconds. Results: _Answered_
(yes or no), _Call outcome_ and _Call SID_. The outcome is one of:

- `answered`: someone (or a voicemail) picked up;
- `no-answer`, `busy`, `failed`, `canceled`: the call did not get through;
- `refused`: Twilio refused the call (see _Last failure_);
- `blocked`: held back by the cost guard;
- `pending`: not known yet (not waited for, or still ringing at the deadline).

A failure on Twilio's side never stops the scene: test the results with a
_Condition on variables_. Only an action that cannot run at all fails (no
configuration, no recipient, empty message, a number not in international
format).

### Triggers

**SMS or call failed**: an SMS or a call did not reach its recipient. Filters:
_SMS or call_, _Outcome_ (refused by Twilio, failed, SMS not delivered, no
answer, line busy, canceled), _Recipient_. Variables: _SMS or call_ (`sms` or
`call`), _Recipient_, _Outcome_, _Reason_ (in the configured language), _Twilio
error code_. Twilio confirms delivery after the fact: an SMS is read back after
1, 5 and 20 minutes, a call after its ring time.

**Cost guard limit reached**: SMS or calls were held back by a limit. Filters:
_SMS or call_, _Limit_ (per hour or per day). Variables: the kind, the limit
(`hour` or `day`), its value and the number held back. Fired once per episode,
not at each attempt, so it can alert you through another channel without
flooding it.

### Scene ideas

- **Water leak**: on the leak sensor, **Send an SMS** "Water leak in
  the cellar!" to the family, then **Make a call** to the first default
  recipient.
- **Nobody answers**: **Make a call** to a relative with _Wait for the answer_,
  then a _Condition on variables_: _Answered_ is false, then **Make a call** to a
  neighbour.
- **Something loops**: on **Cost guard limit reached**, send a message through
  the Gladys app or another channel to check which scene sends so much.

## Costs and Twilio limits

- Twilio bills each SMS **per segment**: 160 characters, or 70 as soon as the
  text holds a character outside the GSM alphabet (`ê`, `ç`, `œ`, an emoji). A
  1600-character text can be 23 SMS. Calls are billed per started minute; a call
  is cut after 3 minutes.
- The voices are standard Amazon Polly voices provided by Twilio; see the Twilio
  pricing for text-to-speech.
- Requests to `api.twilio.com`: the account and its balance every 15 minutes
  (two reads), one request per SMS or call, then a few reads to follow its
  outcome (every 3 seconds while a call is waited for). Far below the Twilio API
  limits; a `429` answer is reported as "too many requests".
- Twilio sends at most about one call per second per account and queues the SMS
  at the pace of the sender: a list of 10 recipients takes a few seconds.
- Twilio's [Acceptable Use Policy](https://www.twilio.com/en-us/legal/aup) and
  the [country guidelines](https://www.twilio.com/en-us/guidelines/sms) apply:
  only text people who agreed; a recipient who replied STOP is blocked by
  Twilio.

## Troubleshooting

- **"credentials refused by Twilio"**: check the Account SID and the API key
  secret (or the Auth Token). An API key must belong to the same account.
- **"trial account: verify this number in Twilio first"**: add the recipient to
  the verified numbers of the Twilio console, or upgrade the account.
- **"country not allowed in the Twilio geographic permissions"**: enable the
  country in the Twilio console, for SMS and for voice.
- **"the sender is not a number of your Twilio account"**: copy the number from
  **Phone Numbers** → **Active numbers**, in international format.
- **"not delivered (Twilio 30003)"** and other `30xxx` codes: the operator could
  not deliver the SMS (phone off, filtered as spam, landline). The code is
  explained on `https://www.twilio.com/docs/api/errors/<code>`.
- **Nothing is sent and the widget shows a counter in orange**: the cost guard
  holds; raise the limit or wait for the window to free up.
- Detailed logs: set `LOG_LEVEL=debug` on the integration. Phone numbers are
  always masked in the logs, secrets never written.

## Limitations

- **No incoming SMS.** Twilio delivers incoming messages by calling a public
  URL; Gladys is not exposed to the Internet, and the Gladys Plus webhook relay
  does not pass the `X-Twilio-Signature` header, so the sender of a message
  could not be authenticated. Incoming SMS are therefore not supported.
- A voicemail that picks up counts as `answered`: set a shorter **Ring time** to
  hang up before it does.
- No MMS (pictures) and no WhatsApp: SMS and voice only.
- The feature names are set when the device is added, in the language of the
  configuration at that time.
- Developed without a Twilio account: the API answers come from the Twilio
  documentation, not from a real account.
