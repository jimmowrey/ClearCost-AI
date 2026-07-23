(function (global) {
  "use strict";

  const STORAGE_KEY = "clearcost.schedule-a-profiles.v1";
  const DATABASE_NAME = "clearcost-agent-documents";
  const DOCUMENT_STORE = "schedule-a-pdfs";
  const SCHEMA_VERSION = 1;

  function requiredText(value, label) {
    const text = String(value || "").trim();
    if (!text) throw new Error(`${label} is required.`);
    return text;
  }

  function normalizeDate(value, label) {
    const text = requiredText(value, label);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new Error(`${label} must use YYYY-MM-DD.`);
    }
    const parsed = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      throw new Error(`${label} is not a valid date.`);
    }
    return text;
  }

  function normalizeProfile(value) {
    const source = value && typeof value === "object" ? value : {};
    const effectiveDate = normalizeDate(source.effectiveDate, "Effective date");
    const endDate = source.endDate
      ? normalizeDate(source.endDate, "End date")
      : null;

    if (endDate && endDate < effectiveDate) {
      throw new Error("End date cannot be before the effective date.");
    }

    const fingerprint = requiredText(
      source.documentFingerprint,
      "Document fingerprint"
    ).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new Error("Document fingerprint must be a SHA-256 value.");
    }

    const createdAt = requiredText(source.createdAt, "Created timestamp");
    if (Number.isNaN(Date.parse(createdAt))) {
      throw new Error("Created timestamp is invalid.");
    }
    const extractionStatus = source.extractionStatus === "extracted"
      ? "extracted"
      : "pending";
    const terms = Array.isArray(source.terms) ? source.terms : [];
    if (source.termsVerified === true &&
        (extractionStatus !== "extracted" || !terms.length)) {
      throw new Error(
        "Schedule A terms cannot be verified before extraction is complete."
      );
    }

    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      id: requiredText(source.id, "Schedule A version ID"),
      isoProcessorName: requiredText(
        source.isoProcessorName,
        "ISO / processor name"
      ),
      effectiveDate,
      endDate,
      fileName: requiredText(source.fileName, "PDF filename"),
      fileSize: Number(source.fileSize) || 0,
      documentFingerprint: fingerprint,
      documentStorageKey: requiredText(
        source.documentStorageKey,
        "Document storage key"
      ),
      createdAt: new Date(createdAt).toISOString(),
      extractionStatus,
      termsVerified: source.termsVerified === true,
      verifiedAt: source.termsVerified && source.verifiedAt
        ? new Date(source.verifiedAt).toISOString()
        : null,
      terms: Object.freeze(
        terms.map(term => Object.freeze({ ...term }))
      ),
    });
  }

  function createProfile(input, now = new Date()) {
    const fingerprint = requiredText(
      input.documentFingerprint,
      "Document fingerprint"
    ).toLowerCase();
    const iso = requiredText(input.isoProcessorName, "ISO / processor name");
    const effectiveDate = normalizeDate(input.effectiveDate, "Effective date");
    const id = `${effectiveDate}-${fingerprint.slice(0, 16)}`;

    return normalizeProfile({
      ...input,
      id,
      isoProcessorName: iso,
      effectiveDate,
      documentStorageKey: id,
      createdAt: now.toISOString(),
      extractionStatus: "pending",
      termsVerified: false,
      terms: [],
    });
  }

  function createRegistry(storage) {
    function load() {
      if (!storage || typeof storage.getItem !== "function") return [];
      try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.map(normalizeProfile) : [];
      } catch (_error) {
        return [];
      }
    }

    return Object.freeze({
      load,
      add(profile) {
        if (!storage || typeof storage.setItem !== "function") {
          throw new Error("Schedule A profile storage is unavailable.");
        }
        const normalized = normalizeProfile(profile);
        const profiles = load();
        if (profiles.some(item => item.id === normalized.id)) {
          throw new Error("This exact Schedule A PDF is already saved.");
        }
        const updated = [...profiles, normalized].sort(
          (a, b) => b.effectiveDate.localeCompare(a.effectiveDate)
        );
        storage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return normalized;
      },
      saveExtraction(profileId, extraction) {
        const profiles = load();
        const index = profiles.findIndex(item => item.id === profileId);
        if (index < 0) throw new Error("Schedule A version was not found.");
        const terms = Array.isArray(extraction?.terms) ? extraction.terms : [];
        if (!terms.length) throw new Error("No Schedule A terms were extracted.");
        profiles[index] = normalizeProfile({
          ...profiles[index],
          extractionStatus: "extracted",
          termsVerified: false,
          verifiedAt: null,
          terms,
        });
        storage.setItem(STORAGE_KEY, JSON.stringify(profiles));
        return profiles[index];
      },
      verifyTerms(profileId, terms, verifiedAt = new Date(), coverageConfirmed = false) {
        const profiles = load();
        const index = profiles.findIndex(item => item.id === profileId);
        if (index < 0) throw new Error("Schedule A version was not found.");
        const reviewed = Array.isArray(terms) ? terms : [];
        if (!reviewed.length || reviewed.some(term => term.verified !== true)) {
          throw new Error("Review and verify every extracted term first.");
        }
        if (coverageConfirmed !== true) {
          throw new Error("Confirm that every Schedule A row is represented.");
        }
        profiles[index] = normalizeProfile({
          ...profiles[index],
          extractionStatus: "extracted",
          termsVerified: true,
          verifiedAt: verifiedAt.toISOString(),
          terms: reviewed,
        });
        storage.setItem(STORAGE_KEY, JSON.stringify(profiles));
        return profiles[index];
      },
    });
  }

  function createDocumentStore(indexedDB) {
    function openDatabase() {
      return new Promise((resolve, reject) => {
        if (!indexedDB || typeof indexedDB.open !== "function") {
          reject(new Error("Secure local PDF storage is unavailable."));
          return;
        }
        const request = indexedDB.open(DATABASE_NAME, SCHEMA_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(DOCUMENT_STORE)) {
            request.result.createObjectStore(DOCUMENT_STORE);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    return Object.freeze({
      async put(key, pdfBlob) {
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
          const transaction = db.transaction(DOCUMENT_STORE, "readwrite");
          transaction.objectStore(DOCUMENT_STORE).put(pdfBlob, key);
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
        });
        db.close();
      },
      async get(key) {
        const db = await openDatabase();
        const result = await new Promise((resolve, reject) => {
          const transaction = db.transaction(DOCUMENT_STORE, "readonly");
          const request = transaction.objectStore(DOCUMENT_STORE).get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return result;
      },
    });
  }

  global.ClearCostScheduleAProfiles = Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    createProfile,
    normalizeProfile,
    createRegistry,
    createDocumentStore,
  });
})(typeof window !== "undefined" ? window : globalThis);
