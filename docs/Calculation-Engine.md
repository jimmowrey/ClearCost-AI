# Calculation Engine

> Status: placeholder. Structure only — expand in the documentation sprint.

## Purpose

Defines the financial arithmetic and reconciliation logic.

## Integer-cent arithmetic (requirement)

- All financial math is performed in integer cents internally.
- Dollars are used only for presentation.
- Floating-point currency values are never compared directly.
- Rounding to cents is deterministic (round-half-up) at defined boundaries.

## Reconciliation

Implemented in `js/reconciliation-readiness.js`.

- Compares the extracted fee total against the statement's printed fee total
  in integer cents.
- A default tolerance applies; larger tolerances require explicit provenance
  (reason, rule id, supporting evidence) or are rejected explicitly.
- Dimension statuses (fee / volume / transaction count) roll up to an overall
  reconciliation status. Proposals are gated on reconciliation.

### Reconciliation-eligible total

Some extracted fee candidates are duplicates of the statement fee section and
must not be counted twice. The reconciliation-eligible total excludes those
rows (e.g. `commerce_control_interchange_table_row`) while preserving all fee
candidates elsewhere. See `DECISIONS.md` (2026-07-20).

<!-- TODO: document the exclusion configuration once migrated into rule packs. -->

## Formulas & derived metrics

<!-- TODO: document effective rate, cost basis, and other derived calculations. -->

## Open questions

<!-- TODO -->
