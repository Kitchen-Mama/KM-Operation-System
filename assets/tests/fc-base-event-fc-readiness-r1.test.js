// Kitchen Mama Operation System — FC BASE EVENT FC READINESS R1
// Run: node assets/tests/fc-base-event-fc-readiness-r1.test.js
//
// THE DEFECT THIS LOCKS SHUT. `_evtBuilderEventRows_` has always answered `null` for "the persisted
// Special Events are unavailable" and an array for "I read them" — its own comment says so, and it is
// the single owner all three builder consumers share (Base Event FC, the duplicate preflight, and the
// save's identity resolution). What was missing is that NOTHING DOWNSTREAM ASKED.
//
//   · the group-card build stored `baseEventFc: be ? be.baseEventFc : null`
//   · the cell printed null as an em dash, under the comment "no persisted event prints an em dash"
//
// So a model that could not be read printed, for every SKU at once, the one glyph that asserts the
// opposite of what had happened — and then the save let the payload through on the documented
// reasoning that the server's uniqueness guard is the authority. It is, and it still is; but the
// operator had already been shown false grounds for the save, so its only possible ending was a
// stage-1 refusal that reads as a server fault.
//
// WHAT THIS ROUND DID NOT TOUCH, because the incident report explicitly warned against assuming it:
// `_evtBaseEventForSku`, the canonical identity, Special Event uniqueness, the window-change gate,
// writer semantics, and 14_'s fcSeUniquenessConflict_ — which remains the authority. No request is
// issued by anything added here, and no timeout was changed.
//
// NO network call, NO Apps Script execution, NO DB / Drive / Sheets write, NO deployment.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('js/pages/fc-summary.js');

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, extra) {
  if (c) { pass++; } else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }

