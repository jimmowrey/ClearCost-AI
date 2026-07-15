import {ProcessorRuleLoader} from './processor-rule-loader.js';

/** Minimum confidence score required to declare a processor detected. */
export const CONFIDENCE_THRESHOLD=0.5;

/** Evidence source types produced by detector. */
export const EVIDENCE_TYPES=Object.freeze({LOGO:'logo',WORDING:'wording',LAYOUT:'layout',ALIAS:'alias',MID:'mid_format'});

/**
 * ProcessorDetector discovers which payment processor issued a statement by
 * running weighted-evidence scoring against installed processor rule packs.
 *
 * If the best candidate scores below CONFIDENCE_THRESHOLD the Generic rule
 * pack is loaded, parsing continues, and all evidence is preserved.
 */
export class ProcessorDetector{
  #loader;

  /** @param {ProcessorRuleLoader} [loader] */
  constructor(loader){
    this.#loader=loader instanceof ProcessorRuleLoader?loader:new ProcessorRuleLoader();
  }

  /**
   * Detect the processor from statement text.
   *
   * @param {string} text   - Full concatenated statement text.
   * @param {object} [opts] - Optional hints: { mid?: string }
   * @returns {{
   *   processor: string,
   *   processorId: string,
   *   confidence: number,
   *   score: number,
   *   evidence: object[],
   *   rulePack: object,
   *   fallback: boolean,
   *   fallbackReason?: string
   * }}
   */
  detect(text='',opts={}){
    const fullText=String(text);
    const installedIds=this.#loader.getInstalledPacks().filter(id=>id!=='common'&&id!=='generic');
    const allEvidence=[];
    const results=[];

    for(const packId of installedIds){
      let pack;
      try{pack=this.#loader.loadRulePack(packId);}
      catch(e){continue;}

      const behaviors=pack.behaviors;
      const layout=pack.layout;
      const aliases=pack.aliases;
      const manifest=pack.manifest;
      const normBase=manifest.normalizationBase||60;

      let score=0;
      const evidence=[];

      // --- behaviors.json detection patterns (logo, wording, layout-type wording) ---
      if(Array.isArray(behaviors?.detectionPatterns)){
        for(const dp of behaviors.detectionPatterns){
          const re=new RegExp(dp.pattern,dp.flags||'i');
          const match=fullText.match(re);
          if(match){
            score+=dp.weight||0;
            evidence.push({type:dp.type,pattern:dp.pattern,match:match[0],weight:dp.weight||0,source:'behaviors'});
          }
        }
      }

      // --- layout.json fingerprints ---
      if(Array.isArray(layout?.fingerprints)){
        for(const fp of layout.fingerprints){
          const re=new RegExp(fp.pattern,fp.flags||'i');
          if(re.test(fullText)){
            score+=fp.weight||0;
            evidence.push({type:EVIDENCE_TYPES.LAYOUT,pattern:fp.pattern,weight:fp.weight||0,source:'layout'});
          }
        }
      }

      // --- aliases.json fee alias text matching ---
      if(Array.isArray(aliases?.feeAliases)){
        for(const fa of aliases.feeAliases){
          if(fa.alias&&fullText.toLowerCase().includes(fa.alias.toLowerCase())){
            const w=fa.weight||5;
            score+=w;
            evidence.push({type:EVIDENCE_TYPES.ALIAS,alias:fa.alias,canonicalId:fa.canonicalId,weight:w,source:'aliases'});
          }
        }
      }

      // --- MID format hint ---
      if(behaviors?.midFormat&&opts.mid){
        const midRe=new RegExp(behaviors.midFormat);
        if(midRe.test(String(opts.mid))){
          score+=5;
          evidence.push({type:EVIDENCE_TYPES.MID,pattern:behaviors.midFormat,weight:5,source:'behaviors'});
        }
      }

      const confidence=Number(Math.min(score/normBase,1).toFixed(2));
      results.push({processorId:packId,name:manifest.name,score,confidence,normBase,evidence});
      if(evidence.length)allEvidence.push({processor:manifest.name,processorId:packId,score,confidence,evidence});
    }

    // Sort by score descending; ties broken by processorId alphabetically for determinism.
    results.sort((a,b)=>b.score-a.score||a.processorId.localeCompare(b.processorId));
    const best=results[0];

    if(!best||best.confidence<CONFIDENCE_THRESHOLD){
      const genericPack=this.#loader.loadRulePack('generic');
      return {
        processor:genericPack.manifest.name,
        processorId:'generic',
        confidence:best?.confidence??0,
        score:best?.score??0,
        evidence:allEvidence,
        rulePack:genericPack,
        fallback:true,
        fallbackReason:best
          ?`Best candidate '${best.name}' confidence ${best.confidence} is below threshold ${CONFIDENCE_THRESHOLD}`
          :'No processor pack matched any evidence'
      };
    }

    const winnerPack=this.#loader.loadRulePack(best.processorId);
    return {
      processor:best.name,
      processorId:best.processorId,
      confidence:best.confidence,
      score:best.score,
      evidence:allEvidence,
      rulePack:winnerPack,
      fallback:false
    };
  }
}

export default ProcessorDetector;
