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
  [SECTION_TYPES.INTERCHANGE, /\b(interchange|qualification|card type detail|discount detail|interchange\/program)\b/i],
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

export function extractFeeCandidates(sections=[],options={}){
  const processorId=options.processorId||null;
  const rulePackId=options.rulePackId||null;
    console.log('FEE EXTRACTION SECTIONS:', sections);
    console.log('INTERCHANGE SECTIONS:', sections.filter(s => s.type === SECTION_TYPES.INTERCHANGE));
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

  const formulaPattern=
    /\b(?:times|disc(?:ount)?\s+rate\s+times|transactions?\s+at|x\s+trns)\b/i;

  const feeKeywordPattern=
    /\b(?:fee|assessment|discount|interchange|dues|avs|acquirer|license|monthly|equipment|chargeback|retrieval|adjustment)\b/i;

  const salesDiscountPattern=
    /\b(?:VISA|MASTERCARD|DISCOVER)?\s*(?:DEBIT\s+)?SALES\s+(?:DISC|DISCOUNT)\b/i;

  const interchangeChargeLabelPattern=
    /^interchange charges?$/i;

  const candidates=[];

  /*
   * ============================================================
   * INTERCHANGE DETAIL ROW EXTRACTION
   * ============================================================
   *
   * North State Power Sports / Commerce Control statements
   * commonly extract interchange rows as:
   *
   *   VI-US REGULATED (DB)
   *   Interchange charges
   *   -$1.98
   *
   * The PDF text layer may not preserve all visible table columns.
   * We therefore capture every confirmed component we actually have
   * and explicitly preserve missing components as null.
   *
   * Never infer volume, transaction count, percentage rate, or
   * per-transaction interchange when the PDF extraction did not
   * provide those values.
   */
  const useCommerceControlInterchangeParser=
  processorId==='commerce_control' ||
  rulePackId==='commerce_control' ||
  sections.some(section=>
    section.type===SECTION_TYPES.INTERCHANGE &&
    section.heading==='Interchange/Program' &&
    section.lines.some(line=>clean(line)==='Product/Description') &&
    section.lines.some(line=>clean(line)==='Sub Total')
  );
  if(!useCommerceControlInterchangeParser){
  for(const section of sections.filter(
    s=>s.type===SECTION_TYPES.INTERCHANGE
  )){
    const lines=section.lines.map(clean);

    for(let index=0;index<lines.length;index++){
      const description=lines[index];

      if(!description) continue;

      const nextLine=clean(lines[index+1]||'');
      const amountLine=clean(lines[index+2]||'');

      if(
        interchangeChargeLabelPattern.test(nextLine) &&
        amountPattern.test(amountLine)
      ){
        const amountMatch=amountLine.match(amountPattern);

        if(!amountMatch) continue;

        const amount=Math.abs(
          Number(amountMatch[1].replace(/,/g,''))
        );

        /*
         * Ignore obvious headings as interchange descriptions.
         */
        if(
          /^interchange charges?$/i.test(description) ||
          /^visa$/i.test(description) ||
          /^mastercard$/i.test(description) ||
          /^discover$/i.test(description)
        ){
          continue;
        }

        candidates.push({
          originalDescription:description,
          amount,
          page:section.page,
          line:section.startLine+index,
          section:section.type,

          rawText:[
            description,
            nextLine,
            amountLine
          ].join(' '),

          confidence:.96,
          status:'unclassified',

          extractionMethod:'interchange_description_charge_pair',

          /*
           * Preserve interchange components separately.
           *
           * These remain null unless they are explicitly present
           * in the extracted PDF text. Do not estimate them.
           */
          interchangeDetails:{
            description,
            volume:null,
            transactionCount:null,
            percentRate:null,
            perTransactionRate:null,
            interchangeCharge:amount
          }
        });

        /*
         * Skip the "Interchange charges" label and amount because
         * they have now been consumed as part of this row.
         */
        index+=2;
      }
    }
  }
}

if(useCommerceControlInterchangeParser){
  for(const section of sections.filter(
    s=>s.type===SECTION_TYPES.INTERCHANGE
  )){
    const lines=section.lines.map(clean);

    for(let index=0;index<=lines.length-8;index++){
      const description=lines[index];
      const volumeLine=lines[index+1];
      const salesPercentLine=lines[index+2];
      const transactionCountLine=lines[index+3];
      const transactionPercentLine=lines[index+4];
      const percentRateLine=lines[index+5];
      const perTransactionRateLine=lines[index+6];
      const chargeLine=lines[index+7];

      const volumeMatch=volumeLine.match(/^\$([\d,]+\.\d{2})$/);
      const chargeMatch=chargeLine.match(/^(-?)\$?([\d,]+\.\d{2})$/);
const isTotalRow=/\bTOTAL\b/i.test(description);
      const isDetailRow=
        description &&
        !isTotalRow &&
        volumeMatch &&
        /^\d+(?:\.\d+)?%$/.test(salesPercentLine) &&
        /^\d+$/.test(transactionCountLine) &&
        /^\d+(?:\.\d+)?%$/.test(transactionPercentLine) &&
        /^\d*\.?\d+$/.test(percentRateLine) &&
        /^\$?\d*\.?\d{3}$/.test(perTransactionRateLine) &&
        chargeMatch;

      if(!isDetailRow) continue;

      const volume=Number(
        volumeMatch[1].replace(/,/g,'')
      );

      const printedCharge=
        (chargeMatch[1]==='-' ? -1 : 1) *
        Number(chargeMatch[2].replace(/,/g,''));

     console.log(
  'COMMERCE CONTROL IC ROW:',
  {
    description,
    volume,
    printedCharge,
    feeAmount:-printedCharge,
    page:section.page
  }
);

if(printedCharge>0){
  console.log(
    'COMMERCE CONTROL IC CREDIT:',
    {
      description,
      printedCharge,
      feeAmount:-printedCharge,
      page:section.page
    }
  );
}

candidates.push({
        amount:-printedCharge,
        page:section.page,
        line:section.startLine+index,
        section:section.type,
        rawText:lines.slice(index,index+8).join(' '),
        confidence:.99,
        status:'unclassified',
        extractionMethod:'commerce_control_interchange_table_row',
        interchangeDetails:{
          description,
          volume,
          transactionCount:Number(transactionCountLine),
          percentRate:Number(percentRateLine),
          perTransactionRate:Number(
            perTransactionRateLine.replace('$','')
          ),
          interchangeCharge:-printedCharge
        }
      });

      index+=7;
    }
  }
}
  /*
   * ============================================================
   * NON-INTERCHANGE FEE EXTRACTION
   * ============================================================
   */

  for(const section of sections.filter(
    s=>feeTypes.has(s.type) &&
       s.type!==SECTION_TYPES.INTERCHANGE
  )){
    const consumed=new Set();

    for(let index=0;index<section.lines.length;index++){
      if(consumed.has(index)) continue;

      const line=clean(section.lines[index]);

      if(!line) continue;

      /*
       * ----------------------------------------------------------
       * Reconstruct formula-based fee rows split across PDF lines.
       * ----------------------------------------------------------
       */

      if(formulaPattern.test(line) && feeKeywordPattern.test(line)){
        const rowLines=[line];
        const monetaryValues=[];

        const firstAmount=line.match(amountPattern);

        if(firstAmount){
          monetaryValues.push({
            index,
            amount:Number(
              firstAmount[1].replace(/,/g,'')
            )
          });
        }

        /*
         * Processor statements frequently split one logical fee
         * row across the next several extracted text lines.
         */
        for(let offset=1;offset<=4;offset++){
          const nextIndex=index+offset;

          if(nextIndex>=section.lines.length) break;

          const nextLine=clean(
            section.lines[nextIndex]
          );

          if(!nextLine) continue;

          /*
           * Stop when another clear formula fee begins.
           */
          if(
            offset>1 &&
            feeKeywordPattern.test(nextLine) &&
            formulaPattern.test(nextLine)
          ){
            break;
          }

          rowLines.push(nextLine);

          const amountMatch=
            nextLine.match(amountPattern);

          if(amountMatch){
            monetaryValues.push({
              index:nextIndex,
              amount:Number(
                amountMatch[1].replace(/,/g,'')
              )
            });
          }
        }

        const reconstructedText=
          rowLines.join(' ');

        /*
         * Explicit charged amount.
         *
         * Example:
         * Fees -$0.65
         * Service charges -$19.10
         * Program Fees -$4.52
         */
        const explicitChargedFeeMatch=
          reconstructedText.match(
            /(?:Program Fees|Service charges|Fees)\s+(-?\$\s*[\d,]+\.\d{2})/i
          );

        const explicitChargedFee=
          explicitChargedFeeMatch
            ? Number(
                explicitChargedFeeMatch[1]
                  .replace(/\$/g,'')
                  .replace(/,/g,'')
                  .replace(/\s/g,'')
              )
            : null;

        let calculatedAmount=null;

        /*
         * --------------------------------------------------------
         * Volume formula split by PDF extraction.
         *
         * Example:
         * 0.0014 TIMES $8 400.05
         * becomes:
         * $8,400.05 × 0.0014
         * --------------------------------------------------------
         */

        const splitVolumeFormula=
          reconstructedText.match(
            /(\d*\.?\d+)\s+(?:disc(?:ount)?\s+rate\s+)?times\s+\$\s*(\d{1,3})\s+(\d{3}\.\d{2})/i
          );

        if(splitVolumeFormula){
          const rate=
            Number(splitVolumeFormula[1]);

          const volume=
            Number(
              `${splitVolumeFormula[2]}${splitVolumeFormula[3]}`
            );

          calculatedAmount=
            Math.round(
              rate*volume*100
            )/100;
        }

        /*
         * --------------------------------------------------------
         * Standard intact volume formula.
         *
         * Example:
         * 0.0014 TIMES $22640.35
         * --------------------------------------------------------
         */

        if(calculatedAmount===null){
          const volumeFormula=
            reconstructedText.match(
              /(\d*\.?\d+)\s+(?:disc(?:ount)?\s+rate\s+)?times\s+\$\s*([\d,]+\.\d{2})/i
            );

          if(volumeFormula){
            const rate=
              Number(volumeFormula[1]);

            const volume=
              Number(
                volumeFormula[2]
                  .replace(/,/g,'')
              );

            calculatedAmount=
              Math.round(
                rate*volume*100
              )/100;
          }
        }

        /*
         * --------------------------------------------------------
         * Transaction fee formula.
         *
         * Example:
         * 42 TRANSACTIONS AT 0.0155
         * --------------------------------------------------------
         */

        if(calculatedAmount===null){
          const transactionFormula=
            reconstructedText.match(
              /(\d+)\s+(?:transactions?|trns)\s+at\s+\$?\s*(\d*\.?\d+)/i
            );

          if(transactionFormula){
            const count=
              Number(transactionFormula[1]);

            const unitFee=
              Number(transactionFormula[2]);

            calculatedAmount=
              Math.round(
                count*unitFee*100
              )/100;
          }
        }

        /*
         * Prefer an explicitly printed charged amount.
         * Otherwise use the verified formula calculation.
         * Otherwise use the final extracted monetary value.
         */

        let actualFee=null;

        if(explicitChargedFee!==null){
          actualFee={
            index:
              monetaryValues.length
                ? monetaryValues[
                    monetaryValues.length-1
                  ].index
                : index,

            amount:
              Math.abs(explicitChargedFee)
          };
        }
        else if(calculatedAmount!==null){
          actualFee={
            index:
              monetaryValues.length
                ? monetaryValues[
                    monetaryValues.length-1
                  ].index
                : index,

            amount:
              calculatedAmount
          };
        }
        else if(monetaryValues.length){
          actualFee=
            monetaryValues[
              monetaryValues.length-1
            ];
        }

        if(actualFee){
          const isSalesDiscount=
            salesDiscountPattern.test(line);

          candidates.push({
            originalDescription:line,

            amount:
              Math.abs(actualFee.amount),

            page:section.page,

            line:
              section.startLine+index,

            section:section.type,

            rawText:
              reconstructedText,

            confidence:
              explicitChargedFee!==null
                ? .98
                : calculatedAmount!==null
                  ? .92
                  : .75,

            status:
              isSalesDiscount
                ? 'needs_review'
                : 'unclassified',

            extractionMethod:
              explicitChargedFee!==null
                ? 'reconstructed_explicit_charge'
                : calculatedAmount!==null
                  ? 'reconstructed_formula_calculation'
                  : 'reconstructed_formula_row',

            /*
             * Sales Discount is deliberately NOT interpreted here.
             * We know the line and amount exist, but its economic
             * meaning remains unresolved.
             */
            requiresManualReview:
              isSalesDiscount,

            reviewReason:
              isSalesDiscount
                ? 'Sales Discount meaning not yet confirmed'
                : null
          });

          /*
           * Prevent continuation lines from becoming duplicate fees.
           */
          for(
            let i=index;
            i<=actualFee.index;
            i++
          ){
            consumed.add(i);
          }

          continue;
        }
      }

      /*
       * ----------------------------------------------------------
       * Standard single-line fee extraction.
       * ----------------------------------------------------------
       */

      const match=
        line.match(amountPattern);

      if(!match) continue;

      const amount=
        Number(
          match[1].replace(/,/g,'')
        );

      const description=
        clean(
          line.slice(
            0,
            match.index
          )
        );

      if(
        !description ||
        Number.isNaN(amount)
      ){
        continue;
      }

      /*
       * Formula rows must be resolved above.
       * Never treat the calculation basis as the charged fee.
       */
      if(
        formulaPattern.test(description)
      ){
        continue;
      }

      /*
       * Bare numeric lines are not trustworthy standalone fees.
       */
      if(
        !feeKeywordPattern.test(description)
      ){
        continue;
      }

      const isSalesDiscount=
        salesDiscountPattern.test(description);

      candidates.push({
        originalDescription:
          description,

        amount:
          Math.abs(amount),

        page:
          section.page,

        line:
          section.startLine+index,

        section:
          section.type,

        rawText:
          line,

        confidence:
          description.length>2
            ? .82
            : .55,

        status:
          isSalesDiscount
            ? 'needs_review'
            : 'unclassified',

        extractionMethod:
          'single_line_fee',

        requiresManualReview:
          isSalesDiscount,

        reviewReason:
          isSalesDiscount
            ? 'Sales Discount meaning not yet confirmed'
            : null
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
  const feeCandidates=extractFeeCandidates(sections,{
  processor:processor.name,
  processorId:processor.processorId,
  rulePackId:processor.rulePackId
});
  const fees=classifyFeeCandidates(feeCandidates,{processor:processor.name});
  const feeSummary=summarizeFees(fees);
  const counts=sections.reduce((acc,s)=>{acc[s.type]=(acc[s.type]||0)+1;return acc;},{});
  const processorLog=processor.evidence.flatMap(item=>item.evidence.map(evidence=>({field:'processor_detection',value:item.processor,page:1,rawText:evidence.match||evidence.alias||evidence.pattern,confidence:item.confidence,source:evidence.source,type:evidence.type,weight:evidence.weight,processorId:item.processorId})));
  return {schemaVersion:'4.4',sourceFile:record.name,pageCount:record.pageCount,metadata,processor,sections,sectionCounts:counts,feeCandidates:fees,feeSummary,unknownFees:fees.filter(f=>f.status==='needs_review'),extractionLog:[...Object.values(metadata).filter(Boolean),...processorLog,...fees.map(f=>({field:'fee_candidate',value:f.amount,page:f.page,line:f.line,rawText:f.rawText,confidence:f.confidence}))]};
}
