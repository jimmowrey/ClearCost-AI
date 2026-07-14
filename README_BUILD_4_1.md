# ClearCost AI — Build 4.1

Build 4.1 extends the existing Build 3 browser application without redesigning it.

## Implemented
- Statement section segmentation with page and line provenance
- Merchant name, MID, TID, statement period, address, and phone candidate extraction
- Weighted processor recognition with evidence and confidence
- Preliminary fee-line candidate capture from fee-related sections
- Structured statement extraction object and extraction log
- UI review screen for identity, document map, evidence, and fee candidates
- Regression tests for segmentation, metadata, processor recognition, provenance, and fee candidates

## Accuracy boundary
Fee candidates are not yet standardized, classified against the Fee Taxonomy, or reconciled to statement totals. Build 4.1 must not generate merchant-facing savings or proposals.

## Tests
Run:

```bash
node tests/test_pdf_validation.mjs
node tests/test_statement_extraction.mjs
```
