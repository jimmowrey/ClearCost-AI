import assert from 'node:assert/strict';
import {NodeProcessorRuleLoader} from '../js/processor-rule-loader-node.js';
import {ProcessorDetector} from '../js/processor-detector.js';
import {
  identifyProcessor,
  normalizeConfidence,
  EVIDENCE_CATEGORIES
} from '../js/processor-intelligence-engine.js';
import {
  validateRulePackHealth,
  checkInstalledRulePacks,
  REQUIRED_RULE_PACK_FILES
} from '../js/rule-pack-health.js';

const loader = new NodeProcessorRuleLoader();
const detector = new ProcessorDetector(loader);

// Representative Commerce Control statement (structural + platform evidence).
const commerceControlStatement = [
  'Commerce Control Merchant Statement',
  'Merchant ID: 5423891007',
  'Statement Period: June 1, 2026 through June 30, 2026',
  'Interchange/Program',
  'Product/Description',
  'Sub Total',
  'VI-US REGULATED (DB)',
  '-$1.98',
].join('\n');

// ── Confidence normalization is deterministic and documented ─────────────────
{
  assert.equal(normalizeConfidence(95, 60), 1);
  assert.equal(normalizeConfidence(45, 60), 0.75);
  assert.equal(normalizeConfidence(30, 60), 0.5);
  assert.equal(normalizeConfidence(45, 60), normalizeConfidence(45, 60)); // reproducible
}

// ── 1. Commerce Control ranks first and meets threshold ──────────────────────
{
  const r = await identifyProcessor(commerceControlStatement, {
    detector, loader, lines: commerceControlStatement.split('\n'),
  });

  assert.equal(r.selected.processorId, 'commerce_control');
  assert.equal(r.selected.fallback, false);
  assert.equal(r.selected.thresholdMet, true);
  assert.ok(r.selected.confidence >= r.selected.threshold);

  // Top-ranked candidate is Commerce Control.
  assert.equal(r.candidates[0].processorId, 'commerce_control');
  assert.equal(r.candidates[0].thresholdMet, true);
}

// ── 2. Evidence explains WHY Commerce Control won ────────────────────────────
{
  const r = await identifyProcessor(commerceControlStatement, {
    detector, loader, lines: commerceControlStatement.split('\n'),
  });
  const cc = r.candidates.find(c => c.processorId === 'commerce_control');
  assert.ok(cc.evidenceMatched.length >= 2, 'multiple matched signals');

  // Every matched signal is fully explained.
  for (const e of cc.evidenceMatched) {
    assert.ok(e.evidenceType, 'has evidence type');
    assert.ok(e.evidenceCategory, 'has evidence category');
    assert.ok(e.matchedText, 'has matched text');
    assert.equal(e.rulePackSource, 'commerce_control', 'attributes the rule pack source');
    assert.ok(typeof e.weightAwarded === 'number', 'records weight awarded');
    assert.ok('provenance' in e, 'includes provenance field');
  }
  const categories = new Set(cc.evidenceMatched.map(e => e.evidenceCategory));
  assert.ok(categories.has(EVIDENCE_CATEGORIES.BRAND_PLATFORM_WORDING), 'brand/platform wording');
  assert.ok(categories.has(EVIDENCE_CATEGORIES.STATEMENT_HEADING), 'statement heading structure');

  // Provenance resolves a line number for a matched wording signal.
  const wording = cc.evidenceMatched.find(e => e.evidenceCategory === EVIDENCE_CATEGORIES.BRAND_PLATFORM_WORDING);
  assert.ok(wording.provenance && typeof wording.provenance.line === 'number', 'line provenance available');
}

// ── evidenceMissing is captured for non-matching packs ───────────────────────
{
  const r = await identifyProcessor(commerceControlStatement, {
    detector, loader, lines: commerceControlStatement.split('\n'),
  });
  const fiserv = r.candidates.find(c => c.processorId === 'fiserv');
  assert.ok(fiserv, 'fiserv is an evaluated candidate');
  assert.equal(fiserv.evidenceMatched.length, 0, 'fiserv matched nothing on a CC statement');
  assert.ok(fiserv.evidenceMissing.length > 0, 'fiserv declared signals reported as missing');
  for (const m of fiserv.evidenceMissing) {
    assert.ok(m.evidenceType && m.evidenceCategory && m.signal !== undefined);
    assert.equal(m.rulePackSource, 'fiserv');
  }
}

