import FEE_REGISTRY from './fee-registry.js';

const clean = value =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

const normalize = value =>
  clean(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenSet = value =>
  new Set(
    normalize(value)
      .split(' ')
      .filter(Boolean)
  );

function jaccard(a, b) {
  const aa = tokenSet(a);
  const bb = tokenSet(b);

  if (
    !aa.size ||
    !bb.size
  ) {
    return 0;
  }

  let intersection = 0;

  for (
    const token of
    aa
  ) {
    if (
      bb.has(token)
    ) {
      intersection++;
    }
  }

  return (
    intersection /
    (
      aa.size +
      bb.size -
      intersection
    )
  );
}

function sectionBoost(
  section,
  fee
) {
  if (
    section ===
      'assessment_detail' &&
    fee.category ===
      'assessment'
  ) {
    return 0.08;
  }

  if (
    section ===
      'interchange_detail' &&
    fee.category ===
      'interchange'
  ) {
    return 0.08;
  }

  if (
    section ===
      'monthly_fees' &&
    [
      'monthly_fee',
      'annual_fee',
      'compliance'
    ].includes(
      fee.category
    )
  ) {
    return 0.05;
  }

  if (
    section ===
      'equipment_fees' &&
    fee.subcategory ===
      'equipment_rental'
  ) {
    return 0.08;
  }

  if (
    section ===
      'chargebacks' &&
    fee.category ===
      'chargeback'
  ) {
    return 0.08;
  }

  return 0;
}

export function classifyFeeCandidate(
  candidate,
  {
    processor =
      'Unknown processor'
  } = {}
) {
  const description =
    clean(
      candidate.originalDescription ||
      candidate.description ||
      ''
    );

  const normalized =
    normalize(
      description
    );

  let best =
    null;

  for (
    const fee of
    FEE_REGISTRY
  ) {
    if (
      fee.processorScope &&
      fee.processorScope !==
        processor
    ) {
      continue;
    }

    let score =
      0;

    const evidence =
      [];

    if (
      fee.aliases.some(
        alias =>
          normalize(
            alias
          ) ===
          normalized
      )
    ) {
      score =
        0.99;

      evidence.push(
        'exact_alias'
      );
    }

    if (
      score <
      0.99
    ) {
      const pattern =
        fee.patterns.find(
          p =>
            p.test(
              description
            )
        );

      if (
        pattern
      ) {
        score =
          Math.max(
            score,
            0.95
          );

        evidence.push(
          'pattern_match'
        );
      }
    }

    if (
      score <
      0.95
    ) {
      const similarity =
        Math.max(
          ...fee.aliases.map(
            alias =>
              jaccard(
                alias,
                description
              )
          )
        );

      if (
        similarity >=
        0.75
      ) {
        score =
          Math.max(
            score,
            0.78 +
              Math.min(
                (
                  similarity -
                  0.75
                ) *
                  0.6,
                0.14
              )
          );

        evidence.push(
          'token_similarity'
        );
      }
    }

    score =
      Math.min(
        1,
        score +
          sectionBoost(
            candidate.section,
            fee
          )
      );

    if (
      !best ||
      score >
        best.score
    ) {
      best = {
        fee,
        score,
        evidence
      };
    }
  }

  const threshold =
    0.82;

  if (
    !best ||
    best.score <
      threshold
  ) {
    /*
     * Commerce Control's fee-row parser supplies verified statement context
     * even when a card-program description has no registry alias.  Only rows
     * anchored to the statement's Interchange charges or Program Fees labels
     * receive this fallback.  Service charges and Fees remain unknown until a
     * specific fee rule identifies their economic meaning.
     */
    const commerceControlCategory =
      candidate.extractionMethod ===
        'commerce_control_fee_row'
        ? candidate.commerceControlCategory
        : null;

    if (
      commerceControlCategory ===
        'interchange' ||
      commerceControlCategory ===
        'program'
    ) {
      return {
        ...candidate,

        canonicalId:
          commerceControlCategory ===
            'program'
            ? 'CCF-CC-PROGRAM-DETAIL'
            : 'CCF-CC-INTERCHANGE-DETAIL',

        standardName:
          commerceControlCategory ===
            'program'
            ? 'Commerce Control Program Interchange Detail'
            : 'Commerce Control Interchange Detail',

        category:
          'interchange',

        subcategory:
          commerceControlCategory ===
            'program'
            ? 'program_interchange_detail'
            : 'interchange_detail',

        bucket:
          'wholesale_interchange',

        suggestedBucket:
          'wholesale_interchange',

        brand:
          null,

        frequency:
          'statement_detail',

        negotiable:
          false,

        published:
          null,

        ruleId:
          'CC-FT-0001',

        classificationConfidence:
          0.95,

        classificationEvidence: [
          'commerce_control_fee_row',
          `commerce_control_category:${commerceControlCategory}`
        ],

        processor,

        status:
          'classified'
      };
    }

    const suggestedBucket =
      candidate.section ===
        'assessment_detail'
        ? 'network'
        : candidate.section ===
            'interchange_detail'
          ? 'wholesale_interchange'
          : candidate.section ===
              'equipment_fees'
            ? 'third_party'
            : 'processor_revenue';

    return {
      ...candidate,

      canonicalId:
        null,

      standardName:
        null,

      category:
        'unknown',

      subcategory:
        'unknown',

      bucket:
        'unknown',

      suggestedBucket,

      brand:
        null,

      frequency:
        null,

      negotiable:
        null,

      published:
        null,

      ruleId:
        null,

      classificationConfidence:
        Number(
          (
            best?.score ||
            0
          ).toFixed(
            2
          )
        ),

      classificationEvidence:
        best?.evidence ||
        [],

      processor,

      status:
        'needs_review'
    };
  }

  const fee =
    best.fee;

  return {
    ...candidate,

    canonicalId:
      fee.id,

    standardName:
      fee.standardName,

    category:
      fee.category,

    subcategory:
      fee.subcategory,

    bucket:
      fee.bucket,

    brand:
      fee.brand,

    frequency:
      fee.frequency,

    negotiable:
      fee.negotiable,

    published:
      fee.published,

    ruleId:
      fee.ruleId,

    classificationConfidence:
      Number(
        best.score.toFixed(
          2
        )
      ),

    classificationEvidence:
      best.evidence,

    processor,

    status:
      'classified'
  };
}

export function classifyFeeCandidates(
  candidates = [],
  options = {}
) {
  return candidates.map(
    candidate =>
      classifyFeeCandidate(
        candidate,
        options
      )
  );
}
// ── Reconciliation-eligible fee accounting ──────────────────────────────────
//
// Some processor-specific extraction methods emit fee candidates that are
// ALSO represented in the statement's summarised fee section. These detail
// rows are preserved for analysis (they carry per-line interchange provenance)
// but must NOT be counted a second time when reconciling the extracted fee
// total against the statement's printed total.
//
// This exclusion is scoped narrowly to Commerce Control interchange detail
// rows. It is intentionally NOT a global suppression of interchange detail —
// interchange detail for every other processor stays fully eligible.
export const RECONCILIATION_EXCLUDED_EXTRACTION_METHODS = Object.freeze([
  'commerce_control_interchange_table_row'
]);

// A fee candidate is reconciliation-eligible unless its extraction method is
// one of the known duplicate-detail methods above.
export function isReconciliationEligible(fee) {
  return !RECONCILIATION_EXCLUDED_EXTRACTION_METHODS.includes(
    fee && fee.extractionMethod
  );
}

// Sum, in integer cents, of every reconciliation-eligible fee candidate.
// Integer-cent arithmetic avoids floating-point accumulation error.
export function computeReconciliationEligibleCents(fees=[]) {
  return fees.reduce((cents, fee) => {
    if (!isReconciliationEligible(fee)) return cents;
    return cents + Math.round(Number(fee.amount || 0) * 100);
  }, 0);
}

// Reconciliation-eligible total in dollars, derived from the integer-cent sum.
export function computeReconciliationEligibleTotal(fees=[]) {
  return computeReconciliationEligibleCents(fees) / 100;
}

export function summarizeFees(fees=[]){

  const summary = {
    classified:
      0,

    unknown:
      0,

    totalAmount:
      0,

    // Reconciliation-eligible total (excludes duplicate detail rows such as
    // Commerce Control interchange table rows). All fee candidates remain
    // preserved; only the reconciliation SUM differs from totalAmount.
    reconciliationEligibleCents:
      0,

    reconciliationEligibleTotal:
      0,

    buckets: {
      wholesale_interchange:
        0,

      network:
        0,

      processor_revenue:
        0,

      third_party:
        0,

      unknown:
        0
    },

    categories:
      {}
  };

  for(const fee of fees){
    if (
      fee.status ===
      'classified'
    ) {
      summary.classified++;

    } else {
      summary.unknown++;
    }

    summary.totalAmount +=
      Number(
        fee.amount ||
        0
      );

    const bucket =
      fee.status ===
      'classified'
        ? fee.bucket
        : 'unknown';

    summary.buckets[bucket] =
      (
        summary.buckets[bucket] ||
        0
      ) +
      Number(
        fee.amount ||
        0
      );

    const category =
      fee.status ===
      'classified'
        ? fee.category
        : 'unknown';

    summary.categories[category] =
      (
        summary.categories[category] ||
        0
      ) +
      Number(
        fee.amount ||
        0
      );
  }

  summary.totalAmount =
    Number(
      summary.totalAmount.toFixed(
        2
      )
    );

  for (
    const key of
    Object.keys(
      summary.buckets
    )
  ) {
    summary.buckets[key] =
      Number(
        summary.buckets[key].toFixed(
          2
        )
      );
  }

  for (
    const key of
    Object.keys(
      summary.categories
    )
  ) {
    summary.categories[key] =
      Number(
        summary.categories[key].toFixed(
          2
        )
      );
  }

  summary.reconciliationEligibleCents =
    computeReconciliationEligibleCents(fees);

  summary.reconciliationEligibleTotal =
    summary.reconciliationEligibleCents / 100;

  return summary;
}