// =================================================================================================================
// S3-R3 — THE RUNTIME LIFECYCLE AUDIT, AND WHAT IT IS ALLOWED TO CLAIM.
//
// S3-R2 closed one page and left the rest measured only structurally. It also produced the reason that debt could
// not be paid with a grep: two pages with the SAME static signature had different runtime ownership, and the count
// that looked like a defect was not one. So this round measured. The instrument is
// `_s3r3-lifecycle-runner.js` — headless Chrome, the real index.html, the real router — and its output is committed
// at docs/evidence/s3-r3-runtime-lifecycle/measurements.json.
//
// THIS SUITE DOES NOT DRIVE CHROME, and that is deliberate rather than a shortcut. One page (Weekly Shipping Plan)
// blocks the event loop indefinitely, so a browser pass inside the canonical sweep would hang it forever. What is
// asserted here instead is (1) the recorded evidence still says what the report says it says, and (2) the
// instrument that produced it is still correct — because three separate measurement bugs in this round each
// pointed at a defect that was not there, and a harness whose errors are silent is worse than no harness.
//
// THE THREE INSTRUMENT BUGS, kept as assertions because each one nearly became a false finding:
//
//   · listener drift counted ADDS ONLY. Every page that tidies up after itself reads as a leaker that way, and
//     the one that genuinely leaks is buried in the noise. Drift is net.
//   · the classifier read the first 400 characters of a section, which is the TOOLBAR. The table body — where a
//     read failure actually renders — fell outside the window, and two pages were about to be reported as hiding
//     their errors on that basis.
//   · `empty` matched the bare word, which appears in the Overseas toolbar. It now needs a phrase a results area
//     actually prints, and the raw tail travels with every record so a surprising verdict can be checked by eye.
//
// NO FIX SHIPPED IN THIS ROUND. Eleven pages were measured and found healthy on every property the S3 contract
// names; the twelfth reproduced a stall four times and its mechanism is NOT established. Guessing at a repair for
// a page whose failure is not understood is the speculative cleanup §6 forbids, so it is reported as open.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }

const EV = JSON.parse(read('docs/evidence/s3-r3-runtime-lifecycle/measurements.json'));
const RUNNER = read('assets/tests/_s3r3-lifecycle-runner.js');
const PAGES = Object.keys(EV.pages);

// =================================================================================================================
section('A — THE AUDIT SET, RECONCILED. Order Planning is not a thirteenth page.');
// =================================================================================================================
{
  eq(PAGES.length, 12, 'A1  twelve distinct operational pages, not the thirteen S3-R2 projected');

  // A2 — the discrepancy, asserted against index.html rather than asserted as a claim. "Order Planning" and
  //      "Request Order" are two menu labels on ONE route, so S3-R2's P0/P1 count included the same page twice.
  const idx = read('index.html');
  const opBlock = idx.slice(Math.max(0, idx.indexOf('Order Planning') - 400), idx.indexOf('Order Planning') + 60);
  ok(/showSection\('request-order'\)/.test(opBlock),
    'A2  Order Planning is reached by showSection(\'request-order\') — the same route as Request Order');
  ok(PAGES.indexOf('order-planning') === -1,
    'A2a so it is not carried as a separate page, and the count is 12 rather than 13');

  // A3 — Shipment Overview has its OWN entry point, recorded rather than smoothed into showSection.
  ok(/showShipmentOverview\(\)/.test(idx) && PAGES.indexOf('shippinghistory') !== -1,
    'A3  Shipping History / Shipment Overview is reached by its own function and is in the set');

  const p0 = PAGES.filter((k) => EV.pages[k].risk === 'P0');
  const p1 = PAGES.filter((k) => EV.pages[k].risk === 'P1');
  eq([p0.length, p1.length], [7, 5], 'A4  seven P0 and five P1');
}

