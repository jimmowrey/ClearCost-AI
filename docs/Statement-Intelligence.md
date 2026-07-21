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

<!-- TODO: document how overall confidence is derived. -->

## Merchant metrics

<!-- TODO: document metric extraction (see js/ statement metrics). -->

## Open questions

<!-- TODO -->
