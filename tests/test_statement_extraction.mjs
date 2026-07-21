import assert from 'node:assert/strict';
import {SECTION_TYPES,classifySectionHeading,segmentPage,extractMetadataFromPages,detectProcessor,extractFeeCandidates,buildStatementExtraction} from '../js/statement-extraction.js';
import {NodeProcessorRuleLoader} from '../js/processor-rule-loader-node.js';
import {ProcessorDetector} from '../js/processor-detector.js';

const detector=new ProcessorDetector(new NodeProcessorRuleLoader());

assert.equal(classifySectionHeading('INTERCHANGE DETAIL'),SECTION_TYPES.INTERCHANGE);
assert.equal(classifySectionHeading('Deposit Summary'),SECTION_TYPES.DEPOSITS);

// Regression (fix/interchange-detail-regex): a generic "Interchange Detail"
// heading must map to the interchange_detail section. A prior WIP change had
// narrowed the INTERCHANGE heading rule to only 'interchange/program', dropping
// the generic 'interchange' token and mis-typing these sections.
assert.equal(classifySectionHeading('Interchange Detail'),SECTION_TYPES.INTERCHANGE);
// Commerce Control's 'Interchange/Program' heading must remain classified too.
assert.equal(classifySectionHeading('Interchange/Program'),SECTION_TYPES.INTERCHANGE);
const interchangeSections=segmentPage('Interchange Detail\nVisa FANF 15.00\nMC NABU 8.50',3);
assert.ok(
  interchangeSections.some(s=>s.type===SECTION_TYPES.INTERCHANGE),
  'segmentPage maps an "Interchange Detail" heading to an interchange_detail section'
);
const sections=segmentPage('Merchant Information\nMerchant Name: Country Butcher\nMerchant ID: 123456789\nProcessing Summary\nGross Sales 10,000.00\nOther Fees\nMonthly Account Fee 25.00',1);
assert.ok(sections.some(s=>s.type===SECTION_TYPES.MERCHANT));
assert.ok(sections.some(s=>s.type===SECTION_TYPES.SUMMARY));
const metadata=extractMetadataFromPages([{index:1,text:'Merchant Name: Country Butcher\nMerchant ID: 123456789\nStatement Period: June 1, 2026 through June 30, 2026'}]);
assert.equal(metadata.merchantName.value,'Country Butcher');
assert.equal(metadata.merchantId.value,'123456789');
assert.ok(metadata.statementPeriod.value.includes('June'));
assert.equal((await detectProcessor('PAYROC merchant statement',{detector})).name,'Payroc');
const unknownProcessor=await detectProcessor('unbranded statement',{detector});
assert.equal(unknownProcessor.name,'Generic Processor');
assert.equal(unknownProcessor.detectedName,'Unknown processor');
assert.equal(unknownProcessor.rulePackId,'generic');
assert.equal(unknownProcessor.fallbackStatus,'fallback');
assert.ok(unknownProcessor.requiresReview);
const feeSections=segmentPage('Other Fees\nMonthly Account Fee 25.00\nPCI Fee $9.95',2);
const fees=extractFeeCandidates(feeSections);
assert.equal(fees.length,2);
assert.equal(fees[0].amount,25);
const extraction=await buildStatementExtraction({name:'sample.pdf',pageCount:1,pages:[{index:1,text:'Worldpay\nMerchant Name: Test Shop\nMerchant ID: 987654321\nOther Fees\nBatch Fee 12.50'}]},{detector});
assert.equal(extraction.processor.name,'Worldpay');
assert.equal(extraction.processor.rulePackId,'worldpay');
assert.equal(extraction.processor.fallbackStatus,'confirmed');
assert.equal(extraction.processor.requiresReview,false);
assert.equal(extraction.processor.rulePackVersion,'1.0.0');
assert.equal(extraction.metadata.merchantName.value,'Test Shop');
assert.equal(extraction.feeCandidates.length,1);
assert.equal(extraction.extractionLog[0].page,1);
assert.ok(extraction.extractionLog.some(entry=>entry.field==='processor_detection'));
console.log('Build 4.1 statement extraction regression tests passed.');
