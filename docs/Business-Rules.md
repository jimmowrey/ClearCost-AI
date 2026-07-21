# Business Rules

> Status: placeholder. Structure only — **do not invent business rules.**
> Populate only with rules that have been formally confirmed by the product
> owner. Use placeholders until then.

## How to use this document

Each rule should record: an identifier, the rule statement, its rationale,
its source/authority, and links to the code and tests that enforce it.

| Rule ID | Statement | Rationale | Source | Enforced by |
|---------|-----------|-----------|--------|-------------|
| _TBD_ | _placeholder_ | _placeholder_ | _placeholder_ | _placeholder_ |

## Data integrity (confirmed principles)

These are engineering guardrails from `CLAUDE.md`, not merchant-facing pricing
rules:

- Never fabricate merchant data or reconciliation.
- Preserve every extracted fee candidate; unknown fees remain visible.
- Never suppress data simply to make reconciliation pass.

## Pricing / fee business rules

<!-- TODO: to be documented with the product owner. Do not invent. -->

## Reconciliation business rules

<!-- TODO: tolerance policy and provenance requirements are implemented in
     js/reconciliation-readiness.js; formalize the business intent here. -->

## Proposal business rules

<!-- TODO: see docs/Proposal-Engine.md; formalize savings/eligibility rules. -->

## Open questions

<!-- TODO -->
