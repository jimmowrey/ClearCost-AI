import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
import {
  stableHash,
  extractPrintedPage,
  extractStatementPeriod,
  extractMid,
  extractMerchantName,
  detectMissingAndOrder,
  compareIdentity
} from './pdf-validation.js';
import { runStatementIntelligencePipeline } from './statement-intelligence-pipeline.js';
import './profit-intelligence.js';
import './agent-settings.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const state = {
  files: [],
  results: [],
  extractions: [],
  profitScenario: null,
  currentScreen: 'home'
};

const agentSettingsStore =
  window.ClearCostAgentSettings
    .createAgentSettingsStore(window.localStorage);

let agentSettings =
  agentSettingsStore.load();

const scheduleARegistry =
  window.ClearCostScheduleAProfiles
    .createRegistry(window.localStorage);

const scheduleADocumentStore =
  window.ClearCostScheduleAProfiles
    .createDocumentStore(window.indexedDB);

const titles = {
  home: 'Home',
  'new-analysis': 'New Analysis',
  validation: 'Statement Validation',
  extraction: 'Statement Extraction',
  profitability: 'Profit Intelligence',
  history: 'History',
  settings: 'Settings'
};

const $ = id => document.getElementById(id);

const el = {
  pdfInput: $('pdfInput'),
  dropZone: $('dropZone'),
  statementQueue: $('statementQueue'),
  emptyQueue: $('emptyQueue'),
  statementCount: $('statementCount'),
  totalSize: $('totalSize'),
  clearQueue: $('clearQueue'),
  continueButton: $('continueButton'),
  fileStatus: $('fileStatus'),
  validationFiles: $('validationFiles'),
  validationLoaded: $('validationLoaded'),
  screenTitle: $('screenTitle'),
  extractButton: $('extractButton')
};

function navigate(id) {
  if (!$(id)) return;

  document
    .querySelectorAll('.screen')
    .forEach(s => s.classList.toggle('active', s.id === id));

  document
    .querySelectorAll('.bottom-nav button')
    .forEach(b => b.classList.toggle('active', b.dataset.screen === id));

  state.currentScreen = id;
  el.screenTitle.textContent = titles[id] || 'ClearCost AI';

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB';

  const u = ['B', 'KB', 'MB', 'GB'];

  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    u.length - 1
  );

  return `${(bytes / 1024 ** i).toFixed(i ? 2 : 0)} ${u[i]}`;
}

const fileKey = f =>
  `${f.name}-${f.size}-${f.lastModified}`;

function addFiles(list) {
  for (
    const file of Array.from(list).filter(
      f =>
        f.type === 'application/pdf' ||
        f.name.toLowerCase().endsWith('.pdf')
    )
  ) {
    if (
      !state.files.some(
        x => fileKey(x) === fileKey(file)
      )
    ) {
      state.files.push(file);
    }
  }

  state.results = [];
  state.extractions = [];

  renderQueue();
}

function renderQueue() {
  el.statementQueue.innerHTML = '';

  for (const file of state.files) {
    const card =
      document.createElement('article');

    card.className = 'file-card';

    card.innerHTML = `
      <div>
        <strong></strong>
        <small>${formatBytes(file.size)} · Ready for validation</small>
      </div>
      <button
        class="remove-file"
        type="button"
        aria-label="Remove file"
      >×</button>
    `;

    card.querySelector('strong').textContent =
      file.name;

    card.querySelector('button').onclick = () => {
      state.files =
        state.files.filter(
          f =>
            fileKey(f) !==
            fileKey(file)
        );

      state.results = [];
      state.extractions = [];

      renderQueue();
    };

    el.statementQueue.append(card);
  }

  el.statementCount.textContent =
    state.files.length;

  el.totalSize.textContent =
    formatBytes(
      state.files.reduce(
        (s, f) => s + f.size,
        0
      )
    );

  el.emptyQueue.hidden =
    !!state.files.length;

  el.clearQueue.disabled =
    !state.files.length;

  el.continueButton.disabled =
    !state.files.length;

  el.fileStatus.textContent =
    state.files.length
      ? `${state.files.length} PDF file${state.files.length === 1 ? '' : 's'} loaded`
      : 'Waiting for statement selection';
}

function setText(id, text) {
  $(id).textContent = text;
}

function countMeaningfulTextCharacters(text) {
  return String(text || '')
    .replace(/\s/g, '')
    .replace(/[.\-_,;:'"`~|/\\()[\]{}]/g, '')
    .length;
}

async function inspectPageGraphics(page) {
  try {
    const operatorList =
      await page.getOperatorList();

    const OPS =
      pdfjsLib.OPS || {};

    let imageCount = 0;
    let paintCount = 0;

    for (
      const fn of
      operatorList.fnArray || []
    ) {
      if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageMaskXObject ||
        fn === OPS.paintSolidColorImageMask
      ) {
        imageCount += 1;
      }

      if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageMaskXObject ||
        fn === OPS.paintSolidColorImageMask ||
        fn === OPS.stroke ||
        fn === OPS.fill ||
        fn === OPS.eoFill ||
        fn === OPS.fillStroke ||
        fn === OPS.eoFillStroke ||
        fn === OPS.shadingFill
      ) {
        paintCount += 1;
      }
    }

    return {
      imageCount,
      paintCount
    };

  } catch (error) {
    console.warn(
      'Unable to inspect page graphics:',
      error
    );

    return {
      imageCount: 0,
      paintCount: 0
    };
  }
}

async function inspectPage(page, index) {
  const textContent =
    await page.getTextContent();

  const text =
    textContent.items
      .map(item => item.str)
      .join('\n')
      .trim();

  const rawCharCount =
    text.replace(/\s/g, '').length;

  const meaningfulCharCount =
    countMeaningfulTextCharacters(text);

  const printed =
    extractPrintedPage(text);

  const viewport =
    page.getViewport({
      scale: 1
    });

  const rotation =
    ((viewport.rotation % 360) + 360) % 360;

  const graphics =
    await inspectPageGraphics(page);

  const hasMeaningfulText =
    meaningfulCharCount >= 20;

  const hasSomeMeaningfulText =
    meaningfulCharCount > 0;

  const hasImageContent =
    graphics.imageCount > 0;

  const blankNonDataPage =
    !hasSomeMeaningfulText &&
    !hasImageContent;

  const ocrRequired =
    !hasMeaningfulText &&
    hasImageContent;

  const hasText =
    hasMeaningfulText;

  const readable =
    blankNonDataPage ||
    hasSomeMeaningfulText ||
    hasImageContent;

  const fingerprintSource =
    text
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const fingerprint =
    stableHash(
      fingerprintSource ||
      (
        blankNonDataPage
          ? `blank-page-${index}-${viewport.width}x${viewport.height}`
          : `image-page-${index}-${viewport.width}x${viewport.height}-${graphics.imageCount}`
      )
    );

  return {
    index,
    text,
    hasText,
    ocrRequired,
    blankNonDataPage,
    printed,
    rotation,
    readable,
    charCount: rawCharCount,
    meaningfulCharCount,
    imageCount: graphics.imageCount,
    paintCount: graphics.paintCount,
    fingerprint
  };
}

