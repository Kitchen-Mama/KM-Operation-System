// F1-7N-FB-4E-R4B — LIVE READBACK AND DISPLAY CLOSURE.
//
// Covers the parts of R4B that are RESOLVED. Two are not, and this file records why rather than pretending
// otherwise, because a suite that quietly omits a requirement reads as coverage:
//
//   §B  factory-stock allocation by marketplace scope — STOPPED at the authority gate the task itself set. The
//       FC period and denominator ARE frozen (§7 rolling future 4-month; Company Total FC), but the ELIGIBLE
//       RECEIVER SET is not, and one half of the requested rule contradicts a USER-frozen rule. §B1 below pins
//       the frozen facts so the decision is made against evidence, and fails if any of them moves.
//   §D  the AI Plan / Recalculate no-op — root cause NOT established. §D1 records the hypothesis that was
//       tested and DISPROVED, so it is not tried again; §D2 asserts the one §D property that is repairable
//       without the root cause (a click never ends in silence).
//
// Run: node assets/tests/live-readback-and-display-closure-f1-7n-fb-4e-r4b.test.js

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var IR = read('assets/js/pages/inventory-replenishment.js');
var RO = read('assets/js/pages/request-order.js');
var HTML = read('index.html');

// =============================================================================================================
// §A — SITE INVENTORY: A COMPLETED RESULT THAT IS STILL VALID PAINTS IMMEDIATELY.
//
// Executed against the real module in a DOM-free sandbox: the page's own bootstrap is driven, and what is
// asserted is the request count and the painted state, not the presence of a code path.
// =============================================================================================================
var vm = require('vm');

function makeIrHarness(opts) {
  opts = opts || {};
  var reads = [];        // every workspace read this harness answered
  var regReads = [];
  var painted = [];      // every renderReplenishment() call, with the status at the time
  var loadRegion = [];   // every beginLoad()/set() the page drove — a QUIET read must drive none
  var store = {};
  var now = { t: opts.now || 1000000 };

  var win = {
    KM: {
      loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY' },
        bindElement: function () { return null; },
        createRegion: function () { return {
          beginLoad: function (hasData) { loadRegion.push('beginLoad:' + !!hasData); },
          set: function (st) { loadRegion.push('set:' + st); } }; } },
      api: {
        getWorkspace: function (name) {
          reads.push(name);
          if (opts.workspaceFails) return Promise.reject({ code: 'READ_FAILED' });
          return Promise.resolve({ success: true, data: { rows: [] } });
        }
      },
      DB: {
        adaptInventoryReplenishmentWorkspace: function () {
          return { getMarketplaceSkus: [{ sku: 'SKU-A' }] };
        }
      },
      scopeRegistry: {
        ensureLoaded: function () { regReads.push('registry'); return Promise.resolve({ status: 'READY' }); },
        getState: function () { return { status: 'READY', requests: regReads.length, from_cache: false }; }
      }
    },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    location: { hash: '' }, addEventListener: function () {}, removeEventListener: function () {}
  };
  var sb = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    window: win, document: {
      getElementById: function () { return null; }, querySelector: function () { return null; },
      querySelectorAll: function () { return []; }, addEventListener: function () {}, removeEventListener: function () {},
      createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} }, appendChild: function () {} }; },
      readyState: 'complete', body: { classList: { add: function () {}, remove: function () {} } }
    },
    JSON: JSON, Math: Math, Promise: Promise, Array: Array, Object: Object, String: String, Number: Number,
    Boolean: Boolean, RegExp: RegExp, Error: Error, Set: Set, Map: Map, isFinite: isFinite, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function () {}, clearInterval: function () {},
    Date: { now: function () { return now.t; } },
    localStorage: win.localStorage, fetch: function () { return Promise.reject(new Error('no network in this harness')); }
  };
  sb.globalThis = sb; sb.self = sb;
  var ctx = vm.createContext(sb);
  try { vm.runInContext(IR, ctx, { filename: 'inventory-replenishment.js' }); }
  catch (e) { return { loadError: String(e && e.message) }; }

  // The page's render entry point is replaced with a recorder, so "painted" is observed rather than inferred.
  vm.runInContext('renderReplenishment = function () { __painted.push(_irSearch.status); };', ctx);
  sb.__painted = painted;

  return { sb: sb, win: win, ctx: ctx, reads: reads, regReads: regReads, painted: painted, loadRegion: loadRegion, store: store, now: now,
    run: function (code) { return vm.runInContext(code, ctx); } };
}

