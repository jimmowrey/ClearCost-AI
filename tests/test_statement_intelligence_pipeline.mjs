import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {NodeProcessorRuleLoader} from '../js/processor-rule-loader-node.js';
import {ProcessorDetector} from '../js/processor-detector.js';
import {ProcessorRuleLoader} from '../js/processor-rule-loader.js';
import {runStatementIntelligencePipeline, PIPELINE_SCHEMA_VERSION} from '../js/statement-intelligence-pipeline.js';

const loader = new NodeProcessorRuleLoader();
const detector = new ProcessorDetector(loader);

function makeRecord({name='test.pdf', pages=[], missing=[], duplicates=[], outOfOrder=[], period=null, mid=null, merchant=null} = {}) {
  return { name, pageCount: pages.length, pages, missing, duplicates, outOfOrder, period, mid, merchant };
}

function textPage(index, text, {ocrRequired=false, rotation=0, readable=true, hasText=true} = {}) {
  return { index, text, hasText, ocrRequired, rotation, readable, charCount: text.replace(/\s/g,'').length };
}

// --- Stage 1: Valid digital PDF pipeline ---
{
  const record = makeRecord({
    name: 'worldpay-june-2026.pdf',
    pages: [
      textPage(1, 'Worldpay\nMerchant Name: Test Shop\nMerchant ID: 987654321\nStatement Period: June 1, 2026 through June 30, 2026\nProcessing Summary\nGross Sales 50,000.00\nTotal Transactions 1,250\nTotal Fees 1,200.00'),
      textPage(2, 'Other Fees\nBatch Fee 12.50\nMonthly Account Fee 25.00\nPCI Fee 9.95'),
      textPage(3, 'Interchange Detail\nVisa FANF 15.00\nMC NABU 8.50')
    ]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});

  // Schema and metadata
  assert.equal(result.schemaVersion, PIPELINE_SCHEMA_VERSION);
  assert.equal(result.sourceFile, 'worldpay-june-2026.pdf');
  assert.ok(typeof result.timestamp === 'string');

  // Stage 1 validation
  assert.equal(result.validation.pageCount, 3);
  assert.equal(result.validation.ocrRequired, false);
  assert.equal(result.validation.ocrPageCount, 0);
  assert.ok(result.validation.textLayerAvailable);
  assert.deepEqual(result.validation.missingPages, []);
  assert.deepEqual(result.validation.duplicates, []);

  // Stage 2 processor
  assert.equal(result.processor.name, 'Worldpay');
  assert.equal(result.processor.fallback, false);
  assert.ok(result.processor.confidence > 0);

  // Stage 3 document map
  assert.ok(typeof result.documentMap === 'object');
  assert.ok(Array.isArray(result.documentMap.interchange));
  assert.ok(result.documentMap.interchange.length > 0);
  assert.ok(typeof result.documentMap.interchange[0].page === 'number');
  assert.ok(typeof result.documentMap.interchange[0].startLine === 'number');

  // Stage 4 fees
  assert.ok(result.feeCandidates.length > 0);
  assert.ok(Array.isArray(result.unknownFees));

  // Stage 5 metrics
  assert.equal(result.metrics.grossVolume.status, 'found');
  assert.equal(result.metrics.grossVolume.value, 50000.00);
  assert.equal(result.metrics.transactionCount.status, 'found');
  assert.equal(result.metrics.totalFees.status, 'found');

  // Stage 6 reconciliation
  assert.ok(typeof result.reconciliation.status === 'string');
  assert.ok(typeof result.reconciliation.feeExtracted === 'number');

  // Stage 7 internal report
  assert.ok(Array.isArray(result.warnings));
  assert.ok(Array.isArray(result.assumptions));
  assert.ok(typeof result.overallConfidence === 'number');

  // Backward compat
  assert.ok(Array.isArray(result.sections));
  assert.ok(Array.isArray(result.extractionLog));
  assert.ok(typeof result.sectionCounts === 'object');
}

