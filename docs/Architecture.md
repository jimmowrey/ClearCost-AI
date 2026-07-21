# Architecture

> Status: placeholder. Structure only — expand in the documentation sprint.

## Overview

ClearCost AI ingests merchant processing statements and produces reconciled
fee intelligence and proposals. This document describes the system structure
and the statement pipeline.

## Statement Pipeline

```
Validation → Processor Detection → Document Mapping → Fee Extraction →
Fee Classification → Merchant Metrics → Reconciliation → Proposal Engine
```

| Stage | Responsibility | Reference |
|-------|----------------|-----------|
| Validation | PDF/text validation, OCR flagging | `docs/Statement-Validation.md` |
| Processor Detection | Identify processor via rule packs | `docs/Processor-Library.md` |
| Document Mapping | Page/line provenance map | `docs/Statement-Intelligence.md` |
| Fee Extraction | Extract fee candidates | `docs/Fee-Taxonomy.md` |
| Fee Classification | Bucket/category assignment | `docs/Fee-Taxonomy.md` |
| Merchant Metrics | Totals, volume, transaction counts | `docs/Statement-Intelligence.md` |
| Reconciliation | Compare extracted vs. printed totals | `docs/Calculation-Engine.md` |
| Proposal Engine | Savings proposals | `docs/Proposal-Engine.md` |

## Module map

<!-- TODO: document key modules under js/ and their responsibilities. -->

- `js/statement-intelligence-pipeline.js` — pipeline orchestration.
- `js/statement-extraction.js` — segmentation, detection wiring, extraction.
- `js/fee-intelligence.js` — classification and fee summarisation.
- `js/reconciliation-readiness.js` — reconciliation assessment.
- `js/processor-detector.js`, `js/processor-rule-loader*.js` — rule packs.

## Data flow & provenance

<!-- TODO: describe provenance (page/line) tracking through the pipeline. -->

## Cross-cutting requirements

- Integer-cent arithmetic for all financial math.
- Preserve every fee candidate; keep unknown fees visible.
- Explicit fallbacks; no silent failures.

## Open questions

<!-- TODO -->
