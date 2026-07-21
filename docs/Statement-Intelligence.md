# Statement Intelligence

> Status: placeholder. Structure only — expand in the documentation sprint.

## Purpose

Describes the orchestrated intelligence report produced by
`js/statement-intelligence-pipeline.js`, combining every pipeline stage into a
single structured result.

## Pipeline stages (report sections)

1. Validation summary.
2. Processor identification.
3. Document map (page/line provenance).
4. Fee candidates & unknown-fee queue.
5. Merchant metrics (totals, volume, transaction counts).
6. Reconciliation readiness.
7. Internal report: warnings, assumptions, overall confidence.

## Document map & provenance

<!-- TODO: document how sections map to pages/lines and how provenance is
     preserved for audits. -->

## Confidence scoring

See `docs/Processor-Library.md` → *Confidence normalization formula* for the
deterministic scoring used by processor detection.

## Processor intelligence (explainable detection)

The Processor Intelligence Engine (`js/processor-intelligence-engine.js`) makes
processor identification explainable and comparable without changing scoring or
selection. For a statement it returns ranked `candidates[]`, a `selected`
result with `runnersUp`, per-signal evidence explainability (type, category,
matched text, rule pack source, weight, page/line provenance), and a
`rulePackHealth` report.

### Unknown-processor evidence capture

When no processor meets its threshold, the engine preserves structured
`unknownProcessorEvidence` and queues it — nothing is discarded or silently
suppressed:

- `candidateRankings` — the full ranked candidate list,
- `headings` and `sectionNames` — statement headings and section types,
- `columnLabels` — heuristic column/label lines from detail sections,
- `midFormat` — observed MID value(s) and an inferred character pattern,
- `footerAddressText` — address/phone/footer lines,
- `unknownFeeNames` — unclassified / needs-review fee descriptions,
- `layoutFingerprint` — the ordered section-type and heading sequence,
- `fallbackReason`.

## Merchant metrics

<!-- TODO: document metric extraction (see js/ statement metrics). -->

## Open questions

<!-- TODO -->
