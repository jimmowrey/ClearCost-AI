import assert from 'node:assert/strict';
import {assessReconciliation, RECONCILIATION_STATUS, RECONCILIATION_TOLERANCE} from '../js/reconciliation-readiness.js';

// Default tolerance is $0.01
assert.equal(RECONCILIATION_TOLERANCE, 0.01);

// ── Variance within tolerance ($0.25 > $0.01 default → fee not reconciled) ──
{
  const result = assessReconciliation({ extractedFeeTotal: 1200.00, statementFeeTotal: 1200.25 });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.PARTIALLY);
  assert.equal(result.proposalBlocked, true);
  assert.ok(result.blockReason.includes('variance'));
  assert.equal(result.feeExtracted, 1200.00);
  assert.equal(result.feeStatementTotal, 1200.25);
  assert.equal(result.tolerance, RECONCILIATION_TOLERANCE);
}

// ── Exact match → fee dimension reconciled; overall still incomplete ──
{
  const result = assessReconciliation({ extractedFeeTotal: 500.00, statementFeeTotal: 500.00 });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED);
  assert.equal(result.feeVariance, 0.00);
  // Volume and transaction-count variances unavailable → overall not fully reconciled
  assert.notEqual(result.overallReconciliationStatus, RECONCILIATION_STATUS.RECONCILED);
  assert.equal(result.proposalBlocked, true);
}

// ── Small variance exceeding tolerance ($5.00) → partially_reconciled ──
{
  const result = assessReconciliation({ extractedFeeTotal: 1200.00, statementFeeTotal: 1205.00 });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.PARTIALLY);
  assert.equal(result.proposalBlocked, true);
  assert.ok(result.blockReason.includes('variance'));
  assert.equal(result.feeVariance, 5.00);
}

// ── Large variance ($100) → not_reconciled ──
{
  const result = assessReconciliation({ extractedFeeTotal: 100.00, statementFeeTotal: 200.00 });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.NOT_RECONCILED);
  assert.equal(result.overallReconciliationStatus, RECONCILIATION_STATUS.NOT_RECONCILED);
  assert.equal(result.proposalBlocked, true);
  assert.ok(result.blockReason.includes('variance'));
  assert.equal(result.feeVariance, 100.00);
}

// ── No statement fee total → insufficient_evidence ──
{
  const result = assessReconciliation({ extractedFeeTotal: 350.00, statementFeeTotal: null });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.INSUFFICIENT);
  assert.equal(result.overallReconciliationStatus, RECONCILIATION_STATUS.INSUFFICIENT);
  assert.equal(result.status, RECONCILIATION_STATUS.INSUFFICIENT);
  assert.equal(result.proposalBlocked, true);
  assert.ok(result.blockReason.length > 0);
  assert.equal(result.feeStatementTotal, null);
  assert.equal(result.feeVariance, null);
}

// ── No arguments → insufficient_evidence ──
{
  const result = assessReconciliation({});
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.INSUFFICIENT);
  assert.equal(result.proposalBlocked, true);
}

// ── Tolerance is explicit and documented in the result ──
{
  // $0.50 variance with $0.01 default tolerance → partially_reconciled
  const result = assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100.50 });
  assert.equal(result.tolerance, RECONCILIATION_TOLERANCE);
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.PARTIALLY);
  assert.equal(result.toleranceReason, null);
  assert.equal(result.ruleId, null);
  assert.equal(result.supportingEvidence, null);
}

// ── Tolerance boundary: exactly at $0.01 → fee_reconciled ──
{
  const result = assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100 + RECONCILIATION_TOLERANCE });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED);
}

// ── Tolerance boundary: just above $0.01 ($0.02) → partially_reconciled ──
{
  const result = assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100 + RECONCILIATION_TOLERANCE + 0.01 });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.PARTIALLY);
}

// ── transactionCountVariance and volumeVariance remain null; separate dimension statuses present ──
{
  const result = assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100 });
  assert.equal(result.transactionCountVariance, null);
  assert.equal(result.volumeVariance, null);
  assert.equal(result.volumeReconciliationStatus, RECONCILIATION_STATUS.INSUFFICIENT);
  assert.equal(result.transactionCountReconciliationStatus, RECONCILIATION_STATUS.INSUFFICIENT);
}