async function inspectFile(file) {
  const bytes =
    new Uint8Array(
      await file.arrayBuffer()
    );

  const pdf =
    await pdfjsLib
      .getDocument({
        data: bytes
      })
      .promise;

  const pages = [];

  for (
    let i = 1;
    i <= pdf.numPages;
    i++
  ) {
    pages.push(
      await inspectPage(
        await pdf.getPage(i),
        i
      )
    );
  }

  const joined =
    pages
      .map(p => p.text)
      .join('\n');

  const duplicates = [];
  const hashes = new Map();

  for (const p of pages) {
    if (p.blankNonDataPage) {
      continue;
    }

    if (
      hashes.has(
        p.fingerprint
      )
    ) {
      duplicates.push([
        hashes.get(
          p.fingerprint
        ),
        p.index
      ]);

    } else {
      hashes.set(
        p.fingerprint,
        p.index
      );
    }
  }

  const sequence =
    detectMissingAndOrder(
      pages.map(
        p => p.printed
      )
    );

  return {
    name: file.name,
    pageCount: pdf.numPages,
    pages,
    period:
      extractStatementPeriod(
        joined
      ),
    mid:
      extractMid(
        joined
      ),
    merchant:
      extractMerchantName(
        joined
      ),
    duplicates,
    missing:
      sequence.missing,
    outOfOrder:
      sequence.outOfOrder,
    expectedTotal:
      sequence.expectedTotal
  };
}

function summarize() {
  const allPages =
    state.results.flatMap(
      r => r.pages
    );

  const identity =
    compareIdentity(
      state.results
    );

  const total =
    allPages.length;

  const ocr =
    allPages.filter(
      p => p.ocrRequired
    ).length;

  const blankPages =
    allPages.filter(
      p => p.blankNonDataPage
    ).length;

  const rotated =
    allPages
      .filter(
        p => p.rotation !== 0
      )
      .map(
        p => p.index
      );

  const unreadable =
    allPages
      .filter(
        p => !p.readable
      )
      .map(
        p => p.index
      );

  console.log(
    'OCR REQUIRED PAGES:',
    state.results.flatMap(
      result =>
        result.pages
          .filter(
            page =>
              page.ocrRequired
          )
          .map(
            page => ({
              file:
                result.name,
              page:
                page.index,
              ocrRequired:
                page.ocrRequired,
              blankNonDataPage:
                page.blankNonDataPage,
              meaningfulCharCount:
                page.meaningfulCharCount,
              imageCount:
                page.imageCount,
              readable:
                page.readable
            })
          )
    )
  );

  console.log(
    'BLANK NON-DATA PAGES:',
    state.results.flatMap(
      result =>
        result.pages
          .filter(
            page =>
              page.blankNonDataPage
          )
          .map(
            page => ({
              file:
                result.name,
              page:
                page.index,
              meaningfulCharCount:
                page.meaningfulCharCount,
              imageCount:
                page.imageCount
            })
          )
    )
  );

  const missing =
    state.results.flatMap(
      r =>
        r.missing.map(
          p =>
            `${r.name}: ${p}`
        )
    );

  const duplicates =
    state.results.flatMap(
      r =>
        r.duplicates.map(
          ([a, b]) =>
            `${r.name}: ${a}/${b}`
        )
    );

  const order =
    state.results.flatMap(
      r =>
        r.outOfOrder.map(
          p =>
            `${r.name}: ${p}`
        )
    );

  setText(
    'pageCountStatus',
    `${total} page${total === 1 ? '' : 's'}`
  );

  setText(
    'textLayerStatus',
    `${total - ocr - blankPages} text page(s) · ${blankPages} blank/non-data page(s)`
  );

  setText(
    'ocrRequiredStatus',
    ocr
      ? `${ocr} page${ocr === 1 ? '' : 's'}`
      : 'No'
  );

  setText(
    'periodStatus',
    identity.periodMatch
      ? identity.periods.length
        ? 'Match'
        : 'Not detected'
      : 'Mismatch'
  );
    setText(
    'merchantStatus',
    identity.midMatch &&
      identity.merchantMatch
      ? identity.mids.length ||
        identity.merchants.length
        ? 'Match'
        : 'Not detected'
      : 'Mismatch'
  );

  setText(
    'missingStatus',
    missing.length
      ? missing.join('; ')
      : 'None detected'
  );

  setText(
    'duplicateStatus',
    duplicates.length
      ? duplicates.join('; ')
      : 'None detected'
  );

  setText(
    'rotationStatus',
    rotated.length
      ? `${rotated.length} page(s)`
      : 'None'
  );

  setText(
    'readabilityStatus',
    unreadable.length
      ? `${unreadable.length} page(s) need review`
      : 'Pass'
  );

  setText(
    'orderStatus',
    order.length
      ? order.join('; ')
      : 'Pass'
  );

  const errors = [
    !identity.periodMatch,
    !identity.midMatch,
    !identity.merchantMatch,
    missing.length,
    order.length
  ].filter(Boolean).length;

  const warnings = [
    ocr,
    duplicates.length,
    rotated.length,
    unreadable.length,
    !identity.periods.length,
    !identity.mids.length &&
      !identity.merchants.length
  ].filter(Boolean).length;

  const notice =
    $('validationNotice');

  notice.className =
    `notice ${
      errors
        ? 'error'
        : warnings
          ? 'warning'
          : 'ok'
    }`;

  notice.innerHTML =
    errors
      ? `<strong>Validation failed</strong><p>${errors} blocking issue(s) found. Fee analysis must not continue until resolved.</p>`
      : warnings
        ? `<strong>Review required</strong><p>No blocking identity or page-sequence mismatch was found, but ${warnings} warning category(s) require review.</p>`
        : `<strong>Validation passed</strong><p>Document integrity checks passed. The statements are ready for the next extraction stage.</p>`;

  setText(
    'pageValidationStatus',
    errors
      ? 'Failed'
      : warnings
        ? 'Review required'
        : 'Passed'
  );

  if (el.extractButton) {
    el.extractButton.disabled =
      !!errors;

    el.extractButton.dataset.blocked =
      errors
        ? 'true'
        : 'false';
  }

  setText(
    'identityStatus',
    identity.periodMatch &&
      identity.midMatch &&
      identity.merchantMatch
      ? 'Passed'
      : 'Failed'
  );

  setText(
    'ocrStatus',
    ocr
      ? `${ocr} page(s) require OCR`
      : blankPages
        ? `Text layer available · ${blankPages} blank/non-data page(s)`
        : 'Text layer available'
  );
}

function renderValidation() {
  el.validationFiles.innerHTML = '';

  el.validationLoaded.textContent =
    state.results.length;

  for (const r of state.results) {
    const card =
      document.createElement('article');

    card.className =
      'file-card';

    const ocrCount =
      r.pages.filter(
        p => p.ocrRequired
      ).length;

    const blankCount =
      r.pages.filter(
        p => p.blankNonDataPage
      ).length;

    const issues =
      r.missing.length +
      r.duplicates.length +
      r.outOfOrder.length +
      r.pages.filter(
        p =>
          p.rotation !== 0 ||
          !p.readable
      ).length;

    const periodText =
      !r.period
        ? 'Not detected'
        : r.period === '__mixed_periods__'
          ? 'Multiple conflicting periods detected'
          : r.period;

    card.innerHTML = `
      <div>
        <strong></strong>
        <small>
          ${r.pageCount} page(s) ·
          ${ocrCount} OCR-required ·
          ${blankCount} blank/non-data ·
          ${issues ? `${issues} issue(s)` : 'validated'}
          <br>Detected period: ${periodText}
          <br>Extracted date text: ${
            r.pages
              .map(p => p.text)
              .join(' ')
              .match(
                /.{0,60}(?:statement|processing|period|date).{0,100}/ig
              )
              ?.slice(0, 5)
              .join(' | ') ||
            'No relevant date text found'
          }
        </small>
      </div>
      <span aria-hidden="true">${issues ? '⚠' : '✓'}</span>
    `;

    card
      .querySelector('strong')
      .textContent =
      r.name;

    el.validationFiles.append(
      card
    );
  }

  summarize();
}

