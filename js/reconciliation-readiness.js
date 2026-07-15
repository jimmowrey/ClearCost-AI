export const RECONCILIATION_TOLERANCE = 0.50;

export const RECONCILIATION_STATUS = Object.freeze({
  RECONCILED: 'reconciled',
  PARTIALLY: 'partially_reconciled',
  NOT_RECONCILED: 'not_reconciled',
  INSUFFICIENT: 'insufficient_evidence'
});

export function assessReconciliation({
  extractedFeeTotal = 0,
  statementFeeTotal = null,
  statementTransactionCount = null,
  statementVolume = null,
  tolerance = RECONCILIATION_TOLERANCE
} = {}) {
  const extracted = parseFloat(Number(extractedFeeTotal || 0).toFixed(2));
  const statementTotal = statementFeeTotal !== null ? parseFloat(Number(statementFeeTotal).toFixed(2)) : null;
  const feeVariance = statementTotal !== null ? parseFloat(Math.abs(extracted - statementTotal).toFixed(2)) : null;

  let status;
  let proposalBlocked = true;
  let blockReason = null;

  if (statementTotal === null) {
    status = RECONCILIATION_STATUS.INSUFFICIENT;
    blockReason = 'Statement fee total not found in document; reconciliation cannot be assessed';
  } else if (feeVariance <= tolerance) {
    status = RECONCILIATION_STATUS.RECONCILED;
    proposalBlocked = false;
  } else if (feeVariance <= tolerance * 20) {
    status = RECONCILIATION_STATUS.PARTIALLY;
    blockReason = `Fee variance $${feeVariance.toFixed(2)} exceeds tolerance $${tolerance.toFixed(2)}`;
  } else {
    status = RECONCILIATION_STATUS.NOT_RECONCILED;
    blockReason = `Fee variance $${feeVariance.toFixed(2)} significantly exceeds tolerance $${tolerance.toFixed(2)}`;
  }

  return {
    feeExtracted: extracted,
    feeStatementTotal: statementTotal,
    feeVariance,
    transactionCountVariance: null,
    volumeVariance: null,
    tolerance: parseFloat(tolerance.toFixed(2)),
    status,
    proposalBlocked,
    blockReason
  };
}
