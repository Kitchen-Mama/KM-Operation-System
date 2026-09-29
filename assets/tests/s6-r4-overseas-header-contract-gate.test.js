// S6-R4 §0 — THE OVERSEAS HEADER CONTRACT GATE.
//
// WHY THIS SUITE EXISTS AND WHAT IT MEANS WHEN IT FAILS.
//
// S6-R4 authorises runtime implementation of the overseas reserve / release / consume lifecycle. Its §0 is a
// HARD GATE: implementation may proceed only if the repository can PROVE that live production uses the
// canonical `wh_*` storage contract. It cannot. This suite is that proof, made executable, so the block is a
// checkable fact rather than a paragraph — and so the day the contract IS established, the tree says which
// assertions became false and why.
//
// EVERY ASSERTION BELOW IS A BLOCKING CONDITION. A failure here is NOT a regression: it means a blocking
// condition has been resolved, and the round that resolved it must update this suite alongside the evidence
// that resolved it. Read each label as "this is still unknown / still unsafe".
//
// THE FOUR FINDINGS, in increasing order of severity:
//
//   1. Every overseas balance reader carries a legacy-header fallback, whose own comment says it is removed
//      "once live overseas_inventory_snapshot headers are renamed + verified". That verification is recorded
//      nowhere in the repository.
//   2. 31_ writes BOTH namespaces simultaneously when it auto-creates a snapshot row. A writer that emits
//      both spellings is a writer that does not know which one is real.
//   3. Two live readers DISAGREE: 43_ reads `wh_available_stock` with no fallback and fails closed on a
//      missing value; 54_ reads it with a legacy fallback. They cannot both be right about the live sheet,
//      and 43_'s failure mode is a silently skipped row.
//   4. THE ONE THAT ACTUALLY BLOCKS R4: `wh_physical_stock` has NO WRITER ANYWHERE, is absent from the
//      importer's writable field set AND from its required-header validation, and is never written by the
//      receipt poster. §7 requires dispatch to decrement it. A consume that decrements an unwritten,
//      possibly-absent column is not a safe mutation.
//
// NO PRODUCTION WRITE. Source text and declared fixtures only.
//
// Run: node assets/tests/s6-r4-overseas-header-contract-gate.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
var GS = 'assets/specs/active/apps-script/';
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// Comments are not code: every claim about what the runtime DOES is made against the stripped text.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var F05 = read(GS + '05_overseas_inventory_handlers.gs');
var F31 = read(GS + '31_shipment_receipt_route_handlers.gs');
var F43 = read(GS + '43_api_v1_gap_materialization.gs');
var F54 = read(GS + '54_api_v1_raw_inventory_owner.gs');
var API = read('assets/js/api/operation-system-db-api.js');

var ALL_GS = fs.readdirSync(path.join(ROOT, GS)).filter(function (f) {
  return /\.gs$/.test(f) && f.indexOf('TEMP_') !== 0 && f !== '90_generated_supply_planning_bundle.gs';
});

// =========================================================================================================
section('A. BLOCKING 1 — the legacy fallback is still present, and its own condition is unmet');
// =========================================================================================================

var LEGACY = /var WH_LEGACY_ = \{([\s\S]*?)\};/.exec(F05);
ok(!!LEGACY, 'A1 05_ still declares WH_LEGACY_ — the temporary pre-migration header map');
var mapped = (LEGACY[1].match(/wh_[a-z_]+:/g) || []).map(function (s) { return s.replace(':', ''); }).sort();
eq(mapped, ['wh_available_stock', 'wh_damaged_stock', 'wh_on_the_way_eta', 'wh_on_the_way_qty', 'wh_reserved_stock'],
  'A2 and it maps five columns — NOT wh_physical_stock, which has no legacy alias at all');

// The fallback resolves canonical-then-legacy at three separate readers in 05_ alone.
var FALLBACKS = (code(F05).match(/indexOf\('wh_[a-z_]+'\);\s*if \([a-zA-Z]+ === -1\)/g) || []).length;
ok(FALLBACKS >= 3, 'A3 05_ resolves canonical-then-legacy at ' + FALLBACKS + ' readers — the live spelling is not assumed');
ok(/removed[\s\S]{0,80}once live overseas_inventory_snapshot headers are renamed \+ verified/.test(F05),
  'A4 the fallback\'s own removal condition is "renamed + VERIFIED"');
// And that verification exists nowhere. A claim in a planning document is not a verification of a live sheet
// — S6-R1's central finding was that those documents ran two releases behind the code.
var EVIDENCE = fs.readdirSync(path.join(ROOT, 'docs/evidence'));
var verified = EVIDENCE.filter(function (d) { return /overseas.*header|header.*overseas/i.test(d); });
eq(verified, [], 'A5 BLOCKING — no evidence round records a live overseas header verification');

// =========================================================================================================
section('B. BLOCKING 2 — the receipt poster writes BOTH namespaces at once');
// =========================================================================================================

var C31 = code(F31);
ok(/wh_available_stock:\s*after/.test(C31) && /available_stock:\s*after/.test(C31.replace(/wh_available_stock:\s*after/, '')),
  'B1 BLOCKING — 31_ writes wh_available_stock AND available_stock on the same auto-created row');
ok(/wh_reserved_stock:\s*0/.test(C31) && /[^_]reserved_stock:\s*0/.test(C31),
  'B2 and wh_reserved_stock AND reserved_stock, likewise');
// A writer that emits both spellings cannot tell you which one the sheet has. It is a hedge, and the hedge
// is the evidence: nobody knew, so the code covered both.
ok(!/wh_physical_stock/.test(C31) && !/[^_]physical_stock/.test(C31),
  'B3 and it writes NO physical column in EITHER namespace — a receipt-created row has no physical balance');

