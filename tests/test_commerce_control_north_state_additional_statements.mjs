import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyFeeCandidate } from '../js/fee-intelligence.js';
import { runStatementIntelligencePipeline } from '../js/statement-intelligence-pipeline.js';
import { NodeProcessorRuleLoader } from '../js/processor-rule-loader-node.js';
import { ProcessorDetector } from '../js/processor-detector.js';

const here = dirname(fileURLToPath(import.meta.url));
const detector = new ProcessorDetector(new NodeProcessorRuleLoader());

async function runFixture(fileName) {
  const fixture = JSON.parse(
    readFileSync(join(here, '..', 'data', 'regression', fileName), 'utf8')
  );
  const pages = fixture.pages.map(page => ({
    index: page.page_number,
    page: page.page_number,
    text: page.full_text,
    readable: true,
    hasText: Boolean(page.full_text),
    rotation: 0,
    ocrRequired: false
  }));

  return runStatementIntelligencePipeline(
    { name: fileName, pageCount: pages.length, pages },
    { detector }
  );
}

function assertRedacted(fileName) {
  const fixtureText = readFileSync(
    join(here, '..', 'data', 'regression', fileName),
    'utf8'
  );
  for (const identifier of [
    'NORTHSTATE',
    'POWERSPORTS',
    'GABRIEL',
    'EGGEN',
    'MIDWAY',
    'CHICO',
    '266493272881'
  ]) {
    assert.ok(!fixtureText.includes(identifier), `${fileName} redacts ${identifier}`);
  }
  const remainingLongIds = (fixtureText.match(/(?<!\d)\d{12}(?!\d)/g) || [])
    .filter(value => value !== '000000000000');
  assert.deepEqual(remainingLongIds, [], `${fileName} contains no account/batch identifiers`);
}

const decemberFile = 'north_state_power_sports_commerce_control_2024_12.json';
const februaryFile = 'north_state_power_sports_commerce_control_2025_02.json';
assertRedacted(decemberFile);
assertRedacted(februaryFile);

const december = await runFixture(decemberFile);

assert.equal(december.processor.name, 'Commerce Control');
assert.equal(december.processor.rulePackId, 'commerce_control');
assert.equal(december.processor.fallbackStatus, 'confirmed');
assert.ok(
  december.processor.evidence.some(candidate =>
    candidate.processorId === 'fiserv' &&
    candidate.evidence.some(evidence => evidence.match.toLowerCase() === 'fiserv')
  ),
  'December retains the Fiserv notice as contrary evidence without misidentifying the processor'
);
assert.equal(december.metrics.grossVolume.value, 86691.93);
assert.equal(december.metrics.transactionCount.value, 303);
assert.equal(december.metrics.averageTicket.value, 286.11);
assert.equal(december.metrics.totalFees.value, 2213.02);
assert.equal(december.feeCandidates.length, 89);
assert.equal(december.feeSummary.classified, 89);
assert.equal(december.feeSummary.unknown, 0);
assert.equal(december.unknownFees.length, 0);
assert.equal(december.feeSummary.reconciliationEligibleCents, 221302);
assert.equal(december.reconciliation.feeVarianceCents, 0);
assert.equal(december.reconciliation.status, 'reconciled');

const recoveredDigitalCommerce = december.feeCandidates.find(
  fee => fee.originalDescription === 'VI DIGITAL COMMERCE SVCS FEE'
);
assert.ok(recoveredDigitalCommerce, 'formula continuation does not replace the fee description');
assert.equal(recoveredDigitalCommerce.amount, 2.29);
assert.equal(recoveredDigitalCommerce.ruleId, 'CC-FT-1009');

const internationalAcquirer = december.feeCandidates.find(
  fee => fee.originalDescription.startsWith('VS INTL ACQUIRER FEE')
);
assert.ok(internationalAcquirer);
assert.equal(internationalAcquirer.ruleId, 'CC-FT-1010');

const february = await runFixture(februaryFile);

assert.equal(february.processor.name, 'Commerce Control');
assert.equal(february.processor.rulePackId, 'commerce_control');
assert.equal(february.metrics.grossVolume.value, 69903.86);
assert.equal(february.metrics.transactionCount.value, 278);
assert.equal(february.metrics.averageTicket.value, 251.45);
assert.equal(february.metrics.totalFees.value, 909.75);
assert.equal(february.feeCandidates.length, 92);
assert.equal(february.feeSummary.classified, 92);
assert.equal(february.feeSummary.unknown, 0);
assert.equal(february.unknownFees.length, 0);
assert.equal(february.feeSummary.reconciliationEligibleCents, 90975);
assert.equal(february.reconciliation.feeVarianceCents, 0);
assert.equal(february.reconciliation.status, 'reconciled');

for (const description of [
  'VI DIGITAL COMMERCE SVCS FEE',
  'VS INTL ACQUIRER FEE 0 TRANS TOTALING $282.48'
]) {
  const unrelatedProcessor = classifyFeeCandidate(
    {
      originalDescription: description,
      section: 'monthly_fees',
      extractionMethod: 'generic_fee_line'
    },
    { processor: 'Generic Processor' }
  );
  assert.equal(
    unrelatedProcessor.status,
    'needs_review',
    `Commerce Control rule remains processor-scoped: ${description}`
  );
}

const fiservOnly = await detector.detect(
  'Important account notice from Fiserv. CARDPOINTE PLATFORM FEE',
  { mid: '123456789012' }
);
assert.equal(
  fiservOnly.processorId,
  'fiserv',
  'Commerce Control domain evidence is load-bearing and does not steal a true Fiserv document'
);

console.log(
  'Commerce Control North State December 2024 and February 2025 regression tests passed.'
);
