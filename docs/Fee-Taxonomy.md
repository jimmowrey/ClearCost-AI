# Fee Taxonomy

> Status: placeholder. Structure only — expand in the documentation sprint.
> Describe the existing taxonomy; do not invent new categories.

## Purpose

Defines how extracted fee candidates are classified into buckets and
categories during Fee Classification.

## Fee candidate lifecycle

```
Extraction → candidate (status: unclassified / needs_review)
          → Classification → classified (bucket + category) or unknown
```

- Every fee candidate is preserved.
- Unknown fees remain visible in the unknown-fee queue.

## Buckets

The classification summary groups amounts into buckets. Current bucket keys
(from `js/fee-intelligence.js`):

- `wholesale_interchange`
- `network`
- `processor_revenue`
- `third_party`
- `unknown`

<!-- TODO: define each bucket precisely and give canonical examples. -->

## Categories

<!-- TODO: enumerate categories and map them to buckets. Reference the fee
     registry (js/fee-registry.js) rather than inventing entries. -->

## Extraction methods

Fee candidates carry an `extractionMethod` describing how they were captured
(e.g. `commerce_control_interchange_table_row`). Some methods mark rows that
are excluded from reconciliation totals — see `docs/Calculation-Engine.md`.

## Open questions

<!-- TODO -->
