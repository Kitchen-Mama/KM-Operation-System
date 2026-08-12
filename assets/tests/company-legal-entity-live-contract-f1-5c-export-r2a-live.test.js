// F1-5C-EXPORT-R2A-LIVE — company_legal_entities live-DB closure contract guard.
// Locks the migration/seed/verification DOC to the ACTUAL R2A code contract (COMPANY_LEGAL_ENTITIES_HEADERS_ in
// 33_). If the code headers ever drift from the doc the USER would migrate/seed, this fails — the durable form of
// the STEP 1 COMPANY_LEGAL_ENTITY_SCHEMA_CONTRACT_CONFLICT check. Source-scan only (no live DB / Apps Script).
// Run: node assets/tests/company-legal-entity-live-contract-f1-5c-export-r2a-live.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var GS = read('specs/active/apps-script/33_party_authority_handlers.gs');
var DOC = read('../docs/planning/F1_5C_EXPORT_R2A_LIVE_COMPANY_LEGAL_ENTITY_DB_CLOSURE.md');

// ---- parse the code's canonical headers ----
function codeHeaders() {
  var i = GS.indexOf('var COMPANY_LEGAL_ENTITIES_HEADERS_ = [');
  var j = GS.indexOf('];', i);
  var block = GS.slice(i, j).replace(/\/\/[^\n]*/g, ''); // strip line comments
  return (block.match(/'[a-z0-9_]+'/g) || []).map(function (s) { return s.replace(/'/g, ''); });
}
// ---- parse the doc's "Canonical headers (22, in order):" fenced block ----
function docHeaders() {
  var m = DOC.indexOf('Canonical headers (22, in order):');
  var fenceStart = DOC.indexOf('```', m);
  var fenceEnd = DOC.indexOf('```', fenceStart + 3);
  var body = DOC.slice(fenceStart + 3, fenceEnd).trim();
  return body.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

var CH = codeHeaders(), DH = docHeaders();

console.log('\n== STEP 1 — doc headers EXACTLY match the implemented R2A code contract ==');
ok(CH.length === 22, 'code defines 22 canonical headers, got ' + CH.length);
ok(DH.length === 22, 'doc lists 22 canonical headers, got ' + DH.length);
eq(DH, CH, 'STEP 1 doc canonical headers === COMPANY_LEGAL_ENTITIES_HEADERS_ (no CONTRACT_CONFLICT)');
eq(CH[0], 'company_legal_entity_id', 'PK is company_legal_entity_id');
eq(CH[1], 'company', 'business key column is company');

console.log('\n== STEP 3 — migration snippet is safe/additive/authorized ==');
ok(/function r2aCreateCompanyLegalEntitiesTable\(backupReference\)/.test(DOC), 'migration fn named r2aCreateCompanyLegalEntitiesTable(backupReference)');
ok(/COMPANY_LEGAL_ENTITIES_ALREADY_EXISTS/.test(DOC) && /getSheetByName\(name\)/.test(DOC), 'migration FAILS if the table already exists');
ok(/prodMigrateCreateSheet_\(ss, name, headers, auth\)/.test(DOC), 'migration reuses prodMigrateCreateSheet_ (authorized owner)');
ok(/KMSAFE\.headerHash\(headers\)/.test(DOC) && /KMSAFE\.headerHash\(\[\]\)/.test(DOC), 'migration builds KMSAFE auth DTO (old=[]/new=headers hash)');
ok(/backupReference required/.test(DOC), 'migration requires a backupReference');
ok(!/prodMigrateAppendColumns_\s*\(/.test(DOC) && /no existing-sheet mutation/i.test(DOC), 'no existing-sheet mutation / column append (create-only)');

console.log('\n== STEP 4 — seed template: system values fixed, factual values blank ==');
['CLE-KM', 'CLE-RESTW', 'CLE-RESUS'].forEach(function (id) { ok(DOC.indexOf(id) > -1, 'seed provides stable id ' + id); });
ok(/\|\s*KM\s*\|/.test(DOC) && /\|\s*ResTW\s*\|/.test(DOC) && /\|\s*ResUS\s*\|/.test(DOC), 'seed rows for KM / ResTW / ResUS');
ok((DOC.match(/TRUE \| _\(blank = open\)_ \| _\(blank = open\)_/g) || []).length === 3, 'all 3 seed rows: is_active TRUE + open effective window');
ok(/_\(fill\)_/.test(DOC), 'factual legal fields left blank for the USER (not fabricated)');

console.log('\n== STEP 5 — verification is read-only and returns the LIVE-READY token ==');
ok(/function r2aVerifyCompanyLegalEntities\(\)/.test(DOC), 'verification fn r2aVerifyCompanyLegalEntities()');
ok(/COMPANY_LEGAL_ENTITY_AUTHORITY_LIVE_READY/.test(DOC), 'verification returns COMPANY_LEGAL_ENTITY_AUTHORITY_LIVE_READY');
ok(/partyReadCompanyLegalEntities_\(ss\)/.test(DOC) && /partyResolveCompanyLegalEntity_\(rows, c, null\)/.test(DOC), 'verification uses the R2A validate-only read + pure resolver');
var verifyBlock = DOC.slice(DOC.indexOf('function r2aVerifyCompanyLegalEntities'), DOC.indexOf('```', DOC.indexOf('function r2aVerifyCompanyLegalEntities')));
ok(!/setValue|setValues|appendRow|insertSheet|deleteRow|prodMigrate/.test(verifyBlock), 'verification performs NO writes (read-only)');
ok(/company-ONLY lookup/.test(DOC) && /partyResolveCompanyLegalEntity_\(rows, c, null\)/.test(DOC), 'G/H/I lookup is company-only (no factory/warehouse/marketplace)');

console.log('\n== STEP 2 — grain principle stated (factory ⇎ company) ==');
ok(/factory→company/.test(DOC) && /may share the same factory/.test(DOC), 'doc freezes factory ⇎ company independence');

console.log('\n----------------------------------------');
console.log('COMPANY LEGAL ENTITY LIVE CONTRACT (F1-5C-EXPORT-R2A-LIVE): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
