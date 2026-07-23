import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runStatementIntelligencePipeline } from '../js/statement-intelligence-pipeline.js';
import { NodeProcessorRuleLoader } from '../js/processor-rule-loader-node.js';
import { ProcessorDetector } from '../js/processor-detector.js';
import { RECONCILIATION_STATUS } from '../js/reconciliation-readiness.js';

// ─────────────────────────────────────────────────────────────────────────────
// North State Power Sports — Commerce Control real-statement reconciliation.
//
// This regression is built from the ACTUAL North_State_Power_Sports_Statement_1.pdf
// text layer, extracted with the same pdf.js version the app uses (4.10.38,
// getTextContent() with items joined one-per-line — see js/app.js inspectPage()).
// The extracted per-page text is snapshotted in
// data/regression/north_state_power_sports_commerce_control.json (merchant name,
// contact, address, MID, and batch/account numbers redacted; every fee-row
// description, amount, page number, and line ordering preserved) so the test is
// deterministic and needs no network or PDF parsing at run time. It drives the
// real pipeline:
//
//     verified page text
//        → document map (segmentPage)
//        → fee extraction (extractFeeCandidates, Commerce Control fee-row parser)
//        → fee classification + summarisation
//        → merchant metrics (statement fee total)
//        → reconciliation (assessReconciliation)
//
// Ground truth printed on the statement (page 5):
//   Total Interchange Charges/Program Fees   -$1,403.91
//   Total Service Charges                       -$85.58
//   Total Fees                                  -$12.08
//   TOTAL                                     -$1,501.57
//
// Interchange/program charges are a REAL component of the merchant's fee total,
// not a duplicate. Before the fix, the extractor mis-parsed this statement:
// it produced exactly 110 fee candidates and a reconciliation-eligible total of
// $9,852.47 (summary / total / volume rows leaking in as unlabeled fees), a
// variance of $8,350.90, so the statement did not reconcile. The Commerce
// Control fee-row parser captures each [description, category label, signed
// amount] row exactly once and rejects the summary/overview rows, reconciling to
// the printed $1,501.57 across 90 fee rows. (These pre-fix figures are verified
// against this exact redacted fixture; redaction changed no fee row.)
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(here, '..', 'data', 'regression', 'north_state_power_sports_commerce_control.json'),
    'utf8'
  )
);

// ── 0. Fixture integrity: no merchant PII, but every pre-fix leak-driver row
//      is preserved so the same extraction failure still reproduces. ──────────
{
  const blob = JSON.stringify(fixture);

  // No merchant-identifying information survives redaction.
  for (const identifier of [
    'NORTHSTATE', 'POWERSPORTS', 'GABRIEL', 'EGGEN', 'MIDWAY', 'CHICO',
    '266493272881'
  ]) {
    assert.ok(!blob.includes(identifier), `redacted fixture must not contain "${identifier}"`);
  }
  // No 12-digit MID/batch/account numbers remain (redacted to zeros).
  const remainingLongIds = (blob.match(/(?<!\d)\d{12}(?!\d)/g) || [])
    .filter(t => t !== '000000000000');
  assert.deepEqual(remainingLongIds, [], 'no real 12-digit identifiers remain');

  // The rows that caused the pre-fix leak are still present (so the regression
  // still reproduces): all four category labels, the grand total printed in the
  // overview/summary boxes (multiple times), and the three component totals.
  const allText = fixture.pages.map(p => p.full_text).join('\n');
  for (const label of ['Interchange charges', 'Service charges', 'Fees', 'Program Fees']) {
    assert.ok(allText.includes(label), `fixture retains the "${label}" category label`);
  }
  const grandTotalCount = (allText.match(/-\$1,501\.57/g) || []).length;
  assert.ok(grandTotalCount >= 3, 'grand-total summary rows preserved (pre-fix leak driver)');
  assert.ok(allText.includes('Total Interchange Charges/Program Fees'), 'component total preserved');
  assert.ok(allText.includes('-$1,403.91'), 'interchange/program component total preserved');
  assert.ok(allText.includes('-$85.58'), 'service-charges component total preserved');
  assert.ok(allText.includes('-$12.08'), 'fees component total preserved');
}

// Map the verified pdf.js text pages into the pipeline's validated-page shape.
const pages = fixture.pages.map(p => ({
  index: p.page_number,
  page: p.page_number,
  text: p.full_text,
  readable: true,
  hasText: true,
  rotation: 0,
  ocrRequired: false
}));

const detector = new ProcessorDetector(new NodeProcessorRuleLoader());

const result = await runStatementIntelligencePipeline(
  { name: 'North_State_Power_Sports_Statement_1.pdf', pageCount: pages.length, pages },
  { detector }
);

// ── 1. Processor resolves to Commerce Control (rule pack, not a fallback) ─────
{
  assert.equal(result.processor.name, 'Commerce Control');
  assert.equal(result.processor.rulePackId, 'commerce_control');
  assert.equal(result.processor.fallbackStatus, 'confirmed');
}

