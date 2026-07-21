import { buildStatementExtraction, SECTION_TYPES } from './statement-extraction.js';
import { extractStatementMetrics } from './statement-metrics.js';
import { assessReconciliation } from './reconciliation-readiness.js';

export const PIPELINE_SCHEMA_VERSION = '5.0';

function buildValidationSummary(record) {
  const pages = record.pages || [];
  const ocrPages = pages.filter(p => p.ocrRequired);
  const rotatedPages = pages.filter(p => p.rotation !== 0);
  const unreadablePages = pages.filter(p => !p.readable);

  return {
    pageCount: record.pageCount || pages.length,
    textLayerAvailable: pages.some(p => p.hasText),
    ocrRequired: ocrPages.length > 0,
    ocrPageCount: ocrPages.length,

    missingPages:
      Array.isArray(record.missing)
        ? record.missing
        : [],

    duplicates:
      (
        Array.isArray(record.duplicates)
          ? record.duplicates
          : []
      ).map(
        d =>
          Array.isArray(d)
            ? {
                page1: d[0],
                page2: d[1]
              }
            : d
      ),

    outOfOrder:
      Array.isArray(record.outOfOrder)
        ? record.outOfOrder
        : [],

    rotatedPages:
      rotatedPages.map(
        p => p.index
      ),

    unreadablePages:
      unreadablePages.map(
        p => p.index
      ),

    period:
      record.period || null,

    mid:
      record.mid || null,

    merchant:
      record.merchant || null
  };
}

function buildDocumentMap(sections) {
  const map = {
    summary: [],
    transactionSummary: [],
    deposits: [],
    interchange: [],
    assessments: [],
    processorFees: [],
    monthlyFees: [],
    equipment: [],
    chargebacks: [],
    adjustments: [],
    messages: [],
    unknownSections: []
  };

  for (const section of sections) {
    const entry = {
      heading:
        section.heading,

      page:
        section.page,

      startLine:
        section.startLine,

      endLine:
        section.endLine,

      lineCount:
        (
          section.lines ||
          []
        ).length,

      confidence:
        section.confidence
    };

    switch (
      section.type
    ) {
      case SECTION_TYPES.SUMMARY:
        map.summary.push(
          entry
        );
        break;

      case SECTION_TYPES.DEPOSITS:
        map.deposits.push(
          entry
        );
        break;

      case SECTION_TYPES.INTERCHANGE:
        map.interchange.push(
          entry
        );
        break;

      case SECTION_TYPES.ASSESSMENTS:
        map.assessments.push(
          entry
        );
        break;

      case SECTION_TYPES.FEES:
        map.processorFees.push(
          entry
        );
        break;

      case SECTION_TYPES.MONTHLY:
        map.monthlyFees.push(
          entry
        );
        break;

      case SECTION_TYPES.EQUIPMENT:
        map.equipment.push(
          entry
        );
        break;

      case SECTION_TYPES.CHARGEBACKS:
        map.chargebacks.push(
          entry
        );
        break;

      case SECTION_TYPES.ADJUSTMENTS:
        map.adjustments.push(
          entry
        );
        break;

      case SECTION_TYPES.MESSAGES:
        map.messages.push(
          entry
        );
        break;

      default:
        map.unknownSections.push(
          entry
        );
    }
  }

  return map;
}

function buildWarnings(
  validation,
  extraction,
  reconciliation
) {
  const warnings = [];

  if (
    validation.ocrRequired
  ) {
    warnings.push({
      code:
        'OCR_REQUIRED',

      message:
        `${validation.ocrPageCount} page(s) require OCR; text extraction may be incomplete`,

      severity:
        'warning'
    });
  }

  if (
    validation.missingPages.length >
    0
  ) {
    warnings.push({
      code:
        'MISSING_PAGES',

      message:
        `Missing pages detected: ${validation.missingPages.join(', ')}`,

      severity:
        'error'
    });
  }

  if (
    validation.duplicates.length >
    0
  ) {
    warnings.push({
      code:
        'DUPLICATE_PAGES',

      message:
        'Duplicate pages detected in document',

      severity:
        'warning'
    });
  }

  if (
    validation.outOfOrder.length >
    0
  ) {
    warnings.push({
      code:
        'OUT_OF_ORDER',

      message:
        `Pages out of sequence: ${validation.outOfOrder.join(', ')}`,

      severity:
        'warning'
    });
  }

  if (
    extraction.processor
      .requiresReview
  ) {
    warnings.push({
      code:
        'PROCESSOR_REVIEW_REQUIRED',

      message:
        `Processor identification requires review: ${extraction.processor.fallbackReason || 'confidence below threshold'}`,

      severity:
        'warning'
    });
  }

  if (
    extraction.unknownFees.length >
    0
  ) {
    warnings.push({
      code:
        'UNKNOWN_FEES',

      message:
        `${extraction.unknownFees.length} fee(s) could not be classified and are queued for review`,

      severity:
        'warning'
    });
  }

  if (
    reconciliation.proposalBlocked
  ) {
    warnings.push({
      code:
        'PROPOSAL_BLOCKED',

      message:
        `Savings/proposal generation blocked: ${reconciliation.blockReason}`,

      severity:
        'info'
    });
  }

  return warnings;
}

