# Changelog

All notable changes to ClearCost AI are documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).
This project does not yet publish formal semantic versions; entries are grouped
under `Unreleased` until a versioning scheme is adopted (see `docs/Roadmap.md`).

## [Unreleased]

### Added
- Engineering foundation: `CLAUDE.md` charter, `AGENTS.md` contributor guide,
  this changelog, and a `docs/` reference set (placeholder structure).
- Reconciliation-eligible fee total (`reconciliationEligibleTotal`) and
  supporting helpers for Commerce Control statements. See `DECISIONS.md`.
- `commerce_control` processor rule pack: evidence-based detection for Commerce
  Control / North State Power Sports statements (Sprint 5.3).
- Processor Intelligence Engine (`js/processor-intelligence-engine.js`):
  explainable ranked candidates, selected result with runner-ups, per-signal
  evidence attribution with provenance, and structured unknown-processor
  evidence capture (Sprint 5.4, additive/standalone).
- Reusable rule pack health validator (`js/rule-pack-health.js`).

### Changed
- Statement reconciliation compares the reconciliation-eligible total rather
  than the raw fee summary total.

### Fixed
- Schedule A OCR now retries split-only results with a higher-resolution sparse
  table scan. Split-only extraction is marked incomplete and cannot be saved or
  verified, and versioned script URLs prevent stale browser code after deploy.
- Commerce Control live-statement fee extraction. On the real North State Power
  Sports statement the extractor mis-parsed the text layer: it produced ~110 fee
  candidates and a reconciliation-eligible total of ~$9,852 (interchange/program
  summary, component-total, and volume rows leaking in as unlabeled fees), so the
  statement did not reconcile. A dedicated Commerce Control fee-row parser now
  captures each `[description, category label, signed amount]` row exactly once,
  reconstructs formula descriptions, normalises charges/credits by sign, and
  rejects summary/overview rows. The statement reconciles to its printed total of
  **$1,501.57** (Interchange Charges/Program Fees $1,403.91 + Service Charges
  $85.58 + Fees $12.08), with interchange/program detail preserved for analysis.
  Real-PDF-derived regression:
  `tests/test_commerce_control_north_state_reconciliation.mjs`. Non–Commerce
  Control processors are unaffected (their extraction path is unchanged). See
  `DECISIONS.md` (2026-07-23).
- Commerce Control statement double-counting that prevented reconciliation to
  the printed fee total. See `DECISIONS.md` (2026-07-20).
- Restored the `cardVolume` statement metric, which a WIP debugging commit had
  dropped from `js/statement-metrics.js` while its regression test remained,
  causing `test_statement_metrics.mjs` to fail.
- Keyword-less description-and-amount lines inside a recognized non-interchange
  fee section are now preserved as `needs_review` (with page/line provenance)
  instead of being discarded, so unknown fees stay visible. Totals, subtotals,
  volumes, transaction counts, rates, and dates are still excluded, and
  interchange detail rows (and the synthetic reconciliation-eligible arithmetic)
  are unaffected.

### Notes
- No application behavior changed in the engineering-foundation documentation
  sprint; it is documentation/infrastructure only.

<!-- TODO: adopt a versioning scheme and begin tagging releases. -->
