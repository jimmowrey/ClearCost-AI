import assert from 'node:assert/strict';
import {classifyFeeCandidate,classifyFeeCandidates,summarizeFees} from '../js/fee-intelligence.js';
import {getFeeById,getFeeRegistry} from '../js/fee-registry.js';

assert.ok(getFeeRegistry().length>=12);
assert.equal(getFeeById('CCF-000002').standardName,'Mastercard NABU Fee');

const nabu=classifyFeeCandidate({originalDescription:'MC NABU',amount:4.83,page:2,line:18,section:'assessment_detail'});
assert.equal(nabu.status,'classified');
assert.equal(nabu.canonicalId,'CCF-000002');
assert.equal(nabu.bucket,'network');
assert.ok(nabu.classificationConfidence>=.95);

const pci=classifyFeeCandidate({originalDescription:'PCI Non-Compliance Fee',amount:49.95,page:3,line:22,section:'monthly_fees'});
assert.equal(pci.canonicalId,'CCF-000005');
assert.equal(pci.negotiable,true);

const avs=classifyFeeCandidate({originalDescription:'Address Verification Service Fee',amount:11.40,page:4,line:10,section:'processor_fees'});
assert.equal(avs.canonicalId,'CCF-000010');

const unknown=classifyFeeCandidate({originalDescription:'Merchant Advantage Plus',amount:7.84,page:5,line:63,section:'processor_fees'});
assert.equal(unknown.status,'needs_review');
assert.equal(unknown.canonicalId,null);
assert.equal(unknown.bucket,'unknown');
assert.equal(unknown.suggestedBucket,'processor_revenue');

const fees=classifyFeeCandidates([
  {originalDescription:'Visa FANF',amount:12,page:1,line:1,section:'assessment_detail'},
  {originalDescription:'Batch Fee',amount:10,page:1,line:2,section:'processor_fees'},
  {originalDescription:'Unrecognized Program',amount:5,page:1,line:3,section:'processor_fees'}
]);
const summary=summarizeFees(fees);
assert.equal(summary.classified,2);
assert.equal(summary.unknown,1);
assert.equal(summary.totalAmount,27);
assert.equal(summary.buckets.network,12);
assert.equal(summary.buckets.processor_revenue,10);
assert.equal(summary.buckets.unknown,5);

console.log('Build 4.2 fee intelligence regression tests passed.');
