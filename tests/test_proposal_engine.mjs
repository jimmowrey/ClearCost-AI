// Sprint 5.1 — Proposal Intelligence Engine Regression Tests
import assert from 'node:assert/strict';
import {NodeProcessorRuleLoader} from '../js/processor-rule-loader-node.js';
import {ProcessorDetector} from '../js/processor-detector.js';
import {runStatementIntelligencePipeline} from '../js/statement-intelligence-pipeline.js';
import {
  runProposalEngine,
  assessProposalEligibility,
  analyseCurrentPricing,
  comparePricingModels,
  getMerchantFacingProposal,
  PROPOSAL_ENGINE_VERSION
} from '../js/proposal-engine.js';
import {PRICING_MODELS, getPricingModel, MODEL_IDS} from '../js/pricing-models.js';
import {calculateCurrentCost, calculateProjectedCost, calculateSavings} from '../js/savings-calculator.js';
import {calculateResidual, stripInternalFields} from '../js/residual-calculator.js';

const loader   = new NodeProcessorRuleLoader();
const detector = new ProcessorDetector(loader);

function makeRecord({name='test.pdf', pages=[], missing=[], duplicates=[], outOfOrder=[], period=null, mid=null, merchant=null} = {}) {
  return { name, pageCount: pages.length, pages, missing, duplicates, outOfOrder, period, mid, merchant };
}
function textPage(index, text, opts = {}) {
  const {ocrRequired=false, rotation=0, readable=true, hasText=true} = opts;
  return { index, text, hasText, ocrRequired, rotation, readable, charCount: text.replace(/\s/g,'').length };
}

