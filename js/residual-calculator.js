// Sprint 5.1 — Residual Calculator (INTERNAL ONLY)
// This module computes projected residual, processor revenue, markup revenue,
// and internal profitability for the agent/ISO.
//
// ⚠️  INTERNAL USE ONLY — output of this module must NEVER appear in
//     merchant-facing proposals, UI, or API responses.

function _round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function _round6(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

/**
 * Calculate projected residual income and processor economics.
 *
 * @param {object} params
 * @param {number} params.grossVolume          - monthly card volume
 * @param {number} params.projectedMerchantCost - total fees merchant will pay (from savings calc)
 * @param {number} params.processorCostRate    - processor's buy rate (fraction of volume)
 * @param {number} params.processorCostFixed   - processor's fixed monthly cost
 * @param {number} params.agentMarkupRate      - agent/ISO markup rate (fraction of volume)
 * @param {number} params.agentMarkupFixed     - agent/ISO fixed monthly markup
 * @param {number} params.residualSplitRate    - agent share of markup (0–1); default 1.0 (full)
 * @param {boolean} params.requiresApproval    - whether deal requires manager approval
 * @returns {object} INTERNAL residual result — never expose to merchant
 */
export function calculateResidual({
  grossVolume,
  projectedMerchantCost,
  processorCostRate     = 0,
  processorCostFixed    = 0,
  agentMarkupRate       = 0,
  agentMarkupFixed      = 0,
  residualSplitRate     = 1.0,
  requiresApproval      = false
} = {}) {
  const inputs = {
    grossVolume,
    projectedMerchantCost,
    processorCostRate,
    processorCostFixed,
    agentMarkupRate,
    agentMarkupFixed,
    residualSplitRate,
    requiresApproval
  };

  if (!grossVolume || grossVolume <= 0 || projectedMerchantCost == null) {
    return {
      _internal: true,
      status: 'insufficient_data',
      reason: 'gross_volume and projected_merchant_cost are required',
      processorRevenue: null,
      markupRevenue: null,
      projectedResidual: null,
      internalProfitability: null,
      approvalRequired: requiresApproval,
      trace: {
        formula: null,
        inputs,
        intermediates: {},
        rounding: null,
        assumptions: [],
        finalValue: null
      }
    };
  }

  // Processor revenue = what the processor earns (cost rate × volume + fixed)
  const processorRevenue = _round(grossVolume * processorCostRate + processorCostFixed);

  // Markup revenue = total merchant cost minus processor's cost (agent/ISO gross margin)
  const markupRevenue = _round(projectedMerchantCost - processorRevenue);

  // Projected residual = agent's share of markup revenue
  const projectedResidual = _round(markupRevenue * residualSplitRate);

  // Internal profitability = residual as effective % of volume
  const internalProfitability = _round6(grossVolume > 0 ? projectedResidual / grossVolume : 0);

  // Approval required when residual is negative (deal costs money) or explicitly flagged
  const approvalRequired = requiresApproval || markupRevenue < 0;

  const trace = {
    formula: 'processor_revenue = (gross_volume × processor_cost_rate) + processor_cost_fixed; markup_revenue = projected_merchant_cost − processor_revenue; projected_residual = markup_revenue × residual_split_rate',
    inputs,
    intermediates: { processorRevenue, markupRevenue },
    rounding: 'round half-up to 2 dp; profitability 6 dp',
    assumptions: [
      'processor_cost_rate represents the buy-rate including interchange pass-through',
      'markup_revenue may be negative if deal is priced below cost'
    ],
    finalValue: projectedResidual
  };

  return {
    _internal: true,
    status: 'calculated',
    processorRevenue,
    markupRevenue,
    projectedResidual,
    internalProfitability,
    approvalRequired,
    trace
  };
}

/**
 * Strip all internal-only fields before any merchant-facing output.
 * Call this on ANY object that might contain residual data before
 * returning it to a merchant, UI, or external API.
 *
 * Fields removed: _internal, processorRevenue, markupRevenue,
 * projectedResidual, internalProfitability, approvalRequired,
 * proposedMarkup, processorCost, residualTrace.
 *
 * @param {object} obj - object to sanitise (not mutated; copy is returned)
 * @returns {object}
 */
export function stripInternalFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const INTERNAL_KEYS = new Set([
    '_internal',
    'processorRevenue',
    'markupRevenue',
    'projectedResidual',
    'internalProfitability',
    'approvalRequired',
    'proposedMarkup',
    'processorCost',
    'residualTrace',
    'residual'
  ]);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (INTERNAL_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}
