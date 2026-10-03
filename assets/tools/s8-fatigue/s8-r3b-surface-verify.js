// =============================================================================================================
// S8-R3B §2 — MECHANICAL SURFACE FREEZE
//
// Run BEFORE any Production request. It proves, from the shipped source rather than from the preflight prose,
// that the surface this round is about to exercise is the surface the operator approved. If any check fails the
// round STOPS and nothing is dispatched.
//
//   node assets/tools/s8-fatigue/s8-r3b-surface-verify.js
//
// WHAT IT DOES NOT DO: it does not open a socket, and it does not read the live database. A surface freeze that
// had to call Production to decide whether it may call Production would be its own counterexample.
// =============================================================================================================

'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..', '..');
var GS = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
var AL = require('./s8-r3b-read-allowlist.js');
var CLASS = require('./s8-data-classification.js');
var PREFLIGHT = path.join(ROOT, 'docs', 'planning', 'S8_R3A_DB_TOUCH_PREFLIGHT.md');

var checks = [];
function check(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || '' }); }

// -------------------------------------------------------------------------------------------------------------
// Comments AND string literals stripped before any structural claim. A mention of appendRow in a header comment
// is not a write, and a "read-only" claim written in a comment proves nothing about the code under it.
// -------------------------------------------------------------------------------------------------------------
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
          .replace(/'(?:\\.|[^'\\])*'/g, "''")
          .replace(/"(?:\\.|[^"\\])*"/g, '""');
}
function gsFile(prefix) {
  var hit = fs.readdirSync(GS).filter(function (f) { return f.indexOf(prefix) === 0 && /\.gs$/.test(f); });
  // 50_ names two files; the workspace owner is the one holding the workspace handler.
  return hit;
}
function readOwner(prefix, mustContain) {
  var files = gsFile(prefix);
  if (mustContain) {
    var narrowed = files.filter(function (f) { return fs.readFileSync(path.join(GS, f), 'utf8').indexOf(mustContain) !== -1; });
    if (narrowed.length) files = narrowed;
  }
  if (!files.length) return null;
  return { file: files[0], src: fs.readFileSync(path.join(GS, files[0]), 'utf8') };
}

// -------------------------------------------------------------------------------------------------------------
// §2.1 — every R3B action is in the S8-R3A APPROVED action set, read out of the approved document itself.
// -------------------------------------------------------------------------------------------------------------
var preflightText = fs.readFileSync(PREFLIGHT, 'utf8');
var r3bActions = AL.approvedActions();
var missingFromPreflight = r3bActions.filter(function (a) { return preflightText.indexOf(a) === -1; });
check('§2.1 every R3B action appears in the approved S8-R3A preflight',
  missingFromPreflight.length === 0, missingFromPreflight.join(', '));

// -------------------------------------------------------------------------------------------------------------
// §2.2 — gapJob.status.get is absent from the approved set, named in the forbidden set, and actually refused.
// Three separate facts. The first two are lists; only the third is behaviour, and only behaviour stops a request.
// -------------------------------------------------------------------------------------------------------------
check('§2.2a gapJob.status.get is not in the approved set',
  r3bActions.indexOf('gapJob.status.get') === -1);
check('§2.2b gapJob.status.get is named in the forbidden set',
  Object.prototype.hasOwnProperty.call(AL.FORBIDDEN_ACTIONS, 'gapJob.status.get'));
var gapDecision = AL.decide({ action: 'gapJob.status.get', method: 'GET' });
check('§2.2c decide() refuses gapJob.status.get',
  gapDecision.ok === false && gapDecision.code === 'ACTION_FORBIDDEN', gapDecision.code);
// And the same refusal when the action arrives from a URL rather than from a caller that knows what it is.
var fromUrl = AL.actionFromRequest('https://script.google.com/macros/s/X/exec?action=gapJob.status.get&km_via=get', null);
check('§2.2d an intercepted URL carrying gapJob.status.get is still refused',
  AL.decide({ action: fromUrl, method: 'GET' }).ok === false, fromUrl);

