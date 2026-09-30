# Parent's Portal System

**Captain H. Francisco Elementary School – Main (Grades 1–6)**
P. Rosales St., Sta. Ana, Pateros, Metro Manila

A web + mobile portal for parents, teachers, and the admin (principal).
Capstone project — Pateros Technological College, Institute of Information and Computing Technology.

**Sept 7, 2026** — the panel checkpoint (system proposal) is done; it was not the defense.
**Final defense** — expected around **November 2026**.

---

## Where the real documentation lives

This README is a **run guide** — how to set up and run the system. The full
detail is in other files:

| File | What it is for |
|------|-----------|
| **`CLAUDE.md`** | **The authoritative project doc.** Current state, locked decisions, build order, open questions. If it and the code disagree, **the code is right** and the file must be fixed. |
| `docs/CHANGELOG.md` | The real changelog — every dispatch, dated, newest first. |
| `docs/API_REFERENCE.md` | Every endpoint — body fields, the exact response wrapper key, role scoping, the 404-vs-403 convention. Read it before building a screen. |
| `docs/TESTING.md` | Every suite, proof and lint baseline, and the smoke run. **The only place the numbers live.** |
| `docs/KNOWN_ISSUES.md` | Every known issue, open and closed. |
| `docs/FRONTEND_CONVENTIONS.md` | The full text of the web conventions and the reason behind each one. |
| `docs/MOBILE_CONVENTIONS.md` | Where the phone DIFFERS from the web, and why — Stage 5 (Expo). |
| `docs/GRADING_SPEC.md` | DepEd DO 015 & DO 009 s. 2026 grading policy — transmutation table, weights, descriptive grading. |
| `docs/RESTORE.md` | The design record of Backup & Restore. |
| `docs/ARCHIVE.md` | Old text removed from CLAUDE.md and PROJECT_PROGRESS, verbatim. History only. |
| `docs/PROJECT_PROGRESS.md` | A short snapshot of CLAUDE.md, for tool-switching. No history. |
| `docs/SETUP_NOTES.md` | Extra setup notes (Taglish), including the server's clock and a new school year. |

> **No changelog here, and no counts of tests or endpoints.** There used to
> be, and both went stale while the code kept moving. An old number is worse
> than none, because it looks true. Every number lives in exactly one place.

---

## What is done?

| Part | Status |
|--------|--------|
| Database schema (23 tables) | ✅ Done |
| Seed data | ✅ Done |
| **Backend API** | ✅ Every module, Socket.io included. Endpoint counts: the front matter of `CLAUDE.md` |
| Web — all three roles (Teacher, Parent, Admin) | ✅ Stage 4 closed 2026-09-14; the additions after it are in `CLAUDE.md`'s BUILD ORDER |
| Mobile (Expo) | ✅ Every screen of all three roles in `mobile/` (Backup & Restore is web only). What comes next — the phone test, the smoke gate — is in `CLAUDE.md`'s BUILD ORDER |

Nine features ship. Feature 7 (Contributions/Fees) was built and
**removed on 2026-09-13** — the school may not collect contributions
(`CLAUDE.md` → SCOPE DECISION).

---

## What you need before running

