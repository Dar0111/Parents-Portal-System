# Deploying the Parent's Portal to the Hostinger VPS

The run sheet for Friday. Every step is one command, in the folder named with
it. Nothing here holds a secret: `__DOMAIN__` is a placeholder for the real
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

---

## 1. The VPS and the domain

1. Order the Hostinger KVM 1 with **Ubuntu 24.04**. Note the root password it
   gives you; do not paste it anywhere.
2. Buy the domain and point its DNS **A record** at the VPS address (and the
   `AAAA` record if an IPv6 address is given). Add the `www` record too if you
   want `www.__DOMAIN__` to work.
3. Wait for DNS to resolve before step 8 — Let's Encrypt cannot issue a
   certificate until it does. On the laptop:

   ```
   nslookup __DOMAIN__
   ```

---

## 2. The base host

All of these run **on the VPS, as root**, over SSH.

1. Update the system.

   ```
   apt-get update && apt-get upgrade -y
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

4. Check the version. It must be 22.x or newer — `sharp` requires at least
   Node 20.9.

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

4. Clone, with that key.

   ```
   GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_deploy -o IdentitiesOnly=yes" git clone git@github.com:Dar0111/Parents-Portal-System.git /home/portal/Parents_Portal
   ```

5. Make the key the default for this clone, so later pulls need no prefix.

   ```
   cd /home/portal/Parents_Portal && git config core.sshCommand "ssh -i ~/.ssh/id_ed25519_deploy -o IdentitiesOnly=yes"
   ```

6. Confirm the branch and commit.

   ```
   cd /home/portal/Parents_Portal && git log --oneline -1
   ```

---

## 5. Install and build

On the VPS, as `portal`.

1. Server dependencies, production only. `sharp` installs a prebuilt binary
   for linux-x64; nothing is compiled.

   ```
   cd /home/portal/Parents_Portal/server && npm ci --omit=dev
   ```

2. **Before building the client**, create `client/.env.production` with the
   real domain. This is the one thing that makes the web talk to the API
   through Nginx instead of to port 5000: with it blank,
   `client/src/api/apiBase.js` derives `https://__DOMAIN__:5000/api`, a port
   nothing is listening on.

   ```
   nano /home/portal/Parents_Portal/client/.env.production
   ```

   One line, no quotes, no trailing slash:

   ```
   VITE_API_BASE_URL=https://__DOMAIN__/api
   ```

3. Client dependencies (the build needs the dev ones).

   ```
   cd /home/portal/Parents_Portal/client && npm ci
   ```

4. Build.

   ```
   cd /home/portal/Parents_Portal/client && npm run build
   ```

5. Confirm the output exists.

   ```
   ls /home/portal/Parents_Portal/client/dist
   ```

---

## 6. The secrets

Two files move from the laptop. **Neither is ever opened, printed or pasted.**

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

   ```
   sed -i "s/__DOMAIN__/the-real-domain.com/g" /etc/nginx/sites-available/parents-portal.conf
   ```

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
   certbot --nginx -d __DOMAIN__ -d www.__DOMAIN__
   ```

3. Confirm renewal is scheduled.

   ```
   systemctl status certbot.timer
   ```

> Certbot edits the **installed** file at
> `/etc/nginx/sites-available/parents-portal.conf`, adding a 443 server block
> and the redirect. The copy in the repo stays the pre-TLS source on purpose.
> If you ever re-copy it (step 7.2), run step 8.2 again afterwards.

---

## 9. Start the API

On the VPS, as `portal`.

1. Start it.

   ```
   cd /home/portal/Parents_Portal && pm2 start deploy/pm2/ecosystem.config.js
   ```

2. Save the process list so it comes back after a reboot.

   ```
   pm2 save
   ```

3. Read the startup lines. The listen line must be there, and there must be no
   `PG_SSL=verify-full needs PG_CA_FILE` and no `CORS_ORIGIN: ignored …`.

   ```
   pm2 logs parents-portal-api --lines 50 --nostream
   ```

---

## 10. The checks, before the professor arrives

In this order. Each one has an expected result; a surprise stops the run.

| # | Where | Command or action | Expected |
|---|---|---|---|
| 1 | VPS | `node -v` | 22.x or newer |
| 2 | VPS | `curl -fsS https://__DOMAIN__/api/health` | `"db":"ok"` |
| 3 | VPS | `timedatectl` | `Asia/Manila`, NTP synchronized |
| 4 | VPS | `cd /home/portal/Parents_Portal/server && npm run sms:probe` | the gateway reachable, `encryption: on` |
| 5 | Browser | Forgot password for an account with a confirmed Gmail | a real code arrives; then check Admin → Activity log shows **no** `password_reset_email_failed` (the 202 is identical either way, so the log is the only evidence that SMTP left the box) |
| 6 | Laptop, `client/` | `npm run smoke` with `E2E_APP_ORIGIN` and `E2E_API_ORIGIN` set to `https://__DOMAIN__` | 20/20. Note this signs in as the five seeded accounts against the live database |
| 7 | Browser | Open `https://__DOMAIN__/admin/activity-log` and press reload | the page, not a JSON 404 — proves the SPA fallback |
| 8 | Browser | Settings → Account information, upload a photo of about 5 MB | it saves — proves `client_max_body_size` |
| 9 | Phone, Expo Go | `EXPO_PUBLIC_API_URL=https://__DOMAIN__/api` in `mobile/.env`, then `npx expo start --clear` and a **cold boot** | a sign-in for each of the three roles; one write; one live update between two accounts; a real email code and a real SMS code |
| 10 | Browser | Admin → Backup & Restore → Create backup | `201`, the row lists, the file is on the VPS |

Two things to remember on the day:

- **Only the VPS API serves during the check.** The laptop runs Expo's Metro
  and nothing else. Socket.io rooms live in one process, so two APIs against
  the same database would deliver live updates to only half the clients.
- **Backups are per-host files with shared rows.** The `backups` rows are in
  Supabase and visible everywhere, but the ZIP lives on the machine that made
  it. Take Friday's backups on the VPS.

---

## 11. Updating later

On the VPS, as `portal`.

```
cd /home/portal/Parents_Portal && git pull
```

```
cd /home/portal/Parents_Portal/server && npm ci --omit=dev
```

```
cd /home/portal/Parents_Portal/client && npm ci
```

```
cd /home/portal/Parents_Portal/client && npm run build
```

```
pm2 reload parents-portal-api
```

`client/.env.production` is created on the VPS in step 5.2 and is not tracked,
so a `git pull` never overwrites it.

---

## 12. Rollback

The laptop setup is untouched and keeps working: `npm start` in `server/`,
`npm run dev` in `client/`, Expo on 8081. To fall back, stop the VPS API
(`pm2 stop parents-portal-api`), point `mobile/.env`'s `EXPO_PUBLIC_API_URL`
back at the laptop's LAN address, and demo locally. The database is not
involved either way.
