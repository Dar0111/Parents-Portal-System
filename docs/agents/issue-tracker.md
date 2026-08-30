# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

Chosen deliberately over GitHub Issues. This repo *does* have a GitHub remote
(`Dar0111/Parents-Portal-System`), which is what the setup skill defaults to,
but this is a solo capstone with no issues board in use — work is tracked in
`CLAUDE.md`'s **BUILD ORDER** and **OPEN QUESTIONS** sections.

## Status: nothing reads this file yet

None of the three installed skills (`diagnosing-bugs`, `tdd`, `handoff`) touch
an issue tracker. The skills that do — `to-tickets`, `to-spec`, `triage`,
`wayfinder`, `implement` — were **deliberately not installed** (see
`CLAUDE.md` → "Installed agent skills"). This file records the answer so the
question doesn't get re-asked; it becomes live only if one of those skills is
ever installed.

`.scratch/` does not exist yet and should not be created until something
actually needs it.

## Conventions (if it ever becomes live)

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a
  single combined tickets file
- Comments and conversation history append to the bottom of the file under a
  `## Comments` heading

Triage state is **not** recorded — `triage` is not installed and no label
vocabulary was configured, so there is no `docs/agents/triage-labels.md`.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/`, creating the directory if
needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. Darryl will normally pass the path
directly.
