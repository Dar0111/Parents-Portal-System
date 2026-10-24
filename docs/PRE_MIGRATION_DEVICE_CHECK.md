# B7 device check — `chore/pre-migration`

The owner's check of B7 on the web. What it looks at is **D-102**: Nino
Alcantara's five Grade 1 rows now carry the scores behind their letters — one
Written Work column and one Performance Task column per subject and term, each
out of 20, and the three summative parts out of 20 — so every letter is
computed, and Mathematics has a Final letter (**B**) for the first time. Rules:
`docs/GRADING_SPEC.md` §6a; FRONTEND §13 (the class record) and §14 (the class
summary); B7's plan P2 and P6, with the owner's C6. **Every quoted string below
was checked against the source at `7c3f558`**; the values are the live data.

**No Save anywhere.** Nothing in this check writes except the two sign-ins.
Nothing in this file is a credential. No Tala or Tala's parent, no parent
account, and no probe row (B7's gate ran the probe five times).

## §0 — before the check (as run)

- **Where:** the laptop's Chrome at `http://localhost:3000`, a desktop-width
  window (the sidebar shows from 768px; Admin → Grades' table from 640px).
- **Who:** **Lito Bautista** (teacher — Grade 1 - Mabait's adviser, and its
  five subjects) for §1; **Principal Admin** (admin) for §2. Both are past the
  consent, contact and password steps — each signed in through the API during
  B7's gate or §0 — so neither meets a code step.
- **As run (2026-10-24, finished 12:29 PM):**
  - health 200 (db ok);
  - **backup 375** (201, 2,732,077 bytes) — the pre-check dump, not a restore
    point; 317 stays the restore point;
  - the marks: `activity_logs` highest id **30390**; `notifications` 0,
    `grades` 5, `assessment_slots` 10, `grade_components` 10, `auth_codes` 11,
    `login_attempts` 17;
  - the switch: the worktree `Parents_Portal-pre-migration` detached at
    `7c3f558`; the main tree from `main` `01495e5` to `chore/pre-migration` at
    `7c3f558`, clean; 5000 answered 200 (db ok) and 3000 answered 200 (on
    `localhost`). B7 changed only comments in the files the running API and app
    load.

**How the screen shows text.** Table headers, group headers and the sidebar's
group labels are mixed case in the code and shown in CAPITALS by the
stylesheet; this sheet quotes them as the screen shows them. **"— Pending"** is
an em dash, a space and *Pending* in small italics, muted; hovering it shows
"Not yet computable — Written Works, Performance Tasks and Examinations must
all be recorded first."

**Do not, anywhere:**

- press **Save all**, or click or type into any box on Teacher → Grades — a
  keystroke in a score, HPS or summative box starts an automatic dry run and
  arms **"Leave without saving?"** (if that happens: **Leave and discard**);
- click **WW1**, **PT1** or a **Set HPS** button (each opens the column's
  dialog);
- on Admin → Grades, click a term cell or **Lock or unlock a term**;
- click a bell row or **Mark all as read** (both write).

## §1 — Lito Bautista (teacher), web

Sign in as Lito Bautista; the app opens on the Dashboard.

### Teacher → Grades (the class record)

1. Sidebar, the **MY CLASS** group (Students, Attendance, Attendance records,
   Grades, Class summary) → **Grades**. If the sidebar is the narrow icon rail,
   **Expand sidebar** first. 📸
2. The top bar reads **Grades**. The heading reads **Class record**, and under
   it: "Record every learner’s scores for one subject and term, then save the
   whole class at once."
3. The pickers, left to right: **Subject**, **Class**, **Term**.
   - **Subject** lists, in order: Makabansa, Mathematics, GMRC, Reading and
     Literacy, Language. It opens on **Makabansa**.
   - **Class** reads **Grade 1 - Mabait**, greyed out (his only class).
   - **Term** lists Term 1, Term 2, Term 3 and opens on **Term 2** (today's
     term; the address gains `?term=2`).
4. **An untouched subject, as it reads now:** Subject **Makabansa**, Term
   **Term 1**. 📸
   - Group headers: **LEARNER | WRITTEN / ORAL WORKS · 30% | PERFORMANCE TASKS ·
     50% | SUMMATIVE · 20% | GRADE**.
   - Column headers: WW1 to WW5, each over a dashed **Set HPS** button; **WW
     TOTAL | WW PS | WW WS**; PT1 to PT3, each **Set HPS**; **PT TOTAL | PT PS |
     PT WS**; **ST1**, **ST2** and **TE**, each over an empty box; **ST PS | ST
     WS | INITIAL | LETTER**.
   - The **HIGHEST POSSIBLE** row: — — 30 under Written Work, — — 50 under
     Performance Tasks, — 20 under Summative (bare dashes).
   - **Alcantara, Nino**: the eight score boxes greyed and empty; the ST1, ST2
     and TE boxes empty and **not** greyed — do not click them; all ten
     computed cells read **— Pending** (WW TOTAL, WW PS, WW WS, PT TOTAL, PT
     PS, PT WS, ST PS, ST WS, INITIAL, LETTER).
   - Under the grid: "ST PS = ST1 30% + ST2 30% + TE 40%, each part out of its
     own highest possible score — not the three scores added together."
   - The save bar: **Save all**, greyed. No "You have unsaved changes."
5. **The five scored rows.** For each, pick its Subject and Term. Three header
   places change from step 4: **WW1** shows a box reading **20** (WW2 to WW5
   stay **Set HPS**), **PT1** shows **20** (PT2 and PT3 stay **Set HPS**), and
   ST1, ST2 and TE each show **20**. **HIGHEST POSSIBLE** reads **20 | 100.00 |
   30**, **20 | 100.00 | 50** and **100.00 | 20**. Nino's row, left to right
   (the greyed WW2–WW5 and PT2–PT3 boxes left out): 📸 Mathematics Term 1

   | Subject · Term | WW1 | WW TOTAL | WW PS | WW WS | PT1 | PT TOTAL | PT PS | PT WS | ST1 | ST2 | TE | ST PS | ST WS | INITIAL | LETTER |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
   | Mathematics · Term 1 | 19 | 19 | 95.00 | 28.50 | 19 | 19 | 95.00 | 47.50 | 18 | 19 | 19 | 93.50 | 18.70 | **94.70** | **A** |
   | Mathematics · Term 2 | 17 | 17 | 85.00 | 25.50 | 17 | 17 | 85.00 | 42.50 | 17 | 17 | 17 | 85.00 | 17.00 | **85.00** | **B** |
   | Mathematics · Term 3 | 16 | 16 | 80.00 | 24.00 | 15 | 15 | 75.00 | 37.50 | 16 | 16 | 16 | 80.00 | 16.00 | **77.50** | **C** |
   | Reading and Literacy · Term 1 | 14 | 14 | 70.00 | 21.00 | 14 | 14 | 70.00 | 35.00 | 14 | 14 | 14 | 70.00 | 14.00 | **70.00** | **D** |
   | Reading and Literacy · Term 2 | 12 | 12 | 60.00 | 18.00 | 12 | 12 | 60.00 | 30.00 | 12 | 12 | 12 | 60.00 | 12.00 | **60.00** | **E** |

   The scores are whole numbers in boxes, the totals plain whole numbers, every
   PS, WS and INITIAL two decimals, and the letter stands alone — no word after
   it on this page. This page has no Final column.
6. **Reading and Literacy, Term 3** (no columns and no row yet): reads exactly
   as step 4 — every column **Set HPS**, HIGHEST POSSIBLE — — 30 / — — 50 / —
   20, the ST1, ST2 and TE boxes empty, Nino's ten computed cells **— Pending**,
   **Save all** greyed. 📸

### Teacher → Class summary

7. Sidebar, **MY CLASS** → **Class summary**. The top bar reads **Class
   summary**; the heading **Summary of Grades**, and under it "Every learner in
   your advisory section, across every learning area." 📸
8. No Class picker — the card names the class: **Grade 1 - Mabait · Adviser:
   Lito Bautista** (the adviser part appears once the sheet loads, and leaves
   for a moment at each term change). **Term** lists Term 1, Term 2, Term 3,
   Final and opens on **Term 2**.
9. The headers: **LEARNER | MAKABANSA | MATHEMATICS | GMRC | READING AND
   LITERACY | LANGUAGE | CONFIRMED** — under each subject a small line,
   **Complete** or **1 pending**; under CONFIRMED, **0 of 1 learner**. No
   Average column (Grade 1). The row's name is the link **Alcantara, Nino**.
   Letters here stand alone, with no word. In brackets, the small line under
   that subject's header:

   | Term | MAKABANSA | MATHEMATICS | GMRC | READING AND LITERACY | LANGUAGE | CONFIRMED |
   |---|---|---|---|---|---|---|
   | Term 1 | — Pending (1 pending) | A (Complete) | — Pending (1 pending) | D (Complete) | — Pending (1 pending) | — |
   | Term 2 | — Pending (1 pending) | B (Complete) | — Pending (1 pending) | E (Complete) | — Pending (1 pending) | — |
   | Term 3 | — Pending (1 pending) | C (Complete) | — Pending (1 pending) | — Pending (1 pending) | — Pending (1 pending) | — |
   | Final | — Pending | **B** | — Pending | — Pending | — Pending | (no column) |

   The CONFIRMED dash means the term is not locked. **The Mathematics Final is
   B:** the server averages the three Initial grades (94.70, 85.00 and 77.50 →
   85.73) and bands the result; 85.73 itself is shown on no page. On Final there
   are no small lines and no CONFIRMED column. 📸 Final
10. Under the sheet: "Read-only. Grades are encoded by each subject's teacher
    under Grades."

### Nino's report card (the drill-through)

11. Click **Alcantara, Nino**. The top bar reads **Nino Alcantara**; above the
    card, **Back to class summary** and "Report card, read-only." 📸
12. The title band: **Learner’s Performance Report**, the school's name (as
    set in Settings), **School year 2026-2027**; opposite it, the badge **Term 3
    partly recorded (1 of 5)**. The info row: **LEARNER** Nino Alcantara ·
    **GRADE & SECTION** Grade 1 - Mabait · **ADVISER** Lito Bautista (it may read
    "Not yet assigned" for a moment first).
13. The table; each letter carries its word, smaller and muted:

    | LEARNING AREA | TERM 1 | TERM 2 | TERM 3 | FINAL LETTER |
    |---|---|---|---|---|
    | Makabansa | — Pending | — Pending | — Pending | — Pending |
    | Mathematics | A Advancing | B Benchmarking | C Connecting | **B Benchmarking** |
    | GMRC | — Pending | — Pending | — Pending | — Pending |
    | Reading and Literacy | D Developing | E Emerging | — Pending | — Pending |
    | Language | — Pending | — Pending | — Pending | — Pending |

    No General average row, no "Term N grades are final." block, and no grade
    is a button here.
14. Under it, **PERFORMANCE DESCRIPTORS**: A Advancing, B Benchmarking, C
    Connecting, D Developing, E Emerging. Then **READING THIS REPORT**, four
    lines:
    - "This grade level uses descriptive grading (A to E)."
    - "A term shows "Pending" until its letter can be worked out — written
      works, performance tasks and all three summative scores must be recorded
      first."
    - "The final letter for a learning area is worked out from the scores of
      all three terms, so it appears once every term has its scores recorded."
    - "There is no general average for this grade level."

    **No "Select any grade to see the scores behind it."** — nothing opens on
    this read-only card, so the line is not shown here (finding #1, §4; it
    stays on Parent → Grades, where a grade opens its scores).
15. **Back to class summary** returns on Term 2 (today's term), not the term
    last picked. Sign out.

## §2 — Principal Admin (admin), web

Sign in as Principal Admin.

1. Sidebar, the **MANAGE** group (Users, Students, Grades, Attendance) →
   **Grades**. The top bar reads **Grades**; the heading **Report card**, with
   the button **Lock or unlock a term** beside it — **do not press it**. Before
   a pick, the frame reads **Pick a student to see their report card** and
   "Choose a grade, then a section, then a student." 📸
2. **Grade** → **Grade 1**; **Section** → **Mabait**; **Student** →
   **Alcantara, Nino**. Each acts on change; there is no Apply.
3. The header card: the initials **NA**, **Nino Alcantara**, and "Grade 1 ·
   Mabait · School year 2026-2027". Above the table: "Select a term grade to
   lock or unlock it. A term with nothing recorded has no grade to lock." —
   **do not click a term cell.**
4. The table: 📸

   | SUBJECT | TERM 1 | TERM 2 | TERM 3 | FINAL GRADE |
   |---|---|---|---|---|
   | Makabansa | — Pending | — Pending | — Pending | — Pending |
   | Mathematics | A Advancing | B Benchmarking | C Connecting | **B Benchmarking** |
   | GMRC | — Pending | — Pending | — Pending | — Pending |
   | Reading and Literacy | D Developing | E Emerging | — Pending | — Pending |
   | Language | — Pending | — Pending | — Pending | — Pending |

   No lock icon on any cell (all five rows are unlocked). The admin's card shows
   no Initial grade, no scores and no 85.73 — the decimals are §1's.
5. Under the table: "*Pending* — not yet computable; all components must be
   recorded first." and "*N/A* — not applicable; this grade level uses
   descriptive grading (A–E)." (The N/A sentence is on every descriptive card,
   though no cell here reads N/A.) No General Average card.
6. If a term cell is clicked by accident: a dialog titled with its subject and
   term (e.g. **Mathematics · Term 1**) showing **Unlocked** — leave by
   **Close**, the X or Escape; never **Lock grade**. Sign out.

Admin → Students → Nino is not a way to his grades: that page has none, and it
shows the LRN. Skip it.

## §3 — cleanup

**None expected.** Each sign-in writes one `login` row to `activity_logs`
(above id 30390), and those rows are kept; signing out writes nothing. After the
check, a read-only survey: every count at §0's marks — `notifications` 0,
`grades` 5, `assessment_slots` 10, `grade_components` 10, `auth_codes` 11,
`login_attempts` 17. A mistyped password adds a `login_failed` row and a
`login_attempts` row; that is reported, not cleaned up, unless the owner says.
A box typed into by accident on Teacher → Grades stores nothing: its dry run is
rolled back by the server, and **Leave and discard** drops the draft.

## §4 — result

**§1 and §2 PASSED on the web (2026-10-24, the owner):** every value, letter,
Pending cell and string matched this sheet, the Mathematics Final B included.

**Finding #1 (the owner: "Go") — fixed; re-check on the web.** On the
teacher's read-only report card (step 14), "Reading this report" ended with
"Select any grade to see the scores behind it." while no grade opens anything
there — copy that claims behaviour the page does not have (§5i). The survey:

| Where | Role | A grade opens its scores? | The line |
|---|---|---|---|
| Parent → Grades, web | parent | yes (the breakdown) | shows — true |
| Class summary → a learner, web | teacher | no | **showed — false; now gone** |
| Parent → Grades, phone | parent | yes | "Tap any grade…" — true |
| Class summary → a learner, phone | teacher | no | never shown (the gate already required the handler) |
| Admin → Grades, web and phone | admin | its cells open the lock dialog | not rendered (no report card) |

The web gate (`ReportCard.jsx`'s `canOpen`) checked only for a grade row; the
cells open only when the page passes `onOpenTerm`, which only Parent → Grades
does, and the phone's gate already required it (`ReportCardView.jsx:245`). The
web gate now requires the handler too; no other copy changed. Proofs:
`ssr-ui-c2` 44/44 (its two reader cases failed against the unfixed card,
42/44) and `proof:report-card` 22/22. **Re-check:** step 14 — four lines, no
"Select any grade"; and Parent → Grades still ends with it.

Still to come: the survey after the check (§3) and, last (C1), the new restore
point — "backup N (`parents_portal_…sql`, after B7's demo data; 317 the
previous one)".
