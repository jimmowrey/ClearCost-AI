# ClearCost AI Build 3 — PDF Import and Validation

Build 3 extends the existing Build 2 mobile-first shell without redesigning it.

## Implemented
- Local browser PDF import using PDF.js
- Page counting
- Per-page text-layer detection
- OCR-required detection
- Statement-period consistency validation
- Merchant-name and MID consistency validation
- Printed missing-page detection
- Duplicate-page detection using normalized page fingerprints
- PDF rotation detection
- Basic readability checks
- Printed page-order validation
- Blocking errors vs review warnings
- Regression tests for parsing and comparison rules

## Important limitations
- OCR execution itself is not included in Build 3; pages lacking a usable text layer are flagged for OCR.
- Missing-page and page-order checks rely on printed page numbering when present.
- Merchant name, MID, and statement-period extraction are intentionally conservative. Missing values are reported rather than invented.
- Image-only duplicate detection is provisional until rendered-page perceptual hashing is added.

## Run
Serve the repository over HTTP because browser PDF modules do not run reliably from `file://` URLs.

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Regression test

```bash
node tests/test_pdf_validation.mjs
```
