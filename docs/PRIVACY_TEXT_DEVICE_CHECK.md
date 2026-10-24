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

## §5 — result

Not yet run.
