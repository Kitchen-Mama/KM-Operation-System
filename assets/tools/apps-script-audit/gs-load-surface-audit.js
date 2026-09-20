// Kitchen Mama Operation System — APPS SCRIPT LOAD-SURFACE AUDIT (APPS-SCRIPT-RUNTIME-SLIM-R1)
// Run: node assets/tools/apps-script-audit/gs-load-surface-audit.js [rev] [--json out.json]
//
// READ-ONLY AND OFFLINE. It reads committed blobs with `git show` and writes nothing but its own
// report. It never contacts the deployment; which files are actually DEPLOYED is a separate question
// answered by a live typeof probe, and the two answers must not be conflated (see below).
//
// ---------------------------------------------------------------------------------------------------
// WHY THIS TOOL EXISTS
//
// Apps Script compiles EVERY file in the project on EVERY execution. A file nothing routes to is still
// parsed before the router sees the request. So the audit answers two INDEPENDENT questions and keeps
// them apart:
//
//   is removing it SAFE?    → reachability and inbound references
//   is removing it WORTH    → committed bytes
//   ANYTHING?
//
// A file can be perfectly safe to remove and worth nothing, which is a correct cleanup and not a
// latency fix. The report is shaped so those two cannot be quietly merged into one recommendation.
//
// ---------------------------------------------------------------------------------------------------
// THE REPOSITORY DIRECTORY IS NOT THE DEPLOYED PROJECT
//
// assets/specs/active/apps-script/ is where the source lives. What the deployment CONTAINS is a
// different set, and on the measured tree it was smaller by seven files and 808,195 bytes. Anything
// this tool reports is therefore about the DIRECTORY. Pass a presence map (--presence file.json, the
// output of a live probe) to restrict every figure to files the deployment actually answered for.
//
// ---------------------------------------------------------------------------------------------------
// THE BLIND SPOT THIS TOOL WAS BUILT AROUND
//
// Apps Script binds a time-driven trigger BY NAME:
//     ScriptApp.newTrigger('runDailyInventoryGapMaterialization')
// and sibling files list the same handlers as plain strings. An analyser that strips string literals
// before looking for identifiers therefore reports the whole scheduler as having ZERO inbound
// references — which is precisely the evidence someone would cite to delete a file a nightly trigger
// calls. Measured here before the string scan was added: 44_gap_materialization_scheduler.gs showed
// inbound=0 while 45_api_v1_automation_schedule.gs names both of its handlers in string literals.
// The precision matters as much as the recall: 46_api_v1_gap_materialization_job.gs names the same two
// handlers in a LINE COMMENT and depends on neither, so a scan that merely greps for the name would
// invent an edge and report a file as load-bearing when it is not.
//
// Code references and string references are therefore tracked SEPARATELY, because they fail
// differently: removing a code dependency breaks at compile time, removing a string dependency fails
// silently at 3am.
//
// ---------------------------------------------------------------------------------------------------
// WHAT "DEPENDS ON" MEANS, AND WHICH WAY IT ERRS
//
// B depends on A if B mentions an identifier A declares at top level and B does not declare itself.
// That is coarse in the SAFE direction: it over-reports. A file this tool calls independent is
// independent under a stricter analysis too. A file it calls depended-upon may not be — so every
// removal candidate is still re-checked by hand before anyone proposes it.
'use strict';
var cp = require('child_process');
var fs = require('fs');
var path = require('path');

var DIR = 'assets/specs/active/apps-script';
var ROUTER = '01_router.gs';
var HEALTH = '63_api_v1_system_health.gs';
var BUNDLE = '90_generated_supply_planning_bundle.gs';

