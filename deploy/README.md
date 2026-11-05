# Deploying the Parent's Portal to the Hostinger VPS

The owner run sheet for Friday, October 30, 2026. Provisioning, deployment
and production actions below are Friday OWNER steps, not commands to run
during the deployment-file review. Run one command at a time in the named
folder. A failed gate means STOP; do not continue or silently retry writes.
Nothing here holds a secret: `__DOMAIN__` is a placeholder. In sections 1–11
`__DOMAIN__` is `srv2110222.hstgr.cloud`, which `parents-portal.conf` serves;
the domain is the second site, section 14. The first copy of the credentials travels by `scp` from the laptop
(section 6); after that a credential changes in place with `deploy/env-set.sh`
(section 13) — never typed into a command, never pasted into a chat.

Two files live beside this one and are installed by the steps below:

| File | Goes to |
|---|---|
| `deploy/nginx/parents-portal.conf` | `/etc/nginx/sites-available/parents-portal.conf` |
| `deploy/pm2/ecosystem.config.js` | stays in the repo; PM2 is pointed at it |

Throughout, the application lives at `/home/portal/Parents_Portal` and runs as
the user `portal`. If you choose another user or path, change it in
`deploy/pm2/ecosystem.config.js` (`cwd`) and in the Nginx `root` as well.

**Revision gate:** deploy MAIN only, never the unmerged Task 2 branch
`chore/npm-audit-patches` at `e7f749a`. The last approved fallback main commit
is `7ef7a74`. Verify actual main on Friday. If approved merges advance main
(including these deployment fixes or D-163), Darryl must approve the new
exact commit before deployment. An unexpected revision means STOP for owner
review. This run sheet does not authorize a merge.

---

## 1. The VPS and the domain

1. Order the Hostinger VPS **KVM 1, Malaysia, Ubuntu 24.04**. Note the root password it
   gives you; do not paste it anywhere.
2. Buy the domain and point its apex DNS **A record** at the VPS address.
   Publish an apex `AAAA` record only if IPv6 is configured and reachable.
   Use the apex only: no www DNS prerequisite or www certificate name.
   (The first site, `srv2110222.hstgr.cloud`. The domain's site, section 14,
   has `www` too and redirects it to the apex.)
3. Wait for DNS to resolve before step 8 — Let's Encrypt cannot issue a
   certificate until it does. On the laptop:

   ```
   nslookup __DOMAIN__
   ```

---

## 2. The base host

All of these run **on the VPS, as root** (or using the verified owner's
administrator account with sudo). Keep provider recovery-console access.

### Owner SSH key-only gate — before disabling any login method

`__ADMIN__` is the owner's administrator account, separate from the app user.
Use the provider console or existing administrative SSH session to create
that account and grant administrative permissions if it does not exist.
Do not put real account details, private keys or addresses in this document.

1. On the laptop, set up an owner SSH key if needed. Install only its public
   key in the administrator's `~/.ssh/authorized_keys` using the provider's
   key facility or an editor in the existing session. Ensure the account
   owns its SSH directory/files, with directory mode 700 and file mode 600.
2. Keep the current SSH session and recovery console open. From a second,
   independent laptop terminal, force a public-key login (select the owner's
   key with `-i` privately if it is not the default):

   ```
   ssh -o PreferredAuthentications=publickey -o PasswordAuthentication=no __ADMIN__@__DOMAIN__
   ```

3. In that second session, verify administrative permission:

   ```
   sudo -v
   ```

   STOP if key authentication or administrative permission fails. Do not
   disable password authentication, close recovery access or reload SSH.
4. On the VPS, validate the existing SSH configuration:

   ```
   sudo sshd -t
   ```

5. Only after the verified second key login, use an editor to configure
   `PubkeyAuthentication yes`, `PasswordAuthentication no` and
   `KbdInteractiveAuthentication no`. Review `/etc/ssh/sshd_config` and its
   included drop-ins/Match rules; Ubuntu's earlier settings may take
   precedence. Do not blindly append settings or overwrite provider files.
6. Validate syntax again with `sudo sshd -t` as a separate command. Then
   inspect the effective settings privately:

   ```
   sudo sshd -T
   ```

   Require public-key authentication enabled and both password and
   keyboard-interactive authentication disabled. If Match rules apply,
   verify their effective settings for the owner's connection too. STOP if
   syntax, effective settings or recovery access is uncertain.
