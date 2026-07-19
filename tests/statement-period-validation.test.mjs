import assert from 'node:assert/strict';
import {
  extractStatementPeriod,
  compareIdentity
} from '../js/pdf-validation.js';

const june = 'Statement Period: 06/01/2026 - 06/30/2026';
const may = 'Statement Period: 05/01/2026 - 05/31/2026';

assert.ok(extractStatementPeriod(june));
assert.equal(
  extractStatementPeriod(`${june}\n${june}`),
  extractStatementPeriod(june),
  'Repeated same period inside a PDF should be allowed.'
);

assert.equal(
  extractStatementPeriod(`${june}\n${may}`),
  '__mixed_periods__',
  'Mixed periods inside one PDF must be detected.'
);

{
  const result = compareIdentity([
    {name:'June.pdf',period:extractStatementPeriod(june),mid:'123456',merchant:'merchant'},
    {name:'May.pdf',period:extractStatementPeriod(may),mid:'123456',merchant:'merchant'}
  ]);
  assert.equal(result.periodMatch,true,'Different months across PDFs should be allowed.');
  assert.equal(result.midMatch,true);
  assert.equal(result.merchantMatch,true);
}

{
  const period=extractStatementPeriod(june);
  const result = compareIdentity([
    {name:'June A.pdf',period,mid:'123456',merchant:'merchant'},
    {name:'June B.pdf',period,mid:'123456',merchant:'merchant'}
  ]);
  assert.equal(result.periodMatch,false,'Duplicate monthly statements should be blocked.');
  assert.equal(result.duplicatePeriods.length,1);
}

{
  const result = compareIdentity([
    {name:'Unknown.pdf',period:null,mid:'123456',merchant:'merchant'}
  ]);
  assert.equal(result.periodMatch,false,'Missing statement period should not pass validation.');
  assert.deepEqual(result.missingPeriodFiles,['Unknown.pdf']);
}

console.log('Statement period validation regression tests passed.');
