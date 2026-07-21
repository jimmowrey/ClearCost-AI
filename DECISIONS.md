# Decisions

Architectural decision record for ClearCost AI. Newest entries first.

---

## 2026-07-20 — Commerce Control reconciliation eligible total

**Status:** Accepted (tactical). Rule Pack migration deferred to a separate branch/PR.

### Problem

North State Power Sports Commerce Control statements emit interchange/program
detail rows (pages 6–7) as fee candidates carrying the metadata
`extractionMethod === "commerce_control_interchange_table_row"`. Those rows are
also represented in the statement's summarised fee section. Reconciliation
summed `extraction.feeSummary.totalAmount`, which counted the detail rows twice
and prevented reconciling to the statement's printed total of **$909.75**.

### Decision

Add a reconciliation-specific **eligible total** that excludes only the
Commerce Control duplicate detail rows from the reconciliation sum, while
preserving every fee candidate everywhere else. No fee is deleted or hidden.
The exclusion is scoped to the single `commerce_control_interchange_table_row`
extraction method — interchange detail for all other processors stays fully
eligible.

### Reasoning

- **Charter compliance:** every extracted fee candidate is preserved; unknown
  and detail fees remain visible for fee analysis, interchange analysis,
  reporting, and audits. Interchange detail is not globally suppressed.
- **Correctness:** the double-count is removed at the reconciliation boundary
  only, so analysis totals (`feeSummary.totalAmount`) are unchanged.
- **Financial safety:** the eligible total is computed in integer cents; no
  floating-point comparison is used.
- **Low risk / narrow scope:** the change is additive and does not alter
  extraction, classification, or any other processor's behaviour.

### Implementation summary

- `js/fee-intelligence.js` — added `RECONCILIATION_EXCLUDED_EXTRACTION_METHODS`
  (scoped to `commerce_control_interchange_table_row`), `isReconciliationEligible`,
  and `computeReconciliationEligibleCents` / `computeReconciliationEligibleTotal`
  (integer-cent). `summarizeFees` now also exposes `reconciliationEligibleCents`
  and `reconciliationEligibleTotal` alongside the unchanged `totalAmount`.
- `js/statement-intelligence-pipeline.js` — reconciliation now uses
  `feeSummary.reconciliationEligibleTotal` instead of `feeSummary.totalAmount`.
- Result: reconciliation reproduces exactly to **$909.75**
  (`feeVarianceCents === 0`).

### Regression tests added

- `tests/test_commerce_control_reconciliation.mjs` proves:
  - Commerce Control detail rows remain preserved among fee candidates.
  - They are excluded **only** from the reconciliation-eligible total.
  - Other processors' interchange detail remains fully eligible.
  - Reconciliation equals **$909.75**.
  - Negative test: reconciling the un-adjusted `totalAmount` would **fail** to
    reconcile, proving the fix is load-bearing.

### Commit reference

- `33e12b67ba7d976ea65502933ea2d6c49c1c34a9` — "Fix Commerce Control
  reconciliation double-count" (branch `wip/fee-extraction-debug-backup`).
- This DECISIONS.md entry is added as a follow-up commit on the same branch.

### Known limitation / deferred follow-up

The exclusion list is currently a hardcoded constant in `fee-intelligence.js`.
Per the charter's Processor Rule Pack principle, this configuration should be
moved into the Rule Pack framework (a `reconciliationExcludedExtractionMethods`
field loaded through the Rule Pack loader) — removing the hardcoded constant
while preserving behaviour and backward compatibility. That migration is
intentionally **out of scope** here and is deferred to a separate branch and
pull request. The full documentation framework (`docs/`, `Regression-Library.md`,
`Architecture.md`, etc.) will be created in the dedicated documentation sprint.
