# ClearCost AI — Build 4.2

## Fee Intelligence Engine

Build 4.2 extends the existing Build 4.1 extraction pipeline without redesigning the application.

### Added

- Permanent ClearCost Fee IDs (`CCF-xxxxxx`)
- Canonical fee registry
- Fee alias and pattern normalization
- Four-bucket cost classification:
  - Wholesale interchange
  - Card-brand/network assessments
  - Processor revenue
  - Third-party services
- Classification confidence and evidence
- Rule IDs for every recognized fee
- Unknown-fee review queue
- Suggested broad bucket for unknown fees without silently classifying them
- Fee totals by bucket and category
- Regression tests for aliases, exact matches, unknown handling, and summary totals

### Accuracy safeguards

- Unknown fees remain unknown until reviewed.
- Build 4.2 does not reconcile statement totals.
- Build 4.2 does not calculate merchant savings.
- A processor label is treated as evidence, not unquestioned truth.
- Fee classifications preserve original statement text, page, and line provenance.

### Run tests

```bash
node tests/test_pdf_validation.mjs
node tests/test_statement_extraction.mjs
node tests/test_fee_intelligence.mjs
```
