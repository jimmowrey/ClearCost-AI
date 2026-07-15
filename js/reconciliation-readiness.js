// Default fee reconciliation tolerance: $0.01.
// A larger tolerance may only be applied when toleranceReason, ruleId, and
// supportingEvidence are all supplied; those fields are then recorded in the result.
export const RECONCILIATION_TOLERANCE = 0.01;

// Fee variance above which feeReconciliationStatus transitions from
// 'partially_reconciled' to 'not_reconciled'.
const PARTIAL_FEE_VARIANCE_THRESHOLD = 10.00;

export const RECONCILIATION_STATUS = Object.freeze({
  FEE_RECONCILED: 'fee_reconciled',   // fee dimension only
  RECONCILED: 'reconciled',           // all required dimensions pass
  PARTIALLY: 'partially_reconciled',
  NOT_RECONCILED: 'not_reconciled',
  INSUFFICIENT: 'insufficient_evidence'
});

export function assessReconciliation({
  extractedFeeTotal = 0,
  statementFeeTotal = null,
  statementTransactionCount = null,
  statementVolume = null,
  tolerance = RECONCILIATION_TOLERANCE,
  toleranceReason = null,
  ruleId = null,
  supportingEvidence = null
} = {}) {
  // A tolerance larger than the default is only accepted when all three
  // provenance fields are provided; otherwise the default $0.01 is used.
  let effectiveTolerance = RECONCILIATION_TOLERANCE;
  let appliedToleranceReason = null;
  let appliedRuleId = null;
  let appliedSupportingEvidence = null;

  if (tolerance > RECONCILIATION_TOLERANCE) {
    if (toleranceReason && ruleId && supportingEvidence) {
      effectiveTolerance = parseFloat(Number(tolerance).toFixed(2));
      appliedToleranceReason = toleranceReason;
      appliedRuleId = ruleId;
      appliedSupportingEvidence = supportingEvidence;
    }
    // Without provenance the larger tolerance is silently rejected.
  }

  const extracted = parseFloat(Number(extractedFeeTotal || 0).toFixed(2));
  const statementTotal = statementFeeTotal !== null ? parseFloat(Number(statementFeeTotal).toFixed(2)) : null;
  const feeVariance = statementTotal !== null ? parseFloat(Math.abs(extracted - statementTotal).toFixed(2)) : null;

  // ── Fee reconciliation dimension ──────────────────────────────────────────
  let feeReconciliationStatus;
  if (statementTotal === null) {
    feeReconciliationStatus = RECONCILIATION_STATUS.INSUFFICIENT;
  } else if (feeVariance <= effectiveTolerance) {
    feeReconciliationStatus = RECONCILIATION_STATUS.FEE_RECONCILED;
  } else if (feeVariance <= PARTIAL_FEE_VARIANCE_THRESHOLD) {
    feeReconciliationStatus = RECONCILIATION_STATUS.PARTIALLY;
  } else {
    feeReconciliationStatus = RECONCILIATION_STATUS.NOT_RECONCILED;
  }

  // ── Volume and transaction-count dimensions ───────────────────────────────
  // These variances cannot yet be computed (no extracted counterpart to compare
  // against); they remain null until a future extraction stage provides them.
  const transactionCountVariance = null;
  const volumeVariance = null;
  const volumeReconciliationStatus = RECONCILIATION_STATUS.INSUFFICIENT;
  const transactionCountReconciliationStatus = RECONCILIATION_STATUS.INSUFFICIENT;

  // ── Overall reconciliation status ─────────────────────────────────────────
  // 'reconciled' requires every dimension to pass.  While transactionCountVariance
  // and volumeVariance are unavailable (null) the statement must not be called
  // fully reconciled.
  let overallReconciliationStatus;
  if (feeReconciliationStatus === RECONCILIATION_STATUS.INSUFFICIENT) {
    overallReconciliationStatus = RECONCILIATION_STATUS.INSUFFICIENT;
  } else if (feeReconciliationStatus === RECONCILIATION_STATUS.NOT_RECONCILED) {
    overallReconciliationStatus = RECONCILIATION_STATUS.NOT_RECONCILED;
  } else if (feeReconciliationStatus === RECONCILIATION_STATUS.PARTIALLY) {
    overallReconciliationStatus = RECONCILIATION_STATUS.PARTIALLY;
  } else {
    // Fee dimension reconciled; volume and transaction-count still unverifiable.
    overallReconciliationStatus = RECONCILIATION_STATUS.PARTIALLY;
  }

  // ── Proposal gate ─────────────────────────────────────────────────────────
  const proposalBlocked = overallReconciliationStatus !== RECONCILIATION_STATUS.RECONCILED;

  let blockReason = null;
  if (feeReconciliationStatus === RECONCILIATION_STATUS.INSUFFICIENT) {
    blockReason = 'Statement fee total not found in document; reconciliation cannot be assessed';
  } else if (feeReconciliationStatus === RECONCILIATION_STATUS.NOT_RECONCILED) {
    blockReason = `Fee variance $${feeVariance.toFixed(2)} significantly exceeds tolerance $${effectiveTolerance.toFixed(2)}`;
  } else if (feeReconciliationStatus === RECONCILIATION_STATUS.PARTIALLY) {
    blockReason = `Fee variance $${feeVariance.toFixed(2)} exceeds tolerance $${effectiveTolerance.toFixed(2)}`;
  } else {
    blockReason = 'Volume and transaction count reconciliation data unavailable; overall reconciliation incomplete';
  }

  return {
    feeExtracted: extracted,
    feeStatementTotal: statementTotal,
    feeVariance,
    transactionCountVariance,
    volumeVariance,
    tolerance: parseFloat(effectiveTolerance.toFixed(2)),
    toleranceReason: appliedToleranceReason,
    ruleId: appliedRuleId,
    supportingEvidence: appliedSupportingEvidence,
    feeReconciliationStatus,
    volumeReconciliationStatus,
    transactionCountReconciliationStatus,
    overallReconciliationStatus,
    status: overallReconciliationStatus,  // backward-compat alias
    proposalBlocked,
    blockReason
  };
}
