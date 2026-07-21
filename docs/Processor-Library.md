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
`common`, `generic`, `payroc`, `worldpay`, `fiserv`, `tsys`, `square`.

<!-- TODO: keep this list in sync with processors/index.json. -->

## Detection & fallback

- Packs are scored against statement text; the highest-confidence pack wins.
- If no pack meets its confidence threshold, detection falls back to `generic`
  with `fallback: true` and a recorded reason. No silent failures.

## Adding a processor

<!-- TODO: step-by-step guide for authoring a new rule pack. -->

## Schema reference

<!-- TODO: document the full behaviors/manifest schema, including any
     reconciliation-related configuration once migrated into rule packs
     (see DECISIONS.md — deferred Rule Pack migration). -->

## Open questions

<!-- TODO -->
