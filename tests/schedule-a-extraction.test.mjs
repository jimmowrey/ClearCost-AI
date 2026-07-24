import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../js/schedule-a-extraction.js", import.meta.url),
  "utf8"
);
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);

const Extraction = context.globalThis.ClearCostScheduleAExtraction;
assert.ok(Extraction, "Schedule A extraction module should load.");

const scannedText = `
PRICING SCHEDULE
Income over and above this cost will be split 80 % to ISC and 20 % to SignaPay.
V/MC/Discover Interchange plus Dues & Asses.
Pass-Thru
Authorization/Capture/Settle
$0.04 /item
BIN Sponsorship Fee
2.0 basis points (0.020%) on the gross processing sales dollar volume
Monthly Minimum (billed to merchant at $20.00) $5.00/month
Cancellation Fee (billed to merchant at $495.00) $0.00
PCI Program Fee (billed $9.95/monthly) $4.00
Priority/First
Data Specific Items
PCI Program Fee (billed to merchant at $99/year)
$30.00
Buypass Down Services
$1.00/full download, $0.50/partial, $0.50/table
After-Hours Help Desk Calls $5.75
`;

const terms = Extraction.extractTerms(scannedText);
const byId = new Map(Array.from(terms, term => [term.id, term]));

assert.equal(byId.get("income_split").value, "80% agent / 20% SignaPay");
assert.equal(byId.get("interchange_assessments").value, "Pass-Through");
assert.equal(byId.get("authorization_capture_settle").value, "$0.04 /item");
assert.match(byId.get("bin_sponsorship").value, /^2\.0 basis points \(0\.020%\)/);
assert.equal(byId.get("monthly_minimum").value, "$5.00/month");
assert.equal(byId.get("cancellation_fee").value, "$0.00");
assert.equal(byId.get("pci_program_general").value, "$4.00");
assert.equal(byId.get("pci_program_priority").value, "$30.00");
assert.equal(
  byId.get("buypass_down_services").value,
  "$1.00/full download, $0.50/partial, $0.50/table"
);
assert.equal(byId.get("after_hours_help_desk").value, "$5.75");
assert.ok(Array.from(terms).every(term => term.verified === false));

const actualScanOcr = readFileSync(
  new URL("./fixtures/signapay-schedule-a-actual-ocr.txt", import.meta.url),
  "utf8"
);
const actualScanResult = Extraction.extractionResult(actualScanOcr, "ocr");
assert.equal(
  actualScanResult.terms.length,
  28,
  "the actual SignaPay scan must produce 27 cost rows plus its compensation split"
);
assert.equal(actualScanResult.status, "extracted");

const collapsedProductionRows = actualScanOcr.replace(
  "AVS $0.02\nMonthly Minimum",
  "AVS $0.02 Monthly Minimurn"
);
const collapsedProductionResult = Extraction.extractionResult(
  collapsedProductionRows,
  "ocr"
);
const collapsedProductionById = new Map(
  Array.from(collapsedProductionResult.terms, term => [term.id, term])
);
assert.equal(
  collapsedProductionResult.terms.length,
  28,
  "OCR-collapsed AVS and Monthly Minimum rows must remain separate review items"
);
assert.equal(collapsedProductionById.get("avs").value, "$0.02");
assert.equal(
  collapsedProductionById.get("monthly_minimum").value,
  "$5.00/month"
);
assert.equal(collapsedProductionResult.status, "extracted");

const empty = Extraction.extractionResult("No pricing rows are present.");
assert.equal(empty.status, "needs_review");
assert.equal(empty.terms.length, 0);

const splitOnly = Extraction.extractionResult(
  "Income over this cost will be split 80% to ISC and 20% to SignaPay.",
  "ocr"
);
assert.equal(splitOnly.status, "incomplete");
assert.equal(splitOnly.terms.length, 1);
assert.match(splitOnly.completenessReason, /no Schedule A cost rows/i);

{
  const namedWorker = () => "named";
  assert.equal(
    Extraction.resolveCreateWorker({ createWorker: namedWorker }),
    namedWorker,
    "named Tesseract exports remain supported"
  );

  const defaultWorker = () => "default";
  assert.equal(
    Extraction.resolveCreateWorker({
      default: { createWorker: defaultWorker },
    }),
    defaultWorker,
    "Tesseract v5 ESM default exports are supported"
  );

  assert.throws(
    () => Extraction.resolveCreateWorker({ default: {} }),
    /OCR engine did not load correctly/,
    "invalid CDN module shapes fail with an actionable error"
  );
}

console.log("Schedule A extraction regression tests passed.");
