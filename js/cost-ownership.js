(function (global) {
  "use strict";

  const BUCKETS = Object.freeze([
    "wholesale_interchange",
    "network",
    "third_party",
    "processor_revenue",
    "unknown",
  ]);

  const RECONCILIATION_EXCLUDED_EXTRACTION_METHODS = Object.freeze([
    "commerce_control_interchange_table_row",
  ]);

  function cents(value) {
    return Math.round(Number(value || 0) * 100);
  }

  function money(centsValue) {
    return centsValue / 100;
  }

  function isEligible(fee) {
    return !RECONCILIATION_EXCLUDED_EXTRACTION_METHODS.includes(
      fee && fee.extractionMethod
    );
  }

  function analyzeCostOwnership(fees = [], statementTotal = null, tolerance = 0.01, interchangeVerification = null) {
    const bucketCents = Object.fromEntries(BUCKETS.map(bucket => [bucket, 0]));
    const unexplained = [];
    const eligibleFees = [];

    for (const fee of fees) {
      if (!isEligible(fee)) continue;
      eligibleFees.push(fee);
      const classified = fee && fee.status === "classified";
      const bucket = classified && BUCKETS.includes(fee.bucket)
        ? fee.bucket
        : "unknown";
      const amountCents = cents(fee && fee.amount);
      bucketCents[bucket] += amountCents;
      if (bucket === "unknown") {
        unexplained.push({
          description: String(
            fee && (fee.originalDescription || fee.standardName) || "Unknown fee"
          ),
          amount: money(amountCents),
          page: fee && fee.page || null,
          line: fee && fee.line || null,
        });
      }
    }

    const eligibleCents = Object.values(bucketCents)
      .reduce((total, value) => total + value, 0);
    const statementCents = statementTotal === null ||
      statementTotal === undefined
      ? null
      : cents(statementTotal);
    const varianceCents = statementCents === null
      ? null
      : eligibleCents - statementCents;
    const reconciled = statementCents !== null &&
      Math.abs(varianceCents) <= cents(tolerance);
    const publishedInterchangeVerified =
      interchangeVerification?.verified === true;
    const verified = eligibleFees.length > 0 &&
      unexplained.length === 0 &&
      reconciled &&
      publishedInterchangeVerified;

    return Object.freeze({
      verified,
      publishedInterchangeVerified,
      interchangeVerification,
      status: verified ? "verified" : "not_verified",
      eligibleFeeCount: eligibleFees.length,
      buckets: Object.freeze(
        Object.fromEntries(
          BUCKETS.map(bucket => [bucket, money(bucketCents[bucket])])
        )
      ),
      incumbentProcessorMarkup: verified
        ? money(bucketCents.processor_revenue)
        : null,
      eligibleTotal: money(eligibleCents),
      statementTotal: statementCents === null ? null : money(statementCents),
      variance: varianceCents === null ? null : money(varianceCents),
      unexplained: Object.freeze(unexplained),
      blockReason: verified
        ? null
        : !publishedInterchangeVerified
          ? interchangeVerification?.blockReason ||
            "Published interchange rates have not been independently verified."
          : unexplained.length
            ? `${unexplained.length} fee(s) require economic-owner review.`
            : statementCents === null
            ? "Statement fee total is unavailable."
            : "Cost buckets do not reconcile to the statement total.",
    });
  }

  function calculateTraditionalProposal({
    monthlyVolume,
    monthlyTransactions,
    costOwnership,
    percentageMarkup,
    transactionMarkup,
    monthlyFee = 0,
    equipmentFee = 0,
    agentSplitPercent,
  }) {
    if (!costOwnership || !costOwnership.verified) {
      return Object.freeze({
        verified: false,
        blockReason: costOwnership && costOwnership.blockReason ||
          "Current statement cost ownership is not verified.",
      });
    }

    const volume = Number(monthlyVolume);
    const transactions = Math.round(Number(monthlyTransactions));
    const percent = Number(percentageMarkup);
    const perTransaction = Number(transactionMarkup);
    const split = Number(agentSplitPercent);

    if (![volume, transactions, percent, perTransaction, split]
      .every(Number.isFinite)) {
      throw new Error("Verified proposal inputs are required.");
    }

    const passThroughCents = cents(
      costOwnership.buckets.wholesale_interchange +
      costOwnership.buckets.network +
      costOwnership.buckets.third_party
    );
    const percentageRevenueCents = cents(volume * percent / 100);
    const transactionRevenueCents = cents(transactions * perTransaction);
    const fixedRevenueCents = cents(monthlyFee) + cents(equipmentFee);
    const grossRevenueCents = percentageRevenueCents +
      transactionRevenueCents + fixedRevenueCents;
    const proposedCents = passThroughCents + grossRevenueCents;
    const currentCents = cents(costOwnership.statementTotal);
    const savingsCents = currentCents - proposedCents;
    const residualCents = cents(money(grossRevenueCents) * split / 100);

    return Object.freeze({
      verified: true,
      passThroughCost: money(passThroughCents),
      percentageMarkupRevenue: money(percentageRevenueCents),
      transactionMarkupRevenue: money(transactionRevenueCents),
      fixedRevenue: money(fixedRevenueCents),
      grossProgramRevenue: money(grossRevenueCents),
      proposedMerchantExpense: money(proposedCents),
      monthlySavings: money(savingsCents),
      annualSavings: money(savingsCents * 12),
      projectedMonthlyResidual: money(residualCents),
    });
  }

  global.ClearCostCostOwnership = Object.freeze({
    BUCKETS,
    RECONCILIATION_EXCLUDED_EXTRACTION_METHODS,
    analyzeCostOwnership,
    calculateTraditionalProposal,
  });
})(typeof window !== "undefined" ? window : globalThis);