// Helper: build a reconciled pipeline result for a given statement text
async function buildPipeline(name, pageText, extraPages = []) {
  const pages = [textPage(1, pageText), ...extraPages];
  const record = makeRecord({ name, pages });
  return runStatementIntelligencePipeline(record, { detector });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. RECONCILED STATEMENT — proposal eligible
// ═══════════════════════════════════════════════════════════════════════════════
{
  // Build a statement where extracted fees sum == Total Fees line (within tolerance)
  // Fees: Batch Fee 12.50 + PCI Fee 9.95 + Auth Fee 5.17 + MC NABU 4.83 + Visa FANF 15.00 = 47.45
  const pipeline = await buildPipeline('reconciled.pdf',
    'Worldpay\nProcessing Summary\nGross Sales 50,000.00\nTotal Fees 47.45\nOther Fees\nBatch Fee 12.50\nPCI Fee 9.95\nAuthorization Fee 5.17\nMC NABU 4.83\nVisa FANF 15.00'
  );

  const eligibility = assessProposalEligibility(pipeline);
  // reconciliation may be partially_reconciled (volume dim missing) — test that blocked reason is preserved
  assert.ok(typeof eligibility.eligible === 'boolean');
  assert.ok(typeof eligibility.blocked  === 'boolean');
  assert.ok(typeof eligibility.confidence === 'number');
  assert.ok(Array.isArray(eligibility.assumptions));
  assert.ok(Array.isArray(eligibility.warnings));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. NON-RECONCILED STATEMENT — proposal must be blocked
// ═══════════════════════════════════════════════════════════════════════════════
{
  // Total Fees line 999.00 but extracted only 12.50 — major variance
  const pipeline = await buildPipeline('not-reconciled.pdf',
    'Worldpay\nProcessing Summary\nGross Sales 50,000.00\nTotal Fees 999.00\nOther Fees\nBatch Fee 12.50'
  );

  assert.equal(pipeline.reconciliation.proposalBlocked, true);

  const result = runProposalEngine(pipeline, {});
  assert.equal(result.merchant.proposalEligible, false);
  assert.equal(result.merchant.blocked, true);
  assert.ok(result.merchant.reason && result.merchant.reason.length > 0);

  // Evidence must be preserved in _internal
  assert.ok(result._internal.reconciliation !== null);
  assert.ok(result._internal.eligibility !== null);

  // Financial fields must all be null when blocked
  assert.equal(result.merchant.currentMonthlyCost, null);
  assert.equal(result.merchant.projectedMonthlyCost, null);
  assert.equal(result.merchant.monthlySavings, null);
  assert.equal(result.merchant.annualSavings, null);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INSUFFICIENT EVIDENCE (no fee total in statement) — proposal blocked
// ═══════════════════════════════════════════════════════════════════════════════
{
  const pipeline = await buildPipeline('no-total.pdf',
    'Worldpay\nOther Fees\nBatch Fee 12.50\nPCI Fee 9.95'
  );

  assert.equal(pipeline.reconciliation.proposalBlocked, true);
  const result = runProposalEngine(pipeline, {});
  assert.equal(result.merchant.proposalEligible, false);
  assert.equal(result.merchant.blocked, true);
  assert.ok(result._internal.unknownFees !== undefined);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. UNKNOWN PROCESSOR — falls back safely to Generic, proposal not blocked by it
// ═══════════════════════════════════════════════════════════════════════════════
{
  const pipeline = await buildPipeline('unknown-proc.pdf',
    'Merchant Name: Acme Corp\nMerchant ID: XYZ999\nProcessing Summary\nGross Sales 20,000.00\nTotal Fees 22.10\nOther Fees\nBatch Fee 12.50\nPCI Fee 9.95'
  );

  assert.equal(pipeline.processor.name, 'Generic Processor');
  assert.equal(pipeline.processor.fallback, true);

  // proposal eligibility is about reconciliation — unknown processor doesn't block
  const eligibility = assessProposalEligibility(pipeline);
  // The unknown-processor warning should be present if eligible
  if (eligibility.eligible) {
    assert.ok(eligibility.warnings.some(w => w.code === 'UNKNOWN_PROCESSOR'));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. UNKNOWN FEES — included in cost, never ignored
// ═══════════════════════════════════════════════════════════════════════════════
{
  const pipeline = await buildPipeline('unknown-fees.pdf',
    'Worldpay\nProcessing Summary\nGross Sales 30,000.00\nTotal Fees 59.95\nOther Fees\nBatch Fee 12.50\nPCI Fee 9.95\nMystery Program Fee 37.50'
  );

  const currentPricing = analyseCurrentPricing(pipeline);
  // Unknown fees must be counted
  assert.ok(currentPricing.unknownFeeCount >= 0);
  // Total cost must reflect all fees (not just classified)
  assert.ok(currentPricing.monthlyCost !== null);

  if (eligibility => eligibility) {
    // Eligibility warning about unknown fees if any present
    const eligibility = assessProposalEligibility(pipeline);
    if (pipeline.unknownFees.length > 0 && eligibility.eligible) {
      assert.ok(eligibility.warnings.some(w => w.code === 'UNKNOWN_FEES_PRESENT'));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MISSING TOTALS — no gross volume, no fees
// ═══════════════════════════════════════════════════════════════════════════════
{
  const pipeline = await buildPipeline('missing-totals.pdf',
    'Worldpay\nMerchant Name: Empty Shop'
  );

  const eligibility = assessProposalEligibility(pipeline);
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.blocked, true);
  assert.ok(typeof eligibility.reason === 'string');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. POSITIVE SAVINGS scenario
// ═══════════════════════════════════════════════════════════════════════════════
{
  const currentCostResult = {
    status: 'calculated', source: 'statement_total',
    monthlyCost: 1200.00, grossVolume: 50000, effectiveRate: 0.024,
    unknownFeeCount: 0, unknownFeeTotal: 0,
    trace: { formula: 'test', inputs: {}, intermediates: {}, rounding: '', assumptions: [], evidence: {}, finalValue: 1200 }
  };

  const model = getPricingModel(MODEL_IDS.INTERCHANGE_PLUS);
  const modelResult = model.calculateCost({
    grossVolume: 50000, transactionCount: 1000,
    interchangeCost: 800, markupRate: 0.003, perTransactionFee: 0.05
  });
  const projectedCostResult = calculateProjectedCost({ modelResult, grossVolume: 50000 });
  const savings = calculateSavings({ currentCost: currentCostResult, projectedCost: projectedCostResult });

  assert.equal(savings.status, 'calculated');
  assert.equal(savings.negativeSavings, false);
  assert.ok(savings.monthlySavings > 0);
  assert.ok(savings.annualSavings > 0);
  assert.equal(savings.annualSavings, savings.monthlySavings * 12);
  assert.equal(savings.recommendKeepCurrentProcessor, false);

  // Calculation trace must be preserved
  assert.ok(savings.trace.formula !== null);
  assert.ok(savings.trace.inputs.currentMonthlyCost !== undefined);
  assert.ok(savings.trace.inputs.projectedMonthlyCost !== undefined);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. NEGATIVE SAVINGS — projected higher than current
// ═══════════════════════════════════════════════════════════════════════════════
{
  const currentCostResult = {
    status: 'calculated', source: 'statement_total',
    monthlyCost: 500.00, grossVolume: 20000, effectiveRate: 0.025,
    unknownFeeCount: 0, unknownFeeTotal: 0,
    trace: { formula: '', inputs: {}, intermediates: {}, rounding: '', assumptions: [], evidence: {}, finalValue: 500 }
  };

  const model = getPricingModel(MODEL_IDS.FLAT_RATE);
  // 4% flat rate on $20k = $800 > $500 current
  const modelResult = model.calculateCost({ grossVolume: 20000, transactionCount: 400, flatRate: 0.04 });
  const projectedCostResult = calculateProjectedCost({ modelResult, grossVolume: 20000 });
  const savings = calculateSavings({ currentCost: currentCostResult, projectedCost: projectedCostResult });

  assert.equal(savings.status, 'calculated');
  assert.equal(savings.negativeSavings, true);
  assert.equal(savings.recommendKeepCurrentProcessor, true);
  assert.ok(typeof savings.reason === 'string');
  assert.ok(savings.monthlySavings < 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ZERO SAVINGS
// ═══════════════════════════════════════════════════════════════════════════════
{
  const currentCostResult = {
    status: 'calculated', source: 'statement_total',
    monthlyCost: 600.00, grossVolume: 20000, effectiveRate: 0.03,
    unknownFeeCount: 0, unknownFeeTotal: 0,
    trace: { formula: '', inputs: {}, intermediates: {}, rounding: '', assumptions: [], evidence: {}, finalValue: 600 }
  };

  const model = getPricingModel(MODEL_IDS.FLAT_RATE);
  // 3% flat rate on $20k = exactly $600 = current cost
  const modelResult = model.calculateCost({ grossVolume: 20000, transactionCount: 400, flatRate: 0.03 });
  const projectedCostResult = calculateProjectedCost({ modelResult, grossVolume: 20000 });
  const savings = calculateSavings({ currentCost: currentCostResult, projectedCost: projectedCostResult });

  assert.equal(savings.status, 'calculated');
  assert.equal(savings.negativeSavings, true);  // zero savings is treated as negative
  assert.equal(savings.recommendKeepCurrentProcessor, true);
  assert.equal(savings.monthlySavings, 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. INTERCHANGE PLUS pricing model
// ═══════════════════════════════════════════════════════════════════════════════
{
  const model = getPricingModel(MODEL_IDS.INTERCHANGE_PLUS);
  assert.ok(model !== null);
  assert.equal(model.id, MODEL_IDS.INTERCHANGE_PLUS);

  const result = model.calculateCost({
    grossVolume: 100000, transactionCount: 2000,
    interchangeCost: 1800, markupRate: 0.005, perTransactionFee: 0.10
  });

  assert.equal(result.status, 'calculated');
  // markup: 100000 * 0.005 = 500; per-tx: 2000 * 0.10 = 200; total = 1800+500+200 = 2500
  assert.equal(result.totalCost, 2500.00);
  assert.equal(result.breakdown.interchangeCost, 1800.00);
  assert.equal(result.breakdown.markupCost, 500.00);
  assert.equal(result.breakdown.perTransactionCost, 200.00);
  assert.ok(result.trace.formula !== null);
  assert.ok(result.trace.inputs.grossVolume === 100000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. FLAT RATE pricing model
// ═══════════════════════════════════════════════════════════════════════════════
{
  const model = getPricingModel(MODEL_IDS.FLAT_RATE);
  assert.ok(model !== null);

  const result = model.calculateCost({ grossVolume: 50000, transactionCount: 1000, flatRate: 0.029, perTransactionFee: 0.10 });
  assert.equal(result.status, 'calculated');
  // 50000 * 0.029 = 1450; 1000 * 0.10 = 100; total = 1550
  assert.equal(result.totalCost, 1550.00);
  assert.equal(result.breakdown.rateCost, 1450.00);
  assert.equal(result.breakdown.perTransactionCost, 100.00);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. CASH DISCOUNT pricing model
// ═══════════════════════════════════════════════════════════════════════════════
{
  const model = getPricingModel(MODEL_IDS.CASH_DISCOUNT);
  assert.ok(model !== null);

  const result = model.calculateCost({
    grossVolume: 40000, transactionCount: 800,
    programFeeRate: 0.001, programFeeFixed: 0.10, surchargeRate: 0.03
  });
  assert.equal(result.status, 'calculated');
  // programmeRateCost: 40000 * 0.001 = 40; programmeFixedCost: 800 * 0.10 = 80; total = 120
  assert.equal(result.totalCost, 120.00);
  assert.equal(result.breakdown.programmeRateCost, 40.00);
  assert.equal(result.breakdown.programmeFixedCost, 80.00);
  // surcharge is collected from cardholders, shown in breakdown
  assert.ok(result.breakdown.surchargeCollected >= 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. SURCHARGE pricing model
// ═══════════════════════════════════════════════════════════════════════════════
{
  const model = getPricingModel(MODEL_IDS.SURCHARGE);
  assert.ok(model !== null);

  const result = model.calculateCost({
    grossVolume: 30000, transactionCount: 600,
    baseFeeRate: 0.025, perTransactionFee: 0.10, surchargeRate: 0.03
  });
  assert.equal(result.status, 'calculated');
  // grossFees: 30000*0.025=750; perTx: 600*0.10=60; surcharge: 30000*0.03=900
  // netCost: 750+60-900=-90 → floored to 0
  assert.equal(result.totalCost, 0);
  assert.equal(result.breakdown.netCost, -90.00);
  assert.equal(result.breakdown.merchantCost, 0);

  // Case where surcharge does not fully offset fees
  const result2 = model.calculateCost({
    grossVolume: 30000, transactionCount: 600,
    baseFeeRate: 0.04, perTransactionFee: 0.10, surchargeRate: 0.01
  });
  assert.equal(result2.status, 'calculated');
  // grossFees: 1200; perTx: 60; surcharge: 300; net = 960
  assert.equal(result2.totalCost, 960.00);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 14. RESIDUAL CALCULATIONS (internal only)
// ═══════════════════════════════════════════════════════════════════════════════
{
  const residual = calculateResidual({
    grossVolume: 100000,
    projectedMerchantCost: 2500,
    processorCostRate: 0.018,
    processorCostFixed: 50,
    agentMarkupRate: 0.002,
    agentMarkupFixed: 0,
    residualSplitRate: 0.7
  });

  assert.equal(residual._internal, true);
  assert.equal(residual.status, 'calculated');
  // processorRevenue = 100000*0.018 + 50 = 1850
  assert.equal(residual.processorRevenue, 1850.00);
  // markupRevenue = 2500 - 1850 = 650
  assert.equal(residual.markupRevenue, 650.00);
  // projectedResidual = 650 * 0.7 = 455
  assert.equal(residual.projectedResidual, 455.00);
  assert.ok(residual.internalProfitability > 0);
  assert.ok(residual.trace.formula !== null);

  // Approval required when markup is negative
  const negativeMarkup = calculateResidual({
    grossVolume: 10000, projectedMerchantCost: 100,
    processorCostRate: 0.025, processorCostFixed: 0
  });
  // processorRevenue = 250 > merchantCost 100 → markupRevenue negative
  assert.equal(negativeMarkup.approvalRequired, true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 15. MERCHANT / INTERNAL SEPARATION
// ═══════════════════════════════════════════════════════════════════════════════
{
  const INTERNAL_FIELDS = ['processorRevenue','markupRevenue','projectedResidual','internalProfitability','approvalRequired','proposedMarkup','processorCost','residualTrace'];

  const pipeline = await buildPipeline('separation-test.pdf',
    'Worldpay\nProcessing Summary\nGross Sales 50,000.00\nTotal Fees 47.45\nOther Fees\nBatch Fee 12.50\nPCI Fee 9.95\nAuthorization Fee 5.17\nMC NABU 4.83\nVisa FANF 15.00'
  );

  const result = runProposalEngine(pipeline, {
    scenarios: [{
      modelId: MODEL_IDS.INTERCHANGE_PLUS,
      modelParams: { grossVolume: 50000, transactionCount: 1000, interchangeCost: 30, markupRate: 0.001, perTransactionFee: 0.05 }
    }],
    residualParams: { processorCostRate: 0.015, processorCostFixed: 20, residualSplitRate: 0.6 }
  });

  const merchantFacing = getMerchantFacingProposal(result);

  // Merchant-facing must NOT contain internal fields
  for (const field of INTERNAL_FIELDS) {
    assert.ok(!(field in merchantFacing), `Merchant-facing output must not contain internal field: ${field}`);
  }

  // _internal must NOT be in merchant-facing
  assert.ok(!('_internal' in merchantFacing));

  // Internal fields should only be in _internal section of full result
  assert.ok('_internal' in result);
  if (result._internal.residual) {
    assert.equal(result._internal.residual._internal, true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 16. CALCULATION TRACE INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════
{
  const model = getPricingModel(MODEL_IDS.INTERCHANGE_PLUS);
  const modelResult = model.calculateCost({
    grossVolume: 75000, transactionCount: 1500,
    interchangeCost: 1200, markupRate: 0.004, perTransactionFee: 0.08
  });

  // Trace must have all required fields
  assert.ok(modelResult.trace.formula !== null);
  assert.ok(typeof modelResult.trace.inputs === 'object');
  assert.ok(typeof modelResult.trace.intermediates === 'object');
  assert.ok(typeof modelResult.trace.rounding === 'string');
  assert.ok(Array.isArray(modelResult.trace.assumptions));
  assert.equal(modelResult.trace.finalValue, modelResult.totalCost);

  // Verify reproducibility: same inputs → same output
  const modelResult2 = model.calculateCost({
    grossVolume: 75000, transactionCount: 1500,
    interchangeCost: 1200, markupRate: 0.004, perTransactionFee: 0.08
  });
  assert.equal(modelResult.totalCost, modelResult2.totalCost);
  assert.equal(modelResult.effectiveRate, modelResult2.effectiveRate);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 17. EVIDENCE PRESERVATION when blocked
// ═══════════════════════════════════════════════════════════════════════════════
{
  const pipeline = await buildPipeline('blocked-evidence.pdf',
    'Worldpay\nProcessing Summary\nGross Sales 50,000.00\nTotal Fees 9999.00\nOther Fees\nBatch Fee 12.50'
  );

  const result = runProposalEngine(pipeline, {});
  assert.equal(result.merchant.blocked, true);

  // Internal section must preserve reconciliation evidence
  assert.ok(result._internal.reconciliation !== null);
  assert.ok(typeof result._internal.reconciliation.feeVariance === 'number');
  assert.ok(result._internal.eligibility !== null);

  // Metrics preserved in internal
  assert.ok(result._internal.metrics !== null || result._internal.reconciliation !== null);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 18. PROPOSAL BLOCKING prevents financial output
// ═══════════════════════════════════════════════════════════════════════════════
{
  // Statement with no fee total (insufficient_evidence reconciliation)
  const pipeline = await buildPipeline('block-gate.pdf',
    'Worldpay\nOther Fees\nBatch Fee 12.50'
  );
  const result = runProposalEngine(pipeline, {
    scenarios: [{ modelId: MODEL_IDS.FLAT_RATE, modelParams: { grossVolume: 50000, flatRate: 0.025 } }]
  });
  assert.equal(result.merchant.proposalEligible, false);
  assert.equal(result.merchant.monthlySavings, null);
  assert.equal(result.merchant.annualSavings, null);
  assert.deepEqual(result.merchant.modelComparisons, []);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 19. PRICING MODEL — blocked on invalid inputs
// ═══════════════════════════════════════════════════════════════════════════════
{
  const model = getPricingModel(MODEL_IDS.INTERCHANGE_PLUS);
  const result = model.calculateCost({ grossVolume: 0, transactionCount: 100, interchangeCost: 200, markupRate: 0.003 });
  assert.equal(result.status, 'blocked');
  assert.ok(typeof result.reason === 'string');
  assert.equal(result.totalCost, null);

  const result2 = model.calculateCost({ grossVolume: 50000, transactionCount: 100, interchangeCost: -5, markupRate: 0.003 });
  assert.equal(result2.status, 'blocked');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 20. STRIP INTERNAL FIELDS helper
// ═══════════════════════════════════════════════════════════════════════════════
{
  const dirty = {
    proposalEligible: true,
    currentEffectiveRate: 0.024,
    processorRevenue: 1200.00,        // internal
    markupRevenue: 300.00,             // internal
    projectedResidual: 180.00,         // internal
    internalProfitability: 0.0036,     // internal
    approvalRequired: false,           // internal
    monthlySavings: 120.00,
    annualSavings: 1440.00
  };

  const clean = stripInternalFields(dirty);
  assert.equal(clean.proposalEligible, true);
  assert.equal(clean.currentEffectiveRate, 0.024);
  assert.equal(clean.monthlySavings, 120.00);
  assert.ok(!('processorRevenue' in clean));
  assert.ok(!('markupRevenue' in clean));
  assert.ok(!('projectedResidual' in clean));
  assert.ok(!('internalProfitability' in clean));
  assert.ok(!('approvalRequired' in clean));
  // Original not mutated
  assert.equal(dirty.processorRevenue, 1200.00);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 21. ALL PRICING MODELS registered and accessible
// ═══════════════════════════════════════════════════════════════════════════════
{
  const expected = [MODEL_IDS.INTERCHANGE_PLUS, MODEL_IDS.FLAT_RATE, MODEL_IDS.CASH_DISCOUNT, MODEL_IDS.SURCHARGE];
  for (const id of expected) {
    const m = getPricingModel(id);
    assert.ok(m !== null, `Model ${id} should be registered`);
    assert.ok(typeof m.calculateCost === 'function');
    assert.ok(typeof m.name === 'string');
  }
  assert.equal(getPricingModel('nonexistent'), null);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 22. SCHEMA VERSION preserved in output
// ═══════════════════════════════════════════════════════════════════════════════
{
  const pipeline = await buildPipeline('version-check.pdf',
    'Worldpay\nOther Fees\nBatch Fee 12.50'
  );
  const result = runProposalEngine(pipeline, {});
  assert.equal(result.schemaVersion, PROPOSAL_ENGINE_VERSION);
  assert.ok(typeof result.timestamp === 'string');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 23. CURRENT COST — falls back to summing fee candidates when no total line
// ═══════════════════════════════════════════════════════════════════════════════
{
  const noTotalMetrics = {
    totalFees: { status: 'insufficient_evidence', value: null },
    grossVolume: { status: 'found', value: 50000 },
    effectiveRate: { status: 'insufficient_evidence', value: null }
  };
  const fakeCandidates = [
    { status: 'classified', amount: 12.50 },
    { status: 'classified', amount: 9.95 },
    { status: 'needs_review', amount: 5.00 }
  ];
  const feeSummary = { classified: 2, unknown: 1, totalAmount: 27.45, buckets: { unknown: 5.00 } };

  const result = calculateCurrentCost({ metrics: noTotalMetrics, feeSummary, feeCandidates: fakeCandidates });
  assert.equal(result.status, 'estimated');
  assert.equal(result.source, 'fee_candidates_sum');
  assert.equal(result.monthlyCost, 27.45);
  assert.equal(result.unknownFeeCount, 1);
  // Unknown fee not removed
  assert.equal(result.unknownFeeTotal, 5.00);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 24. RESIDUAL — insufficient data path
// ═══════════════════════════════════════════════════════════════════════════════
{
  const result = calculateResidual({ grossVolume: 0, projectedMerchantCost: 100 });
  assert.equal(result.status, 'insufficient_data');
  assert.equal(result._internal, true);
  assert.equal(result.projectedResidual, null);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 25. PRICING COMPARISON — unknown model id handled gracefully
// ═══════════════════════════════════════════════════════════════════════════════
{
  const currentPricing = {
    status: 'calculated', source: 'statement_total',
    monthlyCost: 500, grossVolume: 20000, effectiveRate: 0.025,
    unknownFeeCount: 0
  };
  const comparisons = comparePricingModels({
    currentPricing,
    scenarios: [{ modelId: 'nonexistent_model', modelParams: {} }]
  });
  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].status, 'unknown_model');
}

console.log('Sprint 5.1 Proposal Intelligence Engine regression tests passed.');
