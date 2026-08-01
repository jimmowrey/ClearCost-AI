import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../js/app.js', import.meta.url),
  'utf8'
);

assert.match(
  source,
  /id="markAllScheduleATerms"[\s\S]*Mark All as Verified/,
  'Schedule A review must expose one bulk-verification control'
);

assert.match(
  source,
  /termChecks\.every\(input => input\.checked\)/,
  'saving must require every extracted term to be verified'
);

assert.match(
  source,
  /confirmScheduleACoverage[\s\S]*coverageConfirmed/,
  'saving must continue to require source-coverage confirmation'
);

assert.match(
  source,
  /matches\('\.schedule-term-value, \.schedule-term-label-input'\)[\s\S]*verified\.checked = false/,
  'editing a reviewed value or manual label must unverify only its row'
);

assert.match(
  source,
  /saveButton\.disabled\s*=\s*false/,
  'Save Verified Terms must remain clickable even if browser-restored checkbox state is stale'
);

assert.match(
  source,
  /if \(!everyTermVerified \|\| !coverageConfirmed\)[\s\S]*Verify every term and confirm every source row is represented before saving/,
  'the save handler itself must enforce both verification safeguards'
);

console.log('Schedule A bulk verification regression tests passed.');
