# F1-5C-EXPORT-R2A-LIVE — company_legal_entities Live DB Closure

**DB closure / live-readiness ONLY.** No runtime architecture change, no R2B. Audits the ALREADY-IMPLEMENTED R2A
contract in [`33_party_authority_handlers.gs`](../../assets/specs/active/apps-script/33_party_authority_handlers.gs)
and gives the USER the exact schema + safe additive migration + seed + verification. Baseline: R2A `8caf16a`.

**Contract-conflict check (STEP 1): PASS — no `COMPANY_LEGAL_ENTITY_SCHEMA_CONTRACT_CONFLICT`.** The 22-column
`COMPANY_LEGAL_ENTITIES_HEADERS_` in `33_` and the R2A doc enumerate the identical fields; the runtime resolver reads
exactly these columns.

## STEP 1 — Implemented contract (from the R2A code, not generic ERP knowledge)
1. **Exact table name** = `company_legal_entities`.
2. **Exact headers, canonical order (22):**

Canonical headers (22, in order):
```
company_legal_entity_id, company, legal_name, display_name, country, address_line_1, address_line_2, city, state_or_region, postal_code, tax_or_business_id, contact_name, contact_phone, contact_email, is_active, effective_from, effective_to, note, created_by, created_at, updated_by, updated_at
```

3. **Primary / business identity** = `company_legal_entity_id` is the PK; the **business/resolver key is `company`** (KM / ResTW / ResUS), which must map to exactly one active legal entity.
4. **Required fields (for a row to RESOLVE):** `company` + `is_active` truthy. (Resolution returns `ok:true` with just these, as one non-ambiguous row.)
5. **Optional fields (but needed for VALID output):** `legal_name`, `display_name` (falls back to `legal_name`), `country`, `address_line_1/2`, `city`, `state_or_region`, `postal_code`, `tax_or_business_id`, `contact_name/phone/email`, `note`, audit columns.
6. **Status vocabulary** = **`is_active` boolean only** — truthy set accepted by the resolver: `true`, `"TRUE"`, `"yes"`, `"y"`, `"1"`, `"active"` (case-insensitive). There is NO separate status enum on this table (unlike `logistics_locations.verification_status`).
7. **Effective-date semantics** = `effective_from ≤ asOf ≤ effective_to`, **blank bound = open**. When the caller passes no date (`asOfMs = null`), the filter is `is_active` only. Blank/blank = always in window.
8. **Uniqueness rule** = **exactly one** active-in-window row per `company`. `0` → `COMPANY_LEGAL_ENTITY_NOT_CONFIGURED`; `>1` → `COMPANY_LEGAL_ENTITY_AMBIGUOUS` (surfaced by the shipper resolver as `SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED` / `_AMBIGUOUS`).
9. **`shipment.company` matching rule** = `UPPER(TRIM(company))` exact equality against the `company` column. Nothing else participates.
10. **Resolved output fields** (shipper / exporter / seller-of-record) = `company_legal_entity_id, company, legal_name, display_name, country, address_line_1, address_line_2, city, state_or_region, postal_code, tax_or_business_id, contact_name, contact_phone, contact_email`.
11. **tax ID / registration / phone / email / country / postal_code** = ALL part of the contract today (`tax_or_business_id`, `contact_phone`, `contact_email`, `country`, `postal_code`) — optional columns, resolved-through.
12. **Consumers requiring fields beyond this schema** = NONE currently. R2B (the future final-output aggregator) consumes exactly this resolver output; the R1 field-lineage matrix's shipper needs (legal name, address, country, tax id) are all covered. Legal importer is intentionally NOT here (fail-closed `LEGAL_IMPORTER_AUTHORITY_GAP`).

## STEP 2 — Business grain (frozen)
`company_legal_entities` represents **LEGAL COMPANY IDENTITY** only. It does NOT represent factory / warehouse /
marketplace / destination / carrier / SKU / inventory ownership. **FORBIDDEN:** factory→company, warehouse→company,
marketplace→legal-entity inference. Canonical selection is `shipment.company → company_legal_entities`, period.
**KM / ResTW / ResUS may share the same factory** — that never affects legal-entity selection.

