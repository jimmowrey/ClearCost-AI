import assert from 'node:assert/strict';
import {NodeProcessorRuleLoader} from '../js/processor-rule-loader-node.js';
import {ProcessorDetector,CONFIDENCE_THRESHOLD,EVIDENCE_TYPES} from '../js/processor-detector.js';
import {detectProcessor} from '../js/statement-extraction.js';

const loader=new NodeProcessorRuleLoader();
const detector=new ProcessorDetector(loader);

const installed=await loader.getInstalledPacks();
assert.deepEqual(installed,['common','fiserv','generic','payroc','square','tsys','worldpay']);

const PACK_KEYS=['manifest','layout','sections','aliases','fees','behaviors'];
for(const id of installed){
  const pack=await loader.loadRulePack(id);
  for(const key of PACK_KEYS) assert.ok(Object.prototype.hasOwnProperty.call(pack,key),`${id} pack has '${key}' key`);
  assert.equal(pack.manifest.id,id,`${id} manifest.id matches directory name`);
}

const pack1=await loader.loadRulePack('payroc');
const pack2=await loader.loadRulePack('payroc');
assert.ok(pack1===pack2,'cached pack returns same object reference');
loader.clearCache();
const pack3=await loader.loadRulePack('payroc');
assert.ok(pack1!==pack3,'clearCache forces re-load');

assert.ok(loader.validateManifest({id:'x',name:'X',version:'1.0.0'}).valid);
assert.ok(!loader.validateManifest({name:'Missing id',version:'1.0.0'}).valid);
assert.ok(!loader.validateManifest({id:'x',version:'1.0.0'}).valid);
assert.ok(!loader.validateManifest({id:'x',name:'X'}).valid);
assert.ok(!loader.validateManifest(null).valid);
assert.ok(!loader.validateManifest({id:'x',name:'X',version:'1.0.0',normalizationBase:-1}).valid);
assert.ok(!loader.validateManifest({id:'x',name:'X',version:'1.0.0',confidenceThreshold:1.5}).valid);

await assert.rejects(()=>loader.loadRulePack('nonexistent_processor'),/ENOENT|not found/i);

const payroc=await detector.detect('PAYROC merchant processing statement for June 2026');
assert.equal(payroc.processorId,'payroc');
assert.equal(payroc.processor,'Payroc');
assert.ok(payroc.confidence>=0.5);
assert.ok(!payroc.fallback);

const worldpay=await detector.detect('Worldpay monthly merchant processing statement');
assert.equal(worldpay.processorId,'worldpay');
assert.ok(worldpay.confidence>=0.5);

const fiserv=await detector.detect('Fiserv payment processing statement');
assert.equal(fiserv.processorId,'fiserv');
const fiservFD=await detector.detect('First Data merchant statement');
assert.equal(fiservFD.processorId,'fiserv');
const tsys=await detector.detect('TSYS total system services merchant statement');
assert.equal(tsys.processorId,'tsys');
const square=await detector.detect('Square merchant processing statement');
assert.equal(square.processorId,'square');

const signapay=await detector.detect('Signapay processing statement for merchant');
assert.ok(signapay.fallback);
assert.ok(signapay.evidence.some(e=>e.processorId==='payroc'));

const vantiv=await detector.detect('Vantiv merchant processing statement');
assert.equal(vantiv.processorId,'worldpay');

const unknown=await detector.detect('Merchant statement for June 2026');
assert.ok(unknown.fallback);
assert.equal(unknown.processorId,'generic');
assert.equal(unknown.processor,'Generic Processor');
assert.ok(typeof unknown.fallbackReason==='string');
assert.ok(Array.isArray(unknown.evidence));

const blank=await detector.detect('');
assert.ok(blank.fallback);
assert.equal(blank.processorId,'generic');

const lowConf=await detector.detect('FIS Global');
const hiConf=await detector.detect('Worldpay');
assert.ok(hiConf.confidence>lowConf.confidence);
assert.equal(hiConf.confidence,1);
assert.ok((await detector.detect('Worldpay worldpay WORLDPAY Vantiv fis global')).confidence<=1);
assert.ok(typeof (await detector.detect('TSYS')).score==='number');

const payroc2=await detector.detect('PAYROC\nPayroc Fees\nPAYROC merchant statement');
const evidenceEntry=payroc2.evidence.find(e=>e.processorId==='payroc');
assert.ok(evidenceEntry);
assert.ok(evidenceEntry.evidence.some(e=>e.type===EVIDENCE_TYPES.SECTION));

const lowEvid=await detector.detect('FIS Global merchant');
assert.ok(lowEvid.fallback);
assert.ok(lowEvid.evidence.some(e=>e.processor==='Worldpay'));

const mixedAlias=await detector.detect('Signapay Monthly Fee 25.00');
const payrocAlias=mixedAlias.evidence.find(e=>e.processorId==='payroc');
const worldpayAlias=mixedAlias.evidence.find(e=>e.processorId==='worldpay');
assert.ok(payrocAlias);
assert.ok(!worldpayAlias||worldpayAlias.score===0);

const wfee=await detector.detect('Worldpay Monthly Service Fee 29.99');
const wfeeWorldpay=wfee.evidence.find(e=>e.processorId==='worldpay');
assert.ok(wfeeWorldpay?.evidence.some(e=>e.type===EVIDENCE_TYPES.ALIAS));

const midHintMatch=await detector.detect('PAYROC statement',{mid:'123456789012'});
const midHintNoHint=await detector.detect('PAYROC statement');
assert.ok(midHintMatch.score>=midHintNoHint.score);
assert.equal((await detector.detect('PAYROC statement',{mid:'SQUAREMIDABC'})).processorId,'payroc');

const rpMatch=await detector.detect('Worldpay merchant statement');
assert.equal(rpMatch.rulePack.manifest.id,'worldpay');
const rpFallback=await detector.detect('Unknown merchant statement XYZ');
assert.equal(rpFallback.rulePack.manifest.id,'generic');

assert.equal(typeof CONFIDENCE_THRESHOLD,'number');
assert.ok(CONFIDENCE_THRESHOLD>0&&CONFIDENCE_THRESHOLD<1);
assert.equal((await detectProcessor('PAYROC merchant statement',{detector})).name,'Payroc');
assert.equal((await detectProcessor('unbranded statement',{detector})).name,'Unknown processor');

console.log('Sprint 4.3 Processor Rule Pack Framework regression tests passed.');