var checks = [];

checks.push(Promise.resolve().then(function () {
  section('§A — SITE INVENTORY COMPLETED-RESULT RESTORATION');
  var h = makeIrHarness();
  ok(!h.loadError, 'A0 the page module loads in the harness (' + (h.loadError || 'ok') + ')');
  if (h.loadError) return;

  // FIRST VISIT — nothing remembered, nothing in hand.
  return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
    var d1 = h.run('window._irBootstrapDiagnostic_()');
    eq(d1.mode, 'REGISTRY_ONLY', 'A1 first visit with no remembered scope: the registry alone');
    eq(h.reads.length, 0, 'A1 ... and NO workspace read (the Search gate is untouched)');

    // A successful Search: one workspace read, the scope becomes applied and remembered.
    h.run('_irSearch.seq = _irSearch.seq + 1;');
    return Promise.resolve(h.run('_irWorkspaceRefresh_()')).then(function () {
      h.run('_irApplySearch_({ country: "US", marketplaceId: "MP1" }, _irSearch.seq)');
      eq(h.reads.length, 1, 'A2 an explicit Search performs exactly ONE workspace read');
      eq(h.run('_irSearch.status'), 'READY', 'A2 ... and the table is READY');
      var remembered = h.run('_irRestoreScope_()');
      eq(remembered, { country: 'US', marketplaceId: 'MP1' }, 'A2 ... and the successful scope is remembered');

      // LEAVE AFTER COMPLETION AND RETURN — the defect. Must paint immediately, with no blocking read.
      var readsBefore = h.reads.length;
      h.painted.length = 0;
      h.loadRegion.length = 0;
      return Promise.resolve(h.run('_irBootstrapScope_()')).then(function () {
        var d = h.run('window._irBootstrapDiagnostic_()');
        eq(d.mode, 'RESTORED', 'A3 leave-after-completion and return: the completed result is RESTORED');
        eq(d.registry_requests, 0, 'A3 ... with ZERO blocking registry requests');
        eq(d.workspace_requests, 0, 'A3 ... and ZERO blocking workspace requests');
        eq(h.painted[0], 'READY', 'A3 ... and the FIRST paint is READY, never a loading state');
        ok(h.painted.indexOf('LOADING') === -1, 'A3 ... "Searching…" is never painted (no LOADING in ' + JSON.stringify(h.painted) + ')');
        // The revalidation still runs — quietly.
        return Promise.resolve().then(function () {}).then(function () {
          ok(h.reads.length > readsBefore, 'A4 a quiet revalidation still runs against the server');
          eq(h.run('_irSearch.status'), 'READY', 'A4 ... and it never took the table out of READY');
          // MEASURED, not read from the source: a quiet revalidation drives the load region ZERO times.
          // Without this the `quiet` flag could be removed and only a text assertion would notice.
          eq(h.loadRegion.length, 0,
            'A4 ... and it drove the load region ZERO times (' + JSON.stringify(h.loadRegion) + ')');
        });
      });
    });
  });
}));

