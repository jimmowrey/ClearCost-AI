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

  const PROGRAM_FEE_ROWS = Object.freeze([
    ["MASTERCARD ASSESSMENT FEE", "card_brand_assessment"],
    ["MC ASSESSMNT TRAN AMT >=$1K", "card_brand_assessment"],
    ["VISA ASSESSMENT FEE CR", "card_brand_assessment"],
    ["VISA ASSESSMENT FEE DB", "card_brand_assessment"],
    ["DISCOVER ASSESSMENT FEE", "card_brand_assessment"],
    ["AXP ACQUIRER TRANS FEE", "card_brand_assessment"],
    ["AMEX ASSESSMENT FEE", "card_brand_assessment"],
    ["ACCEL ADVANTAGE DECLINE", "debit_network_interchange"],
    ["INTERLINK REG", "debit_network_interchange"],
    ["ACCEL ADVANTAGE", "debit_network_interchange"],
    ["STAR NE PREFER REG", "debit_network_interchange"],
    ["MAESTRO REG", "debit_network_interchange"],
    ["STAR NE PREFER", "debit_network_interchange"],
    ["MAESTRO", "debit_network_interchange"],
    ["ACCEL ADVANTAGE REG", "debit_network_interchange"],
    ["STAR NE", "debit_network_interchange"]
  ].map(([descriptionPrefix, economicOwner]) => Object.freeze({ descriptionPrefix, economicOwner })));

  const NON_PROGRAM_FEE_ROWS = Object.freeze([
    ["MC AUTH CONNECTIVITY FEE", "card_network"],
    ["MASTERCARD DEBIT SALES DISC", "processor_revenue"],
    ["MC LICENSE VOLUME FEE", "card_network"],
    ["MASTERCARD SALES DISCOUNT", "processor_revenue"],
    ["MC ACQUIRER AVS BILLING", "card_network"],
    ["MC CVC2 TRANSACTION FEE", "card_network"],
    ["MC NETWORK ACCESS AUTH FEE", "card_network"],
    ["VISA SALES DISCOUNT", "processor_revenue"],
    ["VISA DEBIT SALES DISCOUNT", "processor_revenue"],
    ["VI NTWK ACQ PROC FEE US CR", "card_network"],
    ["VI NTWK ACQ PROC FEE US DB/PP", "card_network"],
    ["DISCOVER DATA USAGE FEE", "card_network"],
    ["DISCOVER SALES DISCOUNT", "processor_revenue"],
    ["NETWORK AUTHORIZATION FEE", "card_network"],
    ["ADDRS VERIFICATION SERVICE FEE", "card_network"],
    ["CARDPOINTE PLATFORM FEE", "third_party_platform"],
    ["VI BASE II CR VCHER FEE US CR", "card_network"],
    ["VI BASE II SYSTEM FILE FEE", "card_network"],
    ["VI BASE II CR VCHER FEE US D/P", "card_network"],
    ["AMEX SALES DISCOUNT", "processor_revenue"],
    ["DIGITAL INVESTMENT FEE", "card_network"],
    ["MC CLEARING CONNECTIVITY FEE", "card_network"],
    ["GEN. DEBIT TRANSACTION FEE", "processor_revenue"],
    ["ONLINE DEBIT DENIAL", "processor_revenue"],
    ["VI-COMMERCIAL SOLUTIONS FEE", "card_network"],
    ["STAR TOKEN EXCHANGE DEBIT FEE", "card_network"],
    ["REGULATORY PRODUCT FEE", "processor_revenue"],
    ["MC MONTHLY LOCATION FEE", "card_network"],
    ["VISA NETWORK FEE CP 1B-01", "card_network"],
    ["VI TRANSACTION INTEGRITY FEE", "card_network"]
  ].map(([descriptionPrefix, economicOwner]) => Object.freeze({ descriptionPrefix, economicOwner })));

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

  function parseCommerceControlProgramFeeGap(pages = []) {
    const parsed = [];
    for (const catalogRow of PROGRAM_FEE_ROWS) {
      const prefix = normalize(catalogRow.descriptionPrefix);
      let match = null;
      for (const page of pages) {
        const pageNumber = Number(page.index || page.page || page.page_number || 0);
        if (pageNumber < 3 || pageNumber > 5) continue;
        const lines = String(page.text || page.full_text || "").split(/\r?\n/).map(clean).filter(Boolean);
        const index = lines.findIndex(line => catalogRow.economicOwner === "debit_network_interchange"
          ? normalize(line) === prefix
          : normalize(line).startsWith(prefix));
        if (index < 0) continue;
        const amountText = lines.slice(index + 1, index + 10).find(line => /^-\$[\d,]+\.\d{2}$/.test(line));
        if (!amountText) continue;
        match = Object.freeze({
          description: lines[index], page: pageNumber, amount: moneyCost(amountText),
          economicOwner: catalogRow.economicOwner, evidence: `${lines[index]} ${amountText}`
        });
        break;
      }
      if (match) parsed.push(match);
    }
    return Object.freeze(parsed);
  }

  function auditCommerceControlProgramFeeGap(rows = []) {
    const assessmentTotal = rows.filter(row => row.economicOwner === "card_brand_assessment")
      .reduce((sum, row) => sum + cents(row.amount), 0) / 100;
    const debitNetworkTotal = rows.filter(row => row.economicOwner === "debit_network_interchange")
      .reduce((sum, row) => sum + cents(row.amount), 0) / 100;
    const total = (cents(assessmentTotal) + cents(debitNetworkTotal)) / 100;
    const complete = rows.length === PROGRAM_FEE_ROWS.length && cents(assessmentTotal) === 9557 &&
      cents(debitNetworkTotal) === 19413 && cents(total) === 28970;
    return Object.freeze({
      verified: complete, rows: Object.freeze([...rows]), rowCount: rows.length,
      assessmentTotal, debitNetworkTotal, total,
      statementProgramFeeTotal: 1403.91, detailInterchangeTotal: 1114.21,
      blockReason: complete ? null :
        "The $289.70 difference between detailed interchange and statement program fees is not fully explained."
    });
  }

  function parseCommerceControlNonProgramFees(pages = []) {
    const parsed = [];
    for (const catalogRow of NON_PROGRAM_FEE_ROWS) {
      const prefix = normalize(catalogRow.descriptionPrefix);
      let match = null;
      for (const page of pages) {
        const pageNumber = Number(page.index || page.page || page.page_number || 0);
        if (pageNumber < 3 || pageNumber > 5) continue;
        const lines = String(page.text || page.full_text || "").split(/\r?\n/).map(clean).filter(Boolean);
        const index = lines.findIndex(line => normalize(line).startsWith(prefix));
        if (index < 0) continue;
        const amountText = lines.slice(index + 1, index + 10).find(line => /^-\$[\d,]+\.\d{2}$/.test(line));
        if (!amountText) continue;
        match = Object.freeze({
          description: lines[index], page: pageNumber, amount: moneyCost(amountText),
          economicOwner: catalogRow.economicOwner, evidence: `${lines[index]} ${amountText}`
        });
        break;
      }
      if (match) parsed.push(match);
    }
    return Object.freeze(parsed);
  }

  function auditCommerceControlNonProgramFees(rows = []) {
    const totals = Object.fromEntries(["processor_revenue", "third_party_platform", "card_network"]
      .map(owner => [owner, rows.filter(row => row.economicOwner === owner)
        .reduce((sum, row) => sum + cents(row.amount), 0) / 100]));
    const total = Object.values(totals).reduce((sum, value) => sum + cents(value), 0) / 100;
    const complete = rows.length === NON_PROGRAM_FEE_ROWS.length &&
      cents(totals.processor_revenue) === 5208 &&
      cents(totals.third_party_platform) === 3495 &&
      cents(totals.card_network) === 1063 && cents(total) === 9766;
    return Object.freeze({
      verified: complete, rows: Object.freeze([...rows]), rowCount: rows.length,
      processorRevenue: totals.processor_revenue,
      thirdPartyPlatform: totals.third_party_platform,
      cardNetworkFees: totals.card_network, total,
      statementServiceCharges: 85.58, statementOtherFees: 12.08,
      blockReason: complete ? null : "The $97.66 outside interchange/program fees is not fully explained."
    });
  }

  function cents(value) { return Math.round(Number(value || 0) * 100); }
  function effectiveFor(entry, periodEnd) {
    const end = Date.parse(periodEnd);
    return Number.isFinite(end) && end >= Date.parse(entry.effectiveFrom) &&
      end <= Date.parse(entry.effectiveThrough);
  }
  function auditCommerceControlRows({ rows = [], programFeeRows = [], nonProgramFeeRows = [], statementPeriodEnd, tolerance = .01 } = {}) {
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
    const programFeeGap = auditCommerceControlProgramFeeGap(programFeeRows);
    const nonProgramFees = auditCommerceControlNonProgramFees(nonProgramFeeRows);
    const verified = chargedRows.length > 0 && unresolved.length === 0 && detailTotalMatches && programFeeGap.verified;
    return Object.freeze({
      verified, status: verified ? "published_rates_verified" : "not_verified",
      rows: Object.freeze(audited), rowCount: audited.length,
      matchedRowCount: chargedRows.length - unresolved.length,
      unresolved: Object.freeze(unresolved), detailTotal, expectedTotal,
      totalVariance: (cents(detailTotal) - cents(expectedTotal)) / 100,
      detailTotalMatches, programFeeGap, nonProgramFees,
      blockReason: verified ? null : unresolved.length
        ? `${unresolved.length} charged interchange row(s) still require a dated published schedule match.`
        : !detailTotalMatches
          ? "Interchange detail does not reconcile to the printed $1,114.21 table total."
          : programFeeGap.blockReason
    });
  }

  global.ClearCostCommerceControlInterchange = Object.freeze({
    OFFICIAL_SOURCES, SCHEDULES, PROGRAM_FEE_ROWS, NON_PROGRAM_FEE_ROWS, parseCommerceControlInterchangePages,
    parseCommerceControlProgramFeeGap, auditCommerceControlProgramFeeGap, auditCommerceControlRows
    , parseCommerceControlNonProgramFees, auditCommerceControlNonProgramFees
  });
})(typeof window !== "undefined" ? window : globalThis);
