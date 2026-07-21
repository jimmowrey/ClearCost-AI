# Statement Validation

> Status: placeholder. Structure only — expand in the documentation sprint.

## Purpose

First pipeline stage: validate the uploaded statement before extraction.

## Responsibilities

<!-- TODO: confirm against js/ implementation. -->

- Verify the document is readable and has a usable text layer.
- Flag pages that require OCR.
- Detect missing, duplicate, or out-of-order pages.
- Validate the statement period.

## Outputs

<!-- TODO: document the validation summary shape (page count, OCR flags,
     missing/duplicate pages, period). -->

## Failure handling

- Validation issues are reported explicitly (no silent failures).
- Downstream stages consume the validation summary.

## Open questions

<!-- TODO -->