// A different scope must never receive the previous scope's result.
checks.push(Promise.resolve().then(function () {
  var h = makeIrHarness();
  if (h.loadError) return;
  return Promise.resolve(h.run('_irWorkspaceRefresh_()')).then(function () {
    h.run('_irApplySearch_({ country: "US", marketplaceId: "MP1" }, _irSearch.seq)');
    // The remembered scope is now MP1. Ask the restore for a DIFFERENT scope.
    var r = h.run('_irRestorableResult_({ country: "US", marketplaceId: "MP2" })');
    eq(r.ok, false, 'A5 a DIFFERENT scope is not restorable from the previous scope\'s result');
    eq(r.reason, 'SCOPE_NOT_APPLIED', 'A5 ... and the reason names it');
    var same = h.run('_irRestorableResult_({ country: "US", marketplaceId: "MP1" })');
    eq(same.ok, true, 'A5 while the SAME scope is');
    // Expiry.
    h.now.t += 11 * 60 * 1000;
    var aged = h.run('_irRestorableResult_({ country: "US", marketplaceId: "MP1" })');
    eq(aged.ok, false, 'A6 an EXPIRED result does not paint as current');
    eq(aged.reason, 'RESULT_EXPIRED', 'A6 ... and says so');
  });
}));

// A FAILED read is never restorable: failure is not cached as success.
checks.push(Promise.resolve().then(function () {
  var h = makeIrHarness({ workspaceFails: true });
  if (h.loadError) return;
  return Promise.resolve(h.run('_irWorkspaceRefresh_()')).then(function () { ok(false, 'A7 the failing read should reject'); },
    function () {
      h.run('_irSearch.applied = { country: "US", marketplaceId: "MP1" };');
      var r = h.run('_irRestorableResult_({ country: "US", marketplaceId: "MP1" })');
      eq(r.ok, false, 'A7 a FAILED read leaves nothing restorable — failure is not cached as success');
      eq(r.reason, 'NO_COMPLETED_RESULT', 'A7 ... because no completion was ever stamped');
    });
}));

// Source rules the restore must not break.
checks.push(Promise.resolve().then(function () {
  // The restore never assigns `applied` — §B.5's single assignment point is intact.
  var assigns = (IR.match(/_irSearch\.applied\s*=/g) || []).length;
  eq(assigns, 1, 'A8 `applied` is assigned in exactly ONE place in the whole page');
  var restoreBlock = /var restorable = _irRestorableResult_\(remembered\);[\s\S]{0,2000}?return Promise\.resolve\(remembered\);/.exec(IR);
  ok(!!restoreBlock, 'A8 the restore branch exists');
  ok(restoreBlock && restoreBlock[0].indexOf('_irSearch.applied =') === -1,
    'A8 ... and it never assigns `applied` — it only paints a scope that is ALREADY applied and validated');
  ok(restoreBlock && /quiet: true/.test(restoreBlock[0]), 'A8 ... and its revalidation is quiet');
  // An explicit Search always reads. It must not consult the restore.
  var applyFn = /function _irApplySearch_\([\s\S]*?\n}/.exec(IR);
  ok(applyFn && applyFn[0].indexOf('_irRestorableResult_') === -1,
    'A9 an explicit Search never restores — it always performs a fresh read');
  // Only a SUCCESS stamps the completion time.
  var stamp = /_irReadModelAt = _irNowMs_\(\);/.exec(IR);
  ok(!!stamp, 'A10 a completion time is stamped');
  eq((IR.match(/_irReadModelAt = _irNowMs_\(\)/g) || []).length, 1, 'A10 ... in exactly one place');
  ok(/env && env\.success && env\.data[\s\S]{0,700}_irReadModelAt = _irNowMs_/.test(IR),
    'A10 ... inside the SUCCESS branch only');
  // No whole-DB read, no write, restored or not.
  ok(!/getOperationDb/.test(String((restoreBlock && restoreBlock[0]) || '')), 'A11 the restore performs no whole-DB read');
  ok(!/loadOperationDb/.test(String((restoreBlock && restoreBlock[0]) || '')), 'A11 ... and no whole-DB reload');
}));

