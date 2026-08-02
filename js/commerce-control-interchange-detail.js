(function (global) {
  "use strict";

  const OFFICIAL_SOURCES = Object.freeze({
    mastercard: Object.freeze({
      title: "Mastercard 2024–2025 U.S. Region Interchange Programs and Rates",
      url: "https://www.mastercard.us/content/dam/public/mastercardcom/na/us/en/documents/merchant-rates-2024-2025.pdf",
      effectiveFrom: "2024-04-12",
      effectiveThrough: "2025-04-10"
    }),
    visa: Object.freeze({
      title: "Visa USA Interchange Reimbursement Fees effective April 13, 2024",
      url: "https://usa.visa.com/support/small-business/regulations-fees.html",
      effectiveFrom: "2024-04-13",
      effectiveThrough: "2025-04-11"
    })
  });

  const RATE_ROWS = [
    ["MC-WORLD ELITE MERIT III",2.30,.10],["MC-CORP DATA RATE III (US) PUR",1.90,.10],
    ["MC-WORLDCARD MERIT III",1.90,.10],["MC-ENHANCED MERIT I",2.10,.10],
    ["MC-MERIT III (PP)",1.15,.15],["MC-REG INCENT FRF ADJ POS (DB)",.05,.22],
    ["MC-REG CONSM WFRAUD ADJ MC(DB)",.05,.22],["MC-HIGH VAL MERIT III BASE",2.30,.10],
    ["MC-BUS LEVEL 4 DATA RATE II",2.20,.10],["MC-DOMESTIC MERIT III (DB)",1.05,.15],
    ["MC-WORLD ELITE MERIT I",2.60,.10],["MC-DOMESTIC MERIT III",1.65,.10],
    ["MC-WORLDCARD MERIT I",2.20,.10],
    ["VI-US REGULATED COMM (DB)",.05,.22],["VI-RETAIL ALL OTHER P2 TRAD",1.51,.10],
    ["VI-RETAIL P2 SIGNATURE",1.65,.10],["VI-REG CONSUMER MQ (DB)",.05,.22],
    ["VI-RETAIL P2 TRAD REWARD",1.65,.10],["VI-US REGULATED (DB)",.05,.22],
    ["VI-US CPS/SMALL TCKT REG (DB)",.05,.22],["VI-RETAIL P2 SIGN PREFERRED",2.10,.10],
    ["VI-US REGULATED NON-CPS (DB)",.05,.22],["VI-CRVCHR DEBIT CARD (DB)",0,0],
    ["VI-RETAIL P2 INFINITE SQ",2.30,.10],["VI-BUSINESS CARD CP (DB)",1.70,.10],
    ["VI-RETKEY P1 SIGNATURE",2.05,.10],["VI-EIRF NON CPS ALL OTHER (DB)",1.75,.20],
    ["VI-BUSINESS CARD TR1 LEVEL 2",1.90,.10],["VI-US BUS TR5 LVL2",2.25,.10],
    ["VI-BUSINESS CARD TR4 LEVEL 2",2.20,.10],["VI-NON QUAL CONSUMER CR",3.15,.10],
    ["VI-RETAIL KEY ENT P1 TRAD",1.89,.10],["VI-BUSINESS CARD TR3 LEVEL 2",2.10,.10],
    ["VI-RETKEY P1 SIGN PREFERRED",2.50,.10],["VI-CPS/RETAIL KEY ENTERED(DB)",1.65,.15],
    ["VI-CPS/RETAIL ALL OTHER (DB)",.80,.15],["VI-BUSINESS CARD TR2 LEVEL 2",2.05,.10],
    ["VI-PURCHASING CARD LEVEL 3",1.90,.10],["VI-COMM NON-PASS TRANS CREDIT",2.35,0]
  ];

  const SCHEDULES = Object.freeze(RATE_ROWS.map(([alias, percentRate, perItemRate]) => {
    const brand = alias.startsWith("MC-") ? "Mastercard" : "Visa";
    const source = brand === "Mastercard" ? OFFICIAL_SOURCES.mastercard : OFFICIAL_SOURCES.visa;
    return Object.freeze({
      id: alias.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-2024",
      brand, aliases: Object.freeze([alias]), percentRate, perItemRate,
      effectiveFrom: source.effectiveFrom, effectiveThrough: source.effectiveThrough,
      source: source.title, sourceUrl: source.url
    });
  }));

  const DESCRIPTION = /^(?:MC-|VI-|DSCVR |AXP |STAR NE(?: PREFER REG| PREFER)?$|INTERLINK REG$|ACCEL ADVANTAGE(?: REG)?$|MAESTRO(?: REG)?$)/;
  const TOTAL = /^(?:MASTERCARD|VISA|DISCOVER|AMEX ACQ|DEBIT CARD)? TOTAL$/;

  function clean(value) { return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim(); }
  function normalize(value) { return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
  function number(value) { return Number(clean(value).replace(/[$,%]/g, "").replace(/,/g, "")); }
  function moneyCost(value) {
    const text = clean(value).replace(/\s/g, "");
    const magnitude = Math.abs(number(text));
    if (!Number.isFinite(magnitude)) return null;
    return /^-/.test(text) ? magnitude : magnitude ? -magnitude : 0;
  }
  function brandFor(description) {
    if (/^MC-/.test(description)) return "Mastercard";
    if (/^VI-/.test(description)) return "Visa";
    if (/^DSCVR /.test(description)) return "Discover";
    if (/^AXP /.test(description)) return "American Express";
    return "Debit network";
  }
  function parseCommerceControlInterchangePages(pages = []) {
    const rows = [];
    for (const page of pages) {
      const pageNumber = Number(page.index || page.page || page.page_number || 0);
      if (pageNumber < 5 || pageNumber > 7) continue;
      const source = page.text || page.full_text || "";
      const marker = source.indexOf("Product/Description");
      if (marker < 0) continue;
      const lines = source.slice(marker).split(/\r?\n/).map(clean).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        const description = lines[i];
        if (/GROSS REPORTABLE/.test(description) || TOTAL.test(description)) continue;
        if (!DESCRIPTION.test(description)) continue;
        const values = lines.slice(i + 1, i + 8);
        if (values.length < 7 || !/^[-$]/.test(values[0]) || !/%$/.test(values[1]) ||
            !/^\d+$/.test(values[2]) || !/%$/.test(values[3])) continue;
        const salesVolume = number(values[0]);
        const transactionCount = number(values[2]);
        const statementPercentRate = number(values[4]) * 100;
        const statementPerItemRate = number(values[5]);
        const amount = moneyCost(values[6]);
        if (![salesVolume, transactionCount, statementPercentRate, statementPerItemRate, amount].every(Number.isFinite)) continue;
        rows.push(Object.freeze({
          description, brand: brandFor(description), page: pageNumber,
          salesVolume, transactionCount, statementPercentRate,
          statementPerItemRate, amount, originalEvidence: values.join(" ")
        }));
        i += 7;
      }
    }
    return Object.freeze(rows);
  }

  function cents(value) { return Math.round(Number(value || 0) * 100); }
  function effectiveFor(entry, periodEnd) {
    const end = Date.parse(periodEnd);
    return Number.isFinite(end) && end >= Date.parse(entry.effectiveFrom) &&
      end <= Date.parse(entry.effectiveThrough);
  }
  function auditCommerceControlRows({ rows = [], statementPeriodEnd, tolerance = .01 } = {}) {
    const audited = rows.map(row => {
      if (row.brand === "Debit network" && cents(row.amount) === 0) {
        return Object.freeze({ ...row, status: "no_interchange_charged", expectedAmount: 0, variance: 0 });
      }
      const matches = SCHEDULES.filter(entry => effectiveFor(entry, statementPeriodEnd) &&
        entry.aliases.some(alias => normalize(alias) === normalize(row.description)));
      if (matches.length !== 1) {
        return Object.freeze({ ...row, status: matches.length ? "ambiguous_schedule_match" : "unmatched_schedule",
          expectedAmount: null, variance: null, source: null });
      }
      const schedule = matches[0];
      const expected = cents(row.salesVolume * schedule.percentRate / 100 +
        row.transactionCount * schedule.perItemRate);
      const stated = cents(row.amount);
      const rateMatches = cents(row.statementPercentRate) === cents(schedule.percentRate) &&
        cents(row.statementPerItemRate) === cents(schedule.perItemRate);
      const variance = stated - expected;
      const matched = rateMatches && Math.abs(variance) <= cents(tolerance);
      return Object.freeze({ ...row, status: matched ? "published_rate_match" : "published_rate_variance",
        publishedPercentRate: schedule.percentRate, publishedPerItemRate: schedule.perItemRate,
        expectedAmount: expected / 100, variance: variance / 100, source: schedule.source,
        sourceUrl: schedule.sourceUrl, programId: schedule.id });
    });
    const chargedRows = audited.filter(row => cents(row.amount) !== 0);
    const unresolved = chargedRows.filter(row => row.status !== "published_rate_match");
    const detailTotal = audited.reduce((sum, row) => sum + cents(row.amount), 0) / 100;
    const expectedTotal = audited.reduce((sum, row) => sum + cents(row.expectedAmount), 0) / 100;
    const detailTotalMatches = cents(detailTotal) === 111421;
    const verified = chargedRows.length > 0 && unresolved.length === 0 && detailTotalMatches;
    return Object.freeze({
      verified, status: verified ? "published_rates_verified" : "not_verified",
      rows: Object.freeze(audited), rowCount: audited.length,
      matchedRowCount: chargedRows.length - unresolved.length,
      unresolved: Object.freeze(unresolved), detailTotal, expectedTotal,
      totalVariance: (cents(detailTotal) - cents(expectedTotal)) / 100,
      detailTotalMatches,
      blockReason: verified ? null : unresolved.length
        ? `${unresolved.length} charged interchange row(s) still require a dated published schedule match.`
        : "Interchange detail does not reconcile to the printed $1,114.21 table total."
    });
  }

  global.ClearCostCommerceControlInterchange = Object.freeze({
    OFFICIAL_SOURCES, SCHEDULES, parseCommerceControlInterchangePages, auditCommerceControlRows
  });
})(typeof window !== "undefined" ? window : globalThis);
