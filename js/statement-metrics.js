const clean = value =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

function tryAmount(text) {
  const value =
    clean(text);

  const parenthesisMatch =
    value.match(
      /\(\s*\$?\s*([\d,]+\.\d{2})\s*\)\s*$/
    );

  if (parenthesisMatch) {
    return -parseFloat(
      parenthesisMatch[1]
        .replace(/,/g, '')
    );
  }

  const match =
    value.match(
      /(-?)\s*\$?\s*(-?)\s*([\d,]+\.\d{2})\s*$/
    );

  if (!match) {
    return null;
  }

  const negative =
    match[1] === '-' ||
    match[2] === '-';

  const amount =
    parseFloat(
      match[3]
        .replace(/,/g, '')
    );

  return negative
    ? -amount
    : amount;
}

function tryInteger(text) {
  const cleaned = clean(text);

  // Never treat the cents portion of a currency/decimal value
  // as a whole-number transaction count.
  if (/\$[\s-]*[\d,]+\.\d{2}/.test(cleaned)) {
    return null;
  }

  const match = cleaned.match(/\b(\d{1,3}(?:,\d{3})*|\d+)\s*$/);

  if (!match) {
    return null;
  }

  return parseInt(
    match[1].replace(/,/g, ''),
    10
  );
}

function tryPercent(text) {
  const match =
    clean(text).match(
      /\b(\d+\.\d{1,6})\s*%\s*$/
    );

  return match
    ? parseFloat(match[1]) / 100
    : null;
}

function insufficientMetric(
  reason = null
) {
  return {
    status:
      'insufficient_evidence',

    value:
      null,

    formula:
      null,

    inputs:
      {},

    evidence:
      null,

    confidence:
      0,

    assumptions:
      reason
        ? [reason]
        : []
  };
}

function makeFoundMetric({
  value,
  rawText,
  page,
  line,
  confidence,
  sourceType,
  label = null,
  signedStatementValue = null
}) {
  return {
    status:
      'found',

    value,

    formula:
      sourceType,

    inputs: {
      rawText,
      ...(signedStatementValue !== null
        ? { signedStatementValue }
        : {})
    },

    evidence: {
      rawText,
      page,
      line,
      sourceType,
      label,
      ...(signedStatementValue !== null
        ? { signedStatementValue }
        : {})
    },

    confidence,

    assumptions:
      []
  };
}

function buildSectionLines(
  sections = []
) {
  const lines = [];

  for (const section of sections) {
    const sectionLines =
      section.lines || [];

    for (
      let i = 0;
      i < sectionLines.length;
      i++
    ) {
      lines.push({
        text:
          sectionLines[i],

        page:
          section.page,

        line:
          section.startLine + i,

        sectionType:
          section.type
      });
    }
  }

  return lines;
}

function buildOriginalPageLines(
  pages = []
) {
  const lines = [];

  for (const page of pages) {
    const pageNumber =
      page.index ||
      page.page ||
      1;

    const pageLines =
      String(page.text || '')
        .split(/\r?\n/)
        .map(clean)
        .filter(Boolean);

    for (
      let i = 0;
      i < pageLines.length;
      i++
    ) {
      lines.push({
        text:
          pageLines[i],

        page:
          pageNumber,

        line:
          i + 1,

        source:
          'original_page'
      });
    }
  }

  return lines;
}

function samePageWindow(
  lines,
  index,
  before = 0,
  after = 8
) {
  const origin =
    lines[index];

  if (!origin) {
    return [];
  }

  const results =
    [];

  const start =
    Math.max(
      0,
      index - before
    );

  const end =
    Math.min(
      lines.length - 1,
      index + after
    );

  for (
    let i = start;
    i <= end;
    i++
  ) {
    if (
      lines[i].page !==
      origin.page
    ) {
      continue;
    }

    results.push({
      ...lines[i],
      index:
        i,
      distance:
        Math.abs(
          i - index
        )
    });
  }

  return results;
}

function parseByType(
  text,
  type
) {
  if (
    type ===
    'amount'
  ) {
    return tryAmount(
      text
    );
  }

  if (
    type ===
    'integer'
  ) {
    return tryInteger(
      text
    );
  }

  if (
    type ===
    'percent'
  ) {
    return tryPercent(
      text
    );
  }

  return null;
}

