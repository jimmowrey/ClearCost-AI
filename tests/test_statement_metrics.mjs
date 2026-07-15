import assert from 'node:assert/strict';
import {extractStatementMetrics} from '../js/statement-metrics.js';

const SECTION_TYPES = {
  SUMMARY: 'processing_summary',
  FEES: 'processor_fees',
  MONTHLY: 'monthly_fees',
  INTERCHANGE: 'interchange_detail',
  ASSESSMENTS: 'assessment_detail'
};

function makeSections(entries) {
  return entries.map(([type, lines], i) => ({
    type,
    heading: type,
    page: 1,
    startLine: i * 10 + 1,
    endLine: i * 10 + lines.length,
    lines,
    confidence: 0.9
  }));
}

// Gross volume extraction
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 50,000.00', 'Total Transactions 1,250']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.grossVolume.status, 'found');
  assert.equal(metrics.grossVolume.value, 50000.00);
  assert.ok(metrics.grossVolume.confidence >= 0.90);
  assert.ok(metrics.grossVolume.evidence.page === 1);
  assert.ok(typeof metrics.grossVolume.evidence.line === 'number');
}

// Transaction count extraction
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 50,000.00', 'Total Transactions 1,250']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.transactionCount.status, 'found');
  assert.equal(metrics.transactionCount.value, 1250);
  assert.ok(metrics.transactionCount.confidence >= 0.90);
}

// Total fees extraction
{
  const sections = makeSections([
    [SECTION_TYPES.FEES, ['Batch Fee 12.50', 'Monthly Account Fee 25.00', 'Total Fees 1,200.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.totalFees.status, 'found');
  assert.equal(metrics.totalFees.value, 1200.00);
  assert.ok(metrics.totalFees.confidence >= 0.95);
}

// Average ticket — derived from gross volume + transaction count
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 50,000.00', 'Total Transactions 1,250']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.averageTicket.status, 'derived');
  assert.equal(metrics.averageTicket.value, 40.00);
  assert.equal(metrics.averageTicket.formula, 'gross_volume / transaction_count');
  assert.ok(metrics.averageTicket.confidence > 0);
  assert.ok(metrics.averageTicket.assumptions.length > 0);
}

// Average ticket — directly stated wins over derived
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 50,000.00', 'Total Transactions 1,250', 'Average Ticket 45.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.averageTicket.status, 'found');
  assert.equal(metrics.averageTicket.value, 45.00);
}

// Effective rate — derived from total fees + gross volume
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 50,000.00']],
    [SECTION_TYPES.FEES, ['Total Fees 1,200.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.effectiveRate.status, 'derived');
  assert.equal(metrics.effectiveRate.formula, 'total_fees / gross_volume');
  assert.ok(Math.abs(metrics.effectiveRate.value - 0.024) < 0.000001);
  assert.ok(metrics.effectiveRate.assumptions.length > 0);
}

// Effective rate — directly stated wins over derived
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 50,000.00', 'Effective Rate 2.40%']],
    [SECTION_TYPES.FEES, ['Total Fees 1,200.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.effectiveRate.status, 'found');
  assert.ok(Math.abs(metrics.effectiveRate.value - 0.024) < 0.000001);
}

// Insufficient evidence — missing gross volume
{
  const sections = makeSections([
    [SECTION_TYPES.FEES, ['Batch Fee 12.50']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.grossVolume.status, 'insufficient_evidence');
  assert.equal(metrics.grossVolume.value, null);
  assert.equal(metrics.averageTicket.status, 'insufficient_evidence');
  assert.equal(metrics.effectiveRate.status, 'insufficient_evidence');
}

// Insufficient evidence — missing transaction count
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 10,000.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.transactionCount.status, 'insufficient_evidence');
  assert.equal(metrics.averageTicket.status, 'insufficient_evidence');
  assert.ok(Array.isArray(metrics.averageTicket.assumptions) && metrics.averageTicket.assumptions.length > 0);
}

// Refunds extraction
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 50,000.00', 'Total Refunds 500.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.refunds.status, 'found');
  assert.equal(metrics.refunds.value, 500.00);
}

// Chargebacks extraction
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 50,000.00', 'Chargeback Amount 250.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.chargebacks.status, 'found');
  assert.equal(metrics.chargebacks.value, 250.00);
}

// Card volume extraction
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Card Volume 48,000.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.cardVolume.status, 'found');
  assert.equal(metrics.cardVolume.value, 48000.00);
}

// Page and line provenance preserved
{
  const sections = [
    { type: SECTION_TYPES.SUMMARY, heading: 'Processing Summary', page: 2, startLine: 15, endLine: 20, lines: ['Gross Sales 99,999.00', 'Total Transactions 2,000'], confidence: 0.9 }
  ];
  const metrics = extractStatementMetrics(sections);
  assert.equal(metrics.grossVolume.evidence.page, 2);
  assert.equal(metrics.grossVolume.evidence.line, 15);
  assert.equal(metrics.transactionCount.evidence.page, 2);
  assert.equal(metrics.transactionCount.evidence.line, 16);
}

// Every metric result has required fields
{
  const sections = makeSections([
    [SECTION_TYPES.SUMMARY, ['Gross Sales 10,000.00', 'Total Transactions 100', 'Total Fees 250.00']]
  ]);
  const metrics = extractStatementMetrics(sections);
  for (const [key, metric] of Object.entries(metrics)) {
    assert.ok('status' in metric, `${key} missing status`);
    assert.ok('value' in metric, `${key} missing value`);
    assert.ok('formula' in metric, `${key} missing formula`);
    assert.ok('inputs' in metric, `${key} missing inputs`);
    assert.ok('confidence' in metric, `${key} missing confidence`);
    assert.ok(Array.isArray(metric.assumptions), `${key} assumptions must be array`);
  }
}

console.log('Sprint 5.0 statement metrics regression tests passed.');