// =============================================================================================================
// §E — THE MAP DISPLAY NAMES.
// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('§E — MAP DISPLAY NAMES: LABEL ONLY, IDENTIFIER UNCHANGED');
  var g = {};
  var sb = { window: g, console: console };
  sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  vm.runInContext(read('assets/js/data/geo-names-zh-hant.js'), ctx, { filename: 'geo-names.js' });
  // TEXTURE-3-R5 §B — THE ALIAS ASSET IS PART OF THE PAGE, SO IT IS PART OF THE HARNESS. On `main` the two
  // short forms came from a table compiled into the resolver, so loading the resolver alone reproduced the page.
  // After the integration they come from a generated asset that index.html loads as its own <script>. Omitting
  // it here does not test the page — it tests a deployment with a missing script, and it reported the guard's
  // deliberate English fallback as though it were the normal result.
  vm.runInContext(read('assets/js/data/geo-display-aliases-zh-tw.js'), ctx, { filename: 'geo-display-aliases.js' });
  vm.runInContext(read('assets/js/core/geo-name-resolver.js'), ctx, { filename: 'geo-name-resolver.js' });
  var R = g.KM.geoNames;

  var cn = R.country('CN'), tw = R.country('TW');
  eq(cn.name, '中國', 'E1 CN displays as 中國');
  eq(tw.name, '台灣', 'E2 TW displays as 台灣');
  // TEXTURE-3-R5 §B — the authority moved; the property being asserted did not. E3 exists so that "the map
  // shows 中國" and "we know WHY the map shows 中國" are separate facts, and it still does.
  eq(cn.level, 'USER_APPROVED_ALIAS', 'E3 ... from the recorded-decision authority, reported as a level');
  eq(tw.level, 'USER_APPROVED_ALIAS', 'E3 ... for both');
  eq([cn.iso, tw.iso], ['CN', 'TW'], 'E4 the IDENTIFIERS are unchanged and still returned beside the name');

  // The vendored asset is untouched: no data was rewritten.
  eq(g.KM_GEO_NAMES_ZH_HANT.countries.CN, '中華人民共和國', 'E5 the vendored asset still carries the vendor name for CN');
  eq(g.KM_GEO_NAMES_ZH_HANT.countries.TW, '中華民國', 'E5 ... and for TW');
  var assetSrc = read('assets/js/data/geo-names-zh-hant.js');
  ok(assetSrc.indexOf('中國"') === -1 || assetSrc.indexOf('"CN":"中華人民共和國"') !== -1,
    'E5 ... and the asset file itself was not edited');

  // No reverse resolution: nothing maps a label back to an identifier.
  var resolverSrc = read('assets/js/core/geo-name-resolver.js');
  ok(!/中國'\s*:\s*'CN'|台灣'\s*:\s*'TW'/.test(resolverSrc), 'E6 no label→identifier reverse mapping exists');

  // Every other country still comes from the vendored source — this is two entries, not a translation layer.
  ['US', 'JP', 'GB', 'DE', 'VN', 'TH', 'MY'].forEach(function (c) {
    eq(R.country(c).level, 'ZH_HANT_PINNED_SOURCE', 'E7 ' + c + ' still resolves from the vendored source');
  });
  // KR left that list in R5: the map branch REVIEWED 大韓民國 as a formal state name where a Taiwan-standard
  // common map name exists, and records 南韓. Once the alias asset is loaded — as the page loads it — KR
  // legitimately answers one level higher. Asserted rather than dropped.
  eq(R.country('KR').level, 'REVIEWED_DISPLAY_ALIAS', 'E7 KR resolves from the REVIEWED alias, above the vendored name');

  // E8 — EXACTLY TWO DECIDED COUNTRIES, AND ONE PLACE THAT DECIDES THEM.
  //
  // This used to read the inline HOUSE_COUNTRY_ZH table out of the resolver source and count its entries. That
  // table is gone (R5 §B), and the check is restated against the surviving authority rather than deleted,
  // because what it was really protecting is unchanged: this is TWO recorded decisions, not a translation layer.
  //
  // It is also no longer a source grep. The old form would have PASSED on the merged file purely because the
  // resolver's comment explaining the removal mentions HOUSE_COUNTRY_ZH by name — and it crashed on `null[0]`
  // when the match failed, reporting a TypeError instead of an assertion. Executing the API cannot do either.
  var decided = R.approvedNames();
  eq(decided.length, 2, 'E8 exactly TWO countries carry a recorded display decision');
  eq(decided.map(function (d) { return d.iso; }).sort().join(','), 'CN,TW', 'E8 ... and they are CN and TW');
  decided.forEach(function (d) {
    eq(d.decided_by, 'USER', 'E8 ' + d.iso + ' is attributed to the decision owner');
    ok(d.full && d.full !== d.display, 'E8 ' + d.iso + ' keeps the formal name distinct from the label');
  });
  ok(!/var HOUSE_COUNTRY_ZH\s*=\s*\{/.test(resolverSrc.replace(/\/\/[^\n]*/g, ' ')),
    'E8 and no inline duplicate of that decision survives in executable source');

  // The English/operational surface is untouched.
  eq(R.country('CN', { lang: 'en' }).name, 'China', 'E9 the English operational name is unchanged');
  eq(R.country('TW', { lang: 'en' }).name, 'Taiwan', 'E9 ... for both');

  // The map's real consumer goes through this resolver, so the change reaches the live label.
  var globe = read('assets/js/lib/km-globe.js');
  ok(/window\.KM\.geoNames\.country\(/.test(globe), 'E10 the globe renderer labels countries through this resolver');

  // The reconciliation note for the map branch is recorded in the file that carries the change.
  //
  // TEXTURE-3-R5 — THAT MERGE HAS NOW HAPPENED, so the note's tense changed and the assertion follows it. What
  // is still required is unchanged and is the reason the note exists: a reader who finds two ways of naming CN
  // must be able to learn from this file that the question was already settled, and which way won.
  ok(/feature\/map-texture-3/.test(resolverSrc), 'E11 the map-branch reconciliation is recorded at the change');
  ok(/regenerat/i.test(resolverSrc), 'E11 ... and says what regenerating the alias asset must preserve');
  ok(/HOUSE_COUNTRY_ZH/.test(resolverSrc),
    'E11 ... and the superseded mechanism is named, so its removal is not silent');
  // The record must describe the mechanism that WON, not only the one that lost.
  ok(/geo-display-aliases-zh-tw\.js/.test(resolverSrc),
    'E11 ... and points at the asset that now owns the decision');
}));

