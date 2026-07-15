const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

function tryAmount(text) {
  const match = clean(text).match(/\$?\s*([\d,]+\.\d{2})\s*$/);
  return match ? parseFloat(match[1].replace(/,/g, '')) : null;
}

function tryInteger(text) {
  const match = clean(text).match(/\b(\d{1,3}(?:,\d{3})*|\d+)\s*$/);
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
}

function tryPercent(text) {
  const match = clean(text).match(/\b(\d+\.\d{1,6})\s*%\s*$/);
  return match ? parseFloat(match[1]) / 100 : null;
}

const METRIC_DEFS = {
  grossVolume: {
    name: 'Gross Processing Volume',
    type: 'amount',
    patterns: [
      { re: /\bgross\s+(?:processing\s+)?(?:sales?|volume)\b/i, confidence: 0.95 },
      { re: /\btotal\s+(?:sales?|processed)\b/i, confidence: 0.88 },
      { re: /\bsales?\s+volume\b/i, confidence: 0.85 },
      { re: /\bprocessing\s+volume\b/i, confidence: 0.85 }
    ]
  },
  cardVolume: {
    name: 'Card Volume',
    type: 'amount',
    patterns: [
      { re: /\bcard\s+volume\b/i, confidence: 0.90 },
      { re: /\bcredit\s+card\s+(?:sales?|volume)\b/i, confidence: 0.88 },
      { re: /\bcard\s+sales?\b/i, confidence: 0.82 }
    ]
  },
  refunds: {
    name: 'Refunds / Credits',
    type: 'amount',
    patterns: [
      { re: /\btotal\s+refunds?\b/i, confidence: 0.92 },
      { re: /\brefund\s+(?:amount|total)\b/i, confidence: 0.90 },
      { re: /\brefunds?\b/i, confidence: 0.80 },
      { re: /\btotal\s+credits?\b/i, confidence: 0.85 },
      { re: /\breturns?\s+(?:amount|total)\b/i, confidence: 0.82 }
    ]
  },
  chargebacks: {
    name: 'Chargebacks',
    type: 'amount',
    patterns: [
      { re: /\bchargeback\s+(?:amount|total)\b/i, confidence: 0.95 },
      { re: /\btotal\s+chargebacks?\b/i, confidence: 0.95 },
      { re: /\bchargebacks?\b/i, confidence: 0.85 }
    ]
  },
  transactionCount: {
    name: 'Transaction Count',
    type: 'integer',
    patterns: [
      { re: /\btransaction\s+count\b/i, confidence: 0.96 },
      { re: /\btotal\s+transactions?\b/i, confidence: 0.94 },
      { re: /\bnumber\s+of\s+transactions?\b/i, confidence: 0.93 },
      { re: /\btotal\s+items?\b/i, confidence: 0.72 },
      { re: /\btransaction\s+(?:volume|qty|quantity)\b/i, confidence: 0.85 }
    ]
  },
  totalFees: {
    name: 'Total Fees',
    type: 'amount',
    patterns: [
      { re: /\btotal\s+(?:processing\s+)?fees?\b/i, confidence: 0.97 },
      { re: /\btotal\s+charges?\b/i, confidence: 0.90 },
      { re: /\bservice\s+charges?\s+total\b/i, confidence: 0.88 },
      { re: /\bnet\s+processing\s+charges?\b/i, confidence: 0.85 },
      { re: /\btotal\s+amount\s+(?:charged|billed)\b/i, confidence: 0.82 }
    ]
  },
  effectiveRate: {
    name: 'Effective Rate',
    type: 'percent',
    patterns: [
      { re: /\beffective\s+rate\b/i, confidence: 0.97 },
      { re: /\beffective\s+discount\s+rate\b/i, confidence: 0.95 },
      { re: /\bblended\s+rate\b/i, confidence: 0.88 }
    ]
  },
  averageTicket: {
    name: 'Average Ticket',
    type: 'amount',
    patterns: [
      { re: /\bavg(?:erage)?\s+ticket\b/i, confidence: 0.97 },
      { re: /\baverage\s+(?:ticket|sale|transaction)\b/i, confidence: 0.95 },
      { re: /\bavg\s+(?:sale|transaction)\b/i, confidence: 0.88 }
    ]
  }
};

function buildLineList(sections) {
  const lines = [];
  for (const section of sections) {
    const sectionLines = section.lines || [];
    for (let i = 0; i < sectionLines.length; i++) {
      lines.push({
        text: sectionLines[i],
        page: section.page,
        line: section.startLine + i,
        sectionType: section.type
      });
    }
  }
  return lines;
}

