(function (global) {
  "use strict";

  function cents(value) {
    return Math.round(Number(value || 0) * 100);
  }

  function normalize(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function dateValue(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function effectiveFor(entry, periodEnd) {
    const end = dateValue(periodEnd);
    const from = dateValue(entry.effectiveFrom);
    const through = entry.effectiveThrough ? dateValue(entry.effectiveThrough) : Infinity;
    return end !== null && from !== null && end >= from && end <= through;
  }

  function expectedCents(row, scheduleEntry) {
    return cents(
      Number(row.salesVolume || 0) * Number(scheduleEntry.percentRate || 0) / 100 +
      Number(row.transactionCount || 0) * Number(scheduleEntry.perItemRate || 0)
    );
  }

  function verifyInterchangeRows({
    rows = [],
    schedules = [],
    statementPeriodEnd = null,
    statementReportedTotal = null,
    tolerance = 0.01,
  } = {}) {
    const results = rows.map(row => {
      const description = row.description || row.originalDescription || "";
      const normalized = normalize(description);
      const candidates = schedules.filter(entry =>
        effectiveFor(entry, statementPeriodEnd) &&
        (entry.aliases || []).some(alias => normalize(alias) === normalized)
      );

      if (candidates.length !== 1) {
        return Object.freeze({
          description,
          status: candidates.length ? "ambiguous_schedule_match" : "unmatched_schedule",
          statementAmount: Number(row.amount || 0),
          expectedAmount: null,
          variance: null,
          source: null,
        });
      }

      const schedule = candidates[0];
      const expected = expectedCents(row, schedule);
      const stated = cents(row.amount);
      const variance = stated - expected;
      const matched = Math.abs(variance) <= cents(tolerance);

      return Object.freeze({
        description,
        brand: schedule.brand,
        programId: schedule.id,
        status: matched ? "published_rate_match" : "published_rate_variance",
        salesVolume: Number(row.salesVolume || 0),
        transactionCount: Number(row.transactionCount || 0),
        publishedPercentRate: Number(schedule.percentRate || 0),
        publishedPerItemRate: Number(schedule.perItemRate || 0),
        statementAmount: stated / 100,
        expectedAmount: expected / 100,
        variance: variance / 100,
        source: schedule.source,
        effectiveFrom: schedule.effectiveFrom,
        effectiveThrough: schedule.effectiveThrough || null,
      });
    });

    const expectedTotalCents = results.reduce(
      (sum, row) => sum + (row.expectedAmount === null ? 0 : cents(row.expectedAmount)),
      0
    );
    const statedTotalCents = results.reduce(
      (sum, row) => sum + cents(row.statementAmount),
      0
    );
    const unresolved = results.filter(row => row.status !== "published_rate_match");
    const reportedCents = statementReportedTotal === null ||
      statementReportedTotal === undefined
      ? null
      : cents(statementReportedTotal);
    const coverageVarianceCents = reportedCents === null
      ? null
      : statedTotalCents - reportedCents;
    const coverageReconciled = reportedCents !== null &&
      Math.abs(coverageVarianceCents) <= cents(tolerance);
    const verified = rows.length > 0 && unresolved.length === 0 && coverageReconciled;

    return Object.freeze({
      verified,
      status: verified ? "published_rates_verified" : "not_verified",
      rowCount: results.length,
      matchedRowCount: results.length - unresolved.length,
      statementReportedTotal: reportedCents === null ? null : reportedCents / 100,
      detailStatementTotal: statedTotalCents / 100,
      expectedPublishedTotal: expectedTotalCents / 100,
      totalVariance: (statedTotalCents - expectedTotalCents) / 100,
      coverageVariance: coverageVarianceCents === null ? null : coverageVarianceCents / 100,
      coverageReconciled,
      rows: Object.freeze(results),
      unresolved: Object.freeze(unresolved),
      blockReason: verified
        ? null
        : !rows.length
          ? "Interchange detail rows were not extracted."
          : unresolved.length
            ? `${unresolved.length} interchange row(s) are unmatched, ambiguous, or differ from the published schedule.`
            : "Interchange detail does not reconcile to statement-reported interchange.",
    });
  }

  global.ClearCostInterchangeVerification = Object.freeze({
    normalize,
    verifyInterchangeRows,
  });
})(typeof window !== "undefined" ? window : globalThis);
