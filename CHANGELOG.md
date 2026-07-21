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
- Commerce Control statement double-counting that prevented reconciliation to
  the printed fee total. See `DECISIONS.md` (2026-07-20).
- Restored the `cardVolume` statement metric, which a WIP debugging commit had
  dropped from `js/statement-metrics.js` while its regression test remained,
  causing `test_statement_metrics.mjs` to fail.
- Keyword-less description-and-amount lines inside a recognized non-interchange
  fee section are now preserved as `needs_review` (with page/line provenance)
  instead of being discarded, so unknown fees stay visible. Totals, subtotals,
  volumes, transaction counts, rates, and dates are still excluded, and
  interchange detail rows (and Commerce Control's $909.75 reconciliation) are
  unaffected.

### Notes
- No application behavior changed in the engineering-foundation documentation
  sprint; it is documentation/infrastructure only.

<!-- TODO: adopt a versioning scheme and begin tagging releases. -->
