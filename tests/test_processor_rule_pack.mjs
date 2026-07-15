/**
 * Sprint 4.3 – Processor Rule Pack Framework: regression tests.
 *
 * Covers:
 *  - known processors (Payroc, Worldpay, Fiserv, TSYS, Square)
 *  - unknown processors (below-threshold fallback to generic)
 *  - manifest validation
 *  - rule loading (all 7 packs, all 6 files present)
 *  - confidence scoring
 *  - mixed aliases (no cross-processor contamination)
 *  - evidence preservation
 */

import assert from 'node:assert/strict';
import {ProcessorRuleLoader} from '../js/processor-rule-loader.js';
import {ProcessorDetector,CONFIDENCE_THRESHOLD,EVIDENCE_TYPES} from '../js/processor-detector.js';

const loader=new ProcessorRuleLoader();
const detector=new ProcessorDetector(loader);

// ---------------------------------------------------------------------------
// Rule loading – all 7 packs discoverable and fully populated
// ---------------------------------------------------------------------------
const installed=loader.getInstalledPacks();
assert.ok(installed.includes('common'),   'common pack discovered');
assert.ok(installed.includes('generic'),  'generic pack discovered');
assert.ok(installed.includes('payroc'),   'payroc pack discovered');
assert.ok(installed.includes('worldpay'), 'worldpay pack discovered');
assert.ok(installed.includes('fiserv'),   'fiserv pack discovered');
assert.ok(installed.includes('tsys'),     'tsys pack discovered');
assert.ok(installed.includes('square'),   'square pack discovered');

const PACK_KEYS=['manifest','layout','sections','aliases','fees','behaviors'];
for(const id of installed){
  const pack=loader.loadRulePack(id);
  for(const key of PACK_KEYS){
    assert.ok(Object.prototype.hasOwnProperty.call(pack,key),`${id} pack has '${key}' key`);
  }
  assert.equal(typeof pack.manifest,'object',`${id} manifest is an object`);
  assert.equal(pack.manifest.id,id,`${id} manifest.id matches directory name`);
}

// ---------------------------------------------------------------------------
// Caching – second load returns same reference
// ---------------------------------------------------------------------------
const pack1=loader.loadRulePack('payroc');
const pack2=loader.loadRulePack('payroc');
assert.ok(pack1===pack2,'cached pack returns same object reference');

// clearCache invalidates cache
loader.clearCache();
const pack3=loader.loadRulePack('payroc');
assert.ok(pack1!==pack3,'clearCache forces re-load');

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------
const {valid:v1}=loader.validateManifest({id:'x',name:'X',version:'1.0.0'});
assert.ok(v1,'valid manifest passes validation');

const {valid:v2,errors:e2}=loader.validateManifest({name:'Missing id',version:'1.0.0'});
assert.ok(!v2,'manifest missing id fails validation');
assert.ok(e2.some(e=>e.includes('id')),'validation error mentions id');

const {valid:v3,errors:e3}=loader.validateManifest({id:'x',version:'1.0.0'});
assert.ok(!v3,'manifest missing name fails validation');
assert.ok(e3.some(e=>e.includes('name')),'validation error mentions name');

const {valid:v4,errors:e4}=loader.validateManifest({id:'x',name:'X'});
assert.ok(!v4,'manifest missing version fails validation');
assert.ok(e4.some(e=>e.includes('version')),'validation error mentions version');

const {valid:v5,errors:e5}=loader.validateManifest(null);
assert.ok(!v5,'null manifest fails validation');
assert.ok(e5.length>0,'null manifest produces errors');

const {valid:v6,errors:e6}=loader.validateManifest({id:'x',name:'X',version:'1.0.0',normalizationBase:-1});
assert.ok(!v6,'negative normalizationBase fails validation');
assert.ok(e6.some(e=>e.includes('normalizationBase')),'error mentions normalizationBase');

const {valid:v7,errors:e7}=loader.validateManifest({id:'x',name:'X',version:'1.0.0',confidenceThreshold:1.5});
assert.ok(!v7,'out-of-range confidenceThreshold fails validation');
assert.ok(e7.some(e=>e.includes('confidenceThreshold')),'error mentions confidenceThreshold');

// ---------------------------------------------------------------------------
// loadRulePack – missing pack throws
// ---------------------------------------------------------------------------
assert.throws(()=>loader.loadRulePack('nonexistent_processor'),/not found/i,'missing pack throws');

