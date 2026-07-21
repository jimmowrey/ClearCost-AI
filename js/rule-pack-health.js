// Rule Pack health validation.
//
// A reusable, pure validator that reports whether a loaded rule pack contains
// the six required files and whether any of them are malformed or missing
// required fields. It never throws — callers (including the processor
// intelligence engine) must be able to report an unhealthy pack without
// crashing the pipeline.
//
// This module performs NO file I/O. It validates an in-memory pack object of
// the shape produced by the rule pack loaders:
//   { manifest, layout, sections, aliases, fees, behaviors }

import {PACK_FILES, validateManifest} from './processor-rule-loader.js';

// The six required rule pack files (same set the loaders read).
export const REQUIRED_RULE_PACK_FILES = Object.freeze([...PACK_FILES]);

// Expected array-valued fields per file. A present file whose collection field
// is not an array is reported as malformed.
const ARRAY_FIELDS = Object.freeze({
  layout:    'fingerprints',
  sections:  'headings',
  aliases:   'feeAliases',
  fees:      'fees',
  behaviors: 'detectionPatterns'
});

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate the health of a single rule pack.
 *
 * @param {object} pack - loaded pack object (may be partial or malformed).
 * @param {string} [id] - pack id for reporting (falls back to manifest.id).
 * @returns {{
 *   id: string|null,
 *   healthy: boolean,
 *   presentFiles: string[],
 *   missingFiles: string[],
 *   manifestErrors: string[],
 *   malformed: Array<{file:string, reason:string}>,
 *   error: string|null
 * }}
 */
export function validateRulePackHealth(pack, id = null) {
  try {
    const presentFiles = [];
    const missingFiles = [];
    const malformed = [];

    for (const file of REQUIRED_RULE_PACK_FILES) {
      const value = pack ? pack[file] : undefined;
      if (isPlainObject(value)) {
        presentFiles.push(file);
      } else {
        missingFiles.push(file);
      }
    }

    // Manifest field validation (reuses the loader's manifest validator).
    const manifestPresent = isPlainObject(pack && pack.manifest);
    const manifestResult = manifestPresent
      ? validateManifest(pack.manifest)
      : { valid: false, errors: ['manifest is missing or not an object'] };
    const manifestErrors = manifestResult.valid ? [] : manifestResult.errors.slice();

    // Malformed collection fields (only meaningful when the file is present).
    for (const [file, field] of Object.entries(ARRAY_FIELDS)) {
      if (presentFiles.includes(file) && !Array.isArray(pack[file][field])) {
        malformed.push({ file, reason: `'${field}' must be an array` });
      }
    }

    const resolvedId =
      id != null ? id : (manifestPresent && pack.manifest.id) || null;

    const healthy =
      missingFiles.length === 0 &&
      manifestErrors.length === 0 &&
      malformed.length === 0;

    return {
      id: resolvedId,
      healthy,
      presentFiles,
      missingFiles,
      manifestErrors,
      malformed,
      error: null
    };
  } catch (err) {
    // Defensive: a validator must never crash the pipeline.
    return {
      id,
      healthy: false,
      presentFiles: [],
      missingFiles: [...REQUIRED_RULE_PACK_FILES],
      manifestErrors: [],
      malformed: [],
      error: String(err && err.message ? err.message : err)
    };
  }
}

/**
 * Load and validate every installed rule pack via a loader, without throwing.
 * A pack that fails to load (missing files, parse error) is reported as
 * unhealthy rather than aborting the sweep.
 *
 * @param {object} loader - a rule pack loader exposing getInstalledPacks() and
 *   loadRulePack(id).
 * @returns {Promise<Array>} health reports (one per installed pack id).
 */
export async function checkInstalledRulePacks(loader) {
  let ids = [];
  try {
    ids = await loader.getInstalledPacks();
  } catch (err) {
    return [{
      id: null,
      healthy: false,
      presentFiles: [],
      missingFiles: [...REQUIRED_RULE_PACK_FILES],
      manifestErrors: [],
      malformed: [],
      error: `Failed to list installed packs: ${String(err && err.message ? err.message : err)}`
    }];
  }

  const reports = [];
  for (const id of ids) {
    try {
      const pack = await loader.loadRulePack(id);
      reports.push(validateRulePackHealth(pack, id));
    } catch (err) {
      reports.push({
        id,
        healthy: false,
        presentFiles: [],
        missingFiles: [...REQUIRED_RULE_PACK_FILES],
        manifestErrors: [],
        malformed: [],
        error: `Failed to load pack '${id}': ${String(err && err.message ? err.message : err)}`
      });
    }
  }
  return reports;
}

export default { validateRulePackHealth, checkInstalledRulePacks, REQUIRED_RULE_PACK_FILES };
