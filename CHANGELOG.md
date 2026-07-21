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

### Notes
- No application behavior changed in the engineering-foundation documentation
  sprint; it is documentation/infrastructure only.

<!-- TODO: adopt a versioning scheme and begin tagging releases. -->
