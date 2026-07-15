// Sprint 5.1 — Savings Calculator
// Computes current vs projected processing cost and monthly/annual savings.
// Never exaggerates savings; never estimates unknown fees; never removes unknown fees.
// If projected cost exceeds current cost, returns negativeSavings with a recommendation
// to keep the current processor.

function _round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function _round6(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

/**
 * Calculate current monthly processing cost from pipeline metrics.
 *
 * @param {object} params
 * @param {object} params.metrics      - extractStatementMetrics() output
 * @param {object} params.feeSummary   - feeSummary from pipeline (includes unknowns)
 * @param {Array}  params.feeCandidates - all fee candidates (classified + unknown)
 * @returns {object} cost result with trace
 */
export function calculateCurrentCost({ metrics, feeSummary, feeCandidates = [] }) {
  const trace = {
    formula: null,
    inputs: {},
    intermediates: {},
    rounding: 'round half-up to 2 dp',
    assumptions: [],
    evidence: {},
    finalValue: null
  };

  // Prefer statement-reported total fees (most authoritative)
  if (metrics.totalFees && metrics.totalFees.status === 'found') {
    const value = _round(metrics.totalFees.value);
    trace.formula = 'extracted from statement: total_fees line';
    trace.inputs = { totalFeesRaw: metrics.totalFees.value };
    trace.evidence = metrics.totalFees.evidence;
    trace.assumptions = metrics.totalFees.assumptions || [];
    trace.finalValue = value;
    return {
      status: 'calculated',
      source: 'statement_total',
      monthlyCost: value,
      grossVolume: metrics.grossVolume.status === 'found' ? metrics.grossVolume.value : null,
      effectiveRate: metrics.effectiveRate.status !== 'insufficient_evidence' ? metrics.effectiveRate.value : null,
      unknownFeeCount: feeSummary ? feeSummary.unknown : 0,
      unknownFeeTotal: _round(feeSummary ? (feeSummary.buckets && feeSummary.buckets.unknown != null ? feeSummary.buckets.unknown : 0) : 0),
      trace
    };
  }

  // Fall back to summing all extracted fee candidates (including unknowns — never ignored)
  if (feeCandidates.length > 0) {
    const classifiedTotal = _round(feeCandidates.filter(f => f.status === 'classified').reduce((s, f) => s + Number(f.amount || 0), 0));
    const unknownTotal    = _round(feeCandidates.filter(f => f.status !== 'classified').reduce((s, f) => s + Number(f.amount || 0), 0));
    const totalFromCandidates = _round(classifiedTotal + unknownTotal);

    trace.formula = 'sum of all extracted fee candidates (classified + unknown)';
    trace.inputs = { classifiedTotal, unknownTotal, feeCount: feeCandidates.length };
    trace.intermediates = { classifiedTotal, unknownTotal };
    trace.assumptions = [
      'statement total fees line not found; summing all extracted fee candidates',
      'unknown fees are included and never removed'
    ];
    trace.finalValue = totalFromCandidates;

    return {
      status: 'estimated',
      source: 'fee_candidates_sum',
      monthlyCost: totalFromCandidates,
      grossVolume: metrics.grossVolume.status === 'found' ? metrics.grossVolume.value : null,
      effectiveRate: metrics.grossVolume.status === 'found' && metrics.grossVolume.value > 0
        ? _round6(totalFromCandidates / metrics.grossVolume.value)
        : null,
      unknownFeeCount: feeSummary ? feeSummary.unknown : feeCandidates.filter(f => f.status !== 'classified').length,
      unknownFeeTotal: unknownTotal,
      trace
    };
  }

  // Insufficient data
  trace.formula = 'no cost data available';
  trace.assumptions = ['neither statement total fees nor fee candidates found'];
  trace.finalValue = null;
  return {
    status: 'insufficient_data',
    source: null,
    monthlyCost: null,
    grossVolume: null,
    effectiveRate: null,
    unknownFeeCount: 0,
    unknownFeeTotal: 0,
    trace
  };
}

/**
 * Calculate projected monthly processing cost using a pricing model result.
 *
 * @param {object} params
 * @param {object} params.modelResult   - output of pricingModel.calculateCost()
 * @param {number|null} params.grossVolume
 * @returns {object} projected cost result with trace
 */
export function calculateProjectedCost({ modelResult, grossVolume }) {
  if (!modelResult || modelResult.status === 'blocked') {
    return {
      status: 'blocked',
      reason: modelResult ? modelResult.reason : 'no pricing model result provided',
      projectedCost: null,
      effectiveRate: null,
      modelId: modelResult ? modelResult.modelId : null,
      trace: {
        formula: null,
        inputs: { modelResult },
        intermediates: {},
        rounding: null,
        assumptions: [],
        finalValue: null
      }
    };
  }

  const projectedCost = _round(modelResult.totalCost);
  const effectiveRate = modelResult.effectiveRate != null ? modelResult.effectiveRate : null;

  return {
    status: 'calculated',
    projectedCost,
    effectiveRate,
    modelId: modelResult.modelId,
    modelName: modelResult.modelName,
    breakdown: modelResult.breakdown,
    trace: {
      formula: modelResult.trace.formula,
      inputs: modelResult.trace.inputs,
      intermediates: modelResult.trace.intermediates,
      rounding: modelResult.trace.rounding,
      assumptions: modelResult.trace.assumptions || [],
      evidence: {},
      finalValue: projectedCost
    }
  };
}

/**
 * Calculate savings: monthly and annual.
 * If projected cost >= current cost, returns negativeSavings.
 *
 * @param {object} params
 * @param {object} params.currentCost   - from calculateCurrentCost()
 * @param {object} params.projectedCost - from calculateProjectedCost()
 * @returns {object} savings result
 */
export function calculateSavings({ currentCost, projectedCost }) {
  const trace = {
    formula: null,
    inputs: {},
    intermediates: {},
    rounding: 'round half-up to 2 dp',
    assumptions: [],
    finalValue: null
  };

  if (currentCost.status === 'insufficient_data') {
    return {
      status: 'blocked',
      reason: 'current cost data is insufficient',
      negativeSavings: false,
      recommendKeepCurrentProcessor: false,
      monthlySavings: null,
      annualSavings: null,
      currentMonthlyCost: null,
      projectedMonthlyCost: null,
      trace
    };
  }

  if (projectedCost.status === 'blocked') {
    return {
      status: 'blocked',
      reason: projectedCost.reason || 'projected cost calculation blocked',
      negativeSavings: false,
      recommendKeepCurrentProcessor: false,
      monthlySavings: null,
      annualSavings: null,
      currentMonthlyCost: currentCost.monthlyCost,
      projectedMonthlyCost: null,
      trace
    };
  }

  const current   = currentCost.monthlyCost;
  const projected = projectedCost.projectedCost;

  trace.formula = 'current_monthly_cost − projected_monthly_cost';
  trace.inputs  = { currentMonthlyCost: current, projectedMonthlyCost: projected };

  const rawMonthlySavings = _round(current - projected);
  const annualSavings     = _round(rawMonthlySavings * 12);

  trace.intermediates = { rawMonthlySavings, annualSavings };
  trace.finalValue    = rawMonthlySavings;

  // Negative savings: projected is more expensive — recommend keeping current processor
  if (rawMonthlySavings <= 0) {
    return {
      status: 'calculated',
      negativeSavings: true,
      recommendKeepCurrentProcessor: true,
      reason: rawMonthlySavings === 0
        ? 'Projected cost equals current cost; no savings achieved'
        : `Projected cost $${projected.toFixed(2)} exceeds current cost $${current.toFixed(2)} by $${Math.abs(rawMonthlySavings).toFixed(2)}/month`,
      monthlySavings: rawMonthlySavings,
      annualSavings,
      currentMonthlyCost: current,
      projectedMonthlyCost: projected,
      trace
    };
  }

  return {
    status: 'calculated',
    negativeSavings: false,
    recommendKeepCurrentProcessor: false,
    monthlySavings: rawMonthlySavings,
    annualSavings,
    currentMonthlyCost: current,
    projectedMonthlyCost: projected,
    trace
  };
}