// ── 3. Runner-up candidates remain available ─────────────────────────────────
{
  const r = await identifyProcessor(commerceControlStatement, {
    detector, loader, lines: commerceControlStatement.split('\n'),
  });
  assert.ok(Array.isArray(r.runnersUp));
  assert.ok(r.runnersUp.length > 0, 'runner-up candidates preserved');
  assert.ok(!r.runnersUp.some(c => c.processorId === 'commerce_control'), 'winner excluded from runners-up');
  // Every installed non-generic pack is represented across selected + runners-up.
  const ids = new Set([r.selected.processorId, ...r.runnersUp.map(c => c.processorId)]);
  for (const id of ['worldpay', 'fiserv', 'tsys', 'square', 'payroc']) {
    assert.ok(ids.has(id), `${id} present as a comparable candidate`);
  }
}

// ── 4. Weak / ambiguous statements fall back to Generic ──────────────────────
{
  const weak = await identifyProcessor('Merchant statement with no processor clues', { detector, loader });
  assert.equal(weak.selected.processorId, 'generic');
  assert.equal(weak.selected.fallback, true);
  assert.ok(weak.fallbackReason);
  // Candidates still returned for comparison even on fallback.
  assert.ok(weak.candidates.length > 0);
  assert.ok(weak.runnersUp.length > 0);
}

// ── 5. Unknown-processor evidence is preserved (nothing discarded) ───────────
{
  // Deliberately ambiguous: real statement structure but NO processor-specific
  // brand/heading evidence, so nothing crosses threshold.
  const sections = [
    { type: 'header', heading: 'Document header', page: 1, startLine: 1, lines: ['Acme Payments Statement', '123 Market Street, Springfield, IL 62704'] },
    { type: 'interchange_detail', heading: 'Interchange Detail', page: 2, startLine: 1, lines: ['Interchange Detail', 'Card Type', 'Amount'] },
    { type: 'processor_fees', heading: 'Other Fees', page: 2, startLine: 4, lines: ['Other Fees', 'Mystery Assessment 3.50'] },
  ];
  const feeCandidates = [
    { amount: 3.5, status: 'needs_review', originalDescription: 'Mystery Assessment', page: 2, line: 5 },
  ];
  const text = sections.flatMap(s => s.lines).join('\n') + '\nMerchant ID: AB12345678';

  const r = await identifyProcessor(text, {
    detector, loader, sections, feeCandidates, mid: 'AB12345678',
    lines: text.split('\n'),
  });

  assert.equal(r.fallback, true, 'ambiguous statement falls back');
  const u = r.unknownProcessorEvidence;
  assert.ok(u && u.queued === true, 'unknown-processor evidence queued');
  assert.ok(u.candidateRankings.length > 0, 'candidate rankings preserved');
  assert.ok(u.headings.some(h => h.heading === 'Interchange Detail'), 'headings preserved');
  assert.ok(u.sectionNames.includes('interchange_detail'), 'section names preserved');
  assert.ok(u.columnLabels.includes('Card Type'), 'column labels preserved');
  assert.ok(u.midFormat.some(mo => mo.observed === 'AB12345678' && mo.inferredPattern === 'AA99999999'), 'MID format captured');
  assert.ok(u.footerAddressText.some(t => /Springfield, IL 62704/.test(t)), 'footer/address text preserved');
  assert.ok(u.unknownFeeNames.includes('Mystery Assessment'), 'unknown fee names preserved');
  assert.ok(Array.isArray(u.layoutFingerprint.sectionSequence) && u.layoutFingerprint.sectionSequence.length === 3, 'layout fingerprint preserved');
  assert.ok(u.fallbackReason, 'fallback reason preserved');
}