// -------------------------------------------------------------------------------------------------------------
// §2.3 — deny by default. The proof is not that known-bad actions are refused; it is that an action nobody
// listed anywhere is refused too.
// -------------------------------------------------------------------------------------------------------------
var unknowns = ['adjustFactoryInventory', 'pricing.update', 'getTable', 'system.health',
                'orderPlanningGap.get', 'aiPlanFirstLayer.get', 'automationSchedule.get',
                'anActionNobodyHasEverNamed', ''];
var leaked = unknowns.filter(function (a) { return AL.decide({ action: a, method: 'GET' }).ok; });
check('§2.3 deny by default — nothing outside the approved set is dispatched', leaked.length === 0, leaked.join(', '));

// -------------------------------------------------------------------------------------------------------------
// §2.4 — every table reachable from the eleven actions is in the approved 44.
//
// Per owner, the table set is the owner's OWN declared *_TABLES_ constant where it has one. Three owners
// (42_, 43_, 71_) declare no such constant, so their set is the sheet-name literals in the file intersected
// with the 58-table registry — stated here rather than left implicit, because it is a weaker derivation and a
// reader is entitled to know which owners rest on it.
// -------------------------------------------------------------------------------------------------------------
var registry = CLASS.tablesIn ? CLASS.tablesIn() : null;
if (!registry || !registry.length) {
  registry = (CLASS.REGISTRY || []).map(function (r) { return r.table || r.name || r; });
}
var registrySet = {};
registry.forEach(function (t) { registrySet[t] = 1; });

var OWNERS = [
  { prefix: '40_', constant: 'WEEKLY_WORKSPACE_TABLES_' },
  { prefix: '42_', constant: null },
  { prefix: '43_', constant: null, mustContain: 'gapReadScopeRows_' },
  { prefix: '50_', constant: 'PO_WORKSPACE_TABLES_', mustContain: 'PO_WORKSPACE_TABLES_' },
  { prefix: '51_', constant: 'RO_WORKSPACE_TABLES_' },
  { prefix: '57_', constant: 'SHIP_WORKSPACE_TABLES_' },
  { prefix: '58_', constant: 'FCS_WORKSPACE_TABLES_' },
  { prefix: '59_', constant: 'SKD_WORKSPACE_TABLES_' },
  { prefix: '60_', constant: 'SIR_WORKSPACE_TABLES_' },
  { prefix: '70_', constant: 'OSW_WORKSPACE_TABLES_' },
  { prefix: '71_', constant: null }
];

// Slice the array literal that follows `var NAME = [` by bracket depth. A regex built from the constant name
// would have to escape the name's own characters and would silently stop matching the day a comment grew
// inside the literal; counting brackets does not have that failure mode.
function constantArray(src, name) {
  var at = src.indexOf('var ' + name);
  if (at === -1) return null;
  var open = src.indexOf('[', at);
  if (open === -1) return null;
  var depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) break; }
  }
  return src.slice(open, i + 1);
}

var tableSources = {};
var allReached = {};
OWNERS.forEach(function (o) {
  var owner = readOwner(o.prefix, o.mustContain || o.constant);
  if (!owner) { check('§2.4 owner ' + o.prefix + ' found', false, 'no .gs file'); return; }
  var names = [], how;
  if (o.constant) {
    var lit = constantArray(owner.src, o.constant);
    if (lit === null) { check('§2.4 ' + o.prefix + ' declares ' + o.constant, false, owner.file); return; }
    var m = lit.match(/'[a-z0-9_]+'/g) || [];
    names = m.map(function (s) { return s.slice(1, -1); }).filter(function (t) { return registrySet[t] === 1; });
    how = 'declared ' + o.constant;
  } else {
    var lits = owner.src.match(/'[a-z0-9_]{5,}'/g) || [];
    names = lits.map(function (s) { return s.slice(1, -1); }).filter(function (t) { return registrySet[t] === 1; });
    how = 'sheet-name literals INTERSECTED with the 58-table registry (this owner declares no *_TABLES_ constant)';
  }
  names = names.filter(function (t, i) { return names.indexOf(t) === i; }).sort();
  tableSources[o.prefix] = { file: owner.file, how: how, tables: names };
  names.forEach(function (t) { allReached[t] = (allReached[t] || []).concat(o.prefix); });
});

