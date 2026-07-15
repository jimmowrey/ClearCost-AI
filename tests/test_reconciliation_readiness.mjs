import assert from 'node:assert/strict';
import {assessReconciliation, RECONCILIATION_STATUS, RECONCILIATION_TOLERANCE} from '../js/reconciliation-readiness.js';

// Reconciled statement — fee variance within tolerance
{
  const result = assessReconciliation({ extractedFeeTotal: 1200.00, statementFeeTotal: 1200.25 });
  assert.equal(result.status, RECONCILIATION_STATUS.RECONCILED);
  assert.equal(result.proposalBlocked, false);
  assert.equal(result.blockReason, null);
  assert.ok(result.feeVariance <= RECONCILIATION_TOLERANCE);
  assert.equal(result.feeExtracted, 1200.00);
  assert.equal(result.feeStatementTotal, 1200.25);
}

// Reconciled — exact match
{
  const result = assessReconciliation({ extractedFeeTotal: 500.00, statementFeeTotal: 500.00 });
  assert.equal(result.status, RECONCILIATION_STATUS.RECONCILED);
  assert.equal(result.feeVariance, 0.00);
  assert.equal(result.proposalBlocked, false);
}

// Partially reconciled — small variance exceeding tolerance but not extreme
{
  const result = assessReconciliation({ extractedFeeTotal: 1200.00, statementFeeTotal: 1205.00 });
  assert.equal(result.status, RECONCILIATION_STATUS.PARTIALLY);
  assert.equal(result.proposalBlocked, true);
  assert.ok(result.blockReason.includes('variance'));
  assert.equal(result.feeVariance, 5.00);
}

// Not reconciled — large variance
{
  const result = assessReconciliation({ extractedFeeTotal: 100.00, statementFeeTotal: 200.00 });
  assert.equal(result.status, RECONCILIATION_STATUS.NOT_RECONCILED);
  assert.equal(result.proposalBlocked, true);
  assert.ok(result.blockReason.includes('variance'));
  assert.equal(result.feeVariance, 100.00);
}

// Insufficient evidence — no statement fee total
{
  const result = assessReconciliation({ extractedFeeTotal: 350.00, statementFeeTotal: null });
  assert.equal(result.status, RECONCILIATION_STATUS.INSUFFICIENT);
  assert.equal(result.proposalBlocked, true);
  assert.ok(result.blockReason.length > 0);
  assert.equal(result.feeStatementTotal, null);
  assert.equal(result.feeVariance, null);
}

// Insufficient evidence — no arguments
{
  const result = assessReconciliation({});
  assert.equal(result.status, RECONCILIATION_STATUS.INSUFFICIENT);
  assert.equal(result.proposalBlocked, true);
}

// Tolerance is explicit and documented
{
  const result = assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100.50 });
  assert.equal(result.tolerance, RECONCILIATION_TOLERANCE);
  assert.equal(result.status, RECONCILIATION_STATUS.RECONCILED);
}

// Tolerance boundary — exactly at tolerance is reconciled
{
  const result = assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100 + RECONCILIATION_TOLERANCE });
  assert.equal(result.status, RECONCILIATION_STATUS.RECONCILED);
}

// Tolerance boundary — just above tolerance is partially reconciled
{
  const result = assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100 + RECONCILIATION_TOLERANCE + 0.01 });
  assert.equal(result.status, RECONCILIATION_STATUS.PARTIALLY);
}

// transactionCountVariance and volumeVariance are present (currently null — reserved for future extraction)
{
  const result = assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 100 });
  assert.equal(result.transactionCountVariance, null);
  assert.equal(result.volumeVariance, null);
}

// Savings/proposals are blocked for all non-reconciled statuses
{
  const statuses = [
    assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: null }),
    assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 110 }),
    assessReconciliation({ extractedFeeTotal: 100, statementFeeTotal: 200 })
  ];
  for (const r of statuses) {
    assert.equal(r.proposalBlocked, true, `Expected proposalBlocked=true for status ${r.status}`);
  }
}

// Unknown fees do not affect reconciliation calculation directly
{
  const result = assessReconciliation({ extractedFeeTotal: 95.00, statementFeeTotal: 95.30 });
  assert.equal(result.status, RECONCILIATION_STATUS.RECONCILED);
}

console.log('Sprint 5.0 reconciliation readiness regression tests passed.');