// ---------------------------------------------------------------------------
// Known processor detection – each processor identified with high confidence
// ---------------------------------------------------------------------------
const payroc=detector.detect('PAYROC merchant processing statement for June 2026');
assert.equal(payroc.processorId,'payroc',          'Payroc detected by id');
assert.equal(payroc.processor,'Payroc',             'Payroc detected by name');
assert.ok(payroc.confidence>=0.5,                   'Payroc confidence >= 0.5');
assert.ok(!payroc.fallback,                         'Payroc is not a fallback result');
assert.ok(payroc.evidence.length>0,                 'Payroc evidence list is non-empty');

const worldpay=detector.detect('Worldpay monthly merchant processing statement');
assert.equal(worldpay.processorId,'worldpay',       'Worldpay detected');
assert.ok(worldpay.confidence>=0.5,                 'Worldpay confidence >= 0.5');
assert.ok(!worldpay.fallback,                       'Worldpay is not fallback');

const fiserv=detector.detect('Fiserv payment processing statement');
assert.equal(fiserv.processorId,'fiserv',           'Fiserv detected');
assert.ok(fiserv.confidence>=0.5,                   'Fiserv confidence >= 0.5');

const fiservFD=detector.detect('First Data merchant statement');
assert.equal(fiservFD.processorId,'fiserv',         'First Data maps to fiserv pack');
assert.ok(fiservFD.confidence>=0.5,                 'First Data confidence >= 0.5');

const tsys=detector.detect('TSYS total system services merchant statement');
assert.equal(tsys.processorId,'tsys',               'TSYS detected');
assert.ok(tsys.confidence>=0.5,                     'TSYS confidence >= 0.5');

const square=detector.detect('Square merchant processing statement');
assert.equal(square.processorId,'square',           'Square detected');
assert.ok(square.confidence>=0.5,                   'Square confidence >= 0.5');

// Signapay wording is evidence for Payroc but weight 25/60 = 0.42 → below threshold → fallback
const signapay=detector.detect('Signapay processing statement for merchant');
assert.ok(signapay.fallback,                         'Signapay alone is below confidence threshold');
// Evidence must still be preserved pointing at Payroc
assert.ok(signapay.evidence.some(e=>e.processorId==='payroc'),
  'Signapay evidence points to Payroc pack even on fallback');

// Vantiv wording maps to Worldpay
const vantiv=detector.detect('Vantiv merchant processing statement');
assert.equal(vantiv.processorId,'worldpay',         'Vantiv wording maps to Worldpay pack');

// ---------------------------------------------------------------------------
// Unknown processor – confidence below threshold → fallback to generic
// ---------------------------------------------------------------------------
const unknown=detector.detect('Merchant statement for June 2026');
assert.ok(unknown.fallback,                          'Unknown processor triggers fallback');
assert.equal(unknown.processorId,'generic',          'Fallback uses generic pack');
assert.equal(unknown.processor,'Generic Processor',  'Fallback processor name is Generic Processor');
assert.ok(typeof unknown.fallbackReason==='string',  'Fallback reason is a string');
assert.ok(unknown.rulePack?.manifest?.id==='generic','Fallback rule pack is generic');

// Evidence is preserved even on fallback (may be empty array for truly blank text)
assert.ok(Array.isArray(unknown.evidence),           'Evidence array preserved on fallback');

// Blank text also falls back safely
const blank=detector.detect('');
assert.ok(blank.fallback,                            'Blank text falls back safely');
assert.equal(blank.processorId,'generic',            'Blank text falls back to generic');
assert.ok(Array.isArray(blank.evidence),             'Blank text evidence is an array');

// ---------------------------------------------------------------------------
// Confidence scoring – more evidence = higher score
// ---------------------------------------------------------------------------
const lowConf=detector.detect('Vantiv');           // weight 35 → confidence 35/60 = 0.58
const hiConf=detector.detect('Worldpay');           // weight 60 → confidence 60/60 = 1.0
assert.ok(hiConf.confidence>lowConf.confidence,     'More specific text yields higher confidence');
assert.equal(hiConf.confidence,1,                   'Single strong keyword reaches confidence 1.0');

// Confidence is capped at 1.0
const overloaded=detector.detect('Worldpay worldpay WORLDPAY Vantiv fis global');
assert.ok(overloaded.confidence<=1,                 'Confidence never exceeds 1.0');

// Score returned alongside confidence
const scored=detector.detect('TSYS');
assert.ok(typeof scored.score==='number',            'score is a number');
assert.ok(scored.score>0,                           'score is positive for known processor');

