# Parent's Portal System

**Captain H. Francisco Elementary School (Grades 1–6)**

Web + mobile portal para sa parents, teachers, at admin (principal).  
**Deadline:** September 7, 2026

> **Note sa developer:** I-update ang **Changelog** section sa baba tuwing may bagong module o endpoint na idadagdag.

---

## Ano na ang tapos?

| Module | Status |
|--------|--------|
| Database schema (`database/schema.sql`) | ✅ Done |
| Seed data (`database/seed.sql`) | ✅ Done |
| Auth API (login, password, user management) | ✅ Done |
| Auth tests (`npm run test:auth`) | ✅ Done |
| Web frontend (React) | ⏳ Pending |
| Mobile app (Expo) | ⏳ Pending |
| Grades, Attendance, Announcements, etc. | ⏳ Pending |

---

## Kailangan mo bago mag-run

1. **Node.js** — [https://nodejs.org](https://nodejs.org) (LTS version)
2. **MySQL Workbench** — para sa database (`parents_portal`)
3. **CMD** o **PowerShell** — para i-run ang server at tests

---

## First-time setup (gawin once lang)

### Step 1 — I-connect ang MySQL Workbench

- Buksan ang MySQL Workbench → connect sa **localhost** (user: `root`)
- Dapat naka-on ang MySQL server mo bago mag-run ng `npm run db:setup`

### Step 2 — I-copy ang environment file

Buksan ang **CMD** o **PowerShell**: 

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
copy .env.example .env
```

Buksan ang `server\.env` at i-check ang settings:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=          # ilagay ang MySQL password mo (blank kung wala)
DB_NAME=parents_portal

JWT_SECRET=change-this-to-a-long-random-secret
PORT=5000
```

### Step 3 — Install dependencies

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm install
```

### Step 4 — Setup database (auto-create lahat)

```bash
npm run db:setup
```

Ito ang ginagawa ng command na ito:
- Drop at recreate ang database na **`parents_portal`**
- Run ang `database/schema.sql` (lahat ng tables)
- Run ang `database/seed.sql` (subjects, sample students, accounts)

**Hindi mo na kailangan i-paste manually sa MySQL Workbench ang SQL files.**

Pag successful, makikita mo sa Workbench ang database na **`parents_portal`** kasama ang tables.

---

## Paano i-run araw-araw

Kailangan ng **2 terminal windows** (CMD o PowerShell):

### Terminal 1 — Start API server

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm start
```

Dapat lumabas:

```
Parents Portal API listening on http://localhost:5000
```

> **Huwag isara ang window na ito** habang nagte-test ka.

### Terminal 2 — Test (optional)

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm run test:auth
```

---

## Paano i-test ang login

### CMD — Automated test

Sa **Terminal 2** (habang tumatakbo ang `npm start` sa Terminal 1):

```bash
cd "C:\Users\Win10 User\Parents_Portal\server"
npm run test:auth
```

Dapat: **`23 passed, 0 failed`**

### Browser — Health check

Buksan: `http://localhost:5000/api/health`

Dapat:

```json
{ "success": true, "message": "Parents Portal API is running." }
```

### MySQL Workbench — Check seed data

Sa Query tab:

```sql
USE parents_portal;
SELECT login_id, role, status, name FROM users;
```

---

## Default test accounts

| Role | Login ID | Password | Status | Notes |
|------|----------|----------|--------|-------|
| Admin | `ADMIN001` | `Admin@2026` | active | Principal |
| Teacher | `TCH-001` | `Teacher@2026` | active | Maria Santos |
| Parent | `13567454` | `Parent@2026` | active | Marwin Conde (Gr 6) |
| Parent | `1234567` | `Parent@2026` | **pending** | Jea Mae — for approval testing |

---

## Database name

```
parents_portal
```

Makikita sa MySQL Workbench under **SCHEMAS** → `parents_portal`.

Quick check sa Workbench Query tab:

```sql
USE parents_portal;
SELECT login_id, role, status, name FROM users;
SELECT lrn, first_name, last_name, grade_level FROM students;
```

---

## Project structure

```
Parents_Portal/
├── README.md                 ← ito (run guide)
├── docs/
│   └── SYSTEM_ARCHITECTURE.md   ← full system design
├── database/
│   ├── schema.sql            ← lahat ng tables
│   └── seed.sql              ← subjects, settings, sample data
└── server/
    ├── .env                  ← MySQL + JWT config (hindi i-commit)
    ├── .env.example          ← template
    ├── package.json
    ├── server.js             ← main entry point
    ├── config/
    │   └── db.js             ← MySQL connection pool
    ├── middleware/
    │   └── auth.js           ← JWT authentication
    ├── routes/
    │   ├── auth.js           ← login, me, change-password
    │   └── users.js          ← create teacher/parent, approve/reject
    ├── utils/
    │   ├── jwt.js
    │   ├── password.js
    │   └── activity.js
    └── scripts/
        ├── setup-db.js       ← npm run db:setup
        └── test-auth-flows.js ← npm run test:auth
```

---

## API endpoints (implemented)

Base URL: `http://localhost:5000`

### Public

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Check kung tumatakbo ang server |
| POST | `/api/auth/login` | `{ login_id, password }` | Login |

### Authenticated (Header: `Authorization: Bearer <token>`)

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/me` | All | Profile ng naka-login |
| PUT | `/api/auth/change-password` | All | `{ current_password, new_password }` |
| POST | `/api/users/teachers` | Admin | Create teacher (active agad) |
| POST | `/api/users/parents` | Teacher | Create parent (pending) |
| GET | `/api/users/parents/pending` | Admin | List pending parents |
| PUT | `/api/users/parents/:id/approve` | Admin | Approve parent |
| PUT | `/api/users/parents/:id/reject` | Admin | Reject parent `{ reason }` |

---

## NPM scripts

| Command | Ano ginagawa |
|---------|--------------|
| `npm install` | Install dependencies (once) |
| `npm run db:setup` | Create/reset database + seed data |
| `npm start` | Start API server (port 5000) |
| `npm run dev` | Start server with auto-restart on file change |
| `npm run test:auth` | Run lahat ng auth flow tests |

### Backup ZIP (para sa USB)

```bash
cd "C:\Users\Win10 User\Parents_Portal"
node scripts/create-backup-zip.js
```

Gagawa ng `Parents_Portal_Backup.zip` sa Desktop — tamang folder structure, walang `node_modules` at `.env`.

---

## Common errors at fix

| Error | Solusyon |
|-------|----------|
| `'npm' is not recognized` | Install Node.js, restart CMD |
| `ECONNREFUSED` | MySQL server hindi naka-on o hindi naka-connect ang Workbench |
| `Access denied for user 'root'` | Mali ang password sa `.env` |
| `EADDRINUSE :::5000` | May tumatakbo nang server — isara muna o baguhin ang `PORT` sa `.env` |
| `Table 'users' already exists` | Run ulit `npm run db:setup` (auto-drop na ang database) |
| Login returns 403 pending | Normal para sa LRN `1234567` — kailangan i-approve ng admin muna |

---

## Account flow (paalala)

```
Teacher creates parent account (LRN + password)
        ↓
   status: pending  ← hindi pa makakalogin
        ↓
Admin approves
        ↓
   status: active   ← pwede nang mag-login
```

```
Admin creates teacher account
        ↓
   status: active   ← pwede agad mag-login
```

---

## Changelog

### Aug 12, 2026 — README update

- Tinanggal ang XAMPP at Postman references — MySQL Workbench + CMD lang

### Aug 12, 2026 — Phase 1: Database + Auth

- Created `database/schema.sql` — 18 tables (users, students, grades, attendance, etc.)
- Created `database/seed.sql` — DepEd subjects G1–G6, grade weights, sample students
- Created `server/` — Express API with JWT auth
- Auth endpoints: login, profile, change password
- User management: admin creates teacher, teacher creates parent, admin approve/reject
- Test script: `npm run test:auth` (23 tests)
- Docs: `docs/SYSTEM_ARCHITECTURE.md`

---

## Susunod na gagawin

1. Backend modules: grades, attendance, announcements, messages, etc.
2. React web frontend
3. React Native Expo mobile app

---

## Useful links

- Quick notes mula sa chat: [`docs/SETUP_NOTES.md`](docs/SETUP_NOTES.md)
- Architecture details: [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md)
- Database schema: [`database/schema.sql`](database/schema.sql)
