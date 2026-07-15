import {ProcessorRuleLoader} from './processor-rule-loader.js';

export const CONFIDENCE_THRESHOLD=0.5;
export const EVIDENCE_TYPES=Object.freeze({LOGO:'logo',WORDING:'wording',LAYOUT:'layout',SECTION:'section_heading',ALIAS:'alias',MID:'mid_format'});

const clean=value=>String(value??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const linesFromText=text=>String(text).split(/\r?\n/).map(clean).filter(Boolean);
const createRegExp=({pattern,flags='i'})=>new RegExp(pattern,flags);

export class ProcessorDetector{
  #loader;

  constructor(loader=new ProcessorRuleLoader()){
    this.#loader=loader;
  }

  async detect(text='',opts={}){
    const fullText=String(text);
    const lines=Array.isArray(opts.lines)&&opts.lines.length?opts.lines.map(clean).filter(Boolean):linesFromText(fullText);
    const logoText=Array.isArray(opts.logoText)
      ?opts.logoText.map(clean).filter(Boolean).join('\n')
      :clean(opts.logoText||'');
    const installedIds=(await this.#loader.getInstalledPacks()).filter(id=>id!=='common'&&id!=='generic');
    const allEvidence=[];
    const results=[];

    for(const packId of installedIds){
      let pack;
      try{pack=await this.#loader.loadRulePack(packId);}catch{continue;}
      const {behaviors,layout,aliases,sections,manifest}=pack;
      const threshold=manifest.confidenceThreshold??CONFIDENCE_THRESHOLD;
      const normBase=manifest.normalizationBase||60;
      let score=0;
      const evidence=[];

      if(Array.isArray(behaviors?.detectionPatterns)){
        for(const dp of behaviors.detectionPatterns){
          const type=dp.type||EVIDENCE_TYPES.WORDING;
          const re=createRegExp(dp);
          const scope=type===EVIDENCE_TYPES.LOGO&&logoText?logoText:fullText;
          const match=scope.match(re);
          if(match){
            score+=dp.weight||0;
            evidence.push({type,pattern:dp.pattern,match:match[0],weight:dp.weight||0,source:type===EVIDENCE_TYPES.LOGO&&logoText?'logo_text':'behaviors'});
          }
        }
      }

      if(Array.isArray(layout?.fingerprints)){
        for(const fp of layout.fingerprints){
          const re=createRegExp(fp);
          const match=fullText.match(re);
          if(match){
            score+=fp.weight||0;
            evidence.push({type:EVIDENCE_TYPES.LAYOUT,pattern:fp.pattern,match:match[0],weight:fp.weight||0,source:'layout'});
          }
        }
      }

      if(Array.isArray(sections?.headings)){
        for(const heading of sections.headings){
          const re=createRegExp(heading);
          const matchLine=lines.find(line=>re.test(line));
          if(matchLine){
            const weight=heading.weight??12;
            score+=weight;
            evidence.push({type:EVIDENCE_TYPES.SECTION,pattern:heading.pattern,match:matchLine,sectionType:heading.type,weight,source:'sections'});
          }
        }
      }

      if(Array.isArray(aliases?.feeAliases)){
        for(const alias of aliases.feeAliases){
          if(alias.alias&&fullText.toLowerCase().includes(alias.alias.toLowerCase())){
            const weight=alias.weight??5;
            score+=weight;
            evidence.push({type:EVIDENCE_TYPES.ALIAS,alias:alias.alias,canonicalId:alias.canonicalId,weight,source:'aliases'});
          }
        }
      }

      if(behaviors?.midFormat&&opts.mid){
        const re=new RegExp(behaviors.midFormat);
        if(re.test(String(opts.mid))){
          score+=5;
          evidence.push({type:EVIDENCE_TYPES.MID,pattern:behaviors.midFormat,match:String(opts.mid),weight:5,source:'behaviors'});
        }
      }

      const confidence=Number(Math.min(score/normBase,1).toFixed(2));
      const result={processorId:packId,name:manifest.name,score,confidence,threshold,evidence};
      results.push(result);
      if(evidence.length) allEvidence.push({processor:manifest.name,processorId:packId,score,confidence,evidence});
    }

    results.sort((a,b)=>b.score-a.score||a.processorId.localeCompare(b.processorId));
    const best=results[0]?.score>0?results[0]:null;
    if(!best||best.confidence<(best?.threshold??CONFIDENCE_THRESHOLD)){
      const genericPack=await this.#loader.loadRulePack('generic');
      return {
        processor:genericPack.manifest.name,
        detectedProcessor:best?.name||'Unknown processor',
        processorId:'generic',
        detectedProcessorId:best?.processorId||null,
        confidence:best?.confidence??0,
        score:best?.score??0,
        threshold:best?.threshold??CONFIDENCE_THRESHOLD,
        strongestCandidate:best?{processor:best.name,processorId:best.processorId,confidence:best.confidence,score:best.score,threshold:best.threshold}:null,
        evidence:allEvidence,
        rulePack:genericPack,
        requiresReview:true,
        fallback:true,
        fallbackReason:best
          ?`Best candidate '${best.name}' confidence ${best.confidence} is below threshold ${best.threshold}`
          :'No processor pack matched any evidence'
      };
    }

    const winnerPack=await this.#loader.loadRulePack(best.processorId);
    return {
      processor:best.name,
      detectedProcessor:best.name,
      processorId:best.processorId,
      detectedProcessorId:best.processorId,
      confidence:best.confidence,
      score:best.score,
      threshold:best.threshold,
      strongestCandidate:{processor:best.name,processorId:best.processorId,confidence:best.confidence,score:best.score,threshold:best.threshold},
      evidence:allEvidence,
      rulePack:winnerPack,
      requiresReview:false,
      fallback:false
    };
  }
}

export default ProcessorDetector;