async function validate() {
  el.continueButton.disabled =
    true;

  el.continueButton.textContent =
    'Validating…';

  setText(
    'pageValidationStatus',
    'Reading PDF pages'
  );

  try {
    state.results = [];

    for (
      const file of
      state.files
    ) {
      state.results.push(
        await inspectFile(
          file
        )
      );
    }

    renderValidation();

    navigate(
      'validation'
    );

  } catch (error) {
    const notice =
      $('validationNotice');

    notice.className =
      'notice error';

    notice.innerHTML =
      `<strong>PDF validation error</strong><p>${String(
        error.message ||
        error
      )}</p>`;

    navigate(
      'validation'
    );

  } finally {
    el.continueButton.disabled =
      !state.files.length;

    el.continueButton.textContent =
      'Validate Statements';
  }
}

document.addEventListener(
  'click',
  e => {
    const b =
      e.target.closest(
        '[data-screen]'
      );

    if (b) {
      navigate(
        b.dataset.screen
      );
    }
  }
);

el.pdfInput.addEventListener(
  'change',
  e =>
    addFiles(
      e.target.files
    )
);

el.clearQueue.onclick = () => {
  state.files = [];
  state.results = [];
  state.extractions = [];

  el.pdfInput.value = '';

  renderQueue();
};

el.continueButton.onclick =
  validate;

[
  'dragenter',
  'dragover'
].forEach(
  n =>
    el.dropZone.addEventListener(
      n,
      e => {
        e.preventDefault();

        el.dropZone.classList.add(
          'dragover'
        );
      }
    )
);

[
  'dragleave',
  'drop'
].forEach(
  n =>
    el.dropZone.addEventListener(
      n,
      e => {
        e.preventDefault();

        el.dropZone.classList.remove(
          'dragover'
        );
      }
    )
);

el.dropZone.addEventListener(
  'drop',
  e =>
    addFiles(
      e.dataTransfer.files
    )
);

function displayField(
  label,
  item
) {
  const value =
    item?.value ||
    'Not detected';

  const confidence =
    item
      ? `${Math.round(
          item.confidence *
          100
        )}%`
      : '—';

  const evidence =
    item
      ? `<details><summary>Evidence</summary><div class="raw-evidence">Page ${item.page}${item.line ? `, line ${item.line}` : ''}: ${escapeHtml(item.rawText)}</div></details>`
      : '';

  return `
    <article class="result-card">
      <header>
        <div>
          <strong>${label}</strong>
          <small>${escapeHtml(value)}</small>
        </div>
        <span class="confidence">${confidence}</span>
      </header>
      ${evidence}
    </article>
  `;
}

function escapeHtml(
  value = ''
) {
  return String(value)
    .replace(
      /[&<>"]/g,
      c =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;'
        })[c]
    );
}

function metricEvidence(
  metric
) {
  if (!metric) {
    return '';
  }

  const evidence =
    metric.evidence;

  const assumptions =
    Array.isArray(
      metric.assumptions
    )
      ? metric.assumptions
      : [];

  if (
    !evidence &&
    !assumptions.length
  ) {
    return '';
  }

  const parts =
    [];

  if (evidence) {
    if (
      evidence.page !==
      undefined
    ) {
      parts.push(
        `Page: ${escapeHtml(
          evidence.page
        )}`
      );
    }

    if (
      evidence.line !==
      undefined
    ) {
      parts.push(
        `Line: ${escapeHtml(
          evidence.line
        )}`
      );
    }

    if (
      evidence.rawText
    ) {
      parts.push(
        `Raw text: ${escapeHtml(
          evidence.rawText
        )}`
      );
    }

    if (
      evidence.sourceType
    ) {
      parts.push(
        `Extraction method: ${escapeHtml(
          evidence.sourceType
        )}`
      );
    }

    if (
      evidence.label
    ) {
      parts.push(
        `Matched label: ${escapeHtml(
          evidence.label
        )}`
      );
    }

    if (
      evidence.signedStatementValue !==
      undefined
    ) {
      parts.push(
        `Signed statement value: ${escapeHtml(
          evidence.signedStatementValue
        )}`
      );
    }
  }

  if (
    metric.confidence !==
    undefined
  ) {
    parts.push(
      `Confidence: ${Math.round(
        (
          metric.confidence ||
          0
        ) *
        100
      )}%`
    );
  }

  if (
    assumptions.length
  ) {
    parts.push(
      `Assumptions: ${escapeHtml(
        assumptions.join(
          ' | '
        )
      )}`
    );
  }

  return `
    <details>
      <summary>Evidence</summary>
      <div class="raw-evidence">
        ${parts.join('<br>')}
      </div>
    </details>
  `;
}

