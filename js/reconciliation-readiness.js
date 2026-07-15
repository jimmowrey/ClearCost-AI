// Default fee reconciliation tolerance: $0.01 (1 cent).
// A larger tolerance may only be applied when toleranceReason, ruleId, and
// supportingEvidence are all supplied; those fields are then recorded in the result.
// Rejected custom tolerances are reported explicitly — ClearCost AI has no silent failures.
export const RECONCILIATION_TOLERANCE = 0.01;

// Fee variance (in dollars) above which feeReconciliationStatus transitions from
// 'partially_reconciled' to 'not_reconciled'.
const PARTIAL_FEE_VARIANCE_THRESHOLD = 10.00;

export const RECONCILIATION_STATUS = Object.freeze({
  FEE_RECONCILED: 'fee_reconciled',   // fee dimension only
  RECONCILED: 'reconciled',           // all required dimensions pass
  PARTIALLY: 'partially_reconciled',
  NOT_RECONCILED: 'not_reconciled',
  INSUFFICIENT: 'insufficient_evidence'
});

// Convert a dollar amount (possibly a floating-point string or number) to an
// integer number of cents using round-half-up to avoid accumulated FP error.
function toCents(dollars) {
  return Math.round(Number(dollars) * 100);
}

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

  // ── Tolerance validation ──────────────────────────────────────────────────
  const defaultToleranceCents = toCents(RECONCILIATION_TOLERANCE);
  const requestedToleranceCents = toCents(tolerance);

  let customToleranceAccepted = false;
  let toleranceRejectionReason = null;
  let warningCode = null;
  const missingProvenanceFields = [];

  let effectiveToleranceCents = defaultToleranceCents;
  let appliedToleranceReason = null;
  let appliedRuleId = null;
  let appliedSupportingEvidence = null;

  if (requestedToleranceCents > defaultToleranceCents) {
    // Check which provenance fields are missing
    if (!toleranceReason) missingProvenanceFields.push('toleranceReason');
    if (!ruleId)          missingProvenanceFields.push('ruleId');
    if (!supportingEvidence) missingProvenanceFields.push('supportingEvidence');

    if (missingProvenanceFields.length === 0) {
      // Full provenance supplied — accept the custom tolerance
      customToleranceAccepted = true;
      effectiveToleranceCents = requestedToleranceCents;
      appliedToleranceReason = toleranceReason;
      appliedRuleId = ruleId;
      appliedSupportingEvidence = supportingEvidence;
    } else {
      // Explicit rejection — never silent
      customToleranceAccepted = false;
      toleranceRejectionReason =
        `Custom tolerance $${Number(tolerance).toFixed(2)} rejected: missing required provenance fields: ${missingProvenanceFields.join(', ')}. Falling back to default $${RECONCILIATION_TOLERANCE.toFixed(2)}.`;
      warningCode = 'CUSTOM_TOLERANCE_REJECTED';
    }
  }

  const effectiveTolerance = effectiveToleranceCents / 100;

  // ── Integer-cent fee arithmetic ───────────────────────────────────────────
  const feeExtractedCents = toCents(extractedFeeTotal || 0);
  const feeStatementTotalCents = statementFeeTotal !== null ? toCents(statementFeeTotal) : null;
  const feeVarianceCents = feeStatementTotalCents !== null
    ? Math.abs(feeExtractedCents - feeStatementTotalCents)
    : null;
  const toleranceCents = effectiveToleranceCents;

  // Display-value dollars (rounded to 2 dp, derived from integer cents)
  const feeExtracted = feeExtractedCents / 100;
  const feeStatementTotal = feeStatementTotalCents !== null ? feeStatementTotalCents / 100 : null;
  const feeVariance = feeVarianceCents !== null ? feeVarianceCents / 100 : null;

  // ── Fee reconciliation dimension ──────────────────────────────────────────
  let feeReconciliationStatus;
  if (feeStatementTotalCents === null) {
    feeReconciliationStatus = RECONCILIATION_STATUS.INSUFFICIENT;
  } else if (feeVarianceCents <= toleranceCents) {
    feeReconciliationStatus = RECONCILIATION_STATUS.FEE_RECONCILED;
  } else if (feeVariance <= PARTIAL_FEE_VARIANCE_THRESHOLD) {
    feeReconciliationStatus = RECONCILIATION_STATUS.PARTIALLY;
  } else {
    feeReconciliationStatus = RECONCILIATION_STATUS.NOT_RECONCILED;
  }

  // ── Volume and transaction-count dimensions ───────────────────────────────
  // Variances cannot yet be computed; they remain null until a future extraction
  // stage provides them.
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

  // ── Build tolerance provenance record ─────────────────────────────────────
  const toleranceProvenance = requestedToleranceCents > defaultToleranceCents
    ? {
        requestedTolerance: requestedToleranceCents / 100,
        appliedTolerance: effectiveTolerance,
        customToleranceAccepted,
        ...(customToleranceAccepted
          ? { toleranceReason: appliedToleranceReason, ruleId: appliedRuleId, supportingEvidence: appliedSupportingEvidence }
          : { toleranceRejectionReason, warningCode, missingProvenanceFields }
        )
      }
    : null;

  return {
    // Integer-cent values (primary comparison basis)
    feeExtractedCents,
    feeStatementTotalCents,
    feeVarianceCents,
    toleranceCents,

    // Dollar display values (derived from integer cents)
    feeExtracted,
    feeStatementTotal,
    feeVariance,
    tolerance: effectiveTolerance,

    // Tolerance provenance (non-null only when a custom tolerance was requested)
    toleranceProvenance,

    // Backward-compat individual provenance fields (populated only when accepted)
    toleranceReason: appliedToleranceReason,
    ruleId: appliedRuleId,
    supportingEvidence: appliedSupportingEvidence,

    // Dimension statuses
    feeReconciliationStatus,
    volumeReconciliationStatus,
    transactionCountReconciliationStatus,
    overallReconciliationStatus,
    status: overallReconciliationStatus,  // backward-compat alias

    // Variance fields
    transactionCountVariance,
    volumeVariance,

    // Proposal gate
    proposalBlocked,
    blockReason
  };
}
