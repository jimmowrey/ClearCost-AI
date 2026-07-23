import assert from 'node:assert/strict';
import {buildStatementExtraction, SECTION_TYPES} from '../js/statement-extraction.js';
import {NodeProcessorRuleLoader} from '../js/processor-rule-loader-node.js';
import {ProcessorDetector} from '../js/processor-detector.js';
import {summarizeFees, computeReconciliationEligibleCents} from '../js/fee-intelligence.js';

const detector = new ProcessorDetector(new NodeProcessorRuleLoader());
const rec = text => ({ name: 'stmt.pdf', pageCount: 1, pages: [{ index: 1, text }] });

// ─────────────────────────────────────────────────────────────────────────────
// Option B (scoped): within a recognized NON-interchange fee section, a
// description-and-amount line without a fee keyword is preserved as an unknown
// fee for review, while totals / subtotals / volumes / counts / rates / dates
// are still excluded. Interchange detail rows are untouched (the single-line
// path excludes interchange sections), so they cannot be double-counted and the
// Commerce Control reconciliation is unaffected.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Keyword-less unknown fee preserved with provenance ────────────────────
{
  const ex = await buildStatementExtraction(
    rec('Worldpay\nOther Fees\nMerchant Advantage Plus 7.84'),
    { detector }
  );
  assert.equal(ex.unknownFees.length, 1, 'keyword-less fee preserved as unknown');
  const f = ex.unknownFees[0];
  assert.equal(f.status, 'needs_review');
  assert.equal(f.originalDescription, 'Merchant Advantage Plus');
  assert.equal(f.amount, 7.84);
  assert.equal(typeof f.page, 'number');
  assert.equal(typeof f.line, 'number');
  assert.equal(typeof f.rawText, 'string');
  assert.equal(f.extractionMethod, 'single_line_fee_unlabeled', 'tagged as an unlabeled fee-section line');
  assert.equal(f.requiresManualReview, true);
}

// ── 2. Totals / subtotals / volumes / counts / rates / dates are NOT fees ────
{
  const ex = await buildStatementExtraction(
    rec([
      'Worldpay',
      'Other Fees',
      'Total 250.00',
      'Subtotal 100.00',
      'Net Sales 5,000.00',
      'Average Ticket 45.00',
      'Gross Volume 9,999.00',
      'Item Count 42.00',
      '12/31 100.00',
    ].join('\n')),
    { detector }
  );
  assert.equal(
    ex.feeCandidates.length, 0,
    `no non-fee line should become a fee (got: ${JSON.stringify(ex.feeCandidates.map(f => f.originalDescription))})`
  );

  // A genuine keyword-less fee alongside the non-fee lines is still preserved.
  const mixed = await buildStatementExtraction(
    rec('Worldpay\nOther Fees\nTotal 250.00\nMerchant Advantage Plus 7.84\nGross Volume 9,999.00'),
    { detector }
  );
  const descs = mixed.feeCandidates.map(f => f.originalDescription);
  assert.deepEqual(descs, ['Merchant Advantage Plus'], 'only the real keyword-less fee is captured');
}

// ── 3. Reconciliation-eligible exclusion is scoped by extraction method ──────
// Synthetic candidates (not a real statement). The $909.75 below is an
// illustrative arithmetic total, NOT the North State Power Sports statement
// total (that real statement reconciles to $1,501.57).
{
  // The reconciliation exclusion set is scoped by extraction method. An
  // unlabeled single-line fee is reconciliation ELIGIBLE; a row tagged with the
  // excluded commerce_control_interchange_table_row method is NOT.
  const fees = [
    { amount: 500.00,  status: 'classified',   extractionMethod: 'single_line_fee' },
    { amount: 250.00,  status: 'needs_review', extractionMethod: 'single_line_fee_unlabeled' },
    { amount: 159.75,  status: 'classified',   extractionMethod: 'statement_fee_section' },
    { amount: -120.50, status: 'unclassified', extractionMethod: 'commerce_control_interchange_table_row' },
    { amount: -88.25,  status: 'unclassified', extractionMethod: 'commerce_control_interchange_table_row' },
  ];
  const s = summarizeFees(fees);
  // 500 + 250 + 159.75 = 909.75 (the two excluded-method rows excluded)
  assert.equal(s.reconciliationEligibleCents, 90975);
  assert.equal(s.reconciliationEligibleTotal, 909.75);

  // The unlabeled method is NOT in the exclusion set (it counts toward reconciliation).
  assert.equal(
    computeReconciliationEligibleCents([{ amount: 7.84, extractionMethod: 'single_line_fee_unlabeled' }]),
    784
  );
  // The commerce_control method IS excluded.
  assert.equal(
    computeReconciliationEligibleCents([{ amount: 5.00, extractionMethod: 'commerce_control_interchange_table_row' }]),
    0
  );
}

// ── 4. No double-counting of interchange detail rows ─────────────────────────
{
  // A statement with an interchange section: interchange rows must never be
  // captured by the single-line fee path (that loop excludes interchange
  // sections), so they cannot be double-counted alongside the interchange
  // parser's own output.
  const ex = await buildStatementExtraction(
    rec('Worldpay\nInterchange Detail\nVisa FANF 15.00\nMC NABU 8.50\nOther Fees\nMonthly Fee 25.00'),
    { detector }
  );
  const singleLineFromInterchange = ex.feeCandidates.filter(f =>
    (f.extractionMethod === 'single_line_fee' || f.extractionMethod === 'single_line_fee_unlabeled') &&
    f.section === SECTION_TYPES.INTERCHANGE
  );
  assert.equal(singleLineFromInterchange.length, 0, 'interchange rows are not captured by the single-line fee path');

  // The legitimate non-interchange fee is still extracted exactly once.
  const monthly = ex.feeCandidates.filter(f => f.originalDescription === 'Monthly Fee');
  assert.equal(monthly.length, 1, 'non-interchange fee extracted exactly once');
}

console.log('Fee-section unlabeled-line preservation (Option B) regression tests passed.');