function metricRow(
  label,
  metric
) {
  if (!metric) {
    return '';
  }

  if (
    metric.status ===
    'insufficient_evidence'
  ) {
    return `
      <div class="status-row">
        <span>${escapeHtml(label)}</span>
        <strong>Insufficient evidence</strong>
      </div>
      ${metricEvidence(metric)}
    `;
  }

  const raw =
    metric.value;

  let v =
    '—';

  if (
    typeof raw ===
    'number'
  ) {
    if (
      label ===
      'Transaction Count'
    ) {
      v =
        Math.round(
          raw
        ).toLocaleString(
          'en-US'
        );

    } else if (
      metric.formula ===
      'total_fees / gross_volume'
    ) {
      v =
        `${(raw * 100).toFixed(3)}%`;

    } else {
      v =
        raw.toLocaleString(
          'en-US',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }
        );
    }
  }

  const tag =
    metric.status ===
    'derived'
      ? ' (derived)'
      : '';

  return `
    <div class="status-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(v)}${tag}</strong>
    </div>
    ${metricEvidence(metric)}
  `;
}function renderIntelligenceDiagnostic(
  diagnostic
) {
  const diag =
    $('intelligenceDiagnostic');

  if (!diag) {
    return;
  }

  const r =
    diagnostic.reconciliation;

  const m =
    diagnostic.metrics;

  const statusColor =
    {
      reconciled:
        'ok',
      partially_reconciled:
        'warning',
      not_reconciled:
        'error',
      insufficient_evidence:
        'warning'
    }[r.status] ||
    'warning';

  const warnCount =
    diagnostic.warnings.filter(
      w =>
        w.severity ===
          'warning' ||
        w.severity ===
          'error'
    ).length;

  const statementBlock =
    `<article class="result-card">` +

    `<header>` +
    `<div>` +
    `<strong>${escapeHtml(diagnostic.sourceFile)}</strong>` +
    `<small>Statement Intelligence Diagnostic</small>` +
    `</div>` +
    `<span class="confidence">${Math.round((diagnostic.overallConfidence || 0) * 100)}%</span>` +
    `</header>` +

    `<div class="status-panel">` +

    `<div class="status-row">` +
    `<span>Schema version</span>` +
    `<strong>${escapeHtml(diagnostic.schemaVersion)}</strong>` +
    `</div>` +

    `<div class="status-row">` +
    `<span>Overall confidence</span>` +
    `<strong>${Math.round((diagnostic.overallConfidence || 0) * 100)}%</strong>` +
    `</div>` +

    `<div class="status-row">` +
    `<span>Warnings</span>` +
    `<strong>${warnCount ? `${warnCount} warning(s)` : 'None'}</strong>` +
    `</div>` +

    `<div class="status-row">` +
    `<span>Unknown fees queued</span>` +
    `<strong>${diagnostic.unknownFees.length}</strong>` +
    `</div>` +

    `</div>` +

    `<div class="queue-header">` +
    `<h3>Merchant Metrics</h3>` +
    `</div>` +

    `<div class="status-panel">` +

    metricRow(
      'Gross Volume',
      m.grossVolume
    ) +

    metricRow(
      'Transaction Count',
      m.transactionCount
    ) +

    metricRow(
      'Total Fees',
      m.totalFees
    ) +

    metricRow(
      'Effective Rate',
      m.effectiveRate
    ) +

    metricRow(
      'Average Ticket',
      m.averageTicket
    ) +

    `</div>` +

    `<div class="queue-header">` +
    `<h3>Reconciliation</h3>` +
    `</div>` +

    `<div class="notice ${statusColor}">` +

    `<strong>Status: ${escapeHtml(
      r.status.replaceAll(
        '_',
        ' '
      )
    )}</strong>` +

    (
      r.feeStatementTotal !== null
        ? `<p>Extracted: $${r.feeExtracted.toFixed(2)} · Statement: $${r.feeStatementTotal.toFixed(2)} · Variance: $${r.feeVariance.toFixed(2)} · Tolerance: $${r.tolerance.toFixed(2)}</p>`
        : `<p>Statement fee total not found in document; reconciliation cannot be assessed.</p>`
    ) +

    (
      r.proposalBlocked
        ? `<p><em>Savings and proposal generation blocked: ${escapeHtml(r.blockReason || 'reconciliation incomplete')}</em></p>`
        : ''
    ) +

    `</div>`;

  let warningBlock =
    '';

  if (
    diagnostic.warnings.length
  ) {
    warningBlock =
      `<div class="queue-header">` +
      `<h3>Warnings</h3>` +
      `</div>` +

      `<div class="status-panel">` +

      diagnostic.warnings
        .map(
          w =>
            `<div class="status-row">` +
            `<span>${escapeHtml(
              w.code.replaceAll(
                '_',
                ' '
              )
            )}</span>` +
            `<strong>${escapeHtml(
              w.message
            )}</strong>` +
            `</div>`
        )
        .join('') +

      `</div>`;
  }

  diag.insertAdjacentHTML(
    'beforeend',
    statementBlock +
      warningBlock +
      `</article>`
  );
}

function renderExtraction() {
  const metadata =
    $('metadataResults');

  const sections =
    $('sectionResults');

  const fees =
    $('feeCandidateResults');

  const summary =
    $('extractionSummary');

  metadata.innerHTML =
    '';

  sections.innerHTML =
    '';

  fees.innerHTML =
    '';

  const intelligenceDiag =
    $('intelligenceDiagnostic');

  if (
    intelligenceDiag
  ) {
    intelligenceDiag.innerHTML =
      '';
  }

  const totalSections =
    state.extractions.reduce(
      (
        n,
        x
      ) =>
        n +
        x.sections.length,
      0
    );

  const totalFees =
    state.extractions.reduce(
      (
        n,
        x
      ) =>
        n +
        x.feeCandidates.length,
      0
    );

  const classified =
    state.extractions.reduce(
      (
        n,
        x
      ) =>
        n +
        (
          x.feeSummary
            ?.classified ||
          0
        ),
      0
    );

  const unknown =
    state.extractions.reduce(
      (
        n,
        x
      ) =>
        n +
        (
          x.feeSummary
            ?.unknown ||
          0
        ),
      0
    );

  const totalOcrPages =
    state.extractions.reduce(
      (
        n,
        x
      ) =>
        n +
        (
          x.validation
            ?.ocrPageCount ||
          0
        ),
      0
    );

  const totalUnknownQueued =
    state.extractions.reduce(
      (
        n,
        x
      ) =>
        n +
        (
          x.unknownFees
            ?.length ||
          0
        ),
      0
    );

  summary.innerHTML =
    `<div class="status-row"><span>Statements mapped</span><strong>${state.extractions.length}</strong></div>` +
    `<div class="status-row"><span>Sections detected</span><strong>${totalSections}</strong></div>` +
    `<div class="status-row"><span>Fees found</span><strong>${totalFees}</strong></div>` +
    `<div class="status-row"><span>Classified</span><strong>${classified}</strong></div>` +
    `<div class="status-row"><span>Needs review</span><strong>${unknown}</strong></div>` +
    `<div class="status-row"><span>OCR-required pages</span><strong>${totalOcrPages}</strong></div>` +
    `<div class="status-row"><span>Unknown fees queued</span><strong>${totalUnknownQueued}</strong></div>`;

  for (
    const x of
    state.extractions
  ) {
    const m =
      x.metadata;

    const candidate =
      x.processor
        .strongestCandidate;

    const processorStatus =
      x.processor
        .requiresReview
        ? 'Requires review'
        : 'Confirmed';

    const processorSummary =
      x.processor
        .requiresReview
        ? `Processor: ${escapeHtml(x.processor.name)} · ${escapeHtml(processorStatus)}${candidate?.processor ? ` · Candidate: ${escapeHtml(candidate.processor)} (${Math.round((candidate.confidence || 0) * 100)}%)` : ''}`
        : `Processor: ${escapeHtml(x.processor.detectedName || x.processor.name)} · ${escapeHtml(processorStatus)}`;

    metadata.insertAdjacentHTML(
      'beforeend',

      `<article class="result-card">` +

      `<header>` +
      `<div>` +
      `<strong>${escapeHtml(x.sourceFile)}</strong>` +
      `<small>${processorSummary} · Rule pack: ${escapeHtml(x.processor.rulePack || 'Generic Processor')} (${escapeHtml(x.processor.rulePackVersion || 'n/a')})</small>` +
      `</div>` +
      `<span class="confidence">${Math.round(x.processor.confidence * 100)}%</span>` +
      `</header>` +

      (
        x.processor.fallbackReason
          ? `<small>${escapeHtml(x.processor.fallbackReason)}</small>`
          : ''
      ) +

      (
        x.processor.evidence.length
          ? `<details>` +
            `<summary>Processor evidence</summary>` +
            `<div class="raw-evidence">` +
            x.processor.evidence
              .map(
                item =>
                  `${escapeHtml(item.processor)} (${Math.round(item.confidence * 100)}%): ${escapeHtml(
                    item.evidence
                      .map(
                        e =>
                          e.match ||
                          e.alias ||
                          e.pattern
                      )
                      .join(' | ')
                  )}`
              )
              .join('<br>') +
            `</div>` +
            `</details>`
          : ''
      ) +

      `</article>` +

      displayField(
        'Merchant name',
        m.merchantName
      ) +

      displayField(
        'Merchant ID',
        m.merchantId
      ) +

      displayField(
        'Terminal ID',
        m.terminalId
      ) +

      displayField(
        'Statement period',
        m.statementPeriod
      ) +

      displayField(
        'Address',
        m.address
      )
    );

    const chips =
      Object.entries(
        x.sectionCounts
      )
        .map(
          (
            [
              k,
              v
            ]
          ) =>
            `<span class="section-chip">${escapeHtml(
              k.replaceAll(
                '_',
                ' '
              )
            )}: ${v}</span>`
        )
        .join('');

    sections.insertAdjacentHTML(
      'beforeend',

      `<article class="result-card">` +

      `<strong>${escapeHtml(x.sourceFile)}</strong>` +

      `<small>${x.sections.length} section block(s) identified</small>` +

      `<div>${chips}</div>` +

      `<details>` +
      `<summary>View document map</summary>` +

      `<div class="raw-evidence">` +

      x.sections
        .map(
          s =>
            `Page ${s.page}, lines ${s.startLine}-${s.endLine}: ${escapeHtml(s.heading)} [${s.type}]`
        )
        .join('<br>') +

      `</div>` +

      `</details>` +

      `</article>`
    );

    if (
      !x.feeCandidates.length
    ) {
      fees.insertAdjacentHTML(
        'beforeend',

        `<article class="result-card">` +
        `<strong>${escapeHtml(x.sourceFile)}</strong>` +
        `<small>No fee candidates were extracted from detected fee sections. This is not a reconciliation result.</small>` +
        `</article>`
      );
    }

    for (
      const f of
      x.feeCandidates.slice(
        0,
        100
      )
    ) {
      const isClassified =
        f.status ===
        'classified';

      const title =
        isClassified
          ? `${escapeHtml(f.standardName)} <small>(${escapeHtml(f.canonicalId)})</small>`
          : `${escapeHtml(f.originalDescription)} <small>(Unknown fee)</small>`;

      const detail =
        isClassified
          ? `${escapeHtml(f.bucket.replaceAll('_', ' '))} · ${escapeHtml(f.category.replaceAll('_', ' '))} · Rule ${escapeHtml(f.ruleId)}`
          : `Needs review · Suggested broad bucket: ${escapeHtml((f.suggestedBucket || 'unknown').replaceAll('_', ' '))}`;

      fees.insertAdjacentHTML(
        'beforeend',

        `<article class="result-card">` +

        `<header>` +
        `<div>` +
        `<strong>${title}</strong>` +
        `<small>$${f.amount.toFixed(2)} · Page ${f.page}, line ${f.line} · ${detail}</small>` +
        `</div>` +
        `<span class="confidence">${Math.round((f.classificationConfidence || 0) * 100)}%</span>` +
        `</header>` +

        `<details>` +
        `<summary>Original statement evidence</summary>` +
        `<div class="raw-evidence">${escapeHtml(f.rawText)}</div>` +
        `</details>` +

        `</article>`
      );
    }
  }

  if (
    intelligenceDiag
  ) {
    intelligenceDiag.insertAdjacentHTML(
      'beforeend',

      `<div class="queue-header">` +
      `<h3>Sprint 5.0 — Batch Diagnostic</h3>` +
      `</div>` +

      `<div class="status-panel">` +

      `<div class="status-row">` +
      `<span>Statements analyzed</span>` +
      `<strong>${state.extractions.length}</strong>` +
      `</div>` +

      `<div class="status-row">` +
      `<span>Total OCR-required pages</span>` +
      `<strong>${totalOcrPages}</strong>` +
      `</div>` +

      `<div class="status-row">` +
      `<span>Total unknown fees queued</span>` +
      `<strong>${totalUnknownQueued}</strong>` +
      `</div>` +

      `</div>`
    );

    for (
      const x of
      state.extractions
    ) {
      if (
        x.metrics
      ) {
        renderIntelligenceDiagnostic(
          x
        );
      }
    }
  }

  const notice =
    $('extractionNotice');

  notice.className =
    'notice warning';

  notice.innerHTML =
    `<strong>Sprint 5.0 Statement Intelligence Pipeline active</strong><p>Pipeline orchestrates PDF validation, processor identification, structure discovery, fee classification, merchant metrics, and reconciliation readiness. Internal diagnostic summary shown above. Savings and proposal generation are blocked until reconciliation is confirmed.</p>`;
}

