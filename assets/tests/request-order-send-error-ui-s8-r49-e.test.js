// =============================================================================================================
// S8-R49-E · E2 — the Request Order Send error dialog for MISSING_UNITS_PER_CARTON
// -------------------------------------------------------------------------------------------------------------
// R49-D installed the §14 server guard: a Send carrying a positive quantity with no usable units_per_carton is
// refused outright, and every offending line is named in details.conflicts. R49-D's own report recorded the
// remaining gap — the browser's error renderer had no branch for the new code, so it fell through to the generic
// one and the operator was told THAT something was wrong but never WHICH SKUs. This closes that.
//
// The renderer is executed from the SHIPPED request-order.js by brace-matched extraction — the same technique
// the supply-UI suite uses for _roCartonBreak — because request-order.js is a 5800-line browser page script with
// no module.exports that throws on `window` at load. A mirror would only prove the mirror.
//
// ON "ESCAPING". The detail message's sink is alert(), which is TEXT. The injection that matters there is not a
// tag — it is a NEWLINE or control character, which forges extra lines and lets a database value impersonate the
// system's own wording. That is what _roConflictText_ strips. The one innerHTML sink on this path is
// _roSetSendState_, which escapes through _roEsc2_; that boundary is proven separately below rather than
// assumed. Both sinks are covered, each by the defence its own sink actually needs.
// =============================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { pass++; } else { fail++; console.log('FAIL ' + msg + '  got ' + A + ' want ' + B); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// R49E_RO_OVERRIDE lets the mutant harness substitute a mutated COPY of the page script. Absent the env var
// this is byte-for-byte the shipped file; the production file is never written by a mutant.
const RO_PATH = process.env.R49E_RO_OVERRIDE || path.join(__dirname, '..', 'js/pages/request-order.js');
const RO = fs.readFileSync(RO_PATH, 'utf8');

function extractShipped(name) {
  const sig = 'function ' + name + '(';
  const i = RO.indexOf(sig);
  if (i < 0) throw new Error('FAIL-CLOSED: shipped function not found: ' + name);
  if (RO.indexOf(sig, i + 1) !== -1) throw new Error('FAIL-CLOSED: more than one definition of ' + name);
  let j = RO.indexOf('{', i), d = 0;
  for (; j < RO.length; j++) {
    const c = RO[j];
    if (c === '{') { d++; } else if (c === '}') { d--; if (d === 0) return RO.slice(i, j + 1); }
  }
  throw new Error('FAIL-CLOSED: unbalanced braces in ' + name);
}
// The renderer plus the two helpers it leans on, executed exactly as shipped.
const SHIPPED = [extractShipped('_roConflictText_'), extractShipped('_roEsc2_'),
                 extractShipped('_roSendOrchestrationErrorMessage_')].join('\n');
const sandbox = new Function(SHIPPED +
  '; return { msg: _roSendOrchestrationErrorMessage_, esc: _roEsc2_, txt: _roConflictText_ };')();
const render = sandbox.msg;

function envelope(code, message, details) {
  return { success: false, error: { code: code, message: message, details: details } };
}
function conflict(o) {
  o = o || {};
  return {
    code: 'MISSING_UNITS_PER_CARTON',
    natural_key: 'KM|US|Amazon|' + (o.sku || 'S1'),
    request_allocation_draft_id: 'RD::MONTHLY_ORDER::2026-08::company=KM|sku=' + (o.sku || 'S1'),
    company: o.company === undefined ? 'KM' : o.company,
    country: o.country === undefined ? 'US' : o.country,
    marketplace: o.marketplace === undefined ? 'Amazon' : o.marketplace,
    sku: o.sku === undefined ? 'S1' : o.sku,
    series: 'ALPHA',
    request_bucket: o.bucket === undefined ? 'T1' : o.bucket,
    request_month: '2026-09',
    order_qty: o.qty === undefined ? 137 : o.qty,
    units_per_carton_raw: o.raw === undefined ? '' : o.raw,
    units_per_carton_effective: null,
    resolution: 'Set a positive units_per_carton on the SKU master (sku_details) for this SKU, then Send again.'
  };
}
const SERVER_MSG = '1 Request Order line(s) carry a positive quantity but no usable units_per_carton '
  + '(missing, zero, negative or non-numeric). Send is blocked until the carton configuration is fixed and no '
  + 'carton size is assumed (§14). Nothing was written.';

