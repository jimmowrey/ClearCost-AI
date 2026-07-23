# Decisions

Architectural decision record for ClearCost AI. Newest entries first.

---

## 2026-07-23 — Commerce Control live-statement fee extraction ($1,501.57)

**Status:** Accepted. Corrects the reconciliation model against the real statement.

### Problem

Run against the actual North State Power Sports PDF
(`North_State_Power_Sports_Statement_1.pdf`, extracted with pdf.js 4.10.38 exactly
as `js/app.js` does), the Commerce Control extractor mis-parsed the text layer:
~110 fee candidates with a reconciliation-eligible total of ~$9,852 against a
printed statement total of $1,501.57 — an $8,350 variance, not reconciled. The
leak came from summary/overview, component-total, and volume rows (whose
description column extracts as a bare `-` or a numeric value) being captured as
`single_line_fee_unlabeled` fees, and from the earlier 8-line interchange-table
parser, which did not match this statement's layout.

The earlier tactical model (2026-07-20) assumed interchange/program detail rows
were **duplicates** to exclude from reconciliation, reconciling a *synthetic*
statement to $909.75. The real statement disproves that: it prints
`Total (Service Charges, Interchange Charges/Program Fees, and Fees) -$1,501.57`,
so interchange/program charges ($1,403.91) are a **real component** of the fee
total, not a duplicate. `$909.75` and `$1,043.19` do not appear in the statement.

### Decision

Add a dedicated Commerce Control fee-row parser (`js/statement-extraction.js`).
Commerce Control renders every charged fee as a three-line row:
`[description, category label, signed amount]`, where the category label is one
of `Interchange charges | Service charges | Fees | Program Fees` and the amount
sits immediately after the label. The parser anchors on the category label,
reconstructs the description by walking back over numeric/formula continuation
lines, normalises sign (charge `-$X` → positive cost, credit `$X` → negative
cost), and rejects summary/overview rows (the `Total …`/`TOTAL` labels are not
exact category labels and never anchor; the single overview row that does anchor
resolves its description head to a summary label such as `Adjustments` and is
filtered). These rows are ordinary reconciliation-eligible fees.

### Reasoning

- **Accuracy / no fabrication:** reconciliation now reproduces the statement's
  own printed total, $1,501.57, cent-exact (Interchange/Program $1,403.91 +
  Service $85.58 + Fees $12.08). Nothing is suppressed to force a target.
- **Charter compliance:** every charged fee is preserved; interchange/program
  detail keeps per-row provenance for analysis; integer-cent arithmetic.
- **Scope containment:** the parser runs only for Commerce Control; the generic
  non-interchange fee pass is skipped for Commerce Control and unchanged for
  every other processor.

### Consequences

- The `commerce_control_interchange_table_row` extraction method and the
  reconciliation-eligible **exclusion** it relied on are no longer produced by
  extraction. The generic exclusion mechanism in `js/fee-intelligence.js`
  (`RECONCILIATION_EXCLUDED_EXTRACTION_METHODS`, `isReconciliationEligible`, and
  the eligible-total helpers) is retained as generic infrastructure and still
  unit-tested by `tests/test_commerce_control_reconciliation.mjs`, but no longer
  encodes live Commerce Control behaviour.

### Regression tests

- `tests/test_commerce_control_north_state_reconciliation.mjs` — real-PDF-derived
  fixture (`data/regression/north_state_power_sports_commerce_control.json`)
  through the full pipeline: processor = Commerce Control, reconciles to
  $1,501.57 (`feeVarianceCents === 0`), interchange/program net = $1,403.91,
  summary/total/volume rows rejected, and the surfaced Fees-found / Unknown-fee
  metrics are asserted.

### Follow-up completed

- The former `tests/test_commerce_control_reconciliation.mjs` (which narrated the
  superseded $909.75 synthetic scenario) has been renamed to
  `tests/test_reconciliation_eligible_arithmetic.mjs` and reframed as a synthetic
  reconciliation-eligible/arithmetic unit test. Its assertions remain valid; it
  no longer claims $909.75 is the North State Power Sports statement total. The
  prior 2026-07-20 entries below are superseded on that point.

---

## 2026-07-20 — Processor Intelligence Engine (explainable detection layer)

**Status:** Accepted. Additive, standalone (not wired into the live pipeline this sprint).

### Problem

Processor detection returned a single winner and a flat evidence list. It was
hard to explain *why* a processor won, to compare runner-up candidates, or to
preserve evidence when a statement matched no processor. These are needed to
make detection trustworthy and to triage unknown processors safely.

### Decision

Add a standalone Processor Intelligence Engine
(`js/processor-intelligence-engine.js`) that **reuses `ProcessorDetector` as the
authoritative scorer** and enriches the result: ranked candidates with matched
and missing evidence, an explained selected result with runner-ups, structured
`unknownProcessorEvidence` capture on fallback, and a `rulePackHealth` report
via a reusable validator (`js/rule-pack-health.js`).

### Reasoning

- Reusing the detector keeps scoring/selection unchanged, so every existing
  detector, rule pack, and reconciliation test is unaffected.
- Rule Packs remain the single source of processor knowledge; the engine only
  reads and explains them.
- Standalone (not wired into the pipeline) keeps the change low-risk and within
  scope; wiring can follow in a later sprint.

### Consequences

- The global confidence threshold (0.5) is unchanged; no match is forced.
- Generic fallback and Commerce Control detection are preserved. (The
  Commerce Control reconciliation figure of $909.75 referenced here was a
  synthetic assumption, superseded 2026-07-23: the real North State Power Sports
  statement reconciles to $1,501.57.)
- Confidence normalization is documented and deterministic:
  `confidence = round2(min(rawScore / normalizationBase, 1))`, ordering by
  integer `rawScore` desc then `processorId` asc.
- No fee extraction, reconciliation, metric, or proposal behavior changed.

---

## 2026-07-20 — Commerce Control reconciliation eligible total

**Status:** SUPERSEDED by the 2026-07-23 entry above. This entry was based on a
synthetic model of the statement (interchange detail assumed to be a duplicate,
reconciling to $909.75). The real North State Power Sports statement disproves
both assumptions: interchange/program charges are a genuine fee component and
the statement reconciles to **$1,501.57**. The `$909.75` figure below is NOT the
real statement total; it is retained here only as the historical record of the
superseded decision. The generic exclusion mechanism this entry introduced still
exists but is no longer produced by live Commerce Control extraction.

### Problem (as understood at the time — since disproven)

The synthetic model assumed North State Power Sports Commerce Control statements
emit interchange/program detail rows as fee candidates carrying
`extractionMethod === "commerce_control_interchange_table_row"` that were *also*
represented in a summarised fee section, so reconciliation summed
`extraction.feeSummary.totalAmount` and double-counted them, preventing
reconciliation to an assumed printed total of **$909.75**.

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
- Result (synthetic model): reconciliation reproduced the assumed $909.75 total
  (`feeVarianceCents === 0`). Superseded — the real statement total is $1,501.57.

### Regression tests added (since renamed/reframed)

- `tests/test_reconciliation_eligible_arithmetic.mjs` (formerly
  `tests/test_commerce_control_reconciliation.mjs`) proves, with synthetic
  hand-built candidates:
  - Rows tagged with the excluded method remain preserved among fee candidates.
  - They are excluded **only** from the reconciliation-eligible total.
  - Rows using any other extraction method remain fully eligible.
  - The reconciliation arithmetic reconciles the illustrative eligible total.
  - Negative test: reconciling the un-adjusted `totalAmount` would **fail** to
    reconcile, proving the mechanism is load-bearing.

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