7. Reload without closing either existing session:

   ```
   sudo systemctl reload ssh
   ```

8. From a third fresh laptop terminal, repeat the public-key-only login and
   administrative check as separate commands. STOP and recover using the
   still-open session/console if either fails. Retain recovery access until
   the new login and effective key-only settings are verified.

### Base host setup

1. Update the system.

   ```
   apt-get update
   ```

   ```
   apt-get upgrade -y
   ```

2. Set the time zone. This matters: `server/utils/dateFormat.js` reads the
   process's own zone to decide what "today" is, and on a UTC host a teacher's
   same-day attendance is refused as "in the future" from midnight to 8 AM
   Manila.

   ```
   timedatectl set-timezone Asia/Manila
   ```

3. Confirm the clock is synchronised (the database comparison wants it inside
   a second).

   ```
   timedatectl
   ```

   Require `Asia/Manila` and NTP synchronized. If synchronization is off,
   enable NTP with `timedatectl set-ntp true`, then check again separately.
   STOP until the clock is synchronized.

4. Open only what is needed.

   ```
   ufw allow OpenSSH
   ```

   ```
   ufw allow 80
   ```

   ```
   ufw allow 443
   ```

   ```
   ufw --force enable
   ```

5. Create the application user. It owns the code and runs the API; it is not
   the user you administer the box with.

   ```
   adduser --disabled-password --gecos "" portal
   ```

   For the laptop-to-VPS scp steps, install the owner's public key for
   `portal` through the administrative session using an editor/provider
   facility. Apply owner-only SSH directory/file permissions as above and
   verify a separate key login as `portal`. Its GitHub deploy key below is
   a different key and does not grant inbound scp/SSH access.

---

## 3. Node and PM2

On the VPS, as root.

1. Fetch the NodeSource setup script for Node 22 LTS.

   ```
   curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
   ```

2. Run it.

   ```
   bash /tmp/nodesource_setup.sh
   ```

3. Install Node.

   ```
   apt-get install -y nodejs
   ```

4. Check the version. Use Node 22 LTS at **22.12.0 or later**: the inspected
   Vite package requires `^20.19.0 || >=22.12.0`, while `sharp` requires at
   least 20.9. STOP on an unsupported version; do not assume every 22.x works.

   ```
   node -v
   ```

5. Install PM2.

   ```
   npm install -g pm2
   ```

6. Have PM2 start at boot as the `portal` user.

   ```
   pm2 startup systemd -u portal --hp /home/portal
   ```

   Run the one command it prints back.

---

## 4. The deploy key and the code

On the VPS, **as the `portal` user** (`su - portal`).

1. Make a key for this machine only.

   ```
   ssh-keygen -t ed25519 -C "parents-portal-vps" -f ~/.ssh/id_ed25519_deploy -N ""
   ```

2. Show the **public** half. Only this half is ever displayed or pasted; the
   private half never leaves the VPS.

   ```
   cat ~/.ssh/id_ed25519_deploy.pub
   ```

3. On GitHub, in `Dar0111/Parents-Portal-System` → Settings → Deploy keys →
   Add deploy key, paste it, and leave **"Allow write access" unchecked**.

4. Clone MAIN, with that key.

   ```
   GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_deploy -o IdentitiesOnly=yes" git clone --branch main --single-branch git@github.com:Dar0111/Parents-Portal-System.git /home/portal/Parents_Portal
   ```

5. Make the key the default for this clone, so later pulls need no prefix.

   ```
   git config core.sshCommand "ssh -i ~/.ssh/id_ed25519_deploy -o IdentitiesOnly=yes"
   ```

   Working folder: `/home/portal/Parents_Portal`.

6. In that same folder, confirm the branch and commit separately.

   ```
   git branch --show-current
   ```

   ```
   git log --oneline -1
   ```

   Require `main` at the exact owner-approved commit. STOP if different;
   do not deploy the audit branch or merge to make this check pass.

---

## 5. Install and build

On the VPS, as `portal`.

1. In `/home/portal/Parents_Portal/server`, install server dependencies,
   production only. `sharp` installs a prebuilt binary
   for linux-x64; nothing is compiled.

   ```
   npm ci --omit=dev
   ```

