// Sprint 5.1 — Proposal Intelligence Engine
// Converts reconciled statement intelligence into proposal-ready financial analysis.
// This module calculates proposal values ONLY — it does not build a proposal document.
//
// Key rules enforced:
//  • Blocked if reconciliation is incomplete
//  • Never exaggerates savings
//  • Never estimates unknown fees
//  • Never removes unknown fees
//  • Never recommends switching if merchant already has the better deal
//  • Unknown processors fall back to Generic safely
//  • Merchant-facing output never exposes internal pricing/residuals/commissions

export const PROPOSAL_ENGINE_VERSION = '5.1';

import { PRICING_MODELS, MODEL_IDS } from './pricing-models.js';
import { calculateCurrentCost, calculateProjectedCost, calculateSavings } from './savings-calculator.js';
import { calculateResidual, stripInternalFields } from './residual-calculator.js';

// ── Eligibility ───────────────────────────────────────────────────────────────

/**
 * Assess whether the pipeline output is eligible for proposal generation.
 *
 * @param {object} pipelineResult - output of runStatementIntelligencePipeline()
 * @returns {object} eligibility assessment
 */
export function assessProposalEligibility(pipelineResult) {
  const assumptions = [];
  const warnings    = [];
  let eligible      = true;
  let blocked       = false;
  let reason        = null;
  let confidence    = pipelineResult.overallConfidence || 0;

  // Gate 1: Reconciliation must not be blocked
  if (!pipelineResult.reconciliation) {
    eligible  = false;
    blocked   = true;
    reason    = 'Reconciliation data missing from pipeline output';
    return _eligibilityResult({ eligible, blocked, reason, confidence, assumptions, warnings });
  }

  if (pipelineResult.reconciliation.proposalBlocked) {
    eligible = false;
    blocked  = true;
    reason   = pipelineResult.reconciliation.blockReason || 'Reconciliation incomplete';
    warnings.push({ code: 'RECONCILIATION_INCOMPLETE', message: reason, severity: 'error' });
    return _eligibilityResult({ eligible, blocked, reason, confidence, assumptions, warnings });
  }

  // Gate 2: Gross volume must be available
  if (!pipelineResult.metrics || pipelineResult.metrics.grossVolume.status === 'insufficient_evidence') {
    eligible = false;
    blocked  = true;
    reason   = 'Gross processing volume not found in statement; cannot calculate proposal';
    return _eligibilityResult({ eligible, blocked, reason, confidence, assumptions, warnings });
  }

  // Gate 3: Total fees must be available (or estimable from candidates)
  const hasFeeTotal    = pipelineResult.metrics.totalFees.status === 'found';
  const hasCandidates  = Array.isArray(pipelineResult.feeCandidates) && pipelineResult.feeCandidates.length > 0;
  if (!hasFeeTotal && !hasCandidates) {
    eligible = false;
    blocked  = true;
    reason   = 'No fee data found in statement; cannot calculate current processing cost';
    return _eligibilityResult({ eligible, blocked, reason, confidence, assumptions, warnings });
  }

  // Warnings (non-blocking)
  if (pipelineResult.unknownFees && pipelineResult.unknownFees.length > 0) {
    warnings.push({
      code: 'UNKNOWN_FEES_PRESENT',
      message: `${pipelineResult.unknownFees.length} fee(s) could not be classified; included in cost calculations at face value`,
      severity: 'warning'
    });
    assumptions.push('Unknown fees are included in current cost totals at their stated face value');
  }

  if (pipelineResult.processor && pipelineResult.processor.fallback) {
    warnings.push({
      code: 'UNKNOWN_PROCESSOR',
      message: `Processor not identified; using Generic rule pack for fee classification`,
      severity: 'warning'
    });
    assumptions.push('Processor identified as Generic (fallback); interchange rates may not be processor-specific');
    confidence = parseFloat((confidence * 0.85).toFixed(2));
  }

  if (!hasFeeTotal && hasCandidates) {
    assumptions.push('Statement total fees line not found; current cost estimated by summing all extracted fee candidates');
    confidence = parseFloat((confidence * 0.9).toFixed(2));
  }

  return _eligibilityResult({ eligible, blocked, reason, confidence, assumptions, warnings });
}

