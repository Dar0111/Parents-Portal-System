# Account creation — device check (`feat/account-create`, 2026-10-21) — MOVED

**This check is combined with `feat/password-alert`'s, on the owner's word
(D-79, 2026-10-21): the one run sheet for both branches is
`docs/ACCOUNT_CREATE_PASSWORD_ALERT_DEVICE_CHECK.md`.** Its §1–§7 are this
sheet's rows 1–10 as they stood, with rows 4 and 8 extended by the alert that
now follows the new password; §8–§10 are the password alert's own rows; §11
the one cleanup, which also puts back any seeded password the check changed
(D-86); §12 the result.

What this branch decided, for the record: the owner's decision of 2026-10-16 —
**Create Teacher and Create Parent drop the Email and Contact fields** — on the
web's three forms, the phone's two screens, and the two POST handlers, which
refuse a value with `400` "no longer collected" naming the field. Rules:
FRONTEND §29g, MOBILE M15 and M17, API_REFERENCE §8.
