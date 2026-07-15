import assert from 'node:assert/strict';
import {NodeProcessorRuleLoader} from '../js/processor-rule-loader-node.js';
import {ProcessorDetector,EVIDENCE_TYPES} from '../js/processor-detector.js';
import {buildStatementExtraction} from '../js/statement-extraction.js';

const detector=new ProcessorDetector(new NodeProcessorRuleLoader());

const payroc=await detector.detect('Monthly merchant statement',{logoText:'PAYROC'});
assert.equal(payroc.processorId,'payroc');
assert.ok(!payroc.fallback);

const worldpay=await detector.detect('Worldpay merchant statement');
assert.equal(worldpay.processorId,'worldpay');
assert.ok(!worldpay.fallback);

const fiserv=await detector.detect('Fiserv payment processing statement');
assert.equal(fiserv.processorId,'fiserv');
assert.ok(!fiserv.fallback);

const tsys=await detector.detect('TSYS total system services merchant statement');
assert.equal(tsys.processorId,'tsys');
assert.ok(!tsys.fallback);

const square=await detector.detect('Square merchant processing statement');
assert.equal(square.processorId,'square');
assert.ok(!square.fallback);

const unknown=await detector.detect('Merchant statement with no processor clues');
assert.equal(unknown.processorId,'generic');
assert.ok(unknown.fallback);
assert.equal(unknown.strongestCandidate,null);

const conflicting=await detector.detect('PAYROC statement\nVantiv monthly fee 20.00\nWorldpay Fees');
const conflictingProcessors=conflicting.evidence.map(item=>item.processorId);
assert.ok(conflictingProcessors.includes('payroc'));
assert.ok(conflictingProcessors.includes('worldpay'));
assert.ok(conflicting.score>0);

const lowConfidence=await detector.detect('FIS Global and Signapay references only');
assert.equal(lowConfidence.processorId,'generic');
assert.ok(lowConfidence.fallback);
assert.ok(lowConfidence.requiresReview);
assert.equal(lowConfidence.strongestCandidate?.processor,'Payroc');
assert.ok(lowConfidence.evidence.some(item=>item.processorId==='payroc'));
assert.ok(lowConfidence.evidence.some(item=>item.processorId==='worldpay'));

const richWorldpay=await detector.detect(
  'Vantiv monthly fee\nworldpay merchant statement\nWorldpay Monthly Service Fee 29.99',
  {mid:'1234567890',lines:['Worldpay Fees'],logoText:'WORLDPAY'}
);
const richEvidence=richWorldpay.evidence.find(item=>item.processorId==='worldpay');
assert.ok(richEvidence);
const richTypes=new Set(richEvidence.evidence.map(e=>e.type));
assert.ok(richTypes.has(EVIDENCE_TYPES.LOGO));
assert.ok(richTypes.has(EVIDENCE_TYPES.WORDING));
assert.ok(richTypes.has(EVIDENCE_TYPES.LAYOUT));
assert.ok(richTypes.has(EVIDENCE_TYPES.SECTION));
assert.ok(richTypes.has(EVIDENCE_TYPES.ALIAS));
assert.ok(richTypes.has(EVIDENCE_TYPES.MID));

const fallbackExtraction=await buildStatementExtraction({
  name:'low-confidence.pdf',
  pageCount:1,
  logoText:'UNKNOWN',
  pages:[{index:1,text:'FIS Global and Signapay references only\nMerchant ID: ABC123'}]
},{detector});
assert.equal(fallbackExtraction.processor.name,'Generic Processor');
assert.equal(fallbackExtraction.processor.detectedName,'Payroc');
assert.equal(fallbackExtraction.processor.fallbackStatus,'fallback');
assert.ok(fallbackExtraction.processor.requiresReview);
assert.ok(fallbackExtraction.processor.evidence.length>=2);
assert.equal(fallbackExtraction.processor.rulePackVersion,'1.0.0');

console.log('Sprint 4.4 processor identification and evidence integration regression tests passed.');