// =============================================================================================================
section('1 — ONE missing-UPC SKU: the operator is told which line, and what to do');

const one = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, { conflicts: [conflict({})] }), false);
ok(one.indexOf('S1') !== -1, 'U1 the offending SKU is named');
ok(/T1/.test(one), 'U2 its request bucket is shown');
ok(/137/.test(one), 'U3 its order quantity is shown');
ok(/\(blank\)/.test(one), 'U4 a BLANK raw units_per_carton is shown as "(blank)" rather than as nothing at all');
ok(/KM \/ US \/ Amazon/.test(one), 'U5 the company / country / marketplace scope identifies the row');
ok(/SKU Details/i.test(one), 'U6 and the operator is told WHERE to fix it (SKU Details)');
ok(one.indexOf(SERVER_MSG) !== -1, 'U7 the server\'s own sentence is preserved verbatim, not paraphrased');
ok(/Nothing was written/i.test(one), 'U8 and the zero-write fact is stated, so no reconciliation is implied');
ok(/PARTIAL-carton quantity is allowed/i.test(one),
   'U9 it says a partial carton was NOT the reason — §37 must not be mistaken for this gate');

// The internal identifiers are NOT rendered: they identify rows, not the thing to correct.
ok(one.indexOf('RD::MONTHLY_ORDER') === -1 && one.indexOf('natural_key') === -1,
   'U10 the draft id and natural key are withheld — only what an operator can act on is shown');

// =============================================================================================================
section('2 — MULTIPLE SKUs, and a long list is capped rather than flooding the dialog');

const many = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, {
  conflicts: [conflict({ sku: 'AAA', bucket: 'T1', qty: 10 }),
              conflict({ sku: 'BBB', bucket: 'T2', qty: 20, raw: '0' }),
              conflict({ sku: 'CCC', bucket: 'T3', qty: 30, raw: 'N/A' })]
}), false);
ok(/AAA/.test(many) && /BBB/.test(many) && /CCC/.test(many), 'U11 every affected SKU is listed');
ok(/"0"/.test(many) && /"N\/A"/.test(many),
   'U12 the RAW value actually read is quoted back — "0" and "N/A" are distinguishable from blank');
eq(many.split('\n').filter(function (l) { return l.indexOf('  · ') === 0; }).length, 3,
   'U13 one line per conflict, no more and no fewer');

const lots = [];
for (let i = 0; i < 26; i++) lots.push(conflict({ sku: 'SKU-' + i }));
const capped = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, { conflicts: lots }), false);
eq(capped.split('\n').filter(function (l) { return l.indexOf('  · ') === 0; }).length, 10,
   'U14 a long list is capped at 10 rendered lines');
ok(/… and 16 more line\(s\)/.test(capped),
   'U15 and the remainder is COUNTED rather than silently dropped — 26 conflicts, 10 shown, 16 named as omitted');

// =============================================================================================================
section('3 — absent and malformed details never throw and never mislead');

function safely(fn) { try { return { ok: true, v: fn() }; } catch (e) { return { ok: false, v: String(e && e.message) }; } }

const noDetails = safely(function () { return render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, undefined), false); });
ok(noDetails.ok, 'U16 details entirely absent does not throw');
ok(/did not return the affected lines/.test(noDetails.v),
   'U17 and it says the list is missing instead of printing an empty bullet list that looks like "no SKUs"');

const noConflicts = safely(function () { return render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, { next_action: 'x' }), false); });
ok(noConflicts.ok && /did not return the affected lines/.test(noConflicts.v),
   'U18 details present but conflicts absent is handled the same honest way');

const notArray = safely(function () { return render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, { conflicts: 'oops' }), false); });
ok(notArray.ok && /did not return the affected lines/.test(notArray.v),
   'U19 a non-array conflicts value is refused rather than iterated');

