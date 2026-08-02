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
| `tests/cost-ownership.test.mjs` | Economic-owner buckets, verified incumbent processor markup, Commerce Control duplicate-detail exclusion, exact total reconciliation, unknown-fee blocking, and proposal savings from separate percentage and transaction markups | 2026-08-01 verified cost ownership |
| `tests/schedule-a-bulk-verification.test.mjs` | One-click verification marks every extracted Schedule A row, saving remains blocked until source coverage is confirmed, and editing a reviewed value unchecks only that term | 2026-08-01 Schedule A review efficiency |
| `tests/schedule-a-extraction.test.mjs` and `tests/schedule-a-profiles.test.mjs` | Schedule A parsing, OCR worker compatibility, split-only completeness detection, storage-level rejection of incomplete extraction, separation of OCR-collapsed AVS / Monthly Minimum rows, and normalization of OCR `jitem` to `/item` | 2026-07-24 Schedule A extraction safety |
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


| Interchange schedule verification | Dated schedule matching, percentage-plus-item expected cost, variance detection, unresolved-row blocking, and detail-to-summary coverage | `tests/interchange-verification.test.mjs`; `tests/cost-ownership.test.mjs` |


## Commerce Control interchange detail — January 2025

- Extracts all 53 non-total rows from pages 5–7 with page, description, volume, count, percentage rate, per-item rate, and charged amount.
- Reconciles the detail table independently to $1,114.21; it must not be forced to the broader $1,403.91 Interchange Charges/Program Fees summary.
- Matches 13 Mastercard and 26 Visa rows against the schedule effective for January 2025.
- Keeps four Discover and two Amex rows unresolved until dated primary schedule evidence is loaded; processor markup and savings remain blocked.
- Regression: `tests/commerce-control-interchange-detail.test.mjs`.
