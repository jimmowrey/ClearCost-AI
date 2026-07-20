const FEE_REGISTRY = Object.freeze([
  {
    id:'CCF-000001', standardName:'Visa FANF', category:'assessment', subcategory:'fixed_acquirer_network_fee', bucket:'network', brand:'Visa',
    aliases:['visa fanf','fanf','fixed acquirer network fee'], frequency:'monthly', negotiable:false, published:true,
    patterns:[/\bvisa\s+fanf\b/i,/\bfanf\b/i,/\bfixed acquirer network fee\b/i], ruleId:'FT-0001'
  },
  {
    id:'CCF-000002', standardName:'Mastercard NABU Fee', category:'assessment', subcategory:'network_access_brand_usage', bucket:'network', brand:'Mastercard',
    aliases:['mc nabu','mastercard nabu','master card nabu','network access and brand usage'], frequency:'per_transaction', negotiable:false, published:true,
    patterns:[/\bmc\s+nabu\b/i,/\bmaster\s*card\s+nabu\b/i,/\bnetwork access(?: and| &) brand usage\b/i], ruleId:'FT-0002'
  },
  {
    id:'CCF-000003', standardName:'Authorization Fee', category:'processor_transaction_fee', subcategory:'authorization', bucket:'processor_revenue', brand:null,
    aliases:['authorization fee','auth fee','authorization'], frequency:'per_transaction', negotiable:true, published:false,
    patterns:[/\bauthori[sz]ation fee\b/i,/\bauth fee\b/i], ruleId:'FT-0003'
  },
  {
    id:'CCF-000004', standardName:'PCI Compliance Fee', category:'compliance', subcategory:'pci_compliance', bucket:'processor_revenue', brand:null,
    aliases:['pci compliance fee','pci fee','pci program fee'], frequency:'monthly_or_annual', negotiable:true, published:false,
    patterns:[/\bpci compliance(?: fee)?\b/i,/\bpci program fee\b/i,/\bpci fee\b/i], ruleId:'FT-0004'
  },
  {
    id:'CCF-000005', standardName:'PCI Non-Compliance Fee', category:'compliance', subcategory:'pci_non_compliance', bucket:'processor_revenue', brand:null,
    aliases:['pci non compliance fee','pci non-compliance','non compliant pci fee'], frequency:'monthly', negotiable:true, published:false,
    patterns:[/\bpci non[- ]?compliance(?: fee)?\b/i,/\bnon[- ]?compliant pci fee\b/i], ruleId:'FT-0005'
  },
  {
    id:'CCF-000006', standardName:'Batch Fee', category:'processor_transaction_fee', subcategory:'batch', bucket:'processor_revenue', brand:null,
    aliases:['batch fee','settlement fee','batch settlement fee'], frequency:'per_batch', negotiable:true, published:false,
    patterns:[/\bbatch(?: settlement)? fee\b/i,/\bsettlement fee\b/i], ruleId:'FT-0006'
  },
  {
    id:'CCF-000007', standardName:'Monthly Account Fee', category:'monthly_fee', subcategory:'account_service', bucket:'processor_revenue', brand:null,
    aliases:['monthly account fee','monthly service fee','account maintenance fee','access fee'], frequency:'monthly', negotiable:true, published:false,
    patterns:[/\bmonthly account fee\b/i,/\bmonthly service fee\b/i,/\baccount maintenance fee\b/i,/\baccess fee\b/i], ruleId:'FT-0007'
  },
  {
    id:'CCF-000008', standardName:'Gateway Fee', category:'third_party_service', subcategory:'gateway', bucket:'third_party', brand:null,
    aliases:['gateway fee','payment gateway fee','gateway access fee'], frequency:'monthly_or_transaction', negotiable:true, published:false,
    patterns:[/\bpayment gateway fee\b/i,/\bgateway access fee\b/i,/\bgateway fee\b/i], ruleId:'FT-0008'
  },
  {
    id:'CCF-000009', standardName:'Equipment Rental Fee', category:'third_party_service', subcategory:'equipment_rental', bucket:'third_party', brand:null,
    aliases:['equipment rental','terminal rental','device rental','terminal lease'], frequency:'monthly', negotiable:true, published:false,
    patterns:[/\bequipment rental(?: fee)?\b/i,/\bterminal rental(?: fee)?\b/i,/\bdevice rental(?: fee)?\b/i,/\bterminal lease(?: fee)?\b/i], ruleId:'FT-0009'
  },
  {
    id:'CCF-000010', standardName:'AVS Fee', category:'processor_transaction_fee', subcategory:'avs', bucket:'processor_revenue', brand:null,
    aliases:['avs fee','address verification fee','address verification service fee'], frequency:'per_transaction', negotiable:true, published:false,
    patterns:[/\bavs fee\b/i,/\baddress verification(?: service)? fee\b/i], ruleId:'FT-0010'
  },
  {
    id:'CCF-000011', standardName:'Chargeback Fee', category:'chargeback', subcategory:'chargeback', bucket:'processor_revenue', brand:null,
    aliases:['chargeback fee','chargeback processing fee','dispute fee'], frequency:'per_occurrence', negotiable:true, published:false,
    patterns:[/\bchargeback(?: processing)? fee\b/i,/\bdispute fee\b/i], ruleId:'FT-0011'
  },
  {
    id:'CCF-000012', standardName:'Annual Fee', category:'annual_fee', subcategory:'annual_account_fee', bucket:'processor_revenue', brand:null,
    aliases:['annual fee','annual account fee','annual service fee'], frequency:'annual', negotiable:true, published:false,
    patterns:[/\bannual account fee\b/i,/\bannual service fee\b/i,/\bannual fee\b/i], ruleId:'FT-0012'
  },{
  id:'CCF-001001',
  standardName:'American Express Assessment Fee',
  category:'assessment',
  subcategory:'card_brand_assessment',
  bucket:'network',
  aliases:['amex assessment fee','american express assessment fee'],
  frequency:'volume_based',
  negotiable:false,
  published:true,
  patterns:[/\bamex assessment fee\b/i,/\bamerican express assessment fee\b/i],
  ruleId:'FT-1001'
},
{
  id:'CCF-001006',
  standardName:'Mastercard Assessment Fee',
  category:'assessment',
  subcategory:'card_brand_assessment',
  bucket:'network',
  aliases:['mastercard assessment fee','master card assessment fee','mc assessment fee'],
  frequency:'volume_based',
  negotiable:false,
  published:true,
  patterns:[/\bmastercard assessment fee\b/i,/\bmaster\s*card assessment fee\b/i,/\bmc assessment fee\b/i],
  ruleId:'FT-1006'
},
{
  id:'CCF-001007',
  standardName:'Visa Assessment Fee - Credit',
  category:'assessment',
  subcategory:'card_brand_assessment',
  bucket:'network',
  aliases:['visa assessment fee cr','visa assessment fee credit'],
  frequency:'volume_based',
  negotiable:false,
  published:true,
  patterns:[/\bvisa assessment fee cr\b/i,/\bvisa assessment fee credit\b/i],
  ruleId:'FT-1007'
},
{
  id:'CCF-001008',
  standardName:'Visa Assessment Fee - Debit',
  category:'assessment',
  subcategory:'card_brand_assessment',
  bucket:'network',
  aliases:['visa assessment fee db','visa assessment fee debit'],
  frequency:'volume_based',
  negotiable:false,
  published:true,
  patterns:[/\bvisa assessment fee db\b/i,/\bvisa assessment fee debit\b/i],
  ruleId:'FT-1008'
},
{
  id:'CCF-001009',
  standardName:'Discover Assessment Fee',
  category:'assessment',
  subcategory:'card_brand_assessment',
  bucket:'network',
  aliases:['discover assessment fee','disc assessment fee'],
  frequency:'volume_based',
  negotiable:false,
  published:true,
  patterns:[/\bdiscover assessment fee\b/i,/\bdisc assessment fee\b/i],
  ruleId:'FT-1009'
},{
  id:'CCF-001002',
  standardName:'Mastercard Acquirer AVS Fee',
  category:'assessment',
  subcategory:'network_service_fee',
  bucket:'network',
  aliases:['mc acquirer avs billing','mastercard acquirer avs billing'],
  frequency:'per_transaction',
  negotiable:false,
  published:true,
  patterns:[/\bmc acquirer avs billing\b/i,/\bmastercard acquirer avs billing\b/i],
  ruleId:'FT-1002'
},
{
  id:'CCF-001003',
  standardName:'American Express Acquirer Transaction Fee',
  category:'assessment',
  subcategory:'network_transaction_fee',
  bucket:'network',
  aliases:['axp acquirer trans fee','amex acquirer transaction fee'],
  frequency:'per_transaction',
  negotiable:false,
  published:true,
  patterns:[/\baxp acquirer trans fee\b/i,/\bamex acquirer transaction fee\b/i],
  ruleId:'FT-1003'
},
{
  id:'CCF-001004',
  standardName:'Visa Transaction Integrity Fee',
  category:'assessment',
  subcategory:'network_transaction_fee',
  bucket:'network',
  aliases:['vi transaction integrity fee','visa transaction integrity fee'],
  frequency:'per_transaction',
  negotiable:false,
  published:true,
  patterns:[/\bvi transaction integrity fee\b/i,/\bvisa transaction integrity fee\b/i],
  ruleId:'FT-1004'
},
{
  id:'CCF-001005',
  standardName:'Visa International Service Fee - Base',
  category:'assessment',
  subcategory:'international_service_fee',
  bucket:'network',
  aliases:['visa intl service fee base','visa international service fee base'],
  frequency:'volume_or_transaction_based',
  negotiable:false,
  published:true,
  patterns:[/\bvisa intl service fee\s*-?\s*base\b/i,/\bvisa international service fee\s*-?\s*base\b/i],
  ruleId:'FT-1005'
},
{
  id:'CCF-001010',
  standardName:'Mastercard License Volume Fee',
  category:'assessment',
  subcategory:'network_volume_fee',
  bucket:'network',
  aliases:['mc license volume fee','mastercard license volume fee'],
  frequency:'volume_based',
  negotiable:false,
  published:true,
  patterns:[/\bmc license volume fee\b/i,/\bmastercard license volume fee\b/i],
  ruleId:'FT-1010'
},
{
  id:'CCF-001011',
  standardName:'Mastercard CVC2 Transaction Fee',
  category:'assessment',
  subcategory:'network_transaction_fee',
  bucket:'network',
  aliases:['mc cvc2 trans fee','mc cvc2 transaction fee','mastercard cvc2 trans fee','mastercard cvc2 transaction fee'],
  frequency:'per_transaction',
  negotiable:false,
  published:true,
  patterns:[/\bmc cvc2 trans fee\b/i,/\bmc cvc2 transaction fee\b/i,/\bmastercard cvc2 trans fee\b/i,/\bmastercard cvc2 transaction fee\b/i],
  ruleId:'FT-1011'
},
{
  id:'CCF-001012',
  standardName:'Visa Network Acquirer Processing Fee - US Credit',
  category:'assessment',
  subcategory:'network_acquirer_processing_fee',
  bucket:'network',
  aliases:['vi ntwk acq proc fee us cr','visa network acquirer processing fee us credit'],
  frequency:'per_transaction',
  negotiable:false,
  published:true,
  patterns:[/\bvi ntwk acq proc fee us cr\b/i,/\bvisa network acquirer processing fee us credit\b/i],
  ruleId:'FT-1012'
},
{
  id:'CCF-001013',
  standardName:'Visa Network Acquirer Processing Fee - US Debit/Prepaid',
  category:'assessment',
  subcategory:'network_acquirer_processing_fee',
  bucket:'network',
  aliases:['vi ntwk acq proc fee us db/pp','visa network acquirer processing fee us debit prepaid'],
  frequency:'per_transaction',
  negotiable:false,
  published:true,
  patterns:[/\bvi ntwk acq proc fee us db\/pp\b/i,/\bvisa network acquirer processing fee us debit prepaid\b/i],
  ruleId:'FT-1013'
},
{
  id:'CCF-001014',
  standardName:'Visa Network Acquirer Processing Fee - International Credit',
  category:'assessment',
  subcategory:'network_acquirer_processing_fee',
  bucket:'network',
  aliases:['vi ntwk acq proc fee intl cr','visa network acquirer processing fee international credit'],
  frequency:'per_transaction',
  negotiable:false,
  published:true,
  patterns:[/\bvi ntwk acq proc fee intl cr\b/i,/\bvisa network acquirer processing fee international credit\b/i],
  ruleId:'FT-1014'
},
]);

export function getFeeRegistry(){return FEE_REGISTRY.map(item=>({...item,aliases:[...item.aliases],patterns:[...item.patterns]}));}
export function getFeeById(id){return FEE_REGISTRY.find(item=>item.id===id)||null;}
export default FEE_REGISTRY;
