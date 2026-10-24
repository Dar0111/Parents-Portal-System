# SMS end-to-end encryption — device check (`feat/sms-e2e-code-purge`)

The owner's check of D-119 with the real gateway. **The unit test cannot prove
the phone decrypts what the server encrypts** — `test:sms-transport` holds each
step to its standard (RFC 6070, NIST SP 800-38A) and to SMSGate's published
format, and this check is the end-to-end proof (the owner's Q3d). What it looks
at: a real text sent through SMSGate's **cloud** server with the text and the
number encrypted, arriving on a phone in the room **in plain words**. Rules:
`docs/API_REFERENCE.md` → SMS (the end-to-end bullet), `server/utils/smsEncryption.js`,
`server/utils/smsTransport.js`.

Nothing in this file is a credential. **The passphrase is never typed into
this file, a chat, a commit or a screenshot**; nor a phone number or a code.

## §0 — before the check (C1, C2)

**The order is fixed (C2): the passphrase goes into BOTH places first, then
the running API gets the new code.** Until §0 the main tree stays on `main`
and 5000 runs the old transport, which sends plain text.

1. **Make the passphrase** (the owner's Q3b): long and random, **24 characters
   or more** — a password manager's generator is fine. Keep it somewhere safe;
   it is not recoverable from either place.
2. **The phone (C1).** On the Tecno, in the SMSGate app: the **Settings** tab
   (the gear) → the **Encryption** section → **Passphrase** → paste it → OK.
   This is the app's own setting (`encryption.passphrase`, an
   `EditTextPreference` under the Encryption category in the app's
   `root_preferences.xml`); SMSGate's docs say the passphrase is device-local
   and cannot be set from the cloud dashboard. **If the installed version has
   no Encryption section, stop and say so** — the fallback is the app's LOCAL
   server API on the hotspot, `PATCH /settings` with
   `{"encryption":{"passphrase":"…"}}` and the Local Server's Basic-auth
   credentials, done once (the docs name the endpoint and the key; it has not
   been tried on this phone).
3. **The server.** In `C:\Users\Win10 User\Parents_Portal\server\.env` add
   `SMS_ENCRYPTION_PASSPHRASE=` followed by the SAME passphrase — no quotes, no
   spaces around `=`. `SMS_TRANSPORT=gateway` and the three gateway keys stay
   as they are.
4. **The switch** (on the owner's go): the worktree
   `Parents_Portal-sms-e2e` is detached; the main tree checks out
   `feat/sms-e2e-code-purge`; **the owner restarts the 5000 API** (`npm start`
   in `server/` — it reads `.env` once at startup). The web on 3000 needs
   nothing: no client file changed.
5. **The probe** (no text is sent): in `server/`, `npm run sms:probe` → the
   gateway is reachable **and the line reads `encryption: on`**. `off` means
   the server did not get the passphrase — check step 3 and restart again.
   The API's startup output names `SMS_ENCRYPTION_PASSPHRASE` if it is missing
   and warns if it is shorter than 24 characters.
6. **The marks** (read-only, written down before §1): `auth_codes` is **0**
   between runs since this branch's gate; its highest id, `activity_logs`'
   highest id and the time.

## §1 — one real text, encrypted on the way (web)

**Lito Bautista** has a confirmed mobile number and no confirmed email (the
read-only survey of 2026-10-24), so his reset code goes **by text only**. The
number he confirmed is a phone in the room — the text arrives there.

1. `http://localhost:3000` → the sign-in page → **Forgot your password?**
2. The heading reads **Reset your password**, and under it: "Enter your Login
   ID. If the account has a confirmed email address or mobile number, we will
   send a six-digit code to it."
3. **Login ID**: Lito Bautista's → **Send code**.
4. The page moves to its second step and shows, in a green box: "If this
   account has a confirmed email or mobile number, we sent a code to it."
5. **On the phone in the room**, within a minute or two, a text reading
   exactly: "Parent's Portal: your password reset code is ______. It expires in
   10 minutes. Nobody from the school will ever ask for this code." — **plain
   words**, the code six digits. **That is the proof:** the server sent the
   text and the number only as `$aes-256-cbc/pbkdf2-sha1$…` values, and the
   Tecno decrypted both with the passphrase before sending from its SIM. 📸
   (crop out the code and the number).
6. **Do not set a new password.** Leave the page, or **Use a different Login
   ID**. The code dies in 10 minutes and its row goes with the next code after
   24 hours (P-19), or with §3's cleanup.

**If no text arrives:** open the SMSGate app's message list. A message marked
**Failed** after arriving at the phone usually means the two passphrases
differ — re-paste both, restart the API, run §0 step 5 and §1 again. Nothing
on the phone at all: Admin → Activity log shows a **password_reset_sms_failed**
entry, and the API's console prints its fixed reason (`bad_config` = no
passphrase on the server; `unreachable` / `timeout` / `http_<status>` = the
gateway); forgot-password's sentence never changes (CLAUDE.md §11).

## §2 — optional: fail closed

Only if the owner wants to see it live (`test:sms-transport` proves it):
remove the value after `SMS_ENCRYPTION_PASSPHRASE=` in `server/.env`, restart
the API (its startup line names the missing key), `npm run sms:probe` reads
`encryption: off`, and §1 steps 1–4 again: the same green sentence, **no
text**, one **password_reset_sms_failed** entry in Admin → Activity log and
`bad_config` on the API's console.
Then put the passphrase back, restart, and §0 step 5 reads `on` again.

## §3 — after the check

A read-only survey against §0's marks: the `auth_codes` rows above the mark
(one per Send code) are deleted by id after a backup, or left for P-19's purge
after 24 hours — the owner's choice; `activity_logs` rows are kept, as always.
**Q3e:** once §1 has passed, the KNOWN_ISSUES cloud-relay row closes.

## §4 — result

Not yet run.
