# F1-5C-EXPORT-R2A — Legal Entity / Shipper / Consignee Authority Closure

**Outcome: IMPLEMENTED (authority-only).** Closes the R1 verdict-C gap: the final-output party facts now have canonical
persisted owners + pure resolvers. **No** document renderer, snapshot, or Export Center built. Baseline: R1 `16051dd`.

- **Shipper / exporter / seller-of-record** = `shipment.company` → **`company_legal_entities`** (NEW table, verdict C).
- **Consignee / ship-to (Phase 1)** = `shipments.destination_warehouse_id` → `warehouses.warehouse_id` → **`logistics_locations`** (existing canonical table).
- **Legal importer / importer-of-record** = **no Phase-1 owner** → fail closed `LEGAL_IMPORTER_AUTHORITY_GAP` (never fabricated).

Owner module: [`33_party_authority_handlers.gs`](../../assets/specs/active/apps-script/33_party_authority_handlers.gs). All resolvers are **pure** (no clock/sheet/router), so R2B's aggregator can call them deterministically. Sheet creation is **USER-owned migration** (§13) — the handler never invokes a migration twin.

## §17 Completion report
1. PRE HEAD = `16051dd`. 2. POST HEAD = this commit.
3. **Existing company master owner** = NONE. R1 + R2A audit confirmed no `companies`/`organization`/`legal_entity`/`sites` table; `company` is only a scope enum (KM/ResTW/ResUS) carried on operational tables; the planned "Company Management" page was to be backed by `marketplaces` (wrong grain).
4. **Existing company master schema** = N/A (does not exist).
5. **Representation verdict** = **C — COMPANY_LEGAL_ENTITY_TABLE_REQUIRED** (smallest additive table; no existing owner could safely represent a legal entity — `marketplaces` = channel grain, `warehouses` = location grain, `tax_referral_rates` = customs grain).
6. **Legal entity owner after R2A** = `company_legal_entities` (new; 22 cols). Runtime read = validate-only `partyReadCompanyLegalEntities_` (fail closed until USER-created + seeded).
7. **Company→legal-entity key** = `company` (UPPER-trim match), one active-in-window row. 0 → `..._NOT_CONFIGURED`, >1 → `..._AMBIGUOUS`.
8. **Shipper resolver** = `partyResolveShipmentShipper_(entityRows, shipment, asOfMs)` — uses `shipment.company` ONLY; fail closed `SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED` / `SHIPPER_LEGAL_ENTITY_AMBIGUOUS`.
9. **Seller-of-record rule** = `partyResolveSellerOfRecord_` = shipment company legal entity (Phase 1; identical authority to shipper — no separate table). No existing rule distinguishes it → **no `SELLER_OF_RECORD_AUTHORITY_CONFLICT`**.
10. **Factory independence proof** = shipper/seller resolvers take **no** factory/warehouse/destination/marketplace/sku/carrier input (structural) + source guards (test L/§9); `procurementResolveFactoryId_` (warehouse_id→factory_id, never company) is untouched and unreferenced by party resolvers.
11. **Destination warehouse authority** = `shipments.destination_warehouse_id` (legacy `warehouse_id` mirror as fallback); identity is **warehouse_id**, never `warehouse_code` (test G).
12. **Logistics location owner** = `logistics_locations` (PK `logistics_location_id`), the address authority (`address_line_1/2`, `city`, `subdivision_code`, `postal_code`, `country`, coords, timezone). Already a live read tab (`getOperationDb` validTabs).
13. **Destination→location resolver** = `partyResolveDestinationLocation_` — match `warehouse_id` + `is_active` + in-window + `verification_status ∉ {retired,rejected}`; deterministic single row (≤1 active per warehouse per Map spec §5.3). 0 → `DESTINATION_LOCATION_NOT_CONFIGURED`, >1 → `DESTINATION_LOCATION_AMBIGUOUS`.
14. **Consignee Phase-1 rule** = `partyResolveConsignee_` = destination logistics-location recipient; `legal_importer` always `null` (separate party). Never the free-text `shipments.destination` as legal identity.
15. **Platform destination behavior** = FBA / 3PL / WMS / platform all resolve through the SAME `warehouse_id → logistics_locations` chain (`warehouse_type` is a qualifier, not a separate resolver); resolver has no destination/warehouse/location-type branch (test J). If a platform warehouse has no location row → `DESTINATION_LOCATION_NOT_CONFIGURED` (which is the `PLATFORM_DESTINATION_ADDRESS_GAP` surface; never scraped/inferred).
16. **Legal importer behavior** = `partyResolveLegalImporter_` → always `LEGAL_IMPORTER_AUTHORITY_GAP` in Phase 1 (fail closed; no fabrication) — lets Shipping Detail / Packing List proceed while a document needing a separate legal importer fails closed.
17. **logistics_locations sufficiency** = SUFFICIENT for Phase-1 recipient physical address (has all needed address/coords/timezone fields). No new warehouse-address table created. Note: the runtime JS read-model doesn't surface `effective_from/to`, but the backend `.gs` resolver reads them directly from the sheet, so windowing works server-side.
18. **Company legal fields required** = company, legal_name, display_name, country, address_line_1/2, city, state_or_region, postal_code, tax_or_business_id, contact_name/phone/email, is_active, effective_from/to.
19. **Fields actually added** = the 22-col `company_legal_entities` header (fields above + PK + note + created/updated audit). No fields added to any existing table.
20. **New table required?** = YES — `company_legal_entities` (verdict C).
21. **Migration required?** = YES (create `company_legal_entities`). **USER-run** one-off; see below.
22. **Migration owner** = `prodMigrateCreateSheet_` + `KMSAFE.validateMigrationAuthorization` (29_ adapter). Per the frozen production-safety invariant (INIT.4), migration twins are **never invoked from a handler file** — so R2A ships NO committed migration function; the USER runs the snippet below once and removes it.
23. **Historical snapshot fields R2B must freeze** = shipper {legal_name, display_name, address_line_1/2, city, state_or_region, postal_code, country, tax_or_business_id} · seller_of_record (= shipper) · consignee {recipient_name, address_line_1/2, city, state_or_region, postal_code, country, logistics_location_id} · destination warehouse_id · factory identity/name (if document-required). Later master edits must not change finalized historical output.
24. **Admin UI impact** = NONE (per §14; a Company/Entity admin UI is a later bounded round). Authority closure does not depend on UI.
25. **Files changed** = `assets/specs/active/apps-script/33_party_authority_handlers.gs` (NEW), `assets/tests/party-authority-f1-5c-export-r2a.test.js` (NEW), `assets/tests/final-output-seam-audit-f1-5c-export-r1.test.js` (R1 sentinel updated — gap now CLOSED, guards exactly one owner), this doc.
26. **Tests** = 1 new (45 assertions, fixtures A–L) + R1 sentinel re-pointed.
27. **Focused results** = R2A 45/45; R1 audit 23/23; production-safety 85/85.
28. **Full regression** = **199 pass / 4 known baseline** (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`).
29. **Apps Script sync** = YES — `33_party_authority_handlers.gs` (new handler; no router change).
30. **Frontend deploy** = NO.
31. **Bundle rebuild** = NO (no `assets/js/core/*`).
32. **DB/schema impact** = ONE new table `company_legal_entities` (USER migration); no change to any existing table.
33. **API impact** = NONE (no router action; `partyResolveShipmentParties_` is an un-routed interface contract for R2B).
34. **Formula impact** = NONE.
35. **Inventory impact** = NONE.
36. **PO impact** = NONE.
37. **Shipment impact** = NONE (no shipment table/flow changed; resolvers only read).
38. **Commit hash** = see chat.
39. **USER live steps** = (a) Apps Script sync `33_party_authority_handlers.gs`; (b) run the one-off migration snippet below to create `company_legal_entities`; (c) seed one active row per company (KM / ResTW / ResUS) with the legal name + registered address; (d) verify `partyReadCompanyLegalEntities_` returns them. Until (b)+(c), the resolver fails closed `SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED` (by design).
40. **Remaining authority gaps** = legal importer / importer-of-record / tax consignee / customs declarant (deferred, fail-closed `LEGAL_IMPORTER_AUTHORITY_GAP`); multi-legal-entity-per-company (schema-ready via effective window, not needed in Phase 1); logistics_locations `effective_from/to` not surfaced in the JS read-model (backend resolver reads them directly — no gap for R2B server-side aggregation).
41. **R2B preconditions** = `company_legal_entities` created + seeded (KM/ResTW/ResUS); `logistics_locations` rows present for destination warehouses; Apps Script synced with `33_`.
42. **Exact next slice** = **F1-5C-EXPORT-R2B** — `shipment_id → ONE backend final-output aggregator` combining canonical operational facts (shipment_lines physical qty + executed shipment_line_allocations multi-PO lineage) + party authority (`partyResolveShipmentParties_`) + product/customs masters (sku_details GS1/dims/weights, tax_referral_rates HS/declared) → **materialize + freeze ONE immutable final-output snapshot at dispatch**; then renderers/Export Center consume the snapshot. No new FIFO/allocator/recompute.

## USER migration snippet (run once in the Apps Script editor, then delete — NOT committed)
```javascript
// One-off authorized migration — creates company_legal_entities. Requires 33_ + 29_ + the generated bundle synced.
function runCreateCompanyLegalEntities_ONE_OFF() {
  var headers = COMPANY_LEGAL_ENTITIES_HEADERS_;                 // defined in 33_party_authority_handlers.gs
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());          // the ONE bound production DB
  var auth = {
    migrationId: 'F1-5C-EXPORT-R2A-company_legal_entities-create',
    expectedSpreadsheetId: prodExpectedDbId_(),
    expectedSheetName: 'company_legal_entities',
    expectedOldHeaderHash: KMSAFE.headerHash([]),
    expectedNewHeaderHash: KMSAFE.headerHash(headers),
    backupReference: '<paste your backup link/id>',
    execute: true,
    actor: '<your name/email>'
  };
  var sh = prodMigrateCreateSheet_(ss, 'company_legal_entities', headers, auth);
  return 'created company_legal_entities with ' + sh.getLastColumn() + ' columns';
}
```
Then seed (example): `KM → Kitchen Mama LLC`, `ResTW → <Res Taiwan legal name>`, `ResUS → Res US Inc`, each with `is_active = TRUE`, registered `address_line_1/city/state_or_region/postal_code/country`, and `tax_or_business_id` where a document needs it.

## §18 FINAL GATE
shipment.company → one canonical legal entity ✓ · shipper authority exists ✓ · seller-of-record rule exists (= shipper, Phase 1) ✓ · factory does NOT determine shipper/company ✓ · shared-factory architecture preserved ✓ · destination_warehouse_id is the physical destination identity ✓ · warehouse_code is not identity ✓ · destination resolves to one canonical logistics location (0/>1 fail closed) ✓ · Phase-1 consignee/ship-to rule deterministic ✓ · platform destinations use the same resolver / explicit gap ✓ · legal-importer requirement fails closed when unsupported ✓ · no document engine created ✓ · no final-output snapshot created ✓ · no upstream business logic changed ✓ · no second company/location registry (verdict C was necessary; logistics_locations reused) ✓.

**STOP after R2A.** No aggregator, snapshot, renderer, or Export Center. F1-5C-EXPORT-R2B is defined but NOT started.
