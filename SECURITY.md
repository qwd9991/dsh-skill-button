# Security Policy

## Supported versions

Security fixes are provided for the latest release only.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Email the maintainers directly with a description of the issue, affected versions,
and (if possible) a proof of concept. Use a private disclosure channel if you
prefer — we will acknowledge within 5 business days and coordinate a fix before
public disclosure.

## Scope

This plugin runs inside a DSH host and exposes a translation API endpoint
(`POST /skill-picker/api/translate`) that calls the user's configured model.
It does not authenticate callers in the current version — do not expose the
host's API surface to untrusted networks without authentication in front of it.
