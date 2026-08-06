// Kitchen Mama Operation System — Factory Inventory Import visual parity with Overseas Import (F1-S2-UI).
// Run: node assets/tests/factory-import-visual-parity-f1-s2-ui.test.js
// -----------------------------------------------------------------------------
// UI-only round: the Factory import button + modal must use the SAME canonical classes/shell as the Overseas
// Inventory Import (the visual source of truth) while keeping the Factory-specific behavior (validate/preview/
// confirm/commit) and safety wording. DOM/class/source assertions only — no pixel snapshots. Also proves the
// import BEHAVIOR wiring is unchanged and the Overseas reference is left intact.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var F_HTML = read('html/pages/factory-stock.html');
var O_HTML = read('html/pages/overseas-stock.html');
var F_CSS = read('css/pages/factory-stock.css');
var O_CSS = read('css/pages/overseas-stock.css');
var F_JS = read('js/pages/factory-stock.js');
var GS = read('specs/active/apps-script/21_factory_inventory_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function modalSlice(html, startId) { var a = html.indexOf(startId); return a < 0 ? '' : html.slice(a - 120, a + 2600); }

var fModal = F_HTML.slice(F_HTML.indexOf('factory-import-overlay') - 200, F_HTML.indexOf('</section>', F_HTML.indexOf('factory-import-overlay')));
ok(fModal.length > 0, 'X0 factory import modal located');

section('A. button parity (Overseas Import button is the reference)');
ok(F_HTML.indexOf('factory-stock-import-btn') < F_HTML.indexOf('factory-stock-edit-btn'), 'A1 Import Inventory stays LEFT of Inventory Adjustment');
var fBtn = F_HTML.slice(F_HTML.indexOf('id="factory-stock-import-btn"') - 60, F_HTML.indexOf('id="factory-stock-import-btn"') + 130);
var oBtn = O_HTML.slice(O_HTML.indexOf('id="overseas-import-btn"') - 60, O_HTML.indexOf('id="overseas-import-btn"') + 130);
ok(/class="btn btn-primary"/.test(fBtn), 'A2 Factory Import button uses the canonical btn btn-primary (same as Overseas)');
ok(/class="btn btn-primary"/.test(oBtn), 'A3 (reference) Overseas Import button is btn btn-primary');
ok(/Import Inventory<\/button>/.test(fBtn), 'A4 Factory button label remains "Import Inventory"');

section('B. modal shell parity (ovs-* canonical shell)');
ok(/class="ovs-modal-overlay"/.test(fModal), 'B1 backdrop uses ovs-modal-overlay');
ok(/class="ovs-modal"/.test(fModal), 'B2 modal container uses ovs-modal');
ok(/class="ovs-modal-content ovs-modal-content--large"/.test(fModal), 'B3 content uses ovs-modal-content ovs-modal-content--large');
ok(/class="ovs-modal-body"/.test(fModal), 'B4 body uses ovs-modal-body');
ok(/class="ovs-form-row"/.test(fModal) && /class="ovs-form-group"/.test(fModal), 'B5 file field uses ovs-form-row / ovs-form-group');
ok(/class="ovs-modal-actions"/.test(fModal), 'B6 footer uses ovs-modal-actions');
ok(!/fia-modal-overlay|fia-modal-content|fia-modal-body|fia-modal-actions/.test(fModal), 'B7 old fia-modal shell removed from the import modal');
// same classes actually used by the Overseas import modal
var oModal = O_HTML.slice(O_HTML.indexOf('overseas-import-modal'), O_HTML.indexOf('ovs-modal-actions', O_HTML.indexOf('overseas-import-modal')) + 400);
ok(/ovs-modal-content ovs-modal-content--large/.test(oModal) && /ovs-modal-body/.test(oModal) && /ovs-modal-actions/.test(oModal), 'B8 (reference) Overseas import modal uses the same ovs-* shell');

section('C. header / body / footer parity');
ok(/<h3 id="factory-import-title">/.test(fModal), 'C1 header is an <h3> with an id (title association)');
ok(/<div class="ovs-modal-actions">[\s\S]*btn btn-secondary[\s\S]*Close[\s\S]*btn btn-primary[\s\S]*Import/.test(fModal), 'C2 footer: secondary Close then primary Import (same hierarchy/order as Overseas)');
ok(/<input type="file" id="factory-import-file"/.test(fModal), 'C3 file input present inside the form group');
ok(/id="factory-import-template-link"[^>]*Download Template \(\.xlsx\)/.test(fModal.replace(/\n/g, ' ')) || /Download Template \(\.xlsx\)/.test(fModal), 'C4 template download link present (Download Template (.xlsx))');

section('D. CSS shell mirrors the Overseas values (source of truth), Overseas untouched');
ok(/#factory-stock-section \.ovs-modal-content\s*\{[^}]*border-radius:\s*10px/.test(F_CSS), 'D1 factory ovs-modal-content border-radius mirrors Overseas (10px)');
ok(/#factory-stock-section \.ovs-modal-content\s*\{[^}]*box-shadow:\s*0 12px 40px rgba\(15, 23, 42, 0\.25\)/.test(F_CSS), 'D2 factory ovs-modal-content shadow mirrors Overseas');
ok(/#factory-stock-section \.ovs-modal-overlay\s*\{[^}]*rgba\(15, 23, 42, 0\.45\)/.test(F_CSS), 'D3 factory overlay backdrop opacity mirrors Overseas (0.45)');
ok(/#factory-stock-section \.ovs-modal-actions\s*\{[^}]*justify-content:\s*flex-end/.test(F_CSS), 'D4 factory footer alignment mirrors Overseas (flex-end)');
ok(/#factory-stock-section #factory-import-modal\s*\{[^}]*width:\s*min\(680px/.test(F_CSS), 'D5 factory import modal width mirrors Overseas large width (680)');
ok(/#overseas-stock-section \.ovs-modal-content\s*\{[^}]*border-radius:\s*10px/.test(O_CSS), 'D6 (reference) Overseas modal CSS is intact/untouched');

section('E. Factory-specific content + safety wording retained');
ok(/Set Current Stock/.test(fModal) && /it does not add/.test(fModal), 'E1 SET (not ADD) semantics stated');
ok(/warehouse_id \+ sku/.test(fModal), 'E2 identity = warehouse_id + sku stated');
ok(/Supplier is not required/.test(fModal), 'E3 supplier-not-required stated');
ok(/Reserved \/ in-production \/ pending shipout .* are not changed/.test(fModal.replace(/\n/g, ' ')), 'E4 reserved/in-production/pending-shipout untouched stated');
ok(/id="factory-import-preview-wrap"/.test(fModal) && /id="factory-import-preview-body"/.test(fModal), 'E5 Factory preview table retained (behavior kept)');

section('F. accessibility retained');
ok(/role="dialog"/.test(fModal) && /aria-modal="true"/.test(fModal) && /aria-labelledby="factory-import-title"/.test(fModal), 'F1 dialog role + aria-modal + title association present');
ok(/<label for="factory-import-file"/.test(fModal), 'F2 file input has an associated <label for>');

section('G. behavior wiring unchanged (presentation-only round)');
ok(/onchange="_fiiOnFileChosen\(\)"/.test(fModal), 'G1 file onchange still wired to _fiiOnFileChosen');
ok(/onclick="confirmFactoryImport\(\)"/.test(fModal) && /onclick="downloadFactoryImportTemplate\(\); return false;"/.test(fModal.replace(/\n/g, ' ')), 'G2 confirm + template handlers unchanged');
ok(/factoryInventoryImportValidate/.test(F_JS) && /factoryInventoryImportCommit/.test(F_JS), 'G3 page still calls the validate + commit adapters (payload path unchanged)');
ok(/__FIIPAGE_START__/.test(F_JS) && /_fiiSubmitting/.test(F_JS), 'G4 import page module + double-click guard intact');
ok(/factoryImportEvaluateBatch_/.test(GS) && /handleFactoryInventoryImportValidate_/.test(GS) && /handleFactoryInventoryImportCommit_/.test(GS), 'G5 Apps Script handler + evaluator unchanged (no behavior/validation/stock-write change)');
ok(/action === 'factoryInventory\.import\.validate'/.test(ROUTER) && /action === 'factoryInventory\.import\.commit'/.test(ROUTER), 'G6 router actions unchanged');

console.log('\n----------------------------------------');
console.log('FACTORY IMPORT VISUAL PARITY (F1-S2-UI): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
