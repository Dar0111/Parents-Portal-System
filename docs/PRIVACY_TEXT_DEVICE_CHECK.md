# Privacy text — device check (`feat/privacy-text`, web only)

The owner's check of D-36 on the web: the consent screen shows the owner's
draft-2 **Data Privacy Notice** and **Terms of Use**, both at **Version
draft-2**, laid out as written, at desktop width and at 390 px; one account
that has not accepted yet accepts them; Settings shows the acceptance. **The
phone check joins the D-67 phone pass** (the owner's Q2f). Rules: CLAUDE.md
§29, FRONTEND §29 and §29b, `docs/API_REFERENCE.md` → Policy. Every quoted
string below was checked against the source on this branch.

Nothing in this file is a credential. The school's office number appears in
both texts; this sheet never writes it out.

## §0 — before the check

**The order is fixed: the backup comes BEFORE the switch and the restart.**
After the restart every account — the admin included — must accept the
draft-2 documents before any other signed-in request answers it, so
`POST /api/backups` would be refused until the admin accepts.

1. Health on 5000 (200, db ok).
2. **A backup through 5000** — the pre-check dump, not a restore point
   (backup 376 stays the restore point).
3. **The marks** (read-only): `policy_acceptances` (8 rows today — the four
   staff at `draft-1`; highest id) and **#7's rows in any version (none on
   2026-10-25)**, `activity_logs`' highest id, the time.