// ── 2. The statement's printed fee total is discovered as $1,501.57 ──────────
{
  assert.equal(result.metrics.totalFees.status, 'found');
  assert.equal(result.metrics.totalFees.value, 1501.57);
}

// ── 2a. Submitted transaction count and average ticket use the net column ─────
{
  assert.equal(result.metrics.grossVolume.value, 82756.12);
  assert.equal(result.metrics.transactionCount.status, 'found');
  assert.equal(result.metrics.transactionCount.value, 319);
  assert.equal(
    result.metrics.transactionCount.formula,
    'reconciled_summary_total_row'
  );
  assert.equal(result.metrics.averageTicket.status, 'derived');
  assert.equal(result.metrics.averageTicket.value, 259.42);
}

// ── 3. Every extracted fee is a Commerce Control fee row (no leaked garbage) ─
{
  const rows = result.feeCandidates;
  assert.ok(rows.length > 0, 'fees were extracted');
  assert.ok(
    rows.every(f => f.extractionMethod === 'commerce_control_fee_row'),
    'all fee candidates come from the Commerce Control fee-row parser'
  );

  // The grand-total / summary rows never become fees. No row equals a printed
  // total ($1,501.57, $1,403.91, $85.58, $12.08 as a single captured amount).
  const cents = f => Math.round(Math.abs(Number(f.amount)) * 100);
  for (const total of [150157, 140391, 8558, 1208]) {
    assert.ok(
      !rows.some(f => cents(f) === total),
      `no fee candidate equals the printed total ${total} cents`
    );
  }
}

// ── 4. Interchange / program detail is PRESERVED for analysis ────────────────
{
  const interchange = result.feeCandidates.filter(
    f => f.commerceControlCategory === 'interchange' || f.commerceControlCategory === 'program'
  );
  assert.ok(interchange.length >= 50, 'interchange/program detail rows are preserved');
  assert.ok(
    interchange.every(f => f.interchangeDetails && f.interchangeDetails.description),
    'preserved interchange rows retain provenance'
  );

  // A verified Commerce Control category label is sufficient to classify an
  // otherwise unfamiliar card-program description.  The original description
  // and provenance stay intact; only service/fee rows without a specific rule
  // remain in the unknown queue.
  assert.ok(
    interchange.every(f => f.status === 'classified'),
    'all verified interchange/program rows are classified'
  );
  assert.ok(
    interchange.every(f => ['interchange', 'assessment'].includes(f.category)),
    'interchange/program rows retain interchange or a more specific assessment classification'
  );
  assert.ok(
    interchange.every(f => ['wholesale_interchange', 'network'].includes(f.bucket)),
    'interchange/program rows retain wholesale or a more specific network bucket'
  );
  assert.ok(
    interchange.every(f => !result.unknownFees.includes(f)),
    'classified interchange/program rows are absent from the unknown queue'
  );

  // Interchange/program net (charges − credits) equals the printed component
  // total −$1,403.91 (integer cents).
  const interchangeCents = interchange.reduce(
    (c, f) => c + Math.round(Number(f.amount) * 100),
    0
  );
  assert.equal(interchangeCents, 140391, 'interchange/program net == $1,403.91');
}

// ── 5. Reconciliation reconciles EXACTLY to $1,501.57 ────────────────────────
{
  assert.equal(result.feeSummary.reconciliationEligibleCents, 150157);
  assert.equal(result.feeSummary.reconciliationEligibleTotal, 1501.57);

  const r = result.reconciliation;
  assert.equal(r.feeExtractedCents, 150157);
  assert.equal(r.feeStatementTotalCents, 150157);
  assert.equal(r.feeVarianceCents, 0, 'fee variance is exactly zero');
  assert.equal(r.feeExtracted, 1501.57);
  assert.equal(r.feeStatementTotal, 1501.57);
  assert.equal(r.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED);
}

// ── 6. Displayed metrics: "Fees found" and "Unknown fees" ────────────────────
{
  // "Fees found" is feeCandidates.length; the app also shows classified /
  // needs-review counts and the unknown-fee queue length. Assert them so the
  // regression locks the surfaced metrics, not just the reconciliation total.
  const feesFound = result.feeCandidates.length;
  const unknownQueued = result.unknownFees.length;
  const classified = result.feeSummary.classified;
  const needsReview = result.feeSummary.unknown;

  assert.equal(feesFound, 90, 'Fees found == 90 real fee rows (down from ~110 pre-fix)');
  assert.equal(classified + needsReview, feesFound, 'classified + needs-review == fees found');
  assert.equal(
    unknownQueued,
    needsReview,
    'unknown-fee queue length matches the needs-review count'
  );
  // Every extracted fee is preserved (none discarded) and none is hidden.
  assert.ok(unknownQueued >= 0 && unknownQueued <= feesFound);
}

console.log('North State Power Sports Commerce Control real-statement reconciliation regression tests passed.');
