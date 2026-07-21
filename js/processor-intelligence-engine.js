// Processor Intelligence Engine (Sprint 5.4).
//
// Makes processor detection EXPLAINABLE, COMPARABLE, and SAFE for unknown
// processors, while keeping Rule Packs as the single source of processor
// knowledge.
//
// The engine is ADDITIVE and standalone: it reuses the existing
// ProcessorDetector as the authoritative scorer (so confidence scoring is
// unchanged and every existing detector test is unaffected), then enriches the
// result with:
//   - a ranked candidate list (with matched AND missing evidence),
//   - an explained selected result with runner-up candidates,
//   - structured unknown-processor evidence when nothing meets threshold,
//   - a rule pack health report.
//
// It changes no fee extraction, reconciliation, metric, or proposal behavior.
//
// ── Confidence normalization formula ─────────────────────────────────────────
//   rawScore   = sum of integer weights of every matched signal for a pack
//   confidence = round2( min(rawScore / normalizationBase, 1) )
// where normalizationBase defaults to 60 and may be overridden per pack in its
// manifest, and round2(x) = Number(x.toFixed(2)).
// thresholdMet = confidence >= (manifest.confidenceThreshold ?? DEFAULT).
// Candidate ordering is deterministic: rawScore descending, then processorId
// ascending (mirrors ProcessorDetector). rawScore is an integer sum, so
// ordering never depends on floating-point results.

import {CONFIDENCE_THRESHOLD} from './processor-detector.js';
import {validateRulePackHealth} from './rule-pack-health.js';

// Evidence categories the engine can attribute a signal to. Detection signals
// map onto a subset; the remaining categories are used when capturing
// unknown-processor evidence.
export const EVIDENCE_CATEGORIES = Object.freeze({
  BRAND_PLATFORM_WORDING: 'brand_platform_wording',
  STATEMENT_HEADING:      'statement_heading',
  SECTION_STRUCTURE:      'section_structure',
  COLUMN_LABEL:           'column_label',
  FEE_VOCABULARY:         'fee_vocabulary',
  MID_FORMAT:             'mid_format',
  FOOTER_ADDRESS_WORDING: 'footer_address_wording',
  LAYOUT_PATTERN:         'layout_pattern'
});

const round2 = x => Number(Math.min(x, 1).toFixed(2));

/** Documented confidence normalization (see header). */
export function normalizeConfidence(rawScore, normalizationBase = 60) {
  const base = normalizationBase > 0 ? normalizationBase : 60;
  return round2(rawScore / base);
}

function categoryForEvidenceType(type) {
  switch (type) {
    case 'logo':
    case 'wording':        return EVIDENCE_CATEGORIES.BRAND_PLATFORM_WORDING;
    case 'layout':         return EVIDENCE_CATEGORIES.LAYOUT_PATTERN;
    case 'section_heading':return EVIDENCE_CATEGORIES.STATEMENT_HEADING;
    case 'alias':          return EVIDENCE_CATEGORIES.FEE_VOCABULARY;
    case 'mid_format':     return EVIDENCE_CATEGORIES.MID_FORMAT;
    default:               return EVIDENCE_CATEGORIES.BRAND_PLATFORM_WORDING;
  }
}

// Stable identity key for a signal, so matched and declared signals can be
// diffed to compute evidenceMissing.
function matchedSignalKey(e) {
  if (e.type === 'alias')          return `aliases:${e.alias}`;
  if (e.type === 'layout')         return `layout:${e.pattern}`;
  if (e.type === 'section_heading')return `sections:${e.pattern}`;
  if (e.type === 'mid_format')     return `behaviors:mid:${e.pattern}`;
  return `behaviors:${e.pattern}`;
}

