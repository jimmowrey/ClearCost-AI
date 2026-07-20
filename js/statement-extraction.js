import {classifyFeeCandidates,summarizeFees} from './fee-intelligence.js';
import {ProcessorRuleLoader} from './processor-rule-loader.js';
import {ProcessorDetector} from './processor-detector.js';
const clean = value => String(value ?? '').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const normalize = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const defaultProcessorDetector=new ProcessorDetector(new ProcessorRuleLoader());

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

export async function detectProcessor(text='',options={}){
  const detector=options.detector||defaultProcessorDetector;
  const result=await detector.detect(text,{mid:options.mid,lines:options.lines,logoText:options.logoText});
  return {
    name:result.processor,
    processorId:result.processorId,
    detectedName:result.detectedProcessor||result.processor,
    detectedProcessorId:result.detectedProcessorId||result.processorId||null,
    confidence:result.confidence,
    score:result.score,
    threshold:result.threshold,
    evidence:result.evidence,
    fallback:result.fallback,
    fallbackStatus:result.fallback?'fallback':'confirmed',
    requiresReview:!!result.requiresReview,
    fallbackReason:result.fallbackReason||null,
    strongestCandidate:result.strongestCandidate||null,
    rulePack:result.rulePack?.manifest?.name||null,
    rulePackId:result.rulePack?.manifest?.id||null,
    rulePackVersion:result.rulePack?.manifest?.version||null
  };
}