function findLabelValueMetric({
  lines,
  patterns,
  type,
  maxForwardLines = 8,
  normalize = null,
  minimumConfidence = 0.5
}) {
  let best =
    null;

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const lineInfo =
      lines[index];

    const text =
      clean(
        lineInfo.text
      );

    for (
      const {
        re,
        confidence,
        label
      } of
      patterns
    ) {
      re.lastIndex = 0;

      if (
        !re.test(
          text
        )
      ) {
        continue;
      }

      const sameLineValue =
        parseByType(
          text,
          type
        );

      if (
        sameLineValue !==
        null
      ) {
        const normalized =
          normalize
            ? normalize(
                sameLineValue
              )
            : sameLineValue;

        const candidate = {
          value:
            normalized,

          rawText:
            text,

          page:
            lineInfo.page,

          line:
            lineInfo.line,

          confidence,

          sourceType:
            'same_line_label_value',

          label:
            label ||
            re.toString(),

          signedStatementValue:
            sameLineValue
        };

        if (
          !best ||
          candidate.confidence >
            best.confidence
        ) {
          best =
            candidate;
        }
      }

      const window =
        samePageWindow(
          lines,
          index,
          0,
          maxForwardLines
        );

      for (
        const nearby of
        window
      ) {
        if (
          nearby.index ===
          index
        ) {
          continue;
        }

        const value =
          parseByType(
            nearby.text,
            type
          );

        if (
          value ===
          null
        ) {
          continue;
        }

        const adjustedConfidence =
          Math.max(
            minimumConfidence,
            confidence -
              (
                nearby.distance *
                0.03
              )
          );

        const normalized =
          normalize
            ? normalize(
                value
              )
            : value;

        const candidate = {
          value:
            normalized,

          rawText:
            `${text} | ${clean(nearby.text)}`,

          page:
            lineInfo.page,

          line:
            lineInfo.line,

          confidence:
            parseFloat(
              adjustedConfidence.toFixed(
                2
              )
            ),

          sourceType:
            'nearby_line_label_value',

          label:
            label ||
            re.toString(),

          signedStatementValue:
            value
        };

        if (
          !best ||
          candidate.confidence >
            best.confidence
        ) {
          best =
            candidate;
        }

        break;
      }
    }
  }

  if (!best) {
    return insufficientMetric();
  }

  return makeFoundMetric(
    best
  );
}

const GROSS_VOLUME_PATTERNS = [
  {
    re:
      /\btotal\s+amount\s+(?:you\s+)?submitted\b/i,
    confidence:
      0.99,
    label:
      'Total Amount Submitted'
  },
  {
    re:
      /\bgross\s+(?:processing\s+)?(?:sales?|volume)\b/i,
    confidence:
      0.95
  },
  {
    re:
      /\btotal\s+(?:sales?|processed)\b/i,
    confidence:
      0.88
  },
  {
    re:
      /\bsales?\s+volume\b/i,
    confidence:
      0.85
  },
  {
    re:
      /\bprocessing\s+volume\b/i,
    confidence:
      0.85
  }
];

const GROSS_SALES_PATTERNS = [
  {
    re:
      /\btotal\s+gross\s+sales\s+(?:you\s+)?submitted\b/i,
    confidence:
      0.99,
    label:
      'Total Gross Sales You Submitted'
  },
  {
    re:
      /\bgross\s+sales\s+submitted\b/i,
    confidence:
      0.96
  }
];

const CARD_VOLUME_PATTERNS = [
  {
    re:
      /\bcard\s+volume\b/i,
    confidence:
      0.90
  },
  {
    re:
      /\bcredit\s+card\s+(?:sales?|volume)\b/i,
    confidence:
      0.88
  },
  {
    re:
      /\bcard\s+sales?\b/i,
    confidence:
      0.82
  }
];

const REFUND_PATTERNS = [
  {
    re:
      /\btotal\s+refunds?\b/i,
    confidence:
      0.96
  },
  {
    re:
      /\brefund\s+(?:amount|total)\b/i,
    confidence:
      0.90
  },
  {
    re:
      /\brefunds?\b/i,
    confidence:
      0.80
  },
  {
    re:
      /\btotal\s+credits?\b/i,
    confidence:
      0.85
  }
];

const CHARGEBACK_PATTERNS = [
  {
    re:
      /\bchargebacks?\s*\/\s*reversals?\b/i,
    confidence:
      0.99
  },
  {
    re:
      /\bchargeback\s+(?:amount|total)\b/i,
    confidence:
      0.95
  },
  {
    re:
      /\btotal\s+chargebacks?\b/i,
    confidence:
      0.95
  }
];

