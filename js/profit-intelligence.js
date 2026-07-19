(function (global) {
  "use strict";

  const ProfitabilityStatus = Object.freeze({
    VERIFIED_PROFITABLE: "verified_profitable",
    VERIFIED_BELOW_TARGET: "verified_below_target",
    VERIFIED_LOSS: "verified_loss",
    NOT_VERIFIED: "not_verified",
  });

  const ProgramType = Object.freeze({
    TRADITIONAL: "traditional",
    CASH_DISCOUNT: "cash_discount",
    SURCHARGE: "surcharge",
  });

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function roundRate(value) {
    return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
  }

  function verifiedValue(value, source) {
    return { value: Number(value), verified: true, source: source || "unspecified" };
  }

  function unknownValue(source) {
    return { value: null, verified: false, source: source || "unknown" };
  }

  function validateScenario(s) {
    if (!s || typeof s !== "object") throw new Error("Profit scenario is required.");
    if (!Object.values(ProgramType).includes(s.program)) {
      throw new Error(`Unsupported program: ${s.program}`);
    }
    if (!Number.isFinite(Number(s.monthlyVolume)) || Number(s.monthlyVolume) < 0) {
      throw new Error("monthlyVolume must be a non-negative number.");
    }
    if (!Number.isInteger(Number(s.monthlyTransactions)) || Number(s.monthlyTransactions) < 0) {
      throw new Error("monthlyTransactions must be a non-negative integer.");
    }
    if (!Number.isFinite(Number(s.currentMonthlyProcessingExpense)) ||
        Number(s.currentMonthlyProcessingExpense) < 0) {
      throw new Error("currentMonthlyProcessingExpense must be a non-negative number.");
    }
  }

  function sumVerifiedComponents(components, kind, missing, audit) {
    let total = 0;
    let valid = true;

    for (const component of components || []) {
      const wrapped = component.amount || {};
      if (!wrapped.verified || wrapped.value === null || wrapped.value === undefined) {
        missing.push(`${kind}:${component.name}`);
        valid = false;
        continue;
      }
      const amount = roundMoney(wrapped.value);
      total += amount;
      audit.push(
        `Verified ${kind} '${component.name}' = ${amount.toFixed(2)} ` +
        `(source: ${wrapped.source || "unspecified"}).`
      );
    }

    return valid ? roundMoney(total) : null;
  }

  function calculateMerchantExpense(s, missing, audit) {
    const volume = Number(s.monthlyVolume);
    const tx = Number(s.monthlyTransactions);

    let base = 0;

    if (s.program === ProgramType.TRADITIONAL) {
      base =
        volume * (Number(s.merchantPercentageRate || 0) / 100) +
        tx * Number(s.merchantTransactionFee || 0) +
        Number(s.merchantMonthlyFee || 0) +
        Number(s.merchantEquipmentFee || 0);

      audit.push(
        "Traditional merchant expense = percentage charge + transaction fees + monthly fee + equipment fee."
      );
    }

    if (s.program === ProgramType.CASH_DISCOUNT) {
      if (s.cashDiscountPercent === null || s.cashDiscountPercent === undefined || s.cashDiscountPercent === "") {
        missing.push("cash_discount_percent");
        return null;
      }

      base =
        tx * Number(s.merchantTransactionFee || 0) +
        Number(s.merchantMonthlyFee || 0) +
        Number(s.merchantEquipmentFee || 0);

      audit.push(
        `Cash Discount selected at ${roundRate(s.cashDiscountPercent)}%. ` +
        "The discount percentage is a program parameter; merchant expense comes from explicit fees and verified merchant-expense components."
      );
    }

    if (s.program === ProgramType.SURCHARGE) {
      if (s.customerSurchargePercent === null ||
          s.customerSurchargePercent === undefined ||
          s.customerSurchargePercent === "") {
        missing.push("customer_surcharge_percent");
        return null;
      }

      if (s.merchantCreditCardRate === null ||
          s.merchantCreditCardRate === undefined ||
          s.merchantCreditCardRate === "") {
        missing.push("merchant_credit_card_rate");
        return null;
      }

      base =
        volume * (Number(s.merchantCreditCardRate) / 100) +
        tx * Number(s.merchantTransactionFee || 0) +
        Number(s.merchantMonthlyFee || 0) +
        Number(s.merchantEquipmentFee || 0);

      audit.push(
        `Surcharge selected: customer surcharge ${roundRate(s.customerSurchargePercent)}%; ` +
        `merchant credit-card rate ${roundRate(s.merchantCreditCardRate)}%.`
      );
    }

    const extras = sumVerifiedComponents(
      s.merchantExpenseComponents || [],
      "merchant_expense",
      missing,
      audit
    );

    if (extras === null) return null;

    const result = roundMoney(base + extras);
    audit.push(
      `Projected merchant expense = base ${roundMoney(base).toFixed(2)} + ` +
      `verified merchant-expense components ${extras.toFixed(2)} = ${result.toFixed(2)}.`
    );
    return result;
  }

  function calculateProfitScenario(s) {
    validateScenario(s);

    const audit = [];
    const warnings = [];
    const missing = [];

    const projectedMerchantExpense = calculateMerchantExpense(s, missing, audit);

    let projectedMonthlySavings = null;
    let projectedAnnualSavings = null;

    if (projectedMerchantExpense !== null) {
      projectedMonthlySavings = roundMoney(
        Number(s.currentMonthlyProcessingExpense) - projectedMerchantExpense
      );
      projectedAnnualSavings = roundMoney(projectedMonthlySavings * 12);
      audit.push(
        "Merchant savings = current monthly processing expense - projected merchant expense."
      );
    }

    const revenueTotal = sumVerifiedComponents(
      s.revenueComponents || [],
      "revenue",
      missing,
      audit
    );

    const costTotal = sumVerifiedComponents(
      s.costComponents || [],
      "cost",
      missing,
      audit
    );

    const splitWrapper = s.agentSplitPercent || {};
    let agentSplit = null;

    if (!splitWrapper.verified ||
        splitWrapper.value === null ||
        splitWrapper.value === undefined) {
      missing.push("agent_split_percent");
    } else {
      agentSplit = roundRate(splitWrapper.value);
      if (agentSplit < 0 || agentSplit > 100) {
        throw new Error("agentSplitPercent must be between 0 and 100.");
      }
      audit.push(
        `Agent split verified: ${agentSplit}% from ${splitWrapper.source || "unspecified"}.`
      );
    }

    let grossProfitPool = null;
    let projectedMonthlyResidual = null;
    let profitabilityStatus = ProfitabilityStatus.NOT_VERIFIED;
    let readyToPresent = false;

    if (revenueTotal === null || costTotal === null || agentSplit === null) {
      warnings.push(
        "Profitability is not verified. Required internal economics are missing."
      );
    } else {
      grossProfitPool = roundMoney(revenueTotal - costTotal);
      projectedMonthlyResidual = roundMoney(grossProfitPool * (agentSplit / 100));

      audit.push(
        `Gross profit pool = ${revenueTotal.toFixed(2)} - ${costTotal.toFixed(2)} = ` +
        `${grossProfitPool.toFixed(2)}.`
      );
      audit.push(
        `Monthly residual = ${grossProfitPool.toFixed(2)} x ${agentSplit}% = ` +
        `${projectedMonthlyResidual.toFixed(2)}.`
      );

      const minimum = roundMoney(s.minimumMonthlyResidual || 0);

      if (grossProfitPool < 0) {
        profitabilityStatus = ProfitabilityStatus.VERIFIED_LOSS;
        warnings.push("Profit Protection blocked a verified loss.");
      } else if (projectedMonthlyResidual < minimum) {
        profitabilityStatus = ProfitabilityStatus.VERIFIED_BELOW_TARGET;
        warnings.push(
          "Profit Protection blocked a residual below the configured minimum."
        );
      } else {
        profitabilityStatus = ProfitabilityStatus.VERIFIED_PROFITABLE;
        readyToPresent = true;
      }
    }

    return Object.freeze({
      scenarioId: s.scenarioId || "",
      program: s.program,
      projectedMerchantExpense,
      projectedMonthlySavings,
      projectedAnnualSavings,
      grossProfitPool,
      projectedMonthlyResidual,
      profitabilityStatus,
      readyToPresent,
      missingVerifiedInputs: [...new Set(missing)],
      warnings,
      audit,
    });
  }

  function getProfitBadge(result) {
    switch (result.profitabilityStatus) {
      case ProfitabilityStatus.VERIFIED_PROFITABLE:
        return { label: "Profit Verified", tone: "success" };
      case ProfitabilityStatus.VERIFIED_BELOW_TARGET:
        return { label: "Below Residual Target", tone: "warning" };
      case ProfitabilityStatus.VERIFIED_LOSS:
        return { label: "Loss — Blocked", tone: "danger" };
      default:
        return { label: "Profitability Not Verified", tone: "neutral" };
    }
  }

  global.ClearCostProfitIntelligence = Object.freeze({
    ProfitabilityStatus,
    ProgramType,
    verifiedValue,
    unknownValue,
    calculateProfitScenario,
    getProfitBadge,
  });
})(typeof window !== "undefined" ? window : globalThis);
