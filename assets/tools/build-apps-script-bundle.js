// Kitchen Mama Operation System — Apps Script BUNDLE / PORT tool (Phase 2C, Round 1G).
// -----------------------------------------------------------------------------
// Deterministic, Node-only build tool that PORTS the canonical UMD pure modules under assets/js/core/ into ONE
// generated Apps Script (.gs) bundle — WITHOUT duplicating any algorithm. The canonical JS under assets/js/core/
// remains the ONLY hand-edited source of truth; this tool wraps each module verbatim so its `module.exports` is
// captured (Apps Script has no `module`/`window`/`require`, so the UMD would otherwise expose nothing) and binds
// the results to global namespaces (KMPR/KMPL/KMPB/KMPPB/…). Output is deterministic + reproducible byte-for-byte
// (no clock, no random, LF-normalized). This tool is NEVER shipped to Apps Script; only its output .gs is.
//
// Strategy = "generated bundle derived from canonical JS modules" (§18 option A). require() is resolved by an
// in-bundle registry shim; window/module are shadowed by the wrapper so the UMD's Node branch fires.

'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// Canonical modules in DEPENDENCY order (a module's deps must appear before it).
var MODULE_ORDER = [
  'supply-planning-country-identity',           // canonical country identity owner (F1-4B-FM5-R1b; no deps) — before destination-runtime
  'supply-planning-calculations',
  'supply-planning-qualified-incoming',
  'supply-planning-ledgers',
  'supply-planning-allocations',
  'supply-planning-allocation-runtime',        // F1-4B-FM7-R2B canonical allocation runtime (requires allocations)
  'supply-planning-factory-cohort',            // F1-4B-FM7-R2D POOL_COHORT_BATCH factory cohort allocator (requires allocation-runtime)
  'supply-planning-line-runtime',              // requires calculations + qualified-incoming
  'supply-planning-incoming-adapters',
  'supply-planning-external-incoming-adapters',
  'supply-planning-supply-candidates',
  'supply-planning-shipment-line-source',      // F1-SHIPMENT-INCOMING-R7C canonical shipment-line incoming + receiver resolver (requires supply-candidates)
  'supply-planning-persistence',
  'supply-planning-persistence-repository',
  'supply-planning-persistence-locking',
  'supply-planning-plan-builder',              // requires persistence-repository
  'supply-planning-persistence-plan-builder',  // requires persistence-repository + plan-builder
  'supply-planning-recommendation-orchestrator', // requires persistence + plan-builder + persistence-plan-builder + repository
  'supply-planning-user-edit',                 // requires persistence-repository
  'supply-planning-source-facts',              // requires calculations + ledgers + candidates + incoming + qualified-incoming + allocations
  'supply-planning-plan-bridge',               // standalone (no deps)
  'supply-planning-weekly-source-allocation',  // F1-7N-B §35A weekly source-allocation builder (requires allocations + source-facts)
  'supply-planning-weekly-input-assembler',    // F1-7N-D0-B weekly builder-input assembler (pure; no deps)
  'supply-planning-weekly-recommendation-draft', // F1-7N-C1 weekly persistence adapter (requires weekly-source-allocation + plan-bridge + orchestrator)
  'supply-planning-weekly-recommendation-runtime', // F1-7N-D-1 weekly generation-pipeline owner (requires input-assembler + weekly-source-allocation + weekly-recommendation-draft)
  'supply-planning-weekly-recommendation-batch', // F1-7N-D-2a (company,country) batch owner (requires input-assembler + weekly-source-allocation + plan-bridge + orchestrator)
  'supply-planning-weekly-harvest-adapter',    // F1-7N-D-2b pure harvest→batch-request join (no deps)
  'supply-planning-source-reader',             // requires source-facts
  'supply-planning-recommendation-source-integration', // requires source-reader + ledgers + source-facts + plan-bridge
  'supply-planning-source-reader-production',  // requires source-reader + source-integration (Round 1S-P1 production reader)
  'supply-planning-source-projection',         // requires source-reader-production (Round 1S-P1.5B projection runtime)
  'supply-planning-allocation-facts',          // requires calculations (F1-5-A allocation-fact producer)
  'supply-planning-planning-context',          // requires calculations (F1-5-BD planning context runtime)
  'supply-planning-demand-allocation',         // destination DTO + multi-warehouse demand allocation (F1-4B-E0R/E; deps: none)
  'supply-planning-marketplace-supply-allocation', // MARKETPLACE-receiver monthly supply-allocation adapter (F1-4B-FM5-R2A; deps: allocations + country-identity)
  'supply-planning-production-assembly',       // requires planning-context + allocation-facts + calculations (F1-4B-PRE)
  'supply-planning-destination-runtime',       // requires demand-allocation + planning-context + calculations + qualified-incoming (F1-4B-FM1)
  'supply-planning-planning-demand',           // canonical planning-demand owner: Target%-adjusted FC + special events + current-month remaining (F1-4B-FM3f-1; no deps)
  'supply-planning-time-phased-projection',    // standalone pure chronological projection owner (F1-4B-FM3b; no deps)
  'supply-planning-horizon-projection',        // day-horizon D18/D30/D45/D90 owner (F1-4B-FM4a; requires time-phased-projection + calculations)
  'supply-planning-production-source',         // requires source-projection + plan-builder + allocation-facts (Round 1S-P2 / F1-5-A)
  'supply-planning-production-safety',         // standalone safety layer (Production Safety Round S0) — before writer
  'supply-planning-production-writer',         // requires production-source + orchestrator + locking + repository + safety (Round 1S-P3 writer)
  'supply-planning-verification-diagnostics',  // requires repository + production-writer (Round 1S-P4-U read-only diagnostics)
  'supply-recommendation',                      // F1-4B-FM6 Phase-1 recommendation generator (KMREC): reads MATERIALIZED gap rows → DTO; no deps, no formula
  'supply-execution-handoff',                    // F1-4B-FM6-R2 recommendation→execution handoff (KMREX): KMREC DTO + resolved availabilities → execution-draft DTO; no deps, no formula, no persistence
  'supply-planning-ongoing-order-projection',    // F1-7N-FA-3B0 KMOOP Ongoing-Order site projection (no deps)
  'supply-planning-ongoing-order-tpp-adapter',   // F1-7N-FA-3B2 KMOTA Ongoing→KMTPP timing adapter (no deps)
  'supply-planning-ongoing-order-runtime',       // F1-7N-FA-3B3a KMOOR single-authority chain (requires source-facts + ongoing-order-projection + ongoing-order-tpp-adapter)
  'supply-planning-surplus-reallocation',        // F1-7N-FA-3A/3B1 KMFSR §41 factory surplus reallocation (requires allocations + calculations)
  'supply-planning-request-draft-v2'             // F1-7N-FA-3C-DRAFT-MODEL KMRDV2 flat MONTHLY_ORDER draft core (SELF-CONTAINED; no deps; not yet called by any handler)
];