function findMetricInLines(lines, metricDef) {
  let bestMatch = null;
  let bestConfidence = 0;
  for (const lineInfo of lines) {
    const text = lineInfo.text;
    for (const { re, confidence } of metricDef.patterns) {
      if (!re.test(text)) continue;
      const value = metricDef.type === 'amount' ? tryAmount(text)
        : metricDef.type === 'integer' ? tryInteger(text)
        : metricDef.type === 'percent' ? tryPercent(text)
        : null;
      if (value === null) continue;
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = { value, rawText: text, page: lineInfo.page, line: lineInfo.line, pattern: re.toString(), confidence };
      }
    }
  }
  if (!bestMatch) {
    return { status: 'insufficient_evidence', value: null, formula: null, inputs: {}, evidence: null, confidence: 0, assumptions: [] };
  }
  return {
    status: 'found',
    value: bestMatch.value,
    formula: `extracted from statement line: "${bestMatch.rawText}"`,
    inputs: { rawText: bestMatch.rawText },
    evidence: { rawText: bestMatch.rawText, page: bestMatch.page, line: bestMatch.line, pattern: bestMatch.pattern },
    confidence: bestMatch.confidence,
    assumptions: []
  };
}

function deriveAverageTicket(grossVolume, transactionCount) {
  if (grossVolume.status === 'insufficient_evidence' || transactionCount.status === 'insufficient_evidence') {
    return {
      status: 'insufficient_evidence', value: null,
      formula: 'gross_volume / transaction_count',
      inputs: { grossVolume: grossVolume.value, transactionCount: transactionCount.value },
      evidence: null, confidence: 0,
      assumptions: ['Requires gross_volume and transaction_count to be present in statement']
    };
  }
  if (!grossVolume.value || !transactionCount.value || transactionCount.value === 0) {
    return {
      status: 'insufficient_evidence', value: null,
      formula: 'gross_volume / transaction_count',
      inputs: { grossVolume: grossVolume.value, transactionCount: transactionCount.value },
      evidence: null, confidence: 0,
      assumptions: ['transaction_count must be non-zero']
    };
  }
  const value = parseFloat((grossVolume.value / transactionCount.value).toFixed(2));
  return {
    status: 'derived', value,
    formula: 'gross_volume / transaction_count',
    inputs: { grossVolume: grossVolume.value, transactionCount: transactionCount.value },
    evidence: { grossVolumeEvidence: grossVolume.evidence, transactionCountEvidence: transactionCount.evidence },
    confidence: parseFloat((Math.min(grossVolume.confidence, transactionCount.confidence) * 0.95).toFixed(2)),
    assumptions: ['average_ticket derived from gross_volume / transaction_count; assumes uniform ticket size distribution']
  };
}

function deriveEffectiveRate(totalFees, grossVolume) {
  if (totalFees.status === 'insufficient_evidence' || grossVolume.status === 'insufficient_evidence') {
    return {
      status: 'insufficient_evidence', value: null,
      formula: 'total_fees / gross_volume',
      inputs: { totalFees: totalFees.value, grossVolume: grossVolume.value },
      evidence: null, confidence: 0,
      assumptions: ['Requires total_fees and gross_volume to be present in statement']
    };
  }
  if (!grossVolume.value || grossVolume.value === 0) {
    return {
      status: 'insufficient_evidence', value: null,
      formula: 'total_fees / gross_volume',
      inputs: { totalFees: totalFees.value, grossVolume: grossVolume.value },
      evidence: null, confidence: 0,
      assumptions: ['gross_volume must be non-zero to calculate effective rate']
    };
  }
  const value = parseFloat((totalFees.value / grossVolume.value).toFixed(6));
  return {
    status: 'derived', value,
    formula: 'total_fees / gross_volume',
    inputs: { totalFees: totalFees.value, grossVolume: grossVolume.value },
    evidence: { totalFeesEvidence: totalFees.evidence, grossVolumeEvidence: grossVolume.evidence },
    confidence: parseFloat((Math.min(totalFees.confidence, grossVolume.confidence) * 0.95).toFixed(2)),
    assumptions: ['effective_rate derived as total_fees / gross_volume; reflects blended processing cost rate']
  };
}

export function extractStatementMetrics(sections = []) {
  const lines = buildLineList(sections);

  const grossVolume = findMetricInLines(lines, METRIC_DEFS.grossVolume);
  const cardVolume = findMetricInLines(lines, METRIC_DEFS.cardVolume);
  const refunds = findMetricInLines(lines, METRIC_DEFS.refunds);
  const chargebacks = findMetricInLines(lines, METRIC_DEFS.chargebacks);
  const transactionCount = findMetricInLines(lines, METRIC_DEFS.transactionCount);
  const totalFees = findMetricInLines(lines, METRIC_DEFS.totalFees);
  const rawEffectiveRate = findMetricInLines(lines, METRIC_DEFS.effectiveRate);
  const rawAverageTicket = findMetricInLines(lines, METRIC_DEFS.averageTicket);

  const averageTicket = rawAverageTicket.status === 'found'
    ? rawAverageTicket
    : deriveAverageTicket(grossVolume, transactionCount);

  const effectiveRate = rawEffectiveRate.status === 'found'
    ? rawEffectiveRate
    : deriveEffectiveRate(totalFees, grossVolume);

  return { grossVolume, cardVolume, refunds, chargebacks, transactionCount, averageTicket, totalFees, effectiveRate };
}
