export const normalize = (value='') => value.toLowerCase().replace(/[^a-z0-9]/g,'');
export const stableHash = (value='') => { let hash=2166136261; for(const char of value){ hash^=char.charCodeAt(0); hash=Math.imul(hash,16777619); } return (hash>>>0).toString(16).padStart(8,'0'); };

export function extractPrintedPage(text=''){
  const patterns=[
    /\bpage\s*(\d{1,3})\s*(?:of|\/|-)\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\s+of\s+(\d{1,3})\b/i
  ];
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(match) return {current:Number(match[1]),total:Number(match[2])};
  }
  return null;
}

function canonicalDateRange(match){
  if(!match) return null;
  return normalize(match[0]);
}

function findAllStatementPeriods(text=''){
  const patterns=[
    /(?:statement|processing)\s*(?:period|dates?)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\s*(?:to|through|-)\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/ig,
    /\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})\s*(?:to|through|-)\s*(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})\b/ig
  ];

  const found=[];
  for(const pattern of patterns){
    for(const match of text.matchAll(pattern)){
      const canonical=canonicalDateRange(match);
      if(canonical) found.push(canonical);
    }
  }
  return [...new Set(found)];
}

export function extractStatementPeriod(text=''){
  const periods=findAllStatementPeriods(text);

  // No detectable period.
  if(!periods.length) return null;

  // One PDF must represent one monthly statement period.
  // Repeated occurrences of the same period are allowed.
  // Multiple distinct periods inside the same PDF are a blocking condition.
  if(periods.length>1) return '__mixed_periods__';

  return periods[0];
}

export function extractMid(text=''){
  const patterns=[/(?:merchant\s*(?:id|number)|mid|merchant\s*#)\s*[:#-]?\s*([A-Z0-9-]{6,24})/i];
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(match) return normalize(match[1]);
  }
  return null;
}

export function extractMerchantName(text=''){
  const lines=text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  const labeled=lines.find(line=>/^(?:merchant|business|doing business as|dba)\s*(?:name)?\s*[:\-]/i.test(line));
  if(labeled) return normalize(labeled.replace(/^.*?[:\-]\s*/,''));
  return null;
}

export function detectMissingAndOrder(printedPages){
  const known=printedPages.filter(Boolean);
  if(!known.length) return {missing:[],outOfOrder:[],expectedTotal:null};
  const expectedTotal=Math.max(...known.map(p=>p.total));
  const seen=new Set(known.map(p=>p.current));
  const missing=[];
  for(let i=1;i<=expectedTotal;i++) if(!seen.has(i)) missing.push(i);
  const outOfOrder=[];
  known.forEach((p,index)=>{
    if(index>0 && p.current<known[index-1].current) outOfOrder.push(p.current);
  });
  return {missing,outOfOrder,expectedTotal};
}

export function compareIdentity(records){
  const values=key=>[...new Set(records.map(r=>r[key]).filter(Boolean))];
  const mids=values('mid');
  const merchants=values('merchant');

  const detectedPeriods=records.map(r=>r.period).filter(Boolean);
  const mixedPeriodFiles=records
    .filter(r=>r.period==='__mixed_periods__')
    .map(r=>r.name);

  const normalPeriods=detectedPeriods.filter(p=>p!=='__mixed_periods__');
  const uniquePeriods=[...new Set(normalPeriods)];
  const missingPeriodFiles=records
    .filter(r=>!r.period)
    .map(r=>r.name);

  const counts=new Map();
  for(const period of normalPeriods){
    counts.set(period,(counts.get(period)||0)+1);
  }
  const duplicatePeriods=[...counts.entries()]
    .filter(([,count])=>count>1)
    .map(([period])=>period);

  // Business rule:
  // - each PDF is one monthly statement
  // - all uploaded PDFs should be different months
  // - merchant/MID should match across PDFs
  // - period must be detected for every PDF
  // - mixed periods within one PDF block validation
  // - duplicate months across PDFs are flagged/blocking
  const periodMatch=
    records.length>0 &&
    missingPeriodFiles.length===0 &&
    mixedPeriodFiles.length===0 &&
    duplicatePeriods.length===0 &&
    uniquePeriods.length===records.length;

  return {
    periodMatch,
    midMatch:mids.length<=1,
    merchantMatch:merchants.length<=1,
    periods:uniquePeriods,
    mids,
    merchants,
    missingPeriodFiles,
    mixedPeriodFiles,
    duplicatePeriods
  };
}