// Global namespace → module basename (the Apps Script-visible names the orchestrator + guards reference).
var GLOBALS = [
  ['KMCID', 'supply-planning-country-identity'],
  ['KMCALC', 'supply-planning-calculations'],
  ['KMQI', 'supply-planning-qualified-incoming'],
  ['KMLEDGER', 'supply-planning-ledgers'],
  ['KMALLOC', 'supply-planning-allocations'],
  ['KMAR', 'supply-planning-allocation-runtime'],
  ['KMFC', 'supply-planning-factory-cohort'],
  ['KMLINE', 'supply-planning-line-runtime'],
  ['KMINC', 'supply-planning-incoming-adapters'],
  ['KMEXT', 'supply-planning-external-incoming-adapters'],
  ['KMCAND', 'supply-planning-supply-candidates'],
  ['KMSLS', 'supply-planning-shipment-line-source'],
  ['KMPC', 'supply-planning-persistence'],
  ['KMPR', 'supply-planning-persistence-repository'],
  ['KMPL', 'supply-planning-persistence-locking'],
  ['KMPB', 'supply-planning-plan-builder'],
  ['KMPPB', 'supply-planning-persistence-plan-builder'],
  ['KMORCH', 'supply-planning-recommendation-orchestrator'],
  ['KMUE', 'supply-planning-user-edit'],
  ['KMSF', 'supply-planning-source-facts'],
  ['KMBRIDGE', 'supply-planning-plan-bridge'],
  ['KMWSA', 'supply-planning-weekly-source-allocation'],
  ['KMWIA', 'supply-planning-weekly-input-assembler'],
  ['KMWRD', 'supply-planning-weekly-recommendation-draft'],
  ['KMWRT', 'supply-planning-weekly-recommendation-runtime'],
  ['KMWRB', 'supply-planning-weekly-recommendation-batch'],
  ['KMWHA', 'supply-planning-weekly-harvest-adapter'],
  ['KMSR', 'supply-planning-source-reader'],
  ['KMSI', 'supply-planning-recommendation-source-integration'],
  ['KMSRP', 'supply-planning-source-reader-production'],
  ['KMSP', 'supply-planning-source-projection'],
  ['KMAF', 'supply-planning-allocation-facts'],
  ['KMPCX', 'supply-planning-planning-context'],
  ['KMDA', 'supply-planning-demand-allocation'],
  ['KMMSA', 'supply-planning-marketplace-supply-allocation'],
  ['KMPA', 'supply-planning-production-assembly'],
  ['KMDR', 'supply-planning-destination-runtime'],
  ['KMPD', 'supply-planning-planning-demand'],
  ['KMTPP', 'supply-planning-time-phased-projection'],
  ['KMHP', 'supply-planning-horizon-projection'],
  ['KMPS', 'supply-planning-production-source'],
  ['KMSAFE', 'supply-planning-production-safety'],
  ['KMPW', 'supply-planning-production-writer'],
  ['KMVD', 'supply-planning-verification-diagnostics'],
  ['KMREC', 'supply-recommendation'],
  ['KMREX', 'supply-execution-handoff'],
  ['KMOOP', 'supply-planning-ongoing-order-projection'],
  ['KMOTA', 'supply-planning-ongoing-order-tpp-adapter'],
  ['KMOOR', 'supply-planning-ongoing-order-runtime'],
  ['KMFSR', 'supply-planning-surplus-reallocation'],
  ['KMRDV2', 'supply-planning-request-draft-v2']
];