function _eligibilityResult({ eligible, blocked, reason, confidence, assumptions, warnings }) {
  return { eligible, blocked, reason: reason || null, confidence, assumptions, warnings };
}

// ── Current Pricing Analysis ──────────────────────────────────────────────────

/**
 * Analyse current pricing from the pipeline output.
 *
 * @param {object} pipelineResult
 * @returns {object} current pricing analysis
 */
export function analyseCurrentPricing(pipelineResult) {
  const metrics      = pipelineResult.metrics || {};
  const feeSummary   = pipelineResult.feeSummary || {};
  const feeCandidates = pipelineResult.feeCandidates || [];

  const currentCost = calculateCurrentCost({ metrics, feeSummary, feeCandidates });

  const effectiveRate = currentCost.effectiveRate != null
    ? currentCost.effectiveRate
    : (metrics.effectiveRate && metrics.effectiveRate.status !== 'insufficient_evidence'
        ? metrics.effectiveRate.value
        : null);

  return {
    monthlyCost:     currentCost.monthlyCost,
    effectiveRate,
    grossVolume:     currentCost.grossVolume,
    source:          currentCost.source,
    status:          currentCost.status,
    unknownFeeCount: currentCost.unknownFeeCount,
    unknownFeeTotal: currentCost.unknownFeeTotal,
    feeSummary: {
      classified: feeSummary.classified || 0,
      unknown:    feeSummary.unknown    || 0,
      buckets:    feeSummary.buckets    || {}
    },
    trace: currentCost.trace
  };
}

// ── Pricing Model Comparison ──────────────────────────────────────────────────

/**
 * Compare multiple pricing model scenarios against the current cost.
 *
 * @param {object} params
 * @param {object} params.currentPricing  - from analyseCurrentPricing()
 * @param {Array}  params.scenarios       - array of { modelId, modelParams } objects
 * @returns {Array} comparison results (merchant-facing only)
 */
export function comparePricingModels({ currentPricing, scenarios = [] }) {
  if (!currentPricing || currentPricing.status === 'insufficient_data') {
    return [];
  }

  return scenarios.map(scenario => {
    const model = PRICING_MODELS[scenario.modelId];
    if (!model) {
      return {
        modelId:    scenario.modelId,
        modelName:  scenario.modelId,
        status:     'unknown_model',
        reason:     `Pricing model '${scenario.modelId}' not found`,
        savings:    null
      };
    }

    const modelResult    = model.calculateCost(scenario.modelParams || {});
    const projectedCost  = calculateProjectedCost({ modelResult, grossVolume: currentPricing.grossVolume });
    const savings        = calculateSavings({ currentCost: { status: 'calculated', monthlyCost: currentPricing.monthlyCost }, projectedCost });

    return {
      modelId:              model.id,
      modelName:            model.name,
      projectedMonthlyCost: projectedCost.projectedCost,
      projectedEffectiveRate: projectedCost.effectiveRate,
      savings: {
        monthlySavings:    savings.monthlySavings,
        annualSavings:     savings.annualSavings,
        negativeSavings:   savings.negativeSavings,
        recommendKeepCurrentProcessor: savings.recommendKeepCurrentProcessor,
        reason:            savings.reason || null
      },
      trace: {
        modelTrace:   modelResult.trace,
        savingsTrace: savings.trace
      }
    };
  });
}

// ── Proposal Confidence ───────────────────────────────────────────────────────

/**
 * Calculate overall proposal confidence from all available signals.
 */
