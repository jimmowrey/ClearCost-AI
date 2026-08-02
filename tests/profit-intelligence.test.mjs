import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/profit-intelligence.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);

const PI = context.globalThis.ClearCostProfitIntelligence;
assert.ok(PI, "Profit Intelligence browser module should load.");

const V = PI.verifiedValue;

{
  const result = PI.calculateProfitScenario({
    scenarioId: "unverified",
    program: PI.ProgramType.SURCHARGE,
    monthlyVolume: 100000,
    monthlyTransactions: 4000,
    currentMonthlyProcessingExpense: 2200,
    customerSurchargePercent: 3,
    merchantCreditCardRate: 0,
    merchantTransactionFee: 0.10,
    merchantMonthlyFee: 25,
    revenueComponents: [
      { name: "Revenue", amount: V(900, "test"), category: "revenue" }
    ],
    costComponents: [
      { name: "Buy cost", amount: PI.unknownValue("missing"), category: "cost" }
    ],
    agentSplitPercent: V(80, "split"),
    minimumMonthlyResidual: 500,
  });

  assert.equal(result.profitabilityStatus, PI.ProfitabilityStatus.NOT_VERIFIED);
  assert.equal(result.readyToPresent, false);
}

{
  const result = PI.calculateProfitScenario({
    scenarioId: "loss",
    program: PI.ProgramType.TRADITIONAL,
    monthlyVolume: 50000,
    monthlyTransactions: 1000,
    currentMonthlyProcessingExpense: 1500,
    revenueComponents: [
      { name: "Revenue", amount: V(300, "test"), category: "revenue" }
    ],
    costComponents: [
      { name: "Cost", amount: V(350, "test"), category: "cost" }
    ],
    agentSplitPercent: V(80, "split"),
    minimumMonthlyResidual: 0,
  });

  assert.equal(result.grossProfitPool, -50);
  assert.equal(result.profitabilityStatus, PI.ProfitabilityStatus.VERIFIED_LOSS);
  assert.equal(result.readyToPresent, false);
}

{
  const result = PI.calculateProfitScenario({
    scenarioId: "good",
    program: PI.ProgramType.SURCHARGE,
    monthlyVolume: 100000,
    monthlyTransactions: 4000,
    currentMonthlyProcessingExpense: 2200,
    customerSurchargePercent: 3,
    merchantCreditCardRate: 0,
    merchantTransactionFee: 0.10,
    merchantMonthlyFee: 25,
    merchantExpenseComponents: [
      { name: "Debit and EBT cost", amount: V(500, "verified fixture"), category: "merchant_cost" }
    ],
    revenueComponents: [
      { name: "Revenue", amount: V(1000, "verified fixture"), category: "revenue" }
    ],
    costComponents: [
      { name: "Processor cost", amount: V(300, "verified fixture"), category: "cost" }
    ],
    agentSplitPercent: V(80, "verified split"),
    minimumMonthlyResidual: 500,
  });

  assert.equal(result.projectedMerchantExpense, 925);
  assert.equal(result.projectedMonthlySavings, 1275);
  assert.equal(result.projectedMonthlyResidual, 560);
  assert.equal(result.readyToPresent, true);
}

{
  const common = {
    scenarioId: "txn",
    program: PI.ProgramType.TRADITIONAL,
    monthlyVolume: 100000,
    monthlyTransactions: 10000,
    currentMonthlyProcessingExpense: 2500,
    revenueComponents: [
      { name: "Revenue", amount: V(1000, "test"), category: "revenue" }
    ],
    costComponents: [
      { name: "Cost", amount: V(200, "test"), category: "cost" }
    ],
    agentSplitPercent: V(80, "split"),
    minimumMonthlyResidual: 0,
  };

  const low = PI.calculateProfitScenario({ ...common, merchantTransactionFee: 0.05 });
  const high = PI.calculateProfitScenario({ ...common, merchantTransactionFee: 0.10 });

  assert.equal(high.projectedMerchantExpense - low.projectedMerchantExpense, 500);
}

{
  const breakdown = PI.calculateCurrentCostBreakdown({
    statementFeeTotal: 1501.57,
    monthlyVolume: 82756.12,
    eligibleBuckets: {
      wholesale_interchange: 1300,
      network: 103.91,
      processor_revenue: 85.58,
      third_party: 12.08,
      unknown: 0,
    },
    unknownFeeCount: 0,
  });

  assert.equal(breakdown.interchange, 1300);
  assert.equal(breakdown.assessments, 103.91);
  assert.equal(breakdown.otherPassThrough, 12.08);
  assert.equal(breakdown.processorMarkup, 85.58);
  assert.equal(breakdown.accountedTotal, 1501.57);
  assert.equal(breakdown.variance, 0);
  assert.equal(breakdown.verified, true);
  assert.equal(breakdown.processorMarkupRatePercent, 0.1034);
  assert.equal(breakdown.processorMarkupBasisPoints, 10.3412);
}

{
  const unexplained = PI.calculateCurrentCostBreakdown({
    statementFeeTotal: 1501.57,
    monthlyVolume: 82756.12,
    eligibleBuckets: {
      wholesale_interchange: 1403.91,
      network: 0,
      processor_revenue: 85.58,
      third_party: 0,
      unknown: 12.08,
    },
    unknownFeeCount: 1,
  });

  assert.equal(unexplained.verified, false);
  assert.equal(unexplained.status, "requires_review");
  assert.match(
    unexplained.warnings[0],
    /Unknown fees must be reviewed/
  );
}

console.log("Profit Intelligence browser regression tests passed.");
