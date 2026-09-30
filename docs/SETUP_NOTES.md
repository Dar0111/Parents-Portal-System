# Setup Notes — Parent's Portal

Permanent notes mula sa chat session (Aug 12, 2026).  
Para sa full run guide, tingnan ang [`README.md`](../README.md) sa project root.

---

## Tools na ginagamit

| Tool | Gamit |
|------|-------|
| **MySQL Workbench** | Database (`parents_portal`) — view tables, run queries |
| **CMD / PowerShell** | Run server, tests, npm commands |
| **Claude Code** | Ang pangunahing AI tool ngayon — binabasa nito ang `CLAUDE.md` nang kusa |
| **Cursor** | Code editor; binabasa ng AI nito ang `.cursorrules`, na tumuturo sa `CLAUDE.md` |

**Hindi kailangan:** XAMPP, Postman — hindi part ng setup natin.

---

## Important na na-discuss

### Database name
```
parents_portal
```
Makikita sa MySQL Workbench → SCHEMAS → `parents_portal`.

**Hindi mo kailangan i-paste manually ang `schema.sql` at `seed.sql` sa Workbench.**  
Ginagawa na iyon ng:
```bash
npm run db:setup
```

### Auth rules (locked)
- **Parent login:** LRN + password (1 account per child)
- **Teacher login:** Teacher ID + password
- **Admin login:** Admin ID + password
- Teacher creates parent → **pending** → Admin approves → **active**
- Admin creates teacher → **active** agad
- Walang self-registration, walang grade selection after login

### Sample accounts
Walang password dito — ang mga default ay nasa `server/scripts/setup-db.js`
(doon hina-hash at isinusulat; ang `database/seed.sql` ay may placeholder
lang). Ang login ID ng parent ay LRN ng bata, kaya hindi pinagsasama sa
iisang doc ang login ID at password — at walang parent login ID dito; nasa
`seed.sql` sila.

| Login ID | Role | Status |
|----------|------|--------|
| ADMIN001 | admin | active |
| TCH-001 | teacher (Maria Santos, adviser + assigned, G6 - Malikhain) | active |
| TCH-002 | teacher (Ana Reyes, adviser lang, G5 - Masigasig) | active |
| TCH-003 | teacher (Lito Bautista, adviser + lahat ng subject, G1 - Mabait) | active |
| LRN ni Marwin (nasa `seed.sql`) | parent (Marwin) | active |
| LRN ni Jea (nasa `seed.sql`) | parent (Jea) | pending |
| LRN ni Nino (nasa `seed.sql`) | parent (Rosa, para kay Nino) | active |
| LRN ni Tala (nasa `seed.sql`) | parent (Ligaya, para kay Tala — browser fixture) | active |

---

## Quick run (araw-araw)

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

**Browser:** `http://localhost:5000/api/health` — dapat `"db":"ok"` ang
sagot (since 2026-09-25 nagpi-ping na ito ng MySQL; `503` kapag down).

**Telepono (Expo Go):** ang setup, ang hotspot at ang troubleshooting ay
nasa **Mobile** section ng [`README.md`](../README.md).

**Tests (third terminal, sa `server/`):** isa-isa lang ang suite, hal.
`npm run test:auth`. Ang `npm run dev` ay `--watch` — nagre-restart ito
kapag may binago kang server file, kaya hintayin muna ang `/api/health`
bago mag-suite. **Huwag magpatakbo ng smoke habang may suite.**