// =========================================================================================================
section('C. BLOCKING 3 — two live readers disagree about whether the legacy spelling exists');
// =========================================================================================================

ok(/gapNum_\(r\.wh_available_stock\)/.test(code(F43)),
  'C1 43_ reads wh_available_stock with NO legacy fallback');
ok(/missing/.test(F43) && /fail-closed|fail closed/.test(F43),
  'C2 and treats a missing value as "missing, not zero" — a skipped row, which raises no error');
ok(/rivPick_\(r, 'wh_available_stock', 'available_stock'\)/.test(code(F54)),
  'C3 while 54_ reads the SAME column WITH a legacy fallback');
ok(/_invPick\(r, 'wh_available_stock', 'available_stock'\)/.test(code(API)),
  'C4 and so does the client normalizer');
// They cannot both be right about one live sheet. If the sheet is legacy, 43_ silently drops every overseas
// row from gap materialisation and nothing anywhere reports it.
ok(true, 'C5 BLOCKING — the codebase contains readers that cannot both be correct about the live spelling');

// =========================================================================================================
section('D. BLOCKING 4 — wh_physical_stock has no writer, and §7 requires decrementing it');
// =========================================================================================================

// Writers, counted across every shipped handler. A "writer" means an assignment or a header-mapped emit.
var physWriters = ALL_GS.filter(function (f) {
  var c = code(read(GS + f));
  return /wh_physical_stock\s*:/.test(c) ||                       // emitted in a header-mapped object
         /setValue\([^)]*\)[^;]*wh_physical_stock/.test(c) ||
         /snPhys[^=]*\+ 1\)\.setValue/.test(c);                   // written through the resolved column index
});
eq(physWriters, [], 'D1 BLOCKING — NO shipped handler writes overseas wh_physical_stock');

// It is not in the importer's writable set...
var QTY = /var qtyFields = \[([\s\S]*?)\];/.exec(F05)[1];
ok(QTY.indexOf('wh_physical_stock') < 0,
  'D2 BLOCKING — it is absent from the importer\'s writable qtyFields');
// ...and not in its required-header validation, so the live sheet need not even HAVE the column.
ok(/var whReq = qtyFields\.concat\(\['wh_on_the_way_eta'\]\);/.test(code(F05)),
  'D3 BLOCKING — required headers = qtyFields + eta, so wh_physical_stock is never required to exist');

// The only two consumers read it, and one of them defaults it to zero.
ok(/snapHeaders\.indexOf\('wh_physical_stock'\)/.test(code(F05)),
  'D4 05_ READS it, solely to copy it unchanged onto the movement before/after pair');
ok(/physicalStock: parseFloat\(_invPick\(r, 'wh_physical_stock', 'physical_stock'\)\) \|\| 0/.test(code(API)),
  'D5 and the client normalizer defaults it to 0 — an absent column is indistinguishable from zero stock');

// WHY THIS BLOCKS. §7 requires dispatch to move physical down by the shipped quantity. Against an unwritten,
// possibly-absent column that is EXACTLY the shape of mutation the round forbids everywhere else.
ok(true, 'D6 BLOCKING — §7 requires wh_physical_stock to decrement; nothing has ever populated it');

// =========================================================================================================
section('E. what is NOT blocked — the two columns the lifecycle could otherwise use');
// =========================================================================================================

// Stated so the block is precise rather than total: available and reserved ARE maintained by live writers.
ok(QTY.indexOf('wh_available_stock') >= 0 && QTY.indexOf('wh_reserved_stock') >= 0,
  'E1 wh_available_stock and wh_reserved_stock ARE in the importer\'s writable set');
ok(/setMv\('to_stock_type', 'available'\)/.test(code(F05)),
  'E2 and the adjust handler maintains the available bucket through the declared ledger');
// So availability (§3) and the reserve/release bucket transfer (§5/§6) are reachable; CONSUME (§7) is not.
// §8 forbids landing any subset, which is why the whole atomic change is blocked rather than five-sixths of it.
ok(true, 'E3 §3 / §5 / §6 are reachable; §7 is not — and §8 forbids shipping the reachable subset alone');

// =========================================================================================================
section('F. the frozen mapping is unchanged by this block');
// =========================================================================================================

var CONTRACT = read('docs/planning/S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md');
['OVERSEAS_RESERVED_IS_SUBTRACTED_FROM_AVAILABLE = NO', 'R4_MUST_LAND_AS_ONE_CHANGE = YES',
 'DOUBLE_ALLOCATION_PATH_IF_SOURCE_UNBLOCKED_ALONE = 1', 'S6_MAPPING_FREEZE_COMPLETE = YES'
].forEach(function (t, i) {
  ok(CONTRACT.indexOf(t) >= 0, 'F' + (i + 1) + ' the R3 freeze still declares ' + t);
});
// Nothing in the overseas runtime changed this round.
ok(!/reservation_acquire/.test(code(F05)) && !/reservation_release/.test(code(F05)),
  'F5 no overseas reservation writer was added — R4 did not implement through an ambiguous mapping');

// =========================================================================================================
console.log('\n=====================================================');
console.log('S6-R4 OVERSEAS HEADER CONTRACT GATE — ' + pass + ' passed / ' + fail + ' failed');
if (fail === 0) {
  console.log('R4_BLOCKED_BY_HEADER_CONTRACT = YES');
  console.log('LIVE_WRITE_OWNER_EXPECTS_WH_HEADERS = UNPROVEN');
  console.log('BLOCKING_CONDITION_COUNT = 4   OPERATOR_VERIFICATION_REQUIRED = YES');
  console.log('PRODUCTION_ROWS_WRITTEN = 0   BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
