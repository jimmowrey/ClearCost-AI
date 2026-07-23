import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../js/agent-settings.js", import.meta.url),
  "utf8"
);
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);

const Settings = context.globalThis.ClearCostAgentSettings;
assert.ok(Settings, "Agent Settings module should load.");

{
  const saved = new Map();
  const storage = {
    getItem(key) {
      return saved.has(key) ? saved.get(key) : null;
    },
    setItem(key, value) {
      saved.set(key, value);
    },
  };
  const store = Settings.createAgentSettingsStore(storage);
  const defaults = store.load();

  assert.equal(defaults.isoProcessorName, "");
  assert.equal(defaults.agentSplitPercent, null);
  assert.equal(defaults.agentSplitVerified, false);

  const updated = store.save({
    isoProcessorName: "Another ISO",
    agentSplitPercent: 65,
    agentSplitVerified: true,
    minimumMonthlyResidual: 750,
  });

  assert.equal(updated.isoProcessorName, "Another ISO");
  assert.equal(store.load().agentSplitPercent, 65);
  assert.equal(store.load().minimumMonthlyResidual, 750);
}

{
  assert.throws(
    () =>
      Settings.normalizeAgentSettings({
        isoProcessorName: "",
        agentSplitPercent: "",
        agentSplitVerified: true,
      }),
    /required before verification/
  );
}

{
  assert.throws(
    () =>
      Settings.normalizeAgentSettings({
        agentSplitPercent: 101,
      }),
    /between 0 and 100/
  );
}

{
  const storage = {
    getItem() {
      return "{not-json";
    },
    setItem() {},
  };
  const restored = Settings.createAgentSettingsStore(storage).load();

  assert.equal(restored.isoProcessorName, "");
  assert.equal(restored.agentSplitPercent, null);
  assert.equal(restored.agentSplitVerified, false);
}

console.log("Agent Settings regression tests passed.");
