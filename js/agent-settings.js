(function (global) {
  "use strict";

  const STORAGE_KEY = "clearcost.agent-settings.v1";
  const SCHEMA_VERSION = 1;

  const DEFAULTS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    consultantName: "",
    phone: "",
    email: "",
    isoProcessorName: "",
    agentSplitPercent: null,
    agentSplitVerified: false,
    minimumMonthlyResidual: 500,
  });

  function optionalFiniteNumber(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeAgentSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const split = optionalFiniteNumber(
      source.agentSplitPercent,
      DEFAULTS.agentSplitPercent
    );
    const isoProcessorName = String(source.isoProcessorName || "").trim();
    const agentSplitVerified = source.agentSplitVerified === true;

    if (split !== null && (split < 0 || split > 100)) {
      throw new Error("Agent residual split must be between 0 and 100.");
    }

    if (agentSplitVerified && (split === null || !isoProcessorName)) {
      throw new Error(
        "ISO / processor and agent residual split are required before verification."
      );
    }

    const minimum = optionalFiniteNumber(
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
      isoProcessorName,
      agentSplitPercent: split,
      agentSplitVerified,
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