function analyze(opts) {
  opts = opts || {};
  var repo = opts.repo || path.join(__dirname, '..', '..', '..');
  var rev = opts.rev || 'HEAD';
  function git(a) { return cp.execSync('git ' + a, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 }); }
  function blob(f) { return cp.execSync('git show ' + rev + ':"' + f + '"', { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 }); }

  var NAMES = [], SRC = {}, BYTES = {};
  git('ls-files ' + DIR).trim().split('\n')
    .filter(function (f) { return /\.gs$/.test(f); }).sort()
    .forEach(function (f) {
      var n = path.basename(f);
      NAMES.push(n); SRC[n] = blob(f); BYTES[n] = Buffer.byteLength(SRC[n], 'utf8');
    });

  // Comments and string literals removed, so a symbol named only in prose is not counted as a use.
  function strip(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').map(function (l) { return l.replace(/(^|[^:"'])\/\/.*$/, '$1'); }).join('\n')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  }
  var CODE = {}; NAMES.forEach(function (n) { CODE[n] = strip(SRC[n]); });

  // TOP-LEVEL declarations only — column 0. Anything indented is inside a function and is not a global.
  var DECL = {}, OWNER = {};
  NAMES.forEach(function (n) {
    var fns = [], vars = [];
    CODE[n].split('\n').forEach(function (l) {
      var mf = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l);
      if (mf) { fns.push(mf[1]); return; }
      var mv = /^var\s+([A-Za-z_$][\w$]*)\s*=/.exec(l);
      if (mv) { vars.push(mv[1]); }
    });
    DECL[n] = { functions: fns, vars: vars, all: fns.concat(vars) };
    DECL[n].all.forEach(function (s) { OWNER[s] = OWNER[s] && OWNER[s] !== n ? OWNER[s] + '|' + n : n; });
  });

  var USES = {}, STRUSES = {};
  NAMES.forEach(function (n) {
    var u = {}, m, re = /[A-Za-z_$][\w$]*/g;
    while ((m = re.exec(CODE[n])) !== null) { u[m[0]] = 1; }
    USES[n] = u;

    var s = {}, sm, sre = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
    while ((sm = sre.exec(SRC[n])) !== null) {
      var lit = sm[1] !== undefined ? sm[1] : sm[2];
      if (lit && /^[A-Za-z_$][\w$]*$/.test(lit) && OWNER[lit]) { s[lit] = 1; }
    }
    STRUSES[n] = s;
  });

  var DEPS = {}, RDEPS = {}, STRDEPS = {}, RSTRDEPS = {};
  NAMES.forEach(function (n) { DEPS[n] = {}; RDEPS[n] = {}; STRDEPS[n] = {}; RSTRDEPS[n] = {}; });
  function link(n, sym, D, RD) {
    if (!OWNER[sym]) { return; }
    OWNER[sym].split('|').forEach(function (of) {
      if (of === n) { return; }
      (D[n][of] = D[n][of] || []).push(sym);
      (RD[of][n] = RD[of][n] || []).push(sym);
    });
  }
  NAMES.forEach(function (n) {
    var own = {}; DECL[n].all.forEach(function (s) { own[s] = 1; });
    Object.keys(USES[n]).forEach(function (s) { if (!own[s]) { link(n, s, DEPS, RDEPS); } });
    Object.keys(STRUSES[n]).forEach(function (s) { if (!own[s]) { link(n, s, STRDEPS, RSTRDEPS); } });
  });

  // Routed actions: the router says `if (action === 'x') { ... handleY_(...) }`.
  var routed = [], routedHandlers = {};
  (function () {
    var raw = SRC[ROUTER], re = /action\s*===\s*'([^']+)'([\s\S]{0,400}?)(?:\n\s*\}|\n\s*if\s*\()/g, m;
    while ((m = re.exec(raw)) !== null) {
      var h = /\b(handle[A-Za-z0-9_]*_)\s*\(/.exec(m[2]);
      routed.push({ action: m[1], handler: h ? h[1] : null });
      if (h) { routedHandlers[h[1]] = m[1]; }
    }
  })();
  var ROUTED_OWNER = {};
  NAMES.forEach(function (n) {
    DECL[n].functions.forEach(function (fn) {
      if (routedHandlers[fn]) { (ROUTED_OWNER[n] = ROUTED_OWNER[n] || []).push(routedHandlers[fn]); }
    });
  });

  // Reachability from the entry point, through code AND string references.
  var reach = {}, q = [ROUTER];
  reach[ROUTER] = 1;
  while (q.length) {
    var cur = q.shift();
    Object.keys(DEPS[cur] || {}).concat(Object.keys(STRDEPS[cur] || {}))
      .forEach(function (d) { if (!reach[d]) { reach[d] = 1; q.push(d); } });
  }

  // A function named in ScriptApp.newTrigger(...) is entered by the platform. Source can say a trigger
  // is POSSIBLE; only the operator's trigger list says one is INSTALLED.
  var TRIGGER = {};
  NAMES.forEach(function (n) {
    var m, re = /newTrigger\s*\(\s*'([^']+)'|newTrigger\s*\(\s*"([^"]+)"/g;
    while ((m = re.exec(SRC[n])) !== null) { TRIGGER[m[1] || m[2]] = n; }
  });

  var manifest = {};
  (function () {
    var raw = SRC[HEALTH] || '', m;
    var re = /\{\s*file:\s*'([^']+)'\s*,\s*symbol:\s*'([^']+)'\s*,\s*expected:\s*'([^']*)'([\s\S]{0,400}?)\}/g;
    while ((m = re.exec(raw)) !== null) {
      manifest[m[1]] = { symbol: m[2], expected: m[3], optional: /optional:\s*true/.test(m[4]) };
    }
  })();

  var STAMP = {};
  NAMES.forEach(function (n) {
    DECL[n].vars.forEach(function (v) {
      if (!/(BUILD|BUILD_VERSION|RELEASE|CONTENT_HASH)_$/.test(v)) { return; }
      var m = new RegExp('^var\\s+' + v + "\\s*=\\s*'([^']*)'", 'm').exec(SRC[n]);
      (STAMP[n] = STAMP[n] || []).push(v + (m ? '=' + m[1] : ''));
    });
  });

  var MUT = {
    sheetWrite: /\.(setValue|setValues|appendRow|deleteRow|deleteRows|insertRows?|clearContent|setFormula|insertSheet|deleteSheet|copyTo|moveTo)\s*\(/,
    driveMail: /\b(DriveApp|MailApp|GmailApp|CalendarApp)\b/,
    urlFetch: /\bUrlFetchApp\b/,
    props: /\b(PropertiesService|CacheService)\b/,
    triggers: /ScriptApp\.(newTrigger|deleteTrigger|getProjectTriggers)/,
    lock: /\bLockService\b/
  };

  function manualRuns(n) {
    return DECL[n].functions.filter(function (f) {
      return /^RUN_/.test(f) || /^TEMP_.*(RUN|EXECUTE|DRY_RUN|VALIDATE|SEED|MIGRATE|CENSUS|DIAGNOSE)/i.test(f);
    });
  }

  function classify(n) {
    var inbound = Object.keys(RDEPS[n]).length;
    var inboundStr = Object.keys(RSTRDEPS[n]).length;
    if (n === BUNDLE) { return 'B_GENERATED_RUNTIME'; }
    if ((ROUTED_OWNER[n] || []).length) { return 'A_REQUIRED_RUNTIME'; }
    if (manifest[n] && !manifest[n].optional) { return 'A_REQUIRED_RUNTIME'; }
    // A trigger owner can never be better than ambiguous from a static read.
    if (DECL[n].functions.some(function (f) { return TRIGGER[f]; })) { return 'H_AMBIGUOUS_TRIGGER_OWNER'; }
    if (inbound || inboundStr) { return 'A_REQUIRED_RUNTIME'; }
    if (/demo|seed/i.test(n)) { return 'F_DEMO_OR_SEED'; }
    if (/migrate|migration/i.test(n)) { return 'D_FUTURE_MIGRATION'; }
    if (/diagnos|census|audit|dry_run|dryrun|verification/i.test(n)) { return 'C_MANUAL_OPERATOR_TOOL'; }
    if (manualRuns(n).length) { return 'C_MANUAL_OPERATOR_TOOL'; }
    return 'H_AMBIGUOUS';
  }

  var report = NAMES.map(function (n) {
    return {
      file: n,
      bytes: BYTES[n],
      topLevelFunctions: DECL[n].functions.length,
      topLevelVars: DECL[n].vars.length,
      routedActions: ROUTED_OWNER[n] || [],
      reachableFromEntry: !!reach[n],
      inboundFiles: Object.keys(RDEPS[n]),
      inboundStringFiles: Object.keys(RSTRDEPS[n]),
      inboundStringSymbols: Object.keys(RSTRDEPS[n]).reduce(function (a, k) {
        return a.concat(RSTRDEPS[n][k].filter(function (s) { return a.indexOf(s) < 0; }));
      }, []),
      outboundFiles: Object.keys(DEPS[n]),
      manifest: manifest[n] || null,
      stamps: STAMP[n] || [],
      manualRuns: manualRuns(n),
      triggerHandlers: DECL[n].functions.filter(function (f) { return TRIGGER[f]; }),
      mutations: Object.keys(MUT).filter(function (k) { return MUT[k].test(CODE[n]); }),
      classification: classify(n)
    };
  });

  return {
    rev: rev,
    directoryFiles: NAMES.length,
    directoryBytes: NAMES.reduce(function (a, n) { return a + BYTES[n]; }, 0),
    entryPoints: NAMES.filter(function (n) { return /^function do(Get|Post)\s*\(/m.test(CODE[n]); }),
    routedActionCount: routed.length,
    distinctRoutedActions: Array.from(new Set(routed.map(function (r) { return r.action; }))).length,
    manifestRows: Object.keys(manifest).length,
    triggerHandlerNames: Object.keys(TRIGGER),
    report: report
  };
}

module.exports = { analyze: analyze, DIR: DIR, ROUTER: ROUTER, BUNDLE: BUNDLE };

if (require.main === module) {
  var rev = 'HEAD', out = null, presence = null;
  process.argv.slice(2).forEach(function (a, i, all) {
    if (a === '--json') { out = all[i + 1]; }
    else if (a === '--presence') { presence = all[i + 1]; }
    else if (a.charAt(0) !== '-' && all[i - 1] !== '--json' && all[i - 1] !== '--presence') { rev = a; }
  });
  var A = analyze({ rev: rev });
  var keep = null;
  if (presence) {
    var P = JSON.parse(fs.readFileSync(presence, 'utf8'));
    keep = {}; (P.present || []).forEach(function (n) { keep[n] = 1; });
  }
  var rows = keep ? A.report.filter(function (r) { return keep[r.file]; }) : A.report;
  var total = rows.reduce(function (a, r) { return a + r.bytes; }, 0);

  console.log('APPS SCRIPT LOAD SURFACE  rev=' + A.rev + (keep ? '  (restricted to the DEPLOYED set)' : '  (repository DIRECTORY)'));
  console.log('  files ' + rows.length + '   bytes ' + total + '  (' + (total / 1048576).toFixed(2) + ' MB)');
  console.log('  entry points ' + A.entryPoints.join(', ') + '   distinct routed actions ' + A.distinctRoutedActions
    + '   manifest rows ' + A.manifestRows);

  var cls = {};
  rows.forEach(function (r) { (cls[r.classification] = cls[r.classification] || []).push(r); });
  console.log('\nBY CLASSIFICATION');
  Object.keys(cls).sort().forEach(function (k) {
    var b = cls[k].reduce(function (a, r) { return a + r.bytes; }, 0);
    console.log('  ' + k.padEnd(30) + String(cls[k].length).padStart(3) + ' files  '
      + String(b).padStart(9) + ' B  ' + (100 * b / total).toFixed(1) + '%');
  });

  console.log('\nDEPLOYED BUT NOT REACHED FROM THE ENTRY POINT (still compiled every execution)');
  var un = rows.filter(function (r) { return !r.reachableFromEntry; }).sort(function (a, b) { return b.bytes - a.bytes; });
  un.forEach(function (r) {
    console.log('  ' + String(r.bytes).padStart(8) + ' B  ' + r.file.padEnd(50)
      + ' inCode=' + r.inboundFiles.length + ' inStr=' + r.inboundStringFiles.length
      + ' runs=' + r.manualRuns.length + ' trig=' + r.triggerHandlers.length + '  ' + r.classification);
  });
  console.log('  total ' + un.reduce(function (a, r) { return a + r.bytes; }, 0) + ' B ('
    + (100 * un.reduce(function (a, r) { return a + r.bytes; }, 0) / total).toFixed(2) + '%)');

  console.log('\nTRIGGER HANDLER OWNERS — static source cannot say whether a trigger is INSTALLED');
  rows.filter(function (r) { return r.triggerHandlers.length; })
    .forEach(function (r) { console.log('  ' + r.file + '   ' + r.triggerHandlers.join(', ')); });

  if (out) { fs.writeFileSync(out, JSON.stringify(A, null, 2), 'utf8'); console.log('\n  json -> ' + out); }
}