**Existing DB (hindi bagong `db:setup`):** may seed change na dumating na
migration, hindi rebuild — kasi ang `db:setup` ay nagde-drop ng
`activity_logs` at ng `backups` rows. Patakbuhin isang beses, safe ulitin:

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm run db:migrate:fixture-learner         # Tala Halimbawa (G6 - Malikhain) + parent account; browser-fixture learner
npm run db:migrate:contact-verification    # SMS reset codes (2026-09-29); kailangan din ng test:recovery
```

Ang bawat `db:migrate:*` sa `package.json` ay idempotent at nagpi-print ng
created / already present. Huwag i-`db:setup` para lang makuha ang seed row.

**Dalawang run na may sariling kailangan:**

- **`npm run test:recovery`** — kailangan ng server na sinimulan na may
  `MAIL_TRANSPORT=file SMS_TRANSPORT=file`, **sa server**, hindi sa test
  command (binabasa ng suite ang code mula sa disk), at ng
  `db:migrate:auth-codes` at `db:migrate:contact-verification`. Run-book:
  `docs/TESTING.md`.
- **`npm run smoke:isolated`** (sa `client/`) — ang verification smoke:
  sariling API sa 5001 (walang `--watch`) at Vite sa 3001, kaya hindi nito
  ginagalaw ang 5000/3000. Kailangan ng `client/e2e/.env.e2e` (kopya ng
  `.env.e2e.example`, punan ng seed accounts) at isang beses na
  `npx playwright install chromium`.

**Oras ng server (since 2026-09-26, pre-Stage-5 #7):** ang current term ay
hindi na setting — kinukuha ito sa petsa ngayon ng
`server/utils/schoolCalendar.js` (Term 1 Jun 8 – Sep 15, Term 2 Sep 16 –
Dec 18, Term 3 Jan 4 – Apr 8). Kaya **dapat Asia/Manila ang oras ng machine
na nagpapatakbo ng server**, o naka-pin ang `TZ=Asia/Manila` sa service kung
cloud — kung UTC ang server, 8 oras na huli ang "today" niya at mali ang
term mula 00:00 hanggang 08:00 sa Sep 16 at Jan 4. Sa laptop dito, OK na.

**Bagong school year (SY 2027-2028):** DALAWANG edit, sa ganitong order —
(1) bagong petsa sa `server/utils/schoolCalendar.js` AT sa dalawang kopya
nito, `client/src/format/schoolCalendar.js` at
`mobile/src/format/schoolCalendar.js` (`SCHOOL_YEAR`, `CLASSES_START/END`,
`TERMS`; ang `ssr-school-calendar` proof ang magsasabi kung hindi magkapareho
ang server at client, at ang `npm run lint:mirrors` sa `mobile/` ang
magsasabi para sa telepono), tapos (2) `academic_year` sa Admin → Settings ay `PATCH` lang sa
API (naka-lock sa page). Kapag hindi magkapareho ang dalawa, `500` ang
`GET /api/dashboard` at pinapangalanan ang dalawang string. Hindi kasama dito
ang sections, grading configs at transmutation rows ng bagong taon — proseso
pa rin iyon, hindi field (`docs/KNOWN_ISSUES.md`).

**Workbench:**
```sql
USE parents_portal;
SELECT login_id, role, status, name FROM users;
```

---

## Project path

```
C:\Users\Win10 User\Parents_Portal
```

---

## Ano na ang tapos

Ang kasalukuyang estado ay nasa `CLAUDE.md` (BUILD ORDER) at
`docs/PROJECT_PROGRESS.md`. Ang lumang "Phase 1" checklist na nakatayo rito
ay nasa `docs/ARCHIVE.md` → "docs/SETUP_NOTES.md — the Phase 1 checklist, moved
2026-09-30", verbatim.

---

## Chat history sa Cursor

- Nase-save ang chat natin sa Cursor app (Chat history sa sidebar)
- Ang **README.md** at **SETUP_NOTES.md** na ito ang permanent copy sa project folder mo
- Kung naligaw ka, buksan muna ang README → tapos itong file para sa quick reference

---

## Cursor terminal vs Claude Code

### Maikling sagot
**Hindi sila naka-"connect" o naka-sync.** Parehong puwedeng gamitin sa **same project folder**, pero **hiwalay ang chat at session**.

### Paano gumagana

| | **Cursor (ito ngayon)** | **Claude Code** |
|---|------------------------|-----------------|
| Saan | Cursor IDE chat + terminal | Separate CLI sa terminal |
| Project files | Same folder | Same folder (kung same path ka nag-`cd`) |
| Chat history | Cursor chat history | Claude Code session (hiwalay) |
| Context | Hindi automatic na shared | Hindi automatic na shared |

### Puwede mo bang gamitin ang Cursor terminal para sa Claude Code?
**Oo** — ang terminal ng Cursor ay normal terminal lang. Puwede mong i-run doon ang Claude Code CLI **kung naka-install na**:

```bash
cd "C:\Users\Win10 User\Parents_Portal"
claude
```

Pero:
- **Separate tool** iyon — ibang AI session, ibang conversation
- **Hindi niya alam** ang chat natin dito sa Cursor unless ikaw mag-copy-paste ng context
- **Same files** ang ma-e-edit — pareho silang nagbabago sa `Parents_Portal` folder

### Recommendation para sa project na ito
- **Claude Code** — ang pangunahing tool. Kusa nitong binabasa ang
  `CLAUDE.md` sa project root, kaya hindi na kailangang mag-paste ng context.
- **Cursor** — editor; ang AI nito ay binabasa ang `.cursorrules`, na
  tumuturo rin sa `CLAUDE.md`. Huwag gamitin ang `docs/SYSTEM_ARCHITECTURE.md`
  bilang context doc — sinasabi ng `CLAUDE.md` na huwag pagkatiwalaan ang
  heading nito.

---

## Security — Protected Routes (tropa recommendation)

### Ano ang sinasabi ng tropa mo?

Halimbawa: naka-login ang teacher, tapos sa browser pinalitan ang URL:
```
/teacher  →  /admin
```
Kung walang protection, makikita niya ang admin page kahit teacher lang siya.

### Sa backend (API) — ✅ MERON NA

Kahit anong URL i-try ng user sa API, chine-check ang **JWT token + role**:

| Endpoint | Sino lang pwede |
|----------|-----------------|
| `POST /api/users/teachers` | Admin lang |
| `POST /api/users/parents` | Adviser lang ng section ng bata (pre-Stage-5 #4) |
| `GET /api/users/parents/pending` | Admin lang |
| Approve / Reject parent | Admin lang |

Kung teacher mag-try ng admin endpoint → **`403 Access denied`**

Ito ang ginagawa ng `authenticate` + `authorize('admin')` sa `server/middleware/auth.js`.

Na-te-test na sa `npm run test:auth`:
- Teacher cannot create teacher ✓
- Teacher cannot list pending parents ✓

### Sa frontend (React web) — ✅ MERON NA

May **ProtectedRoute** at role routing sa React:
```
/admin/*   → admin role lang
/teacher/* → teacher role lang
/parent/*  → parent role lang
```
Kung teacher pumunta sa `/admin` → babalik sa sariling dashboard. Ang
**401 lang** ang nagla-logout; ang `503` (patay ang database) ay nagpapakita
ng "Can't reach the school server" at hindi ka nila-logout (`CLAUDE.md` §2).

**Important:** Frontend protection = UX lang. Ang tunay na security ay sa **API/backend** — at meron na tayo nun.

---

## GitHub — Ano ang HINDI dapat i-push

Ginawa na ang `.gitignore` sa project root. Auto-ignore ang sensitive files.

### ❌ NEVER push

| File | Bakit |
|------|-------|
| `server/.env` | MySQL password, JWT secret — **pinaka-importante** |
| `node_modules/` | Malaki, i-install via `npm install` |
| `server/uploads/*` | User-uploaded files |
| Database backup files | May real data |
| `server/tmp/` | Ang mail/SMS reset codes ng test transport |
| `mobile/.env` | Ang IP ng API sa hotspot |
| `client/e2e/.env.e2e` | Totoong login ng smoke run |

### ✅ Safe i-push

| File | Notes |
|------|-------|
| `server/.env.example` | Template lang — walang real password |
| `database/schema.sql` | Structure lang, walang password |
| `database/seed.sql` | Sample data — walang password (placeholder lang; ang mga default ay nasa `server/scripts/setup-db.js`) |
| Lahat ng `.js` code | Walang hardcoded secrets |

### Bago mag-push sa GitHub

```bash
cd "C:\Users\Win10 User\Parents_Portal"
git status
```

Siguraduhin na **WALANG** `server/.env` sa list. Dapat naka-ignore na.

Kung nakita mo ang `.env` sa git status:
```bash
# Huwag i-add ang .env — i-check lang ang .gitignore
git check-ignore -v server/.env
# Dapat may output: .gitignore:2:server/.env
```

### Seed passwords sa GitHub — OK ba?

OK para sa local dev lang — ang seed passwords ay **test/demo passwords**, nasa `server/scripts/setup-db.js`. Pero nasa public repo sila, at ang login ID ng parent ay LRN ng bata. **Bago may totoong parent: palitan ang lahat** (`CLAUDE.md` → BEFORE THE PARENT DEMO).

---

## Changelog (notes file)

> **Frozen 2026-09-30.** Ang totoong changelog ay `docs/CHANGELOG.md`, bawat
> dispatch, newest first; walang bagong row dito. Ang mga row sa ibaba ay
> history na lang.

| Date | Update |
|------|--------|
| Sep 26, 2026 | Docs pass: Claude Code as the main tool; passwords out of the accounts table (pointer to `seed.sql`) and the missing accounts in; Quick run is the two-terminal dev run; `test:recovery` and `smoke:isolated` run-books; frontend protection marked built; the Cursor paste block removed |
| Sep 26, 2026 | Quick run: the server's timezone requirement (current term comes from `schoolCalendar.js`, not a setting) and the two-edit new-school-year procedure |
| Sep 25, 2026 | Quick run: `db:migrate:fixture-learner` for an existing DB (never `db:setup` for a seed row); health now reports `db` |
| Aug 12, 2026 | Added protected routes explanation + GitHub security + `.gitignore` |
| Aug 12, 2026 | Created SETUP_NOTES.md — chat summary, Claude Code FAQ |
| Aug 12, 2026 | Phase 1 complete — database + auth |