// Enumerate every signal a pack DECLARES, so misses can be reported.
function declaredSignals(pack) {
  const out = [];
  const b = pack.behaviors || {};
  const l = pack.layout || {};
  const s = pack.sections || {};
  const a = pack.aliases || {};

  for (const dp of Array.isArray(b.detectionPatterns) ? b.detectionPatterns : []) {
    out.push({
      key: `behaviors:${dp.pattern}`,
      evidenceType: dp.type || 'wording',
      evidenceCategory: categoryForEvidenceType(dp.type || 'wording'),
      signal: dp.pattern,
      weight: dp.weight || 0
    });
  }
  for (const fp of Array.isArray(l.fingerprints) ? l.fingerprints : []) {
    out.push({
      key: `layout:${fp.pattern}`,
      evidenceType: 'layout',
      evidenceCategory: EVIDENCE_CATEGORIES.LAYOUT_PATTERN,
      signal: fp.pattern,
      weight: fp.weight || 0
    });
  }
  for (const h of Array.isArray(s.headings) ? s.headings : []) {
    out.push({
      key: `sections:${h.pattern}`,
      evidenceType: 'section_heading',
      evidenceCategory: EVIDENCE_CATEGORIES.STATEMENT_HEADING,
      signal: h.pattern,
      weight: h.weight ?? 12,
      sectionType: h.type
    });
  }
  for (const al of Array.isArray(a.feeAliases) ? a.feeAliases : []) {
    out.push({
      key: `aliases:${al.alias}`,
      evidenceType: 'alias',
      evidenceCategory: EVIDENCE_CATEGORIES.FEE_VOCABULARY,
      signal: al.alias,
      weight: al.weight ?? 5,
      canonicalId: al.canonicalId
    });
  }
  if (b.midFormat) {
    out.push({
      key: `behaviors:mid:${b.midFormat}`,
      evidenceType: 'mid_format',
      evidenceCategory: EVIDENCE_CATEGORIES.MID_FORMAT,
      signal: b.midFormat,
      weight: 5
    });
  }
  return out;
}

// Best-effort page/line provenance for a matched string.
function locateProvenance(matchText, sections, lines) {
  if (!matchText) return null;
  const needle = String(matchText).toLowerCase();
  if (Array.isArray(sections)) {
    for (const section of sections) {
      const secLines = Array.isArray(section.lines) ? section.lines : [];
      for (let i = 0; i < secLines.length; i++) {
        if (String(secLines[i]).toLowerCase().includes(needle)) {
          return { page: section.page ?? null, line: (section.startLine ?? 1) + i };
        }
      }
    }
  }
  if (Array.isArray(lines)) {
    for (let i = 0; i < lines.length; i++) {
      if (String(lines[i]).toLowerCase().includes(needle)) {
        return { page: null, line: i + 1 };
      }
    }
  }
  return null;
}

function enrichMatched(e, rulePackSource, sections, lines) {
  const matchedText = e.match || e.alias || e.pattern || null;
  return {
    evidenceType: e.type,
    evidenceCategory: categoryForEvidenceType(e.type),
    matchedText,
    signal: e.pattern || e.alias || null,
    rulePackSource,
    source: e.source || null,
    weightAwarded: e.weight ?? 0,
    provenance: locateProvenance(matchedText, sections, lines)
  };
}

// ── Unknown-processor evidence capture helpers ───────────────────────────────

function inferMidPattern(value) {
  return String(value).replace(/[A-Z]/g, 'A').replace(/[a-z]/g, 'a').replace(/\d/g, '9');
}