function firstMetricValue(
  metric
) {
  return (
    metric &&
    typeof metric.value ===
      'number'
  )
    ? metric.value
    : null;
}

function currentDiagnostic() {
  return state.extractions.length
    ? state.extractions[0]
    : null;
}

function profitNumber(
  id
) {
  const node =
    $(id);

  if (!node) {
    return 0;
  }

  const value =
    Number(
      node.value
    );

  return Number.isFinite(
    value
  )
    ? value
    : 0;
}

function selectedProgram() {
  const node =
    $('profitProgram');

  return node
    ? node.value
    : 'traditional';
}

function updateProfitFieldVisibility() {
  const program =
    selectedProgram();

  document
    .querySelectorAll(
      '[data-profit-program]'
    )
    .forEach(
      node => {
        const allowed =
          (
            node.dataset
              .profitProgram ||
            ''
          ).split(' ');

        node.hidden =
          !allowed.includes(
            program
          );
      }
    );
}

function applyAgentSettingsToProfit() {
  if ($('profitIsoProcessor')) {
    $('profitIsoProcessor').value =
      agentSettings.isoProcessorName;
  }

  if ($('agentSplit')) {
    $('agentSplit').value =
      agentSettings.agentSplitPercent ?? '';
  }

  if ($('verifyAgentSplit')) {
    $('verifyAgentSplit').checked =
      agentSettings.agentSplitVerified;
  }

  if ($('minimumResidualProfit')) {
    $('minimumResidualProfit').value =
      agentSettings.minimumMonthlyResidual;
  }
}

function applyAgentSettingsToForm() {
  const fields = {
    settingsConsultantName: agentSettings.consultantName,
    settingsPhone: agentSettings.phone,
    settingsEmail: agentSettings.email,
    settingsIsoProcessor: agentSettings.isoProcessorName,
    settingsAgentSplit: agentSettings.agentSplitPercent ?? '',
    settingsMinimumResidual: agentSettings.minimumMonthlyResidual
  };

  for (const [id, value] of Object.entries(fields)) {
    if ($(id)) $(id).value = value;
  }

  if ($('settingsAgentSplitVerified')) {
    $('settingsAgentSplitVerified').checked =
      agentSettings.agentSplitVerified;
  }

  applyAgentSettingsToProfit();
}

function saveAgentSettings() {
  const status = $('agentSettingsStatus');

  try {
    agentSettings = agentSettingsStore.save({
      consultantName: $('settingsConsultantName')?.value,
      phone: $('settingsPhone')?.value,
      email: $('settingsEmail')?.value,
      isoProcessorName: $('settingsIsoProcessor')?.value,
      agentSplitPercent: $('settingsAgentSplit')?.value,
      agentSplitVerified:
        $('settingsAgentSplitVerified')?.checked === true,
      minimumMonthlyResidual:
        $('settingsMinimumResidual')?.value
    });

    applyAgentSettingsToForm();

    if (status) {
      status.innerHTML =
        `<div class="notice ok">` +
        `<strong>Agent settings saved</strong>` +
        `<p>${escapeHtml(agentSettings.isoProcessorName || 'ISO not set')} · ` +
        `${agentSettings.agentSplitPercent ?? 'Split not set'}${agentSettings.agentSplitPercent === null ? '' : '% agent split'}</p>` +
        `</div>`;
    }
  } catch (error) {
    if (status) {
      status.innerHTML =
        `<div class="notice error">` +
        `<strong>Settings not saved</strong>` +
        `<p>${escapeHtml(String(error.message || error))}</p>` +
        `</div>`;
    }
  }
}

