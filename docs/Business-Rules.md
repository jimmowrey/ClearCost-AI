# Business Rules

> Status: placeholder. Structure only — **do not invent business rules.**
> Populate only with rules that have been formally confirmed by the product
> owner. Use placeholders until then.

## How to use this document

Each rule should record: an identifier, the rule statement, its rationale,
its source/authority, and links to the code and tests that enforce it.

| Rule ID | Statement | Rationale | Source | Enforced by |
|---------|-----------|-----------|--------|-------------|
| COST-001 | Every reconciliation-eligible statement charge must be assigned to interchange, card-brand/network assessments, genuine third-party pass-through, processor-controlled revenue, or unknown/requires review. | Processor markup cannot be inferred safely from unexplained charges. | Product owner, 2026-08-01 | `js/cost-ownership.js`; `tests/cost-ownership.test.mjs` |
| COST-002 | Processor markup and savings remain not verified if any eligible fee is unknown or if the ownership buckets do not reconcile to the printed statement fee total within tolerance. | Unknown dollars must not be silently treated as processor profit or pass-through. | Product owner, 2026-08-01 | `js/cost-ownership.js`; `tests/cost-ownership.test.mjs` |
| COST-004 | Statement-reported interchange is not verified interchange. Published-rate verification requires a dated card-brand schedule match for every detail row, exact expected-cost calculation, and reconciliation to the statement-reported interchange total. | A processor label and internally correct arithmetic do not prove that the rate is genuine. | Product owner, 2026-08-01 | `js/interchange-verification.js`; `tests/interchange-verification.test.mjs` |\n| COST-005 | Processor markup and savings remain blocked until published interchange verification passes with no unmatched, ambiguous, or variant rows. | An interchange variance may contain processor markup and cannot be treated as pass-through. | Product owner, 2026-08-01 | `js/cost-ownership.js`; `tests/cost-ownership.test.mjs` |\n| COST-003 | Merchant-facing savings never expose agent wholesale costs, markup, split, commission, or residual. | Merchant data and internal agent economics must remain separate. | Product owner, confirmed project principle | Proposal layer (merchant report pending) |

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
