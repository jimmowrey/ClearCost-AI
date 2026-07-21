import assert from 'node:assert/strict';
import {NodeProcessorRuleLoader} from '../js/processor-rule-loader-node.js';
import {ProcessorDetector, EVIDENCE_TYPES, CONFIDENCE_THRESHOLD} from '../js/processor-detector.js';
import {buildStatementExtraction} from '../js/statement-extraction.js';

const loader = new NodeProcessorRuleLoader();
const detector = new ProcessorDetector(loader);

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 5.3 — Processor Intelligence: Commerce Control detection.
//
// North State Power Sports statements are produced on the Commerce Control
// platform. Before this sprint they fell back to the Generic Processor because
// no `commerce_control` rule pack existed, so detection could never select the
// identity that the extraction stage already keys on
// (`processorId === 'commerce_control'`).
//
// Detection evidence is built ONLY from markers confirmed present in the
// repository's own Commerce Control extraction logic — the "Interchange/Program"
// section heading, the "Product/Description" column label, and the "Commerce
// Control" platform wording. The merchant name and statement filename are NOT
// used as evidence.
// ─────────────────────────────────────────────────────────────────────────────

// Representative Commerce Control statement (no merchant name / filename used as
// a detection signal; structural + platform evidence only).
const commerceControlStatement = [
  'Commerce Control Merchant Statement',
  'Merchant ID: 5423891007',
  'Statement Period: June 1, 2026 through June 30, 2026',
  'Interchange/Program',
  'Product/Description',
  'Sub Total',
  'VI-US REGULATED (DB)',
  '$1,000.00',
  '1.00%',
  '10',
  '5.00%',
  '0.05',
  '$0.020',
  '-$1.98',
].join('\n');

// ── 1. North State / Commerce Control receives the correct processor & pack ──
{
  const r = await detector.detect(commerceControlStatement, {
    lines: commerceControlStatement.split('\n'),
  });

  assert.equal(r.processorId, 'commerce_control', 'processor id is commerce_control');
  assert.equal(r.processor, 'Commerce Control', 'processor name is Commerce Control');
  assert.equal(r.fallback, false, 'not a generic fallback');
  assert.equal(r.detectedProcessorId, 'commerce_control');

  // Confidence meets the existing global threshold using real evidence.
  assert.ok(r.confidence >= r.threshold, 'confidence meets the pack threshold');
  assert.ok(r.confidence >= 0.5, 'confidence meets the 0.5 global threshold');

  // Evidence is preserved and reproducible: it includes the platform wording
  // and the section-structure heading (not merchant/filename).
  const ccEvidence = r.evidence.find(e => e.processorId === 'commerce_control');
  assert.ok(ccEvidence, 'commerce_control evidence is preserved');
  const matched = ccEvidence.evidence.map(e => String(e.match).toLowerCase());
  assert.ok(matched.some(m => m.includes('commerce control')), 'uses Commerce Control wording');
  assert.ok(matched.some(m => m.includes('interchange/program')), 'uses Interchange/Program structure');
  const types = new Set(ccEvidence.evidence.map(e => e.type));
  assert.ok(types.has(EVIDENCE_TYPES.WORDING));
  assert.ok(types.has(EVIDENCE_TYPES.SECTION));
}

// ── 2. Detection is evidence-based, not dependent on the brand string ────────
// A statement with the Commerce Control *structure* but without the literal
// "Commerce Control" platform line still crosses the threshold on structural
// evidence alone.
{
  const structuralOnly = [
    'Monthly Merchant Statement',
    'Interchange/Program',
    'Product/Description',
    'Sub Total',
    'VI-US REGULATED (DB)',
  ].join('\n');

  const r = await detector.detect(structuralOnly, {lines: structuralOnly.split('\n')});
  assert.equal(r.processorId, 'commerce_control', 'structural evidence alone identifies Commerce Control');
  assert.ok(r.confidence >= 0.5);
  assert.equal(r.fallback, false);
}

// ── 3. Weak / ambiguous statements still fall back to Generic Processor ───────
{
  const weak = await detector.detect('Merchant statement with no processor clues');
  assert.equal(weak.processorId, 'generic', 'no evidence → generic fallback');
  assert.ok(weak.fallback);
  assert.equal(weak.strongestCandidate, null);

  // A lone MID is not sufficient evidence to force a Commerce Control match.
  const midOnly = await detector.detect('Statement\nMerchant ID: 5423891007', {mid: '5423891007'});
  assert.notEqual(midOnly.processorId, 'commerce_control', 'a bare MID does not force a Commerce Control match');
  assert.ok(midOnly.fallback, 'insufficient evidence still falls back');
}

// ── 4. Global confidence threshold is NOT weakened ───────────────────────────
{
  assert.equal(CONFIDENCE_THRESHOLD, 0.5, 'global default threshold unchanged');
  const ccPack = await loader.loadRulePack('commerce_control');
  assert.equal(ccPack.manifest.confidenceThreshold, 0.5, 'commerce_control keeps the 0.5 threshold');
}

// ── 5. Existing supported processors remain unaffected ───────────────────────
{
  const cases = [
    ['Worldpay merchant statement', 'worldpay'],
    ['Fiserv payment processing statement', 'fiserv'],
    ['TSYS total system services merchant statement', 'tsys'],
    ['Square merchant processing statement', 'square'],
  ];
  for (const [text, expected] of cases) {
    const r = await detector.detect(text);
    assert.equal(r.processorId, expected, `${expected} still detected correctly`);
    assert.ok(!r.fallback, `${expected} is not a fallback`);
    assert.notEqual(r.processorId, 'commerce_control', `${expected} not overridden by commerce_control`);
  }
}

// ── 6. Extraction wiring: the pack flows through to the extraction result ─────
{
  const extraction = await buildStatementExtraction({
    name: 'statement.pdf',
    pageCount: 1,
    pages: [{index: 1, text: commerceControlStatement}],
  }, {detector});

  assert.equal(extraction.processor.name, 'Commerce Control');
  assert.equal(extraction.processor.rulePackId, 'commerce_control');
  assert.equal(extraction.processor.fallbackStatus, 'confirmed');
  assert.equal(extraction.processor.rulePackVersion, '1.0.0');
}

console.log('Sprint 5.3 processor intelligence (Commerce Control) regression tests passed.');
