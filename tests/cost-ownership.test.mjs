import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../js/cost-ownership.js", import.meta.url),
  "utf8"
);
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);

const CO = context.globalThis.ClearCostCostOwnership;
const fees = [
  { amount: 700, status: "classified", bucket: "wholesale_interchange" },
  { amount: 100, status: "classified", bucket: "network" },
  { amount: 50, status: "classified", bucket: "third_party" },
  { amount: 150, status: "classified", bucket: "processor_revenue" },
  {
    amount: 700,
    status: "classified",
    bucket: "wholesale_interchange",
    extractionMethod: "commerce_control_interchange_table_row",
  },
];

const publishedVerification = Object.freeze({ verified: true, blockReason: null });\nconst ownership = CO.analyzeCostOwnership(fees, 1000, 0.01, publishedVerification);
assert.equal(ownership.verified, true);
assert.equal(ownership.eligibleTotal, 1000);
assert.equal(ownership.incumbentProcessorMarkup, 150);
assert.equal(ownership.buckets.wholesale_interchange, 700);

const proposal = CO.calculateTraditionalProposal({
  monthlyVolume: 50000,
  monthlyTransactions: 1000,
  costOwnership: ownership,
  percentageMarkup: 0.20,
  transactionMarkup: 0.10,
  monthlyFee: 25,
  equipmentFee: 0,
  agentSplitPercent: 80,
});
assert.equal(proposal.proposedMerchantExpense, 1075);
assert.equal(proposal.monthlySavings, -75);
assert.equal(proposal.annualSavings, -900);
assert.equal(proposal.grossProgramRevenue, 225);
assert.equal(proposal.projectedMonthlyResidual, 180);

const unknown = CO.analyzeCostOwnership([
  ...fees,
  { amount: 10, status: "needs_review", bucket: "unknown", originalDescription: "Mystery" },
], 1010, 0.01, publishedVerification);
assert.equal(unknown.verified, false);
assert.equal(unknown.incumbentProcessorMarkup, null);
assert.equal(unknown.unexplained.length, 1);\n\nconst unverifiedInterchange = CO.analyzeCostOwnership(fees, 1000);\nassert.equal(unverifiedInterchange.verified, false);\nassert.equal(unverifiedInterchange.incumbentProcessorMarkup, null);\nassert.match(unverifiedInterchange.blockReason, /Published interchange rates/);
assert.equal(
  CO.calculateTraditionalProposal({
    monthlyVolume: 1,
    monthlyTransactions: 1,
    costOwnership: unknown,
    percentageMarkup: 1,
    transactionMarkup: 1,
    agentSplitPercent: 80,
  }).verified,
  false
);

console.log("Cost ownership and savings regression tests passed.");