4. **The switch** (on the owner's go): the worktree `Parents_Portal-privacy-text`
   detached; the main tree checks out `feat/privacy-text`.
5. **The owner restarts the 5000 API** (`npm start` in `server/` — the texts
   and versions are read once at startup). The web on 3000 needs nothing: no
   client file changed.
6. **From then on every account meets the consent screen once** — Principal
   Admin, Maria Santos, Ana Reyes and Lito Bautista (their `draft-1` rows no
   longer count), and the parents who never accepted. A browser tab that was
   signed in before the restart gets there on a reload. A phone that was
   signed in shows the gate's sentence on its pages until a cold boot or a
   sign-out — not part of this check.

## §1 — the consent screen at desktop width (Nino's parent, #7)

**Who:** Nino's parent, **Rosa Alcantara (#7)** — active, a confirmed email,
no forced password change, and no acceptance on record. **Not** Tala's parent.

1. `http://localhost:3000` → sign in as Nino's parent. The app opens on
   **Before you continue** (the consent screen, `/consent`) and no other page.
2. Under the heading: "Rosa Alcantara, please read the school’s Data Privacy
   Notice and Terms of Use, then accept them for yourself and for your child."
   (the name is the account's own).
3. **The first document:** the heading **Data Privacy Notice**, under it
   **Version draft-2**, then a bordered box that scrolls on its own. 📸
   - The box's first paragraph begins "Captain H. Francisco Elementary School
     – Main uses the Parent's Portal System to share each learner's grades,
     attendance and school news with their parents." — the school's name with
     its en dash, as the About page shows it.
   - No "Draft — awaiting the school's approval." line anywhere, and no title
     line repeated inside the box.
   - Every heading stands as its own short paragraph ("What we collect", "Why
     we use it", "Consent for learners", "Who can see it", "Where it is
     stored", "How we protect it", "How long we keep it", "On your device",
     "Your rights", "Contact", "Changes to this notice").
   - Every list item is its own paragraph beginning with "• " — e.g.
     "• Account details of every user: …"; no `#`, `*`, `**` or `-` markers
     anywhere, and no two items run together on one line.
   - Scroll the box to its end: the last paragraph reads "When this notice
     changes, the portal shows the new version and asks you to accept it
     before you continue."; the paragraph before "Changes to this notice"
     names the school office and its number.
4. **The second document:** **Terms of Use**, **Version draft-2**, its own box.
   📸 First paragraph: "By using the Parent's Portal System of Captain H.
   Francisco Elementary School – Main, you agree to these terms." Headings
   "Accounts", "Acceptable use", "Records", "Availability", "Closing
   accounts", "Privacy", "Changes to these terms", "Contact"; list items as
   "• …" paragraphs; the last paragraph names the learner's adviser and the
   school office.
5. **The ticks**, below both boxes:
   - "I have read and accept the Data Privacy Notice."
   - "I have read and agree to the Terms of Use."
   - "As the parent or legal guardian of Nino, I consent, on my child’s behalf,
     to the processing of my child’s personal data for the purposes in the
     notice."
   - **I agree and continue** stays disabled until all three are ticked.
   - Under the card: "Declining ends portal use only; your child’s school
     records stay as they are." and **Sign out**.
   **Do not tick yet** — §2 first.

## §2 — the same screen at 390 px

1. Chrome DevTools → the device toolbar → width **390** (or a window that
   narrow), then reload the page.
2. The page never scrolls sideways; each box keeps its border inside the
   screen and scrolls up and down on its own; the paragraphs wrap — no word
   or number runs past the box's edge. 📸 of each box.
3. The headings, "Version draft-2", the "• " paragraphs and the three ticks
   read as at desktop width.
4. Back to desktop width.

## §3 — accept, then Settings

1. Tick all three → **I agree and continue** → the parent's home (the
   Dashboard). No other step follows: the email is already confirmed.
2. Settings → **Security & policy**: "The school's Data Privacy Notice and
   Terms of Use, and when you accepted each." Under **Data Privacy Notice**:
   "Version draft-2 · Accepted on <today, in words>"; the same under **Terms of
   Use**; both boxes hold the same draft-2 texts as in §1. 📸
3. Sign out.

## §4 — the owner's admin acceptance, then the cleanup

1. **The owner signs in as Principal Admin** and accepts the two documents on
   the consent screen (two ticks: the first two of §1 — no child tick — above
   "Declining ends portal use only.") → the admin's Dashboard, no other step
   follows (a confirmed email, no forced password change). **This acceptance
   is the owner's and is kept**; it is also what lets the cleanup's backup
   through.
2. **The cleanup:** health; **a backup through 5000** (the pre-cleanup dump);
   a read-only survey against §0's marks; **#7's two new `policy_acceptances`
   rows (the notice and the terms, both `draft-2`) deleted by id** in one
   transaction, so Nino's parent is back at §0's mark (none); the admin's two new rows
   and every `activity_logs` row kept (`accept_policy` for #7 and the admin,
   and the sign-ins).

## §5 — result: PASSED (2026-10-25)

- **§0 (as run, 06:01).** Health 200; **backup 388** (201, 2,862,241 bytes,
  footer present — the pre-check dump, taken before the switch); the marks:
  `policy_acceptances` 8 (accounts #1, #2, #5 and #6, both documents, all
  `draft-1`; highest id 796), **#7 none**, `activity_logs` highest id 31819,
  `auth_codes` 0, `login_attempts` 21. The switch: the worktree detached at
  `a613e1a`, the main tree on `feat/privacy-text` at `a613e1a`, both clean; the
  owner restarted the 5000 API.
- **§1–§2 — PASSED.** Nino's parent saw both documents at desktop width and at
  390 px exactly as listed: **Version draft-2** under each title, the headings
  as their own paragraphs, the "• " paragraphs, no markers, the first and last
  paragraphs, the three ticks with the button disabled until all three.
- **§3 — PASSED.** Accepted; Settings → Security & policy: "Version draft-2 ·
  Accepted on 25 October 2026" for both documents.
- **§4.1 — PASSED.** Principal Admin saw two ticks only, accepted (kept), and
  landed on the admin Dashboard.
- **§4.2 — the cleanup.** Health 200; **backup 389** (201, 2,863,216 bytes,
  footer present — the pre-cleanup dump). Deleted by id, each in one
  transaction: #7's two acceptance rows (#2015 the notice, #2016 the terms,
  both `draft-2`) — #7 back at §0's mark, none — and #7's one consumed
  confirmation code (#536). Kept: the admin's two `draft-2` rows (#2017,
  #2018) and every `activity_logs` row (#7's sign-in, `accept_policy`,
  `update_contact`, `contact_verification_requested`, `contact_verified`; the
  admin's sign-ins, `accept_policy` and `create_backup`). The survey after:
  `policy_acceptances` 10 (the eight `draft-1` rows and the admin's two),
  `auth_codes` 0, every other count at its mark.
- **Finding — the contact step (not the texts).** §3's "no other step
  follows" was wrong on the day: after accepting, #7 met **Confirm your
  contact**, because its email confirmation — and #3's — had been cleared
  during this branch's gate (the suites and the smoke, 04:52–05:06; #3's row
  last written at 05:06:21, by the smoke's teardown). The owner confirmed a
  mobile number there (#7 now has a confirmed number and no confirmed email;
  kept). **#3 (Marwin's parent) has no confirmed contact** and will meet the
  contact step at the next sign-in. The cause is not yet traced
  (`docs/KNOWN_ISSUES.md`).