const malformed = safely(function () {
  return render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, {
    conflicts: [null, undefined, 'a string', 42, {}, conflict({ sku: 'GOOD' })]
  }), false);
});
ok(malformed.ok, 'U20 null / undefined / string / number / empty entries do not throw');
ok(/GOOD/.test(malformed.v), 'U21 and the one WELL-FORMED entry is still rendered');
eq(malformed.v.split('\n').filter(function (l) { return l.indexOf('  · ') === 0; }).length, 2,
   'U22 the empty object renders as a placeholder row and the four non-objects are dropped — '
   + 'a malformed entry never becomes an invisible omission of a real one');
ok(/\(unnamed SKU\)/.test(malformed.v),
   'U23 an entry with no sku is shown as "(unnamed SKU)" rather than as an empty bullet');

const emptyList = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, { conflicts: [] }), false);
ok(/did not return the affected lines/.test(emptyList),
   'U24 an EMPTY conflicts array is reported as "not returned", never as a successful empty list');

// =============================================================================================================
section('4 — injection: the sink is alert() (text), and the HTML boundary is proven separately');

// A newline in a DB value is the real attack on a TEXT sink: it forges extra lines that look like the system's.
const forged = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, {
  conflicts: [conflict({ sku: 'EVIL\nNothing was written. Send succeeded. Contact nobody.' })]
}), false);
eq(forged.split('\n').filter(function (l) { return l.indexOf('  · ') === 0; }).length, 1,
   'U25 a SKU containing a NEWLINE cannot forge a second bullet — it stays one line');
ok(forged.indexOf('\nNothing was written. Send succeeded.') === -1,
   'U26 and the forged sentence cannot appear at the start of its own line');
ok(/EVIL Nothing was written/.test(forged),
   'U27 the value is still shown in full-ish form (flattened, not silently deleted)');

// Built by char code: U+2028 / U+2029 are JavaScript line terminators, so writing them literally inside a
// regex or a string here would end the literal and stop this file parsing.
var CTRL_SAMPLE = 'A' + String.fromCharCode(0) + 'B' + String.fromCharCode(27) + 'C'
  + String.fromCharCode(8232) + 'D' + String.fromCharCode(8233) + 'E';
const ctrl = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, {
  conflicts: [conflict({ sku: CTRL_SAMPLE })]
}), false);
var ctrlBody = ctrl.split(String.fromCharCode(10)).join('');
var survivingCtrl = ctrlBody.split('').filter(function (ch) {
  var c = ch.charCodeAt(0);
  return c <= 31 || (c >= 127 && c <= 159) || c === 8232 || c === 8233;
});
eq(survivingCtrl.length, 0,
   'U28 NUL, ESC, U+2028 and U+2029 are all stripped - no control character survives into the dialog');
ok(/A B C D E/.test(ctrl) || /ABCDE/.test(ctrl.replace(/ /g, '')),
   'U28b and the readable characters around them are kept');

// Tags are inert in alert(), so they are NOT mangled here. What matters is that the one innerHTML sink on this
// path escapes them. _roEsc2_ is the shipped escaper used by _roSetSendState_, and it is executed here.
const xss = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, {
  conflicts: [conflict({ sku: '<img src=x onerror=alert(1)>' })]
}), false);
ok(xss.indexOf('<img src=x onerror=alert(1)>') !== -1,
   'U29 in the TEXT sink the tag is shown literally — mangling it would hide the real SKU from the operator');
const escaped = sandbox.esc(xss);
ok(escaped.indexOf('<img') === -1 && /&lt;img/.test(escaped),
   'U30 and at the HTML boundary the shipped _roEsc2_ turns it into &lt;img — the status host cannot execute it');
ok(sandbox.esc('"&<>').indexOf('&quot;&amp;&lt;&gt;') === 0,
   'U31 _roEsc2_ escapes quote, ampersand and both angle brackets');

// A very long value cannot push the guidance off the end of the dialog.
const long = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, {
  conflicts: [conflict({ sku: 'X'.repeat(500) })]
}), false);
ok(long.indexOf('X'.repeat(500)) === -1 && /…/.test(long),
   'U32 an over-long SKU is truncated with an ellipsis');
ok(/SKU Details/i.test(long), 'U33 and the guidance still reaches the operator after the truncation');

// =============================================================================================================
section('5 — cross-company conflicts: identified, but no internal row data leaks');

