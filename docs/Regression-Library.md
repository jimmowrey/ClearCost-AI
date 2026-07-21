# Regression Library

> Status: placeholder. Structure only — expand in the documentation sprint.

## Purpose

Catalog of regression tests and the defects they lock down.

## Policy

Every defect fix requires:

- a regression test reproducing the defect,
- a negative test proving the fix is load-bearing, and
- verification that unaffected processors behave exactly as before.

Tests are deterministic and require no network access.

## Test index

| Test file | Covers | Related decision |
|-----------|--------|------------------|
| `tests/test_commerce_control_reconciliation.mjs` | Commerce Control reconciliation-eligible total; $909.75 reconciliation | `DECISIONS.md` 2026-07-20 |
| `tests/test_processor_intelligence_commerce_control.mjs` | Commerce Control rule pack detection; evidence-based, threshold not weakened | Sprint 5.3 |
| `tests/test_processor_intelligence_engine.mjs` | Candidate ranking, evidence explainability, runner-ups, unknown-processor evidence, rule pack health, deterministic ordering | Sprint 5.4 |
| `tests/test_reconciliation_readiness.mjs` | Reconciliation status, tolerance, integer cents | — |
| `tests/test_fee_intelligence.mjs` | Fee classification & summarisation | — |
| `tests/test_processor_rule_pack.mjs` | Rule pack loading & detection | — |
| `tests/test_statement_metrics.mjs` | Merchant metrics extraction | — |
| _…_ | _see `tests/` for the full set_ | — |

<!-- TODO: complete the index and note any known-failing tests per branch. -->

## Baseline

<!-- TODO: record the expected pass/fail baseline for the current branch so
     regressions are distinguishable from pre-existing failures. -->

## Open questions

<!-- TODO -->
