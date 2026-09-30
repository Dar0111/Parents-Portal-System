# Parent's Portal System

**Captain H. Francisco Elementary School – Main (Grades 1–6)**
P. Rosales St., Sta. Ana, Pateros, Metro Manila

Web + mobile portal para sa parents, teachers, at admin (principal).
Capstone project — Pateros Technological College, Institute of Information and Computing Technology.

**Sept 7, 2026** — tapos na ang panel checkpoint (system proposal); hindi iyon ang defense.
**Final defense** — expected around **November 2026**.

---

## Saan nakatira ang totoong dokumentasyon

Ang README na ito ay **run guide** — kung paano i-setup at patakbuhin. Ang
buong detalye ay nasa ibang files:

| File | Para saan |
|------|-----------|
| **`CLAUDE.md`** | **Ang authoritative project doc.** Current state, locked decisions, build order, open questions. Kung mag-disagree ito at ang code, **tama ang code** at kailangang ayusin ang file. |
| `docs/CHANGELOG.md` | Ang totoong changelog — bawat dispatch, may petsa, newest first. |
| `docs/API_REFERENCE.md` | Lahat ng endpoints — body fields, exact response wrapper key, role scoping, 404-vs-403 convention. Ito ang basahin bago gumawa ng screen. |
| `docs/TESTING.md` | Bawat suite, proof at lint baseline, at ang smoke run. **Ang tanging lugar ng mga bilang.** |
| `docs/KNOWN_ISSUES.md` | Bawat known issue, bukas at sarado. |
| `docs/FRONTEND_CONVENTIONS.md` | Ang buong teksto ng web conventions at ang dahilan ng bawat isa. |
| `docs/MOBILE_CONVENTIONS.md` | Kung saan IBA ang telepono sa web, at bakit — Stage 5 (Expo). |
| `docs/GRADING_SPEC.md` | DepEd DO 015 & DO 009 s. 2026 grading policy — transmutation table, weights, descriptive grading. |
| `docs/RESTORE.md` | Ang design record ng Backup & Restore. |
| `docs/ARCHIVE.md` | Lumang teksto na inalis sa CLAUDE.md at PROJECT_PROGRESS, verbatim. History lang. |
| `docs/PROJECT_PROGRESS.md` | Maikling snapshot ng CLAUDE.md, para sa tool-switching. Walang history. |
| `docs/SETUP_NOTES.md` | Extra setup notes (Taglish), kasama ang oras ng server at bagong school year. |

> **Walang changelog dito, at walang bilang ng tests o endpoints.** Dati
> meron, at parehong na-stale habang tumatakbo ang code. Mas masama ang
> lumang bilang kaysa wala, kasi mukhang totoo. Isang lugar lang ang bawat
> bilang.

---

## Ano na ang tapos?

| Bahagi | Status |
|--------|--------|
| Database schema (23 tables) | ✅ Done |
| Seed data | ✅ Done |
| **Backend API** | ✅ Lahat ng module, pati Socket.io. Bilang ng endpoints: front matter ng `CLAUDE.md` |
| Web — lahat ng tatlong role (Teacher, Parent, Admin) | ✅ Stage 4 sarado 2026-09-14; ang mga dagdag pagkatapos nito ay nasa BUILD ORDER ng `CLAUDE.md` |
| Mobile (Expo) | ✅ Lahat ng screen ng tatlong role sa `mobile/` (ang Backup & Restore ay web lang). Ang susunod — phone test, smoke gate — ay nasa BUILD ORDER ng `CLAUDE.md` |

Siyam na feature ang ship. Ang Feature 7 (Contributions/Fees) ay ginawa at
**tinanggal noong 2026-09-13** — hindi puwedeng mangolekta ng contributions
ang paaralan (`CLAUDE.md` → SCOPE DECISION).

---

## Kailangan mo bago mag-run