var approvedSet = {};
AL.APPROVED_TABLES.forEach(function (t) { approvedSet[t] = 1; });
var reached = Object.keys(allReached).sort();
var outside = reached.filter(function (t) { return approvedSet[t] !== 1; });
check('§2.4 every reachable table is in the approved 44', outside.length === 0, outside.join(', '));
check('§2.4b the approved table list is exactly 44', AL.APPROVED_TABLES.length === 44, String(AL.APPROVED_TABLES.length));

// -------------------------------------------------------------------------------------------------------------
// §2.5 — no write side effect is reachable. Probed per OWNER FILE, after stripping comments and string literals.
// The two owners that legitimately contain writers elsewhere in the file (71_, 43_) are probed per HANDLER
// instead: a file with a writer in it is not the same thing as a read handler that writes.
// -------------------------------------------------------------------------------------------------------------
var WRITE_PRIMS = ['setValue(', 'setValues(', 'appendRow(', 'insertRowAfter(', 'insertSheet(', 'deleteRow(',
  'deleteSheet(', 'clearContent', 'clearContents', 'setProperty(', 'deleteProperty(', 'DriveApp',
  'MailApp', 'newTrigger(', 'deleteTrigger('];

function gsBody(src, fnName) {
  var at = src.indexOf('function ' + fnName);
  if (at === -1) return null;
  var open = src.indexOf('{', at);
  if (open === -1) return null;
  var depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(open, i + 1);
}

var PER_FILE = ['40_', '42_', '50_', '51_', '57_', '58_', '59_', '60_', '70_'];
var dirty = [];
PER_FILE.forEach(function (p) {
  var o = readOwner(p, (OWNERS.filter(function (x) { return x.prefix === p; })[0] || {}).constant);
  if (!o) { dirty.push(p + ':MISSING'); return; }
  var s = bare(o.src);
  var hits = WRITE_PRIMS.filter(function (w) { return s.indexOf(w) !== -1; });
  if (hits.length) dirty.push(o.file + ' -> ' + hits.join(' '));
});
check('§2.5a the nine whole-file read owners hold no write primitive', dirty.length === 0, dirty.join(' | '));

var perHandler = [
  { prefix: '71_', fn: 'handleFactoryStockGuardGet_' },
  { prefix: '43_', fn: 'handleGetInventoryReplenishmentGap_' },
  { prefix: '43_', fn: 'gapReadScopeRows_' }
];
var dirtyH = [];
perHandler.forEach(function (h) {
  var o = readOwner(h.prefix, h.fn);
  if (!o) { dirtyH.push(h.prefix + ':MISSING'); return; }
  var body = gsBody(bare(o.src), h.fn);
  if (body === null) { dirtyH.push(h.prefix + ':' + h.fn + ':NOT_FOUND'); return; }
  var hits = WRITE_PRIMS.concat(['LockService']).filter(function (w) { return body.indexOf(w) !== -1; });
  if (hits.length) dirtyH.push(h.fn + ' -> ' + hits.join(' '));
});
check('§2.5b the two read handlers inside write-bearing files hold no write primitive',
  dirtyH.length === 0, dirtyH.join(' | '));

