import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyFeeCandidate
} from '../js/fee-intelligence.js';
import {
  runStatementIntelligencePipeline
} from '../js/statement-intelligence-pipeline.js';
import {
  NodeProcessorRuleLoader
} from '../js/processor-rule-loader-node.js';
import {
  ProcessorDetector
} from '../js/processor-detector.js';

const here =
  dirname(
    fileURLToPath(
      import.meta.url
    )
  );

const fixture =
  JSON.parse(
    readFileSync(
      join(
        here,
        '..',
        'data',
        'regression',
        'north_state_power_sports_commerce_control.json'
      ),
      'utf8'
    )
  );

const pages =
  fixture.pages.map(
    page => ({
      index:
        page.page_number,
      page:
        page.page_number,
      text:
        page.full_text,
      readable:
        true,
      hasText:
        true,
      rotation:
        0,
      ocrRequired:
        false
    })
  );

const detector =
  new ProcessorDetector(
    new NodeProcessorRuleLoader()
  );

const result =
  await runStatementIntelligencePipeline(
    {
      name:
        'north-state-redacted.pdf',
      pageCount:
        pages.length,
      pages
    },
    {
      detector
    }
  );

assert.equal(
  result.feeCandidates.length,
  90,
  'all 90 statement fee rows remain preserved'
);

assert.equal(
  result.feeSummary.classified,
  90,
  'all 90 economically identified rows are classified'
);

assert.equal(
  result.unknownFees.length,
  0,
  'no Commerce Control fee rows remain unknown'
);

const starTokenFee =
  result.feeCandidates.find(
    fee =>
      fee.standardName ===
        'STAR Token Exchange Debit Fee'
  );

assert.ok(
  starTokenFee,
  'STAR token fee is recovered and classified by name'
);

assert.equal(starTokenFee.amount, 0.01);
assert.equal(starTokenFee.category, 'assessment');
assert.equal(starTokenFee.bucket, 'network');
assert.equal(starTokenFee.ruleId, 'CC-FT-1008');

assert.equal(
  result.feeSummary.reconciliationEligibleCents,
  150157,
  'classification does not alter the reconciled fee total'
);

const expectedBuckets = {
  wholesale_interchange:
    1308.59,
  network:
    105.20,
  processor_revenue:
    52.83,
  third_party:
    34.95,
  unknown:
    0
};

assert.deepEqual(
  result.feeSummary.buckets,
  expectedBuckets,
  'classified dollars land in their verified economic buckets'
);

for (
  const description of
  [
    'MASTERCARD SALES DISCOUNT 0.0005 DISC RATE TIMES $7472.92',
    'MC AUTH CONNECTIVITY FEE 28 KILOBYTES AT 0.002294',
    'STAR TOKEN EXCHANGE DEBIT FEE'
  ]
) {
  const outsideCommerceControl =
    classifyFeeCandidate(
      {
        originalDescription:
          description,
        section:
          'processor_fees',
        extractionMethod:
          'generic_fee_line'
      },
      {
        processor:
          'Generic Processor'
      }
    );

  assert.equal(
    outsideCommerceControl.status,
    'needs_review',
    `Commerce Control rule does not classify another processor's row: ${description}`
  );
}

console.log(
  'Commerce Control remaining-fee classification regression tests passed.'
);