## STEP 3 — Production migration (USER runs ONCE, then deletes the function)
Additive new sheet only. Reuses the authorized migration owner (`prodMigrateCreateSheet_` + KMSAFE authorization).
Fails if the table already exists. No existing-sheet mutation, no backfill, no router wiring, no permanent engine.

```javascript
// TEMPORARY — paste into the Apps Script project (which already has 33_ + 29_ + the generated bundle synced),
// run once, confirm the return string, then DELETE this function. Not committed as runtime code.
function r2aCreateCompanyLegalEntitiesTable(backupReference) {
  var name = 'company_legal_entities';
  if (!backupReference) throw new Error('backupReference required — pass a backup link/id string.');
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());              // the ONE bound production DB
  if (ss.getSheetByName(name)) throw new Error('COMPANY_LEGAL_ENTITIES_ALREADY_EXISTS — refusing to recreate.');
  var headers = COMPANY_LEGAL_ENTITIES_HEADERS_;                      // canonical 22 cols, from 33_
  var auth = {
    migrationId: 'F1-5C-EXPORT-R2A-company_legal_entities-create',
    expectedSpreadsheetId: prodExpectedDbId_(),
    expectedSheetName: name,
    expectedOldHeaderHash: KMSAFE.headerHash([]),                     // creating from nothing
    expectedNewHeaderHash: KMSAFE.headerHash(headers),
    backupReference: String(backupReference),
    execute: true,
    actor: Session.getActiveUser().getEmail()
  };
  var sh = prodMigrateCreateSheet_(ss, name, headers, auth);
  return 'created ' + name + ' with ' + sh.getLastColumn() + ' columns (expected 22).';
}
```

## STEP 4 — Initial seed (copy into the sheet AFTER creation)
Row 1 is the canonical header (created by the migration). Add exactly three data rows. **System values are filled;
factual legal values are LEFT BLANK for the USER — do not fabricate names/addresses/tax IDs.**

| company_legal_entity_id | company | legal_name | display_name | country | address_line_1 | address_line_2 | city | state_or_region | postal_code | tax_or_business_id | contact_name | contact_phone | contact_email | is_active | effective_from | effective_to | note | created_by | created_at | updated_by | updated_at |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CLE-KM    | KM    | _(fill)_ | | _(fill)_ | _(fill)_ | | _(fill)_ | _(fill)_ | _(fill)_ | _(fill if a doc needs it)_ | | | | TRUE | _(blank = open)_ | _(blank = open)_ | | | | | |
| CLE-RESTW | ResTW | _(fill)_ | | _(fill)_ | _(fill)_ | | _(fill)_ | _(fill)_ | _(fill)_ | _(fill if a doc needs it)_ | | | | TRUE | _(blank = open)_ | _(blank = open)_ | | | | | |
| CLE-RESUS | ResUS | _(fill)_ | | _(fill)_ | _(fill)_ | | _(fill)_ | _(fill)_ | _(fill)_ | _(fill if a doc needs it)_ | | | | TRUE | _(blank = open)_ | _(blank = open)_ | | | | | |

**Deterministic system values provided:** `company_legal_entity_id` (stable IDs), `company` (KM/ResTW/ResUS), `is_active = TRUE`, `effective_from`/`effective_to` left blank (open window = always eligible — the safe default).

**USER-owned values still required before R2B produces valid documents:** `legal_name`, `country`, `address_line_1`, `city`, `state_or_region`, `postal_code`, and `tax_or_business_id` where a specific customs/commercial document requires it. (Resolution itself succeeds with only `company` + `is_active` = TRUE, but the shipper block will have an empty name/address until these are filled. `display_name` may be left blank — it falls back to `legal_name`.)