1. **Node.js** — [https://nodejs.org](https://nodejs.org) (LTS version)
2. **MySQL Workbench** — for the database (`parents_portal`)
3. **CMD** or **PowerShell** — to run the servers and tests
4. **The machine's clock: Asia/Manila.** The current term is taken from the
   server's date today — see `docs/SETUP_NOTES.md`

---

## First-time setup (do this once)

### Step 1 — Connect MySQL Workbench

- Open MySQL Workbench → connect to **localhost** (user: `root`)
- Your MySQL server must be running before you run `npm run db:setup`

### Step 2 — Backend environment file

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
copy .env.example .env
```

Open `server\.env` and fill it in. **Every key is in
`server/.env.example`** — copy that, not this README. The ones that must be
right straight away: `DB_PASSWORD` (blank if none), `JWT_SECRET` (a long
random string), and `CORS_ORIGIN=http://localhost:3000` — it must match the
client's port, and the Socket.io CORS is based on it too. `SMTP_*` is for the
forgot-password email, and `SMS_*` for the reset code by text (see **SMS**
below); `MAIL_TRANSPORT=file` and `SMS_TRANSPORT=file` are only for
`test:recovery` (see Tests).

### Step 3 — Backend install and database

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm install
npm run db:setup
```

When it succeeds, Workbench shows the database **`parents_portal`** with
**23 tables**.

> **`db:setup` is for a new machine only.** It wipes `activity_logs` and the
> `backups` rows. On a database that already has data, a new seed row arrives
> through `npm run db:migrate:*` (idempotent, safe to repeat) — see
> `docs/SETUP_NOTES.md`.

### Step 4 — Client environment and install

```bash
cd "C:\Users\Win10 User\Parents_Portal\client"
copy .env.example .env
npm install
```

The `client\.env` — **leave the value blank** (since 2026-10-01):

```env
VITE_API_BASE_URL=
```

Blank means "the page's own host, port 5000": `http://localhost:3000` talks
to `http://localhost:5000/api`, exactly as before, and a phone's Chrome at
`http://<laptop IP>:3000` talks to the laptop's API (see *The web in a
phone's Chrome* below). A value, if set, always wins — so a `localhost` value
would send a phone's Chrome to the phone itself.

---

## How to run (two terminals — both are needed)

**Terminal 1 — backend (port 5000):**

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm run dev
```

**Terminal 2 — client (port 3000):**

```bash
cd "C:\Users\Win10 User\Parents_Portal\client"
npm run dev
```

Open **http://localhost:3000**.

> **Both must be running.** With only the backend, the pages are blank — all
> the data comes from the API. With only the client, you cannot log in.
> Quick check that the backend is alive: `curl http://localhost:5000/api/health`
> — `"db":"ok"` when MySQL is up, `503` when it is not.

In dev, a `LiveStatus` strip ("Live updates paused") appears at the top of
every page when the Socket.io connection is down — that is deliberate, so
real-time updates never die silently.

---

## The web in a phone's Chrome (same Wi-Fi / hotspot as the laptop)

The web app itself, opened in the phone's browser — no Expo. The laptop runs
the API and the client; the phone only needs to be on the same network.

1. **Find the laptop's IP** — `ipconfig`, the IPv4 address of the Wi-Fi
   adapter on the hotspot (for example `192.168.x.y`). It can change with
   every hotspot session.
2. **`server\.env`** — add the laptop's address to the list, keep localhost:
   `CORS_ORIGIN=http://localhost:3000,http://<laptop IP>:3000` (comma, no
   spaces needed, no trailing slash, never `*`). Restart the API (Ctrl+C,
   then `npm run dev`) — `.env` is read once at startup. A mistyped entry is
   printed as `CORS_ORIGIN: ignored "…"` when the API starts.
3. **`client\.env`** — `VITE_API_BASE_URL=` must be **blank** (see Step 4).
   Restart the client after changing it.
4. **Terminal 2** — `npm run dev:lan` instead of `npm run dev` (Vite with
   `--host`, so it listens on the network; `npm run dev` stays
   localhost-only). Vite prints a `Network:` line with the address.
5. **On the phone** — Chrome → `http://<laptop IP>:5000/api/health` first
   (`"db":"ok"`), then `http://<laptop IP>:3000`. `http://localhost:3000`
   keeps working on the laptop at the same time.

When the IP changes, only step 2 changes (the client follows the page's
address by itself). If the phone's Chrome cannot load port 3000 but the
health check on 5000 works, Windows Firewall is blocking `node.exe` on this
network profile — see Mobile below (M5).

---

## Mobile (Expo) — Stage 5, on the phone through Expo Go

**Expo SDK 57**, Expo Go from the Play Store (auto-update OFF on the phone —
the store build moves to SDK 58 in October). `mobile/` has its own folder and
`package.json`; it is not shared with `client/`.

**Setup (once only, on home Wi-Fi):**

```bash
cd "C:\Users\Win10 User\Parents_Portal\mobile"
npm install
copy .env.example .env
```

**Every session — the phone is the hotspot, the laptop joins it:**

1. Turn on the phone's hotspot; connect the laptop.
2. `ipconfig` → "Wireless LAN adapter Wi-Fi" → IPv4 Address. Put it in
   `mobile\.env`: `EXPO_PUBLIC_API_URL=http://<ip>:5000/api`. **It is read at
   bundle time** — restart `npx expo start` when you change it.
3. Terminal 1: `cd server` → `npm run dev` (it must be running).
4. **Prove it first in the phone's Chrome:** `http://<ip>:5000/api/health` →
   it must say `"db":"ok"`. If it only spins — the firewall; if "refused" — the wrong IP.
5. Terminal 3: `cd mobile` → `npx expo start`, scan the QR code in Expo Go.
   If Expo picked the wrong interface (the laptop has four 169.254.x.x
   adapters), in **PowerShell**:
   `$env:REACT_NATIVE_PACKAGER_HOSTNAME="<ip>"` then
   `npx expo start --clear`. (`set …=<ip>` is for CMD only.)

**Firewall:** what opened ports 5000 and 8081 (Metro) is the program rule
"Node.js JavaScript Runtime" for `D:\node.js\node.exe` on the Public and
Private profiles — not a port rule. The hotspot is a Public profile.

**Lint and proofs:** the list, the run-book and the numbers are in
`docs/TESTING.md` only; the commands are under NPM scripts → `mobile/`
below. The rules: `docs/MOBILE_CONVENTIONS.md`.

---

## SMS — reset codes by text (optional)

Forgot-password can send its code by **email and by text**. The text goes
through the **SMSGate** ("SMS Gateway for Android") app on a phone:

- In the app: **Local Server** mode, port **8080**. The app shows the Local
  Server's username and password.
- In `server\.env`: `SMS_TRANSPORT=gateway`,
  `SMS_GATEWAY_URL=http://<the phone's ip>:8080`, and `SMS_GATEWAY_USER` /
  `SMS_GATEWAY_PASS` from the app. **Never commit the values.**
- **It stays off except during a test:** a blank `SMS_TRANSPORT` = SMS off,
  email only. `npm run sms:probe` (in `server/`) checks that the gateway is
  reachable. The detail: `docs/KNOWN_ISSUES.md` (the SMS rows) and
  `server/.env.example`.

---

## Test accounts (seed data)

**No passwords here, on purpose.** The defaults are in
`server/scripts/setup-db.js` (that is where they are hashed and written;
`database/seed.sql` holds only a placeholder). A parent's login ID is **the
child's own LRN**, so a login ID and a password together in one doc make a
full credential — which is why the table below has no parent login ID; they
are in `seed.sql`.

| Role | Login ID | Status | Notes |
|------|----------|--------|-------|
| Admin | `ADMIN001` | active | Principal |
| Teacher | `TCH-001` | active | Maria Santos — adviser **and** assigned teacher of Grade 6 - Malikhain |
| Teacher | `TCH-002` | active | Ana Reyes — adviser of Grade 5 - Masigasig, **no `teacher_assignments`** |
| Teacher | `TCH-003` | active | Lito Bautista — adviser of Grade 1 - Mabait **and** assigned to all five Grade 1 subjects |
| Parent | Marwin's LRN (in `seed.sql`) | active | Marwin Conde (Grade 6 - Malikhain) |
| Parent | Jea's LRN (in `seed.sql`) | **pending** | Jea Mae Bargaso (Grade 5 - Masigasig) |
| Parent | Nino's LRN (in `seed.sql`) | active | Rosa Alcantara, parent of Nino Alcantara (Grade 1 - Mabait) |
| Parent | Tala's LRN (in `seed.sql`) | active | Ligaya Halimbawa, parent of **Tala Halimbawa** (Grade 6 - Malikhain) — the browser-fixture learner |

> ⚠️ **Before any real parent: change every default password**
> (`CLAUDE.md` → BEFORE THE PARENT DEMO). The same reason is why there is no
> LRN in any URL or error message anywhere in the app (convention §5c).

**Do not "fix" these — they are there for a reason:**

- **`TCH-002`** — the only account that can tell the system's two scoping
  authorities apart. The other teacher fixtures are adviser **and** assigned
  at once, so a test cannot tell which one worked. Give it a
  `teacher_assignments` row and you lose the only account that can fail when
  scoping has a bug.
- **Jea's parent account** — **pending** on purpose. `npm run test:auth` relies on it,
  and this exact row was once corrupted by a crashed test run.
  Do not approve it just to log in.
- **Tala Halimbawa** — for browser checks only; no suite uses her, and every
  suite stays on Marwin. On a database that already has data, she arrives
  through `npm run db:migrate:fixture-learner`.

---

## Database

```
parents_portal
```

Shown in MySQL Workbench under **SCHEMAS** → `parents_portal`. **23 tables.**

Quick check in the Query tab:

```sql
USE parents_portal;
SELECT login_id, role, status, name FROM users;
SELECT lrn, first_name, last_name, grade_level, section FROM students;
```

---

## API endpoints

**No table or count here, on purpose.** The full and correct record is in
**`docs/API_REFERENCE.md` §8**: every body field, the exact response wrapper
key (they vary — there is no consistent rule), role scoping, and the
404-vs-403 convention. The two totals — the handlers in `server/routes/` and
every reachable endpoint including `GET /api/health` — are in the front
matter of `CLAUDE.md`.

Base URL: `http://localhost:5000`

---

## Tests

**The baselines are in `docs/TESTING.md` — there only, not here.**
The suites are idempotent — no `npm run db:setup` is needed between runs;
every suite deletes the rows it created.

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm run test:auth
```

- **One suite at a time**, and wait for `/api/health` after editing a server
  file (`npm run dev` is `--watch`; it restarts).
- **Not HTTP suites:** `test:sanitize`, `test:grade-computation`,
  `test:school-calendar`, `test:auth-middleware`, `test:sms-transport` and
  `test:cors-origins` are direct-call unit tests: **no running API, no
  database** (`test:cors-origins` starts its own throwaway servers on a random
  local port). They pass even with the backend down.
- **`test:recovery`** — needs a server started with
  `MAIL_TRANSPORT=file SMS_TRANSPORT=file` **on the server itself**, not on the
  test command, plus `db:migrate:auth-codes` and `db:migrate:contact-verification`
  (run-book: `docs/TESTING.md`).
- **`test:restore`** — deliberately does **not** trigger a real restore
  (that is `DROP DATABASE` on the shared dev DB). Read the RESTORE section of
  `CLAUDE.md` before touching it.
- **`npm run verify:grading-seed`** — verifies the grading seed data; run it
  **after** `npm run db:setup`.

**Client proofs and smoke** (from `client/`):

- The render proofs are `client/scripts/ssr-*.jsx` — no npm script; each has
  a run-book in `docs/TESTING.md` (two must be run in two time zones, and one
  under `NODE_ENV=development`).
- **`npm run smoke:isolated`** — the verification smoke: its own API (5001,
  no `--watch`) and its own Vite (3001), so it never touches 5000/3000. It
  needs `client/e2e/.env.e2e` (a copy of `.env.e2e.example`) and, once,
  `npx playwright install chromium`.
  **Never run it while a suite is running.**

---

## Project structure

```
Parents_Portal/
├── README.md, CLAUDE.md, .cursorrules
├── docs/            ← the documents above; docs/agents/ for the skills
├── database/        ← schema.sql (23 tables), seed.sql
├── scripts/         ← create-backup-zip.js: a SOURCE-CODE archiver, not a DB backup
├── server/          ← Express + Socket.io API
│   ├── routes/      ← one file per module
│   ├── utils/       ← shared helpers (scoping, rules, calendar, mailer, …)
│   ├── middleware/  ← authenticate + authorize
│   ├── config/      ← MySQL pool (with resetPool for restore)
│   ├── scripts/     ← setup-db, db:migrate:*, verify-grading-seed, probe-sms-gateway, proof-backup-loop, every test:*
│   ├── tmp/         ← the test transport's mail/SMS codes (gitignored)
│   └── backups/     ← .sql dumps (gitignored) — this is the DB backup
├── client/          ← React + Vite + Tailwind (port 3000)
│   ├── src/         ← api, auth, components, format, layout, realtime, pages
│   ├── scripts/     ← render proofs (ssr-*), lint:tokens, lint:contrast, smoke:isolated
│   └── e2e/         ← Playwright smoke run
└── mobile/          ← Expo (SDK 57) app — its own package.json
    ├── src/         ← api, auth, navigation, screens, components, format, theme
    └── scripts/     ← lint checks (mirrors, tokens, colors) and proofs (proof-*)
```

The detail is in the code itself. (`docs/ARCHIVE.md` → CURRENT STATE →
Files that exist is a snapshot from 2026-09-18 — before `mobile/` and SMS —
so it is history only.)

---

## NPM scripts

### `server/`

| Command | What it does |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npm run db:setup` | Create the database, tables and seed data — **new machine only** |
| `npm run db:migrate:<name>` | An idempotent migration for a database that already has data (the list is in `package.json`) |
| `npm run dev` | Backend with auto-restart (`node --watch`) |
| `npm start` | Backend without watch |
| `npm run test:<suite>` | One of the test suites (`docs/TESTING.md`) |
| `npm run verify:grading-seed` | Check the grading seed data |
| `npm run sms:probe` | Check that the SMS gateway is reachable (see SMS above) |
| `npm run proof:backups` | The loop for the backup first-call reset — **makes real backups, its own API on 5001, one arm at a time**; not a suite (`docs/TESTING.md`) |

### `client/`

| Command | What it does |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npm run dev` | Vite dev server on port 3000 (this laptop only) |
| `npm run dev:lan` | The same, listening on the network — for the web in a phone's Chrome |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | oxlint |
| `npm run lint:tokens` | No raw colour outside `index.css` |
| `npm run lint:contrast` | Contrast of every colour pair, in both themes |
| `npm run smoke` | Playwright smoke against 5000/3000 |
| `npm run smoke:isolated` | The smoke on its own 5001/3001 — use this one for verification |

### `mobile/`

| Command | What it does |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npx expo start` | Metro + a QR code for Expo Go (`--clear` after changing `.env`) |
| `npm run android` | Expo start straight to Android |
| `npm run lint` | oxlint |
| `npm run lint:mirrors` | Are the files copied from `client/` identical byte for byte |
| `npm run lint:tokens` | Do the generated tokens match `client/src/index.css` |
| `npm run lint:colors` | No raw colour outside `src/theme/tokens.js` |
| `npm run tokens:write` | Regenerate the tokens from `client/src/index.css` |
| `npm run proof:<name>` | One of the proofs (the list: `docs/TESTING.md`) |

> **Remember:** `npm run build` and `npm run lint` only prove the code
> compiles — they do **not** prove the page renders. Actually open the page.
> (`CLAUDE.md` convention §5h.)

---

## If something is wrong

| Problem | What to do |
|----------|-----------|
| `ECONNREFUSED` in the client | The backend is not running. Terminal 1 → `npm run dev` |
| `Access denied for user 'root'` | `DB_PASSWORD` in `server\.env` is wrong |
| "Can't reach the school server" + `Database unreachable.` | MySQL is down. **You were not logged out** — start MySQL, then Try again |
| Blank page, an error in the console | Open the browser console — that is where this kind of bug shows, not in the build |
| A failing test that looks like an account/status issue | First check the Seeded baseline in `CLAUDE.md` and clean up what was left behind following the cleanup protocol (health → backup → delete through the API). **Never `db:setup`** on a database with real data |
| The first test of `npm run smoke` is `ERR_CONNECTION_REFUSED` | The `--watch` API is restarting. Use `npm run smoke:isolated` |
| The wrong term on screen | The server's clock is not Asia/Manila (`docs/SETUP_NOTES.md`) |
| `ERR_NETWORK` / "Can't reach the school server" on the phone | Open `http://<ip>:5000/api/health` in the phone's Chrome. If "refused" — the wrong IP in `mobile\.env`. **If it spins until it times out** — set the Wi-Fi network profile to **Private** in Windows (Settings → Network & internet → Wi-Fi → the network → Private), then try again |
| `WebSocket ... closed before the connection is established` in the console | **Normal in dev.** It is React StrictMode — dev-only, and the socket does connect. See `CLAUDE.md` §5h |
