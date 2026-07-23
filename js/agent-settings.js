(function (global) {
  "use strict";

  const STORAGE_KEY = "clearcost.agent-settings.v1";
  const SCHEMA_VERSION = 1;

  const DEFAULTS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    consultantName: "",
    phone: "",
    email: "",
    isoProcessorName: "SignaPay",
    agentSplitPercent: 80,
    agentSplitVerified: true,
    minimumMonthlyResidual: 500,
  });

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeAgentSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const split = finiteNumber(
      source.agentSplitPercent,
      DEFAULTS.agentSplitPercent
    );

    if (split < 0 || split > 100) {
      throw new Error("Agent residual split must be between 0 and 100.");
    }

    const minimum = finiteNumber(
      source.minimumMonthlyResidual,
      DEFAULTS.minimumMonthlyResidual
    );

    if (minimum < 0) {
      throw new Error("Minimum monthly residual cannot be negative.");
    }

    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      consultantName: String(source.consultantName || "").trim(),
      phone: String(source.phone || "").trim(),
      email: String(source.email || "").trim(),
      isoProcessorName: String(
        source.isoProcessorName || DEFAULTS.isoProcessorName
      ).trim(),
      agentSplitPercent: split,
      agentSplitVerified: source.agentSplitVerified === true,
      minimumMonthlyResidual: minimum,
    });
  }

  function createAgentSettingsStore(storage) {
    return Object.freeze({
      load() {
        if (!storage || typeof storage.getItem !== "function") {
          return normalizeAgentSettings(DEFAULTS);
        }

        const saved = storage.getItem(STORAGE_KEY);
        if (!saved) return normalizeAgentSettings(DEFAULTS);

        try {
          return normalizeAgentSettings(JSON.parse(saved));
        } catch (_error) {
          return normalizeAgentSettings(DEFAULTS);
        }
      },

      save(value) {
        const normalized = normalizeAgentSettings(value);

        if (!storage || typeof storage.setItem !== "function") {
          throw new Error("Agent settings storage is unavailable.");
        }

        storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      },
    });
  }

  global.ClearCostAgentSettings = Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    DEFAULTS,
    normalizeAgentSettings,
    createAgentSettingsStore,
  });
})(typeof window !== "undefined" ? window : globalThis);