// --- OCR-required statement ---
{
  const record = makeRecord({
    name: 'ocr-required.pdf',
    pages: [
      textPage(1, '', { ocrRequired: true, hasText: false, readable: true }),
      textPage(2, 'Worldpay\nMerchant Name: Scan Shop\nMerchant ID: 111222333\nOther Fees\nBatch Fee 10.00')
    ]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  assert.equal(result.validation.ocrRequired, true);
  assert.equal(result.validation.ocrPageCount, 1);
  assert.ok(result.warnings.some(w => w.code === 'OCR_REQUIRED'));
}

// --- Unknown processor with Generic fallback ---
{
  const record = makeRecord({
    name: 'unknown-processor.pdf',
    pages: [textPage(1, 'Merchant Name: Unknown Merchant\nMerchant ID: UNKN123\nOther Fees\nSome Mystery Fee 19.99')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  assert.equal(result.processor.name, 'Generic Processor');
  assert.equal(result.processor.fallback, true);
  assert.ok(result.processor.requiresReview);
  assert.ok(result.warnings.some(w => w.code === 'PROCESSOR_REVIEW_REQUIRED'));
}

// --- Known processor with evidence ---
{
  const record = makeRecord({
    name: 'payroc-statement.pdf',
    pages: [textPage(1, 'PAYROC\nPayroc Fees\nMerchant Name: Country Butcher\nMerchant ID: 123456789012\nOther Fees\nBatch Fee 12.50')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  assert.equal(result.processor.name, 'Payroc');
  assert.equal(result.processor.fallback, false);
  assert.ok(result.processor.evidence.length > 0);
  assert.ok(result.processor.evidence[0].evidence.length > 0);
}

// --- Known and unknown fee mixture ---
{
  const record = makeRecord({
    name: 'mixed-fees.pdf',
    pages: [textPage(1, 'Worldpay\nMerchant Name: Test Shop\nMerchant ID: 987654321\nOther Fees\nBatch Fee 12.50\nMC NABU 4.83\nMerchant Advantage Plus 7.84\nUnrecognized Program Fee 5.00')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  const classified = result.feeCandidates.filter(f => f.status === 'classified');
  const unknown = result.unknownFees;
  assert.ok(classified.length > 0, 'Should have classified fees');
  assert.ok(unknown.length > 0, 'Should have unknown fees');
  // Unknown fees preserved — never silently discarded
  assert.equal(result.unknownFees.length, result.feeSummary.unknown);
  assert.ok(result.warnings.some(w => w.code === 'UNKNOWN_FEES'));
}

// --- Unknown fee preservation with provenance ---
{
  const record = makeRecord({
    name: 'unknown-fee.pdf',
    pages: [textPage(1, 'Worldpay\nOther Fees\nMerchant Advantage Plus 7.84', {})]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  assert.ok(result.unknownFees.length > 0);
  const uf = result.unknownFees[0];
  assert.ok(typeof uf.page === 'number');
  assert.ok(typeof uf.line === 'number');
  assert.ok(typeof uf.rawText === 'string');
  assert.ok(typeof uf.amount === 'number');
  assert.equal(uf.status, 'needs_review');
}

// --- Missing required totals (insufficient evidence metrics) ---
{
  const record = makeRecord({
    name: 'no-totals.pdf',
    pages: [textPage(1, 'Worldpay\nOther Fees\nBatch Fee 12.50')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  assert.equal(result.metrics.grossVolume.status, 'insufficient_evidence');
  assert.equal(result.metrics.totalFees.status, 'insufficient_evidence');
  assert.equal(result.metrics.effectiveRate.status, 'insufficient_evidence');
  assert.equal(result.metrics.averageTicket.status, 'insufficient_evidence');
}

// --- Effective rate with complete evidence ---
{
  const record = makeRecord({
    name: 'effective-rate.pdf',
    pages: [textPage(1, 'Worldpay\nProcessing Summary\nGross Sales 100,000.00\nTotal Fees 2,400.00')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  assert.equal(result.metrics.grossVolume.status, 'found');
  assert.equal(result.metrics.totalFees.status, 'found');
  assert.equal(result.metrics.effectiveRate.status, 'derived');
  assert.ok(Math.abs(result.metrics.effectiveRate.value - 0.024) < 0.000001);
  assert.equal(result.metrics.effectiveRate.formula, 'total_fees / gross_volume');
  assert.ok(result.metrics.effectiveRate.assumptions.length > 0);
  assert.ok(result.metrics.effectiveRate.inputs.totalFees === 2400.00);
  assert.ok(result.metrics.effectiveRate.inputs.grossVolume === 100000.00);
}

// --- Average ticket with complete evidence ---
{
  const record = makeRecord({
    name: 'avg-ticket.pdf',
    pages: [textPage(1, 'Worldpay\nProcessing Summary\nGross Sales 50,000.00\nTotal Transactions 1,000')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  assert.equal(result.metrics.averageTicket.status, 'derived');
  assert.equal(result.metrics.averageTicket.value, 50.00);
  assert.equal(result.metrics.averageTicket.formula, 'gross_volume / transaction_count');
  assert.ok(result.metrics.averageTicket.confidence > 0);
  assert.ok(result.metrics.averageTicket.inputs.grossVolume === 50000.00);
  assert.ok(result.metrics.averageTicket.inputs.transactionCount === 1000);
}

// --- Reconciled statement ---
{
  const record = makeRecord({
    name: 'reconciled.pdf',
    pages: [textPage(1, 'Worldpay\nProcessing Summary\nGross Sales 50,000.00\nTotal Fees 47.45\nOther Fees\nBatch Fee 12.50\nPCI Fee 9.95\nMC NABU 4.83\nVisa FANF 15.00\nAuthorization Fee 5.17')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  // Total fees in text: 47.45; extracted fee candidates sum should be close
  assert.equal(result.reconciliation.feeStatementTotal, 47.45);
  assert.ok(typeof result.reconciliation.feeExtracted === 'number');
  assert.ok(typeof result.reconciliation.feeVariance === 'number');
  assert.ok(['reconciled','partially_reconciled','not_reconciled'].includes(result.reconciliation.status));
  assert.equal(typeof result.reconciliation.tolerance, 'number');
}

// --- Insufficient evidence reconciliation ---
{
  const record = makeRecord({
    name: 'no-total-in-statement.pdf',
    pages: [textPage(1, 'Worldpay\nOther Fees\nBatch Fee 12.50\nPCI Fee 9.95')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  assert.equal(result.reconciliation.status, 'insufficient_evidence');
  assert.equal(result.reconciliation.feeStatementTotal, null);
  assert.equal(result.reconciliation.proposalBlocked, true);
  assert.ok(result.reconciliation.blockReason.length > 0);
  assert.ok(result.warnings.some(w => w.code === 'PROPOSAL_BLOCKED'));
}

// --- Savings/proposals blocked for non-reconciled ---
{
  const record = makeRecord({
    name: 'not-reconciled.pdf',
    pages: [textPage(1, 'Worldpay\nProcessing Summary\nGross Sales 50,000.00\nTotal Fees 999.00\nOther Fees\nBatch Fee 12.50')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  // Extracted fee total (12.50) vs statement (999.00) — big variance
  if (result.reconciliation.status !== 'reconciled') {
    assert.equal(result.reconciliation.proposalBlocked, true);
  }
}

// --- Page and line provenance preserved in document map ---
{
  const record = makeRecord({
    name: 'provenance.pdf',
    pages: [
      textPage(1, 'Worldpay\nMerchant Name: Test Shop\nMerchant ID: 987654321'),
      textPage(2, 'Interchange Detail\nVisa FANF 15.00\nMC NABU 8.50'),
      textPage(3, 'Other Fees\nBatch Fee 12.50')
    ]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  // Document map entries have page provenance
  const allEntries = Object.values(result.documentMap).flat();
  for (const entry of allEntries) {
    assert.ok(typeof entry.page === 'number', `entry.page should be a number, got: ${typeof entry.page}`);
    assert.ok(typeof entry.startLine === 'number', `entry.startLine should be a number`);
    assert.ok(typeof entry.endLine === 'number', `entry.endLine should be a number`);
  }
  // Fee candidates have page + line provenance
  for (const fee of result.feeCandidates) {
    assert.ok(typeof fee.page === 'number', `fee.page should be number`);
    assert.ok(typeof fee.line === 'number', `fee.line should be number`);
  }
}

// --- Internal report structure completeness ---
{
  const record = makeRecord({
    name: 'structure-check.pdf',
    pages: [textPage(1, 'Worldpay\nOther Fees\nBatch Fee 12.50')]
  });
  const result = await runStatementIntelligencePipeline(record, {detector});
  // Stage 1
  assert.ok(typeof result.validation === 'object');
  assert.ok('pageCount' in result.validation);
  assert.ok('ocrRequired' in result.validation);
  assert.ok(Array.isArray(result.validation.missingPages));
  // Stage 2
  assert.ok(typeof result.processor === 'object');
  assert.ok('name' in result.processor);
  assert.ok('confidence' in result.processor);
  assert.ok('evidence' in result.processor);
  // Stage 3
  assert.ok(typeof result.documentMap === 'object');
  for (const key of ['summary','deposits','interchange','assessments','processorFees','monthlyFees','equipment','chargebacks','adjustments','messages','unknownSections']) {
    assert.ok(Array.isArray(result.documentMap[key]), `documentMap.${key} should be array`);
  }
  // Stage 4
  assert.ok(Array.isArray(result.feeCandidates));
  assert.ok(Array.isArray(result.unknownFees));
  assert.ok(typeof result.feeSummary === 'object');
  // Stage 5
  assert.ok(typeof result.metrics === 'object');
  for (const key of ['grossVolume','cardVolume','refunds','chargebacks','transactionCount','averageTicket','totalFees','effectiveRate']) {
    assert.ok(key in result.metrics, `metrics.${key} missing`);
    assert.ok('status' in result.metrics[key], `metrics.${key}.status missing`);
  }
  // Stage 6
  assert.ok(typeof result.reconciliation === 'object');
  assert.ok('status' in result.reconciliation);
  assert.ok('feeExtracted' in result.reconciliation);
  assert.ok('proposalBlocked' in result.reconciliation);
  // Stage 7
  assert.ok(Array.isArray(result.warnings));
  assert.ok(Array.isArray(result.assumptions));
  assert.ok(typeof result.overallConfidence === 'number');
}

// --- Browser integration test (via HTTP server) ---
{
  const repoRoot = '/home/runner/work/ClearCost-AI/ClearCost-AI';
  const contentTypes = {'.json':'application/json','.js':'text/javascript','.html':'text/html','.css':'text/css'};
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = normalize(decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)).replace(/^\/+/, '');
      const filePath = join(repoRoot, pathname || 'index.html');
      const body = await readFile(filePath);
      res.writeHead(200, {'content-type': contentTypes[extname(filePath)] || 'application/octet-stream'});
      res.end(body);
    } catch {
      res.writeHead(404, {'content-type':'text/plain'});
      res.end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  try {
    const browserLoader = new ProcessorRuleLoader({
      indexUrl: `http://127.0.0.1:${port}/processors/index.json`,
      baseUrl: `http://127.0.0.1:${port}/processors/`
    });
    const browserDetector = new ProcessorDetector(browserLoader);
    const record = makeRecord({
      name: 'browser-integration.pdf',
      pages: [textPage(1, 'Worldpay\nMerchant Name: Browser Shop\nMerchant ID: 987654321\nProcessing Summary\nGross Sales 25,000.00\nTotal Transactions 500\nTotal Fees 600.00\nOther Fees\nBatch Fee 12.50\nWorldpay Monthly Service Fee 29.99')]
    });
    const result = await runStatementIntelligencePipeline(record, {detector: browserDetector});
    assert.equal(result.processor.name, 'Worldpay');
    assert.equal(result.processor.fallback, false);
    assert.equal(result.metrics.grossVolume.status, 'found');
    assert.equal(result.metrics.grossVolume.value, 25000.00);
    assert.equal(result.metrics.transactionCount.status, 'found');
    assert.equal(result.metrics.effectiveRate.status, 'derived');
    assert.ok(result.feeCandidates.length > 0);
    assert.ok(typeof result.reconciliation.status === 'string');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

console.log('Sprint 5.0 statement intelligence pipeline regression tests passed.');
