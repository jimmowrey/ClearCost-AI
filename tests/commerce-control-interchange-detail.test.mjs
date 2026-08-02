import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/commerce-control-interchange-detail.js", import.meta.url), "utf8");
const fixture = JSON.parse(readFileSync(
  new URL("../data/regression/north_state_power_sports_commerce_control.json", import.meta.url), "utf8"
));
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);
const engine = context.globalThis.ClearCostCommerceControlInterchange;
const pages = fixture.pages.map(page => ({ page_number: page.page_number, full_text: page.full_text }));
const rows = engine.parseCommerceControlInterchangePages(pages);

assert.equal(rows.length, 53, "all 53 non-total detail rows from pages 5–7 are extracted");
assert.equal(rows.filter(row => row.brand === "Mastercard").length, 13);
assert.equal(rows.filter(row => row.brand === "Visa").length, 26);
assert.equal(rows.filter(row => row.brand === "Discover").length, 4);
assert.equal(rows.filter(row => row.brand === "American Express").length, 2);
assert.equal(rows.filter(row => row.brand === "Debit network").length, 8);
assert.equal(Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100), 111421);

const audit = engine.auditCommerceControlRows({
  rows,
  statementPeriodEnd: "2025-01-31"
});
assert.equal(audit.detailTotal, 1114.21);
assert.equal(audit.detailTotalMatches, true);
assert.equal(audit.rows.filter(row => row.brand === "Mastercard" &&
  row.status === "published_rate_match").length, 13);
assert.equal(audit.rows.filter(row => row.brand === "Visa" &&
  row.status === "published_rate_match").length, 26);
assert.equal(audit.unresolved.length, 6, "Discover and Amex remain blocked until dated primary schedules are loaded");
assert.equal(audit.verified, false);
assert.match(audit.blockReason, /6 charged interchange row/);

const paddedRows = rows.map(row => row.description === "MC-WORLD ELITE MERIT III"
  ? { ...row, amount: row.amount + 5 } : row);
const padded = engine.auditCommerceControlRows({ rows: paddedRows, statementPeriodEnd: "2025-01-31" });
const paddedRow = padded.rows.find(row => row.description === "MC-WORLD ELITE MERIT III");
assert.equal(paddedRow.status, "published_rate_variance");
assert.equal(paddedRow.variance, 5);

console.log("Commerce Control interchange detail regression tests passed.");
