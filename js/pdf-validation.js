export const normalize = (value='') => value.toLowerCase().replace(/[^a-z0-9]/g,'');
export const stableHash = (value='') => { let hash=2166136261; for(const char of value){ hash^=char.charCodeAt(0); hash=Math.imul(hash,16777619); } return (hash>>>0).toString(16).padStart(8,'0'); };
export function extractPrintedPage(text=''){
  const patterns=[/\bpage\s*(\d{1,3})\s*(?:of|\/|-)\s*(\d{1,3})\b/i,/\b(\d{1,3})\s+of\s+(\d{1,3})\b/i];
  for(const pattern of patterns){ const match=text.match(pattern); if(match) return {current:Number(match[1]),total:Number(match[2])}; }
  return null;
}
export function extractStatementPeriod(text=''){
  const patterns=[/(?:statement|processing)\s*(?:period|dates?)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\s*(?:to|through|-)\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,/\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})\s*(?:to|through|-)\s*(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})\b/i];
  for(const pattern of patterns){ const match=text.match(pattern); if(match) return normalize(match[0]); }
  return null;
}
export function extractMid(text=''){
  const patterns=[/(?:merchant\s*(?:id|number)|mid|merchant\s*#)\s*[:#-]?\s*([A-Z0-9-]{6,24})/i];
  for(const pattern of patterns){ const match=text.match(pattern); if(match) return normalize(match[1]); }
  return null;
}
export function extractMerchantName(text=''){
  const lines=text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  const labeled=lines.find(line=>/^(?:merchant|business|doing business as|dba)\s*(?:name)?\s*[:\-]/i.test(line));
  if(labeled) return normalize(labeled.replace(/^.*?[:\-]\s*/,''));
  return null;
}
export function detectMissingAndOrder(printedPages){
  const known=printedPages.filter(Boolean); if(!known.length) return {missing:[],outOfOrder:[],expectedTotal:null};
  const expectedTotal=Math.max(...known.map(p=>p.total));
  const seen=new Set(known.map(p=>p.current));
  const missing=[]; for(let i=1;i<=expectedTotal;i++) if(!seen.has(i)) missing.push(i);
  const outOfOrder=[]; known.forEach((p,index)=>{ if(index>0 && p.current<known[index-1].current) outOfOrder.push(p.current); });
  return {missing,outOfOrder,expectedTotal};
}
export function compareIdentity(records){
  const values=key=>[...new Set(records.map(r=>r[key]).filter(Boolean))];
  const periods=values('period'), mids=values('mid'), merchants=values('merchant');
  return {periodMatch:periods.length<=1,midMatch:mids.length<=1,merchantMatch:merchants.length<=1,periods,mids,merchants};
}
