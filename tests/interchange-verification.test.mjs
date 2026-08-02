import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../js/interchange-verification.js", import.meta.url),
  "utf8"
);
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);
const IV = context.globalThis.ClearCostInterchangeVerification;

const schedules = [
  {
    id: "mc-world-elite-merit-iii-2024",
    brand: "Mastercard",
    aliases: ["MC-WORLD ELITE MERIT III"],
    percentRate: 2.30,
    perItemRate: 0.10,
    effectiveFrom: "2024-04-12",
    effectiveThrough: "2025-04-10",
    source: "Mastercard U.S. Region Interchange Programs and Rates 2024-2025",
  },
  {
    id: "visa-regulated-debit-2024",
    brand: "Visa",
    aliases: ["VI-US REGULATED (DB)"],
    percentRate: 0.05,
    perItemRate: 0.22,
    effectiveFrom: "2024-04-13",
    effectiveThrough: "2025-04-11",
    source: "Visa USA Interchange Reimbursement Fees effective April 13, 2024",
  },
];

const rows = [
  {
    description: "MC-WORLD ELITE MERIT III",
    salesVolume: 803.07,
    transactionCount: 10,
    amount: 19.47,
  },
  {
    description: "VI-US REGULATED (DB)",
    salesVolume: 2491.74,
    transactionCount: 9,
    amount: 3.23,
  },
];

const verified = IV.verifyInterchangeRows({
  rows,
  schedules,
  statementPeriodEnd: "2025-01-31",
  statementReportedTotal: 22.70,
});
assert.equal(verified.verified, true);
assert.equal(verified.matchedRowCount, 2);
assert.equal(verified.totalVariance, 0);

const padded = IV.verifyInterchangeRows({
  rows: [{ ...rows[0], amount: 24.47 }],
  schedules,
  statementPeriodEnd: "2025-01-31",
  statementReportedTotal: 24.47,
});
assert.equal(padded.verified, false);
assert.equal(padded.rows[0].status, "published_rate_variance");
assert.equal(padded.rows[0].variance, 5);

const unknown = IV.verifyInterchangeRows({
  rows: [{ description: "UNMAPPED PROGRAM", amount: 1 }],
  schedules,
  statementPeriodEnd: "2025-01-31",
  statementReportedTotal: 1,
});
assert.equal(unknown.verified, false);
assert.equal(unknown.unresolved.length, 1);
assert.equal(unknown.rows[0].status, "unmatched_schedule");

console.log("Interchange schedule verification regression tests passed.");