export function extractFeeCandidates(sections=[]){
  const feeTypes=new Set([
    SECTION_TYPES.INTERCHANGE,
    SECTION_TYPES.ASSESSMENTS,
    SECTION_TYPES.FEES,
    SECTION_TYPES.MONTHLY,
    SECTION_TYPES.EQUIPMENT,
    SECTION_TYPES.CHARGEBACKS,
    SECTION_TYPES.ADJUSTMENTS
  ]);

  const amountPattern=/(?:\$\s*)?(-?\d{1,3}(?:,\d{3})*\.\d{2})\s*$/;
  const formulaPattern=/\b(?:times|disc(?:ount)?\s+rate\s+times|transactions?\s+at|x\s+trns)\b/i;
  const feeKeywordPattern=/\b(?:fee|assessment|discount|interchange|dues|avs|acquirer|license|monthly|equipment|chargeback|retrieval|adjustment)\b/i;

  const candidates=[];

  for(const section of sections.filter(s=>feeTypes.has(s.type))){
    const consumed=new Set();

    for(let index=0;index<section.lines.length;index++){
      if(consumed.has(index)) continue;

      const line=clean(section.lines[index]);
      if(!line) continue;

      // Reconstruct processor fee rows that PDF extraction split
      // across multiple text lines.
      if(formulaPattern.test(line) && feeKeywordPattern.test(line)){
        const rowLines=[line];
        const monetaryValues=[];

        const firstAmount=line.match(amountPattern);
        if(firstAmount){
          monetaryValues.push({
            index,
            amount:Number(firstAmount[1].replace(/,/g,''))
          });
        }

        // Fiserv and similar layouts frequently split one fee row
        // across the next several PDF text lines.
        for(let offset=1;offset<=4;offset++){
          const nextIndex=index+offset;
          if(nextIndex>=section.lines.length) break;

          const nextLine=clean(section.lines[nextIndex]);
          if(!nextLine) continue;

          // Stop if another clear fee description begins.
          if(
            offset>1 &&
            feeKeywordPattern.test(nextLine) &&
            formulaPattern.test(nextLine)
          ){
            break;
          }

          rowLines.push(nextLine);

          const amountMatch=nextLine.match(amountPattern);
          if(amountMatch){
            monetaryValues.push({
              index:nextIndex,
              amount:Number(amountMatch[1].replace(/,/g,''))
            });
          }
        }

        // Formula rows commonly contain a calculation basis followed
        // by the actual charged fee. Use the last monetary value found.
        if(monetaryValues.length>=2){
          const reconstructedText=rowLines.join(' ');
          
let calculatedAmount=null;

// Handles PDF splits such as:
// 0.0014 TIMES $8 400.05  -> $8,400.05 × 0.0014
const splitVolumeFormula=reconstructedText.match(
  /(\d*\.?\d+)\s+(?:disc(?:ount)?\s+rate\s+)?times\s+\$\s*(\d{1,3})\s+(\d{3}\.\d{2})/i
);

if(splitVolumeFormula){
  const rate=Number(splitVolumeFormula[1]);
  const volume=Number(`${splitVolumeFormula[2]}${splitVolumeFormula[3]}`);
  calculatedAmount=Math.round(rate*volume*100)/100;
}

// Handles formulas already extracted intact:
// 0.00165 TIMES $311.79
if(calculatedAmount===null){
  const volumeFormula=reconstructedText.match(
    /(\d*\.?\d+)\s+(?:disc(?:ount)?\s+rate\s+)?times\s+\$\s*([\d,]+\.\d{2})/i
  );

  if(volumeFormula){
    const rate=Number(volumeFormula[1]);
    const volume=Number(volumeFormula[2].replace(/,/g,''));
    calculatedAmount=Math.round(rate*volume*100)/100;
  }
}

// Handles transaction formulas:
// 13 TRANSACTIONS AT 0.01
if(calculatedAmount===null){
  const transactionFormula=reconstructedText.match(
    /(\d+)\s+(?:transactions?|trns)\s+at\s+\$?\s*(\d*\.?\d+)/i
  );

  if(transactionFormula){
    const count=Number(transactionFormula[1]);
    const unitFee=Number(transactionFormula[2]);
    calculatedAmount=Math.round(count*unitFee*100)/100;
  }
}

const actualFee=
  calculatedAmount!==null
    ? {index:monetaryValues[monetaryValues.length-1].index,amount:calculatedAmount}
    : monetaryValues[monetaryValues.length-1];

          candidates.push({
            originalDescription:line,
            amount:actualFee.amount,
            page:section.page,
            line:section.startLine+index,
            section:section.type,
            rawText:rowLines.join(' '),
            confidence:.9,
            status:'unclassified',
            extractionMethod:'reconstructed_formula_row'
          });

          // Prevent continuation amounts from becoming duplicate candidates.
          for(let i=index;i<=actualFee.index;i++){
            consumed.add(i);
          }

          continue;
        }
      }

      // Standard single-line fee extraction.
      const match=line.match(amountPattern);
      if(!match) continue;

      const amount=Number(match[1].replace(/,/g,''));
      const description=clean(line.slice(0,match.index));

      if(!description || Number.isNaN(amount)) continue;
      // Formula-style rows must be resolved by row reconstruction.
// Never treat their trailing calculation basis as the charged fee.
if(formulaPattern.test(description)) continue;

      // Bare numeric lines are not independently trustworthy fee rows.
      if(!feeKeywordPattern.test(description)) continue;

      candidates.push({
        originalDescription:description,
        amount,
        page:section.page,
        line:section.startLine+index,
        section:section.type,
        rawText:line,
        confidence:description.length>2?.82:.55,
        status:'unclassified',
        extractionMethod:'single_line_fee'
      });
    }
  }

  return candidates;
}
export async function buildStatementExtraction(record,options={}){
  const pages=record.pages||[];
  const sections=pages.flatMap(p=>segmentPage(p.text,p.index));
  const metadata=extractMetadataFromPages(pages);
  const joined=pages.map(p=>p.text).join('\n');
  const logoText=record.logoText||pages.map(p=>p.logoText).filter(Boolean).join('\n');
  const processor=await detectProcessor(joined,{detector:options.detector,mid:metadata.merchantId?.value,lines:pages.flatMap(p=>String(p.text||'').split(/\r?\n/)),logoText});
  const feeCandidates=extractFeeCandidates(sections);
  const fees=classifyFeeCandidates(feeCandidates,{processor:processor.name});
  const feeSummary=summarizeFees(fees);
  const counts=sections.reduce((acc,s)=>{acc[s.type]=(acc[s.type]||0)+1;return acc;},{});
  const processorLog=processor.evidence.flatMap(item=>item.evidence.map(evidence=>({field:'processor_detection',value:item.processor,page:1,rawText:evidence.match||evidence.alias||evidence.pattern,confidence:item.confidence,source:evidence.source,type:evidence.type,weight:evidence.weight,processorId:item.processorId})));
  return {schemaVersion:'4.4',sourceFile:record.name,pageCount:record.pageCount,metadata,processor,sections,sectionCounts:counts,feeCandidates:fees,feeSummary,unknownFees:fees.filter(f=>f.status==='needs_review'),extractionLog:[...Object.values(metadata).filter(Boolean),...processorLog,...fees.map(f=>({field:'fee_candidate',value:f.amount,page:f.page,line:f.line,rawText:f.rawText,confidence:f.confidence}))]};
}
