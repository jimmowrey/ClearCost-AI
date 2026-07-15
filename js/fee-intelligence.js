import FEE_REGISTRY from './fee-registry.js';

const clean=value=>String(value??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const normalize=value=>clean(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const tokenSet=value=>new Set(normalize(value).split(' ').filter(Boolean));

function jaccard(a,b){
  const aa=tokenSet(a),bb=tokenSet(b);if(!aa.size||!bb.size)return 0;
  let intersection=0;for(const token of aa)if(bb.has(token))intersection++;
  return intersection/(aa.size+bb.size-intersection);
}

function sectionBoost(section,fee){
  if(section==='assessment_detail'&&fee.category==='assessment')return .08;
  if(section==='interchange_detail'&&fee.category==='interchange')return .08;
  if(section==='monthly_fees'&&['monthly_fee','annual_fee','compliance'].includes(fee.category))return .05;
  if(section==='equipment_fees'&&fee.subcategory==='equipment_rental')return .08;
  if(section==='chargebacks'&&fee.category==='chargeback')return .08;
  return 0;
}

export function classifyFeeCandidate(candidate,{processor='Unknown processor'}={}){
  const description=clean(candidate.originalDescription||candidate.description||'');
  const normalized=normalize(description);
  let best=null;
  for(const fee of FEE_REGISTRY){
    let score=0;let evidence=[];
    if(fee.aliases.some(alias=>normalize(alias)===normalized)){score=.99;evidence.push('exact_alias');}
    if(score<.99){
      const pattern=fee.patterns.find(p=>p.test(description));
      if(pattern){score=Math.max(score,.95);evidence.push('pattern_match');}
    }
    if(score<.95){
      const similarity=Math.max(...fee.aliases.map(alias=>jaccard(alias,description)));
      if(similarity>=.75){score=Math.max(score,.78+Math.min((similarity-.75)*.6,.14));evidence.push('token_similarity');}
    }
    score=Math.min(1,score+sectionBoost(candidate.section,fee));
    if(!best||score>best.score)best={fee,score,evidence};
  }
  const threshold=.82;
  if(!best||best.score<threshold){
    const suggestedBucket=candidate.section==='assessment_detail'?'network':candidate.section==='interchange_detail'?'wholesale_interchange':candidate.section==='equipment_fees'?'third_party':'processor_revenue';
    return {...candidate,canonicalId:null,standardName:null,category:'unknown',subcategory:'unknown',bucket:'unknown',suggestedBucket,brand:null,frequency:null,negotiable:null,published:null,ruleId:null,classificationConfidence:Number((best?.score||0).toFixed(2)),classificationEvidence:best?.evidence||[],processor,status:'needs_review'};
  }
  const fee=best.fee;
  return {...candidate,canonicalId:fee.id,standardName:fee.standardName,category:fee.category,subcategory:fee.subcategory,bucket:fee.bucket,brand:fee.brand,frequency:fee.frequency,negotiable:fee.negotiable,published:fee.published,ruleId:fee.ruleId,classificationConfidence:Number(best.score.toFixed(2)),classificationEvidence:best.evidence,processor,status:'classified'};
}

export function classifyFeeCandidates(candidates=[],options={}){return candidates.map(candidate=>classifyFeeCandidate(candidate,options));}

export function summarizeFees(fees=[]){
  const summary={classified:0,unknown:0,totalAmount:0,buckets:{wholesale_interchange:0,network:0,processor_revenue:0,third_party:0,unknown:0},categories:{}};
  for(const fee of fees){
    if(fee.status==='classified')summary.classified++;else summary.unknown++;
    summary.totalAmount+=Number(fee.amount||0);
    const bucket=fee.status==='classified'?fee.bucket:'unknown';summary.buckets[bucket]=(summary.buckets[bucket]||0)+Number(fee.amount||0);
    const category=fee.status==='classified'?fee.category:'unknown';summary.categories[category]=(summary.categories[category]||0)+Number(fee.amount||0);
  }
  summary.totalAmount=Number(summary.totalAmount.toFixed(2));
  for(const key of Object.keys(summary.buckets))summary.buckets[key]=Number(summary.buckets[key].toFixed(2));
  for(const key of Object.keys(summary.categories))summary.categories[key]=Number(summary.categories[key].toFixed(2));
  return summary;
}