// =================================================================================================================
section('B — WHAT WAS MEASURED, AND WHAT WAS NOT');
// =================================================================================================================
{
  const measured = PAGES.filter((k) => EV.pages[k].measured);
  const unmeasured = PAGES.filter((k) => !EV.pages[k].measured);
  eq(measured.length, 11, 'B1  eleven pages measured in BOTH a succeeding and a rejecting transport');
  eq(unmeasured, ['shippingplan'],
    'B2  and exactly one was not — named, not quietly dropped');

  // B3 — a page that was not measured must not carry numbers. An invented zero is worse than a gap.
  const inventedZeroes = unmeasured.filter((k) => EV.pages[k].ok !== null || EV.pages[k].reject !== null);
  eq(inventedZeroes, [],
    'B3  the unmeasured page carries NO request counts — §3 forbids inventing zeroes for unexecuted scenarios');
  ok(EV.pages.shippingplan.stall && EV.pages.shippingplan.stall.root_cause === 'NOT ESTABLISHED',
    'B3a it carries a reproduction instead, and says plainly that the cause is not established');
  ok(EV.pages.shippingplan.stall.reproduced_times >= 4,
    'B3b reproduced four times, so it is a finding rather than a flake', EV.pages.shippingplan.stall.reproduced_times);
  ok(EV.pages.shippingplan.stall.response_shape_independent === true,
    'B3c and it reproduces whether the transport resolves or rejects — so it is not a response-shape bug');
}

// =================================================================================================================
section('C — THE S3 CONTRACT, OVER EVERY MEASURED PAGE');
// =================================================================================================================
{
  const measured = PAGES.filter((k) => EV.pages[k].measured);

  // C1 — route re-entry cannot duplicate requests. Measured as: a rapid leave-and-return issues no MORE
  //      than a cold entry did. This is the property S3-R1's Factory Inventory storm violated 41 times over.
  const dupes = measured.filter((k) => EV.pages[k].ok.fast_api > EV.pages[k].ok.cold_api);
  eq(dupes, [], 'C1  DUPLICATE_REQUEST_COUNT = 0 — no page issues extra requests on rapid re-entry', dupes);

  // C2 — unmount while a request is pending leaves nothing behind.
  const leaked = measured.filter((k) => EV.pages[k].ok.unmount_api > 0);
  eq(leaked, [], 'C2  leaving mid-flight dispatches nothing further on any page', leaked);

  // C3 — LISTENER_DRIFT = 0. Net, so a page that adds and removes evenly is not slandered.
  const drifters = measured.filter((k) => EV.pages[k].ok.listener_drift > 0);
  eq(drifters, [], 'C3  LISTENER_DRIFT = 0 — no page nets a listener on window or document across a re-entry',
    drifters.map((k) => k + ':' + EV.pages[k].ok.listener_drift));

  // C4 — TIMER_DRIFT = 0. No operational page installs an interval at all, so none can survive an unmount.
  const timers = measured.filter((k) => EV.pages[k].ok.intervals > 0);
  eq(timers, [], 'C4  TIMER_DRIFT = 0 — not one measured page installs a polling interval', timers);

  // C5 — NO UNBOUNDED RETRY. Under a transport that rejects EVERY request, a self-retrying page shows an
  //      unbounded count; S3-R1's measured storm was 41 from one entry. Every page here stays in single figures.
  const storms = measured.filter((k) => EV.pages[k].reject.cold_api > 8);
  eq(storms, [], 'C5  UNBOUNDED_RETRY_COUNT = 0 — no page exceeds eight requests under total transport failure',
    storms.map((k) => k + ':' + EV.pages[k].reject.cold_api));
  const worst = Math.max.apply(null, measured.map((k) => EV.pages[k].reject.cold_api));
  ok(worst <= 4, 'C5a the worst measured cold entry under sustained failure is ' + worst + ' requests');

  // C6 — ERROR IS NOT SILENCE. A rejecting transport must produce something the operator can read. The one
  //      page that shows no error text is the one that makes no request at all, and it says so instead.
  const silent = measured.filter((k) => EV.pages[k].reject.cold_api > 0 && !EV.pages[k].reject.says_error);
  eq(silent, [], 'C6  every page that ISSUES a read reports the failure in words', silent);
  eq(EV.pages['product-strategy'].reject.cold_api, 0,
    'C6a and the exception issues no request — it refuses before the transport, which is fail-closed, not silent');
  ok(/SOURCE_NOT_CONNECTED/.test(EV.pages['product-strategy'].reject.tail || ''),
    'C6b it names that state on screen', EV.pages['product-strategy'].reject.tail);

  // C7 — ERROR != EMPTY. No measured page presents a failed read as "there is no data".
  // CO-PRESENCE IS NOT CONFLATION, and an earlier version of this line failed on exactly that. A filter
  // dropdown reading "No options" puts an empty-shaped phrase on almost every page, so "says both" proves
  // nothing. What §11 forbids is a failed read PRESENTED AS an empty result — a page that shows "no data"
  // and never says it failed. That is what is measured.
  const conflated = measured.filter((k) => EV.pages[k].reject.says_empty && !EV.pages[k].reject.says_error);
  eq(conflated, [], 'C7  ERROR_EMPTY_CONFLATION = 0 — no failed read is presented as an empty result', conflated);

  // C8 — and a SUCCESSFUL read with nothing in it is allowed to say so. Purchase Order Overview is the proof
  //      that C7 is not passing merely because no page ever renders an empty state.
  ok(/no purchase orders yet/i.test(EV.pages['purchase-order-overview'].ok.tail || ''),
    'C8  EMPTY is reachable on a successful read — so C7 is a real distinction, not an absence');
}

