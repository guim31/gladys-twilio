# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the Twilio Auth Token or API key secret are `secret` fields of
  the Gladys configuration. The integration reads them from Gladys at startup,
  keeps them in memory, sends them only to `https://api.twilio.com` (HTTP Basic
  authentication), and never writes them to `/data` nor to the logs. An API key
  is recommended: it can be revoked without touching the account.
- **Stored in `/data`**: `twilio-state.json`, the timestamps of the SMS and
  calls of the last 26 hours (the cost guard counters), the last failure (date,
  kind, masked phone number, reason) and the currency of the balance. No full
  phone number, no message text, no secret.
- **Logs**: phone numbers are masked (`+336******01`), the Account SID shortened
  (`AC…1234`); the message texts are not logged.
- **Network**: outgoing HTTPS requests to `api.twilio.com` only. The
  integration opens no port and receives nothing from the Internet (no
  webhook).
- **Costs**: every SMS and call is billed by Twilio. The cost guard (limits per
  hour and per day) bounds what a misconfigured or looping scene can spend; it
  is checked before every request and survives a restart.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Twilio itself (see its
[security page](https://www.twilio.com/en-us/security)), and the content of
the messages your scenes send.
