// Kitchen Mama Operation System — F1-AI-SUPPORT-SCOPE-R1 scoped AI Support + menu visual closure guard.
// Run: node assets/tests/ai-support-scope-modal-f1-ai-support-scope-r1.test.js
// -----------------------------------------------------------------------------
// Proves (A–W): the AI Support + More Options dropdown buttons are no longer painted by the legacy orange catch-all
// (the RUNTIME winner was #ops-section .replen-control-panel button, now narrowed with :not() guards so both menus
// fall back to their neutral SKU-Details-style rules); the shared scope-selection modal resolves a concrete
// { company, country, marketplace, marketplaceId } DTO from the canonical marketplace source (active only, country
// filters marketplace, company owned by the row); and "AI Plan" / "Recalculate Current Scope" open the modal and
// delegate to the EXISTING CURRENT_SCOPE gap job / EXISTING AI Plan handler while "Recalculate All Sites" stays
// direct — with NO new route/engine, NO per-SKU loop, NO page-side formula, NO DB/schema change.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');   // = assets/ (this test lives in assets/tests)
var MOD = require('../js/utils/scope-select-modal.js');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eqj(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// strip comments so structural asserts test CODE, not prose.
function code(src) { return src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); }

var COMPONENTS = read('css/components.css');
var INV_CSS = read('css/pages/inventory-replenishment.css');
var SKU_CSS = read('css/pages/sku-details.css');
var INV_JS = read('js/pages/inventory-replenishment.js');
var RO_JS = read('js/pages/request-order.js');
var MODAL_SRC = read('js/utils/scope-select-modal.js');
var INDEX = read(path.join('..', 'index.html'));   // repo-root index.html (ROOT is assets/)

