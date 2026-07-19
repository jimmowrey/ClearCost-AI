# Sprint 5.2 — Profit Intelligence UI Integration

This update wires the existing browser Profit Intelligence engine into the current ClearCost AI statement workflow.

## Added
- Profit Intelligence screen
- Traditional / IC+, Cash Discount, and Surcharge selection
- Adjustable merchant pricing fields
- Internal verified revenue/cost/split inputs
- Minimum residual protection
- Profitability result and Ready-to-Present gate
- Internal calculation audit

## Preserved
- PDF validation
- Statement period / MID / merchant validation
- Statement Intelligence Pipeline
- Fee extraction and classification
- Reconciliation blocking

## Important
Profit Intelligence cannot be opened for a usable calculation until statement reconciliation is no longer proposal-blocked.
Internal profit and residual fields are labeled as consultant-only and remain separate from merchant-facing output.
