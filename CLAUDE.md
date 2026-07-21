# CLAUDE.md — ClearCost AI Development Charter

You are contributing to ClearCost AI.

**Accuracy is more important than speed.**

- Never fabricate merchant data.
- Never fabricate reconciliation.
- Never suppress data simply to make reconciliation pass.

---

## Core Principles

1. Preserve every extracted fee candidate.
2. Unknown fees must remain visible.
3. Unknown processors fall back to the Generic Processor.
4. Merchant reports never expose residual calculations.
5. Agent reports include complete audit details.
6. Every financial calculation uses integer-cent arithmetic.
7. Every bug fix requires a regression test.
8. Never modify unrelated code.
9. Keep commits narrowly scoped.
10. Never modify the `main` branch without explicit approval.

---

## Statement Pipeline

```
Validation
  ↓
Processor Detection
  ↓
Document Mapping
  ↓
Fee Extraction
  ↓
Fee Classification
  ↓
Merchant Metrics
  ↓
Reconciliation
  ↓
Proposal Engine
```

See `docs/Architecture.md` for the stage-by-stage reference.

---

## Scope Control Policy

- Do exactly what the task asks — no more, no less.
- Do not modify unrelated code, files, or configuration.
- Do not opportunistically refactor while fixing a bug.
- If a change grows beyond the stated scope, stop and confirm before proceeding.
- Architectural improvements discovered mid-task are recorded (e.g. in
  `DECISIONS.md` as a deferred follow-up), not implemented inline.

## Branch Policy

- Never commit directly to `main`. `main` is modified only with explicit approval.
- One branch per logical unit of work.
  - Bug fixes: `fix/<slug>` or the designated working branch.
  - Features / architecture: `feature/<slug>`.
  - Documentation / infrastructure: `feature/<slug>` scoped to docs only.
- Bug fixes and architectural enhancements live on **separate** branches.
- Verify the current branch (`git branch --show-current`) before making changes.

## Commit Policy

- One logical change per commit.
- Commit messages explain **why**, **what changed**, **affected processors**,
  and **regression coverage**.
- Documentation-only commits contain no code or behavior changes.
- Do not mix refactors, features, and fixes in one commit.
- Do not commit unless the current branch is correct and the working tree
  reflects only the intended change.

## Regression Policy

Every defect fix requires:

- a regression test reproducing the defect,
- a negative test proving the fix is load-bearing, and
- verification that unaffected processors behave exactly as before.

Tests must be deterministic and run without network access. See
`docs/Regression-Library.md`.

## Definition of Done

A change is Done only when all of the following hold:

- [ ] Tests pass (new regression tests included).
- [ ] No unrelated files modified.
- [ ] Current branch is correct; `main` untouched (unless explicitly approved).
- [ ] Reconciliation is reproducible.
- [ ] Financial calculations use integer-cent arithmetic.
- [ ] Every fee candidate is preserved; unknown fees remain visible.
- [ ] Commit is narrowly scoped with a complete message.
- [ ] Any deferred follow-up is recorded (e.g. in `DECISIONS.md`).

---

## Integer-Cent Arithmetic Requirement

- Use integer cents for all financial math internally.
- Convert to dollars only for presentation.
- Never compare floating-point currency values.
- Round to cents deterministically (round-half-up) at defined boundaries.

## Unknown Fee Policy

- Unknown fees are never discarded.
- Unknown fees remain visible in agent/audit views and in the unknown-fee queue.
- Unknown fees are surfaced for review, not silently classified or hidden.

## Unknown Processor Fallback Policy

- When no processor rule pack matches with sufficient confidence, fall back to
  the **Generic Processor** rule pack.
- Fallback is explicit: the result records `fallback: true`, the strongest
  candidate, and the reason. ClearCost AI has no silent failures.

## Rule Pack Architecture Guidance

- Never hardcode processor-specific behavior in application code when it can
  live in a Rule Pack.
- Processor-specific configuration belongs in `processors/<id>/` rule packs
  (`manifest`, `layout`, `sections`, `aliases`, `fees`, `behaviors`).
- Shared/global configuration belongs in the `common` rule pack.
- Rule packs are loaded through the Rule Pack loader; do not read pack files
  directly from application code.
- See `docs/Processor-Library.md` for the rule pack schema reference.

## Architectural Enhancements vs. Bug Fixes

- Architectural enhancements must be proposed **separately** from bug fixes and
  are not implemented inline unless the reviewer has **explicitly approved** it.
- A bug fix may note an architectural follow-up (in `DECISIONS.md`) but must not
  perform the migration in the same branch/commit.

---

## Proposal Rules

- Never exaggerate savings.
- Never hide unknown fees.
- If the merchant already has the better deal, say so.

See `docs/Proposal-Engine.md`.

---

## Coding Style

- Prefer clarity over cleverness.
- Small functions; pure calculations; deterministic outputs.
- No hidden side effects.
- Document assumptions.