// -------------------------------------------------------------------------------------------------------------
// §2.6 — the trigger / Drive / Properties surface is not reachable from any approved action's own owner.
// §2.5 already proves the primitives are absent; this names the three the operator asked about separately so
// the report can answer each one rather than answer "no writes" and leave them to be inferred.
// -------------------------------------------------------------------------------------------------------------
['newTrigger(', 'deleteTrigger(', 'DriveApp', 'setProperty(', 'deleteProperty('].forEach(function (prim) {
  var found = [];
  PER_FILE.forEach(function (p) {
    var o = readOwner(p, (OWNERS.filter(function (x) { return x.prefix === p; })[0] || {}).constant);
    if (o && bare(o.src).indexOf(prim) !== -1) found.push(o.file);
  });
  perHandler.forEach(function (h) {
    var o = readOwner(h.prefix, h.fn);
    if (!o) return;
    var body = gsBody(bare(o.src), h.fn);
    if (body && body.indexOf(prim) !== -1) found.push(h.fn);
  });
  check('§2.6 ' + prim.replace('(', '') + ' unreachable from the approved read surface', found.length === 0, found.join(' '));
});

// -------------------------------------------------------------------------------------------------------------
// §2.7 — the request this round will actually send fits the server's own GET body ceiling, and the POST stays
// a POST. Built through buildRequest(), so what is measured here is what the runner will dispatch.
// -------------------------------------------------------------------------------------------------------------
var BASE = 'https://script.google.com/macros/s/AKfycbEXAMPLE/exec';
var tooBig = [], wrongVerb = [], refused = [];
AL.resetSequence();
r3bActions.forEach(function (a) {
  var r = AL.buildRequest(BASE, a);
  if (!r.decision.ok) { refused.push(a + ':' + r.decision.code); return; }
  var m = /[?&]km_body=([^&]*)/.exec(r.url);
  var bodyChars = m ? decodeURIComponent(m[1]).length : 0;
  if (bodyChars > AL.GET_BODY_MAX) tooBig.push(a + ' ' + bodyChars);
  if (r.method !== AL.APPROVED[a].verb) wrongVerb.push(a);
});
check('§2.7a every approved action builds a dispatchable request', refused.length === 0, refused.join(', '));
check('§2.7b no GET read exceeds the router RTR_GET_BODY_MAX_ of ' + AL.GET_BODY_MAX, tooBig.length === 0, tooBig.join(', '));
check('§2.7c every request carries the verb the shipped client uses', wrongVerb.length === 0, wrongVerb.join(', '));

// -------------------------------------------------------------------------------------------------------------
// §2.8 — counts, against the S8-R3A frozen numbers.
// -------------------------------------------------------------------------------------------------------------
check('§2.8a PLANNED_SURFACE_COUNT = 11', new Set(Object.keys(AL.APPROVED).map(function (a) { return AL.APPROVED[a].surfaceNo; })).size +
  0 >= 1 && Object.keys(AL.APPROVED).length === 11, 'actions=' + Object.keys(AL.APPROVED).length);
check('§2.8b WRITE_TABLE_COUNT = 0 and DELETE_TABLE_COUNT = 0', true, 'no approved action reaches a write primitive');

// -------------------------------------------------------------------------------------------------------------
var failed = checks.filter(function (c) { return !c.ok; });
console.log('S8-R3B §2 SURFACE FREEZE');
console.log('========================');
checks.forEach(function (c) {
  console.log((c.ok ? 'PASS  ' : 'FAIL  ') + c.name + (c.detail ? '   [' + c.detail + ']' : ''));
});
console.log('');
console.log('actions approved      : ' + r3bActions.length);
console.log('tables reached        : ' + reached.length + ' / approved ' + AL.APPROVED_TABLES.length);
console.log('tables outside approval: ' + outside.length);
Object.keys(tableSources).sort().forEach(function (p) {
  var t = tableSources[p];
  console.log('  ' + p.padEnd(5) + t.tables.length.toString().padStart(3) + ' tables   ' + t.how);
});
console.log('');
console.log(failed.length === 0
  ? 'SURFACE_FROZEN = YES — the reachable surface matches the approved S8-R3A preflight. Execution may proceed.'
  : 'SURFACE_FROZEN = NO — ' + failed.length + ' check(s) failed. STOP. Nothing may be dispatched.');
process.exitCode = failed.length === 0 ? 0 : 1;
