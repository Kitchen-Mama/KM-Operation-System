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
  'supply-planning-calculations',
  'supply-planning-qualified-incoming',
  'supply-planning-ledgers',
  'supply-planning-allocations',
  'supply-planning-line-runtime',              // requires calculations + qualified-incoming
  'supply-planning-incoming-adapters',
  'supply-planning-external-incoming-adapters',
  'supply-planning-supply-candidates',
  'supply-planning-persistence',
  'supply-planning-persistence-repository',
  'supply-planning-persistence-locking',
  'supply-planning-plan-builder',              // requires persistence-repository
  'supply-planning-persistence-plan-builder',  // requires persistence-repository + plan-builder
  'supply-planning-recommendation-orchestrator', // requires persistence + plan-builder + persistence-plan-builder + repository
  'supply-planning-user-edit',                 // requires persistence-repository
  'supply-planning-source-facts',              // requires calculations + ledgers + candidates + incoming + qualified-incoming + allocations
  'supply-planning-plan-bridge',               // standalone (no deps)
  'supply-planning-source-reader',             // requires source-facts
  'supply-planning-recommendation-source-integration', // requires source-reader + ledgers + source-facts + plan-bridge
  'supply-planning-source-reader-production',  // requires source-reader + source-integration (Round 1S-P1 production reader)
  'supply-planning-source-projection',         // requires source-reader-production (Round 1S-P1.5B projection runtime)
  'supply-planning-allocation-facts',          // requires calculations (F1-5-A allocation-fact producer)
  'supply-planning-planning-context',          // requires calculations (F1-5-BD planning context runtime)
  'supply-planning-demand-allocation',         // destination DTO + multi-warehouse demand allocation (F1-4B-E0R/E; deps: none)
  'supply-planning-production-assembly',       // requires planning-context + allocation-facts + calculations (F1-4B-PRE)
  'supply-planning-destination-runtime',       // requires demand-allocation + planning-context + calculations + qualified-incoming (F1-4B-FM1)
  'supply-planning-production-source',         // requires source-projection + plan-builder + allocation-facts (Round 1S-P2 / F1-5-A)
  'supply-planning-production-safety',         // standalone safety layer (Production Safety Round S0) — before writer
  'supply-planning-production-writer',         // requires production-source + orchestrator + locking + repository + safety (Round 1S-P3 writer)
  'supply-planning-verification-diagnostics'   // requires repository + production-writer (Round 1S-P4-U read-only diagnostics)
];

// Global namespace → module basename (the Apps Script-visible names the orchestrator + guards reference).
var GLOBALS = [
  ['KMCALC', 'supply-planning-calculations'],
  ['KMQI', 'supply-planning-qualified-incoming'],
  ['KMLEDGER', 'supply-planning-ledgers'],
  ['KMALLOC', 'supply-planning-allocations'],
  ['KMLINE', 'supply-planning-line-runtime'],
  ['KMINC', 'supply-planning-incoming-adapters'],
  ['KMEXT', 'supply-planning-external-incoming-adapters'],
  ['KMCAND', 'supply-planning-supply-candidates'],
  ['KMPC', 'supply-planning-persistence'],
  ['KMPR', 'supply-planning-persistence-repository'],
  ['KMPL', 'supply-planning-persistence-locking'],
  ['KMPB', 'supply-planning-plan-builder'],
  ['KMPPB', 'supply-planning-persistence-plan-builder'],
  ['KMORCH', 'supply-planning-recommendation-orchestrator'],
  ['KMUE', 'supply-planning-user-edit'],
  ['KMSF', 'supply-planning-source-facts'],
  ['KMBRIDGE', 'supply-planning-plan-bridge'],
  ['KMSR', 'supply-planning-source-reader'],
  ['KMSI', 'supply-planning-recommendation-source-integration'],
  ['KMSRP', 'supply-planning-source-reader-production'],
  ['KMSP', 'supply-planning-source-projection'],
  ['KMAF', 'supply-planning-allocation-facts'],
  ['KMPCX', 'supply-planning-planning-context'],
  ['KMDA', 'supply-planning-demand-allocation'],
  ['KMPA', 'supply-planning-production-assembly'],
  ['KMDR', 'supply-planning-destination-runtime'],
  ['KMPS', 'supply-planning-production-source'],
  ['KMSAFE', 'supply-planning-production-safety'],
  ['KMPW', 'supply-planning-production-writer'],
  ['KMVD', 'supply-planning-verification-diagnostics']
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
