# Parent's Portal System

**Captain H. Francisco Elementary School (Grades 1–6)**
187 P. Rosales Street, Barangay Sta. Ana-Kaliwa, Pateros City

Web + mobile portal para sa parents, teachers, at admin (principal).
Capstone project — Pateros Technological College, Institute of Information and Computing Technology.

**Sept 7, 2026** — panel checkpoint (system proposal). **Hindi** ito ang defense.
**Final defense** — expected around **November 2026**.

---

## Saan nakatira ang totoong dokumentasyon

Ang README na ito ay **run guide** — kung paano i-setup at patakbuhin. Ang
buong detalye ay nasa ibang files:

| File | Para saan |
|------|-----------|
| **`CLAUDE.md`** | **Ang authoritative project doc.** Current state, locked decisions, build order, open questions, at ang totoong changelog. Kung mag-disagree ito at ang code, **tama ang code** at kailangang ayusin ang file. |
| `docs/API_REFERENCE.md` | Lahat ng endpoints — body fields, exact response wrapper key, role scoping, 404-vs-403 convention. Ito ang basahin bago gumawa ng screen. |
| `docs/GRADING_SPEC.md` | DepEd DO 015 & DO 009 s. 2026 grading policy — transmutation table, weights, descriptive grading. |
| `docs/PROJECT_PROGRESS.md` | Mirror ng CLAUDE.md, para sa tool-switching. Authoritative pa rin ang CLAUDE.md. |
| `docs/SETUP_NOTES.md` | Extra setup notes. |
| `docs/SYSTEM_ARCHITECTURE.md` | System design (3-tier). |

> **Walang changelog dito.** Dati meron, pero na-stale — nag-claim pa rin ito ng
> "18 tables" at "23 tests" habang malayo na ang code. Mas masama ang lumang
> changelog kaysa wala, kasi mukhang record siya. Ang totoong changelog ay nasa
> **`CLAUDE.md`**, dated at maintained.

---

## Ano na ang tapos?

| Bahagi | Status |
|--------|--------|
| Database schema (22 tables) | ✅ Done |
| Seed data | ✅ Done |
| **Backend API** | ✅ **Sampung modules complete, 78 endpoints, 673 tests sa 15 suites — lahat pumapasa. May isang gap na na-identify at na-audit** (tingnan sa baba) |
| Socket.io (real-time messaging) | ✅ Done |
| Web — foundation (shell, routing, shared UI) | ✅ Done |
| Web — **Teacher pages (7)** | ✅ Attendance, Students (list + detail), Excuse Letters, Announcements, Memos, Events, Messages (list + thread) |
| Web — Teacher Grades at Contributions | ⏳ Hindi pa nasisimulan |
| Web — Parent pages | ⏳ Hindi pa nasisimulan |
| Web — Admin pages | ⏳ Hindi pa nasisimulan |
| Mobile (Expo) | ⏳ Hindi pa nasisimulan |

**Hindi sinasabing "100% complete" ang backend, at sinasadya iyon.** Isang known
gap: **walang endpoint na gumagawa o nagbabasa ng `teacher_assignments`** — kaya
hindi pa kayang mag-assign ng admin ng teacher sa isang subject/section sa API,
at kailangang i-reconstruct ng client ang valid targets ng teacher. Naka-record
sa CLAUDE.md's KNOWN ISSUES, kasama kung anong pages ang nabo-block nito.

Ang endpoint audit ay **tumakbo noong 2026-09-07** — tatlong bucket, lahat empty
(walang documented-pero-walang-handler, walang handler-pero-hindi-documented,
walang orphan na mount).

---

## Kailangan mo bago mag-run

