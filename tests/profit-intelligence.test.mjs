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

console.log("Profit Intelligence browser regression tests passed.");
