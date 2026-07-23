(function (global) {
  "use strict";

  const DEFINITIONS = Object.freeze([
    ["interchange_assessments", "Card-brand interchange and assessments", "general", /V\/?MC\/?Discover Interchange plus Dues\s*&?\s*Asses/i],
    ["authorization_capture_settle", "Authorization / capture / settle", "general", /Authorization\/Capture\/Settle/i],
    ["bin_sponsorship", "BIN sponsorship fee", "general", /BIN Sponsorship Fee/i],
    ["liability_risk", "Liability / risk fee", "general", /Liability\/Risk Fee/i],
    ["merchant_account", "Merchant account on file", "general", /Merchant Account on File/i],
    ["merchant_statement", "Merchant statement", "general", /Merchant Statement/i],
    ["regulatory_program", "Government regulatory program", "general", /Gov'?t Regulatory Program/i],
    ["next_day_funding", "Next-day funding", "general", /Next Day Funding/i],
    ["annual_fee", "Annual fee", "general", /Annual Fee/i],
    ["pin_debit_transaction", "PIN debit transaction fee", "general", /PIN Debit Transaction Fee/i],
    ["ebt_authorization", "EBT authorization fee", "general", /EBT Authorization Fee/i],
    ["batch_header", "Batch header", "general", /Batch Header/i],
    ["voice_authorization", "Voice authorization inquiry", "general", /Voice Authorization Inquiry/i],
    ["avs", "AVS", "general", /\bAVS\b/i],
    ["monthly_minimum", "Monthly minimum", "general", /Monthly Minimum/i],
    ["cancellation_fee", "Cancellation fee", "general", /Cancellation Fee/i],
    ["amex_optblue_sponsor", "Amex OptBlue sponsor cost", "general", /Amex OptBlue Sponsor Cost/i],
    ["micros_authorization_capture", "Micros authorization / capture", "general", /Micros Authorization\/Capture/i],
    ["pci_noncompliance", "PCI noncompliance fee", "general", /PCI Non-Compliance Fee/i],
    ["pci_program_general", "PCI program fee", "general", /PCI Program Fee/i],
    ["pci_program_priority", "PCI program fee", "priority_first_data", /PCI Program Fee/i],
    ["buypass_statement", "Buypass statement fee", "priority_first_data", /Buypass Statement Fee/i],
    ["buypass_pre_auth", "Buypass pre-auth fee", "priority_first_data", /Buypass Pre Auth Fee/i],
    ["buypass_down_services", "Buypass down services", "priority_first_data", /Buypass Down Services/i],
    ["missing_originals", "Missing originals fee", "priority_first_data", /Missing Originals Fee/i],
    ["help_desk", "Help desk / service calls", "priority_first_data", /Help Desk\/Service Calls/i],
    ["after_hours_help_desk", "After-hours help desk calls", "priority_first_data", /After-Hours Help Desk Calls/i],
  ].map(([id, label, scope, pattern]) => Object.freeze({ id, label, scope, pattern })));

  function clean(value) {
    return String(value || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  }

  function findSplitRule(text) {
    const match = String(text || "").match(
      /split\s+(\d+(?:\.\d+)?)\s*%\s+to\s+(?:ISC|ISO|agent).*?(\d+(?:\.\d+)?)\s*%\s+to\s+([A-Za-z][A-Za-z0-9 ]+)/is
    );
    if (!match) return null;
    return Object.freeze({
      id: "income_split",
      label: "Income split",
      scope: "compensation",
      value: `${match[1]}% agent / ${match[2]}% ${clean(match[3]).replace(/[.\n].*$/s, "")}`,
      evidence: clean(match[0]),
      confidence: 0.98,
      verified: false,
    });
  }

  function valueFromChunk(chunk) {
    const normalized = clean(chunk);
    if (/Pass[\s-]*Thru/i.test(normalized)) return "Pass-Through";
    const basisPoints = normalized.match(
      /(\d+(?:\.\d+)?)\s+basis points\s*\((\d+(?:\.\d+)?)%\)[^$\n]*/i
    );
    if (basisPoints) {
      return `${basisPoints[1]} basis points (${basisPoints[2]}%)${clean(basisPoints[0]).replace(basisPoints[0].slice(0, basisPoints[0].indexOf(")")+1), "")}`;
    }
    const money = [...normalized.matchAll(
      /\$[ \t]*\d+(?:\.\d+)?(?:[ \t]*\/?[ \t]*[A-Za-z][A-Za-z -]*)?/g
    )];
    if (!money.length) return "";
    if (money.length > 1 && normalized.startsWith("$") && normalized.includes(",")) {
      return money.map(match => clean(match[0])).join(", ");
    }
    return clean(money[money.length - 1][0]).replace(/\$\s+/, "$");
  }

  function extractTerms(rawText) {
    const text = String(rawText || "").replace(/\r/g, "");
    const priorityMarker = text.search(/Priority\/First\s+(?:Data\s+)?Specific Items/i);
    const matches = [];

    for (const definition of DEFINITIONS) {
      const source = definition.scope === "priority_first_data" && priorityMarker >= 0
        ? text.slice(priorityMarker)
        : definition.scope === "general" && priorityMarker >= 0
          ? text.slice(0, priorityMarker)
          : text;
      const offset = definition.scope === "priority_first_data" && priorityMarker >= 0
        ? priorityMarker
        : 0;
      const match = source.match(definition.pattern);
      if (!match) continue;
      matches.push({
        definition,
        start: offset + match.index,
        labelEnd: offset + match.index + match[0].length,
      });
    }

    matches.sort((a, b) => a.start - b.start);
    const terms = [];
    for (let index = 0; index < matches.length; index += 1) {
      const current = matches[index];
      const next = matches[index + 1];
      const end = next ? next.start : Math.min(text.length, current.labelEnd + 240);
      const chunk = text.slice(current.labelEnd, end);
      const value = valueFromChunk(chunk);
      if (!value) continue;
      terms.push(Object.freeze({
        id: current.definition.id,
        label: current.definition.label,
        scope: current.definition.scope,
        value,
        evidence: clean(text.slice(current.start, end)).slice(0, 320),
        confidence: 0.92,
        verified: false,
      }));
    }

    const split = findSplitRule(text);
    if (split) terms.unshift(split);
    return Object.freeze(terms);
  }

  function extractionResult(rawText, source = "pdf_text") {
    const terms = extractTerms(rawText);
    return Object.freeze({
      status: terms.length ? "extracted" : "needs_review",
      source,
      terms,
      extractedAt: new Date().toISOString(),
    });
  }

  global.ClearCostScheduleAExtraction = Object.freeze({
    extractTerms,
    extractionResult,
  });
})(typeof window !== "undefined" ? window : globalThis);
