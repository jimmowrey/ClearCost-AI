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
| `tests/schedule-a-extraction.test.mjs` and `tests/schedule-a-profiles.test.mjs` | Schedule A parsing, OCR worker compatibility, split-only completeness detection, storage-level rejection of incomplete extraction, and separation of OCR-collapsed AVS / Monthly Minimum rows | 2026-07-24 Schedule A extraction safety |
| `tests/fixtures/signapay-schedule-a-actual-ocr.txt` | Actual SignaPay Schedule A OCR must preserve all 27 cost rows plus the 80/20 compensation split | 2026-07-24 ruled-table OCR regression |
| `tests/test_commerce_control_north_state_additional_statements.mjs` | Real-statement December 2024 and February 2025 Commerce Control detection, split-description recovery, complete processor-scoped fee classification, submitted transaction metrics, and exact reconciliation; includes negative Fiserv and unrelated-processor coverage | 2026-07-23 North State additional-statement verification |
| `tests/test_commerce_control_north_state_reconciliation.mjs` | Commerce Control real-statement fee-row extraction driven from the actual North State Power Sports PDF text layer; reconciles to the printed $1,501.57; rejects summary/total/volume rows; preserves interchange/program detail; asserts Fees-found / Unknown-fee metrics | `DECISIONS.md` 2026-07-23 |
| `tests/test_reconciliation_eligible_arithmetic.mjs` | Synthetic reconciliation-eligible mechanism + integer-cent arithmetic (hand-built candidates; the $909.75 figure is illustrative, not a real statement total) | `DECISIONS.md` 2026-07-20 |
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
