# Processor Library

> Status: placeholder. Structure only — expand in the documentation sprint.

## Purpose

Reference for processor detection and the Rule Pack architecture.

## Rule Pack architecture

Processor-specific behavior lives in rule packs under `processors/<id>/`, loaded
through the Rule Pack loader (`js/processor-rule-loader*.js`). Application code
must not hardcode processor behavior or read pack files directly.

### Rule pack files

Each pack directory contains:

| File | Purpose |
|------|---------|
| `manifest.json` | Pack identity (`id`, `name`, `version`, thresholds). |
| `layout.json` | Layout fingerprints for detection. |
| `sections.json` | Section heading patterns. |
| `aliases.json` | Fee alias mappings. |
| `fees.json` | Fee definitions. |
| `behaviors.json` | Detection patterns, MID format, and behavior config. |

The `common` pack holds shared/global configuration; `generic` is the fallback.

### Installed packs

Registered in `processors/index.json`. Current packs:
`common`, `generic`, `payroc`, `worldpay`, `fiserv`, `tsys`, `square`,
`commerce_control`.

<!-- TODO: keep this list in sync with processors/index.json. -->

## Detection & fallback

- Packs are scored against statement text; the highest-confidence pack wins.
- If no pack meets its confidence threshold, detection falls back to `generic`
  with `fallback: true` and a recorded reason. No silent failures.

## Confidence normalization formula

Detection scoring is deterministic and reproducible:

```
rawScore   = sum of the integer weights of every matched signal for a pack
confidence = round2( min(rawScore / normalizationBase, 1) )
```

- `round2(x) = Number(x.toFixed(2))`.
- `normalizationBase` defaults to `60`; a pack may override it in its manifest.
- `thresholdMet = confidence >= (manifest.confidenceThreshold ?? 0.5)`.
- Candidate ordering is deterministic: `rawScore` descending, then `processorId`
  ascending. `rawScore` is an integer sum, so ordering never depends on
  floating-point results.
- The global default confidence threshold (`0.5`) is not weakened by the engine.

## Processor Intelligence Engine

`js/processor-intelligence-engine.js` (`identifyProcessor`) is an additive,
standalone layer that makes detection explainable and comparable. It reuses
`ProcessorDetector` as the authoritative scorer and returns:

- `candidates[]` — every evaluated pack, ranked, each with `processorId`,
  `processorName`, `rulePackId`, `rawScore`, `confidence`, `threshold`,
  `thresholdMet`, `evidenceMatched`, and `evidenceMissing`.
- `selected` — the chosen processor/rule pack, confidence, `fallback`,
  `fallbackReason`.
- `runnersUp` — the remaining comparable candidates.
- `unknownProcessorEvidence` — structured capture when nothing meets threshold
  (see `docs/Statement-Intelligence.md`).
- `rulePackHealth` — per-pack health reports.

Each matched signal is attributed with an evidence type, evidence category,
matched text, rule pack source, weight awarded, and best-effort page/line
provenance. Evidence categories: brand/platform wording, statement heading,
section structure, column label, fee vocabulary, MID format, footer/address
wording, layout pattern.

The engine changes no fee extraction, reconciliation, metric, or proposal
behavior, and is not yet wired into the live pipeline (standalone this sprint).

## Rule Pack health validation

`js/rule-pack-health.js` provides a reusable, pure `validateRulePackHealth(pack,
id)` that reports whether a pack contains the six required files
(`manifest`, `aliases`, `layout`, `sections`, `fees`, `behaviors`) and whether
any are malformed or missing required manifest fields. It never throws, so an
unhealthy pack is reported rather than crashing the pipeline.
`checkInstalledRulePacks(loader)` sweeps every installed pack. This sprint does
not build a UI dashboard.

## Adding a processor

<!-- TODO: step-by-step guide for authoring a new rule pack. -->

## Schema reference

<!-- TODO: document the full behaviors/manifest schema, including any
     reconciliation-related configuration once migrated into rule packs
     (see DECISIONS.md — deferred Rule Pack migration). -->

## Open questions

<!-- TODO -->