## STEP 5 — Live verification (temporary READ-ONLY function; run, then delete)
```javascript
// TEMPORARY read-only check — no writes. Run after creating + seeding. Returns the LIVE-READY token or the gap.
function r2aVerifyCompanyLegalEntities() {
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var rows = partyReadCompanyLegalEntities_(ss);   // validate-only: throws if table missing / headers invalid
  var out = { headers_ok: true };
  ['KM', 'ResTW', 'ResUS'].forEach(function (c) {
    var r = partyResolveCompanyLegalEntity_(rows, c, null);   // company-ONLY lookup (no factory/warehouse/marketplace)
    out[c] = r.ok ? ('OK: ' + (r.entity.legal_name || '(legal_name blank)')) : r.error;  // NOT_CONFIGURED / AMBIGUOUS
  });
  var ready = ['KM', 'ResTW', 'ResUS'].every(function (c) { return String(out[c]).indexOf('OK') === 0; });
  out.result = ready ? 'COMPANY_LEGAL_ENTITY_AUTHORITY_LIVE_READY' : 'NOT_READY';
  return out;
}
```
Checks: **A** table exists + **B** headers match (both via `prodRequireSheet_` inside `partyReadCompanyLegalEntities_`); **C/D/E** exactly one active entity resolves for KM / ResTW / ResUS; **F** no ambiguous duplicate (→ `COMPANY_LEGAL_ENTITY_AMBIGUOUS`); **G/H/I** factory / warehouse / marketplace are structurally not in the lookup (the resolver is passed only `(rows, company, null)`). Expected final `result` = **`COMPANY_LEGAL_ENTITY_AUTHORITY_LIVE_READY`**.

## Completion report
1. PRE/POST HEAD = `8caf16a` / this commit.
2. Table = `company_legal_entities`. 3. Headers = the canonical 22 above. 4. PK = `company_legal_entity_id`; business grain = one active legal entity per `company`.
5. Required = `company`, `is_active`. 6. Optional = all others (`legal_name`/address/tax/contact/audit). 7. Status = `is_active` boolean only. 8. Effective-date = `from ≤ asOf ≤ to`, blanks open; null asOf = active-only.
9. Matching = `UPPER(TRIM(shipment.company))` == `company`. 10. Resolved output = the 14 identity/address/contact fields listed in STEP 1.10. 11. Factory/company independence = resolver takes only `(rows, company, asOf)`; no factory/warehouse/marketplace input (source-guarded in R2A tests; re-guarded here).
12. Migration owner = `prodMigrateCreateSheet_` + `KMSAFE.validateMigrationAuthorization` (29_). 13. USER steps = sync `33_` → run `r2aCreateCompanyLegalEntitiesTable('<backup>')` → seed 3 rows → run `r2aVerifyCompanyLegalEntities()` → delete both temp functions.
14. Seed template = STEP 4. 15. USER-owned values still required = `legal_name`, `country`, `address_line_1`, `city`, `state_or_region`, `postal_code` (+ `tax_or_business_id` where a document needs it).
16. Live verification = STEP 5 (`COMPANY_LEGAL_ENTITY_AUTHORITY_LIVE_READY`). 17. Files changed = this doc + `assets/tests/company-legal-entity-live-contract-f1-5c-export-r2a-live.test.js` (locks the doc's headers + snippets to the code contract). No runtime `.gs`/`.js` changed.
18. Tests = 1 new contract-agreement guard. 19. Apps Script sync = the `33_` from R2A must be synced before the USER runs the migration (no NEW sync from this round). 20. Frontend deploy = NO. 21. Bundle rebuild = NO. 22. DB/schema impact = one new sheet `company_legal_entities` (USER migration); no existing sheet touched. 23. Commit = chat. 24. **R2B authorized?** = only AFTER the USER runs the migration + seed and `r2aVerifyCompanyLegalEntities()` returns `COMPANY_LEGAL_ENTITY_AUTHORITY_LIVE_READY`.

## FINAL GATE
ONE legal-entity authority ✓ · `shipment.company` is the lookup key ✓ · factory ⇎ company ✓ · no fabricated legal data (factual cells left blank) ✓ · exact R2A contract (22 headers, no drift) ✓ · safe additive migration (create-only, fail-if-exists, KMSAFE-authorized) ✓ · KM / ResTW / ResUS configurable ✓ · no output engine yet ✓ · no unrelated change ✓.

**STOP.** R2B (final-output aggregator + immutable snapshot) is NOT started; it is authorized only once live verification passes.