function sha256(str) { return crypto.createHash('sha256').update(str, 'utf8').digest('hex'); }
function lf(str) { return String(str).replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }

// Wrap one canonical module so its module.exports is captured + registered (no algorithm change).
function wrapModule(basename, source) {
  var src = lf(source);
  return [
    '// ----- module: ' + basename + ' (verbatim from assets/js/core/' + basename + '.js) -----',
    '(function () {',
    '  var require = __kmRequire;',
    '  var module = { exports: {} };',
    '  var exports = module.exports;',
    src.replace(/\n$/, ''),
    '  __kmRegister(' + JSON.stringify(basename) + ', module.exports);',
    '})();',
    ''
  ].join('\n');
}

// buildBundleFromSources({ basename: sourceText, ... }) → { code, manifest, hash } — PURE + deterministic.
function buildBundleFromSources(sources) {
  var manifest = MODULE_ORDER.map(function (name) {
    if (typeof sources[name] !== 'string') throw new Error('missing source for module: ' + name);
    return { module: name, sha256: sha256(lf(sources[name])) };
  });
  var bundleInput = manifest.map(function (m) { return m.module + ':' + m.sha256; }).join('|');
  var bundleHash = sha256(bundleInput);

  var head = [
    '// ============================================================================',
    '// GENERATED FILE — DO NOT EDIT BY HAND.',
    '// Produced by assets/tools/build-apps-script-bundle.js from the canonical UMD modules under',
    '// assets/js/core/. Edit those modules and re-run the build tool; never edit this file directly.',
    '// One source of truth: no algorithm is duplicated here — each module is wrapped verbatim.',
    '// bundle_sha256 = ' + bundleHash,
    '// modules (in load order):',
  ].concat(manifest.map(function (m) { return '//   ' + m.module + '  ' + m.sha256; })).concat([
    '// ============================================================================',
    '',
    'var __kmModules = {};',
    'function __kmRegister(name, exps) { __kmModules[name] = exps; }',
    'function __kmRequire(p) {',
    '  var base = String(p).replace(/^.*\\//, "").replace(/\\.js$/, "");',
    '  if (!__kmModules.hasOwnProperty(base)) { throw new Error("KM bundle: module not registered: " + base); }',
    '  return __kmModules[base];',
    '}',
    ''
  ]).join('\n');

  var body = MODULE_ORDER.map(function (name) { return wrapModule(name, sources[name]); }).join('\n');

  var tail = ['// ----- Apps Script global namespace exposure -----']
    .concat(GLOBALS.map(function (g) { return 'var ' + g[0] + ' = __kmModules[' + JSON.stringify(g[1]) + '];'; }))
    .concat(['', '// KM_BUNDLE_INFO — introspectable manifest for load tests + deploy verification.',
      'var KM_BUNDLE_INFO = ' + JSON.stringify({ bundleHash: bundleHash, modules: manifest }, null, 0) + ';', ''])
    .join('\n');

  return { code: head + '\n' + body + '\n' + tail, manifest: manifest, hash: bundleHash };
}

// buildBundleFromDisk(coreDir) — read canonical modules from disk, in MODULE_ORDER.
function buildBundleFromDisk(coreDir) {
  var sources = {};
  MODULE_ORDER.forEach(function (name) {
    sources[name] = fs.readFileSync(path.join(coreDir, name + '.js'), 'utf8');
  });
  return buildBundleFromSources(sources);
}

module.exports = {
  MODULE_ORDER: MODULE_ORDER.slice(),
  GLOBALS: GLOBALS.map(function (g) { return g.slice(); }),
  sha256: sha256, lf: lf, wrapModule: wrapModule,
  buildBundleFromSources: buildBundleFromSources,
  buildBundleFromDisk: buildBundleFromDisk
};

// CLI: node assets/tools/build-apps-script-bundle.js [--check]
//   (default) write the generated bundle to the Apps Script source-mirror folder.
//   --check    build in memory and exit non-zero if the on-disk bundle differs (reproducibility gate).
if (require.main === module) {
  var coreDir = path.join(__dirname, '..', 'js', 'core');
  var outPath = path.join(__dirname, '..', 'specs', 'active', 'apps-script', '90_generated_supply_planning_bundle.gs');
  var built = buildBundleFromDisk(coreDir);
  var check = process.argv.indexOf('--check') !== -1;
  if (check) {
    var existing = fs.existsSync(outPath) ? lf(fs.readFileSync(outPath, 'utf8')) : null;
    if (existing !== lf(built.code)) { console.error('BUNDLE OUT OF DATE — re-run the build tool. hash=' + built.hash); process.exit(1); }
    console.log('bundle up to date; hash=' + built.hash);
  } else {
    fs.writeFileSync(outPath, built.code, 'utf8');
    console.log('wrote ' + outPath + '\nbundle_sha256=' + built.hash + '\nmodules=' + built.manifest.length);
  }
}
