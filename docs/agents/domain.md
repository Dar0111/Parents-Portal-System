# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

## Before exploring, read this

- **`CLAUDE.md`** at the repo root. **This repo has no `CONTEXT.md`, deliberately.**

`diagnosing-bugs` and `tdd` both say "read `CONTEXT.md` (if it exists)". In this
repo that file is `CLAUDE.md` — it holds the domain vocabulary (roles, scoping
rules, the auth pattern), the locked decisions, the blocked modules, and the
CHANGELOG. A second context document was considered and rejected: `CLAUDE.md`
already carries a written warning about `PROJECT_PROGRESS.md` drifting out of
sync with the code, and a third document to keep in sync would reintroduce
exactly that problem.

So: wherever a skill says `CONTEXT.md`, read `CLAUDE.md`.

- **`docs/adr/`**: does not exist yet. Architectural decisions currently live in
  `CLAUDE.md`'s **LOCKED DECISIONS** and **CHANGELOG** sections. If any skill
  ever proposes creating `docs/adr/`, that is a decision for Darryl, not a
  default — it is another sync surface.

If a file named here doesn't exist, **proceed silently**. Don't flag its absence
and don't suggest creating it.

## Use the project's vocabulary

When your output names a domain concept (a hypothesis, a test name, an endpoint,
a column), use the term as `CLAUDE.md` and `database/schema.sql` define it. Don't
drift to synonyms.

Specifically: a parent's identity is their child's **LRN** used as `login_id`;
teacher reach is defined by `teacher_assignments` on `subject_id` +
`grade_level` + `section`; message eligibility is `canMessage()`. If the concept
you need isn't in `CLAUDE.md` or the schema, that's a signal you may be inventing
language the project doesn't use.

## Flag conflicts with locked decisions

`CLAUDE.md` has a **LOCKED DECISIONS — do not re-litigate** section and a
**BLOCKED — do not build until answered** section. If your output contradicts
either, surface it explicitly rather than silently overriding:

> _Contradicts the locked one-account-per-student decision, but worth reopening
> because…_
