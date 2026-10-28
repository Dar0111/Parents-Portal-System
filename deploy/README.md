# Deploying the Parent's Portal to the Hostinger VPS

The owner run sheet for Friday, October 30, 2026. Provisioning, deployment
and production actions below are Friday OWNER steps, not commands to run
during the deployment-file review. Run one command at a time in the named
folder. A failed gate means STOP; do not continue or silently retry writes.
Nothing here holds a secret: `__DOMAIN__` is a placeholder for the apex
domain, and every credential travels by `scp` from the laptop and is edited on
the VPS with `nano` — never typed into a command, never pasted into a chat.

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

2. **D-163 is a separate implementation task and build prerequisite.**
   This deployment-file change does not create, edit or stage
   `client/.env.production`. Recommend a separately approved committed file
   with this domain-independent, non-secret setting:

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
   override the file. STOP before building if D-163 is unresolved. After the
   separate task, verify REST, Socket.io, profile photos and same-origin HTTPS
   in the built browser app. Do not claim readiness from source inspection alone.

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
   arrived — in particular `JWT_SECRET`, which must stay byte-identical or
   every existing session and every `login_attempts` key is orphaned at once:

   | Key | Value on the VPS |
   |---|---|
   | `PG_CA_FILE` | `/home/portal/secrets/prod-ca-2021.crt` |
   | `CORS_ORIGIN` | `https://__DOMAIN__` — a bare origin, no path, no trailing slash, never a `*` |
   | `NODE_ENV` | `production` |
   | `PORT` | `5000` |

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

**D-122 is NOT authorized for execution now.**
[`docs/ACTIVITY_RESET.md`](../docs/ACTIVITY_RESET.md) is historical context,
including old protected-row rules, not an approved executable procedure.
Its historical counts are not current deletion criteria. Darryl decides the
exact scope and procedure on Friday. No reset SQL or command is supplied here.

### Browser and phone checks within that same write budget

| Where / action | Expected result |
|---|---|
| Browser: open apex HTTPS and reload an authorized deep link such as `/admin/activity-log` | App page, not an API JSON 404; valid TLS. |
| Browser network inspection during approved actions | REST under same-origin `/api`, socket under `/socket.io/`, photos under `/uploads/`; no port-5000 public target. |
| Demo profile: perform the single authorized upload/deletion | Photo saves, displays and is deleted; existing 8 MB Nginx request limit accommodates the application's 5 MB photo cap. |
| Recovery: perform the one email and one SMS delivery check listed above | Real delivery, not merely an identical accepted HTTP response; no password reset. |
| Approved demo accounts: perform the single Socket.io message check | Recipient sees the message live; no second API splits live connections. |
| Laptop `mobile/`: owner configures `EXPO_PUBLIC_API_URL=https://__DOMAIN__/api` privately, then runs `npx expo start --clear` and cold-starts Expo Go | Phone sign-in/acceptance for the three roles against hosted HTTPS, using the same authorized write budget across browser and phone. |

Backups are per-host files with shared database rows. Friday's two backups
must be created by the VPS app and verified on the VPS. During the professor's
check, the laptop runs Expo Metro only; Socket.io rooms belong to one API
process. Do not serve clients through both laptop and VPS APIs.

---

## 11. Updating later

On the VPS, as `portal`.

Only update to an exact main revision independently approved by Darryl.
Fetch and verify before moving the local checkout. The separate D-163
task must define production-file tracking and precedence; do not assume a
VPS-local untracked file is sufficient. Re-run the TLS/query, health and
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