// ── Savings/proposals are blocked for all currently reachable statuses ──
{
  const cases = [
    assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: null }),
    assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 110 }),
    assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 200 }),
    assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100 }),   // exact fee match still blocked
  ];
  for (const r of cases) {
    assert.equal(r.proposalBlocked, true, `Expected proposalBlocked=true for overallReconciliationStatus ${r.overallReconciliationStatus}`);
  }
}

// ── Unknown fees do not affect the fee reconciliation dimension directly ──
{
  const result = assessReconciliation({ extractedFeeTotal: 95.00, statementFeeTotal: 95.30 });
  // $0.30 > $0.01 → partially_reconciled (not a silent pass)
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.PARTIALLY);
  assert.equal(result.proposalBlocked, true);
}

// ════════════════════════════════════════════════════════════════════════════
// Required regression tests (Sprint 5.0 corrections)
// ════════════════════════════════════════════════════════════════════════════

// R1: A $0.02 unexplained fee variance does NOT reconcile under the default rule
{
  const result = assessReconciliation({ extractedFeeTotal: 100.00, statementFeeTotal: 100.02 });
  assert.notEqual(result.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED,
    'R1: $0.02 variance must not reconcile under $0.01 default tolerance');
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.PARTIALLY);
  assert.equal(result.tolerance, 0.01);
}

// R2: A $0.01 variance may reconcile (fee dimension)
{
  const result = assessReconciliation({ extractedFeeTotal: 100.00, statementFeeTotal: 100.01 });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED,
    'R2: $0.01 variance must reconcile the fee dimension under the default $0.01 rule');
  assert.equal(result.tolerance, 0.01);
}

// R3: A processor-specific documented rounding tolerance can be applied only with rule provenance
{
  const provenanceArgs = {
    extractedFeeTotal: 100.00,
    statementFeeTotal: 100.04,
    tolerance: 0.05,
    toleranceReason: 'Processor rounds monthly totals to nearest $0.05',
    ruleId: 'PROC-ROUND-001',
    supportingEvidence: 'Processor billing guide, section 3.2'
  };

  // With full provenance: custom tolerance is accepted
  const withProvenance = assessReconciliation(provenanceArgs);
  assert.equal(withProvenance.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED,
    'R3a: custom tolerance with provenance must allow fee reconciliation');
  assert.equal(withProvenance.tolerance, 0.05);
  assert.ok(withProvenance.toleranceReason.length > 0);
  assert.ok(withProvenance.ruleId.length > 0);
  assert.ok(withProvenance.supportingEvidence.length > 0);

  // Without provenance: custom tolerance is rejected; default $0.01 applies
  const withoutProvenance = assessReconciliation({
    extractedFeeTotal: 100.00,
    statementFeeTotal: 100.04,
    tolerance: 0.05
    // toleranceReason, ruleId, supportingEvidence intentionally omitted
  });
  assert.notEqual(withoutProvenance.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED,
    'R3b: custom tolerance without provenance must not reconcile');
  assert.equal(withoutProvenance.tolerance, RECONCILIATION_TOLERANCE,
    'R3b: rejected custom tolerance must fall back to default $0.01');
  assert.equal(withoutProvenance.toleranceReason, null);
  assert.equal(withoutProvenance.ruleId, null);
}

// R4: Matching fee totals alone cannot produce overall "reconciled" while
//     volume and transaction counts are unavailable
{
  const result = assessReconciliation({ extractedFeeTotal: 100.00, statementFeeTotal: 100.00 });
  assert.equal(result.feeReconciliationStatus, RECONCILIATION_STATUS.FEE_RECONCILED,
    'R4: fee totals match → fee dimension must be fee_reconciled');
  assert.notEqual(result.overallReconciliationStatus, RECONCILIATION_STATUS.RECONCILED,
    'R4: fee match alone must not produce overall reconciled');
  assert.notEqual(result.status, 'reconciled',
    'R4: status (backward-compat alias for overallReconciliationStatus) must not be reconciled');
  assert.ok(
    [RECONCILIATION_STATUS.PARTIALLY, RECONCILIATION_STATUS.NOT_RECONCILED, RECONCILIATION_STATUS.INSUFFICIENT]
      .includes(result.overallReconciliationStatus),
    'R4: overallReconciliationStatus must be partially_reconciled, not_reconciled, or insufficient_evidence'
  );
}

console.log('Sprint 5.0 reconciliation readiness regression tests passed.');