2. **D-163 is done** (`5956436`, 2026-10-29, "set production API base to
   /api"): the tracked `client/.env.production` makes a build use same-origin
   `/api` behind Nginx (`docs/TESTING.md` → `ssr-avatar`). The setting, as
   this section proposed it before D-163, domain-independent and non-secret:

   ```
   VITE_API_BASE_URL=/api
   ```

   Source findings: `client/src/api/apiBase.js` lines 20–25 retain a nonblank
   value but derive a port-5000 target when blank; `client/src/api/axios.js`
   line 9 uses it for REST. `apiBase.js` line 36 strips `/api` for the socket,
   used by `client/src/realtime/SocketProvider.jsx` line 82.
   `client/src/format/photoUrl.js` lines 20–21 derive `/uploads/avatars/...`.
   Thus `/api` supports same-origin operation behind Nginx; blank is unsuitable.
   Vite embeds the value at build time; inherited environment values can
   override the file, so build with no `VITE_API_BASE_URL` in the shell.
   Module 13's sitting checked the built app on both names (`docs/TESTING.md`).

3. In `/home/portal/Parents_Portal/client`, install client dependencies
   (the build needs the dev ones).

   ```
   npm ci
   ```

4. Build in that same folder.

   ```
   npm run build
   ```

5. Confirm the output exists.

   ```
   ls /home/portal/Parents_Portal/client/dist
   ```

---

## 6. The secrets

Two files move from the laptop. **Neither is printed or pasted into chat.**
Only the owner privately edits the required runtime values below; the agent
must not inspect environment-file or secrets-folder contents.

**Step 1 runs once, on a new VPS. After that, never copy the laptop's `.env`
over the VPS file:** the VPS file holds its own `PG_CA_FILE`, `CORS_ORIGIN`,
`NODE_ENV` and `PORT`. Section 13 changes a key in place.

1. On the **laptop**, in PowerShell, copy the environment file.

   ```
   scp "C:\Users\Win10 User\Parents_Portal\server\.env" portal@__DOMAIN__:/home/portal/Parents_Portal/server/.env
   ```

2. On the VPS, make a folder for the certificate.

   ```
   mkdir -p /home/portal/secrets
   ```

3. On the **laptop**, copy the Supabase CA certificate.

   ```
   scp "C:\Users\Win10 User\Parents_Portal-migration-data\secrets\prod-ca-2021.crt" portal@__DOMAIN__:/home/portal/secrets/prod-ca-2021.crt
   ```

4. On the VPS, lock both down.

   ```
   chmod 600 /home/portal/Parents_Portal/server/.env /home/portal/secrets/prod-ca-2021.crt
   ```

5. Edit four values in place. Open the file:

   ```
   nano /home/portal/Parents_Portal/server/.env
   ```

   Change these **four keys only**, leaving every other line exactly as it
   arrived — in particular `JWT_SECRET`, which on hosting day had to stay
   byte-identical or every existing session and every `login_attempts` key
   would be orphaned at once. Since M18 the VPS has its own `JWT_SECRET` and the
   laptop's differs, so never copy either file over the other:

   | Key | Value on the VPS |
   |---|---|
   | `PG_CA_FILE` | `/home/portal/secrets/prod-ca-2021.crt` |
   | `CORS_ORIGIN` | `https://__DOMAIN__` — a bare origin, no path, no trailing slash, never a `*`. Since Module 13 it lists both names, comma-separated, never `www` (section 14) |
   | `NODE_ENV` | `production` |
   | `PORT` | `5000` |

   If `pm2 status` shows the API errored, `pm2 logs parents-portal-api --lines 20` names the key.

---

## 7. Nginx

On the VPS, as root.

1. Install it.

   ```
   apt-get install -y nginx
   ```

2. Copy the site file out of the repo.

   ```
   cp /home/portal/Parents_Portal/deploy/nginx/parents-portal.conf /etc/nginx/sites-available/parents-portal.conf
   ```

3. Put the real domain in, in place of the placeholder.

   Use an editor on the installed copy; replace `__DOMAIN__` with the apex
   domain. Keep one trusted reverse proxy: Nginx overwrites X-Forwarded-For
   with `$remote_addr`; Express retains `app.set('trust proxy', 'loopback')`.
   Do not add another proxy hop under this configuration.

4. Enable it.

   ```
   ln -sf /etc/nginx/sites-available/parents-portal.conf /etc/nginx/sites-enabled/parents-portal.conf
   ```

5. Remove Ubuntu's default site, or it answers first on port 80.

   ```
   rm -f /etc/nginx/sites-enabled/default
   ```

6. Check the configuration parses.

   ```
   nginx -t
   ```

7. Reload.

   ```
   systemctl reload nginx
   ```

---

## 8. HTTPS

On the VPS, as root, **after DNS resolves**.

1. Install certbot.

   ```
   apt-get install -y certbot python3-certbot-nginx
   ```

2. Issue and install the certificate. Accept the HTTP-to-HTTPS redirect when
   it asks.

   ```
   certbot --nginx -d __DOMAIN__
   ```

3. Confirm renewal is scheduled.

   ```
   systemctl status certbot.timer
   ```

4. Verify renewal independently:

   ```
   certbot renew --dry-run
   ```

5. Verify redirect from the laptop or VPS:

   ```
   curl -I http://__DOMAIN__
   ```

   Require a redirect to apex HTTPS. Verify the browser accepts the apex
   certificate without bypassing validation. STOP on certificate, redirect
   or renewal failure; no www name is required.

> Certbot edits the **installed** file at
> `/etc/nginx/sites-available/parents-portal.conf`, adding a 443 server block
> and the redirect. The copy in the repo stays the pre-TLS source on purpose.
> If you ever re-copy it (step 7.2), run step 8.2 again afterwards.

> **The domain has its own lineage (2026-11-03).** `zz-domain.conf` and its
> certificate for the apex and `www` are section 14; this section's certificate
> is unchanged.

---

## 9. Start the API

On the VPS, as `portal`.

1. In `/home/portal/Parents_Portal`, start it.

   ```
   pm2 start deploy/pm2/ecosystem.config.js
   ```

   Require one fork-mode API
   process, not cluster mode; retain the existing PM2 configuration unchanged.

2. Save the process list so it comes back after a reboot.

   ```
   pm2 save
   ```

3. Privately review startup diagnostics. The listen line must be there, and there must be no
   `PG_SSL=verify-full needs PG_CA_FILE` and no `CORS_ORIGIN: ignored …`.

   ```
   pm2 logs parents-portal-api --lines 50 --nostream
   ```

   Never paste raw logs into chat; redact connection details and secrets
   before sharing any evidence. Verify `pm2 status` separately reports one
   online API process. Confirm the section 3 startup service is enabled for
   `portal` and uses the saved list; reboot persistence remains a Friday
   runtime gate, not a result established by this document review.

---

## 10. Readiness gates and Friday owner sequence

### VPS-to-Supabase gate — BEFORE hosted health verification

The laptop previously established TCP but timed out awaiting the PostgreSQL
SSLRequest response. VPS behavior remains **UNVERIFIED**. Moving to the VPS
does not automatically solve the connection issue; TCP reachability alone
does not prove PostgreSQL, TLS or authentication works.

On the VPS, as `portal`, working folder
`/home/portal/Parents_Portal/server`:

1. Verify the expected database destination privately against an independent
   owner-approved reference (a hostname fingerprint may be used). Require the
   approved pooler destination and port 5432, `PG_SSL=verify-full`, certificate
   validation enabled, the CA successfully loaded internally and TLS server
   identity verification. Do not display settings, CA paths or certificates.
2. Prepare and obtain separate Run-once approval for the exact read-only
   connection probe using the application's effective VPS runtime settings.
   The earlier laptop approval was one execution only. No reusable probe
   approval is granted here; do not invent or run an unreviewed command.
3. Execute that approved probe: connect and run `SELECT 1` only, with sanitized
   success/error class/code and connection/query timings, and cleanup in
   `finally`. Require successful connection and query with verified TLS.
   STOP on any mismatch, TLS failure, timeout or query failure. Do not weaken
   SSL verification or change production database settings to force a pass.
4. Only after the connection/query gate passes, check the application path:

   ```
   curl -fsS https://__DOMAIN__/api/health
   ```

   Require successful HTTP response with `"db":"ok"`. A listening API or a
   successful static page is insufficient. STOP if database health fails.

### P4 Part A scope and intentional write budget

P4 Part A is **READ-ONLY BY DEFAULT**: verify deployed commit, database
identity privately, TLS, runtime permissions, health, 401/403 denial,
read-only regression checks, browser/mobile acceptance and low-impact
monitoring. Record actual results and sanitized evidence. Do not declare
all of P4 complete: Part B follows on isolated local PostgreSQL, then one
consolidated report covers both parts.

Darryl authorizes ONLY these intentional production writes:

| Action | Exact limit and expected result |
|---|---|
| Demo profile photo | ONE upload on an approved demo account, followed by deletion of that uploaded photo. Verify upload, display and deletion; do not replace a genuine user's photo. |
| Ana Reyes email recovery | ONE Forgot-password EMAIL code-delivery check. Verify receipt; STOP before resetting any password. |
| Lito Bautista SMS recovery | ONE Forgot-password SMS code-delivery check. Verify receipt; STOP before resetting any password. |
| Socket.io | ONE test message using approved demo accounts; recipient receives it live without refresh. No additional reply or message-cleanup write is authorized. |
| Pre-D-122 backup | ONE app backup immediately before the separately approved reset; verify the VPS archive before proceeding. |
| Post-D-122 backup | ONE app backup immediately after successful reset; verify the final VPS restore point. |

The backups belong to the separately approved reset sequence, not an
unrestricted P4 test. No other intentional production writes, bulk updates,
data cleanup, unrestricted live test suites, load testing, failure injection
or production restore rehearsal. No unapproved retry of a failed write;
STOP for Darryl's decision. Sign-in or page access may create normal
session/audit side effects or update read state; this limitation does not
authorize additional tests. Do not inspect `activity_logs.description` or
publish personal records, codes or authentication details as evidence.

### Friday sequence — one owner action per row

Perform the provisioning sections above in dependency order; this table is
the acceptance sequence. Every failed expected result means STOP.

| # | Where / owner action | Expected result / STOP condition |
|---|---|---|
| 1 | Hosting dashboards: purchase KVM 1 Malaysia, Ubuntu 24.04 and the apex domain | Correct locked hosting plan and owned domain. |
| 2 | VPS/DNS: configure DNS, key-only access, timezone/NTP, UFW and apex HTTPS using sections 1–3 and 7–8 | Verified key access, synchronized clock, required ports and valid apex TLS/redirect. Install the Nginx source only after the approved main checkout exists. |
| 3 | VPS `/home/portal/Parents_Portal`: deploy the owner-approved MAIN revision using sections 4–9 | Exact approved main commit, separate D-163 prerequisite completed, successful build and one PM2 API process. |
| 4 | VPS `/home/portal/Parents_Portal/server`: execute separately approved verified-TLS connection probe and `SELECT 1` | Connection and query both pass; VPS database connectivity is established by evidence. |
| 5 | VPS: run the hosted health command above | Successful response with `"db":"ok"`. |
| 6 | Hosted app: complete scoped P4 Part A | Actual results recorded; only the intentional writes listed above. |
| 7 | Browser and phone: finish authorized acceptance checks below | Working REST, Socket.io, profile photos and same-origin HTTPS web; phone uses hosted HTTPS API. Do not repeat write checks already used in row 6. |
| 8 | Hosted app, Darryl: change admin password through the app | Owner verifies new sign-in privately; separate owner action, not an extra P4 write permission. |
| 9 | Darryl: separately review and approve exact D-122 scope/procedure | Explicit Friday approval before any reset; otherwise STOP. |
| 10 | Hosted app: create ONE backup immediately before D-122 | Successful backup creation. |
| 11 | VPS/app: verify that pre-reset backup archive | Archive is available on the VPS, not merely a shared database row; failure blocks reset. |
| 12 | Execute ONLY the separately approved D-122 procedure | No reset execution is authorized by this document change. |
| 13 | Verify reset result against that approved procedure | Expected scoped result; unexpected outcome means STOP. |
| 14 | Hosted app: create ONE backup immediately after successful D-122 | Successful final backup creation. |
| 15 | VPS/app: verify the final restore point | Final archive available and identified privately; no production restore rehearsal. |
| 16 | Laptop API terminal: stop the laptop API | Only VPS API serves; do not stop it before hosted verification. |
| 17 | Laptop: keep Expo Metro running | Metro remains available; laptop API and web development server are not serving the hosted check. |
| 18 | Hosted browser and Expo Go: conduct professor's system check | Hosted web/API use the VPS and phone reaches hosted HTTPS; deployment success alone is not readiness. |

**D-122 moved out of this sequence (D-175, the owner's decision of 2026-10-30).**
Rows 9–15 are replaced by the approved production procedure, the run sheet in
[`docs/ACTIVITY_RESET.md`](../docs/ACTIVITY_RESET.md) (Module 15). Run only that
sheet: a dry run first, and `--apply` only on Darryl's go for that run. The survey
at the end of that file is history, not current deletion criteria.

### Browser and phone checks within that same write budget

| Where / action | Expected result |
|---|---|
| Browser: open apex HTTPS and reload an authorized deep link such as `/admin/activity-log` | App page, not an API JSON 404; valid TLS. |
| Browser network inspection during approved actions | REST under same-origin `/api`, socket under `/socket.io/`, photos under `/uploads/`; no port-5000 public target. |
| Demo profile: perform the single authorized upload/deletion | Photo saves, displays and is deleted; existing 8 MB Nginx request limit accommodates the application's 5 MB photo cap. |
| Recovery: perform the one email and one SMS delivery check listed above | Real delivery, not merely an identical accepted HTTP response; no password reset. |
| Approved demo accounts: perform the single Socket.io message check | Recipient sees the message live; no second API splits live connections. |
| Laptop `mobile/`: owner configures `EXPO_PUBLIC_API_URL=https://__DOMAIN__/api` privately, then runs `npx expo start --clear` and cold-starts Expo Go | Phone sign-in/acceptance for the three roles against hosted HTTPS, using the same authorized write budget across browser and phone. Since 2026-11-05 15:37 the phone uses the domain (D-246). |

Backups are per-host files with shared database rows. Friday's two backups
must be created by the VPS app and verified on the VPS. During the professor's
check, the laptop runs Expo Metro only; Socket.io rooms belong to one API
process. Do not serve clients through both laptop and VPS APIs.

---

## 11. Updating later

On the VPS, as `portal`.

Only update to an exact main revision independently approved by Darryl.
Fetch and verify before moving the local checkout. D-163 is done (section 5,
item 2); do not assume a VPS-local untracked file is sufficient. Re-run the TLS/query, health and
authorized acceptance gates after an approved update; no extra writes are
automatically authorized.

All Git commands below run separately in `/home/portal/Parents_Portal`.
`__APPROVED_MAIN_COMMIT__` means the full commit hash independently approved
by Darryl, not a value automatically copied from the fetched branch.

1. Confirm the checkout is MAIN:

   ```
   git branch --show-current
   ```

   Require `main`; otherwise STOP.
2. Check the working tree:

   ```
   git status --short
   ```

   STOP on unexpected changes or conflicts. Preserve untracked files; do not
   reset, clean, stash or overwrite them to make the update proceed.
3. Fetch remote main without changing the local branch or working-tree checkout:

   ```
   git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
   ```

   STOP if fetch fails. This updates the remote-tracking reference only.
4. Inspect the fetched main's full commit hash:

   ```
   git rev-parse --verify refs/remotes/origin/main^{commit}
   ```

   STOP unless it exactly matches Darryl's independently approved full hash.
   Do not treat fetching a new revision as approval. Any mismatch requires
   owner review before moving the local checkout.
5. Only after the exact-match gate and owner approval, fast-forward to that
   specific approved hash, not a moving remote reference:

   ```
   git merge --ff-only __APPROVED_MAIN_COMMIT__
   ```

   This permits a fast-forward only; it must not create a merge commit.
   STOP if it fails or reports unexpected changes/conflicts. Do not retry
   with a normal merge, reset, rebase or automatic conflict resolution.
6. Verify the resulting local HEAD before installing or building:

   ```
   git rev-parse --verify HEAD
   ```

   Require the same independently approved full hash; otherwise STOP.
7. Check the resulting working tree with `git status --short` as a separate
   command. STOP on any unexpected change, conflict or failed check.

   Step 8 only when `server/package-lock.json` changed; steps 9–10 only when a
   file under `client/` changed; step 11 whenever a file the API reads changed
   (the policy files are read once at start).
8. In `/home/portal/Parents_Portal/server`:

   ```
   npm ci --omit=dev
   ```

9. In `/home/portal/Parents_Portal/client`:

   ```
   npm ci
   ```

10. In that same client folder:

    ```
    npm run build
    ```

11. As `portal`, reload only after the preceding gates pass:

    ```
    pm2 reload parents-portal-api
    ```

12. Check it: `pm2 status`, then `sleep 2`, then:

    ```
    curl -fsS https://__DOMAIN__/api/health
    ```

    Require `"db":"ok"`. Then one admin sign-in in the browser.

---

## 12. UNVERIFIED fallback — laptop PLDT Wi-Fi plus Cloudflare quick tunnel

This fallback is **UNVERIFIED**, not guaranteed to work. The laptop's earlier
SSLRequest timeout means its API/database connection cannot be assumed
functional. A tunnel does not repair PostgreSQL connectivity.

It is usable only after Darryl approves switching and all of these pass:

1. Laptop on PLDT Wi-Fi has a working API/database connection.
2. Cloudflare quick tunnel connects and exposes the intended app/API safely.
3. Phone reaches that tunneled HTTPS API with the intended configuration.
4. Required browser/phone acceptance, TLS, health and realtime checks pass
   within the separately approved scope; no additional writes are authorized.

Do not start the fallback during this review, assume success, or silently
switch traffic. If it is approved later, arrange one serving API and verify
the target privately. Normal Friday readiness still requires the VPS-hosted
web/API, phone on hosted HTTPS, and laptop running Expo Metro only. A fallback
that changes those requirements needs Darryl's separate decision.

---

## 13. Rotating a credential

On the VPS, as `portal`. `deploy/env-set.sh` sets one key: it asks for the value
twice, hidden, so the value is in no command line and no shell history, and it
prints no value. `--diff` prints key names only.

```
bash /home/portal/Parents_Portal/deploy/env-set.sh FILE KEY
```

```
bash /home/portal/Parents_Portal/deploy/env-set.sh --diff OLD NEW
```

It refuses a space, `#`, a quote, a backtick or a backslash, because dotenv would
misread them, so use letters and digits. On the laptop, run it in Git Bash.

The running API reads `server/.env` only when it starts, so the order is:

1. Copy `server/.env` to a dated backup in `/home/portal/secrets/`, mode 600.
2. Copy it again to a scratch file in that folder, mode 600, and set every key
   there. Nothing live changes yet.
3. Run `--diff` on `server/.env` and the scratch file. The names must be exactly
   the keys you meant to change. `JWT_SECRET` appears only when you are
   rotating it (its row below, M18).
4. Change the other side of each credential, from the table below.
5. `mv` the scratch file over `server/.env`, then one
   `pm2 reload parents-portal-api`, then `sleep 2`, then the health check.

**Never restore an older `.env` backup after a role password has changed:** it
holds dead passwords. Delete the backup once the checks pass, with `shred -u`.

**Then set the same new values in the laptop's `server\.env`** with `env-set.sh`
in Git Bash, one key at a time (on 2026-11-03 it took four keys). A `sed -i` on
that file in Git Bash rewrites its CRLF line endings to LF, which is harmless for
dotenv: after M18's `SMS_CHECK_PASSWORD` delete on 2026-11-05 it still loaded every
key checked.

| Credential | Keys | The other side | What proves it |
|---|---|---|---|
| `portal_app`, `portal_migrate` | `PG_PASSWORD`, `PG_MIGRATE_PASSWORD` | `PORTAL_APP_PASSWORD` and `PORTAL_MIGRATE_PASSWORD` in `supabase.env`, then `npm run roles:passwords -- --target staging` in `migration/`. The API fails from the role change until the reload | `/api/health` with `"db":"ok"`; `npm run demo:clear-messages`, without `--apply`, for `portal_migrate`, which is what a restore needs |
| Gmail | `SMTP_PASS` | A new app password. The old one works until it is revoked, so revoke it after the proof | One real email code |
| SMSGate | `SMS_GATEWAY_USER`, `SMS_GATEWAY_PASS` | None: the app has no Cloud Server password control (found 2026-11-03), and M18 found no safe way in the repo either, so the pair stays (`docs/KNOWN_ISSUES.md`) | One real text. `npm run sms:probe` does not prove these: `/health` may not need them |
| Passphrase | `SMS_ENCRYPTION_PASSPHRASE` | Settings → Encryption → Passphrase in the app | One real text. With a mismatch the server logs success and the app marks the message Failed |
| Browser origin | `CORS_ORIGIN` | Nothing | `curl -sI -H "Origin: https://__DOMAIN__" https://__DOMAIN__/api/health` shows `access-control-allow-origin`. A same-origin sign-in proves nothing: `cors` leaves the header out and does not refuse the request |
| Token signing (M18) | `JWT_SECRET` | Nothing: the API is the only side. Every web and phone session ends at the reload, and the sign-in limit's per-account counts start afresh. Generated on the VPS (below), never typed. The laptop gets its own fresh value, never this one: the one exception to "the same new values" above | A browser tab signed in before the reload lands on Login with "Your session has ended"; a fresh sign-in works |

**`JWT_SECRET` is generated in place, never typed (M18).** With the scratch file
`S` from step 2, in `/home/portal/Parents_Portal`:

```
node -e "const v=require('crypto').randomBytes(32).toString('hex');process.stdout.write(v+'\n'+v+'\n')" | bash deploy/env-set.sh S JWT_SECRET
```

The value goes from `node` through the pipe to `env-set.sh`'s two hidden reads: it
is on no command line, in no shell history and never printed; the script prints
two blank lines and `JWT_SECRET: set`. Since M18 a production API refuses a value
under 32 characters, so check the line before the `mv` (it prints only counts and
yes/no):

```
awk -F= '/^JWT_SECRET=/{n++; v=substr($0,index($0,"=")+1); sub(/\r$/,"",v)} END{print "lines " n ", length " length(v) ", hex " ((v ~ /^[0-9a-f]+$/)?"yes":"no")}' S
```

It must print `lines 1, length 64, hex yes`. The order is steps 1–5 above. Before
the `mv`, also check, in `server/`, that the `utils/jwt.js` the reload will load
accepts the scratch file; it prints `accepted` or `refused` and nothing else:

```
node -e "require('dotenv').config({path:process.argv[1],quiet:true}); try { require('./utils/jwt'); console.log('accepted') } catch { console.log('refused') }" S
```

**The `roles:passwords` verify can fail right after `ALTER ROLE`.** On 2026-11-03
its check through the pooler failed twice with `password authentication failed`
although both passwords were set. Prove the change with the table's own checks:
`/api/health` for `portal_app`, and the `demo:clear-messages` dry run for
`portal_migrate`.

**Type the SMS passphrase on the phone carefully.** `BAD_DECRYPT` on a Failed
message means the phone's passphrase differs from the server's. Retype it, then
send one more real text.

**If the laptop cannot reach Supabase,** run `roles:passwords` on the VPS. In
`migration/`, export `MIGRATION_DATA_DIR=/home/portal` and
`MIGRATION_TOOLING_DIR=/home/portal/Parents_Portal/server`, put the three keys in
`/home/portal/secrets/supabase.env` with `env-set.sh`, mode 600, and run
`--dry-run` first. Shred that file straight after: it holds the owner's URL.

`node scripts/account-state.js`, in `server/`, prints each account outside the demo
load as ids and yes or no: what is on file, what is confirmed, the current policy,
a pending temporary password. It prints no login id, name, email or number.

---

## 14. The domain, beside the first name (2026-11-03)

Since 2026-11-03 01:42 the VPS serves two names: `https://srv2110222.hstgr.cloud`,
unchanged, and `https://chfes-main-parents-portal.online`.

| Piece | On the VPS |
|---|---|
| Nginx | A second site, `/etc/nginx/sites-available/zz-domain.conf`, enabled beside `parents-portal.conf`, which serves `srv2110222.hstgr.cloud` (sections 7–8). `zz-domain.conf` stays on the VPS only, by the owner's decision of 2026-11-04: no copy in `deploy/nginx/` |
| HTTPS | Its own Let's Encrypt lineage, for the apex and `www`. `certbot certificates`, as root, lists both lineages |
| Redirects | `http` → `https`, and `www` → the apex |
| `CORS_ORIGIN` | Both names, comma-separated, since Module 13 (section 13). `www` is never an origin: it only redirects |
| The phone | On the domain since 2026-11-05 15:37 (D-246): `EXPO_PUBLIC_API_URL` in the laptop's `mobile/.env`, Metro from the laptop's checkout. `srv2110222` still serves the same API |

Module 13's sitting proved the domain: `access-control-allow-origin` for it, then
admin sign-in, the Activity log, Messages and socket.io on it, and a sign-in on
`srv2110222` (`docs/TESTING.md`).