1. **Node.js** — [https://nodejs.org](https://nodejs.org) (LTS version)
2. **MySQL Workbench** — para sa database (`parents_portal`)
3. **CMD** o **PowerShell** — para i-run ang servers at tests
4. **Oras ng machine: Asia/Manila.** Ang current term ay kinukuha sa petsa
   ngayon ng server — tingnan ang `docs/SETUP_NOTES.md`

---

## First-time setup (gawin once lang)

### Step 1 — I-connect ang MySQL Workbench

- Buksan ang MySQL Workbench → connect sa **localhost** (user: `root`)
- Dapat naka-on ang MySQL server mo bago mag-run ng `npm run db:setup`

### Step 2 — Backend environment file

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
copy .env.example .env
```

Buksan ang `server\.env` at punan. **Ang lahat ng key ay nasa
`server/.env.example`** — kopyahin iyon, huwag itong README. Ang
kailangang tama agad: `DB_PASSWORD` (blank kung wala), `JWT_SECRET`
(mahabang random na string), at `CORS_ORIGIN=http://localhost:3000` — dapat
tugma sa port ng client, at dito rin naka-base ang Socket.io CORS. Ang
`SMTP_*` ay para sa forgot-password email, at ang `SMS_*` para sa reset code
sa text (tingnan ang **SMS** sa ibaba); ang `MAIL_TRANSPORT=file` at
`SMS_TRANSPORT=file` ay para lang sa `test:recovery` (tingnan ang Tests).

### Step 3 — Backend install at database

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm install
npm run db:setup
```

Pag successful, makikita mo sa Workbench ang database na **`parents_portal`**
kasama ang **23 tables**.

> **`db:setup` ay para sa bagong machine lang.** Binubura nito ang
> `activity_logs` at ang `backups` rows. Sa database na may laman na, ang
> bagong seed row ay dumarating sa `npm run db:migrate:*` (idempotent, safe
> ulitin) — tingnan ang `docs/SETUP_NOTES.md`.

### Step 4 — Client environment at install

```bash
cd "C:\Users\Win10 User\Parents_Portal\client"
copy .env.example .env
npm install
```

Ang `client\.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## Paano patakbuhin (dalawang terminal — kailangan pareho)

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

Buksan ang **http://localhost:3000**.

> **Kailangang tumakbo pareho.** Kung backend lang, blangko ang pages —
> lahat ng data ay galing sa API. Kung client lang, hindi ka makaka-login.
> Quick check kung buhay ang backend: `curl http://localhost:5000/api/health`
> — `"db":"ok"` kapag buhay ang MySQL, `503` kapag hindi.

Sa dev, may lalabas na `LiveStatus` strip ("Live updates paused") sa taas ng
bawat page kapag patay ang Socket.io connection — sinasadya iyon, para hindi
tahimik na mamatay ang real-time updates.

---

## Mobile (Expo) — Stage 5, sa telepono sa pamamagitan ng Expo Go

**Expo SDK 57**, Expo Go mula sa Play Store (auto-update OFF sa telepono —
lilipat sa SDK 58 ang store build sa Oktubre). Sariling folder at
`package.json` ang `mobile/`; hindi ito shared sa `client/`.

**Setup (once lang, sa home Wi-Fi):**

```bash
cd "C:\Users\Win10 User\Parents_Portal\mobile"
npm install
copy .env.example .env
```

**Bawat session — ang telepono ang hotspot, ang laptop ang sumasali:**

1. Buksan ang hotspot ng telepono; i-connect ang laptop.
2. `ipconfig` → "Wireless LAN adapter Wi-Fi" → IPv4 Address. Ilagay sa
   `mobile\.env`: `EXPO_PUBLIC_API_URL=http://<ip>:5000/api`. **Binabasa ito
   sa bundle time** — i-restart ang `npx expo start` kapag binago.
3. Terminal 1: `cd server` → `npm run dev` (kailangang tumatakbo).
4. **Patunay muna sa Chrome ng telepono:** `http://<ip>:5000/api/health` →
   dapat `"db":"ok"`. Kung umiikot lang — firewall; kung "refused" — maling IP.
5. Terminal 3: `cd mobile` → `npx expo start`, i-scan ang QR sa Expo Go.
   Kung maling interface ang napili ng Expo (may apat na 169.254.x.x adapter
   ang laptop), sa **PowerShell**:
   `$env:REACT_NATIVE_PACKAGER_HOSTNAME="<ip>"` tapos
   `npx expo start --clear`. (Ang `set …=<ip>` ay para lang sa CMD.)

**Firewall:** ang nagbukas ng port 5000 at 8081 (Metro) ay ang program rule
na "Node.js JavaScript Runtime" para sa `D:\node.js\node.exe` sa Public at
Private profiles — hindi port rule. Public profile ang hotspot.

**Lint at proofs:** ang listahan, ang run-book at ang mga bilang ay nasa
`docs/TESTING.md` lang; ang mga command ay nasa NPM scripts → `mobile/` sa
ibaba. Ang mga rule: `docs/MOBILE_CONVENTIONS.md`.

---

## SMS — reset code sa text (opsyonal)

Ang forgot-password ay puwedeng magpadala ng code sa **email at sa text**.
Ang text ay dumadaan sa **SMSGate** ("SMS Gateway for Android") na app sa
telepono:

- Sa app: **Local Server** mode, port **8080**. Ipinapakita ng app ang
  username at password ng Local Server.
- Sa `server\.env`: `SMS_TRANSPORT=gateway`,
  `SMS_GATEWAY_URL=http://<ip ng telepono>:8080`, at `SMS_GATEWAY_USER` /
  `SMS_GATEWAY_PASS` mula sa app. **Huwag i-commit ang mga value.**
- **Naka-off ito maliban kung may test:** blangkong `SMS_TRANSPORT` = SMS
  off, email lang. `npm run sms:probe` (sa `server/`) ang tsek kung
  naaabot ang gateway. Ang detalye: `docs/KNOWN_ISSUES.md` (SMS rows) at
  `server/.env.example`.

---

## Test accounts (seed data)

**Walang password dito, sinasadya.** Ang mga default ay nasa
`server/scripts/setup-db.js` (doon sila hina-hash at isinusulat; ang
`database/seed.sql` ay may placeholder lang). Ang login ID ng parent ay ang
**LRN mismo ng bata**, kaya ang login ID at password na magkasama sa iisang
doc ay isang buong credential — kaya walang parent login ID sa table sa
ibaba; nasa `seed.sql` sila.

| Role | Login ID | Status | Notes |
|------|----------|--------|-------|
| Admin | `ADMIN001` | active | Principal |
| Teacher | `TCH-001` | active | Maria Santos — adviser **at** assigned teacher ng Grade 6 - Malikhain |
| Teacher | `TCH-002` | active | Ana Reyes — adviser ng Grade 5 - Masigasig, **walang `teacher_assignments`** |
| Teacher | `TCH-003` | active | Lito Bautista — adviser ng Grade 1 - Mabait **at** assigned sa lahat ng limang Grade 1 subject |
| Parent | LRN ni Marwin (nasa `seed.sql`) | active | Marwin Conde (Grade 6 - Malikhain) |
| Parent | LRN ni Jea (nasa `seed.sql`) | **pending** | Jea Mae Bargaso (Grade 5 - Masigasig) |
| Parent | LRN ni Nino (nasa `seed.sql`) | active | Rosa Alcantara, parent ni Nino Alcantara (Grade 1 - Mabait) |
| Parent | LRN ni Tala (nasa `seed.sql`) | active | Ligaya Halimbawa, parent ni **Tala Halimbawa** (Grade 6 - Malikhain) — ang browser-fixture learner |

> ⚠️ **Bago may totoong parent: palitan ang lahat ng default password**
> (`CLAUDE.md` → BEFORE THE PARENT DEMO). Ganito rin ang dahilan kung bakit
> walang LRN sa anumang URL o error message sa buong app (convention §5c).

**Huwag "ayusin" ang mga ito — may dahilan sila:**

- **`TCH-002`** — ito lang ang account na kayang paghiwalayin ang dalawang
  scoping authorities ng sistema. Ang ibang teacher fixtures ay adviser **at**
  assigned nang sabay, kaya hindi masasabi ng test kung alin ang gumana. Kapag
  binigyan mo ito ng `teacher_assignments` row, mawawala ang tanging account na
  kayang mag-fail kapag may bug sa scoping.
- **Ang parent account ni Jea** — sinasadyang **pending**. Umaasa dito ang `npm run test:auth`,
  at minsan nang na-corrupt ang exact row na ito sa isang crashed test run.
  Huwag i-approve para lang makapag-login.
- **Tala Halimbawa** — para sa browser checks lang; walang suite na gumagamit
  sa kanya, at lahat ng suite ay nasa Marwin. Sa database na may laman na,
  dumarating siya sa `npm run db:migrate:fixture-learner`.

---

## Database

```
parents_portal
```

Makikita sa MySQL Workbench under **SCHEMAS** → `parents_portal`. **23 tables.**

Quick check sa Query tab:

```sql
USE parents_portal;
SELECT login_id, role, status, name FROM users;
SELECT lrn, first_name, last_name, grade_level, section FROM students;
```

---

## API endpoints

**Walang table o bilang dito, sinasadya.** Ang buo at tama ay nasa
**`docs/API_REFERENCE.md` §8**: bawat body field, exact response wrapper key
(mag-iba-iba sila — walang consistent rule), role scoping, at ang 404-vs-403
convention. Ang dalawang total — handlers sa `server/routes/` at lahat ng
reachable endpoints kasama ang `GET /api/health` — ay nasa front matter ng
`CLAUDE.md`.

Base URL: `http://localhost:5000`

---

## Tests

**Ang mga baseline ay nasa `docs/TESTING.md` — doon lang, hindi dito.**
Idempotent ang mga suite — hindi kailangan ng `npm run db:setup` sa pagitan
ng runs; binubura ng bawat suite ang rows na ginawa nito.

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm run test:auth
```

- **Isa-isa lang ang suite**, at hintayin ang `/api/health` pagkatapos
  mag-edit ng server file (`npm run dev` ay `--watch`, nagre-restart ito).
- **Hindi HTTP suite** ang `test:sanitize`, `test:grade-computation`,
  `test:school-calendar`, `test:auth-middleware` at `test:sms-transport` —
  direct-call unit tests: **walang server, walang database**. Pumapasa sila
  kahit patay ang backend.
- **`test:recovery`** — kailangan ng server na sinimulan na may
  `MAIL_TRANSPORT=file SMS_TRANSPORT=file` **sa server mismo**, hindi sa test
  command, at ng `db:migrate:auth-codes` at `db:migrate:contact-verification`
  (run-book: `docs/TESTING.md`).
- **`test:restore`** — sinasadyang **hindi** nag-t-trigger ng totoong restore
  (`DROP DATABASE` iyon sa shared dev DB). Basahin ang RESTORE section ng
  `CLAUDE.md` bago galawin.
- **`npm run verify:grading-seed`** — verification ng grading seed data,
  patakbuhin **after** ng `npm run db:setup`.

**Client proofs at smoke** (mula sa `client/`):

- Ang render proofs ay `client/scripts/ssr-*.jsx` — walang npm script; bawat
  isa ay may run-book sa `docs/TESTING.md` (may dalawang dapat patakbuhin sa
  dalawang timezone, at isa sa `NODE_ENV=development`).
- **`npm run smoke:isolated`** — ang verification smoke: sariling API (5001,
  walang `--watch`) at sariling Vite (3001), kaya hindi nito ginagalaw ang
  5000/3000. Kailangan ng `client/e2e/.env.e2e` (kopya ng
  `.env.e2e.example`) at, isang beses, `npx playwright install chromium`.
  **Huwag patakbuhin habang may suite.**

---

## Project structure

```
Parents_Portal/
├── README.md, CLAUDE.md, .cursorrules
├── docs/            ← ang mga dokumento sa itaas; docs/agents/ para sa skills
├── database/        ← schema.sql (23 tables), seed.sql
├── scripts/         ← create-backup-zip.js: SOURCE-CODE archiver, hindi DB backup
├── server/          ← Express + Socket.io API
│   ├── routes/      ← isang file bawat module
│   ├── utils/       ← shared helpers (scoping, rules, calendar, mailer, …)
│   ├── middleware/  ← authenticate + authorize
│   ├── config/      ← MySQL pool (may resetPool para sa restore)
│   ├── scripts/     ← setup-db, db:migrate:*, verify-grading-seed, probe-sms-gateway, proof-backup-loop, lahat ng test:*
│   ├── tmp/         ← mail/SMS codes ng test transport (gitignored)
│   └── backups/     ← .sql dumps (gitignored) — ito ang DB backup
├── client/          ← React + Vite + Tailwind (port 3000)
│   ├── src/         ← api, auth, components, format, layout, realtime, pages
│   ├── scripts/     ← render proofs (ssr-*), lint:tokens, lint:contrast, smoke:isolated
│   └── e2e/         ← Playwright smoke run
└── mobile/          ← Expo (SDK 57) app — sariling package.json
    ├── src/         ← api, auth, navigation, screens, components, format, theme
    └── scripts/     ← lint checks (mirrors, tokens, colors) at proofs (proof-*)
```

Ang detalye ay nasa code mismo. (Ang `docs/ARCHIVE.md` → CURRENT STATE →
Files that exist ay snapshot noong 2026-09-18 — bago ang `mobile/` at ang
SMS — kaya history na lang iyon.)

---

## NPM scripts

### `server/`

| Command | Ano ginagawa |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npm run db:setup` | Gumawa ng database, tables at seed data — **bagong machine lang** |
| `npm run db:migrate:<name>` | Idempotent na migration para sa database na may laman na (ang listahan ay nasa `package.json`) |
| `npm run dev` | Backend na may auto-restart (`node --watch`) |
| `npm start` | Backend na walang watch |
| `npm run test:<suite>` | Isa sa mga test suite (`docs/TESTING.md`) |
| `npm run verify:grading-seed` | Tsek ng grading seed data |
| `npm run sms:probe` | Tsek kung naaabot ang SMS gateway (tingnan ang SMS sa itaas) |
| `npm run proof:backups` | Ang loop para sa backup first-call reset — **gumagawa ng totoong backups, sariling API sa 5001, isa-isang arm**; hindi suite (`docs/TESTING.md`) |

### `client/`

| Command | Ano ginagawa |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npm run dev` | Vite dev server sa port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Silipin ang production build |
| `npm run lint` | oxlint |
| `npm run lint:tokens` | Walang raw color sa labas ng `index.css` |
| `npm run lint:contrast` | Contrast ng bawat color pair, sa dalawang theme |
| `npm run smoke` | Playwright smoke laban sa 5000/3000 |
| `npm run smoke:isolated` | Ang smoke sa sariling 5001/3001 — gamitin ito para sa verification |

### `mobile/`

| Command | Ano ginagawa |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npx expo start` | Metro + QR code para sa Expo Go (`--clear` kapag binago ang `.env`) |
| `npm run android` | Expo start na diretso sa Android |
| `npm run lint` | oxlint |
| `npm run lint:mirrors` | Pareho ba byte-for-byte ang mga kinopyang file mula sa `client/` |
| `npm run lint:tokens` | Tugma ba ang generated tokens sa `client/src/index.css` |
| `npm run lint:colors` | Walang raw color sa labas ng `src/theme/tokens.js` |
| `npm run tokens:write` | I-regenerate ang tokens mula sa `client/src/index.css` |
| `npm run proof:<name>` | Isa sa mga proof (ang listahan: `docs/TESTING.md`) |

> **Tandaan:** ang `npm run build` at `npm run lint` ay nagpapatunay lang na
> nag-c-compile ang code — **hindi** nila pinapatunayan na nagre-render ang
> page. Buksan mo talaga ang page. (`CLAUDE.md` convention §5h.)

---

## Kung may mali

| Problema | Ano gawin |
|----------|-----------|
| `ECONNREFUSED` sa client | Hindi tumatakbo ang backend. Terminal 1 → `npm run dev` |
| `Access denied for user 'root'` | Mali ang `DB_PASSWORD` sa `server\.env` |
| "Can't reach the school server" + `Database unreachable.` | Patay ang MySQL. **Hindi ka na-logout** — buhayin ang MySQL, tapos Try again |
| Blangko ang page, may error sa console | Buksan ang browser console — doon lumalabas ang ganitong bug, hindi sa build |
| Failing test na parang account/status issue | Tingnan muna ang Seeded baseline sa `CLAUDE.md` at linisin ang natira ayon sa cleanup protocol (health → backup → delete sa API). **Huwag `db:setup`** sa database na may totoong data |
| Unang test ng `npm run smoke` ay `ERR_CONNECTION_REFUSED` | Nagre-restart ang `--watch` API. Gamitin ang `npm run smoke:isolated` |
| Maling term sa screen | Hindi Asia/Manila ang oras ng server (`docs/SETUP_NOTES.md`) |
| `ERR_NETWORK` / "Can't reach the school server" sa telepono | Buksan sa Chrome ng telepono ang `http://<ip>:5000/api/health`. Kung "refused" — maling IP sa `mobile\.env`. **Kung umiikot hanggang mag-time out** — gawing **Private** ang network profile ng Wi-Fi sa Windows (Settings → Network & internet → Wi-Fi → ang network → Private), tapos subukan ulit |
| `WebSocket ... closed before the connection is established` sa console | **Normal sa dev.** React StrictMode ito — dev-only, kumokonekta naman ang socket. Tingnan ang `CLAUDE.md` §5h |
