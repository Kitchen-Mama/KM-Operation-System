// F1-7N-FB-3 — Shipping + Procurement production vertical closure.
// Run: node assets/tests/two-vertical-flow-closure-f1-7n-fb-3.test.js
//
// The slim-registry core, the bounded transport and the write-batch reconcile are EXECUTED from the shipped
// sources against stubbed seams — never a mirrored copy. No network call, no Apps Script execution, no DB or
// Drive write, no email, no Demo mutation.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
var INV = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');
var ROHTML = read('html/pages/request-order.html');
var API = read('js/api/operation-system-db-api.js');
var RTR = read('specs/active/apps-script/01_router.gs');
var G63 = read('specs/active/apps-script/63_api_v1_system_health.gs');
var G64 = read('specs/active/apps-script/64_api_v1_scope_registry.gs');
var G65 = read('specs/active/apps-script/65_api_v1_flow_diagnostics.gs');
var G13 = read('specs/active/apps-script/13_procurement_handlers.gs');
var G15 = read('specs/active/apps-script/15_request_allocation_handlers.gs');
var G16 = read('specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G60 = read('specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var RE_PRECEDERS_ = '(,=:[!&|?{};+-*%<>~^';
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) start = src.indexOf(name + ' = function');
  if (start < 0) start = src.indexOf(name + ' = async function');
  if (start < 0) throw new Error('missing fn ' + name);
  var i = src.indexOf('{', start), depth = 0, prev = '';
  for (; i < src.length; i++) {
    var c = src[i], n2 = src.substr(i, 2);
    if (n2 === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (n2 === '/*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { var q = c; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } prev = q; continue; }
    if (c === '/' && RE_PRECEDERS_.indexOf(prev) !== -1) { i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === '[') { for (i++; i < src.length && src[i] !== ']'; i++) { if (src[i] === '\\') i++; } continue; } if (src[i] === '/') break; } prev = '/'; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error('unbalanced ' + name);
}
function extractVar(src, decl) {
  var start = src.indexOf(decl);
  if (start < 0) throw new Error('missing var ' + decl);
  var open = src.indexOf('{', start), bracket = src.indexOf('[', start);
  if (bracket !== -1 && (open === -1 || bracket < open)) open = bracket;
  var openCh = src[open], closeCh = openCh === '{' ? '}' : ']', depth = 0;
  for (var i = open; i < src.length; i++) {
    if (src.substr(i, 2) === '//') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (src[i] === '"' || src[i] === "'") { var q = src[i]; i++; for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; } continue; }
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (!depth) { var j = src.indexOf(';', i); return src.slice(start, j + 1); } }
  }
  throw new Error('unbalanced ' + decl);
}
// Strip line comments — every ABSENCE assertion runs on this, because the comments deliberately NAME the
// symbols asserted absent (that is what makes the source readable).
function code(src) {
  return src.split('\n').map(function (l) {
    var q = null, out = '';
    for (var i = 0; i < l.length; i++) {
      var c = l[i];
      if (q) { out += c; if (c === '\\') { out += l[++i] || ''; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
      if (c === '/' && l[i + 1] === '/') break;
      out += c;
    }
    return out;
  }).join('\n');
}
function region(src, from, to) {
  var a = src.indexOf(from); if (a < 0) throw new Error('missing region start ' + from);
  var b = to ? src.indexOf(to, a) : -1;
  return src.slice(a, b < 0 ? src.length : b);
}
function ticks(n) { var p = Promise.resolve(); for (var i = 0; i < n; i++) p = p.then(function () {}); return p; }

// =======================================================================================================
section('A. the slim scope registry — EXECUTING the shipped pure core');

// The pure core is genuinely pure: extract and run it with no SpreadsheetApp of any kind.
var PURE64 = G64.slice(0, G64.indexOf('__SCOPEREG_PURE_END__'));
ok(code(PURE64).indexOf('SpreadsheetApp') === -1, 'A0. everything above the pure marker is free of SpreadsheetApp');
var SCOPEREG_ROW_MAX_ = 5000;
eval(extractFn(G64, 'scopeRegStr_'));
eval(extractFn(G64, 'scopeRegBuild_'));

var built = scopeRegBuild_([
  { marketplace_id: 'M-US-AMZ', company: 'KM', country: 'US', marketplace: 'Amazon', marketplace_display_name: 'Amazon US', status: 'active' },
  { marketplace_id: 'M-US-RES', company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_display_name: 'Amazon US', status: '' },
  { marketplace_id: 'M-DE-AMZ', company: 'KM', country: 'DE', marketplace: 'Amazon', marketplace_display_name: 'Amazon DE', status: 'ACTIVE' },
  { marketplace_id: 'M-OLD', company: 'KM', country: 'JP', marketplace: 'Amazon', marketplace_display_name: 'Amazon JP', status: 'inactive' },
  { marketplace_id: '', company: 'KM', country: 'FR', marketplace: 'Amazon', marketplace_display_name: 'x', status: 'active' },
  { marketplace_id: 'M-NOCOUNTRY', company: 'KM', country: '', marketplace: 'Amazon', marketplace_display_name: 'y', status: 'active' },
  { marketplace_id: 'M-US-AMZ', company: 'KM', country: 'US', marketplace: 'Amazon', marketplace_display_name: 'Amazon US', status: 'active' }
]);
eq(built.countries, ['DE', 'US'], 'A1. countries are deduped and sorted deterministically');
eq(built.counts.marketplaces, 3, 'A1. only ELIGIBLE scopes survive (active-or-blank status, with an id and a country)');
eq(built.excluded, { inactive: 1, missing_marketplace_id: 1, missing_country: 1 }, 'A1. and every exclusion is reported by reason, never silently');
eq(built.marketplaces.map(function (m) { return m.marketplace_id; }), ['M-DE-AMZ', 'M-US-AMZ', 'M-US-RES'],
  'A1. sorted by (country, display name, id) so the output is byte-stable between calls');
eq(built.marketplace_ids_by_country, { DE: ['M-DE-AMZ'], US: ['M-US-AMZ', 'M-US-RES'] },
  'A2. the country -> marketplace_id index lets a Country change re-scope the selector with NO request');
eq(built.empty, false, 'A2. non-empty when scopes exist');

// safe when nothing is eligible — a flag and a reason, never an error and never a silent empty payload
var none = scopeRegBuild_([]);
eq([none.empty, none.empty_reason], [true, 'NO_MARKETPLACE_ROWS'], 'A3. an empty table is EXPLAINED, not just empty');
var noneEligible = scopeRegBuild_([{ marketplace_id: 'X', country: 'US', status: 'archived' }]);
eq([noneEligible.empty, noneEligible.empty_reason], [true, 'NO_ELIGIBLE_MARKETPLACE_ROWS'], 'A3. and "rows exist but none eligible" is a DIFFERENT reason');
eq(noneEligible.countries, [], 'A3. with no fabricated options');

// the display-name fallback chain matches the page's existing label authority exactly
var fb = scopeRegBuild_([{ marketplace_id: 'M1', country: 'US', marketplace: 'Amazon', marketplace_display_name: '', status: 'active' },
  { marketplace_id: 'M2', country: 'US', marketplace: '', marketplace_display_name: '', status: 'active' }]);
eq(fb.marketplaces.map(function (m) { return m.marketplace_display_name; }), ['Amazon', 'M2'],
  'A4. display name -> channel -> id, the same fallback the selector already used');

// truncation is never silent
var many = [];
for (var i = 0; i < SCOPEREG_ROW_MAX_ + 5; i++) many.push({ marketplace_id: 'M' + i, country: 'US', marketplace: 'A', marketplace_display_name: 'A' + i, status: 'active' });
eq(scopeRegBuild_(many).capped, true, 'A5. exceeding the row backstop is reported as capped, never silently truncated');

// =======================================================================================================
section('B. the registry is SLIM — it carries none of the inventory payload');

var reg64 = code(G64);
eq((G64.match(/var SCOPEREG_SOURCE_TABLE_ = 'marketplaces';/g) || []).length, 1, 'B1. exactly ONE source table');
eq((G64.match(/var SCOPEREG_PROJECTION_ = \[[^\]]*\]/g) || []).length, 1, 'B1. and exactly one bounded column projection');
eval(extractVar(G64, 'var SCOPEREG_PROJECTION_ = ['));
eq(SCOPEREG_PROJECTION_.length, 6, 'B1. six projected columns');
eq(SCOPEREG_PROJECTION_, ['marketplace_id', 'company', 'country', 'marketplace', 'marketplace_display_name', 'status'],
  'B1. and only the fields the selectors and scope resolution actually need');
// the 18 inventory/business tables the full workspace reads must be absent from the registry module
['marketplace_skus', 'amazon_inventory_snapshot', 'amazon_inventory_health_snapshot', 'amazon_daily_sales_snapshot',
 'amazon_weekly_sales_snapshot', 'fc_regular_forecast', 'fc_target_rules', 'fc_special_events',
 'overseas_inventory_snapshot', 'factory_stock', 'shipments', 'shipment_lines', 'shipping_plans',
 'shipping_plan_lines', 'shipping_allocation_drafts', 'shipping_allocation_draft_lines',
 'carrier_lead_times', 'carrier_rate_cards', 'generated_documents', 'purchase_orders', 'pricing_list',
 'sku_details', 'warehouses'].forEach(function (t) {
  ok(reg64.indexOf(t) === -1, 'B2. the registry module never reads ' + t);
});
// and the full workspace really does read them (so the contrast is real, not rhetorical)
ok(/\{ name: 'marketplace_skus'/.test(G60) && /\{ name: 'shipping_allocation_drafts'/.test(G60),
  'B2. whereas the full inventory workspace reads them — which is what the selectors used to pay for');
eq((G60.match(/\{ name: '/g) || []).length, 21, 'B2. 21 tables in the full workspace vs 1 in the registry');

// strictly read-only, no lock, no Drive, no mail, no properties
['appendRow', 'setValue', 'setValues', 'insertSheet', 'deleteRow', 'deleteSheet', 'LockService', 'DriveApp',
 'MailApp', 'GmailApp', 'PropertiesService', 'procurementEnsureSheet_', 'prodMigrateCreateSheet_'].forEach(function (s) {
  ok(reg64.indexOf(s) === -1, 'B3. the registry never touches ' + s);
});
ok(/read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0/.test(G64),
  'B3. and its envelope asserts the zero-write counters');
// bounded io: ONE getValues over the data region, resolved by header index (no whole-workbook read, no N+1)
var io64 = extractFn(G64, 'scopeRegDefaultIo_');
eq((io64.match(/getRange\(2, 1, lastRow - 1, lastCol\)/g) || []).length, 1, 'B4. ONE bounded getValues for the data region');
ok(!/for \([^)]*\) \{[^}]*getRange\(/.test(io64.replace(/\n/g, ' ')), 'B4. and no per-row getRange (no N+1)');
ok(/header\.indexOf/.test(io64), 'B4. columns are resolved by header index, so an unrelated column cannot leak out');
// contract/version/request_id/timestamp are all present
['projection_version', 'request_id', 'server_timestamp', 'apiVersion'].forEach(function (f) {
  ok(G64.indexOf(f) !== -1, 'B5. the envelope carries ' + f);
});
// registered on BOTH verbs + covered by health
eq((RTR.match(/action === 'inventoryScope\.registry\.get'/g) || []).length, 2, 'B6. routed on doGet AND doPost');
ok(/action: 'inventoryScope\.registry\.get', handler: 'handleInventoryScopeRegistryGet_'/.test(G63),
  'B6. and covered by system.health action probing');
eq((G64.match(/function handleInventoryScopeRegistryGet_\(/g) || []).length, 1, 'B6. the handler is defined exactly once');

// =======================================================================================================
section('C. selector loading and inventory loading are INDEPENDENT (defect B1)');

var regFn = extractFn(INV, '_irEnsureRegistryLoaded_');
ok(/getInventoryScopeRegistry\(\)/.test(regFn), 'C1. the selectors are fed by the slim registry action');
ok(!/_irWorkspaceRefresh_/.test(code(regFn)), 'C1. and NEVER by the inventory workspace read');
ok(!/_irRegion_|beginLoad/.test(code(regFn)), 'C1. so it cannot touch the inventory table load region');
// that region is what printed the offending message
ok(/Loading Inventory Replenishment…/.test(INV), 'C2. the "Loading Inventory Replenishment…" renderer still exists');
var loadRegion = extractFn(INV, '_irRegion_');
ok(/Loading Inventory Replenishment…/.test(loadRegion), 'C2. and it belongs to the TABLE region, not the selectors');
var wsRefresh = extractFn(INV, '_irWorkspaceRefresh_');
ok(/rg\.beginLoad/.test(wsRefresh), 'C2. which only _irWorkspaceRefresh_ drives — the inventory read');
var searchFn = extractFn(INV, 'searchReplenishment');
ok(/_irWorkspaceRefresh_\(\)\.then/.test(searchFn), 'C2. and Search is the only caller that loads it');
// two independent states, two independent error surfaces, two independent Retries
ok(/var _irRegistry = \{ status: 'IDLE'/.test(INV), 'C3. the registry owns its own status');
ok(/var _irSearch = \{/.test(INV), 'C3. and the table owns a separate one');
var regRender = extractFn(INV, '_irRenderRegistryState_');
ok(/replen-scope-retry/.test(regRender) && /_irReloadScopeRegistry_\(\)/.test(regRender),
  'C4. a registry failure offers its OWN Retry');
ok(/replen-search-retry/.test(extractFn(INV, '_irRenderSearchGate_')), 'C4. and the table failure offers a separate one');
var regHost = extractFn(INV, '_irRegistryHost_');
ok(/replen-filters|replenLTSFilter/.test(regHost), 'C4. the registry surface renders next to the SELECTORS');
ok(!/replenScrollBody|replenFixedBody/.test(code(regHost) + code(regRender)),
  'C4. and never inside the table bodies');
// the registry loader is terminal on every path
ok(/_irRegistry\.status = 'ERROR'/.test(regFn), 'C5. an error is terminal');
ok(/_irRegistry\.model\.empty \? 'EMPTY' : 'READY'/.test(regFn), 'C5. empty and ready are distinct terminal states');
ok(/\['catch'\]\(function \(err\)/.test(regFn), 'C5. and a rejection is caught, so no caller is left latched');
ok(/if \(_irRegistryPending\) return _irRegistryPending;/.test(regFn), 'C5. single-flight');
ok(/mySeq !== _irRegistry\.seq/.test(regFn), 'C5. sequence-guarded against a stale response');
ok(/SCOPE_REGISTRY_ACTION_UNAVAILABLE/.test(regFn), 'C5. and a missing action is a named terminal state, not a hang');
// scope resolution works pre-Search from the registry alone
var wsGet = extractFn(INV, '_irWsGet');
ok(/name === 'getMarketplaces' && typeof _irRegistry !== 'undefined' && _irRegistry && _irRegistry\.model/.test(wsGet),
  'C6. company/country/marketplace resolution works from the registry alone, before any Search');
ok(/typeof _irRegistry !== 'undefined'/.test(wsGet),
  'C6. and the lookup is load-order safe (the accessor never assumes the registry declaration has run)');
ok(wsGet.indexOf('_irReadModel') < wsGet.indexOf('_irRegistry'),
  'C6. with the inventory read model still taking precedence once a Search has loaded it');
// mount: registry only
var mountRegion = code(region(INV, '// F1-7N-FB-3 §C — the mount requests ONLY the slim scope registry', '};'));
ok(/_irEnsureRegistryLoaded_\(\)/.test(mountRegion), 'C7. the mount requests the slim registry');
ok(!/_irWorkspaceRefresh_/.test(mountRegion), 'C7. and performs ZERO inventory workspace reads');
// the mount calls it bare; the Retry calls it with { force: true }. Both, and nothing else.
eq((code(INV).match(/_irEnsureRegistryLoaded_\(/g) || []).length, 3,
  'C7. exactly three references: the declaration, the mount call and the explicit Retry — no other loader path');
ok(/function _irReloadScopeRegistry_\(\) \{ return _irEnsureRegistryLoaded_\(\{ force: true \}\); \}/.test(INV),
  'C7. and the Retry is the only forcing caller');

// =======================================================================================================
section('D. bounded transport — EXECUTING the shipped timeout helpers');

var KM_READ_TIMEOUT_MS_ = 45000, KM_WRITE_TIMEOUT_MS_ = 90000;
global.window = global.window || {};
eval(extractFn(API, '_kmTimeoutMs_'));
eval(extractFn(API, '_kmTimeoutError_'));
eq(_kmTimeoutMs_('read'), 45000, 'D1. reads are bounded at 45s');
eq(_kmTimeoutMs_('write'), 90000, 'D1. writes get a longer bound (Apps Script cold start + lock wait)');
global.window.KM_REQUEST_TIMEOUT_MS = { read: 1234 };
eq(_kmTimeoutMs_('read'), 1234, 'D1. and an explicit operator override is honoured');
delete global.window.KM_REQUEST_TIMEOUT_MS;

var rt = _kmTimeoutError_('inventoryScope.registry.get', 'read', 45000);
eq([rt.code, rt.details.zero_write, rt.details.retryable], ['REQUEST_TIMEOUT', true, true],
  'D2. an expired READ is a proven zero-write and is retryable');
var wt = _kmTimeoutError_('upsertRequestOrderAllocationDraft', 'write', 90000);
eq(wt.code, 'REQUEST_TIMEOUT_WRITE_INDETERMINATE', 'D3. an expired WRITE is INDETERMINATE');
eq([wt.details.zero_write, wt.details.indeterminate, wt.details.retryable], [false, true, false],
  'D3. never claimed as zero-write, never auto-retryable — the server may have committed after we stopped listening');
ok(/may or may not have been committed/.test(wt.message), 'D3. and it says so in plain language');

// the bound is applied at BOTH canonical runners, so every business request in both verticals inherits it
var gapRead = extractFn(API, '_kmGapRead_');
ok(/_kmFetchBounded_\(url, \{[\s\S]*\}, 'read'\)/.test(gapRead), 'D4. the canonical READ runner is bounded');
ok(/netErr && netErr\.kmTimeout/.test(gapRead), 'D4. and classifies an expiry distinctly from a network error');
var cmd = extractFn(API, '_kmWeeklyCommand_');
ok(/_kmFetchBounded_\(url, \{[\s\S]*\}, 'write'\)/.test(cmd), 'D5. the canonical COMMAND runner is bounded');
ok(/REQUEST_TIMEOUT_WRITE_INDETERMINATE|_kmTimeoutError_\(command, 'write'/.test(cmd), 'D5. as an indeterminate write');
var bounded = extractFn(API, '_kmFetchBounded_');
ok(/ctl\.abort\(\)/.test(bounded), 'D6. an expired request is ABORTED so the socket is released');
ok(/clearTimeout\(timer\)/.test(bounded) && /finally \{/.test(bounded), 'D6. and the timer is always cleared');
ok(/Promise\.race/.test(bounded), 'D6. the WAIT is bounded even where AbortController is unavailable');

// =======================================================================================================
section('E. the write batch collapses N post-write reconciles into one');

var reloads = 0;
function loadOperationDb() { reloads++; return Promise.resolve(); }
var scopedActive = false;
function _kmScopedPostureActive_() { return scopedActive; }
var _kmPostWriteDeferred_ = 0, _kmPostWriteDirty_ = false;
global.window.KM = global.window.KM || {}; global.window.KM.DB = global.window.KM.DB || {};
eval(extractFn(API, 'window.KM.DB.beginWriteBatch'));
eval(extractFn(API, 'window.KM.DB.endWriteBatch'));
eval(extractFn(API, 'window.KM.DB.isWriteBatchOpen'));
eval('async ' + extractFn(API, '_kmWriterPostWrite_'));   // declared `async function`; extractFn drops the keyword
var DBW = global.window.KM.DB;

// BEFORE the batch: the un-batched behaviour is unchanged — one reconcile per write.
reloads = 0;
(async function () {
  await _kmWriterPostWrite_(); await _kmWriterPostWrite_(); await _kmWriterPostWrite_();
  eq(reloads, 3, 'E1. outside a batch the behaviour is byte-identical to before: one reconcile per write');

  // AFTER: 40 writes inside a declared batch reconcile ONCE.
  reloads = 0;
  DBW.beginWriteBatch();
  eq(DBW.isWriteBatchOpen(), true, 'E2. the batch is open');
  for (var i = 0; i < 40; i++) await _kmWriterPostWrite_();
  eq(reloads, 0, 'E2. no reconcile happens while the batch is open');
  await DBW.endWriteBatch();
  eq(reloads, 1, 'E2. exactly ONE reconcile for all 40 writes (was 40 whole-DB reads)');
  eq(DBW.isWriteBatchOpen(), false, 'E2. and the batch is closed');

  // a batch with no writes reconciles nothing
  reloads = 0;
  DBW.beginWriteBatch(); await DBW.endWriteBatch();
  eq(reloads, 0, 'E3. an empty batch reconciles nothing');

  // when the scoped posture IS active there was never a reload to collapse — unchanged either way
  scopedActive = true; reloads = 0;
  DBW.beginWriteBatch(); await _kmWriterPostWrite_(); await DBW.endWriteBatch();
  eq(reloads, 0, 'E4. and when the scoped posture is active nothing reloads at all, batched or not');
  scopedActive = false;

  await finishAsync();
})()['catch'](function (e) { console.error('FAIL async E: ' + (e && e.stack || e)); fail++; report(); });

// =======================================================================================================
function finishAsync() {
  var DBAPI = read('js/api/operation-system-db-api.js');
  section('F. Send Request — latched, progressive, always terminal (defect B4)');

  var send = extractFn(RO, 'handleSendRequest');
  // 1. the button now has an identity to latch
  ok(/id="ro-send-request-btn"/.test(ROHTML), 'F1. the Send button has an id (it had NONE, so nothing could be disabled)');
  eq((ROHTML.match(/onclick="handleSendRequest\(\)"/g) || []).length, 1, 'F1. bound exactly ONCE — no duplicate binding');
  eq((RO.match(/async function handleSendRequest\(/g) || []).length, 1, 'F1. and the handler is defined exactly once');

  // 2. single-flight
  ok(/if \(_roSendState\.busy\) \{[\s\S]*?return; \}/.test(send), 'F2. a second click while running is refused (single-flight)');
  ok(send.indexOf('_roSendState.busy') < send.indexOf('requestType'), 'F2. before any work is done');

  // 3. the latch is ALWAYS released
  ok(/\} finally \{/.test(send), 'F3. the run has a finally block');
  var fin = send.slice(send.lastIndexOf('} finally {'));
  ok(/_roSendState\.busy = false;/.test(fin), 'F3. which always clears the busy latch');
  ok(/_btn\.disabled = false/.test(fin), 'F3. and always re-enables the button');
  // F1-7N-FB-3B §E: the write batch existed ONLY to collapse the per-write whole-DB reloads of a serial
  // multi-write loop. One click is now ONE request, so there is no batch to open or end — the defect the batch
  // mitigated cannot occur. Assert its ABSENCE rather than its presence, or this suite would re-require the loop.
  ok(!/endWriteBatch/.test(send) && !/beginWriteBatch/.test(send),
    'F3. no write batch is needed — one click is ONE request, so there is no per-write reload to collapse');

  // 4. terminal states on every path
  ok(/_roSetSendState_\('LOADING'/.test(send), 'F4. LOADING is entered explicitly');
  ok(/_roSetSendState_\('SUCCESS'/.test(send), 'F4. SUCCESS is a terminal state');
  ok(/_roSetSendState_\('ERROR'/.test(send), 'F4. ERROR is a terminal state');
  ok(/_roSetSendState_\('IDLE', ''\)/.test(send), 'F4. and the pre-flight gates reset to IDLE (they return before the latch)');
  var setState = extractFn(RO, '_roSetSendState_');
  ok(/btn\.disabled = \(state === 'LOADING'\)/.test(setState), 'F4. only LOADING disables the button');
  ok(/aria-busy/.test(setState), 'F4. and the busy state is announced');

  // 5. progress during the serial multi-write loop
  // F1-7N-FB-3A §E superseded _roSendProgress_ with _roSendPhase_: the FB-3 helper printed a SKU-ROW count
  // under the label 'allocation drafts', which is how the live '0/234 allocation drafts' was produced. The
  // replacement contract is STRICTLY stronger — every phase names the unit it iterates and takes its
  // denominator from the FROZEN workset — so these assert that instead.
  // F1-7N-FB-3B §E: the serial per-SKU and per-series client loops are GONE, which is the strongest possible
  // form of "the loop reports progress". What must remain true is that the phase still names its unit and takes
  // its denominator from a source the page cannot influence — now the SERVER's frozen plan.
  ok(!/for \(var di = 0/.test(send) && !/for \(var si = 0/.test(send),
    'F5. no per-SKU or per-series write loop remains in the browser at all');
  ok(/_roSendPhase_\('Sending to the server orchestration', 0, plan\.counts\.expected_request_order_headers, 'Series groups'\)/.test(send),
    'F5. and the single phase names its unit and takes its denominator from the SERVER plan');
  ok(/do not close this page/i.test(extractFn(RO, '_roSendPhase_') + send), 'F5. with an explicit instruction not to navigate away');

  // 6. no auto-retry, and a timeout is INDETERMINATE
  var sendBody = code(send).slice(code(send).indexOf('{') + 1);   // exclude the declaration line itself
  ok(!/handleSendRequest\s*\(/.test(sendBody), 'F6. the handler never re-invokes itself — no auto-retry of a business write');
  ok(!/setTimeout|setInterval/.test(sendBody), 'F6. and schedules no retry timer');
  // F1-7N-FB-3B §E: an expired orchestration is no longer merely "indeterminate, go and check". It is
  // RESUMABLE BY EXECUTION KEY — the key is a pure function of the request body, so re-posting the same body
  // continues the journaled saga and skips what is already proven. The instruction is therefore stronger AND
  // more precise: never retry blindly, resume.
  var errMsg = extractFn(RO, '_roSendOrchestrationErrorMessage_');
  ok(/REQUEST_TIMEOUT/.test(send) || /REQUEST_TIMEOUT/.test(errMsg), 'F6. an expired write is recognised');
  ok(/RESUMABLE BY EXECUTION KEY/.test(errMsg) && /do NOT press Send again/.test(errMsg),
    'F6. and the user is told to RESUME by execution key, never to retry blindly');
  ok(/requestOrderSendReconcile/.test(errMsg),
    'F6. with the read-only reconciliation named as the first step');

  // 7. a late result cannot repaint a newer page
  ok(/_sendMount !== _roSendState\.mountSeq/.test(send), 'F7. a stale mount discards the result');
  ok(/success_discarded_stale_mount/.test(send), 'F7. and records that it did so');
  ok(/_roSendState\.mountSeq = _roMountEpoch/.test(RO), 'F8. the guard reuses the EXISTING mount-epoch authority (no parallel counter)');

  // 8. F1-7N-FB-3B §E — the reason a batch was needed is removed: exactly ONE committing request is issued.
  eq((send.match(/DB\.sendRequestOrderOrchestration\(/g) || []).length, 2,
    'F9. exactly two orchestration calls — one ZERO-WRITE dry run, then one committing request');
  ok(send.indexOf('dry_run: true') < send.indexOf('DB.sendRequestOrderOrchestration(orchestrationPayload)'),
    'F9. the dry run comes first, so the user approves the server\u2019s own numbers');
  ok(/window\.KM\.DB\.beginWriteBatch = function/.test(DBAPI),
    'F9. the write-batch seam is retained for other multi-write callers (not deleted)');

  // 9. instrumentation exists and leaks nothing
  var trace = extractFn(RO, '_roSendTrace_');
  ok(/request_id/.test(trace), 'F10. traces carry a request_id');
  ok(/elapsed_ms/.test(send), 'F10. and elapsed timing');
  ['sku', 'company', 'country', 'note', 'orderQty', 'getApiBaseUrl', 'SPREADSHEET'].forEach(function (leak) {
    ok(code(trace).indexOf(leak) === -1, 'F10. and never a business row or configuration value (' + leak + ')');
  });

  // 10. the canonical meaning of Send Request is preserved — no renamed or bypassed state
  // F1-7N-FB-3B §E — the canonical meaning is preserved; its OWNER moved to the server, where the ordering is
  // a numbered phase sequence with an output PROOF inserted between creation and the lifecycle advance.
  var G66 = read('specs/active/apps-script/66_api_v1_request_order_send.gs');
  var orch = extractFn(G66, 'handleRequestOrderSendOrchestrate_');
  ok(/ROS_ACTIVE_STATUSES_ = \{ draft: 1, site_confirmed: 1, partially_submitted: 1 \}/.test(G66),
    'F11. site_confirmed remains an ACTIVE, sendable allocation state (no renamed or bypassed state)');
  ok(/io\.createRequestOrderDraft\(writerBody\)/.test(orch), 'F11. the Request Order is created under the execution key');
  ok(/io\.submitAllocationDrafts\(/.test(orch), 'F11. and the covered drafts are advanced after that');
  var iC = orch.indexOf('io.createRequestOrderDraft'), iP = orch.indexOf('REQUEST_ORDER_OUTPUT_UNPROVEN'), iS = orch.indexOf('io.submitAllocationDrafts');
  ok(iC > -1 && iP > iC && iS > iP,
    'F11. in that order, with an explicit OUTPUT PROOF between creation and the lifecycle advance');
  eq((RO.match(/DB\.createRequestOrderDraft\(/g) || []).length, 0,
    'F12. the browser has NO Request Order writer call site left at all');
  eq((G66.match(/handleCreateRequestOrderDraft_\(/g) || []).length, 1,
    'F12. and the orchestration reaches the canonical writer through exactly one seam');
  ok(/source_ref_type: 'request_order_allocation_batch'/.test(orch), 'F12. keyed by the deterministic execution key');
  // and the backend really is idempotent on that key
  ok(/roFindByExecutionKey_\(roSheetX, RO_EXEC_SOURCE_REF_TYPE_, execKey\)/.test(G13),
    'F12. which the backend reuses instead of creating a second Request Order');
  ok(/REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT/.test(G13), 'F12. failing closed on a duplicate');

  // 11. no false success and no local canonical substitute
  ok(!/sessionStorage\.setItem/.test(code(send)), 'F13. Send never writes a local substitute for a DB row');
  ok(/_roUseDb\(\)/.test(send), 'F13. and the demo branch is gated by the cold-start-safe eligibility predicate');
  ok(/isScopedReadEligible/.test(extractFn(RO, '_roUseDb')),
    'F13. which does NOT require a primed broad cache (the FB-2 cold-start defect is not present here)');

  // =====================================================================================================
  section('G. the read-only diagnostics');

  var diag65 = code(G65);
  // zero-configuration schema diagnostic
  ok(/function TEMP_SHIPPING_ALLOCATION_SCHEMA_DIAGNOSE\(\)/.test(G65), 'G1. the zero-config schema diagnostic exists');
  ok(/zero_configuration: true/.test(G65), 'G1. and declares itself zero-configuration');
  var schemaWrap = extractFn(G65, 'TEMP_SHIPPING_ALLOCATION_SCHEMA_DIAGNOSE');
  ok(!/PASTE_/.test(schemaWrap), 'G1. its wrapper requires NO pasted value at all');
  ok(!/TEMP_SAD_DIAGNOSTIC_HEADER_/.test(schemaWrap), 'G1. and no reconstructed route payload');
  // it reports exactly what §E asks for
  ['present', 'safety_token', 'missing_headers', 'extra_headers', 'order_drift_at', 'exact_order_match',
   'expected_column_count', 'schema_mode', 'pk_readiness', 'line_table_readiness', 'fk_masters', 'cutover',
   'actions', 'verdict', 'exact_blocking_reason', 'next_action'].forEach(function (f) {
    ok(G65.indexOf(f) !== -1, 'G2. the schema report includes ' + f);
  });
  ok(/prodRequireSheet_\(ss, table, expectedHeaders \|\| \[\]\)/.test(G65),
    'G3. it raises the token by running the writer OWN first gate, not by reimplementing it');
  ok(/auditShippingAllocationSchemaReadOnly/.test(G65), 'G3. and reuses the existing 41_ header-drift report');
  ok(/SHIPPING_ALLOCATION_DRAFTS_HEADERS_/.test(G65) && /SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_/.test(G65),
    'G3. reading the frozen header authorities from the running stack');
  ok(!/'allocation_draft_id', 'planning_cycle', 'source_page'/.test(diag65), 'G3. never restating them');

  // the payload-shaped diagnostic is RETAINED and now clearly prefilled
  ok(/function TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE\(\)/.test(G63), 'G4. the payload-shaped diagnostic is retained (63_)');
  ok(/TEMP_SAD_DIAGNOSTIC_HEADER_ = \{/.test(G63), 'G4. with a prefilled constant object');
  ok(/you NEVER need to invent a field name here/.test(G63),
    'G4. and states plainly that no field name has to be invented');
  ok(/The editable value fields are exactly these/.test(G63), 'G4. listing exactly which value fields may be edited');
  ok(/Do NOT add, rename or remove keys/.test(G63), 'G4. and that the key set IS the writer contract');
  ok(/TEMP_SHIPPING_ALLOCATION_SCHEMA_DIAGNOSE \(65_\) needs no input at all/.test(G63),
    'G4. while pointing at the ZERO-CONFIGURATION diagnostic for the schema question');

  // Send Request diagnostic
  ok(/function TEMP_REQUEST_ORDER_SEND_DIAGNOSE\(\)/.test(G65), 'G5. the Send Request diagnostic exists');
  ok(/TEMP_RO_SEND_DIAGNOSTIC_ALLOCATION_DRAFT_ID_ = 'PASTE_/.test(G65), 'G5. with ONE documented input');
  ['canonical_meaning', 'source_status', 'target_status', 'allowed_source_statuses', 'terminal_statuses',
   'line_readiness', 'fk_masters', 'idempotency', 'lock', 'expected_write_manifest', 'downstream_visibility',
   'exact_blocking_reason', 'verdict'].forEach(function (f) {
    ok(G65.indexOf(f) !== -1, 'G6. the Send report includes ' + f);
  });
  ok(/NOT_PROBED_BY_DESIGN/.test(G65), 'G7. lock readiness is reported from the CONTRACT — never by taking the lock');
  ok(/Acquiring this lock to test it would itself block a concurrent business write/.test(G65),
    'G7. and it says why');
  // every table the flow writes is schema-checked against its frozen authority
  ['request_order_allocation_drafts', 'request_order_allocation_draft_lines', 'request_orders',
   'request_order_lines', 'request_order_line_sources'].forEach(function (t) {
    ok(G65.indexOf(t) !== -1, 'G8. Send readiness checks ' + t);
  });
  ['REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_', 'REQUEST_ORDERS_HEADERS_', 'REQUEST_ORDER_LINE_SOURCES_HEADERS_'].forEach(function (h) {
    ok(G65.indexOf(h) !== -1, 'G8. against the frozen authority ' + h);
    var src = (h.indexOf('ALLOCATION') !== -1) ? G15 : G13;
    eq((src.match(new RegExp('var ' + h + ' = ', 'g')) || []).length, 1, 'G8. which is defined exactly once');
  });

  // the composed two-vertical verdict
  ok(/function TEMP_TWO_VERTICAL_FLOWS_DIAGNOSE\(\)/.test(G65), 'G9. the composed diagnostic exists');
  ok(/shipping_vertical_verdict/.test(G65) && /procurement_vertical_verdict/.test(G65), 'G9. with TWO independent verdicts');
  var twoFn = extractFn(G65, 'handleTwoVerticalFlowsDiagnostic_');
  ok(/flowSafeJson_/.test(twoFn), 'G10. each sub-diagnostic is called through a failure-isolating wrapper');
  ok(/DIAGNOSTIC_EVALUATION_FAILED/.test(G65), 'G10. so one vertical failing cannot hide the other');
  ok(twoFn.indexOf('out.shipping_vertical_verdict') < twoFn.indexOf('out.procurement_vertical_verdict'),
    'G10. and both verdicts are always computed');
  ok(/LIVE_PROOF_REQUIRED/.test(twoFn), 'G10. steps that genuinely need a live id say so rather than guessing');
  ok(/composition: 'This entrypoint COMPOSES/.test(G65), 'G11. it composes the existing evaluators, reimplementing none');

  // ALL of 65_ is read-only
  // Strip quoted strings too: the lock CONTRACT is REPORTED as a string ("LockService.getScriptLock()"),
  // which is the opposite of calling it — the whole point of NOT_PROBED_BY_DESIGN.
  var exec65 = diag65.replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""');
  ['appendRow', 'setValue', 'setValues', 'insertSheet', 'deleteRow', 'deleteSheet', 'LockService', 'DriveApp',
   'MailApp', 'GmailApp', 'PropertiesService', 'procurementEnsureSheet_', 'procurementAppendByHeader_',
   'prodMigrateCreateSheet_', 'prodMigrateAppendColumns_'].forEach(function (s) {
    ok(exec65.indexOf(s) === -1, 'G12. 65_ never EXECUTES ' + s);
  });
  eq((diag65.match(/LockService/g) || []).length, 1, 'G12. LockService appears exactly once in 65_');
  ok(/lock: 'LockService\.getScriptLock\(\)'/.test(G65), 'G12. and only as the reported contract string, never a call');
  eq((G65.match(/read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0/g) || []).length, 1,
    'G12. one shared zero-counter authority');
  // One footer line per editor wrapper in 65_. Counted from the source rather than hard-coded, so adding a
  // wrapper (FB-3A added the interrupted-Send reconciliation one) tightens this assertion instead of breaking it.
  var wrapperCount65 = (G65.match(/^function TEMP_[A-Z_]+\(\) \{/gm) || []).length;
  ok(wrapperCount65 >= 4, 'G13. 65_ exposes ' + wrapperCount65 + ' editor wrappers');
  ['READ_ONLY = ', 'DB_WRITES = ', 'DRIVE_WRITES = ', 'STATUS_TRANSITIONS = ', 'EMAILS = ', 'DEMO_MUTATIONS = '].forEach(function (f) {
    eq((G65.match(new RegExp("Logger\\.log\\('" + f, 'g')) || []).length, wrapperCount65,
      'G13. every 65_ wrapper logs the footer line ' + f.trim());
  });
  // no id leakage
  eq((diag65.match(/prodExpectedDbId_/g) || []).length, 1, 'G14. the configured db id is referenced exactly once');
  ok(/SpreadsheetApp\.openById\(prodExpectedDbId_\(\)\)/.test(G65), 'G14. only to OPEN the database');
  ok(/DB_NOT_REACHABLE/.test(G65), 'G14. and failure is reported as a code');
  // routed + health-covered
  ['system.shippingAllocationSchemaDiagnostic', 'system.requestOrderSendDiagnostic', 'system.twoVerticalFlowsDiagnostic'].forEach(function (a) {
    ok(RTR.indexOf("action === '" + a + "'") !== -1, 'G15. ' + a + ' is routed');
    ok(new RegExp("action: '" + a.replace(/\./g, '\\.') + "'").test(G63), 'G15. and covered by system.health');
  });

  // =====================================================================================================
  section('H. no parallel writers, no production local fallback');

  // ONE canonical writer per transition
  [['handleUpsertShippingAllocationDraft_', G16], ['handleSubmitAllocationDraftsToShippingPlans_', G16],
   ['handleCreateRequestOrderDraft_', G13], ['handleUpsertRequestOrderAllocationDraft_', G15],
   ['handleSubmitRequestOrderAllocationDrafts_', G15], ['handleCreatePurchaseOrderFromRequest_', G13]].forEach(function (p) {
    eq((p[1].match(new RegExp('function ' + p[0] + '\\(', 'g')) || []).length, 1, 'H1. ' + p[0] + ' is defined exactly once');
  });
  // the new modules add NO writer
  ['64_api_v1_scope_registry.gs', '65_api_v1_flow_diagnostics.gs'].forEach(function (f) {
    var src = code(read('specs/active/apps-script/' + f));
    ok(!/appendRow|setValue|setValues/.test(src), 'H2. ' + f + ' introduces no writer');
  });
  // one endpoint authority
  var urls = (API + INV + RO).match(/https:\/\/script\.google\.com\/macros\/s\/[^\s'"]*/g) || [];
  eq(urls.length, 1, 'H3. exactly ONE Apps Script endpoint literal across the client and both vertical pages');
  ok(/\/exec$/.test(urls[0] || ''), 'H3. and it is an /exec deployment URL');
  // no production local persistence in either vertical
  ok(/isDevLocalModeAllowed/.test(INV), 'H4. Site Inventory gates its local branch behind an explicit dev opt-in');
  ok(!/sessionStorage\.setItem/.test(code(extractFn(RO, 'handleSendRequest'))), 'H4. and Send Request has no local branch at all');
  // Demo coexists without changing environment mode
  ok(/_replenDemoOn\(\)\) return Promise\.resolve\(null\);/.test(regFn), 'H5. Demo skips the registry read');
  ok(/if \(!_roUseDb\(\)\) \{/.test(send), 'H5. and Demo is an explicit branch, never an implicit fallback');

  report();
}

function report() {
  console.log('\n' + (fail ? 'FAILURES: ' + fail : 'ALL PASS') + '  (' + pass + ' assertions)');
  process.exit(fail ? 1 : 0);
}