function renderScheduleAProfiles() {
  const list = $('scheduleAList');
  if (!list) return;
  const profiles = scheduleARegistry.load();
  list.innerHTML = profiles.length
    ? profiles.map(profile =>
        `<article class="result-card">` +
        `<strong>${escapeHtml(profile.isoProcessorName)}</strong>` +
        `<p>Effective ${escapeHtml(profile.effectiveDate)} · ` +
        `${escapeHtml(profile.fileName)}</p>` +
        `<small>${profile.extractionStatus === 'extracted'
          ? `${profile.terms.length} terms extracted`
          : 'Extraction pending'} · ` +
        `${profile.termsVerified ? 'Terms verified' : 'Terms not verified'}</small>` +
        `<button class="secondary full-width schedule-a-action" type="button" ` +
        `data-schedule-action="${profile.extractionStatus === 'extracted' ? 'review' : 'extract'}" ` +
        `data-profile-id="${escapeHtml(profile.id)}">` +
        `${profile.extractionStatus === 'extracted' ? 'Review Terms' : 'Extract Terms'}` +
        `</button>` +
        (profile.extractionStatus === 'extracted'
          ? `<button class="secondary full-width schedule-a-action" type="button" ` +
            `data-schedule-action="reextract" ` +
            `data-profile-id="${escapeHtml(profile.id)}">Re-extract Terms</button>`
          : '') +
        `</article>`
      ).join('')
    : '<div class="empty-state">No Schedule A versions uploaded.</div>';
}

