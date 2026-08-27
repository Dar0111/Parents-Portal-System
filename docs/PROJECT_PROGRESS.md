# CAPSTONE — Parent's Portal System
**Captain H. Francisco Elementary School (Gr 1–6)**  
**Deadline:** September 7, 2026

> **Build order:** Database → Auth → Backend APIs → React Web → Expo  
> Percentages below include **backend + frontend + mobile** combined.

---

## Milestone tracker

| Milestone | Approx. overall progress | Backend | Web | Mobile |
|-----------|-------------------------|---------|-----|--------|
| **Current state** | **~18%** | partial | ❌ | ❌ |
| Phase 0 — docs, schema, seed, setup | ~20% | — | — | — |
| Auth + User Management **API** *(login, JWT, approve/reject)* | ~22% | ✅ | ❌ | ❌ |
| Student Records + Enrolled List **API** | ~28% | ❌ | ❌ | ❌ |
| Grades **API** *(Q1–Q4, components, DepEd weights)* | ~34% | ❌ | ❌ | ❌ |
| Attendance **API** *(per day, per subject)* | ~40% | ❌ | ❌ | ❌ |
| Announcements + Events + Memos **API** | ~46% | ❌ | ❌ | ❌ |
| Messages **API** + Socket.io | ~52% | ❌ | ❌ | ❌ |
| Contributions **API** | ~56% | ❌ | ❌ | ❌ |
| Excuse Letters **API** | ~60% | ❌ | ❌ | ❌ |
| Admin **API** *(Manage User, Settings, Backup/Restore)* | ~65% | ❌ | ❌ | ❌ |
| **All backend APIs complete** | **~65%** | | | |
| React Web — Login + protected routes `(/admin /teacher /parent)` | ~72% | — | ❌ | — |
| React Web — Parent pages *(grades, attendance, etc.)* | ~78% | — | ❌ | — |
| React Web — Teacher + Admin pages | ~85% | — | ❌ | — |
| **React Web complete** | **~85%** | | | |
| Expo / React Native *(all roles + push notifications)* | ~95% | — | — | ❌ |
| Full integration, testing, demo polish | **100%** | | | |

---

## Work split (para accurate ang %)

| Layer | % ng buong project | Status ngayon |
|-------|-------------------|---------------|
| Planning + Database | ~10% | ✅ Done |
| Backend APIs (lahat ng modules) | ~55% | ~4% done *(auth lang)* |
| React Web (lahat ng pages + protected routes) | ~20% | ❌ Wala pa |
| Expo Mobile | ~10% | ❌ Wala pa |
| Testing + demo polish | ~5% | ❌ Wala pa |

**~18% overall** = Planning (10%) + Auth API (~4% ng backend slice) + tests/docs

---

## Auth — honest breakdown

| Part | Status |
|------|--------|
| Auth **backend** API *(login, JWT, roles, approve/reject)* | ✅ Done |
| Auth **web** *(login page, `/admin` `/teacher` `/parent` protected routes)* | ❌ Not started |
| Auth **mobile** *(Expo login screen)* | ❌ Not started |

Kaya "phase pa ng auth" kung frontend URLs ang tinutukoy — **tama**.

---

## Current module status (Aug 13, 2026)

| Module | Backend | Web | Mobile |
|--------|---------|-----|--------|
| Planning & Architecture | ✅ | — | — |
| Database (schema + seed) | ✅ | — | — |
| Auth + User Management | ✅ | ❌ | ❌ |
| Student Records | ❌ | ❌ | ❌ |
| Grades | ❌ | ❌ | ❌ |
| Attendance | ❌ | ❌ | ❌ |
| Announcements / Events / Memos | ❌ | ❌ | ❌ |
| Messages | ❌ | ❌ | ❌ |
| Contributions | ❌ | ❌ | ❌ |
| Excuse Letters | ❌ | ❌ | ❌ |
| Admin (Settings, Backup) | ❌ | ❌ | ❌ |

**Next up:** Student Records API (backend), then Grades API. Web comes after all backend APIs.

---

## Excluded (not in scope)

QR attendance · online payment · enrollment/transcript · schedule grid · college grading