const cross = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, {
  conflicts: [conflict({ sku: 'S1', company: 'KM', country: 'US' }),
              conflict({ sku: 'S2', company: 'ResUS', country: 'US' }),
              conflict({ sku: 'S3', company: 'ResTW', country: 'TW', marketplace: 'Shopee' })]
}), false);
ok(/KM \/ US \/ Amazon/.test(cross) && /ResUS \/ US \/ Amazon/.test(cross) && /ResTW \/ TW \/ Shopee/.test(cross),
   'U34 each line is attributed to its OWN company / country / marketplace — the operator can tell them apart');
ok(cross.indexOf('RD::MONTHLY_ORDER') === -1 && cross.indexOf('ALPHA') === -1
   && cross.indexOf('units_per_carton_effective') === -1,
   'U35 and no draft id, series or internal field is rendered for ANY of them — the whitelist holds across '
   + 'companies, so a multi-company refusal cannot leak internal row data');
ok(/^\s*· /m.test(cross.split('\n').filter(function (l) { return /ResUS/.test(l); })[0] || ''),
   'U36 the ResUS line is a normal rendered bullet, not a special case');

// A conflict with a missing company still renders rather than vanishing.
const noScope = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, {
  conflicts: [conflict({ sku: 'S9', company: '', country: '', marketplace: '' })]
}), false);
ok(/S9/.test(noScope) && noScope.indexOf('[]') === -1 && noScope.indexOf('[ / ') === -1,
   'U37 a conflict with no scope fields renders the SKU and omits the bracket entirely (no empty "[ / / ]")');

// =============================================================================================================
section('6 — every pre-existing branch is untouched');

const qv = render(envelope('QUANTITY_VERIFICATION_FAILED', 'mismatch', {
  failure_count: 2,
  failures: [{ sku: 'Q1', request_bucket: 'T1', code: 'DRIFT', intended_qty: 5, persisted_qty: 9 },
             { sku: 'Q2', request_bucket: 'T2', code: 'ABSENT', intended_qty: 7, persisted_qty: null }]
}), false);
ok(/數量驗證失敗/.test(qv), 'U38 QUANTITY_VERIFICATION_FAILED still renders its own dialog');
ok(/Q1 T1 — DRIFT \(on screen 5, in database 9\)/.test(qv), 'U39 with its per-row failure detail intact');
ok(/NOT PERSISTED/.test(qv), 'U40 and its NOT PERSISTED wording for a missing persisted quantity');
ok(qv.indexOf('units_per_carton') === -1, 'U41 and it did not pick up any carton wording');

const dup = render(envelope('DUPLICATE_BUSINESS_IDENTITY',
  '2 business scope(s) have more than one active allocation draft. Nothing was written.',
  { conflicts: [{ code: 'DUPLICATE_BUSINESS_IDENTITY', natural_key: 'KM|US|Amazon|S1', draft_ids: ['A', 'B'] }],
    next_action: 'Run the allocation-draft identity diagnostic (system.allocationDraftIdentityDiagnostic) and resolve the duplicates.' }), false);
ok(/Send Request 失敗/.test(dup) && /DUPLICATE_BUSINESS_IDENTITY/.test(dup),
   'U42 the duplicate-identity error still falls through to the generic branch, unchanged by this round');
ok(dup.indexOf('units_per_carton') === -1 && dup.indexOf('SKU Details') === -1,
   'U43 and it is NOT rendered as a carton problem — the two refusals stay distinct in the UI');

const timeout = render(envelope('REQUEST_TIMEOUT', 'timed out', {}), true);
ok(/RESUMABLE BY EXECUTION KEY/.test(timeout), 'U44 the indeterminate/timeout branch still takes precedence');
var sameKey = render(envelope('SEND_IN_PROGRESS_SAME_KEY', 'busy already', {}), false);
ok(/已在執行中/.test(sameKey) && /Do not retry/.test(sameKey) && /busy already/.test(sameKey),
   'U45 SEND_IN_PROGRESS_SAME_KEY still renders its own wording and passes the server message through '
   + '(this branch prints the message, not the code)');
ok(/已保存的配額內容已變更/.test(render(envelope('SOURCE_CHANGED_SINCE_INTERRUPTION', 'changed', {}), false)),
   'U46 SOURCE_CHANGED_SINCE_INTERRUPTION still renders');