var MK = [
  { marketplaceId: 'MP-US-AMZ', company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceDisplayName: 'Amazon US', status: 'active' },
  { marketplaceId: 'MP-US-WMT', company: 'KM', country: 'US', marketplace: 'WALMART_US', marketplaceDisplayName: 'Walmart US', status: '' },        // blank = active
  { marketplaceId: 'MP-CA-AMZ', company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', marketplaceDisplayName: 'Amazon CA', status: 'active' },
  { marketplaceId: 'MP-UK-AMZ', company: 'ResUK', country: 'UK', marketplace: 'AMAZON_UK', marketplaceDisplayName: 'Amazon UK', status: 'inactive' }, // excluded
  { marketplaceId: '', company: 'KM', country: 'US', marketplace: 'NOID', status: 'active' }                                                        // no id → excluded
];

// =============================================================================
section('A/B — legacy orange catch-all no longer matches either menu (narrowed with :not guards)');
var orangeRule = /#ops-section\s+\.replen-control-panel\s+button([^\{]*)\{/g;
var m, guardedAll = true, sawRule = false;
while ((m = orangeRule.exec(INV_CSS)) !== null) {
  sawRule = true;
  var sel = m[1];
  if (!(/:not\(\.km-action-menu__item\)/.test(sel) && /:not\(\.km-action-menu__trigger\)/.test(sel) &&
        /:not\(\.replen-actions-menu__item\)/.test(sel) && /:not\(\.replen-actions-menu__trigger\)/.test(sel))) guardedAll = false;
}
ok(sawRule, 'sanity: the legacy .replen-control-panel button rule still exists');
ok(guardedAll, 'A/B every .replen-control-panel button rule EXCLUDES both menus\' item+trigger classes (no orange on menu rows)');
ok(/\.km-action-menu__item\s*\{[^}]*background:\s*none/.test(COMPONENTS), 'A .km-action-menu__item background:none (neutral AI Support row)');
ok(/\.replen-actions-menu__item\s*\{[^}]*background:\s*none/.test(INV_CSS), 'B .replen-actions-menu__item background:none (neutral More Options row)');
// no rule that POSITIVELY targets a menu item (class directly followed by an optional pseudo then `{`) sets orange.
// (A `:not(.km-action-menu__item)` EXCLUSION is fine — there the class is followed by `)`, not `{`.)
ok(!/\.km-action-menu__item(:[a-z-]+)?\s*\{[^}]*var\(--warm-orange\)/.test(COMPONENTS), 'A2 no rule targeting .km-action-menu__item paints --warm-orange');
ok(!/\.replen-actions-menu__item(:[a-z-]+)?\s*\{[^}]*var\(--warm-orange\)/.test(INV_CSS), 'B2 no rule targeting .replen-actions-menu__item paints --warm-orange');

section('C — SKU Details visual token parity for menu surfaces (padding 9px 10px + background none)');
ok(/\.more-options-item\s*\{[^}]*padding:\s*9px 10px/.test(SKU_CSS), 'C ref: SKU Details .more-options-item padding 9px 10px');
ok(/\.km-action-menu__item\s*\{[^}]*padding:\s*9px 10px/.test(COMPONENTS), 'C AI Support item matches SKU Details padding 9px 10px');
ok(/\.replen-actions-menu__item\s*\{[^}]*padding:\s*9px 10px/.test(INV_CSS), 'C More Options item matches SKU Details padding 9px 10px');

section('J — Country selection filters Marketplace (pure)');
eqj(MOD.countriesOf(MK), ['CA', 'US'], 'J countriesOf = distinct sorted active countries (UK inactive + no-id excluded)');
ok(MOD.marketplacesForCountry(MK, 'US').length === 2, 'J2 US → 2 marketplaces (Amazon + Walmart)');
ok(MOD.marketplacesForCountry(MK, 'CA').length === 1, 'J3 CA → 1 marketplace');
ok(MOD.marketplacesForCountry(MK, 'UK').length === 0, 'J4 UK → 0 (inactive filtered)');

section('K — Marketplace resolves company correctly (off the canonical row, not a frontend label)');
eqj(MOD.resolveScope(MK, 'MP-US-AMZ'), { company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP-US-AMZ' }, 'K resolveScope returns company+country+marketplace+id');
ok(MOD.resolveScope(MK, 'MP-UK-AMZ') === null, 'K2 inactive marketplace does not resolve');
ok(MOD.resolveScope(MK, '') === null, 'K3 empty selection resolves to null');

section('I/L — All/unselected never auto-confirms; Confirm gated on a concrete scope');
ok(MOD.isConcreteScope(MOD.resolveScope(MK, 'MP-US-AMZ')) === true, 'L concrete scope → confirmable');
ok(MOD.isConcreteScope(null) === false, 'I null (unselected) → NOT confirmable');
ok(MOD.isConcreteScope({ company: '', country: 'US', marketplace: 'AMAZON_US' }) === false, 'I2 missing company → NOT confirmable');
ok(MOD.isConcreteScope({ company: 'KM', country: 'US', marketplace: '' }) === false, 'I3 missing marketplace (All) → NOT confirmable');
// the DOM confirm button ships DISABLED and the confirm handler refuses a non-concrete scope
ok(/id="km-scope-confirm"[^>]*disabled/.test(MODAL_SRC), 'L2 Confirm button ships disabled by default');
ok(/if\s*\(!isConcreteScope\(scope\)\)\s*return/.test(MODAL_SRC), 'I4 confirm handler refuses a non-concrete scope (no auto-confirm)');

section('D/F — Inventory: AI Plan + Recalculate Current Scope open the modal');
ok(/runReplenAiSupport[\s\S]{0,220}kind === 'aiplan'[\s\S]{0,40}_openReplenScopeModal\('aiplan'\)/.test(INV_JS), 'F Inventory aiplan → _openReplenScopeModal(aiplan)');
ok(/kind === 'recalcScope'[\s\S]{0,40}_openReplenScopeModal\('recalc'\)/.test(INV_JS), 'D Inventory recalcScope → _openReplenScopeModal(recalc)');
ok(/_openReplenScopeModal[\s\S]{0,600}window\.KM\.scopeModal\.open\(/.test(INV_JS), 'D2 _openReplenScopeModal calls window.KM.scopeModal.open');

section('E/G — Order Planning: AI Plan + Recalculate Current Scope open the modal');
ok(/runRoAiSupport[\s\S]{0,220}kind === 'aiplan'[\s\S]{0,40}_openRoScopeModal\('aiplan'\)/.test(RO_JS), 'G OP aiplan → _openRoScopeModal(aiplan)');
ok(/kind === 'recalcScope'[\s\S]{0,40}_openRoScopeModal\('recalc'\)/.test(RO_JS), 'E OP recalcScope → _openRoScopeModal(recalc)');
ok(/_openRoScopeModal[\s\S]{0,600}window\.KM\.scopeModal\.open\(/.test(RO_JS), 'E2 _openRoScopeModal calls window.KM.scopeModal.open');

section('H — current toolbar scope prefills the modal');
ok(/prefill:\s*_irScopeModalPrefill_\(\)/.test(INV_JS) && /getElementById\('replenCountry'\)/.test(INV_JS) && /getElementById\('replenMarketplace'\)/.test(INV_JS), 'H Inventory prefill reads toolbar country/marketplace');
ok(/prefill:\s*_roScopeModalPrefill_\(\)/.test(RO_JS) && /requestOrderState/.test(RO_JS), 'H2 OP prefill reads requestOrderState scope');

section('M/N — scoped recalc delegates to the EXISTING CURRENT_SCOPE gap job (no new route)');
ok(/handleRecalcAllInventoryGap\(\{\s*mode:\s*'CURRENT_SCOPE'/.test(INV_JS), 'M Inventory recalc → handleRecalcAllInventoryGap({mode:CURRENT_SCOPE,...})');
ok(/handleRecalcAllOrderPlanningGap\(\{\s*mode:\s*'CURRENT_SCOPE'/.test(RO_JS), 'N OP recalc → handleRecalcAllOrderPlanningGap({mode:CURRENT_SCOPE,...})');

section('O — Recalculate All Sites still delegates to the existing all-sites owner, unchanged');
ok(/kind === 'recalcAll'[\s\S]{0,70}handleRecalcAllInventoryGap\(\)/.test(INV_JS), 'O Inventory recalcAll → handleRecalcAllInventoryGap() (no scope = ALL_SITES)');
ok(/kind === 'recalcAll'[\s\S]{0,70}handleRecalcAllOrderPlanningGap\(\)/.test(RO_JS), 'O2 OP recalcAll → handleRecalcAllOrderPlanningGap()');

section('P/Q/R/W — no per-SKU loop, no page-side formula, no second engine, no DB/schema write in the modal');
var MC = code(MODAL_SRC);
ok(!/generateInventoryRecommendation|generateOrderPlanningRecommendation|KMREC/.test(MC), 'R modal contains NO recommendation engine call (no second AI engine)');
ok(!/KMCALC|calculateGap|calculateShipping|allocate[A-Z]|unitsPerCarton|cartonize/.test(MC), 'Q modal contains NO gap/allocation/carton formula (no page-side calc)');
ok(!/_irMatState|_opMatCache|\.rows\.forEach|bySku/.test(MC), 'P modal introduces NO per-SKU materialized-row loop');
ok(!/SpreadsheetApp|appendRow|setValues|insertSheet|getSheetByName|_opDbCache\s*=/.test(MC), 'W modal performs NO DB/sheet/schema write');
// AI Plan on both pages still routes to the existing KMREC generator (existing engine, just scope-threaded)
ok(/window\.KMREC[\s\S]{0,200}generateInventoryRecommendation/.test(INV_JS), 'R2 Inventory AI Plan still uses the existing window.KMREC generator');
ok(/window\.KMREC[\s\S]{0,260}generateOrderPlanningRecommendation/.test(RO_JS), 'R3 OP AI Plan still uses the existing window.KMREC generator');

section('S/T — modal closes cleanly on Cancel and on Escape');
ok(/cancel\.addEventListener\('click',\s*function\s*\(\)\s*\{\s*close\(\)/.test(MODAL_SRC), 'S Cancel → close()');
ok(/keydown[\s\S]{0,120}(Escape|keyCode === 27)[\s\S]{0,40}close\(\)/.test(MODAL_SRC), 'T Escape → close()');
ok(/overlay\.addEventListener\('click',\s*function\s*\(\)\s*\{\s*close\(\)/.test(MODAL_SRC), 'S2 outside-click (overlay) → close()');

section('U/V — terminal/idle + DB-refresh behavior owned by the EXISTING job (delegation proven above)');
// The scoped recalc delegates to handleRecalcAll*Gap, which runs the LIVE10 gr.runJob lifecycle: it refreshes the
// scope from DB before done() and always restore()s to idle on done/failed/cancelled. We assert the delegation seam
// (the owner of U/V) rather than re-testing the transport here.
ok(/gr\.runJob|window\.KM\.gapRecalc/.test(INV_JS + RO_JS), 'U/V scoped recalc rides the existing gr.runJob lifecycle (terminal→idle + DB refresh owner)');

section('cache-version + wiring — new module is loaded and version bumped');
ok(/scope-select-modal\.js\?v=aiscope-20260811/.test(INDEX), 'index.html loads scope-select-modal.js with the bumped cache token');
ok(!/\?v=fmr1-20260810/.test(INDEX), 'no stale ?v=fmr1-20260810 remains (all local assets refetch)');
ok(MOD._version === 'ai-support-scope-r1', 'scope modal module version tag present');

console.log('\n----------------------------------------');
console.log('AI SUPPORT SCOPE MODAL (F1-AI-SUPPORT-SCOPE-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
