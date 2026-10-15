# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- Scene action "Send an SMS": one SMS per recipient (up to 10) through your
  Twilio account, with the scene variables in the text; outputs the number
  sent, held back by the cost guard and refused by Twilio.
- Scene action "Make a call": a call that reads the message out in English,
  French, German or Spanish, female or male voice, 1 to 3 times; it can wait
  for the outcome and outputs whether the call was answered.
- Scene triggers "SMS or call failed" (refused, not delivered, not answered,
  busy, with the reason and the Twilio error code) and "Cost guard limit
  reached".
- Cost guard: most SMS and calls per hour and per day, kept under `/data`.
- "Twilio account" device: balance, SMS sent today, calls placed today, last
  failure.
- Dashboard widget: balance, usage of the day against the limits, account
  state, last failure.
- "Test the connection" and "Send a test SMS" buttons in the configuration.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-twilio/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-twilio/releases/tag/v1.0.1