1. **Node.js** — [https://nodejs.org](https://nodejs.org) (LTS version)
2. **MySQL Workbench** — para sa database (`parents_portal`)
3. **CMD** o **PowerShell** — para i-run ang servers at tests

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

Buksan ang `server\.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=          # ilagay ang MySQL password mo (blank kung wala)
DB_NAME=parents_portal

JWT_SECRET=change-this-to-a-long-random-secret
PORT=5000
CORS_ORIGIN=http://localhost:3000
```

> `CORS_ORIGIN` ay dapat tugma sa port ng client (3000). Dito rin naka-base ang
> Socket.io CORS.

### Step 3 — Backend install at database

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm install
npm run db:setup
```

Pag successful, makikita mo sa Workbench ang database na **`parents_portal`**
kasama ang **22 tables**.

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
> Quick check kung buhay ang backend: `curl http://localhost:5000/api/health`.

Sa dev, may lalabas na `LiveStatus` strip ("Live updates paused") sa taas ng
bawat page kapag patay ang Socket.io connection — sinasadya iyon, para hindi
tahimik na mamatay ang real-time updates.

---

## Test accounts (seed data)

| Role | Login ID | Password | Status | Notes |
|------|----------|----------|--------|-------|
| Admin | `ADMIN001` | `Admin@2026` | active | Principal |
| Teacher | `TCH-001` | `Teacher@2026` | active | Maria Santos — adviser **at** assigned teacher ng Grade 6 - Malikhain |
| Teacher | `TCH-002` | `Teacher@2026` | active | Ana Reyes — adviser ng Grade 5 - Masigasig, **walang `teacher_assignments`** |
| Parent | `13567454` | `Parent@2026` | active | Marwin Conde (Grade 6 - Malikhain) |
| Parent | `1234567` | `Parent@2026` | **pending** | Jea Mae Bargaso (Grade 5 - Masigasig) |

> ⚠️ **Kung gagawing public ang repo o ibibigay sa panel, ito ang unang
> tatanggalin.** OK lang sila ngayon — private repo, fixture credentials, hindi
> totoong accounts. Pero pansinin: **ang login ID ng parent ay ang LRN mismo ng
> bata.** Kaya ang table na ito ay hindi lang listahan ng passwords — kalahati
> na siya ng totoong credential. Ganito rin ang dahilan kung bakit walang LRN sa
> anumang URL o error message sa buong app (CLAUDE.md convention §5c).

**Huwag "ayusin" ang dalawang ito — may dahilan sila:**

- **`TCH-002`** — ito lang ang account na kayang paghiwalayin ang dalawang
  scoping authorities ng sistema. Ang ibang teacher fixtures ay adviser **at**
  assigned nang sabay, kaya hindi masasabi ng test kung alin ang gumana. Kapag
  binigyan mo ito ng `teacher_assignments` row, mawawala ang tanging account na
  kayang mag-fail kapag may bug sa scoping.
- **`1234567`** — sinasadyang **pending**. Umaasa dito ang `npm run test:auth`,
  at minsan nang na-corrupt ang exact row na ito sa isang crashed test run.
  Huwag i-approve para lang makapag-login.

---

## Database

```
parents_portal
```

Makikita sa MySQL Workbench under **SCHEMAS** → `parents_portal`. **22 tables.**

Quick check sa Query tab:

```sql
USE parents_portal;
SELECT login_id, role, status, name FROM users;
SELECT lrn, first_name, last_name, grade_level, section FROM students;
```

---

## API endpoints — 78 total

**Walang buong table dito, sinasadya.** Ang lumang 9-row table sa README na ito
ay na-stale at naging mali — kaya hindi na uulitin. Ang buo at tama ay nasa
**`docs/API_REFERENCE.md`**: bawat body field, exact response wrapper key
(mag-iba-iba sila — walang consistent rule), role scoping, at ang 404-vs-403
convention.

Base URL: `http://localhost:5000`

| Module | Endpoints |
|--------|-----------|
| Auth | 3 |
| Users | 9 |
| Students | 5 |
| Sections | 3 |
| Grades | 10 |
| Attendance | 6 |
| Announcements / Memos / Events | 12 (4 bawat isa) |
| Contributions | 8 |
| Excuse Letters | 6 |
| Settings | 4 |
| Backups | 5 |
| Messages | 6 |
| **Sa `server/routes/`** | **77** |
| `GET /api/health` (nasa `server.js`) | 1 |
| **Total** | **78** |

> **Bakit 77 at 78 pareho tama:** ang `docs/API_REFERENCE.md` ay bumibilang ng
> handlers na nasa `server/routes/` lang — 77. Ang `GET /api/health` ay
> naka-mount diretso sa `server.js`, kaya 78 ang lahat ng reachable endpoints.
> Sabihin kung alin ang tinutukoy.

---

## Tests

**15 suites, 673 assertions, lahat pumapasa.** Idempotent lahat — hindi
kailangan ng `npm run db:setup` sa pagitan ng runs.

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm run test:auth
```

| Suite | Assertions | | Suite | Assertions |
|-------|-----------|---|-------|-----------|
| `test:auth` | 25 | | `test:backups` | 39 |
| `test:students` | 39 | | `test:sanitize` | 9 |
| `test:sections` | 30 | | `test:messages` | 56 |
| `test:attendance` | 38 | | `test:restore` | 22 |
| `test:content` | 53 | | `test:excuses` | 67 |
| `test:contributions` | 38 | | `test:grades` | 141 |
| `test:settings` | 26 | | `test:grade-computation` | 51 |
| `test:users` | 39 | | **Total** | **673** |

**Dalawa sa mga ito ay hindi HTTP suites** — `test:sanitize` at
`test:grade-computation` ay direct-call unit tests: **walang server, walang
database**. Pumapasa sila kahit patay ang backend, kaya huwag magtaka.

May isa pang script na hindi kabilang sa 15: `node scripts/verify-grading-seed.js`
(20 checks) — verification ng grading seed data, patakbuhin **after** ng
`npm run db:setup`.

`test:restore` ay sinasadyang **hindi** nag-t-trigger ng totoong restore —
`DROP DATABASE` iyon sa shared dev DB. Basahin ang RESTORE section ng CLAUDE.md
bago galawin.

---

## Project structure

```
Parents_Portal/
├── README.md                    ← ito (run guide)
├── CLAUDE.md                    ← ANG authoritative project doc
├── docs/
│   ├── API_REFERENCE.md         ← lahat ng 78 endpoints
│   ├── GRADING_SPEC.md          ← DO 015 / DO 009 grading policy
│   ├── PROJECT_PROGRESS.md      ← mirror ng CLAUDE.md
│   ├── SETUP_NOTES.md
│   ├── SYSTEM_ARCHITECTURE.md
│   └── agents/                  ← issue tracker + domain notes
├── database/
│   ├── schema.sql               ← 22 tables
│   └── seed.sql                 ← subjects, sections, settings, sample data
├── scripts/
│   └── create-backup-zip.js     ← SOURCE-CODE archiver (zip ng repo).
│                                  HINDI ito ang database backup —
│                                  server/routes/backups.js iyon (mysqldump).
├── server/
│   ├── .env / .env.example
│   ├── server.js                ← Express + http.createServer (kasama Socket.io)
│   ├── socket.js                ← Socket.io: JWT auth sa connect, isang room bawat user
│   ├── config/db.js             ← MySQL pool (may resetPool para sa restore)
│   ├── middleware/auth.js       ← authenticate + authorize
│   ├── routes/                  ← auth, users, students, sections, grades,
│   │                              attendance, content, contributions, excuses,
│   │                              settings, backups, messages
│   ├── utils/                   ← jwt, password, activity, validateId,
│   │                              sanitizeUser, dateFormat, gradeComputation,
│   │                              teacherScope
│   ├── backups/                 ← .sql dumps (gitignored)
│   └── scripts/                 ← setup-db.js + 14 test scripts
└── client/
    ├── .env / .env.example
    ├── vite.config.js           ← port 3000
    └── src/
        ├── api/                 ← axios (mandatory unwrap), extractError
        ├── auth/                ← AuthContext, ProtectedRoute, roles
        ├── components/          ← DataTable, Modal, FormField, StatusBadge,
        │                          EmptyState, ErrorAlert, LoadingSpinner
        ├── format/              ← grade.jsx, date.js
        ├── hooks/               ← useTeacherTargets
        ├── layout/              ← Shell, nav, usePageTitle
        ├── realtime/            ← SocketProvider, UnreadProvider, LiveStatus
        └── pages/
            ├── Login.jsx
            ├── dashboards/      ← admin, teacher, parent
            ├── dev/UiGallery.jsx  ← component gallery (DEV builds lang)
            └── teacher/         ← Attendance, Students, StudentDetail,
                                   ExcuseLetters, Announcements, Memos,
                                   Events, Messages, MessageThread
```

---

## NPM scripts

### `server/`

| Command | Ano ginagawa |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npm run db:setup` | Gumawa ng database, tables, at seed data |
| `npm run dev` | Backend na may auto-restart (`node --watch`) |
| `npm start` | Backend na walang watch |
| `npm run test:<suite>` | Isa sa 15 test suites (tingnan sa taas) |

### `client/`

| Command | Ano ginagawa |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npm run dev` | Vite dev server sa port 3000 |
| `npm run build` | Production build |
| `npm run lint` | oxlint |

> **Tandaan:** ang `npm run build` at `npm run lint` ay nagpapatunay lang na
> nag-c-compile ang code — **hindi** nila pinapatunayan na nagre-render ang
> page. Dalawang beses nang may bug na dumaan sa dalawang ito at nahuli lang
> sa browser. Buksan mo talaga ang page. (CLAUDE.md convention §5h.)

---

## Kung may mali

| Problema | Ano gawin |
|----------|-----------|
| `ECONNREFUSED` sa client | Hindi tumatakbo ang backend. Terminal 1 → `npm run dev` |
| `Access denied for user 'root'` | Mali ang `DB_PASSWORD` sa `server\.env` |
| Blangko ang page, may error sa console | Buksan ang browser console — doon lumalabas ang ganitong bug, hindi sa build |
| Failing test na parang account/status issue | Baka may natirang state sa crashed run. `npm run db:setup` muna bago maghanap ng regression |
| `WebSocket ... closed before the connection is established` sa console | **Normal sa dev.** React StrictMode ito — dev-only, kumokonekta naman ang socket. Tingnan ang CLAUDE.md §5h |
