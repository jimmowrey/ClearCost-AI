# AGENTS.md

Guidance for AI coding agents and human contributors working in this
repository. This complements `CLAUDE.md` (the development charter) — read that
first. Where the two overlap, `CLAUDE.md` is authoritative.

## Ground rules

- Accuracy over speed. Never fabricate merchant data or reconciliation.
- Preserve every extracted fee candidate; keep unknown fees visible.
- Use integer-cent arithmetic for all financial math.
- Stay within scope. Do not modify unrelated code.
- Never modify `main` without explicit approval.

## Before you start

1. Confirm the current branch: `git branch --show-current`.
2. Confirm the working tree is clean: `git status`.
3. Read the relevant `docs/` reference for the subsystem you are touching.

## Repository layout

| Path | Purpose |
|------|---------|
| `js/` | Application logic (pipeline, extraction, classification, reconciliation). |
| `processors/` | Processor rule packs (`common`, `generic`, and per-processor). |
| `tests/` | Regression tests (`*.mjs` run with Node; `*.py` where present). |
| `docs/` | Subsystem reference documentation. |
| `app/`, `css/`, `index.html` | Front-end surface. |
| `data/` | Static data assets. |

## Running tests

- Node regression tests run directly, e.g. `node tests/<name>.mjs`.
- Tests must be deterministic and must not require network access.
- A test file prints a pass line on success and throws on failure.

> **Note:** some test files in `tests/` may be known-failing on a given working
> branch while a subsystem is under active debugging. Establish the baseline
> before changing code and do not introduce new failures.

## Definition of Done

See `CLAUDE.md` → *Definition of Done*. In short: tests pass, scope respected,
branch correct, `main` untouched, reconciliation reproducible, commit narrow.

## Escalation

- If a task requires modifying `main`, an architectural change, or work beyond
  the stated scope — stop and ask.
- Record deferred architectural work in `DECISIONS.md`, not inline.