function buildAssumptions(
  metrics,
  reconciliation
) {
  const assumptions = [];

  for (
    const [
      key,
      metric
    ] of Object.entries(
      metrics
    )
  ) {
    if (
      Array.isArray(
        metric.assumptions
      ) &&
      metric.assumptions.length
    ) {
      for (
        const assumption of
        metric.assumptions
      ) {
        assumptions.push({
          field:
            key,

          assumption
        });
      }
    }
  }

  if (
    reconciliation.status ===
    'insufficient_evidence'
  ) {
    assumptions.push({
      field:
        'reconciliation',

      assumption:
        'Reconciliation assessment incomplete; statement fee total not found in extracted text'
    });
  }

  return assumptions;
}

function calculateOverallConfidence(
  validation,
  extraction,
  reconciliation
) {
  const scores = [];

  scores.push(
    extraction.processor
      .confidence
  );

  const totalFees =
    (
      extraction.feeSummary
        .classified ||
      0
    ) +
    (
      extraction.feeSummary
        .unknown ||
      0
    );

  if (
    totalFees >
    0
  ) {
    scores.push(
      extraction.feeSummary
        .classified /
      totalFees
    );
  }

  if (
    reconciliation.status ===
    'reconciled'
  ) {
    scores.push(
      0.95
    );

  } else if (
    reconciliation.status ===
    'partially_reconciled'
  ) {
    scores.push(
      0.65
    );

  } else if (
    reconciliation.status ===
    'not_reconciled'
  ) {
    scores.push(
      0.30
    );

  } else {
    scores.push(
      0.40
    );
  }

  if (
    validation.ocrRequired
  ) {
    scores.push(
      0.75
    );
  }

  if (
    !scores.length
  ) {
    return 0.50;
  }

  return parseFloat(
    (
      scores.reduce(
        (a, b) =>
          a + b,
        0
      ) /
      scores.length
    ).toFixed(
      2
    )
  );
}

export async function runStatementIntelligencePipeline(
  validationRecord,
  options = {}
) {
  /*
   * Stage 1:
   * PDF Validation Summary
   */

  const validation =
    buildValidationSummary(
      validationRecord
    );

  /*
   * Stage 2-4:
   * Processor Identification,
   * Structure Discovery,
   * Fee Extraction
   */

  const extraction =
    await buildStatementExtraction(
      validationRecord,
      options
    );

  /*
   * Stage 3:
   * Document Map with
   * page and line provenance
   */

  const documentMap =
    buildDocumentMap(
      extraction.sections
    );

  /*
   * Stage 4:
   * Unknown fee queue.
   * Unknown fees are never discarded.
   */

  const unknownFees =
    extraction.feeCandidates.filter(
      f =>
        f.status ===
        'needs_review'
    );

  /*
   * Stage 5:
   * Statement Totals and Merchant Metrics
   *
   * IMPORTANT:
   * Pass both segmented sections and the
   * original validated page text.
   *
   * The metric engine uses original page
   * order when available so table context
   * is not lost by section segmentation.
   *
   * This keeps generic metric extraction
   * processor-agnostic and avoids relying
   * on loose processor-specific heuristics.
   */

  const metrics =
    extractStatementMetrics(
      extraction.sections,
      validationRecord.pages ||
        []
    );

  /*
   * Stage 6:
   * Reconciliation Readiness
   */

  const statementFeeTotal =
    metrics.totalFees.status ===
    'found'
      ? metrics.totalFees.value
      : null;

  const reconciliation =
    assessReconciliation({
      // Reconcile against the eligible total, which excludes duplicate detail
      // rows (e.g. Commerce Control interchange table rows) that are already
      // represented in the statement's summarised fee section. Using the full
      // feeSummary.totalAmount here would double-count those rows. All fee
      // candidates and feeSummary.totalAmount remain preserved for analysis.
      extractedFeeTotal:
        extraction.feeSummary
          .reconciliationEligibleTotal,

      statementFeeTotal,

      statementTransactionCount:
        metrics.transactionCount
          .status ===
        'found'
          ? metrics.transactionCount
              .value
          : null,

      statementVolume:
        metrics.grossVolume
          .status ===
        'found'
          ? metrics.grossVolume
              .value
          : null
    });

  /*
   * Stage 7:
   * Internal Statement Intelligence Report
   */

  const warnings =
    buildWarnings(
      validation,
      extraction,
      reconciliation
    );

  const assumptions =
    buildAssumptions(
      metrics,
      reconciliation
    );

  const overallConfidence =
    calculateOverallConfidence(
      validation,
      extraction,
      reconciliation
    );

  return {
    /*
     * Pipeline metadata
     */

    schemaVersion:
      PIPELINE_SCHEMA_VERSION,

    sourceFile:
      validationRecord.name,

    timestamp:
      new Date()
        .toISOString(),

    /*
     * Stage 1
     */

    validation,

    /*
     * Stage 2
     * Preserved for backward
     * compatibility with renderExtraction
     */

    processor:
      extraction.processor,

    /*
     * Stage 3
     */

    documentMap,

    sections:
      extraction.sections,

    sectionCounts:
      extraction.sectionCounts,

    /*
     * Stage 4
     */

    metadata:
      extraction.metadata,

    feeCandidates:
      extraction.feeCandidates,

    feeSummary:
      extraction.feeSummary,

    unknownFees,

    /*
     * Stage 5
     */

    metrics,

    /*
     * Stage 6
     */

    reconciliation,

    /*
     * Stage 7
     */

    warnings,

    assumptions,

    overallConfidence,

    /*
     * Backward compatibility
     */

    pageCount:
      validationRecord.pageCount ||
      (
        validationRecord.pages ||
        []
      ).length,

    extractionLog:
      extraction.extractionLog
  };
}