const TOTAL_FEE_PATTERNS = [
  {
    re:
      /^\s*fees?\s*$/i,
    confidence:
      0.99,
    label:
      'Fees'
  },
  {
    re:
      /\btotal\s+(?:processing\s+)?fees?\b/i,
    confidence:
      0.97
  },
  {
    re:
      /\btotal\s+charges?\b/i,
    confidence:
      0.90
  },
  {
    re:
      /\bservice\s+charges?\s+total\b/i,
    confidence:
      0.88
  },
  {
    re:
      /\bnet\s+processing\s+charges?\b/i,
    confidence:
      0.85
  }
];

const EFFECTIVE_RATE_PATTERNS = [
  {
    re:
      /\beffective\s+rate\b/i,
    confidence:
      0.97
  },
  {
    re:
      /\beffective\s+discount\s+rate\b/i,
    confidence:
      0.95
  },
  {
    re:
      /\bblended\s+rate\b/i,
    confidence:
      0.88
  }
];

const AVERAGE_TICKET_PATTERNS = [
  {
    re:
      /\bavg(?:erage)?\s+ticket\b/i,
    confidence:
      0.97
  },
  {
    re:
      /\baverage\s+(?:ticket|sale|transaction)\b/i,
    confidence:
      0.95
  },
  {
    re:
      /\bavg\s+(?:sale|transaction)\b/i,
    confidence:
      0.88
  }
];