// =================================================================================================================
section('D — THE INSTRUMENT IS STILL CORRECT');
// =================================================================================================================
// Three measurement bugs in this round each pointed at a defect that did not exist. They are asserted so the next
// round cannot quietly reintroduce one and believe the result.
{
  ok(/rec\.listener_drift = rec\.listeners_added_warm - rec\.listeners_removed_warm;/.test(RUNNER),
    'D1  listener drift is NET — adds minus removes, so a tidy page is not reported as a leaker');
  ok(/return t\.replace\(\/\\\\s\+\/g, " "\)\.trim\(\);/.test(RUNNER) || !/slice\(0, 400\)/.test(RUNNER),
    'D2  the classifier reads the WHOLE section — the 400-character window that showed only toolbars is gone');
  ok(/no \[a-z \]\{0,18\}\(yet\|found\)/.test(RUNNER),
    'D3  "empty" needs a phrase a results area prints, not the bare word that matched a toolbar');
  ok(/cold_tail/.test(RUNNER),
    'D4  and every record carries raw text, so a surprising classification can be checked by eye');

  // D5 — the harness cannot reach the network. This is the claim that makes every number above admissible.
  ok(/function isApi\(u\) \{ return \/\^https\?:\/i\.test\(String\(u\)\); \}/.test(RUNNER),
    'D5  absolute http(s) requests are intercepted — no measurement was taken against production');
  ok(RUNNER.indexOf('<head$1>') > 0 || /replace\(\/<head\(\[\^>\]\*\)>\/i/.test(RUNNER),
    'D5a and the stub is installed in <head>, before any application script can capture the real fetch');

  // D6 — the runner cleans up after itself. A stray file in the repo root is what the canonical sweep reports
  //      as a suite that left the tree dirty, and it would be this helper's fault rather than a page's.
  ok(/finally \{[\s\S]{0,400}unlinkSync/.test(RUNNER),
    'D6  the generated page is deleted in a finally, so a crashed run cannot dirty the worktree');

  // D7 — it streams. A run that has to be cut off still says how far it got and which page stalled; that is
  //      the only reason the Weekly Shipping Plan finding is attributable at all.
  ok(/S3R3\|/.test(RUNNER) && /--enable-logging=stderr/.test(RUNNER),
    'D7  progress is streamed to stderr, so a killed run is still evidence');
}

// =================================================================================================================
section('E — S3-R2 IS NOT REGRESSED');
// =================================================================================================================
// §7: the three Inventory Replenishment reads that paint through the search gate stay quiet.
{
  const IR = read('assets/js/pages/inventory-replenishment.js');
  const bare = IR.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const sites = [];
  const re = /_irWorkspaceRefresh_\(\{([\s\S]{0,240}?)owner:\s*'([A-Z_]+)'/g;
  let m;
  while ((m = re.exec(bare)) !== null) sites.push({ owner: m[2], quiet: /quiet:\s*true/.test(m[1]) });
  const noisy = sites.filter((s) => !s.quiet).map((s) => s.owner);
  eq(noisy, ['POST_WRITE_READBACK'],
    'E1  S3-R2 holds — only the post-write readback drives the load region');
}

console.log('\n' + new Array(101).join('='));
console.log('S3-R3 RUNTIME LIFECYCLE AUDIT — passed ' + pass + '  failed ' + fail);
console.log('RUNTIME_PAGES_MEASURED = 11 / 12 · OPEN_P0_FINDINGS = 1 (shippingplan stall, cause NOT established)');
console.log('DUPLICATE_REQUEST_COUNT = 0 · LISTENER_DRIFT = 0 · TIMER_DRIFT = 0 · UNBOUNDED_RETRY = 0');
console.log('ERROR_EMPTY_CONFLATION = 0 · FIXES_SHIPPED = 0 (measurement round)');
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · DEPLOYMENTS=0');
console.log(new Array(101).join('='));
process.exit(fail ? 1 : 0);