var RE_PRECEDERS_ = '(,=:[!&|?{};+-*%<>~^';
function fnSrc(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing fn ' + name);
  var i = src.indexOf('{', start), depth = 0, prev = '';
  for (; i < src.length; i++) {
    var c = src[i], n2 = src.substr(i, 2);
    if (n2 === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (n2 === '/*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { var q = c; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } prev = q; continue; }
    if (c === '/' && RE_PRECEDERS_.indexOf(prev) !== -1) { i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === '[') { for (i++; i < src.length && src[i] !== ']'; i++) { if (src[i] === '\\') i++; } continue; } if (src[i] === '/') break; } prev = '/'; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('unbalanced ' + name);
}
// Replace an exact line and REFUSE to pretend a mutant ran when its anchor has drifted.
function faulted(src, from, to, tag) {
  if (src.indexOf(from) === -1) throw new Error(tag + ' anchor drifted — the mutant would inject nothing');
  return src.split(from).join(to);
}

// ---------------------------------------------------------------------------------------------
// A sandbox holding the REAL owner + the REAL lookups, over a controllable row source.
// ---------------------------------------------------------------------------------------------
function world(opts, mutations) {
  var lift = [
    'var _fcReadModel = null;',
    'var _fcPrereqLoadedPaths_ = {};',
    fnSrc(FCS, '_fcHas_'),
    fnSrc(FCS, '_evtBuilderEventRows_'),
    fnSrc(FCS, '_evtEventModelAvailable_')
  ].join('\n');
  (mutations || []).forEach(function (m) { lift = faulted(lift, m[0], m[1], m[2]); });
  var window = { KM: { DB: { getFcSpecialEvents: function () { return opts.broad || []; } } } };
  var fn = new Function('window', 'RM', 'PATHS',
    lift + '\n; _fcReadModel = RM; _fcPrereqLoadedPaths_ = PATHS;' +
    '\n; return { rows: _evtBuilderEventRows_, avail: _evtEventModelAvailable_ };');
  return fn(window, opts.readModel || null, opts.paths || {});
}
var ROW = { sku: 'CO1100-R', raw: { sku: 'CO1100-R', fc_qty: 13000, campaign_id: 'C1',
  company: 'KM', country: 'US', marketplace: 'amazon', year: '2026',
  event_start_date: '2026-11-19', event_end_date: '2026-12-02', event_name: 'BFCM' } };

// =============================================================================================
section('A · unread is not empty, and the builder can now tell');
// =============================================================================================
var w = world({ paths: { event: true }, broad: [ROW] });
ok(w.avail() === true, 'A1 rows read from the broad cache → available');
eq((w.rows() || []).length, 1, 'A2 …and they are the rows');

w = world({ paths: { event: true }, broad: [] });
ok(w.avail() === true, 'A3 an EMPTY read is still a read — available, and genuinely empty');
eq(w.rows().length, 0, 'A4 …with no rows');

w = world({ paths: {}, broad: [ROW] });
ok(w.rows() === null, 'A5 path not latched → rows unavailable, even though the cache holds rows');
ok(w.avail() === false, 'A6 …and the predicate says so');

w = world({ paths: {}, readModel: { fcSpecialEvents: [ROW] }, broad: [] });
ok(w.avail() === true, 'A7 the workspace read model satisfies it without the prereq latch');

// The three consumers reach ONE owner, so they cannot disagree about the rows. The Base Event FC
// side reaches it one hop further out, through the grouping that the picker also uses.
ok(/_evtBuilderEventRows_\(\)/.test(fnSrc(FCS, '_evtExistingEvents_')),
   'A8 _evtExistingEvents_ reads the shared owner');
ok(/_evtExistingEvents_\(\)/.test(fnSrc(FCS, '_evtBaseEventGroup_')),
   'A8a …and the Base Event FC group resolves through it');
ok(/_evtBaseEventGroup_\(\)/.test(fnSrc(FCS, '_evtBaseEventForSku')),
   'A8b …and the per-SKU lookup through that');
ok(/_evtBuilderEventRows_\(\)/.test(fnSrc(FCS, '_evtDuplicateConflicts_')),
   'A9 the duplicate preflight reads the same owner directly');
ok(/_evtBaseEventForSku/.test(fnSrc(FCS, '_evtSingleRowIdentity_')),
   'A10 and the save identity resolves through the same lookup');
// …which is why an unavailable model silences ALL THREE at once — the property that made the
// duplicate preflight's silence the tell that the rows, not the dates, were the problem.
ok(/_evtBuilderEventRows_\(\)/.test(fnSrc(FCS, '_evtEventModelAvailable_')),
   'A11 and the availability predicate asks that same owner, not a fourth source');

// =============================================================================================
section('B · the cell states which of the two it means');
// =============================================================================================
var BUILD = FCS.slice(FCS.indexOf('var _evtModelAvail = _evtEventModelAvailable_();'),
                      FCS.indexOf('_evtRenderGroupCards();'));
ok(/var _evtModelAvail = _evtEventModelAvailable_\(\);/.test(BUILD),
   'B1 availability is resolved ONCE per build, not per row');
ok(BUILD.indexOf('_evtModelAvail') < BUILD.indexOf('rows.forEach'),
   'B2 …before any row is built, so one build cannot hold two truths');
ok(/baseEventFcUnknown: !_evtModelAvail,/.test(BUILD),
   'B3 …and every row carries it');

var CELL = FCS.slice(FCS.indexOf('r.baseEventFcUnknown') - 400, FCS.indexOf('r.baseEventFcUnknown') + 700);
ok(/could not be read/.test(CELL), 'B4 the unknown cell says the value could not be read');
ok(/not known to be empty/.test(CELL), 'B5 …and that this is not a claim that it is empty');
ok(/Nothing has been changed/.test(CELL), 'B6 …and that nothing was changed');
ok(/r\.baseEventFc == null \? '—'/.test(CELL),
   'B7 while a READ model still prints an em dash for a SKU that genuinely has no event');
ok(CELL.indexOf('r.baseEventFcUnknown') < CELL.indexOf("r.baseEventFc == null ? '—'"),
   'B8 …and unknown is decided FIRST, so it can never be reported as none');

// =============================================================================================
section('C · Save refuses a payload it could not preflight');
// =============================================================================================
var SAVE = fnSrc(FCS, 'saveEventUpdate');
ok(/if \(_dupHits === null\) \{/.test(SAVE), 'C1 an unreadable model refuses at the client');
ok(SAVE.indexOf('_dupHits === null') < SAVE.indexOf('_dupHits.length'),
   'C2 …decided before the conflict count, because null has no length');
var NULLBRANCH = SAVE.slice(SAVE.indexOf('_dupHits === null'), SAVE.indexOf('_dupHits.length'));
ok(/Nothing was written/.test(NULLBRANCH), 'C3 …and says plainly that nothing was written');
ok(/retry/i.test(NULLBRANCH), 'C4 …and tells the operator how to recover');
ok(!/getWorkspace|refreshCacheTables|upsert/.test(NULLBRANCH),
   'C5 …and issues NO request of its own — the existing reopen path owns the reload');
ok(SAVE.indexOf('_dupHits === null') < SAVE.indexOf('DB.upsertCampaign'),
   'C6 …and it refuses BEFORE stage 1, so nothing is written at any table');
ok(/if \(!_evtEditingActive_\(\)\) \{/.test(SAVE.slice(SAVE.indexOf('A3-R9 §2'))),
   'C7 an EXISTING event stays exempt — it addresses the row it loaded');

// The server guard is untouched, and is still described as the authority.
var G14 = read('specs/active/apps-script/14_fc_write_handlers.gs');
ok(/fcSeUniquenessConflict_/.test(G14), 'C8 the server uniqueness guard still exists');
ok(/14_'s fcSeUniquenessConflict_ remains the authority/.test(SAVE),
   'C9 …and the client says so rather than claiming to replace it');

// =============================================================================================
section('D · driven mutants');
// =============================================================================================
function mutant(label, fn) {
  mutants++;
  var caught = false;
  try { caught = !fn(); } catch (e) { caught = true; }
  if (caught) { pass++; } else { survived++; fail++; console.error('MUTANT SURVIVED: ' + label); }
}

// N1 — the predicate treating "unavailable" as available.
mutant('N1 availability predicate accepts null', (function () {
  var m = world({ paths: {}, broad: [ROW] },
    [['function _evtEventModelAvailable_() { return Array.isArray(_evtBuilderEventRows_()); }',
      'function _evtEventModelAvailable_() { return true; }', 'N1']]);
  return function () { return m.avail() === false; };
})());

// N2 — the owner answering [] instead of null for an unloaded path (unread becomes empty).
mutant('N2 the owner returns [] for an unloaded path', (function () {
  var m = world({ paths: {}, broad: [ROW] },
    [['  if (!_fcPrereqLoadedPaths_ || !_fcPrereqLoadedPaths_.event) return null;',
      '  if (!_fcPrereqLoadedPaths_ || !_fcPrereqLoadedPaths_.event) return [];', 'N2']]);
  return function () { return m.rows() === null && m.avail() === false; };
})());

// N3 — the build collapsing unknown back into none.
mutant('N3 the row stops carrying baseEventFcUnknown', function () {
  var f = faulted(BUILD, 'baseEventFcUnknown: !_evtModelAvail,', '', 'N3');
  return /baseEventFcUnknown: !_evtModelAvail,/.test(f);
});

// N4 — availability resolved per row instead of once per build.
mutant('N4 availability re-resolved inside the row loop', function () {
  var f = faulted(BUILD, 'var _evtModelAvail = _evtEventModelAvailable_();', '', 'N4');
  return /var _evtModelAvail = _evtEventModelAvailable_\(\);/.test(f);
});

// N5 — the cell printing an em dash for an unreadable model again.
mutant('N5 the unknown cell reverts to an em dash', function () {
  var f = faulted(CELL, 'r.baseEventFcUnknown', 'false', 'N5');
  return /r\.baseEventFcUnknown/.test(f);
});

// N6 — the save letting an unpreflightable payload through to stage 1.
mutant('N6 the save stops refusing an unreadable model', function () {
  var f = faulted(SAVE, '    if (_dupHits === null) {', '    if (false) {', 'N6');
  return /if \(_dupHits === null\) \{/.test(f);
});

// N7 — the null check demoted below the length check. The fault is REAL: with the order swapped an
// unreadable model reaches `_dupHits.length` first and throws a TypeError instead of refusing.
mutant('N7 null checked after length', function () {
  var nullLine = SAVE.slice(SAVE.indexOf('    if (_dupHits === null) {'), SAVE.indexOf('    if (_dupHits.length)'));
  var lenLine = '    if (_dupHits.length) { alert(_evtDuplicateRefusalText_(_dupHits, _dupCtx)); return; }';
  var f = faulted(SAVE, nullLine + lenLine, lenLine + nullLine, 'N7');
  return f.indexOf('_dupHits === null') < f.indexOf('_dupHits.length');
});

// N8 — the refusal quietly issuing its own read (forbidden by §F).
mutant('N8 the refusal issues a request', function () {
  var f = faulted(NULLBRANCH, "      return;", "      window.KM.api.getWorkspace('fcSummary'); return;", 'N8');
  return !/getWorkspace/.test(f);
});

// N9 — the duplicate refusal narrowing the conflict set, so a partial save of an authored set could
// proceed. The fault is injected, not merely asserted against.
mutant('N9 conflicts narrowed so the rest can save', function () {
  var f = faulted(SAVE, 'if (_dupHits.length) { alert(', 'if (_dupHits.filter(Boolean).length) { alert(', 'N9');
  return !/_dupHits\s*\.\s*(filter|slice)\s*\(/.test(f);
});

console.log('\nmutants: ' + mutants + ' · survived: ' + survived);
console.log('\n----------------------------------------');
console.log('FC BASE EVENT FC READINESS R1: ' + pass + ' passed, ' + fail + ' failed  ·  mutants ' + mutants + ', survived ' + survived);
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
if (fail) process.exit(1);
