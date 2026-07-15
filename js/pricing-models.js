// Sprint 5.1 — Pricing Models
// Architecture: each model is a self-contained object registered in PRICING_MODELS.
// Adding a future model requires only appending a new entry — existing models are never modified.

export const MODEL_IDS = Object.freeze({
  INTERCHANGE_PLUS: 'interchange_plus',
  FLAT_RATE:        'flat_rate',
  CASH_DISCOUNT:    'cash_discount',
  SURCHARGE:        'surcharge'
});

// ── Interchange Plus ──────────────────────────────────────────────────────────
// Merchant pays actual interchange + a fixed markup (rate % + per-transaction fee).
const interchangePlusModel = {
  id: MODEL_IDS.INTERCHANGE_PLUS,
  name: 'Interchange Plus',
  description: 'Pass-through interchange cost plus a fixed markup rate and per-transaction fee',

  // inputs: { grossVolume, transactionCount, interchangeCost, markupRate, perTransactionFee }
  calculateCost({ grossVolume, transactionCount, interchangeCost, markupRate = 0, perTransactionFee = 0 }) {
    const inputs = { grossVolume, transactionCount, interchangeCost, markupRate, perTransactionFee };

    if (!grossVolume || grossVolume <= 0) {
      return _blocked('gross_volume must be positive', inputs, this.id);
    }
    if (!transactionCount || transactionCount <= 0) {
      return _blocked('transaction_count must be positive', inputs, this.id);
    }
    if (interchangeCost == null || interchangeCost < 0) {
      return _blocked('interchange_cost must be provided and non-negative', inputs, this.id);
    }

    const markupCost        = _round(grossVolume * markupRate);
    const perTransactionCost = _round(transactionCount * perTransactionFee);
    const totalCost         = _round(interchangeCost + markupCost + perTransactionCost);
    const effectiveRate     = _round6(totalCost / grossVolume);

    return {
      modelId: this.id,
      modelName: this.name,
      status: 'calculated',
      totalCost,
      effectiveRate,
      breakdown: {
        interchangeCost: _round(interchangeCost),
        markupCost,
        perTransactionCost
      },
      trace: {
        formula: 'interchange_cost + (gross_volume × markup_rate) + (transaction_count × per_transaction_fee)',
        inputs,
        intermediates: { markupCost, perTransactionCost },
        rounding: 'round half-up to 2 dp; effective_rate 6 dp',
        assumptions: [],
        finalValue: totalCost
      }
    };
  }
};

// ── Flat Rate ─────────────────────────────────────────────────────────────────
// Single blended rate applied to all volume, plus optional per-transaction fee.
const flatRateModel = {
  id: MODEL_IDS.FLAT_RATE,
  name: 'Flat Rate',
  description: 'Single blended percentage rate applied to all volume plus optional per-transaction fee',

  // inputs: { grossVolume, transactionCount, flatRate, perTransactionFee }
  calculateCost({ grossVolume, transactionCount, flatRate, perTransactionFee = 0 }) {
    const inputs = { grossVolume, transactionCount, flatRate, perTransactionFee };

    if (!grossVolume || grossVolume <= 0) {
      return _blocked('gross_volume must be positive', inputs, this.id);
    }
    if (flatRate == null || flatRate < 0) {
      return _blocked('flat_rate must be provided and non-negative', inputs, this.id);
    }

    const rateCost          = _round(grossVolume * flatRate);
    const perTransactionCost = transactionCount > 0 ? _round(transactionCount * perTransactionFee) : 0;
    const totalCost         = _round(rateCost + perTransactionCost);
    const effectiveRate     = _round6(totalCost / grossVolume);

    return {
      modelId: this.id,
      modelName: this.name,
      status: 'calculated',
      totalCost,
      effectiveRate,
      breakdown: { rateCost, perTransactionCost },
      trace: {
        formula: '(gross_volume × flat_rate) + (transaction_count × per_transaction_fee)',
        inputs,
        intermediates: { rateCost, perTransactionCost },
        rounding: 'round half-up to 2 dp; effective_rate 6 dp',
        assumptions: [],
        finalValue: totalCost
      }
    };
  }
};

