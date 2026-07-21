import assert from 'node:assert/strict';
import {
  summarizeFees,
  isReconciliationEligible,
  computeReconciliationEligibleCents,
  computeReconciliationEligibleTotal,
  RECONCILIATION_EXCLUDED_EXTRACTION_METHODS
} from '../js/fee-intelligence.js';
import {
  assessReconciliation,
  RECONCILIATION_STATUS
} from '../js/reconciliation-readiness.js';

// ─────────────────────────────────────────────────────────────────────────────
// North State Power Sports — Commerce Control statement reconciliation.
//
// Confirmed statement total fees: $909.75.
//
// Commerce Control interchange/program detail rows (pages 6–7) are preserved as
// fee candidates for analysis, but they are ALSO represented in the statement
// fee section. They must not be counted twice during reconciliation.
//
// Regression contract:
//   1. Commerce Control detail rows remain preserved among fee candidates.
//   2. They are excluded ONLY from the reconciliation-eligible total.
//   3. Other processors' interchange detail is unaffected (still eligible).
//   4. Reconciliation reconciles exactly to $909.75.
// ─────────────────────────────────────────────────────────────────────────────

// Statement fee-section candidates that make up the printed $909.75 total.
const statementSectionFees = [
  { amount: 500.00, status: 'classified', extractionMethod: 'statement_fee_section' },
  { amount: 250.00, status: 'classified', extractionMethod: 'statement_fee_section' },
  { amount: 159.75, status: 'classified', extractionMethod: 'statement_fee_section' }
];

// Commerce Control interchange detail rows (pages 6–7). These duplicate the
// fee-section content and carry per-line interchange provenance. In extraction
// they are emitted with negative amounts (amount: -printedCharge).
const commerceControlDetailRows = [
  {
    amount: -120.50,
    status: 'unclassified',
    extractionMethod: 'commerce_control_interchange_table_row',
    interchangeDetails: { description: 'Visa CPS Retail', interchangeCharge: -120.50 }
  },
  {
    amount: -88.25,
    status: 'unclassified',
    extractionMethod: 'commerce_control_interchange_table_row',
    interchangeDetails: { description: 'MC Merit III', interchangeCharge: -88.25 }
  }
];

const feeCandidates = [...statementSectionFees, ...commerceControlDetailRows];

// ── 1. Commerce Control detail rows remain preserved ─────────────────────────
{
  const summary = summarizeFees(feeCandidates);

  // Every candidate is still present — nothing deleted or hidden.
  const preservedCcRows = feeCandidates.filter(
    f => f.extractionMethod === 'commerce_control_interchange_table_row'
  );
  assert.equal(preservedCcRows.length, 2, 'Commerce Control detail rows must be preserved');
  assert.ok(
    preservedCcRows.every(f => f.interchangeDetails),
    'Preserved detail rows must retain interchange provenance'
  );

  // feeSummary.totalAmount still reflects the full candidate set (analysis view).
  // 909.75 + (-120.50) + (-88.25) = 701.00
  assert.equal(summary.totalAmount, 701.00);
}

// ── 2. Detail rows are excluded ONLY from the reconciliation-eligible total ──
{
  assert.deepEqual(
    RECONCILIATION_EXCLUDED_EXTRACTION_METHODS,
    ['commerce_control_interchange_table_row']
  );

  // The exclusion predicate targets exactly the Commerce Control rows.
  assert.equal(isReconciliationEligible(commerceControlDetailRows[0]), false);
  assert.equal(isReconciliationEligible(commerceControlDetailRows[1]), false);
  assert.equal(isReconciliationEligible(statementSectionFees[0]), true);

  // Integer-cent eligible total excludes the duplicate detail rows.
  assert.equal(computeReconciliationEligibleCents(feeCandidates), 90975);
  assert.equal(computeReconciliationEligibleTotal(feeCandidates), 909.75);

  const summary = summarizeFees(feeCandidates);
  assert.equal(summary.reconciliationEligibleCents, 90975);
  assert.equal(summary.reconciliationEligibleTotal, 909.75);

  // The eligible total differs from totalAmount precisely because the detail
  // rows are excluded from reconciliation but preserved everywhere else.
  assert.notEqual(summary.reconciliationEligibleTotal, summary.totalAmount);
}

// ── 3. Other processors are unaffected ───────────────────────────────────────
{
  // A Worldpay-style set: interchange detail uses a DIFFERENT extraction method
  // and must remain fully reconciliation-eligible (no global suppression).
  const otherProcessorFees = [
    { amount: 500.00, status: 'classified', extractionMethod: 'statement_fee_section' },
    { amount: 250.00, status: 'classified', extractionMethod: 'statement_fee_section' },
    { amount: 159.75, status: 'classified', extractionMethod: 'interchange_description_charge_pair' }
  ];

  assert.ok(
    otherProcessorFees.every(isReconciliationEligible),
    'Non-Commerce-Control interchange detail must stay eligible'
  );

  const summary = summarizeFees(otherProcessorFees);
  // With no Commerce Control rows, eligible total equals the full total.
  assert.equal(summary.reconciliationEligibleTotal, summary.totalAmount);
  assert.equal(summary.reconciliationEligibleTotal, 909.75);
}

// ── 4. Reconciliation reconciles exactly to $909.75 ──────────────────────────
{
  const summary = summarizeFees(feeCandidates);

  // Wired exactly as the pipeline does: reconcile the eligible total.
  const reconciliation = assessReconciliation({
    extractedFeeTotal: summary.reconciliationEligibleTotal,
    statementFeeTotal: 909.75
  });

  assert.equal(reconciliation.feeExtractedCents, 90975);
  assert.equal(reconciliation.feeStatementTotalCents, 90975);
  assert.equal(reconciliation.feeVarianceCents, 0);
  assert.equal(reconciliation.feeExtracted, 909.75);
  assert.equal(reconciliation.feeStatementTotal, 909.75);
  assert.equal(reconciliation.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED);

  // Guard: reconciling the UNADJUSTED total would NOT reconcile — proving the
  // fix is load-bearing, not cosmetic.
  const naive = assessReconciliation({
    extractedFeeTotal: summary.totalAmount,
    statementFeeTotal: 909.75
  });
  assert.notEqual(naive.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED);
}

console.log('North State Power Sports Commerce Control reconciliation regression tests passed.');