// ---------------------------------------------------------------------------
// Evidence preservation – evidence contains expected keys
// ---------------------------------------------------------------------------
const payroc2=detector.detect('PAYROC merchant statement');
const evidenceEntry=payroc2.evidence.find(e=>e.processorId==='payroc');
assert.ok(evidenceEntry,                             'Evidence entry for payroc exists');
assert.ok(Array.isArray(evidenceEntry.evidence),     'Evidence entry contains evidence array');
const hit=evidenceEntry.evidence[0];
assert.ok(typeof hit.type==='string',                'Evidence hit has type');
assert.ok(typeof hit.weight==='number',              'Evidence hit has weight');
assert.ok(typeof hit.source==='string',              'Evidence hit has source');

// Low-confidence detection still preserves evidence before falling back
const lowEvid=detector.detect('FIS Global merchant');   // confidence < 0.5 for worldpay
assert.ok(lowEvid.fallback,                          'Low-confidence detection falls back');
assert.ok(lowEvid.evidence.length>0,                 'Evidence preserved in fallback result');
assert.ok(lowEvid.evidence.some(e=>e.processor==='Worldpay'),'Worldpay evidence preserved in fallback');

// ---------------------------------------------------------------------------
// Mixed aliases – processor-specific alias text adds evidence only to that pack
// ---------------------------------------------------------------------------
// "Signapay Monthly Fee" should boost only Payroc, not Worldpay or TSYS
const mixedAlias=detector.detect('Signapay Monthly Fee 25.00');
const payroc3Evid=mixedAlias.evidence.find(e=>e.processorId==='payroc');
const worldpayEvid=mixedAlias.evidence.find(e=>e.processorId==='worldpay');
assert.ok(payroc3Evid,                               'Payroc has evidence for Signapay Monthly Fee');
assert.ok(!worldpayEvid||worldpayEvid.score===0,     'Worldpay is not boosted by Payroc alias');

// Fee aliases from different processors do not cross-contaminate confidence
const wfeeText='Worldpay Monthly Service Fee 29.99';
const wfee=detector.detect(wfeeText);
const wfeePayroc=wfee.evidence.find(e=>e.processorId==='payroc');
const wfeeWorldpay=wfee.evidence.find(e=>e.processorId==='worldpay');
assert.ok(!wfeePayroc||!wfeePayroc.evidence.some(e=>e.type===EVIDENCE_TYPES.ALIAS&&e.alias==='worldpay monthly service fee'),
  'Worldpay alias text does not generate alias evidence for Payroc');
if(wfeeWorldpay){
  assert.ok(wfeeWorldpay.evidence.some(e=>e.type===EVIDENCE_TYPES.ALIAS),
    'Worldpay alias evidence recorded under Worldpay');
}

// ---------------------------------------------------------------------------
// MID format hint boosts detection
// ---------------------------------------------------------------------------
// Payroc midFormat is ^\d{12,15}$
const midHintMatch=detector.detect('PAYROC statement',{mid:'123456789012'});
const midHintNoHint=detector.detect('PAYROC statement');
assert.ok(midHintMatch.score>=midHintNoHint.score, 'Matching MID format hint increases or equals score');

// MID format for wrong processor does not affect score
const wrongMid=detector.detect('PAYROC statement',{mid:'SQUAREMIDABC'});  // Square format
assert.equal(wrongMid.processorId,'payroc', 'Wrong MID format does not override processor detection');

// ---------------------------------------------------------------------------
// rulePack returned on both match and fallback
// ---------------------------------------------------------------------------
const rpMatch=detector.detect('Worldpay merchant statement');
assert.ok(rpMatch.rulePack?.manifest,'rulePack.manifest present on match');
assert.equal(rpMatch.rulePack.manifest.id,'worldpay','matched rulePack is worldpay');

const rpFallback=detector.detect('Unknown merchant statement XYZ');
assert.ok(rpFallback.rulePack?.manifest,'rulePack.manifest present on fallback');
assert.equal(rpFallback.rulePack.manifest.id,'generic','fallback rulePack is generic');

// ---------------------------------------------------------------------------
// CONFIDENCE_THRESHOLD constant exported
// ---------------------------------------------------------------------------
assert.equal(typeof CONFIDENCE_THRESHOLD,'number',   'CONFIDENCE_THRESHOLD is a number');
assert.ok(CONFIDENCE_THRESHOLD>0&&CONFIDENCE_THRESHOLD<1,'CONFIDENCE_THRESHOLD is between 0 and 1');

// ---------------------------------------------------------------------------
// Existing baseline tests still pass (guard against regression)
// ---------------------------------------------------------------------------
import {detectProcessor} from '../js/statement-extraction.js';
assert.equal(detectProcessor('PAYROC merchant statement').name,'Payroc', 'Build 4.1 detectProcessor still works');
assert.equal(detectProcessor('unbranded statement').name,'Unknown processor','Build 4.1 unknown still works');

console.log('Sprint 4.3 Processor Rule Pack Framework regression tests passed.');
