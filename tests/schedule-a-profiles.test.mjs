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
