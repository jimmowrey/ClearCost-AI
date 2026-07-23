# Versioned Schedule A Profiles

Schedule A economics belong to an agent account, not to a merchant statement
and not to a universal ISO catalog. Two agents at the same ISO may have
different terms, and one agent may receive a replacement schedule later.

## Upload boundary

The first implementation:

- accepts PDF files only;
- requires the ISO / processor name and effective date;
- calculates a SHA-256 fingerprint for the original PDF;
- preserves the original PDF in device-local IndexedDB;
- stores version metadata separately from merchant analysis;
- creates a new immutable version instead of overwriting an older schedule;
- leaves extraction pending and economics unverified after upload.

## Extraction and review

The next layer reads text-layer PDFs directly and runs in-browser OCR for
scanned Schedule A pages. Extraction creates candidate terms with the original
source wording retained as evidence. It does not verify terms automatically.

The agent must compare every candidate with the source PDF, correct any OCR
error, add any row the extractor missed, and explicitly verify every row. Final
verification also requires the agent to confirm that every source row is
represented. A partially reviewed schedule remains unverified and cannot be
used by Profit Intelligence.

An upload is not evidence that the document was understood. Profit Intelligence
must remain blocked until every required term is extracted and the agent
verifies the extracted schedule.

## Future authenticated storage

Device-local storage is the current static-app boundary. Before multi-device or
multi-user production use, PDFs and profile metadata must move to authenticated,
encrypted account storage. The version ID and SHA-256 fingerprint are retained
so analyses can continue to identify the exact Schedule A used.

## Analysis linkage

Every profitability calculation must record the immutable Schedule A version
ID. Later edits or replacement schedules must never change a completed
analysis retroactively.