ok(/out of date|deployment/i.test(render(envelope('DEPLOYMENT_CONTRACT_MISMATCH', '', {}), false)),
   'U47 DEPLOYMENT_CONTRACT_MISMATCH still renders');
ok(/REQUEST_ORDER_OUTPUT_UNPROVEN/.test(render(envelope('REQUEST_ORDER_OUTPUT_UNPROVEN', 'x', {}), false)),
   'U48 REQUEST_ORDER_OUTPUT_UNPROVEN still renders');
const unknown = render(envelope('SOMETHING_NEW', 'a new reason', {}), false);
ok(/a new reason/.test(unknown) && /SOMETHING_NEW/.test(unknown),
   'U49 and an UNKNOWN code still falls through to the generic branch with its message and code');

// =============================================================================================================
section('7 — Send LOGIC is untouched (structural, this round changed presentation only)');

const SEND = RO.slice(RO.indexOf('async function handleSendRequest()'), RO.indexOf('function _roSendPlanningCycle_'));
ok(SEND.length > 500, 'U50 the shipped handleSendRequest body was located (fail-closed)');
ok(SEND.indexOf('MISSING_UNITS_PER_CARTON') === -1,
   'U51 handleSendRequest contains no carton gate — the server remains the sole authority (R49-D)');
ok(/_roSendOrchestrationErrorMessage_\(pv/.test(SEND) && /_roSendOrchestrationErrorMessage_\(res/.test(RO),
   'U52 both the preview and execute failure paths still route through the renderer this round changed');

// =============================================================================================================
section('8 - the REAL server conflict, rendered (field-name parity, not a hand-written fixture)');
// Every conflict above is a fixture written by hand, so it proves the renderer but not that the renderer and
// the SERVER agree on field names. This takes a conflict straight out of the shipped rosBuildWorkset_ and
// renders that. If 66_ ever renames units_per_carton_raw or request_bucket, this fails instead of the operator
// silently losing a column.
(function () {
  var G66 = fs.readFileSync(path.join(__dirname, '..',
    'specs/active/apps-script/66_api_v1_request_order_send.gs'), 'utf8').split('\r\n').join('\n');
  function sl(a, b) { var i = G66.indexOf(a); var j = G66.indexOf(b, i + 1); return G66.slice(i, j); }
  var boot = sl('var ROS_BUILD_VERSION_ =', '// __ROS_PURE_START__')
    + sl('// __ROS_PURE_START__', '// __ROS_PURE_END__');
  var api = new Function(boot + '; return { ws: rosBuildWorkset_ };')();
  var row = { request_allocation_draft_id: 'RD::MONTHLY_ORDER::2026-08::company=KM|sku=SNOUPC',
    planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SNOUPC',
    status: 'site_confirmed', draft_version: 1, units_per_carton: '', updated_at: '2026-08-20 10:00',
    t1_month: '2026-09', t1_order_qty: 137, t1_status: 'draft', t1_recommended_qty: '', t1_user_edited: '',
    t2_month: '', t2_order_qty: '', t2_status: '', t2_recommended_qty: '', t2_user_edited: '',
    t3_month: '', t3_order_qty: '', t3_status: '', t3_recommended_qty: '', t3_user_edited: '' };
  var ws = api.ws([row], { planning_cycle: '2026-08', tier_scope: 'ALL', series_by_sku: {}, units_per_carton_by_sku: {} });
  eq(ws.blocking_conflicts.length, 1, 'U53 the shipped server guard produced exactly one real conflict');
  var real = render(envelope('MISSING_UNITS_PER_CARTON', SERVER_MSG, { conflicts: ws.blocking_conflicts }), false);
  ok(/SNOUPC/.test(real), 'U54 the REAL conflict renders its sku');
  ok(/T1/.test(real) && /137/.test(real), 'U55 and its real bucket and quantity');
  ok(/\(blank\)/.test(real),
     'U56 and its real blank units_per_carton_raw - server and UI agree on the field name');
  ok(/KM \/ US \/ Amazon/.test(real), 'U57 and its real company / country / marketplace');
  ok(real.indexOf('RD::MONTHLY_ORDER') === -1,
     'U58 while the real draft id the server DOES send is still withheld from the dialog');
})();

if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('\n----------------------------------------');
console.log('REQUEST ORDER SEND ERROR UI (S8-R49-E): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