function findGenericTransactionCount(
  lines
) {
  /*
   * ============================================================
   * GENERIC TRANSACTION COUNT EXTRACTION
   * ============================================================
   *
   * Transaction counts must always be whole-number counts.
   *
   * Never accept:
   * - currency values
   * - decimal/rate values
   * - fee totals
   * - percentage values
   * - ambiguous nearby integers
   *
   * Processor-specific layouts should eventually be supplied
   * through processor rule packs, but this generic engine must
   * safely recognize common count labels and table structures.
   */

  const explicitPatterns = [
    {
      re:
        /\btransaction\s+count\b/i,
      confidence:
        0.99
    },
    {
      re:
        /\btotal\s+transactions?\b/i,
      confidence:
        0.98
    },
    {
      re:
        /\bnumber\s+of\s+transactions?\b/i,
      confidence:
        0.97
    },
    {
      re:
        /\btransaction\s+(?:qty|quantity)\b/i,
      confidence:
        0.94
    },
    {
      re:
        /\btotal\s+(?:items?|count|qty|quantity)\b/i,
      confidence:
        0.90
    }
  ];

  /*
   * ------------------------------------------------------------
   * 1. Explicit label extraction
   * ------------------------------------------------------------
   */

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const lineInfo =
      lines[index];

    const text =
      clean(
        lineInfo.text
      );

    /*
     * A fee line is never transaction-count evidence.
     */

    if (
      /\bfees?\b/i.test(
        text
      ) ||
      /\$/.test(
        text
      ) ||
      /%/.test(
        text
      )
    ) {
      continue;
    }

    for (
      const {
        re,
        confidence
      } of
      explicitPatterns
    ) {
      re.lastIndex =
        0;

      if (
        !re.test(
          text
        )
      ) {
        continue;
      }

      const sameLineValue =
        tryInteger(
          text
        );

      if (
        sameLineValue !==
        null
      ) {
        return makeFoundMetric({
          value:
            sameLineValue,

          rawText:
            text,

          page:
            lineInfo.page,

          line:
            lineInfo.line,

          confidence,

          sourceType:
            'explicit_transaction_count',

          label:
            re.toString()
        });
      }

      /*
       * Search only a short distance forward.
       * Reject currency, fee, rate, and percentage lines.
       */

      for (
        let offset = 1;
        offset <= 4;
        offset++
      ) {
        const candidate =
          lines[
            index +
            offset
          ];

        if (
          !candidate ||
          candidate.page !==
          lineInfo.page
        ) {
          break;
        }

        const candidateText =
          clean(
            candidate.text
          );

        if (
          /\bfees?\b/i.test(
            candidateText
          ) ||
          /\$/.test(
            candidateText
          ) ||
          /%/.test(
            candidateText
          ) ||
          /\d+\.\d+/.test(
            candidateText
          )
        ) {
          continue;
        }

        const value =
          tryInteger(
            candidateText
          );

        if (
          value ===
          null ||
          value <= 0
        ) {
          continue;
        }

        return makeFoundMetric({
          value,

          rawText:
            `${text} | ${candidateText}`,

          page:
            lineInfo.page,

          line:
            lineInfo.line,

          confidence:
            parseFloat(
              (
                confidence -
                (
                  offset *
                  0.03
                )
              ).toFixed(
                2
              )
            ),

          sourceType:
            'nearby_explicit_transaction_count',

          label:
            re.toString()
        });
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * 2. Generic summary-table reconciliation
   * ------------------------------------------------------------
   *
   * Many processors present:
   *
   *   Gross activity       Items
   *   Refunds              Items
   *   Submitted / Net      Items
   *
   * Example relationship:
   *
   *   317 gross items
   *   + 2 refund items
   *   = 319 submitted items
   *
   * We do NOT depend on a processor name.
   * We require:
   *
   * - a count-column label such as Items / Transactions / Count / Qty
   * - gross/sales context
   * - refund/credit context
   * - submitted/net/processed context
   * - three whole-number values that reconcile exactly
   */

  const countHeaderPattern =
    /^(?:items?|transactions?|txn|txns|count|qty|quantity)$/i;

  const grossContextPattern =
    /\b(?:gross|sales?)\b/i;

  const refundContextPattern =
    /\b(?:refunds?|credits?|returns?)\b/i;

  const submittedContextPattern =
    /\b(?:submitted|processed|net)\b/i;

  const pages =
    [
      ...new Set(
        lines.map(
          line =>
            line.page
        )
      )
    ];

  for (
    const pageNumber of
    pages
  ) {
    const pageLines =
      lines.filter(
        line =>
          line.page ===
          pageNumber
      );

    const hasCountHeader =
      pageLines.some(
        line =>
          countHeaderPattern.test(
            clean(
              line.text
            )
          )
      );

    const hasGrossContext =
      pageLines.some(
        line =>
          grossContextPattern.test(
            clean(
              line.text
            )
          )
      );

    const hasRefundContext =
      pageLines.some(
        line =>
          refundContextPattern.test(
            clean(
              line.text
            )
          )
      );

    const hasSubmittedContext =
      pageLines.some(
        line =>
          submittedContextPattern.test(
            clean(
              line.text
            )
          )
      );

    if (
      !hasCountHeader ||
      !hasGrossContext ||
      !hasRefundContext ||
      !hasSubmittedContext
    ) {
      continue;
    }

    /*
     * Prefer an exact reconciled Total row when the PDF text preserves the
     * summary table's column order:
     *
     *   Total
     *   [gross items] [gross amount]
     *   [refund items] [refund amount]
     *   [submitted items] [submitted amount]
     *
     * Both the item counts and the signed amounts must reconcile. Requiring
     * both relationships prevents unrelated standalone integers elsewhere on
     * the page from being mistaken for the submitted transaction count.
     */

    for (
      let index = 0;
      index <=
      pageLines.length -
      7;
      index++
    ) {
      if (
        !/^total$/i.test(
          clean(
            pageLines[index].text
          )
        )
      ) {
        continue;
      }

      const grossCount =
        tryInteger(
          pageLines[index + 1].text
        );

      const grossAmount =
        tryAmount(
          pageLines[index + 2].text
        );

      const refundCount =
        tryInteger(
          pageLines[index + 3].text
        );

      const refundAmount =
        tryAmount(
          pageLines[index + 4].text
        );

      const submittedCount =
        tryInteger(
          pageLines[index + 5].text
        );

      const submittedAmount =
        tryAmount(
          pageLines[index + 6].text
        );

      if (
        grossCount === null ||
        grossAmount === null ||
        refundCount === null ||
        refundAmount === null ||
        submittedCount === null ||
        submittedAmount === null
      ) {
        continue;
      }

      const grossCents =
        Math.round(
          grossAmount * 100
        );

      const refundCents =
        Math.round(
          refundAmount * 100
        );

      const submittedCents =
        Math.round(
          submittedAmount * 100
        );

      if (
        grossCount +
          refundCount !==
          submittedCount ||
        grossCents +
          refundCents !==
          submittedCents
      ) {
        continue;
      }

      return makeFoundMetric({
        value:
          submittedCount,

        rawText:
          `Gross count ${grossCount} + refund count ${refundCount} = submitted count ${submittedCount}; gross ${grossCents} cents + refunds ${refundCents} cents = submitted ${submittedCents} cents`,

        page:
          pageNumber,

        line:
          pageLines[
            index + 5
          ].line,

        confidence:
          0.99,

        sourceType:
          'reconciled_summary_total_row',

        label:
          'Reconciled summary Total row'
      });
    }

    /*
     * Collect standalone whole-number values only.
     */

    const integerCandidates =
      pageLines
        .map(
          line => {
            const text =
              clean(
                line.text
              );

            if (
              /\$/.test(
                text
              ) ||
              /%/.test(
                text
              ) ||
              /\d+\.\d+/.test(
                text
              )
            ) {
              return null;
            }

            const value =
              tryInteger(
                text
              );

            if (
              value ===
              null ||
              value <= 0 ||
              value >
              10000000
            ) {
              return null;
            }

            return {
              value,
              text,
              page:
                line.page,
              line:
                line.line
            };
          }
        )
        .filter(
          Boolean
        );

    /*
     * Find a three-value relationship:
     *
     * gross count + refund count = submitted count
     *
     * Require all values to be distinct positions in the PDF text.
     */

    const reconciledCandidates =
      [];

    for (
      let a = 0;
      a <
      integerCandidates.length;
      a++
    ) {
      for (
        let b = 0;
        b <
        integerCandidates.length;
        b++
      ) {
        if (
          a === b
        ) {
          continue;
        }

        for (
          let c = 0;
          c <
          integerCandidates.length;
          c++
        ) {
          if (
            c === a ||
            c === b
          ) {
            continue;
          }

          const gross =
            integerCandidates[a];

          const refunds =
            integerCandidates[b];

          const submitted =
            integerCandidates[c];

          if (
            gross.value +
            refunds.value ===
            submitted.value
          ) {
            reconciledCandidates.push({
              gross,
              refunds,
              submitted
            });
          }
        }
      }
    }

    /*
     * Remove duplicate mathematical combinations.
     */

    const unique =
      [];

    const seen =
      new Set();

    for (
      const candidate of
      reconciledCandidates
    ) {
      const key =
        [
          candidate.gross.value,
          candidate.refunds.value,
          candidate.submitted.value
        ].join(
          '|'
        );

      if (
        seen.has(
          key
        )
      ) {
        continue;
      }

      seen.add(
        key
      );

      unique.push(
        candidate
      );
    }

    /*
     * Only accept an unambiguous reconciled count.
     */

    if (
      unique.length ===
      1
    ) {
      const selected =
        unique[0];

      return makeFoundMetric({
        value:
          selected.submitted.value,

        rawText:
          `Gross count ${selected.gross.value} + refund count ${selected.refunds.value} = submitted count ${selected.submitted.value}`,

        page:
          pageNumber,

        line:
          selected.submitted.line,

        confidence:
          0.94,

        sourceType:
          'reconciled_summary_table_count',

        label:
          'Generic count-column reconciliation'
      });
    }

    if (
      unique.length >
      1
    ) {
      return insufficientMetric(
        'Multiple plausible reconciled transaction-count combinations were found; manual review required.'
      );
    }
  }

  return insufficientMetric(
    'No unambiguous transaction count was found.'
  );
}

function deriveAverageTicket(
  grossVolume,
  transactionCount
) {
  if (
    grossVolume.status !==
      'found' ||
    transactionCount.status !==
      'found'
  ) {
    return insufficientMetric(
      'Requires confirmed gross volume and confirmed transaction count.'
    );
  }

  if (
    !grossVolume.value ||
    !transactionCount.value ||
    transactionCount.value ===
      0
  ) {
    return insufficientMetric(
      'Transaction count must be non-zero.'
    );
  }

  const value =
    parseFloat(
      (
        grossVolume.value /
        transactionCount.value
      ).toFixed(
        2
      )
    );

  return {
    status:
      'derived',

    value,

    formula:
      'gross_volume / transaction_count',

    inputs: {
      grossVolume:
        grossVolume.value,

      transactionCount:
        transactionCount.value
    },

    evidence: {
      grossVolumeEvidence:
        grossVolume.evidence,

      transactionCountEvidence:
        transactionCount.evidence
    },

    confidence:
      parseFloat(
        (
          Math.min(
            grossVolume.confidence,
            transactionCount.confidence
          ) *
          0.95
        ).toFixed(
          2
        )
      ),

    assumptions: [
      'Average ticket derived from confirmed processing volume divided by confirmed transaction count.'
    ]
  };
}

function deriveEffectiveRate(
  totalFees,
  grossVolume
) {
  if (
    totalFees.status !==
      'found' ||
    grossVolume.status !==
      'found'
  ) {
    return insufficientMetric(
      'Requires confirmed total fees and confirmed gross volume.'
    );
  }

  if (
    !grossVolume.value ||
    grossVolume.value ===
      0
  ) {
    return insufficientMetric(
      'Gross volume must be non-zero.'
    );
  }

  const value =
    parseFloat(
      (
        totalFees.value /
        grossVolume.value
      ).toFixed(
        6
      )
    );

  return {
    status:
      'derived',

    value,

    formula:
      'total_fees / gross_volume',

    inputs: {
      totalFees:
        totalFees.value,

      grossVolume:
        grossVolume.value
    },

    evidence: {
      totalFeesEvidence:
        totalFees.evidence,

      grossVolumeEvidence:
        grossVolume.evidence
    },

    confidence:
      parseFloat(
        (
          Math.min(
            totalFees.confidence,
            grossVolume.confidence
          ) *
          0.95
        ).toFixed(
          2
        )
      ),

    assumptions: [
      'Effective rate derived from confirmed total processing fees divided by confirmed processing volume.'
    ]
  };
}

export function extractStatementMetrics(
  sections = [],
  pages = []
) {
  const originalLines =
    buildOriginalPageLines(
      pages
    );

  const sectionLines =
    buildSectionLines(
      sections
    );

  /*
   * Prefer original page-order text for metrics because table relationships
   * can be lost when a page is segmented into sections.
   *
   * Fall back to section lines only when original page text is unavailable.
   */

  const lines =
    originalLines.length
      ? originalLines
      : sectionLines;

  const grossVolume =
    findLabelValueMetric({
      lines,
      patterns:
        GROSS_VOLUME_PATTERNS,
      type:
        'amount',
      maxForwardLines:
        8
    });

  const grossSales =
    findLabelValueMetric({
      lines,
      patterns:
        GROSS_SALES_PATTERNS,
      type:
        'amount',
      maxForwardLines:
        8
    });

  const cardVolume =
    findLabelValueMetric({
      lines,
      patterns:
        CARD_VOLUME_PATTERNS,
      type:
        'amount',
      maxForwardLines:
        8
    });

  const refunds =
    findLabelValueMetric({
      lines,
      patterns:
        REFUND_PATTERNS,
      type:
        'amount',
      maxForwardLines:
        8
    });

  const chargebacks =
    findLabelValueMetric({
      lines,
      patterns:
        CHARGEBACK_PATTERNS,
      type:
        'amount',
      maxForwardLines:
        8
    });

  let totalFees =
    findLabelValueMetric({
      lines,
      patterns:
        TOTAL_FEE_PATTERNS,
      type:
        'amount',
      maxForwardLines:
        6,
      normalize:
        value =>
          Math.abs(
            value
          )
    });

  if (
    totalFees.status ===
      'found' &&
    totalFees.evidence
      ?.signedStatementValue <
      0
  ) {
    totalFees = {
      ...totalFees,

      assumptions: [
        'Statement displays fees as a negative deduction; ClearCost normalizes merchant processing expense to a positive cost.'
      ]
    };
  }

  const transactionCount =
    findGenericTransactionCount(
      lines
    );

  const rawEffectiveRate =
    findLabelValueMetric({
      lines,
      patterns:
        EFFECTIVE_RATE_PATTERNS,
      type:
        'percent',
      maxForwardLines:
        4
    });

  const rawAverageTicket =
    findLabelValueMetric({
      lines,
      patterns:
        AVERAGE_TICKET_PATTERNS,
      type:
        'amount',
      maxForwardLines:
        4
    });

  const averageTicket =
    rawAverageTicket.status ===
    'found'
      ? rawAverageTicket
      : deriveAverageTicket(
          grossVolume,
          transactionCount
        );

  const effectiveRate =
    rawEffectiveRate.status ===
    'found'
      ? rawEffectiveRate
      : deriveEffectiveRate(
          totalFees,
          grossVolume
        );

  return {
    grossVolume,
    grossSales,
    cardVolume,
    refunds,
    chargebacks,
    transactionCount,
    averageTicket,
    totalFees,
    effectiveRate
  };
}
