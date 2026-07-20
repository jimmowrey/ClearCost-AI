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

function normalizeYear(year){
  const y=Number(year);
  if(!Number.isFinite(y)) return null;
  return y<100 ? 2000+y : y;
}

function monthKey(month,year){
  const m=Number(month);
  const y=normalizeYear(year);
  if(!y || m<1 || m>12) return null;
  return `${y}-${String(m).padStart(2,'0')}`;
}

function monthNameNumber(name=''){
  const months={
    jan:1,january:1,
    feb:2,february:2,
    mar:3,march:3,
    apr:4,april:4,
    may:5,
    jun:6,june:6,
    jul:7,july:7,
    aug:8,august:8,
    sep:9,sept:9,september:9,
    oct:10,october:10,
    nov:11,november:11,
    dec:12,december:12
  };
  return months[String(name).toLowerCase()]||null;
}

function unique(values){
  return [...new Set(values.filter(Boolean))];
}

function findAllStatementPeriods(text=''){
  const headerText=text.slice(0,5000);

  // Priority 1:
  // Explicit numeric monthly ranges:
  // 01/01/25 - 01/31/25
  // 2/1/26 through 2/28/26
  const numericRanges=[];
  const numericRangePattern=
    /\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](\d{2}|\d{4})\s*(?:to|through|-)\s*(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](\d{2}|\d{4})\b/ig;

  for(const match of headerText.matchAll(numericRangePattern)){
    const startMonth=Number(match[1]);
    const startYear=normalizeYear(match[3]);
    const endMonth=Number(match[4]);
    const endYear=normalizeYear(match[6]);

    // A monthly statement normally stays within one calendar month.
    if(startMonth===endMonth && startYear===endYear){
      numericRanges.push(monthKey(startMonth,startYear));
    }
  }

  // Prefer ranges when the statement contains an explicit period/service label.
  if(
    numericRanges.length &&
    /\b(statement\s*(?:period|dates?)|processing\s*(?:period|dates?)|service\s+from)\b/i.test(text)
  ){
    return unique(numericRanges);
  }

  // Priority 2:
  // Written month date ranges:
  // January 1, 2025 to January 31, 2025
  const writtenRanges=[];
  const writtenRangePattern=
    /\b([A-Za-z]{3,9})\s+\d{1,2},?\s+(\d{4})\s*(?:to|through|-)\s*([A-Za-z]{3,9})\s+\d{1,2},?\s+(\d{4})\b/ig;

  for(const match of text.matchAll(writtenRangePattern)){
    const startMonth=monthNameNumber(match[1]);
    const endMonth=monthNameNumber(match[3]);
    const startYear=Number(match[2]);
    const endYear=Number(match[4]);

    if(startMonth && startMonth===endMonth && startYear===endYear){
      writtenRanges.push(monthKey(startMonth,startYear));
    }
  }

  if(writtenRanges.length) return unique(writtenRanges);

  // Priority 3:
  // Explicit month labels:
  // Statement for the month: March 2026
  // Statement Month: March 2026
  // Statement Period: March 2026
  const labeledMonths=[];
  const labeledMonthPattern=
    /(?:statement\s*(?:for\s+the\s+month|month|period|date)|processing\s*(?:month|period|date))\s*[:\-]?\s*([A-Za-z]{3,9})\s+(\d{4})/ig;

  for(const match of text.matchAll(labeledMonthPattern)){
    labeledMonths.push(monthKey(monthNameNumber(match[1]),match[2]));
  }

  if(labeledMonths.length) return unique(labeledMonths);

  // Priority 4:
  // Statement-date formats used as the month indicator:
  // Statement Date: 02/28/2026
  // Statement Date: 06/30/2024
  const statementDates=[];
  const numericStatementDate=
    /statement\s*date\s*[:\-]?\s*(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](\d{2}|\d{4})/ig;

  for(const match of headerText.matchAll(numericStatementDate)){
    statementDates.push(monthKey(match[1],match[3]));
  }

  const writtenStatementDate=
    /(?:statement\s*date|billing\s+statement\s+for)\s*[:\-]?\s*([A-Za-z]{3,9})\s+\d{1,2},?\s+(\d{4})/ig;

  for(const match of headerText.matchAll(writtenStatementDate)){
    statementDates.push(monthKey(monthNameNumber(match[1]),match[2]));
  }

  if(statementDates.length) return unique(statementDates);

  // Priority 5:
  // Generic monthly range fallback when the PDF text order separates
  // "Statement Period" from its value, as seen in some Fiserv statements.
  if(numericRanges.length) return unique(numericRanges);

  // Priority 6:
  // Bare month/year such as "May 2025".
  // Restrict this fallback to the beginning of the statement to reduce
  // false matches from notices and card-brand updates later in the PDF.
  const bareMonths=[];
  const bareMonthPattern=
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/ig;

  for(const match of headerText.slice(0,1500).matchAll(bareMonthPattern)){
    bareMonths.push(monthKey(monthNameNumber(match[1]),match[2]));
  }

  const distinctBareMonths=unique(bareMonths);

  // Only trust a bare month/year when it points to one unambiguous month.
  if(distinctBareMonths.length===1) return distinctBareMonths;

  return [];
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