// ── 6. Existing processors remain unaffected via the engine ──────────────────
{
  const cases = [
    ['Worldpay merchant statement', 'worldpay'],
    ['Fiserv payment processing statement', 'fiserv'],
    ['TSYS total system services merchant statement', 'tsys'],
    ['Square merchant processing statement', 'square'],
  ];
  for (const [text, expected] of cases) {
    const r = await identifyProcessor(text, { detector, loader });
    assert.equal(r.selected.processorId, expected, `${expected} selected`);
    assert.equal(r.selected.fallback, false, `${expected} not fallback`);
  }
  // Payroc detected via logo text.
  const payroc = await identifyProcessor('Monthly merchant statement', { detector, loader, logoText: 'PAYROC' });
  assert.equal(payroc.selected.processorId, 'payroc');
  assert.equal(payroc.selected.fallback, false);
}

// ── 7. Rule Pack health validation ───────────────────────────────────────────
{
  // Healthy real pack.
  const cc = await loader.loadRulePack('commerce_control');
  const okHealth = validateRulePackHealth(cc, 'commerce_control');
  assert.equal(okHealth.healthy, true);
  assert.deepEqual(okHealth.missingFiles, []);
  assert.deepEqual([...REQUIRED_RULE_PACK_FILES].sort(), okHealth.presentFiles.slice().sort());

  // Malformed pack: missing sections file + non-array feeAliases + bad manifest.
  const malformed = {
    manifest: { id: 'broken' },                 // missing name + version
    layout: { fingerprints: [] },
    aliases: { feeAliases: 'not-an-array' },     // malformed
    fees: { fees: [] },
    behaviors: { detectionPatterns: [] },
    // sections file omitted entirely
  };
  const badHealth = validateRulePackHealth(malformed, 'broken');
  assert.equal(badHealth.healthy, false);
  assert.ok(badHealth.missingFiles.includes('sections'), 'missing sections reported');
  assert.ok(badHealth.malformed.some(x => x.file === 'aliases'), 'malformed aliases reported');
  assert.ok(badHealth.manifestErrors.length > 0, 'manifest field errors reported');

  // Validator never throws even on garbage input.
  assert.doesNotThrow(() => validateRulePackHealth(null, 'null-pack'));
  assert.equal(validateRulePackHealth(undefined).healthy, false);

  // Sweep of installed packs: all real packs are healthy.
  const sweep = await checkInstalledRulePacks(loader);
  assert.ok(sweep.every(h => h.healthy), 'all installed packs healthy');
}

// ── A malformed / unloadable pack is reported without crashing the engine ────
{
  // Wrapper loader that advertises an extra 'broken_pack' whose files cannot load.
  const wrapper = {
    async getInstalledPacks() {
      const ids = await loader.getInstalledPacks();
      return [...ids, 'broken_pack'];
    },
    async loadRulePack(id) {
      if (id === 'broken_pack') throw new Error(`ENOENT: no such file for '${id}'`);
      return loader.loadRulePack(id);
    },
  };

  let r;
  await assert.doesNotReject(async () => {
    r = await identifyProcessor(commerceControlStatement, {
      detector, loader: wrapper, lines: commerceControlStatement.split('\n'),
    });
  }, 'engine does not crash on an unloadable pack');

  // Commerce Control still wins; broken pack is reported as unhealthy.
  assert.equal(r.selected.processorId, 'commerce_control');
  const broken = r.rulePackHealth.find(h => h.id === 'broken_pack');
  assert.ok(broken && broken.healthy === false && broken.error, 'broken pack reported unhealthy');
}

// ── 8. Processor candidate ordering is deterministic ─────────────────────────
{
  const run = async () => (await identifyProcessor(commerceControlStatement, {
    detector, loader, lines: commerceControlStatement.split('\n'),
  })).candidates.map(c => c.processorId);

  const a = await run();
  const b = await run();
  assert.deepEqual(a, b, 'ordering is reproducible across runs');

  // rawScore is non-increasing (ties broken by processorId ascending).
  const full = await identifyProcessor(commerceControlStatement, {
    detector, loader, lines: commerceControlStatement.split('\n'),
  });
  for (let i = 1; i < full.candidates.length; i++) {
    const prev = full.candidates[i - 1], cur = full.candidates[i];
    assert.ok(
      prev.rawScore > cur.rawScore ||
      (prev.rawScore === cur.rawScore && prev.processorId.localeCompare(cur.processorId) <= 0),
      'candidates ordered by rawScore desc then processorId asc'
    );
  }
}

console.log('Sprint 5.4 processor intelligence engine regression tests passed.');
