# AGENTS.md — Parent's Portal System (context for coding agents)

Read this first, then `CLAUDE.md`. Written 2026-10-27 by the planning chat (Claude) for Codex, Grok or any coding agent working in this repo.

## 1. The project

- Parent's Portal System for Captain H. Francisco Elementary School – Main (Grades 1–6), Pateros. BSIT capstone, Pateros Technological College.
- Darryl Candilada is the sole developer and the owner: every decision is his. A coding agent executes and validates; a separate planning chat writes the plans and reviews the reports, which the owner carries between them.
- Repo: `Dar0111/Parents-Portal-System`. This docs pass starts from `main` `8a90789`.
- Stack: Node.js + Express + JWT + bcrypt + Socket.io (`server/`); React + Vite + Tailwind + Font Awesome (`client/`); React Native with Expo SDK 57, run in Expo Go on an Android phone (`mobile/`).
- Database: PostgreSQL on Supabase (Singapore) since 2026-10-27, schema `portal` (26 tables, RLS on all 26). MySQL is kept on the laptop but disconnected (service stopped, set to Manual).
- Roles: admin (the principal), teacher, parent. A parent's login ID is the child's LRN.

## 2. Sources of truth

1. The code beats the docs.
2. `CLAUDE.md` is the main reference. This docs pass is the commit that brings its living sentences onto PostgreSQL. Where a living sentence still names MySQL, `migration/docs/` remains the detail (especially `09_INTEGRATION_ACCEPTANCE.md` §8 and `07_CUTOVER_ROLLBACK.md`).
3. Never invent file paths, columns, endpoints or env keys: survey read-only and cite what you find.

## 3. How work is done here

- PLAN ONLY → the owner reviews → "PLAN APPROVED" → build → gate (tests) → commit → push → `git log --oneline -1` → STOP → the owner checks in the browser and on the phone → findings in ONE fix round → one re-check → cleanup by id (backup first) → docs → merge ONLY when the owner says "merge".
- Each task comes with a whitelist of files. Anything outside it: STOP and report "SCOPE EXPANSION".
- At every STOP, report what you ran and each result against its expected value, then the owner's next actions as numbered rows: one action per row, with the exact folder and one command.
- End every report with `Shell content writes: N`. It must be 0: never write file contents through shell echo, redirects or here-strings; use the editor or a script.
- One command per step. No pipes or redirects in commands the owner must run.
- No push, merge, reset, clean, branch deletion or worktree removal without the owner's explicit go.

## 4. Safety rules (non-negotiable)

- Never print or paste LRNs, login IDs, passwords, codes, tokens, connection strings, the Supabase host or project ref, the VPS's IP address, or any `.env` content. Mask outputs from the first line.
- Never open or print `server/.env`, `server/.env.mysql.local`, or anything in `Parents_Portal-migration-data/secrets/` (`supabase.env`, the CA file). If a key must be checked, count key names only.
- Secrets never go into git. `.env` and `.env.*.local` are git-ignored; keep it that way.
- Never select `activity_logs.description`.
- Tests and fixtures run only against loopback databases: the embedded PostgreSQL cluster on port 54329 (`migration/scripts/pg-local.js`). The one exception is the scoped browser smoke. Both `node scripts/staging-api.js --smoke` and `--smoke-live`, run in `migration/`, set `PORTAL_FIXTURE_HOSTED=staging-smoke` only in the child process. That exception is not permission to test production.
- Forward-fix on PostgreSQL. The rollback paths are in `migration/docs/07_CUTOVER_ROLLBACK.md`: the tag `mysql-fallback-64200f7`, `server/.env.mysql.local`, and MySQL backup 390.

## 5. Runtime configuration (key names only)

- `server/.env` holds:
  - `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER` (`portal_app.<ref>`), `PG_PASSWORD`, `PG_MIGRATE_USER` (`portal_migrate.<ref>`), `PG_MIGRATE_PASSWORD`, `PG_SSL=verify-full`, `PG_CA_FILE` (absolute path to the CA file). `server/config/db.js` reads these nine.
  - `JWT_SECRET` (`JWT_EXPIRES_IN` is optional; the code defaults to 24h), `PORT=5000`, `NODE_ENV`, `CORS_ORIGIN`.
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (Gmail). `MAIL_TRANSPORT` absent means real SMTP (`server/utils/mailer.js`).
  - `SMS_TRANSPORT=gateway`, `SMS_GATEWAY_URL`, `SMS_GATEWAY_USER`, `SMS_GATEWAY_PASS`: SMSGate Cloud, with the owner's phone as the sender. Each of the three keys appears once. `server/scripts/dedupe-env-duplicates.js` is the script that removed the earlier duplicates. Effective values were unchanged.
  - `SMS_ENCRYPTION_PASSPHRASE`.
- `mobile/.env` holds `EXPO_PUBLIC_API_URL`. The web's `VITE_API_BASE_URL` is left blank.
- Local ports:
  - API 5000: `npm start` in `server/`, never `--watch`.
  - Web 3000: `npm run dev` in `client/`.
  - Expo 8081: `npx expo start --clear` in `mobile/`.
- Health: `GET /api/health` answers `db ok`.

## 6. What is still ahead

1. **npm audit** for `server/`, `client/` and `mobile/`. Before Friday, patch-level fixes only. Do not treat a count from before this docs pass as current.
2. **Review the committed deployment files** in `deploy/` and write the Friday hosting run sheet.
3. **Friday 2026-10-30, 8 AM–5 PM:** Hostinger VPS and domain purchase, HTTPS deployment, P4 Part A, the admin password changed through the app, the D-122 activity-log reset after the hosting checks and a backup, a new restore-point backup (`docs/ACTIVITY_RESET.md`), the laptop API shut down, then the professor's system check. The server and the web must be hosted (Hostinger VPS, Ubuntu 24.04, the owner's domain and HTTPS). SMSGate Cloud stays, with the owner's phone as the sender. Demo accounts only. A group that is not ready gets INCOMPLETE.
4. **After Friday:** P4 Part B against an isolated local PostgreSQL, then one consolidated engineering report for Josh. Do not declare P4 done after Part A. Approved manuscript work and data gathering, and defense preparation. The final defense is 2026-11-11 through 2026-11-13.
5. **Learner transfer** is off the list (D-230, 2026-11-04); it no longer waits on the professor (D-160).
