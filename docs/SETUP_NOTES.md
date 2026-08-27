# Setup Notes — Parent's Portal

Permanent notes mula sa chat session (Aug 12, 2026).  
Para sa full run guide, tingnan ang [`README.md`](../README.md) sa project root.

---

## Tools na ginagamit

| Tool | Gamit |
|------|-------|
| **MySQL Workbench** | Database (`parents_portal`) — view tables, run queries |
| **CMD / PowerShell** | Run server, tests, npm commands |
| **Cursor** | Code editor + AI chat (ito ang ginagamit natin ngayon) |

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
| Login ID | Password | Role | Status |
|----------|----------|------|--------|
| ADMIN001 | Admin@2026 | admin | active |
| TCH-001 | Teacher@2026 | teacher | active |
| 13567454 | Parent@2026 | parent (Marwin) | active |
| 1234567 | Parent@2026 | parent (Jea) | pending |

---

## Quick run (araw-araw)

**Terminal 1:**
```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm start
```

**Terminal 2:**
```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm run test:auth
```

**Browser:** `http://localhost:5000/api/health`

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

## Ano na ang tapos (Phase 1)

- [x] `database/schema.sql` — 18 tables
- [x] `database/seed.sql` — subjects, students, settings
- [x] `server/` — Auth API (login, users, approve/reject)
- [x] `npm run test:auth` — 23 tests
- [ ] Grades, attendance, announcements, etc.
- [ ] React web
- [ ] Expo mobile

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
- **Cursor** — main tool (may README, may chat history, may agent na alam ang buong setup)
- **Claude Code** — optional kung gusto mo ng second opinion sa terminal; i-share mo manually ang `README.md` o `docs/SYSTEM_ARCHITECTURE.md` para may context siya

### Para may context ang Claude Code
Kung gagamitin mo siya, sabihin o i-paste:
```
Project: Parents Portal — Captain H. Francisco Elementary School
Path: C:\Users\Win10 User\Parents_Portal
Read: README.md and docs/SYSTEM_ARCHITECTURE.md
Stack: Node.js + Express + MySQL + React + Expo
Current phase: Auth done, backend modules pending
```

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
| `POST /api/users/parents` | Teacher lang |
| `GET /api/users/parents/pending` | Admin lang |
| Approve / Reject parent | Admin lang |

Kung teacher mag-try ng admin endpoint → **`403 Access denied`**

Ito ang ginagawa ng `authenticate` + `authorize('admin')` sa `server/middleware/auth.js`.

Na-te-test na sa `npm run test:auth`:
- Teacher cannot create teacher ✓
- Teacher cannot list pending parents ✓

### Sa frontend (React web) — ⏳ Gagawin later

Kapag ginawa na ang web app, kailangan din ng **ProtectedRoute** sa React:
```
/admin/*   → admin role lang
/teacher/* → teacher role lang
/parent/*  → parent role lang
```
Kung teacher pumunta sa `/admin` → redirect sa unauthorized o sariling dashboard.

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

### ✅ Safe i-push

| File | Notes |
|------|-------|
| `server/.env.example` | Template lang — walang real password |
| `database/schema.sql` | Structure lang, walang password |
| `database/seed.sql` | Sample data — test passwords lang |
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

Oo, safe — yung `Admin@2026`, `Teacher@2026` sa seed ay **test/demo passwords** lang para sa local dev. Sa production, ibang password dapat gamitin at hindi na i-seed ang defaults.

---

## Changelog (notes file)

| Date | Update |
|------|--------|
| Aug 12, 2026 | Added protected routes explanation + GitHub security + `.gitignore` |
| Aug 12, 2026 | Created SETUP_NOTES.md — chat summary, Claude Code FAQ |
| Aug 12, 2026 | Phase 1 complete — database + auth |
