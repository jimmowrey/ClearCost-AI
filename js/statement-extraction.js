const clean = value => String(value ?? '').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const normalize = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export const SECTION_TYPES = Object.freeze({
  HEADER:'header', MERCHANT:'merchant_information', SUMMARY:'processing_summary',
  DEPOSITS:'deposit_summary', INTERCHANGE:'interchange_detail', ASSESSMENTS:'assessment_detail',
  FEES:'processor_fees', MONTHLY:'monthly_fees', EQUIPMENT:'equipment_fees',
  CHARGEBACKS:'chargebacks', ADJUSTMENTS:'adjustments', MESSAGES:'messages', UNKNOWN:'unclassified'
});

const sectionRules = [
  [SECTION_TYPES.INTERCHANGE, /\b(interchange|qualification|card type detail|discount detail)\b/i],
  [SECTION_TYPES.ASSESSMENTS, /\b(assessment|network fee|card brand fee|dues and assessments)\b/i],
  [SECTION_TYPES.DEPOSITS, /\b(deposit summary|funding summary|batch summary|deposits?)\b/i],
  [SECTION_TYPES.CHARGEBACKS, /\b(chargebacks?|retrievals?|disputes?)\b/i],
  [SECTION_TYPES.ADJUSTMENTS, /\b(adjustments?|corrections?)\b/i],
  [SECTION_TYPES.EQUIPMENT, /\b(equipment|terminal|device rental|lease)\b/i],
  [SECTION_TYPES.MONTHLY, /\b(monthly fees?|account fees?|service fees?)\b/i],
  [SECTION_TYPES.FEES, /\b(fees? charged|other fees?|processing fees?|service charges?)\b/i],
  [SECTION_TYPES.SUMMARY, /\b(processing summary|sales summary|activity summary|monthly summary|card summary)\b/i],
  [SECTION_TYPES.MERCHANT, /\b(merchant information|account information|merchant details)\b/i],
  [SECTION_TYPES.MESSAGES, /\b(messages?|important information|news for you|notifications?)\b/i]
];

export function classifySectionHeading(line=''){
  const value=clean(line);
  if(!value || value.length>90) return null;
  for(const [type,pattern] of sectionRules) if(pattern.test(value)) return type;
  return null;
}

export function segmentPage(text='',pageNumber=1){
  const lines=String(text).split(/\r?\n/).map(clean).filter(Boolean);
  const sections=[];
  let current={type:SECTION_TYPES.HEADER,heading:'Document header',page:pageNumber,startLine:1,lines:[]};
  const flush=endLine=>{if(current.lines.length){current.endLine=endLine;current.rawText=current.lines.join('\n');current.confidence=current.type===SECTION_TYPES.HEADER?0.7:0.9;sections.push(current);}};
  lines.forEach((line,index)=>{
    const type=classifySectionHeading(line);
    if(type){flush(index);current={type,heading:line,page:pageNumber,startLine:index+1,lines:[line]};}
    else current.lines.push(line);
  });
  flush(lines.length);
  if(!sections.length && lines.length) sections.push({type:SECTION_TYPES.UNKNOWN,heading:'Unclassified page content',page:pageNumber,startLine:1,endLine:lines.length,lines,rawText:lines.join('\n'),confidence:0.35});
  return sections;
}

function firstMatch(text,patterns){
  for(const {pattern,value=(m)=>m[1],confidence=0.9} of patterns){const match=String(text).match(pattern);if(match)return {value:clean(value(match)),confidence,rawText:clean(match[0])};}
  return null;
}
function provenance(field,match,page=1){return match?{field,value:match.value,page,rawText:match.rawText,confidence:match.confidence}:null;}

