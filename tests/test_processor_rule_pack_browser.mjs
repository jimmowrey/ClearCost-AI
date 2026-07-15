import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {ProcessorRuleLoader} from '../js/processor-rule-loader.js';
import {ProcessorDetector} from '../js/processor-detector.js';
import {buildStatementExtraction} from '../js/statement-extraction.js';

const repoRoot='/home/runner/work/ClearCost-AI/ClearCost-AI';
const contentTypes={'.json':'application/json','.js':'text/javascript','.html':'text/html','.css':'text/css'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=normalize(decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)).replace(/^\/+/, '');
    const filePath=join(repoRoot,pathname||'index.html');
    const body=await readFile(filePath);
    res.writeHead(200,{'content-type':contentTypes[extname(filePath)]||'application/octet-stream'});
    res.end(body);
  }catch{
    res.writeHead(404,{'content-type':'text/plain'});
    res.end('not found');
  }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();

try{
  const loader=new ProcessorRuleLoader({indexUrl:`http://127.0.0.1:${port}/processors/index.json`,baseUrl:`http://127.0.0.1:${port}/processors/`});
  const detector=new ProcessorDetector(loader);
  const packs=await loader.getInstalledPacks();
  assert.ok(packs.includes('worldpay'));
  const pack=await loader.loadRulePack('worldpay');
  assert.equal(pack.manifest.id,'worldpay');
  const detection=await detector.detect('Worldpay\nMerchant ID: 987654321\nWorldpay Fees\nWorldpay Monthly Service Fee 29.99',{mid:'987654321'});
  assert.equal(detection.processorId,'worldpay');
  assert.ok(!detection.fallback);
  const extraction=await buildStatementExtraction({name:'browser-sample.pdf',pageCount:1,pages:[{index:1,text:'Worldpay\nMerchant Name: Browser Shop\nMerchant ID: 987654321\nWorldpay Fees\nWorldpay Monthly Service Fee 29.99'}]},{detector});
  assert.equal(extraction.processor.name,'Worldpay');
  assert.equal(extraction.processor.rulePackId,'worldpay');
  assert.ok(extraction.processor.evidence.length>0);
  assert.ok(extraction.extractionLog.some(entry=>entry.field==='processor_detection'));
  const fallback=await buildStatementExtraction({name:'unknown.pdf',pageCount:1,pages:[{index:1,text:'Merchant Statement\nMerchant Name: Unknown Shop\nMerchant ID: ABC123'}]},{detector});
  assert.equal(fallback.processor.rulePackId,'generic');
  assert.equal(fallback.processor.name,'Unknown processor');
  assert.ok(fallback.processor.fallback);
  console.log('Sprint 4.3 browser integration regression tests passed.');
} finally {
  await new Promise(resolve=>server.close(resolve));
}