function captureUnknownEvidence({ detection, candidates, sections, lines, feeCandidates, mid }) {
  const secs = Array.isArray(sections) ? sections : [];
  const lns = Array.isArray(lines) ? lines : [];
  const fees = Array.isArray(feeCandidates) ? feeCandidates : [];

  const headings = secs
    .filter(s => s.heading)
    .map(s => ({ heading: s.heading, sectionType: s.type, page: s.page ?? null, line: s.startLine ?? null }));

  const sectionNames = [...new Set(secs.map(s => s.type).filter(Boolean))];

  // Heuristic column labels: short, non-numeric lines inside detail-style
  // sections (clearly labeled as heuristic; nothing is discarded).
  const detailTypes = new Set(['interchange_detail', 'assessment_detail', 'unclassified']);
  const columnLabels = [...new Set(
    secs
      .filter(s => detailTypes.has(s.type))
      .flatMap(s => (Array.isArray(s.lines) ? s.lines : []))
      .map(l => String(l).trim())
      .filter(l => /^[A-Za-z][A-Za-z /&.\-]{1,39}$/.test(l))
  )];

  // MID format observations.
  const midObservations = [];
  const seenMids = new Set();
  const pushMid = v => {
    if (v && !seenMids.has(v)) { seenMids.add(v); midObservations.push({ observed: v, inferredPattern: inferMidPattern(v) }); }
  };
  if (mid) pushMid(String(mid));
  const midRegex = /(?:merchant\s*(?:id|number)|mid|merchant\s*#)\s*[:#-]?\s*([A-Z0-9-]{6,24})/ig;
  const joined = lns.join('\n');
  let m;
  while ((m = midRegex.exec(joined)) !== null) pushMid(m[1]);

  // Footer / address wording.
  const footerAddressText = lns
    .map(l => String(l).trim())
    .filter(l =>
      /\d{1,6}\s+[A-Za-z0-9 .'-]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|highway|hwy)\b/i.test(l) ||
      /\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(l) ||
      /\b[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(l)
    );

  // Unknown / unclassified fee names (never discarded).
  const unknownFeeNames = fees
    .filter(f => f.status === 'needs_review' || f.status === 'unclassified')
    .map(f => (f.originalDescription || f.description || f.rawText || '').toString().slice(0, 120))
    .filter(Boolean);

  // Structural layout fingerprint (order of section types + their headings).
  const layoutFingerprint = {
    sectionSequence: secs.map(s => s.type),
    headingSequence: secs.map(s => s.heading || null)
  };

  return {
    queued: true,
    fallbackReason: detection.fallbackReason || null,
    candidateRankings: candidates.map(c => ({
      processorId: c.processorId,
      rulePackId: c.rulePackId,
      rawScore: c.rawScore,
      confidence: c.confidence,
      threshold: c.threshold,
      thresholdMet: c.thresholdMet
    })),
    headings,
    sectionNames,
    columnLabels,
    midFormat: midObservations,
    footerAddressText,
    unknownFeeNames,
    layoutFingerprint,
    rawSections: secs.map(s => ({ type: s.type, heading: s.heading ?? null, page: s.page ?? null }))
  };
}

/**
 * Identify a processor with full explainability.
 *
 * @param {string} text - full statement text.
 * @param {object} opts
 * @param {object} opts.detector - a ProcessorDetector (authoritative scorer).
 * @param {object} opts.loader - a rule pack loader (getInstalledPacks/loadRulePack).
 * @param {string} [opts.mid]
 * @param {string[]} [opts.lines]
 * @param {string} [opts.logoText]
 * @param {Array} [opts.sections] - segmented sections (for provenance/unknown capture).
 * @param {Array} [opts.feeCandidates] - extracted fee candidates (for unknown fee names).
 */
export async function identifyProcessor(text = '', opts = {}) {
  const { detector, loader, mid, lines, logoText, sections, feeCandidates } = opts;
  if (!detector || !loader) {
    throw new Error('identifyProcessor requires { detector, loader }');
  }

  const derivedLines = Array.isArray(lines) && lines.length
    ? lines
    : String(text).split(/\r?\n/);

  // Authoritative detection (unchanged scoring & selection logic).
  const detection = await detector.detect(text, { mid, lines: derivedLines, logoText });

  const installed = await loader.getInstalledPacks();
  const candidateIds = installed.filter(id => id !== 'common' && id !== 'generic');

  const rulePackHealth = [];
  const candidates = [];

  for (const id of candidateIds) {
    let pack;
    try {
      pack = await loader.loadRulePack(id);
    } catch (err) {
      // Malformed / unloadable pack: report health, skip as a scored candidate,
      // never crash.
      rulePackHealth.push({
        id, healthy: false, presentFiles: [], missingFiles: [],
        manifestErrors: [], malformed: [],
        error: String(err && err.message ? err.message : err)
      });
      candidates.push({
        processorId: id, processorName: null, rulePackId: id,
        rawScore: 0, confidence: 0, threshold: CONFIDENCE_THRESHOLD,
        thresholdMet: false, healthy: false,
        evidenceMatched: [], evidenceMissing: []
      });
      continue;
    }

    const health = validateRulePackHealth(pack, id);
    rulePackHealth.push(health);

    const manifest = pack.manifest || {};
    const threshold = manifest.confidenceThreshold ?? CONFIDENCE_THRESHOLD;

    const detEvid = detection.evidence.find(e => e.processorId === id);
    const rawScore = detEvid ? detEvid.score : 0;
    const confidence = detEvid ? detEvid.confidence : 0;

    const matchedItems = detEvid ? detEvid.evidence : [];
    const matchedKeys = new Set(matchedItems.map(matchedSignalKey));
    const evidenceMatched = matchedItems.map(e => enrichMatched(e, id, sections, derivedLines));
    const evidenceMissing = declaredSignals(pack)
      .filter(d => !matchedKeys.has(d.key))
      .map(d => ({
        evidenceType: d.evidenceType,
        evidenceCategory: d.evidenceCategory,
        signal: d.signal,
        weight: d.weight,
        rulePackSource: id
      }));

    candidates.push({
      processorId: id,
      processorName: manifest.name || null,
      rulePackId: manifest.id || id,
      rawScore,
      confidence,
      threshold,
      thresholdMet: confidence >= threshold,
      healthy: health.healthy,
      evidenceMatched,
      evidenceMissing
    });
  }

  // Deterministic ordering: rawScore desc, then processorId asc.
  candidates.sort((a, b) => b.rawScore - a.rawScore || a.processorId.localeCompare(b.processorId));

  // Selected result mirrors the detector's authoritative decision.
  let selected;
  if (detection.fallback) {
    selected = {
      processorId: detection.processorId,          // 'generic'
      processorName: detection.processor,          // 'Generic Processor'
      rulePackId: detection.rulePack?.manifest?.id || 'generic',
      rulePackVersion: detection.rulePack?.manifest?.version || null,
      confidence: detection.confidence,
      threshold: detection.threshold,
      thresholdMet: false,
      fallback: true,
      fallbackReason: detection.fallbackReason || 'No processor met its confidence threshold'
    };
  } else {
    const winner = candidates.find(c => c.processorId === detection.processorId) || {};
    selected = {
      processorId: detection.processorId,
      processorName: winner.processorName || detection.processor,
      rulePackId: winner.rulePackId || detection.rulePack?.manifest?.id || detection.processorId,
      rulePackVersion: detection.rulePack?.manifest?.version || null,
      confidence: detection.confidence,
      threshold: detection.threshold,
      thresholdMet: true,
      fallback: false,
      fallbackReason: null
    };
  }

  const runnersUp = candidates.filter(c => c.processorId !== selected.processorId);

  const unknownProcessorEvidence = detection.fallback
    ? captureUnknownEvidence({ detection, candidates, sections, lines: derivedLines, feeCandidates, mid })
    : null;

  return {
    selected,
    candidates,
    runnersUp,
    fallback: detection.fallback,
    fallbackReason: selected.fallbackReason,
    unknownProcessorEvidence,
    rulePackHealth
  };
}

export default { identifyProcessor, normalizeConfidence, EVIDENCE_CATEGORIES };