// ── Cash Discount ─────────────────────────────────────────────────────────────
// Merchant posts a higher cash price; card users pay the surcharge; net merchant
// cost is the programme fee only (not the card-user surcharge).
const cashDiscountModel = {
  id: MODEL_IDS.CASH_DISCOUNT,
  name: 'Cash Discount',
  description: 'Card-user pays the surcharge; merchant cost is programme fee only',

  // inputs: { grossVolume, transactionCount, programFeeRate, programFeeFixed, surchargeRate }
  calculateCost({ grossVolume, transactionCount, programFeeRate = 0, programFeeFixed = 0, surchargeRate = 0 }) {
    const inputs = { grossVolume, transactionCount, programFeeRate, programFeeFixed, surchargeRate };

    if (!grossVolume || grossVolume <= 0) {
      return _blocked('gross_volume must be positive', inputs, this.id);
    }

    // Surcharge collected from card users offsets cost; merchant pays programme fee.
    const surchargeCollected = _round(grossVolume * surchargeRate);
    const programmeRateCost  = _round(grossVolume * programFeeRate);
    const programmeFixedCost = _round(transactionCount > 0 ? transactionCount * programFeeFixed : 0);
    const merchantCost       = _round(programmeRateCost + programmeFixedCost);
    const effectiveRate      = _round6(merchantCost / grossVolume);

    return {
      modelId: this.id,
      modelName: this.name,
      status: 'calculated',
      totalCost: merchantCost,
      effectiveRate,
      breakdown: {
        programmeRateCost,
        programmeFixedCost,
        surchargeCollected,
        merchantCost
      },
      trace: {
        formula: '(gross_volume × program_fee_rate) + (transaction_count × program_fee_fixed)',
        inputs,
        intermediates: { surchargeCollected, programmeRateCost, programmeFixedCost },
        rounding: 'round half-up to 2 dp; effective_rate 6 dp',
        assumptions: ['surcharge collected from card users is separate from merchant cost'],
        finalValue: merchantCost
      }
    };
  }
};

// ── Surcharge ─────────────────────────────────────────────────────────────────
// Merchant adds a surcharge to card transactions.  Merchant's net cost is
// programme/network fees minus the surcharge revenue collected.
const surchargeModel = {
  id: MODEL_IDS.SURCHARGE,
  name: 'Surcharge',
  description: 'Merchant adds a surcharge to card transactions; net cost = fees minus surcharge revenue',

  // inputs: { grossVolume, transactionCount, baseFeeRate, perTransactionFee, surchargeRate }
  calculateCost({ grossVolume, transactionCount, baseFeeRate = 0, perTransactionFee = 0, surchargeRate = 0 }) {
    const inputs = { grossVolume, transactionCount, baseFeeRate, perTransactionFee, surchargeRate };

    if (!grossVolume || grossVolume <= 0) {
      return _blocked('gross_volume must be positive', inputs, this.id);
    }

    const grossFees         = _round(grossVolume * baseFeeRate);
    const perTransactionCost = transactionCount > 0 ? _round(transactionCount * perTransactionFee) : 0;
    const surchargeRevenue  = _round(grossVolume * surchargeRate);
    const netCost           = _round(grossFees + perTransactionCost - surchargeRevenue);
    const merchantCost      = Math.max(0, netCost);  // surcharge cannot create negative merchant cost
    const effectiveRate     = _round6(merchantCost / grossVolume);

    return {
      modelId: this.id,
      modelName: this.name,
      status: 'calculated',
      totalCost: merchantCost,
      effectiveRate,
      breakdown: { grossFees, perTransactionCost, surchargeRevenue, netCost, merchantCost },
      trace: {
        formula: 'max(0, (gross_volume × base_fee_rate) + (transaction_count × per_transaction_fee) − (gross_volume × surcharge_rate))',
        inputs,
        intermediates: { grossFees, perTransactionCost, surchargeRevenue, netCost },
        rounding: 'round half-up to 2 dp; effective_rate 6 dp; net_cost floored at 0',
        assumptions: ['surcharge revenue offsets merchant cost but cannot create a net gain'],
        finalValue: merchantCost
      }
    };
  }
};

// ── Registry ──────────────────────────────────────────────────────────────────
// Map by id for O(1) lookup; array preserved for ordered iteration.
const PRICING_MODELS_LIST = [
  interchangePlusModel,
  flatRateModel,
  cashDiscountModel,
  surchargeModel
];

const PRICING_MODELS_MAP = Object.fromEntries(PRICING_MODELS_LIST.map(m => [m.id, m]));

export const PRICING_MODELS = Object.freeze(PRICING_MODELS_MAP);
export const PRICING_MODELS_ARRAY = Object.freeze(PRICING_MODELS_LIST);

export function getPricingModel(modelId) {
  return PRICING_MODELS_MAP[modelId] || null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function _round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function _round6(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function _blocked(reason, inputs, modelId) {
  return {
    modelId,
    status: 'blocked',
    reason,
    totalCost: null,
    effectiveRate: null,
    breakdown: {},
    trace: { inputs, formula: null, intermediates: {}, rounding: null, assumptions: [], finalValue: null }
  };
}