function calculateProposalConfidence(eligibility, currentPricing, reconciliation) {
  const scores = [];

  // Base: eligibility-adjusted pipeline confidence
  scores.push(eligibility.confidence);

  // Reconciliation quality
  const recon = reconciliation.status || reconciliation.overallReconciliationStatus;
  if (recon === 'reconciled')           scores.push(0.95);
  else if (recon === 'partially_reconciled') scores.push(0.65);
  else                                       scores.push(0.30);

  // Source quality of current cost
  if (currentPricing.source === 'statement_total')    scores.push(0.95);
  else if (currentPricing.source === 'fee_candidates_sum') scores.push(0.75);

  // Penalise for unknown fees
  if (currentPricing.unknownFeeCount > 0) scores.push(0.80);

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return parseFloat(avg.toFixed(2));
}

// ── Assumption Tracker ────────────────────────────────────────────────────────

function collectAssumptions(eligibility, currentPricing, savings) {
  const assumptions = [...(eligibility.assumptions || [])];
  if (currentPricing.trace && currentPricing.trace.assumptions) {
    for (const a of currentPricing.trace.assumptions) {
      if (!assumptions.includes(a)) assumptions.push(a);
    }
  }
  if (savings && savings.trace && savings.trace.assumptions) {
    for (const a of savings.trace.assumptions) {
      if (!assumptions.includes(a)) assumptions.push(a);
    }
  }
  return assumptions;
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Run the full proposal intelligence engine.
 *
 * @param {object} pipelineResult  - output of runStatementIntelligencePipeline()
 * @param {object} options
 * @param {Array}  options.scenarios         - pricing model scenarios to compare
 * @param {object} options.residualParams    - internal residual calculation params (never merchant-facing)
 * @returns {object} proposal result with merchant-facing and internal sections
 */
export function runProposalEngine(pipelineResult, options = {}) {
  const { scenarios = [], residualParams = null } = options;

  // ── Eligibility check ──────────────────────────────────────────────────────
  const eligibility = assessProposalEligibility(pipelineResult);

  if (!eligibility.eligible) {
    return _blockedProposal(pipelineResult, eligibility);
  }

  // ── Current pricing analysis ───────────────────────────────────────────────
  const currentPricing = analyseCurrentPricing(pipelineResult);

  // ── Pricing model comparisons ──────────────────────────────────────────────
  const modelComparisons = comparePricingModels({ currentPricing, scenarios });

  // ── Best savings scenario ─────────────────────────────────────────────────
  const positiveScenarios = modelComparisons.filter(
    m => m.savings && !m.savings.negativeSavings && m.savings.monthlySavings > 0
  );
  positiveScenarios.sort((a, b) => b.savings.annualSavings - a.savings.annualSavings);
  const bestScenario = positiveScenarios[0] || null;

  // Primary savings figures come from best scenario (or zero if none better)
  const primarySavings = bestScenario
    ? bestScenario.savings
    : {
        monthlySavings: 0,
        annualSavings:  0,
        negativeSavings: modelComparisons.length > 0 && modelComparisons.every(m => m.savings && m.savings.negativeSavings),
        recommendKeepCurrentProcessor: modelComparisons.length > 0 && modelComparisons.every(m => m.savings && m.savings.recommendKeepCurrentProcessor),
        reason: modelComparisons.length === 0 ? 'No pricing scenarios provided' : 'No scenarios produce savings over current pricing'
      };

  // ── Confidence and assumptions ─────────────────────────────────────────────
  const confidence = calculateProposalConfidence(eligibility, currentPricing, pipelineResult.reconciliation);
  const assumptions = collectAssumptions(eligibility, currentPricing, primarySavings);
  const warnings    = [...(eligibility.warnings || [])];

  // ── Internal residual calculation (never merchant-facing) ─────────────────
  let internalResidual = null;
  if (residualParams && bestScenario) {
    internalResidual = calculateResidual({
      grossVolume: currentPricing.grossVolume,
      projectedMerchantCost: bestScenario.projectedMonthlyCost,
      ...residualParams
    });
  }

  // ── Merchant-facing output ─────────────────────────────────────────────────
  const merchantFacing = {
    proposalEligible:       true,
    currentEffectiveRate:   currentPricing.effectiveRate,
    projectedEffectiveRate: bestScenario ? bestScenario.projectedEffectiveRate : null,
    currentMonthlyCost:     currentPricing.monthlyCost,
    projectedMonthlyCost:   bestScenario ? bestScenario.projectedMonthlyCost  : null,
    monthlySavings:         primarySavings.monthlySavings,
    annualSavings:          primarySavings.annualSavings,
    negativeSavings:        primarySavings.negativeSavings || false,
    recommendKeepCurrentProcessor: primarySavings.recommendKeepCurrentProcessor || false,
    confidence,
    assumptions,
    warnings,
    modelComparisons: modelComparisons.map(m => ({
      modelId:               m.modelId,
      modelName:             m.modelName,
      projectedMonthlyCost:  m.projectedMonthlyCost,
      projectedEffectiveRate: m.projectedEffectiveRate,
      monthlySavings:        m.savings ? m.savings.monthlySavings  : null,
      annualSavings:         m.savings ? m.savings.annualSavings   : null,
      negativeSavings:       m.savings ? m.savings.negativeSavings : null,
      recommendKeepCurrentProcessor: m.savings ? m.savings.recommendKeepCurrentProcessor : null,
      reason:                m.savings ? m.savings.reason : m.reason
    }))
  };

  // ── Full internal result (internal fields kept separate) ──────────────────
  return {
    schemaVersion:   PROPOSAL_ENGINE_VERSION,
    timestamp:       new Date().toISOString(),
    sourceFile:      pipelineResult.sourceFile || null,

    // Merchant-facing (safe to return to merchant)
    merchant: merchantFacing,

    // Internal only — never expose to merchant
    _internal: {
      currentPricingDetail: currentPricing,
      modelComparisonsDetail: modelComparisons,
      bestScenario,
      residual: internalResidual,
      reconciliation: pipelineResult.reconciliation,
      eligibility
    }
  };
}

// ── Blocked proposal helper ───────────────────────────────────────────────────

function _blockedProposal(pipelineResult, eligibility) {
  return {
    schemaVersion: PROPOSAL_ENGINE_VERSION,
    timestamp:     new Date().toISOString(),
    sourceFile:    pipelineResult.sourceFile || null,

    merchant: {
      proposalEligible: false,
      blocked:          true,
      reason:           eligibility.reason,
      confidence:       eligibility.confidence,
      assumptions:      eligibility.assumptions,
      warnings:         eligibility.warnings,

      // All financial fields null when blocked
      currentEffectiveRate:   null,
      projectedEffectiveRate: null,
      currentMonthlyCost:     null,
      projectedMonthlyCost:   null,
      monthlySavings:         null,
      annualSavings:          null,
      negativeSavings:        false,
      recommendKeepCurrentProcessor: false,
      modelComparisons:       []
    },

    // Internal — preserve all evidence even when blocked
    _internal: {
      eligibility,
      reconciliation: pipelineResult.reconciliation || null,
      metrics:        pipelineResult.metrics        || null,
      feeSummary:     pipelineResult.feeSummary     || null,
      unknownFees:    pipelineResult.unknownFees    || []
    }
  };
}

// ── Merchant-safe export ──────────────────────────────────────────────────────

/**
 * Return only the merchant-facing portion of a proposal result.
 * Strips all internal fields.
 *
 * @param {object} proposalResult - from runProposalEngine()
 * @returns {object} merchant-safe proposal
 */
export function getMerchantFacingProposal(proposalResult) {
  return {
    schemaVersion: proposalResult.schemaVersion,
    timestamp:     proposalResult.timestamp,
    sourceFile:    proposalResult.sourceFile,
    ...proposalResult.merchant
  };
}