export function extractMetadataFromPages(pages=[]){
  const pageTexts=pages.map(p=>({page:p.index||p.page||1,text:p.text||''}));
  const joined=pageTexts.map(p=>p.text).join('\n');
  const findWithPage=(patterns)=>{for(const p of pageTexts){const m=firstMatch(p.text,patterns);if(m)return {m,page:p.page};}const m=firstMatch(joined,patterns);return m?{m,page:1}:null;};
  const merchant=findWithPage([
    {pattern:/(?:merchant|business|dba|doing business as)\s*(?:name)?\s*[:#-]\s*([^\n]{2,80})/i,confidence:.96},
    {pattern:/\bmerchant information\b[\s\S]{0,120}\n([^\n]{2,80})/i,confidence:.65}
  ]);
  const mid=findWithPage([{pattern:/(?:merchant\s*(?:id|number)|mid|merchant\s*#)\s*[:#-]?\s*([A-Z0-9-]{6,24})/i,confidence:.98}]);
  const tid=findWithPage([{pattern:/(?:terminal\s*(?:id|number)|tid|terminal\s*#)\s*[:#-]?\s*([A-Z0-9-]{3,24})/i,confidence:.95}]);
  const address=findWithPage([{pattern:/(\d{1,6}\s+[A-Za-z0-9 .'-]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|highway|hwy)[^\n]{0,80})/i,confidence:.75}]);
  const period=findWithPage([
    {pattern:/(?:statement|processing)\s*(?:period|dates?)\s*[:#-]?\s*([^\n]{5,90})/i,confidence:.96},
    {pattern:/\b((?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-]20\d{2}\s*(?:to|through|-)\s*(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-]20\d{2})\b/i,confidence:.92}
  ]);
  const phone=findWithPage([{pattern:/\b(\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4})\b/,confidence:.7}]);
  return {
    merchantName:provenance('merchant_name',merchant?.m,merchant?.page),
    merchantId:provenance('merchant_id',mid?.m,mid?.page),
    terminalId:provenance('terminal_id',tid?.m,tid?.page),
    statementPeriod:provenance('statement_period',period?.m,period?.page),
    address:provenance('address',address?.m,address?.page),
    phone:provenance('phone',phone?.m,phone?.page)
  };
}

const processorRules=[
  {name:'Payroc',patterns:[[/\bpayroc\b/i,60],[/\bsignapay\b/i,25],[/\bmerchant portal.*payroc\b/i,20]]},
  {name:'Fiserv / First Data',patterns:[[/\bfiserv\b/i,55],[/\bfirst data\b/i,50],[/\bcardpointe\b/i,15],[/\bclover\b/i,15]]},
  {name:'TSYS',patterns:[[/\btsys\b/i,60],[/\btotal system services\b/i,55],[/\bmerchant insights\b/i,10]]},
  {name:'Worldpay',patterns:[[/\bworldpay\b/i,60],[/\bfis global\b/i,20],[/\bvantiv\b/i,35]]},
  {name:'Elavon',patterns:[[/\belavon\b/i,60],[/\bconverge\b/i,15]]},
  {name:'Global Payments',patterns:[[/\bglobal payments\b/i,60],[/\bheartland payment systems\b/i,45]]},
  {name:'Square',patterns:[[/\bsquare(?:up)?\b/i,60],[/\bblock inc\b/i,15]]},
  {name:'Stripe',patterns:[[/\bstripe\b/i,60]]}
];
export function detectProcessor(text=''){
  const evidence=[];let best={name:'Unknown processor',score:0};
  for(const rule of processorRules){let score=0;const hits=[];for(const [pattern,weight] of rule.patterns){const match=String(text).match(pattern);if(match){score+=weight;hits.push(match[0]);}}if(score>best.score)best={name:rule.name,score};if(hits.length)evidence.push({processor:rule.name,score,hits});}
  const confidence=Math.min(best.score/60,1);
  return {name:best.name,confidence:Number(confidence.toFixed(2)),score:best.score,evidence:evidence.sort((a,b)=>b.score-a.score)};
}

export function extractFeeCandidates(sections=[]){
  const feeTypes=new Set([SECTION_TYPES.INTERCHANGE,SECTION_TYPES.ASSESSMENTS,SECTION_TYPES.FEES,SECTION_TYPES.MONTHLY,SECTION_TYPES.EQUIPMENT,SECTION_TYPES.CHARGEBACKS,SECTION_TYPES.ADJUSTMENTS]);
  const amountPattern=/(?:\$\s*)?(-?\d{1,3}(?:,\d{3})*\.\d{2})\s*$/;
  const candidates=[];
  for(const section of sections.filter(s=>feeTypes.has(s.type))){
    section.lines.forEach((line,index)=>{const match=line.match(amountPattern);if(!match)return;const amount=Number(match[1].replace(/,/g,''));const description=clean(line.slice(0,match.index));if(!description||Number.isNaN(amount))return;candidates.push({originalDescription:description,amount,page:section.page,line:section.startLine+index,section:section.type,rawText:line,confidence:description.length>2?.82:.55,status:'unclassified'});});
  }
  return candidates;
}

export function buildStatementExtraction(record){
  const pages=record.pages||[];
  const sections=pages.flatMap(p=>segmentPage(p.text,p.index));
  const metadata=extractMetadataFromPages(pages);
  const joined=pages.map(p=>p.text).join('\n');
  const processor=detectProcessor(joined);
  const fees=extractFeeCandidates(sections);
  const counts=sections.reduce((acc,s)=>{acc[s.type]=(acc[s.type]||0)+1;return acc;},{});
  return {schemaVersion:'4.1',sourceFile:record.name,pageCount:record.pageCount,metadata,processor,sections,sectionCounts:counts,feeCandidates:fees,extractionLog:[...Object.values(metadata).filter(Boolean),...fees.map(f=>({field:'fee_candidate',value:f.amount,page:f.page,line:f.line,rawText:f.rawText,confidence:f.confidence}))]};
}