async function scheduleAPdfText(pdfBlob, status) {
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pageRecords = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pageRecords.push({
      page,
      text: content.items.map(item => item.str).join('\n').trim()
    });
  }
  const directText = pageRecords.map(record => record.text).join('\n');
  if (countMeaningfulTextCharacters(directText) >= 100) {
    return { text: directText, source: 'pdf_text' };
  }

  if (status) {
    status.innerHTML =
      `<div class="notice warning"><strong>Scanned PDF detected</strong>` +
      `<p>Running OCR locally on this device. This can take a minute.</p></div>`;
  }
  const tesseractModule = await import(
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js'
  );
  const createWorker = ClearCostScheduleAExtraction.resolveCreateWorker(
    tesseractModule
  );
  const worker = await createWorker('eng', 1, {
    logger(message) {
      if (status && message.status === 'recognizing text') {
        status.innerHTML =
          `<div class="notice warning"><strong>Reading Schedule A</strong>` +
          `<p>OCR ${Math.round((message.progress || 0) * 100)}% complete</p></div>`;
      }
    }
  });
  const pageTexts = [];
  try {
    for (const record of pageRecords) {
      const viewport = record.page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await record.page.render({
        canvasContext: canvas.getContext('2d'),
        viewport
      }).promise;
      const result = await worker.recognize(canvas);
      pageTexts.push(result.data.text || '');
    }

    const firstPassText = pageTexts.join('\n');
    const firstPass = window.ClearCostScheduleAExtraction.extractionResult(
      firstPassText,
      'ocr'
    );
    if (firstPass.status !== 'incomplete') {
      return { text: firstPassText, source: 'ocr' };
    }

    if (status) {
      status.innerHTML =
        `<div class="notice warning"><strong>Checking incomplete OCR</strong>` +
        `<p>The first pass missed pricing rows. Running a higher-resolution table scan.</p></div>`;
    }
    await worker.setParameters({
      tessedit_pageseg_mode: '11',
      preserve_interword_spaces: '1'
    });
    const retryTexts = [];
    for (const record of pageRecords) {
      const viewport = record.page.getViewport({ scale: 3 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const canvasContext = canvas.getContext('2d');
      canvasContext.fillStyle = '#ffffff';
      canvasContext.fillRect(0, 0, canvas.width, canvas.height);
      await record.page.render({
        canvasContext,
        viewport
      }).promise;
      const result = await worker.recognize(canvas);
      retryTexts.push(result.data.text || '');
    }
    return {
      text: `${firstPassText}\n${retryTexts.join('\n')}`,
      source: 'ocr_retry'
    };
  } finally {
    await worker.terminate();
  }
}

function renderScheduleAReview(profile) {
  const review = $('scheduleAReview');
  if (!review) return;
  if (!profile || profile.extractionStatus !== 'extracted') {
    review.innerHTML = '';
    return;
  }
  review.innerHTML =
    `<div class="queue-header"><h3>Review Extracted Terms</h3></div>` +
    `<div class="notice warning"><strong>Agent verification required</strong>` +
    `<p>Compare every value with the source PDF. Edit any OCR error, then check every row.</p></div>` +
    `<div class="settings-card" data-review-profile="${escapeHtml(profile.id)}">` +
    profile.terms.map((term, index) =>
      `<div class="schedule-term" data-term-index="${index}">` +
      `<strong class="schedule-term-label">${escapeHtml(term.label)}</strong>` +
      `<label><input class="schedule-term-verified" type="checkbox" ` +
      `${term.verified ? 'checked' : ''}> Verified</label>` +
      `<input class="schedule-term-value" type="text" value="${escapeHtml(term.value)}" ` +
      `aria-label="${escapeHtml(term.label)} value">` +
      `<small>${escapeHtml(term.scope)} · Source: ${escapeHtml(term.evidence)}</small>` +
      `</div>`
    ).join('') +
    `</div>` +
    `<button id="addScheduleATerm" class="secondary full-width" type="button">` +
    `Add Missing Term</button>` +
    `<div class="settings-card"><label><input id="confirmScheduleACoverage" ` +
    `type="checkbox"> I confirm every row in the source Schedule A is represented</label></div>` +
    `<button id="verifyScheduleATerms" class="primary full-width" type="button">` +
    `Save Verified Terms</button>`;
  $('addScheduleATerm').onclick = addMissingScheduleATerm;
  $('verifyScheduleATerms').onclick = () => verifyScheduleATerms(profile.id);
  review.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addMissingScheduleATerm() {
  const container = document.querySelector('[data-review-profile]');
  if (!container) return;
  container.insertAdjacentHTML(
    'beforeend',
    `<div class="schedule-term" data-manual-term="true">` +
    `<input class="schedule-term-label-input" type="text" placeholder="Missing term name" ` +
    `aria-label="Missing term name">` +
    `<label><input class="schedule-term-verified" type="checkbox"> Verified</label>` +
    `<input class="schedule-term-value" type="text" placeholder="Cost or rate" ` +
    `aria-label="Missing term value">` +
    `<small>manual · Entered during source review</small></div>`
  );
}

async function extractScheduleATerms(profileId, replaceExisting = false) {
  const status = $('scheduleAStatus');
  try {
    const profile = scheduleARegistry.load().find(item => item.id === profileId);
    if (!profile) throw new Error('Schedule A version was not found.');
    if (profile.extractionStatus === 'extracted' && !replaceExisting) {
      renderScheduleAReview(profile);
      return;
    }
    const pdfBlob = await scheduleADocumentStore.get(profile.documentStorageKey);
    if (!pdfBlob) throw new Error('The original Schedule A PDF is unavailable on this device.');
    const extractedText = await scheduleAPdfText(pdfBlob, status);
    const extraction = window.ClearCostScheduleAExtraction.extractionResult(
      extractedText.text,
      extractedText.source
    );
    if (extraction.status === 'incomplete') {
      throw new Error(
        extraction.completenessReason ||
        'Schedule A extraction is incomplete. Pricing rows were not found.'
      );
    }
    if (!extraction.terms.length) {
      throw new Error('No pricing terms could be extracted. Manual review is required.');
    }
    const updated = scheduleARegistry.saveExtraction(profile.id, extraction);
    renderScheduleAProfiles();
    renderScheduleAReview(updated);
    status.innerHTML =
      `<div class="notice ok"><strong>Extraction complete</strong>` +
      `<p>${updated.terms.length} candidate terms found. Verify every term before use.</p></div>`;
  } catch (error) {
    if (status) {
      status.innerHTML =
        `<div class="notice error"><strong>Schedule A extraction failed</strong>` +
        `<p>${escapeHtml(String(error.message || error))}</p></div>`;
    }
  }
}

function verifyScheduleATerms(profileId) {
  const status = $('scheduleAStatus');
  try {
    const profile = scheduleARegistry.load().find(item => item.id === profileId);
    if (!profile) throw new Error('Schedule A version was not found.');
    const rows = Array.from(document.querySelectorAll(
      `[data-review-profile="${CSS.escape(profileId)}"] .schedule-term`
    ));
    const terms = rows.map((row, index) => {
      const existing = profile.terms[index];
      const manualLabel = row.querySelector('.schedule-term-label-input')?.value.trim();
      return {
        ...(existing || {
          id: `manual_${index}`,
          scope: 'manual',
          evidence: 'Entered during agent source review',
          confidence: 1
        }),
        label: existing?.label || manualLabel,
        value: row.querySelector('.schedule-term-value').value.trim(),
        verified: row.querySelector('.schedule-term-verified').checked
      };
    });
    if (terms.some(term => !term.label || !term.value)) {
      throw new Error('Every term must have a name and value.');
    }
    const verified = scheduleARegistry.verifyTerms(
      profileId,
      terms,
      new Date(),
      $('confirmScheduleACoverage')?.checked === true
    );
    renderScheduleAProfiles();
    renderScheduleAReview(verified);
    status.innerHTML =
      `<div class="notice ok"><strong>Schedule A terms verified</strong>` +
      `<p>${verified.terms.length} reviewed terms saved for this exact version.</p></div>`;
  } catch (error) {
    status.innerHTML =
      `<div class="notice error"><strong>Terms not verified</strong>` +
      `<p>${escapeHtml(String(error.message || error))}</p></div>`;
  }
}

async function sha256Hex(file) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

async function uploadScheduleA() {
  const status = $('scheduleAStatus');
  try {
    const file = $('scheduleAPdf')?.files?.[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') &&
      file.type !== 'application/pdf')) {
      throw new Error('Select a Schedule A PDF.');
    }
    const fingerprint = await sha256Hex(file);
    const profile = window.ClearCostScheduleAProfiles.createProfile({
      isoProcessorName: agentSettings.isoProcessorName,
      effectiveDate: $('scheduleAEffectiveDate')?.value,
      fileName: file.name,
      fileSize: file.size,
      documentFingerprint: fingerprint
    });

    await scheduleADocumentStore.put(profile.documentStorageKey, file);
    scheduleARegistry.add(profile);
    renderScheduleAProfiles();
    $('scheduleAPdf').value = '';

    if (status) {
      status.innerHTML =
        `<div class="notice ok"><strong>Schedule A version saved</strong>` +
        `<p>${escapeHtml(profile.isoProcessorName)} · Effective ` +
        `${escapeHtml(profile.effectiveDate)} · Extraction pending</p></div>`;
    }
  } catch (error) {
    if (status) {
      status.innerHTML =
        `<div class="notice error"><strong>Schedule A not saved</strong>` +
        `<p>${escapeHtml(String(error.message || error))}</p></div>`;
    }
  }
}

function buildProfitScenario() {
  const PI =
    window
      .ClearCostProfitIntelligence;

  if (!PI) {
    throw new Error(
      'Profit Intelligence browser engine is not loaded.'
    );
  }

  const d =
    currentDiagnostic();

  if (!d) {
    throw new Error(
      'Run statement extraction before Profit Intelligence.'
    );
  }

  if (
    d.reconciliation
      ?.proposalBlocked
  ) {
    throw new Error(
      d.reconciliation
        .blockReason ||
      'Reconciliation must be confirmed before proposal analysis.'
    );
  }

  const volume =
    firstMetricValue(
      d.metrics
        ?.grossVolume
    );

  const transactions =
    firstMetricValue(
      d.metrics
        ?.transactionCount
    );

  const currentExpense =
    firstMetricValue(
      d.metrics
        ?.totalFees
    );

  if (
    volume === null ||
    transactions === null ||
    currentExpense === null
  ) {
    throw new Error(
      'Verified volume, transaction count, and total fees are required.'
    );
  }

  const revenue =
    profitNumber(
      'verifiedRevenue'
    );

  const cost =
    profitNumber(
      'verifiedInternalCost'
    );

  const split =
    profitNumber(
      'agentSplit'
    );

  const revenueVerified =
    $('verifyRevenue')
      ?.checked ||
    false;

  const costVerified =
    $('verifyInternalCost')
      ?.checked ||
    false;

  const splitVerified =
    $('verifyAgentSplit')
      ?.checked ||
    false;

  const V =
    (
      value,
      verified,
      source
    ) =>
      verified
        ? PI.verifiedValue(
            value,
            source
          )
        : PI.unknownValue(
            source
          );

  return {
    scenarioId:
      `${d.sourceFile || 'statement'}-${selectedProgram()}`,

    program:
      selectedProgram(),

    monthlyVolume:
      volume,

    monthlyTransactions:
      Math.round(
        transactions
      ),

    currentMonthlyProcessingExpense:
      currentExpense,

    merchantPercentageRate:
      profitNumber(
        'merchantPercentageRate'
      ),

    merchantTransactionFee:
      profitNumber(
        'merchantTransactionFee'
      ),

    merchantMonthlyFee:
      profitNumber(
        'merchantMonthlyFee'
      ),

    merchantEquipmentFee:
      profitNumber(
        'merchantEquipmentFee'
      ),

    cashDiscountPercent:
      selectedProgram() ===
      'cash_discount'
        ? profitNumber(
            'cashDiscountPercent'
          )
        : null,

    customerSurchargePercent:
      selectedProgram() ===
      'surcharge'
        ? profitNumber(
            'customerSurchargePercent'
          )
        : null,

    merchantCreditCardRate:
      selectedProgram() ===
      'surcharge'
        ? profitNumber(
            'merchantCreditCardRate'
          )
        : null,

    merchantExpenseComponents:
      [],

    revenueComponents: [
      {
        name:
          'Verified program revenue',

        amount:
          V(
            revenue,
            revenueVerified,
            'Profit Intelligence input'
          ),

        category:
          'program_revenue'
      }
    ],

    costComponents: [
      {
        name:
          'Verified processor/internal costs',

        amount:
          V(
            cost,
            costVerified,
            'Profit Intelligence input'
          ),

        category:
          'processor_cost'
      }
    ],

    agentSplitPercent:
      V(
        split,
        splitVerified,
        agentSettings.isoProcessorName
          ? `Agent Settings: ${agentSettings.isoProcessorName}`
          : 'Agent Settings'
      ),

    minimumMonthlyResidual:
      profitNumber(
        'minimumResidualProfit'
      )
  };
}function moneyText(
  value
) {
  return (
    value === null ||
    value === undefined
  )
    ? 'Not verified'
    : `$${Number(
        value
      ).toLocaleString(
        'en-US',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      )}`;
}

function renderProfitResult(
  result
) {
  const PI =
    window
      .ClearCostProfitIntelligence;

  const badge =
    PI.getProfitBadge(
      result
    );

  const resultNode =
    $('profitResult');

  if (
    !resultNode
  ) {
    return;
  }

  resultNode.innerHTML =
    `<div class="notice ${
      badge.tone ===
      'success'
        ? 'ok'
        : badge.tone ===
          'danger'
          ? 'error'
          : 'warning'
    }">` +

    `<strong>${escapeHtml(
      badge.label
    )}</strong>` +

    `<p>${
      result.readyToPresent
        ? 'Profit Protection passed. This scenario may proceed to proposal review.'
        : 'This scenario is blocked from Ready to Present.'
    }</p>` +

    `</div>` +

    `<div class="status-panel">` +

    `<div class="status-row">` +
    `<span>Projected merchant expense</span>` +
    `<strong>${moneyText(
      result.projectedMerchantExpense
    )}</strong>` +
    `</div>` +

    `<div class="status-row">` +
    `<span>Projected monthly savings</span>` +
    `<strong>${moneyText(
      result.projectedMonthlySavings
    )}</strong>` +
    `</div>` +

    `<div class="status-row">` +
    `<span>Projected annual savings</span>` +
    `<strong>${moneyText(
      result.projectedAnnualSavings
    )}</strong>` +
    `</div>` +

    `<div class="status-row">` +
    `<span>Internal gross profit pool</span>` +
    `<strong>${moneyText(
      result.grossProfitPool
    )}</strong>` +
    `</div>` +

    `<div class="status-row">` +
    `<span>Projected monthly residual</span>` +
    `<strong>${moneyText(
      result.projectedMonthlyResidual
    )}</strong>` +
    `</div>` +

    `<div class="status-row">` +
    `<span>Ready to Present</span>` +
    `<strong>${
      result.readyToPresent
        ? 'Yes'
        : 'No'
    }</strong>` +
    `</div>` +

    `</div>` +

    (
      result
        .missingVerifiedInputs
        .length
        ? `<div class="notice warning">` +
          `<strong>Missing verified inputs</strong>` +
          `<p>${escapeHtml(
            result.missingVerifiedInputs.join(
              ', '
            )
          )}</p>` +
          `</div>`
        : ''
    ) +

    (
      result
        .warnings
        .length
        ? `<div class="notice warning">` +
          `<strong>Profit Protection</strong>` +
          `<p>${escapeHtml(
            result.warnings.join(
              ' '
            )
          )}</p>` +
          `</div>`
        : ''
    ) +

    `<details>` +
    `<summary>Internal calculation audit</summary>` +
    `<div class="raw-evidence">${
      result.audit
        .map(
          escapeHtml
        )
        .join(
          '<br>'
        )
    }</div>` +
    `</details>`;
}

function calculateProfitability() {
  try {
    state.profitScenario =
      window
        .ClearCostProfitIntelligence
        .calculateProfitScenario(
          buildProfitScenario()
        );

    renderProfitResult(
      state.profitScenario
    );

  } catch (
    error
  ) {
    const resultNode =
      $('profitResult');

    if (
      resultNode
    ) {
      resultNode.innerHTML =
        `<div class="notice error">` +
        `<strong>Profit Intelligence blocked</strong>` +
        `<p>${escapeHtml(
          String(
            error.message ||
            error
          )
        )}</p>` +
        `</div>`;
    }
  }
}

function openProfitability() {
  const d =
    currentDiagnostic();

  const resultNode =
    $('profitResult');

  if (
    !d
  ) {
    if (
      resultNode
    ) {
      resultNode.innerHTML =
        `<div class="notice warning">` +
        `<strong>No statement analysis available</strong>` +
        `<p>Validate and extract a statement first.</p>` +
        `</div>`;
    }

  } else if (
    d.reconciliation
      ?.proposalBlocked
  ) {
    if (
      resultNode
    ) {
      resultNode.innerHTML =
        `<div class="notice error">` +
        `<strong>Proposal analysis blocked</strong>` +
        `<p>${escapeHtml(
          d.reconciliation
            .blockReason ||
          'Statement reconciliation is incomplete.'
        )}</p>` +
        `</div>`;
    }

  } else {
    if (
      $('profitVolume')
    ) {
      $('profitVolume')
        .textContent =
        moneyText(
          firstMetricValue(
            d.metrics
              ?.grossVolume
          )
        );
    }

    if (
      $('profitTransactions')
    ) {
      $('profitTransactions')
        .textContent =
        firstMetricValue(
          d.metrics
            ?.transactionCount
        )?.toLocaleString(
          'en-US'
        ) ||
        'Not verified';
    }

    if (
      $('profitCurrentExpense')
    ) {
      $('profitCurrentExpense')
        .textContent =
        moneyText(
          firstMetricValue(
            d.metrics
              ?.totalFees
          )
        );
    }
  }

  applyAgentSettingsToProfit();
  updateProfitFieldVisibility();

  navigate(
    'profitability'
  );
}

async function runExtraction() {
  if (
    !el.extractButton
  ) {
    return;
  }

  el.extractButton.disabled =
    true;

  const originalText =
    el.extractButton
      .textContent;

  el.extractButton
    .textContent =
    'Extracting…';

  try {
    state.extractions =
      await Promise.all(
        state.results.map(
          result =>
            runStatementIntelligencePipeline(
              result
            )
        )
      );

    renderExtraction();

    navigate(
      'extraction'
    );

  } catch (
    error
  ) {
    const notice =
      $('extractionNotice');

    notice.className =
      'notice error';

    notice.innerHTML =
      `<strong>Statement extraction error</strong>` +
      `<p>${escapeHtml(
        String(
          error.message ||
          error
        )
      )}</p>`;

    navigate(
      'extraction'
    );

  } finally {
    el.extractButton
      .textContent =
      originalText;

    el.extractButton.disabled =
      el.extractButton
        .dataset.blocked ===
      'true';
  }
}

if (
  el.extractButton
) {
  el.extractButton.onclick =
    runExtraction;
}

const profitOpenButton =
  $('openProfitabilityButton');

if (
  profitOpenButton
) {
  profitOpenButton.onclick =
    openProfitability;
}

const profitCalculateButton =
  $('calculateProfitButton');

if (
  profitCalculateButton
) {
  profitCalculateButton.onclick =
    calculateProfitability;
}

const profitProgram =
  $('profitProgram');

if (
  profitProgram
) {
  profitProgram.onchange =
    updateProfitFieldVisibility;
}

const saveAgentSettingsButton =
  $('saveAgentSettings');

if (saveAgentSettingsButton) {
  saveAgentSettingsButton.onclick =
    saveAgentSettings;
}

const uploadScheduleAButton =
  $('uploadScheduleA');

if (uploadScheduleAButton) {
  uploadScheduleAButton.onclick =
    uploadScheduleA;
}

if ($('scheduleAList')) {
  $('scheduleAList').onclick = event => {
    const button = event.target.closest('.schedule-a-action');
    if (!button) return;
    extractScheduleATerms(
      button.dataset.profileId,
      button.dataset.scheduleAction === 'reextract'
    );
  };
}

applyAgentSettingsToForm();
renderScheduleAProfiles();

renderQueue();

navigate(
  'home'
);
