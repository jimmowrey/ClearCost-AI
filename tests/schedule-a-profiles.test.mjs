import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../js/schedule-a-profiles.js", import.meta.url),
  "utf8"
);
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);

const Profiles = context.globalThis.ClearCostScheduleAProfiles;
assert.ok(Profiles, "Schedule A Profiles module should load.");

const fingerprint = "a".repeat(64);
const profile = Profiles.createProfile(
  {
    isoProcessorName: "SignaPay",
    effectiveDate: "2026-01-01",
    fileName: "Schedule A.pdf",
    fileSize: 12345,
    documentFingerprint: fingerprint,
  },
  new Date("2026-07-23T12:00:00Z")
);

assert.equal(profile.id, `2026-01-01-${fingerprint.slice(0, 16)}`);
assert.equal(profile.extractionStatus, "pending");
assert.equal(profile.termsVerified, false);
assert.equal(profile.terms.length, 0);

{
  const saved = new Map();
  const storage = {
    getItem(key) {
      return saved.get(key) || null;
    },
    setItem(key, value) {
      saved.set(key, value);
    },
  };
  const registry = Profiles.createRegistry(storage);
  registry.add(profile);

  const second = Profiles.createProfile(
    {
      isoProcessorName: "SignaPay",
      effectiveDate: "2027-01-01",
      fileName: "Schedule A 2027.pdf",
      fileSize: 23456,
      documentFingerprint: "b".repeat(64),
    },
    new Date("2027-01-02T12:00:00Z")
  );
  registry.add(second);

  assert.equal(
    registry.load().map(item => item.id).join(","),
    [second.id, profile.id].join(","),
    "new schedules create versions instead of overwriting older schedules"
  );
  assert.throws(
    () => registry.add(profile),
    /already saved/,
    "the exact same document cannot be duplicated"
  );

  const extracted = registry.saveExtraction(profile.id, {
    status: "extracted",
    terms: [{
      id: "authorization",
      label: "Authorization",
      value: "$0.04/item",
      verified: false,
    }],
  });
  assert.equal(extracted.extractionStatus, "extracted");
  assert.equal(extracted.termsVerified, false);
  assert.throws(
    () => registry.saveExtraction(second.id, {
      status: "incomplete",
      terms: [{
        id: "income_split",
        label: "Income split",
        value: "80% / 20%",
        verified: false,
      }],
    }),
    /incomplete Schedule A extraction/i,
    "partial OCR results cannot enter the verification workflow"
  );
  assert.throws(
    () => registry.verifyTerms(profile.id, extracted.terms, new Date(), true),
    /verify every extracted term/i
  );
  assert.throws(
    () => registry.verifyTerms(
      profile.id,
      extracted.terms.map(term => ({ ...term, verified: true }))
    ),
    /every Schedule A row/i
  );
  const verified = registry.verifyTerms(
    profile.id,
    extracted.terms.map(term => ({ ...term, verified: true })),
    new Date("2026-07-23T13:00:00Z"),
    true
  );
  assert.equal(verified.termsVerified, true);
  assert.equal(verified.verifiedAt, "2026-07-23T13:00:00.000Z");
}

assert.throws(
  () => Profiles.createProfile({
    isoProcessorName: "SignaPay",
    effectiveDate: "",
    fileName: "Schedule A.pdf",
    documentFingerprint: fingerprint,
  }),
  /Effective date is required/
);

assert.throws(
  () => Profiles.normalizeProfile({
    ...profile,
    termsVerified: true,
    extractionStatus: "pending",
  }),
  /./
);

console.log("Schedule A profile regression tests passed.");
