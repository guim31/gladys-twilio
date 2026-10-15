# Twilio API fixtures

Answers of the Twilio REST API (version 2010-04-01), in the shape of the
documented resources (Account, Balance, Message, Call, IncomingPhoneNumber) and
of the documented error body (`code`, `message`, `more_info`, `status`). Field
lists follow Twilio's OpenAPI description
([twilio/twilio-oai](https://github.com/twilio/twilio-oai), MIT), the error
texts follow the Twilio error pages.

Anonymized: the SIDs are made up, `+15005550006` is a Twilio test number, the
`+3363998…` numbers are in the French range reserved for fiction. Not checked
against a real account (no network to Twilio from the development sandbox):
`scripts/probe.mjs` checks the authentication path for real.