// =============================================================================================================
// §B — THE AUTHORITY GATE. STOPPED, AND THE FROZEN FACTS PINNED SO THE DECISION IS MADE AGAINST EVIDENCE.
// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('§B — FACTORY ALLOCATION: STOPPED AT THE AUTHORITY GATE');
  var rules = read('docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md');
  var seed = read('docs/planning/DEMO_SEED_SHIPPING_SHIPMENT_MAP_F1-7N-FA-4A.md');

  // WHAT IS FROZEN — the half the task asked about explicitly.
  ok(/SKU FC Share = Marketplace SKU FC ÷ Company Total FC/.test(rules),
    'B1 the FC Share DENOMINATOR is frozen: Company Total FC');
  ok(/rolling future 4-month FC window/.test(rules), 'B1 the FC PERIOD is frozen: a rolling future 4-month window');
  ok(/never duplicates physical stock/.test(rules), 'B1 and the conservation rule is frozen: one pool, never duplicated');

  // WHAT IS NOT — and what it contradicts. These are the facts that STOP §B.
  ok(/Factory warehouses are shared operational sources across KM \/ ResUS \/ ResTW/.test(seed),
    'B2 factory warehouses are FROZEN as shared across all three companies');
  ok(/company mismatch must not reject a valid factory source/.test(seed),
    'B2 and a company mismatch is FROZEN as not a rejection reason');
  ok(/no. \`?warehouse_access\`? ?\/? ?\`?warehouse_permission\`?/.test(seed) || /no\b[\s\S]{0,80}warehouse_access/.test(seed),
    'B2 and no warehouse-access mapping table exists anywhere in the repository');
  // The executable rule agrees with the specification, which is what makes this a real contradiction and not a
  // documentation lag.
  var facts = read('assets/js/core/supply-planning-allocation-facts.js');
  ok(/eligibleFactoryWarehouseIds/.test(facts), 'B3 the executable factory-eligibility rule exists');
  var fn = /function eligibleFactoryWarehouseIds[\s\S]{0,900}?\n  \}/.exec(facts) || /eligibleFactoryWarehouseIds[\s\S]{0,900}/.exec(facts);
  ok(fn && !/company/.test(fn[0].split('\n').slice(0, 20).join('\n')),
    'B3 ... and it filters with NO company restriction, exactly as the frozen rule says');
}));

// =============================================================================================================
// §D — THE NO-OP: ROOT CAUSE NOT ESTABLISHED. ONE HYPOTHESIS TESTED AND DISPROVED, RECORDED SO IT IS NOT RETRIED.
// =============================================================================================================
checks.push(Promise.resolve().then(function () {
  section('§D — AI PLAN / RECALCULATE: WHAT WAS RULED OUT, AND THE SILENCE THAT WAS REPAIRED');

  // DISPROVED: "the shared scope modal is never loaded, so window.KM.scopeModal is undefined".
  // It IS loaded, before both pages that use it. Pinned here so this hypothesis is not tried again.
  var tag = /<script src="assets\/js\/utils\/scope-select-modal\.js\?v=([^"]+)"><\/script>/.exec(HTML);
  ok(!!tag, 'D1 DISPROVED HYPOTHESIS — the scope-select modal IS loaded by index.html');
  eq((HTML.match(/scope-select-modal\.js/g) || []).length, 1, 'D1 ... exactly once');
  var modalAt = HTML.indexOf('scope-select-modal.js');
  var roAt = HTML.indexOf('pages/request-order.js');
  var irAt = HTML.indexOf('pages/inventory-replenishment.js');
  ok(modalAt > -1 && modalAt < roAt && modalAt < irAt, 'D1 ... and BEFORE both pages that call it');
  ok(/window\.KM\.scopeModal = api/.test(read('assets/js/utils/scope-select-modal.js')),
    'D1 ... and the module registers window.KM.scopeModal on load');

  // REPAIRED regardless of root cause: the branch that runs when the modal is unavailable used to end in a bare
  // `return`. A user click that ends in silence is forbidden by §D whatever the underlying cause turns out to be.
  var fnSrc = /function _openRoScopeModal\(action\) \{[\s\S]*?\n    \}/.exec(RO);
  ok(!!fnSrc, 'D2 the scope-modal entry point exists');
  ok(fnSrc && fnSrc[0].indexOf('_roScopeModalUnavailable_') !== -1,
    'D2 the modal-unavailable branch now reports instead of returning silently');
  ok(/function _roScopeModalUnavailable_/.test(RO), 'D2 ... through a named reporter');
  ok(/Nothing was run and nothing was changed/.test(RO), 'D2 ... whose message states that nothing ran');
  var reporter = /function _roScopeModalUnavailable_[\s\S]*?\n\}/.exec(RO);
  ok(reporter && /toast|alert|console\.error/.test(reporter[0]), 'D2 ... via a user-visible channel, with a log fallback');
  // And it still runs without the picker when the toolbar already carries a concrete scope — a refusal only
  // when there is genuinely nothing to run with.
  ok(fnSrc && /concrete/.test(fnSrc[0]), 'D3 a concrete toolbar scope still runs without the picker');
}));

Promise.all(checks).then(function () {
  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}, function (e) {
  console.log('SUITE ERROR ' + (e && (e.stack || e.message || e)));
  process.exit(1);
});
